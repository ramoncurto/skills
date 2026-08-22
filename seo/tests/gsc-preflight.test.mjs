import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { promisify } from "node:util";
import test from "node:test";
import { parseArgs } from "../scripts/lib/cli.mjs";

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const gsc = join(here, "..", "scripts", "gsc.mjs");
const scorecard = join(here, "..", "scripts", "seo-scorecard.mjs");

async function tempDir(t) {
  const dir = await mkdtemp(join(os.tmpdir(), "seo-gsc-preflight-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

function runNode(script, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...(options.nodeArgs || []), script, ...args], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

async function mockGsc(t, dir, mode = "ok") {
  const mock = join(dir, "mock-fetch.mjs");
  await writeFile(mock, `
import { appendFileSync, rmSync } from "node:fs";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  if (process.env.GSC_TEST_CALLS) appendFileSync(process.env.GSC_TEST_CALLS, target + "\\n");
  if (process.env.GSC_TEST_REQUESTS && target.includes("searchAnalytics/query") && options.body) appendFileSync(process.env.GSC_TEST_REQUESTS, String(options.body) + "\\n");
  if (process.env.GSC_TEST_MUTATE_URLS && !globalThis.__gscTestMutatedUrls) {
    rmSync(process.env.GSC_TEST_MUTATE_URLS, { force: true });
    globalThis.__gscTestMutatedUrls = true;
  }
  if (process.env.GSC_TEST_MODE === "network") throw new Error("fixture network failure");
  if (target.includes("oauth2.googleapis.com/token")) {
    if (process.env.GSC_TEST_MODE === "token-auth") return json({ error: "invalid_grant" }, 401);
    if (process.env.GSC_TEST_MODE === "token-quota") return json({ error: "quota" }, 429);
    return json({ access_token: "fixture-token", expires_in: 3600 });
  }
  if (process.env.GSC_TEST_MODE === "api-auth") return json({ error: "unauthorized" }, 401);
  if (process.env.GSC_TEST_MODE === "api-quota") return json({ error: "quota" }, 429);
  if (process.env.GSC_TEST_MODE === "api-network") throw new Error("fixture API network failure");
  if (target.includes("searchAnalytics/query")) {
    if (process.env.GSC_TEST_MOVERS_JSON) {
      const fixture = JSON.parse(process.env.GSC_TEST_MOVERS_JSON);
      const call = globalThis.__gscTestSearchCalls || 0;
      globalThis.__gscTestSearchCalls = call + 1;
      return json(call === 0 ? fixture.current : fixture.previous);
    }
    if (process.env.GSC_TEST_GREEN_DATES) {
      const dates = process.env.GSC_TEST_GREEN_DATES.split(",").filter(Boolean);
      const count = Number(process.env.GSC_TEST_GREEN_COUNT || dates.length);
      return json({ rows: Array.from({ length: count }, (_, index) => ({ keys: [dates[index % dates.length]], clicks: 1, impressions: 10, ctr: 0.1, position: 2 })) });
    }
    if (process.env.GSC_TEST_ROW_COUNT) {
      const count = Number(process.env.GSC_TEST_ROW_COUNT);
      return json({ rows: Array.from({ length: count }, (_, index) => ({ keys: ["query-" + index], clicks: 1, impressions: 2, ctr: 0.5, position: 2 })) });
    }
    return json(JSON.parse(process.env.GSC_TEST_PERFORMANCE || '{"rows":[]}'));
  }
  if (target.includes("/sitemaps")) return json(JSON.parse(process.env.GSC_TEST_SITEMAPS || '{"sitemap":[]}'));
  if (target.includes("urlInspection")) {
    const request = options.body ? JSON.parse(options.body) : {};
    if (process.env.GSC_TEST_INSPECTION_MIXED && request.inspectionUrl.endsWith("/error")) throw new Error("fixture inspection outage");
    if (process.env.GSC_TEST_INSPECTION_MIXED && request.inspectionUrl.endsWith("/fail")) return json({ inspectionResult: { indexStatusResult: { verdict: "FAIL", coverageState: "Not indexed", indexingState: "BLOCKED", robotsTxtState: "ALLOWED", pageFetchState: "SUCCESS" } } });
    return json({ inspectionResult: { indexStatusResult: { verdict: "PASS", coverageState: "Indexed", indexingState: "INDEXING_ALLOWED", robotsTxtState: "ALLOWED", pageFetchState: "SUCCESS" } } });
  }
  if (target.includes("/sites")) return json({ siteEntry: [] });
  throw new Error("unexpected fixture URL: " + target);
};
`);
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024 });
  const calls = join(dir, "calls.log");
  return {
    nodeArgs: ["--import", mock],
    env: {
      GSC_CLIENT_EMAIL: "fixture@example.invalid",
      GSC_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }),
      GSC_SITE_URL: "sc-domain:fixture.invalid",
      GSC_TEST_CALLS: calls,
      GSC_TEST_MODE: mode,
    },
    calls,
  };
}

async function callCount(path) {
  try { return (await readFile(path, "utf8")).split("\n").filter(Boolean).length; } catch { return 0; }
}

async function writeBuckets(path, value) {
  await writeFile(path, typeof value === "string" ? value : JSON.stringify(value));
}

test("the shared CLI parser freezes value/boolean options", () => {
  assert.deepEqual(parseArgs(["--days", "7", "--md"], { value: ["days"], boolean: ["md"] }), { days: "7", md: true });
});

test("the shared CLI parser rejects unknown, positional, duplicate, and missing input", () => {
  assert.throws(() => parseArgs(["--unknown", "x"], { value: ["days"], boolean: [] }), /unknown/i);
  assert.throws(() => parseArgs(["stray"], { value: ["days"], boolean: [] }), /positional/i);
  assert.throws(() => parseArgs(["--days", "1", "--days", "2"], { value: ["days"], boolean: [] }), /duplicate|ambiguous/i);
  assert.throws(() => parseArgs(["--days"], { value: ["days"], boolean: [] }), /missing/i);
});

test("scorecard and GSC reject unknown, positional, duplicate, missing, bare, and whitespace site input before work", async (t) => {
  const dir = await tempDir(t);
  const marker = join(dir, "scorecard-ran");
  const config = join(dir, "scorecard.json");
  await writeFile(config, JSON.stringify({ out: join(dir, "out"), staticChecks: [{ name: "marker", cmd: `touch "${marker}"` }] }));
  for (const [label, args] of [
    ["unknown scorecard option", ["--config", config, "--static-only", "--unknown", "x"]],
    ["scorecard positional", ["--config", config, "--static-only", "stray"]],
    ["duplicate scorecard option", ["--config", config, "--static-only", "--static-only"]],
    ["missing scorecard value", ["--config"]],
  ]) {
    const result = await runNode(scorecard, args, { cwd: dir });
    assert.equal(result.status, 1, `${label} must be invalid input: ${result.stderr}`);
    assert.equal(existsSync(marker), false, `${label} must fail before configured commands`);
  }
  const gscCases = [
    ["unknown GSC option", ["performance", "--unknown", "x"]],
    ["GSC positional", ["performance", "stray"]],
    ["duplicate GSC value", ["performance", "--days", "1", "--days", "2"]],
    ["missing GSC value", ["performance", "--days"]],
    ["bare site", ["performance", "--site", "--days", "1"]],
    ["whitespace site", ["performance", "--site", "   ", "--days", "1"]],
    ["duplicate site", ["performance", "--site", "a", "--site", "b", "--days", "1"]],
  ];
  for (const [label, args] of gscCases) {
    const mocked = await mockGsc(t, dir);
    const result = await runNode(gsc, args, { cwd: dir, ...mocked });
    assert.equal(result.status, 1, `${label} must be invalid input: ${result.stderr}`);
    assert.equal(await callCount(mocked.calls), 0, `${label} must fail before credentials/network`);
  }
});

test("inspect rejects recognized but command-irrelevant --days before credentials or network", async (t) => {
  const dir = await tempDir(t);
  const urls = join(dir, "empty.txt");
  await writeFile(urls, "");
  const inspect = await mockGsc(t, dir);
  const inspectResult = await runNode(gsc, ["inspect", "--urls", urls, "--days", "0"], { cwd: dir, ...inspect });
  assert.equal(inspectResult.status, 1, `inspect --days 0 must be rejected locally: ${inspectResult.stderr}`);
  assert.equal(await callCount(inspect.calls), 0, "irrelevant inspect options must not reach credentials/network");
});

test("help rejects recognized but command-irrelevant --site before showing help", async (t) => {
  const dir = await tempDir(t);
  const help = await runNode(gsc, ["help", "--site", "ignored.example"], { cwd: dir });
  assert.equal(help.status, 1, `help --site must be rejected locally: ${help.stderr}`);
});

test("every GSC command rejects a recognized but command-irrelevant option before credentials or network", async (t) => {
  const dir = await tempDir(t);
  const urls = join(dir, "empty.txt");
  const buckets = join(dir, "buckets.json");
  await writeFile(urls, "");
  await writeBuckets(buckets, [{ name: "guide", pattern: "guide" }]);
  const matrix = [
    ["sites", ["sites", "--days", "1"]],
    ["performance", ["performance", "--urls", urls]],
    ["top-pages", ["top-pages", "--dimensions", "page"]],
    ["funnel", ["funnel", "--concurrency", "1"]],
    ["sitemaps", ["sitemaps", "--urls", urls]],
    ["green", ["green", "--concurrency", "1"]],
    ["opportunities", ["opportunities", "--urls", urls]],
    ["ctr-gaps", ["ctr-gaps", "--dimensions", "query"]],
    ["cannibalization", ["cannibalization", "--buckets", buckets]],
    ["movers", ["movers", "--urls", urls]],
  ];
  for (const [command, args] of matrix) {
    const mocked = await mockGsc(t, dir);
    const result = await runNode(gsc, args, { cwd: dir, ...mocked });
    assert.equal(result.status, 1, `${command} must reject its irrelevant option: ${result.stderr}`);
    assert.equal(await callCount(mocked.calls), 0, `${command} irrelevant option must fail before network`);
  }
});

test("green preflights site, days, max, and URL content before any API call", async (t) => {
  const dir = await tempDir(t);
  const urls = join(dir, "urls.txt");
  await writeFile(urls, "https://fixture.invalid/guide\n");
  const invalidUrls = join(dir, "invalid-urls.txt");
  await writeFile(invalidUrls, "not-a-url\n");
  const cases = [
    { args: ["green"], env: { GSC_SITE_URL: "" }, label: "missing site" },
    { args: ["green", "--days", "0"], label: "days below one" },
    { args: ["green", "--days", "3651"], label: "days above 3650" },
    { args: ["green", "--urls", urls, "--max", "0"], label: "max below one" },
    { args: ["green", "--urls", urls, "--max", "2001"], label: "max above 2000" },
    { args: ["green", "--urls", invalidUrls], label: "invalid URL content" },
  ];
  for (const item of cases) {
    const mocked = await mockGsc(t, dir);
    const result = await runNode(gsc, item.args, { cwd: dir, ...mocked, env: { ...mocked.env, ...item.env } });
    assert.equal(result.status, 1, `${item.label} must fail preflight: ${result.stderr}`);
    assert.equal(await callCount(mocked.calls), 0, `${item.label} must not call token or GSC APIs`);
  }
});

test("green parses and caches the URL list before its first network request", async (t) => {
  const dir = await tempDir(t);
  const urls = join(dir, "urls-once.txt");
  await writeFile(urls, "https://fixture.invalid/guide\\n");
  const mocked = await mockGsc(t, dir);
  const result = await runNode(gsc, ["green", "--urls", urls], {
    cwd: dir,
    ...mocked,
    env: { ...mocked.env, GSC_TEST_MUTATE_URLS: urls },
  });
  assert.notEqual(result.status, 1, `cached URL input must survive later file changes: ${result.stderr}`);
  assert.ok(await callCount(mocked.calls) > 0, "the valid cached input must permit network evidence");
});

test("funnel buckets are validated before Search Analytics and cached as an array of valid records", async (t) => {
  const dir = await tempDir(t);
  const cases = [
    ["missing", null],
    ["malformed", "{"],
    ["not-array", { name: "guide", pattern: "guide" }],
    ["missing-pattern", [{ name: "guide" }]],
    ["invalid-regex", [{ name: "guide", pattern: "[" }]],
  ];
  for (const [label, value] of cases) {
    const mocked = await mockGsc(t, dir);
    const buckets = join(dir, `${label}.json`);
    if (label !== "missing") await writeBuckets(buckets, value);
    const result = await runNode(gsc, ["funnel", "--buckets", label === "missing" ? join(dir, "does-not-exist.json") : buckets], { cwd: dir, ...mocked });
    assert.equal(result.status, 1, `${label} buckets must fail preflight: ${result.stderr}`);
    assert.equal(await callCount(mocked.calls), 0, `${label} buckets must not call Search Analytics`);
  }
});

test("credential failures exit 1 before fetch while token/API auth, quota, and network failures are UNKNOWN exit 3", async (t) => {
  const dir = await tempDir(t);
  const missing = join(dir, "missing.json");
  const malformed = join(dir, "malformed.json");
  const incomplete = join(dir, "incomplete.json");
  await writeFile(malformed, "{");
  await writeFile(incomplete, JSON.stringify({ client_email: "fixture@example.invalid" }));
  const credentialCases = [
    ["missing JSON", missing],
    ["malformed JSON", malformed],
    ["missing fields", incomplete],
  ];
  for (const [label, credentials] of credentialCases) {
    const mocked = await mockGsc(t, dir);
    const result = await runNode(gsc, ["sites"], { cwd: dir, ...mocked, env: { ...mocked.env, GOOGLE_APPLICATION_CREDENTIALS: credentials, GSC_CLIENT_EMAIL: "", GSC_PRIVATE_KEY: "" } });
    assert.equal(result.status, 1, `${label} must exit 1: ${result.stderr}`);
    assert.equal(await callCount(mocked.calls), 0, `${label} must fail before fetch`);
  }
  const invalidKey = await mockGsc(t, dir);
  const invalidKeyResult = await runNode(gsc, ["sites"], { cwd: dir, ...invalidKey, env: { ...invalidKey.env, GSC_PRIVATE_KEY: "not-a-private-key" } });
  assert.equal(invalidKeyResult.status, 1, `invalid private key must exit 1: ${invalidKeyResult.stderr}`);
  assert.equal(await callCount(invalidKey.calls), 0);

  for (const mode of ["token-auth", "api-auth", "token-quota", "api-quota", "network", "api-network"]) {
    const mocked = await mockGsc(t, dir, mode);
    const result = await runNode(gsc, ["sites"], { cwd: dir, ...mocked });
    assert.equal(result.status, 3, `${mode} must be UNKNOWN exit 3: ${result.stderr}`);
  }
});

test("inspect and green numeric args are bounded even with an empty URL file", async (t) => {
  const dir = await tempDir(t);
  const urls = join(dir, "empty.txt");
  await writeFile(urls, "");
  const cases = [
    ["inspect", ["inspect", "--urls", urls, "--max", "0"]],
    ["inspect max", ["inspect", "--urls", urls, "--max", "2001"]],
    ["inspect concurrency", ["inspect", "--urls", urls, "--concurrency", "0"]],
    ["inspect concurrency high", ["inspect", "--urls", urls, "--concurrency", "21"]],
  ];
  for (const [label, args] of cases) {
    const mocked = await mockGsc(t, dir);
    const result = await runNode(gsc, args, { cwd: dir, ...mocked });
    assert.equal(result.status, 1, `${label} must fail argument validation: ${result.stderr}`);
    assert.equal(await callCount(mocked.calls), 0, `${label} must not call GSC`);
  }
});

test("inspect FAIL plus request ERROR is a policy failure, not UNKNOWN", async (t) => {
  const dir = await tempDir(t);
  const urls = join(dir, "mixed-inspection.txt");
  await writeFile(urls, "https://fixture.invalid/fail\nhttps://fixture.invalid/error\n");
  const mocked = await mockGsc(t, dir);
  const result = await runNode(gsc, ["inspect", "--urls", urls], { cwd: dir, ...mocked, env: { ...mocked.env, GSC_TEST_INSPECTION_MIXED: "1" } });
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  const rows = JSON.parse(result.stdout).rows;
  assert.equal(rows.find((row) => row.url.endsWith("/fail"))?.verdict, "FAIL");
  assert.equal(rows.find((row) => row.url.endsWith("/error"))?.verdict, "ERROR");
});

test("days, limit, top, minimum-impressions, and ratio arguments reject out-of-range values before API", async (t) => {
  const dir = await tempDir(t);
  const cases = [
    ["days", ["performance", "--days", "0"]],
    ["days high", ["performance", "--days", "3651"]],
    ["limit", ["performance", "--limit", "100001"]],
    ["top", ["opportunities", "--top", "0"]],
    ["top high", ["opportunities", "--top", "100001"]],
    ["min-impressions", ["opportunities", "--min-impressions", "-1"]],
    ["max-ratio", ["ctr-gaps", "--max-ratio", "1.01"]],
  ];
  for (const [label, args] of cases) {
    const mocked = await mockGsc(t, dir);
    const result = await runNode(gsc, args, { cwd: dir, ...mocked });
    assert.equal(result.status, 1, `${label} must fail argument validation: ${result.stderr}`);
    assert.equal(await callCount(mocked.calls), 0, `${label} must not call API`);
  }
});

test("integer command arguments reject signs, decimals, exponents, NaN, and infinity", async (t) => {
  const dir = await tempDir(t);
  for (const text of ["+1", "1.5", "1e2", "NaN", "Infinity"]) {
    const mocked = await mockGsc(t, dir);
    const result = await runNode(gsc, ["performance", "--days", text], { cwd: dir, ...mocked });
    assert.equal(result.status, 1, `${text} must be rejected as non-canonical integer text: ${result.stderr}`);
    assert.equal(await callCount(mocked.calls), 0, `${text} must be rejected before API`);
  }
});

test("Search Analytics accepts the frozen numeric boundaries", async (t) => {
  const dir = await tempDir(t);
  const cases = [
    ["limit above the per-request page but within command bound", ["performance", "--limit", "25001"]],
    ["top maximum", ["opportunities", "--top", "100000"]],
    ["minimum impressions zero", ["opportunities", "--min-impressions", "0"]],
    ["minimum impressions safe maximum", ["opportunities", "--min-impressions", String(Number.MAX_SAFE_INTEGER)]],
  ];
  for (const [label, args] of cases) {
    const mocked = await mockGsc(t, dir);
    const result = await runNode(gsc, args, { cwd: dir, ...mocked });
    assert.notEqual(result.status, 1, `${label} must not be invalid input: ${result.stderr}`);
  }
});

test("documented Search Analytics dimensions, types, and movers dimensions reject unknown values before API", async (t) => {
  const dir = await tempDir(t);
  const cases = [
    ["dimension", ["performance", "--dimensions", "not-a-dimension"]],
    ["type", ["performance", "--type", "not-a-type"]],
    ["case-sensitive dimension", ["performance", "--dimensions", "Page"]],
    ["duplicate dimension", ["performance", "--dimensions", "page,page"]],
    ["filter dimension", ["performance", "--filter", "not-a-dimension~fixture"]],
    ["filter case", ["performance", "--filter", "Page~fixture"]],
    ["movers dimension", ["movers", "--dimensions", "not-a-mover-dimension"]],
    ["movers case", ["movers", "--dimensions", "Query"]],
  ];
  for (const [label, args] of cases) {
    const mocked = await mockGsc(t, dir);
    const result = await runNode(gsc, args, { cwd: dir, ...mocked });
    assert.equal(result.status, 1, `${label} must reject unknown enum: ${result.stderr}`);
    assert.equal(await callCount(mocked.calls), 0, `${label} must reject before API`);
  }
});

test("green keeps board completeness separate from Search Analytics completeness metadata in JSON and human output", async (t) => {
  const dir = await tempDir(t);
  const mocked = await mockGsc(t, dir);
  const env = {
    ...mocked.env,
    GSC_TEST_SITEMAPS: JSON.stringify({ sitemap: [{ path: "https://fixture.invalid/sitemap.xml", errors: 0, warnings: 0, isPending: false, lastDownloaded: "2099-01-01T00:00:00Z" }] }),
    GSC_TEST_PERFORMANCE: JSON.stringify({ rows: [{ keys: ["2026-08-20"], clicks: 2, impressions: 10, ctr: 0.2, position: 2 }] }),
  };
  const jsonResult = await runNode(gsc, ["green"], { cwd: dir, ...mocked, env });
  assert.ok([0, 2, 3].includes(jsonResult.status), jsonResult.stderr);
  const json = JSON.parse(jsonResult.stdout);
  const summary = json.summary;
  assert.deepEqual(Object.keys(summary).sort(), ["site", "window", "boardStatus", "boardCompleteness", "pass", "fail", "unknown", "notApplicable", "completeness", "clientTruncated"].sort(), "green summary keys must be exact and flat");
  assert.match(summary.completeness, /TOP_ROWS_ONLY/);
  assert.match(summary.completeness, /privacy|BigQuery/i);
  assert.equal(typeof summary.clientTruncated, "boolean");
  assert.notEqual(summary.boardCompleteness, summary.completeness, "board and Search Analytics completeness must remain separate");

  const mdResult = await runNode(gsc, ["green", "--md"], { cwd: dir, ...mocked, env });
  assert.match(mdResult.stdout, /Completeness:/i);
  assert.match(mdResult.stdout, /TOP_ROWS_ONLY/);
  assert.match(mdResult.stdout, /clientTruncated/i);
  assert.match(mdResult.stdout, /BigQuery/i);
  assert.match(mdResult.stdout, /boardStatus|boardCompleteness/i);

  const failResult = await runNode(gsc, ["green"], {
    cwd: dir,
    ...mocked,
    env: { ...mocked.env, GSC_TEST_SITEMAPS: JSON.stringify({ sitemap: [{ warnings: 1 }] }), GSC_TEST_PERFORMANCE: JSON.stringify({ rows: [] }) },
  });
  assert.equal(failResult.status, 2, "a board FAIL must outrank simultaneous UNKNOWN evidence");
  assert.equal(JSON.parse(failResult.stdout).summary.boardStatus, "FAIL");

  const unknownResult = await runNode(gsc, ["green"], {
    cwd: dir,
    ...mocked,
    env: { ...mocked.env, GSC_TEST_SITEMAPS: JSON.stringify({ sitemap: [] }), GSC_TEST_PERFORMANCE: JSON.stringify({ rows: [] }) },
  });
  assert.equal(unknownResult.status, 3, "without a failure, UNKNOWN evidence must exit 3");
  assert.equal(JSON.parse(unknownResult.stdout).summary.boardStatus, "UNKNOWN");
});

test("green continuity is PASS only for every expected date with an untruncated response, otherwise UNKNOWN with FAIL precedence", async (t) => {
  const dir = await tempDir(t);
  const mocked = await mockGsc(t, dir);
  const day = 86400e3;
  const end = new Date(Date.now() - 3 * day);
  const dates = Array.from({ length: 28 }, (_, index) => new Date(end.getTime() - (27 - index) * day).toISOString().slice(0, 10));
  const sitemap = { sitemap: [{ path: "https://fixture.invalid/sitemap.xml", errors: 0, warnings: 0, isPending: false, lastDownloaded: "2099-01-01T00:00:00Z" }] };
  const baseEnv = { ...mocked.env, GSC_TEST_SITEMAPS: JSON.stringify(sitemap) };

  const complete = await runNode(gsc, ["green"], { cwd: dir, ...mocked, env: { ...baseEnv, GSC_TEST_GREEN_DATES: dates.join(",") } });
  assert.equal(JSON.parse(complete.stdout).rows.find((row) => row.report === "Performance continuity")?.status, "PASS");

  const missing = await runNode(gsc, ["green"], { cwd: dir, ...mocked, env: { ...baseEnv, GSC_TEST_GREEN_DATES: dates.slice(1).join(",") } });
  assert.equal(missing.status, 3, "missing expected date must be incomplete evidence");
  assert.equal(JSON.parse(missing.stdout).rows.find((row) => row.report === "Performance continuity")?.status, "UNKNOWN");

  const truncated = await runNode(gsc, ["green"], { cwd: dir, ...mocked, env: { ...baseEnv, GSC_TEST_GREEN_DATES: dates.join(","), GSC_TEST_GREEN_COUNT: "1000" } });
  assert.equal(truncated.status, 3, "client-truncated continuity must be incomplete evidence");
  assert.equal(JSON.parse(truncated.stdout).rows.find((row) => row.report === "Performance continuity")?.status, "UNKNOWN");

  const failAndMissing = await runNode(gsc, ["green"], { cwd: dir, ...mocked, env: { ...baseEnv, GSC_TEST_SITEMAPS: JSON.stringify({ sitemap: [{ warnings: 1 }] }), GSC_TEST_GREEN_DATES: dates.slice(1).join(",") } });
  assert.equal(failAndMissing.status, 2, "a board FAIL must outrank continuity UNKNOWN");
  assert.equal(JSON.parse(failAndMissing.stdout).summary.boardStatus, "FAIL");
});

test("aggregate Search Analytics limits paginate with every request rowLimit at most 25000", async (t) => {
  const dir = await tempDir(t);
  const mocked = await mockGsc(t, dir);
  const requests = join(dir, "requests.log");
  const result = await runNode(gsc, ["performance", "--limit", "25001"], { cwd: dir, ...mocked, env: { ...mocked.env, GSC_TEST_REQUESTS: requests, GSC_TEST_ROW_COUNT: "25000" } });
  assert.equal(result.status, 0, result.stderr);
  const bodies = (await readFile(requests, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(bodies.length, 2, "an aggregate limit over one request page must paginate");
  assert.ok(bodies.every((body) => body.rowLimit <= 25000), "every Search Analytics request must cap rowLimit at 25000");
});

test("all documented Search Analytics dimensions, filters, types, and movers dimensions are accepted", async (t) => {
  const dir = await tempDir(t);
  for (const dimension of ["country", "device", "page", "query", "searchAppearance", "date", "hour"]) {
    const mocked = await mockGsc(t, dir);
    const result = await runNode(gsc, ["performance", "--dimensions", dimension], { cwd: dir, ...mocked });
    assert.notEqual(result.status, 1, `${dimension} dimension must be accepted: ${result.stderr}`);
  }
  for (const dimension of ["country", "device", "page", "query", "searchAppearance"]) {
    const mocked = await mockGsc(t, dir);
    const result = await runNode(gsc, ["performance", "--filter", `${dimension}~fixture`], { cwd: dir, ...mocked });
    assert.notEqual(result.status, 1, `${dimension} filter must be accepted: ${result.stderr}`);
  }
  for (const type of ["web", "image", "video", "news", "discover", "googleNews"]) {
    const mocked = await mockGsc(t, dir);
    const result = await runNode(gsc, ["performance", "--type", type], { cwd: dir, ...mocked });
    assert.notEqual(result.status, 1, `${type} type must be accepted: ${result.stderr}`);
  }
  for (const dimension of ["query", "page"]) {
    const mocked = await mockGsc(t, dir);
    const result = await runNode(gsc, ["movers", "--dimensions", dimension], { cwd: dir, ...mocked });
    assert.notEqual(result.status, 1, `${dimension} movers dimension must be accepted: ${result.stderr}`);
  }
});

test("movers applies the validated aggregate limit to both windows while capping each request page", async (t) => {
  const dir = await tempDir(t);
  const mocked = await mockGsc(t, dir);
  const requests = join(dir, "mover-requests.log");
  const result = await runNode(gsc, ["movers", "--limit", "100"], { cwd: dir, ...mocked, env: { ...mocked.env, GSC_TEST_REQUESTS: requests } });
  assert.equal(result.status, 0, result.stderr);
  const bodies = (await readFile(requests, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(bodies.length, 2, "movers must query current and previous windows");
  assert.deepEqual(bodies.map((body) => body.rowLimit), [100, 100], "both mover windows must use the validated aggregate limit");
  assert.ok(bodies.every((body) => body.rowLimit <= 25000));
});

test("movers marks privacy/top-row absent rows UNKNOWN with null deltas and exits 3", async (t) => {
  const dir = await tempDir(t);
  const mocked = await mockGsc(t, dir);
  const fixture = {
    current: { rows: [
      { keys: ["matched"], clicks: 5, impressions: 100, ctr: 0.05, position: 5 },
      { keys: ["current-only"], clicks: 4, impressions: 80, ctr: 0.05, position: 6 },
    ] },
    previous: { rows: [
      { keys: ["matched"], clicks: 2, impressions: 80, ctr: 0.03, position: 6 },
      { keys: ["previous-only"], clicks: 7, impressions: 90, ctr: 0.07, position: 7 },
    ] },
  };
  const result = await runNode(gsc, ["movers", "--limit", "10", "--min-impressions", "1"], { cwd: dir, ...mocked, env: { ...mocked.env, GSC_TEST_MOVERS_JSON: JSON.stringify(fixture) } });
  assert.equal(result.status, 3, `${result.stdout}\n${result.stderr}`);
  const rows = JSON.parse(result.stdout).rows;
  assert.deepEqual(rows.find((row) => row.query === "matched"), { query: "matched", clicks: 5, d_clicks: 3, impressions: 100, d_impressions: 20, position: 5, d_position: 1 });
  for (const key of ["current-only", "previous-only"]) {
    const row = rows.find((item) => item.query === key);
    assert.equal(row?.status, "UNKNOWN", `${key} must remain UNKNOWN when absent from one window`);
    assert.equal(row?.d_clicks, null);
    assert.equal(row?.d_impressions, null);
    assert.equal(row?.d_position, null);
    assert.doesNotMatch(JSON.stringify(row), /gained|disappeared|lost/i);
  }
});
