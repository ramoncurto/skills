import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "scripts", "indexing-plan.mjs");
const AS_OF = "2026-08-23T10:00:00.000Z";
const REQUIRED_CLAIMS = ["declaredIndexable", "httpFetchable", "renderedContent", "canonicalConsistent", "internalDiscoverable", "sitemapListed", "lastmodAccurate", "engineIndexed"];
const EXPECTED_TOP_LEVEL_KEYS = ["actions", "contractVersion", "evidenceLevel", "exitClassification", "exitCode", "generatedAt", "kind", "limitations", "prohibitedActions", "property", "requestCandidates", "status", "summary", "verdict"];
const LIMITATIONS = ["no submission", "queued not crawl/index", "discovery hints", "no guarantees indexing/rank/traffic/timing"];
const PROHIBITIONS = ["generic Indexing API ordinary URLs", "repeated requests/unchanged sitemap resubmission", "deprecated sitemap ping", "fake lastmod", "manipulated traffic/links", "guaranteed outcomes/timing"];
const ACTION_POLICY = {
  INSPECT_IN_SEARCH_CONSOLE: { requiresApproval: false, manualOnly: true },
  FIX_ELIGIBILITY: { requiresApproval: true, manualOnly: false },
  ADD_CRAWLABLE_INTERNAL_LINK: { requiresApproval: true, manualOnly: false },
  FIX_SITEMAP_MEMBERSHIP: { requiresApproval: true, manualOnly: false },
  CORRECT_OR_REMOVE_LASTMOD: { requiresApproval: true, manualOnly: false },
  IMPROVE_VALUE_CANONICAL_UNIQUENESS: { requiresApproval: true, manualOnly: false },
  SUBMIT_SITEMAP_MANUALLY: { requiresApproval: true, manualOnly: true },
  REQUEST_INDEXING_MANUALLY: { requiresApproval: true, manualOnly: true },
  RESTART_VALIDATION_MANUALLY: { requiresApproval: true, manualOnly: true },
  WAIT_AND_REINSPECT: { requiresApproval: false, manualOnly: false },
  DIAGNOSE_CRAWL_DEMAND_CAPACITY: { requiresApproval: false, manualOnly: false },
  MONITOR_INDEXED: { requiresApproval: false, manualOnly: false },
};

async function tempDir(t) {
  const dir = await mkdtemp(join(os.tmpdir(), "seo-indexing-plan-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

function runNode(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...(options.nodeArgs || []), cli, ...args], {
      cwd: options.cwd,
      env: options.env || { PATH: process.env.PATH, HOME: options.cwd },
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

function claim(status = "PASS", evidenceLevel = "E2", overrides = {}) {
  const local = evidenceLevel === "E0";
  return {
    status,
    evidenceLevel,
    source: local ? null : "https://evidence.example.test/source",
    observedAt: local ? null : AS_OF,
    detail: "Fixture evidence is explicit and nonempty.",
    ...overrides,
  };
}

function submission(state = "NOT_REQUESTED", evidenceLevel = "E1", overrides = {}) {
  const local = evidenceLevel === "E0";
  return {
    state,
    evidenceLevel,
    source: local ? null : "https://search.google.com/search-console",
    observedAt: local ? null : AS_OF,
    detail: "Fixture submission state.",
    ...overrides,
  };
}

function engineClaim(googleState = "INDEXED", status = "PASS", evidenceLevel = "E4", overrides = {}) {
  return { ...claim(status, evidenceLevel), googleState, ...overrides };
}

function claims(overrides = {}) {
  return {
    declaredIndexable: claim(),
    httpFetchable: claim(),
    renderedContent: claim("PASS", "E3"),
    canonicalConsistent: claim(),
    internalDiscoverable: claim(),
    sitemapListed: claim(),
    lastmodAccurate: claim("N/A", "E0", { detail: "No published lastmod is available for this URL." }),
    engineIndexed: engineClaim(),
    ...overrides,
  };
}

function page(overrides = {}) {
  const { claims: claimOverrides, ...recordOverrides } = overrides;
  return {
    url: "https://www.example.test/",
    priority: "P0",
    role: "homepage",
    claims: claims(claimOverrides),
    submission: submission(),
    ...recordOverrides,
  };
}

function input(overrides = {}) {
  return {
    inputKind: "indexing-plan-input",
    contractVersion: "seo-indexing-plan/v1.1",
    exampleOnly: false,
    property: "sc-domain:example.test",
    asOf: AS_OF,
    sitemapSubmitted: claim("PASS", "E4"),
    crawlHealth: claim("PASS", "E4"),
    urls: [page()],
    ...overrides,
  };
}

async function writeInput(dir, value, name = "input.json") {
  const path = join(dir, name);
  await writeFile(path, JSON.stringify(value, null, 2));
  return path;
}

function jsonOutput(result) {
  assert.equal(result.signal, null, `CLI must not be signalled: ${result.stderr}`);
  assert.ok(result.stdout.trim(), `CLI must emit JSON: ${result.stderr}`);
  try { return JSON.parse(result.stdout); } catch (error) { assert.fail(`stdout is not one JSON document: ${error.message}\n${result.stdout}`); }
}

function assertNoPlanJson(result, label) {
  assert.equal(result.status, 1, `${label} must exit 1: ${result.stderr}`);
  assert.throws(() => JSON.parse(result.stdout), undefined, `${label} must not emit plan JSON`);
}

function assertAction(action, expected = {}) {
  assert.deepEqual(Object.keys(action).sort(), ["action", "evidenceLevel", "manualOnly", "phase", "reason", "requiresApproval", "status", "url"], "actions have the frozen shape");
  assert.ok([null, "string"].includes(action.url === null ? null : typeof action.url), "action.url must be URL or null");
  assert.ok(["P0", "P1", "P2"].includes(action.phase));
  assert.ok(["PASS", "FAIL", "UNKNOWN", "N/A"].includes(action.status));
  assert.match(action.evidenceLevel, /^E[0-6]$/);
  assert.match(action.reason, /\S/, "action.reason must be nonblank");
  assert.equal(typeof action.requiresApproval, "boolean");
  assert.equal(typeof action.manualOnly, "boolean");
  assert.ok(ACTION_POLICY[action.action], `action ${action.action} has a frozen approval/manual policy`);
  assert.deepEqual({ requiresApproval: action.requiresApproval, manualOnly: action.manualOnly }, ACTION_POLICY[action.action], `${action.action} has the frozen approval/manual policy`);
  for (const [key, value] of Object.entries(expected)) assert.equal(action[key], value, `action.${key}`);
}

function codePointCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertActionOrder(records, actions) {
  const byUrl = new Map(records.map((record) => [record.url, record]));
  const priority = { P0: 0, P1: 1, P2: 2 };
  const role = { homepage: 0, hub: 1, detail: 2 };
  for (const action of actions) assert.equal(action.phase, byUrl.get(action.url).priority, "URL-scoped action phase must equal its record priority");
  const sorted = [...actions].sort((left, right) => {
    const leftRecord = byUrl.get(left.url);
    const rightRecord = byUrl.get(right.url);
    assert.ok(leftRecord && rightRecord, "ordering fixture actions must be URL-scoped");
    return priority[left.phase] - priority[right.phase]
      || role[leftRecord.role] - role[rightRecord.role]
      || codePointCompare(new URL(left.url).href, new URL(right.url).href)
      || codePointCompare(left.action, right.action);
  });
  assert.deepEqual(actions, sorted, "actions sort by phase, role, normalized URL, then action using locale-independent code-point order");
}

function assertExit(result, expectedCode, expectedStatus) {
  const plan = jsonOutput(result);
  assert.equal(result.status, expectedCode, `process exit must be ${expectedCode}: ${result.stderr}`);
  assert.equal(plan.exitCode, expectedCode);
  assert.equal(plan.status, expectedStatus);
  assert.equal(plan.verdict, expectedStatus, "verdict must agree with status");
  assert.equal(typeof plan.exitClassification, "string");
  assert.ok(plan.exitClassification.toUpperCase().includes(expectedStatus === "UNKNOWN" ? "UNKNOWN" : expectedStatus), "exit classification must agree with status");
  return plan;
}

test("indexing-plan accepts only the frozen CLI grammar and default request cap", async (t) => {
  const dir = await tempDir(t);
  const path = await writeInput(dir, input());
  for (const [label, args] of [
    ["missing input", []],
    ["unknown flag", ["--input", path, "--unknown", "x"]],
    ["positional argument", ["--input", path, "stray"]],
    ["duplicate input", ["--input", path, "--input", path]],
    ["duplicate max", ["--input", path, "--max-requests", "1", "--max-requests", "2"]],
    ["duplicate markdown", ["--input", path, "--md", "--md"]],
    ["missing input value", ["--input"]],
    ["missing max value", ["--input", path, "--max-requests"]],
    ["fractional max", ["--input", path, "--max-requests", "1.5"]],
    ["negative max", ["--input", path, "--max-requests", "-1"]],
    ["max above 50", ["--input", path, "--max-requests", "51"]],
  ]) assertNoPlanJson(await runNode(args, { cwd: dir }), label);

  const defaultPlan = assertExit(await runNode(["--input", path], { cwd: dir }), 0, "PASS");
  const explicitPlan = assertExit(await runNode(["--input", path, "--max-requests", "0"], { cwd: dir }), 0, "PASS");
  assert.equal(defaultPlan.requestCandidates.length, 0, "default max is 10 and does not invent candidates");
  assert.equal(explicitPlan.requestCandidates.length, 0, "zero max is valid and caps candidate output at zero");
});

test("indexing-plan rejects example-only evidence before producing a plan", async (t) => {
  const dir = await tempDir(t);
  const path = await writeInput(dir, input({ exampleOnly: true }));
  assertNoPlanJson(await runNode(["--input", path], { cwd: dir }), "exampleOnly input");
});

test("indexing-plan strictly validates the input schema, claims, evidence floors, and timestamps", async (t) => {
  const dir = await tempDir(t);
  const missingClaim = page();
  delete missingClaim.claims.sitemapListed;
  const naUrlClaims = REQUIRED_CLAIMS.filter((name) => name !== "lastmodAccurate").map((name) => [
    `${name} cannot be N/A`,
    input({ urls: [page({ claims: { [name]: name === "engineIndexed" ? engineClaim("UNKNOWN", "N/A", "E0") : claim("N/A", "E0") } })] }),
  ]);
  const invalidCases = [
    ["wrong input kind", input({ inputKind: "other" })],
    ["wrong contract version", input({ contractVersion: "seo-indexing-plan/v1" })],
    ["missing property", input({ property: undefined })],
    ["invalid asOf", input({ asOf: "tomorrow" })],
    ["unknown root key", input({ unrecognized: true })],
    ["unknown URL record key", input({ urls: [page({ unrecognized: true })] })],
    ["invalid URL role", input({ urls: [page({ role: "category" })] })],
    ["unknown claims key", input({ urls: [page({ claims: { unrecognized: claim() } })] })],
    ["missing required claim", input({ urls: [missingClaim] })],
    ["unknown submission key", input({ urls: [page({ submission: submission("NOT_REQUESTED", "E1", { unrecognized: true }) })] })],
    ["invalid claim status", input({ crawlHealth: claim("MAYBE") })],
    ["invalid evidence level", input({ crawlHealth: claim("PASS", "E9") })],
    ["E0 with source", input({ crawlHealth: claim("UNKNOWN", "E0", { source: "https://evidence.example.test" }) })],
    ["E1 without observedAt", input({ crawlHealth: claim("PASS", "E1", { observedAt: null }) })],
    ["empty detail", input({ crawlHealth: claim("PASS", "E2", { detail: "" }) })],
    ["whitespace-only claim detail", input({ crawlHealth: claim("PASS", "E4", { detail: "  \t" }) })],
    ["whitespace-only submission detail", input({ urls: [page({ submission: submission("NOT_REQUESTED", "E1", { detail: "  \n" }) })] })],
    ["future evidence", input({ crawlHealth: claim("PASS", "E2", { observedAt: "2026-08-23T10:00:01.000Z" }) })],
    ["sitemapSubmitted PASS E0", input({ sitemapSubmitted: claim("PASS", "E0") })],
    ["sitemapSubmitted PASS E1", input({ sitemapSubmitted: claim("PASS", "E1") })],
    ["crawlHealth PASS E0", input({ crawlHealth: claim("PASS", "E0") })],
    ["crawlHealth PASS E1", input({ crawlHealth: claim("PASS", "E1") })],
    ["sitemapSubmitted FAIL E3", input({ sitemapSubmitted: claim("FAIL", "E3") })],
    ["crawlHealth FAIL E3", input({ crawlHealth: claim("FAIL", "E3") })],
    ["sitemapSubmitted cannot be N/A", input({ sitemapSubmitted: claim("N/A", "E0") })],
    ["crawlHealth cannot be N/A", input({ crawlHealth: claim("N/A", "E0") })],
    ["declared below E2", input({ urls: [page({ claims: { declaredIndexable: claim("PASS", "E1") } })] })],
    ["rendered below E3", input({ urls: [page({ claims: { renderedContent: claim("PASS", "E2") } })] })],
    ["canonical below served E2", input({ urls: [page({ claims: { canonicalConsistent: claim("PASS", "E1") } })] })],
    ["engine below E4", input({ urls: [page({ claims: { engineIndexed: engineClaim("INDEXED", "PASS", "E3") } })] })],
    ["lastmod N/A with evidence", input({ urls: [page({ claims: { lastmodAccurate: claim("N/A", "E2") } })] })],
    ["unknown submission with E1", input({ urls: [page({ submission: submission("UNKNOWN", "E1") })] })],
    ["queued submission below E4", input({ urls: [page({ submission: submission("REQUEST_QUEUED", "E3") })] })],
    ...naUrlClaims,
  ];
  for (const [label, value] of invalidCases) {
    const path = await writeInput(dir, value, `${label.replace(/\W+/g, "-")}.json`);
    assertNoPlanJson(await runNode(["--input", path], { cwd: dir }), label);
  }
  const allowedLastmod = await writeInput(dir, input({ urls: [page({ claims: { lastmodAccurate: claim("N/A", "E0", { detail: "No published lastmod is available." }) } })] }), "allowed-lastmod-na.json");
  assert.notEqual((await runNode(["--input", allowedLastmod], { cwd: dir })).status, 1, "lastmodAccurate N/A/E0 remains the sole valid N/A exception");
});

test("indexing-plan accepts only unique in-property absolute HTTP(S) URLs", async (t) => {
  const dir = await tempDir(t);
  const cases = [
    ["duplicate URL", input({ urls: [page(), page({ url: "https://www.example.test/" })] })],
    ["relative URL", input({ urls: [page({ url: "/guide" })] })],
    ["non-HTTP URL", input({ urls: [page({ url: "ftp://www.example.test/guide" })] })],
    ["target URL with surrounding whitespace", input({ urls: [page({ url: " https://www.example.test/guide " })] })],
    ["target URL with an empty fragment", input({ urls: [page({ url: "https://www.example.test/guide#" })] })],
    ["property URL-prefix with surrounding whitespace", input({ property: " https://www.example.test/ " })],
    ["outside domain property", input({ urls: [page({ url: "https://other.example/guide" })] })],
    ["cross-domain lookalike", input({ urls: [page({ url: "https://example.test.attacker.invalid/guide" })] })],
  ];
  for (const [label, value] of cases) {
    const path = await writeInput(dir, value, `${label.replace(/\W+/g, "-")}.json`);
    assertNoPlanJson(await runNode(["--input", path], { cwd: dir }), label);
  }

  const prefixCases = [
    ["trailing slash accepts child", "https://www.example.test/docs/", "https://www.example.test/docs/a", true],
    ["trailing slash rejects bare prefix", "https://www.example.test/docs/", "https://www.example.test/docs", false],
    ["trailing slash rejects lexical sibling", "https://www.example.test/docs/", "https://www.example.test/docs2", false],
    ["literal prefix accepts bare prefix", "https://www.example.test/docs", "https://www.example.test/docs", true],
    ["literal prefix accepts slash child", "https://www.example.test/docs", "https://www.example.test/docs/", true],
    ["literal prefix accepts lexical sibling", "https://www.example.test/docs", "https://www.example.test/docs2", true],
    ["prefix preserves protocol", "https://www.example.test/docs", "http://www.example.test/docs", false],
  ];
  for (const [label, property, url, accepted] of prefixCases) {
    const path = await writeInput(dir, input({ property, urls: [page({ url })] }), `prefix-${label.replace(/\W+/g, "-")}.json`);
    const result = await runNode(["--input", path], { cwd: dir });
    if (accepted) assertExit(result, 0, "PASS");
    else assertNoPlanJson(result, label);
  }
});

test("indexing-plan is deterministic and applies its request cap after frozen priority sorting", async (t) => {
  const dir = await tempDir(t);
  const candidate = (url, priority, role) => page({
    url,
    priority,
    role,
    claims: { engineIndexed: engineClaim("UNKNOWN_TO_GOOGLE", "FAIL", "E4") },
    submission: submission(),
  });
  const path = await writeInput(dir, input({ urls: [
    candidate("https://www.example.test/z-detail", "P1", "detail"),
    candidate("https://www.example.test/a-hub", "P0", "hub"),
    candidate("https://www.example.test/z-home", "P0", "homepage"),
    candidate("https://www.example.test/c-home", "P1", "homepage"),
    candidate("https://www.example.test/b-hub", "P1", "hub"),
    candidate("https://www.example.test/a-p2", "P2", "homepage"),
  ] }));
  const first = assertExit(await runNode(["--input", path, "--max-requests", "3"], { cwd: dir }), 2, "FAIL");
  const second = assertExit(await runNode(["--input", path, "--max-requests", "3"], { cwd: dir }), 2, "FAIL");
  assert.deepEqual(first, second, "same input must produce byte-for-byte equivalent plan JSON");
  assert.equal(first.generatedAt, AS_OF);
  assert.deepEqual(first.requestCandidates, ["https://www.example.test/z-home", "https://www.example.test/a-hub", "https://www.example.test/c-home"], "sort P0→P1→P2, homepage→hub→detail, URL, then phase before cap");
});

test("indexing-plan routes prerequisite actions and permits requests only for eligible homepage or hub URLs", async (t) => {
  const dir = await tempDir(t);
  const candidate = page({
    url: "https://www.example.test/hub",
    priority: "P1",
    role: "hub",
    claims: { engineIndexed: engineClaim("DISCOVERED_NOT_CRAWLED", "FAIL", "E4") },
    submission: submission(),
  });
  const prerequisiteFailures = [
    ["declaredIndexable", "E2", "FIX_ELIGIBILITY"],
    ["httpFetchable", "E2", "FIX_ELIGIBILITY"],
    ["renderedContent", "E3", "FIX_ELIGIBILITY"],
    ["canonicalConsistent", "E2", "FIX_ELIGIBILITY"],
    ["internalDiscoverable", "E2", "ADD_CRAWLABLE_INTERNAL_LINK"],
    ["sitemapListed", "E2", "FIX_SITEMAP_MEMBERSHIP"],
    ["lastmodAccurate", "E2", "CORRECT_OR_REMOVE_LASTMOD"],
  ];
  const blocked = prerequisiteFailures.map(([claimName, evidenceLevel]) => page({
    url: `https://www.example.test/broken-${claimName}`,
    priority: "P0",
    role: "homepage",
    claims: {
      [claimName]: claim("FAIL", evidenceLevel),
      engineIndexed: engineClaim("UNKNOWN_TO_GOOGLE", "FAIL", "E4"),
    },
  }));
  const detail = page({
    url: "https://www.example.test/detail",
    priority: "P0",
    role: "detail",
    claims: { engineIndexed: engineClaim("UNKNOWN", "UNKNOWN", "E0") },
  });
  const path = await writeInput(dir, input({ urls: [candidate, ...blocked, detail] }));
  const plan = assertExit(await runNode(["--input", path], { cwd: dir }), 2, "FAIL");
  assert.deepEqual(plan.requestCandidates, [candidate.url], "only fully eligible P0/P1 homepage/hub URLs in requestable states are candidates");
  const allowed = new Set(["FIX_ELIGIBILITY", "ADD_CRAWLABLE_INTERNAL_LINK", "FIX_SITEMAP_MEMBERSHIP", "CORRECT_OR_REMOVE_LASTMOD", "SUBMIT_SITEMAP_MANUALLY", "INSPECT_IN_SEARCH_CONSOLE", "REQUEST_INDEXING_MANUALLY", "WAIT_AND_REINSPECT", "RESTART_VALIDATION_MANUALLY", "DIAGNOSE_CRAWL_DEMAND_CAPACITY", "IMPROVE_VALUE_CANONICAL_UNIQUENESS", "MONITOR_INDEXED"]);
  for (const action of plan.actions) {
    assert.ok(allowed.has(action.action), `unrecognized action ${action.action}`);
    assertAction(action);
  }
  for (const [claimName, , actionName] of prerequisiteFailures) {
    const target = blocked.find((record) => record.url.endsWith(`-${claimName}`));
    assert.ok(plan.actions.some((action) => action.url === target.url && action.action === actionName), `${claimName} prerequisite must route to ${actionName}`);
  }
  assert.ok(plan.actions.some((action) => action.url === candidate.url && action.action === "REQUEST_INDEXING_MANUALLY" && action.manualOnly && action.requiresApproval), "candidate request is manual and approval-gated");
  assert.ok(!plan.requestCandidates.includes(detail.url), "details are never request candidates");

  const sitemapReady = page({
    url: "https://www.example.test/sitemap-ready",
    claims: { engineIndexed: engineClaim("UNKNOWN", "UNKNOWN", "E0") },
  });
  const sitemapCohortMate = page({
    url: "https://www.example.test/sitemap-ready-hub",
    role: "hub",
    claims: { engineIndexed: engineClaim("UNKNOWN", "UNKNOWN", "E0") },
  });
  const sitemapPath = await writeInput(dir, input({ sitemapSubmitted: claim("FAIL", "E4"), crawlHealth: claim("PASS", "E4"), urls: [sitemapReady, sitemapCohortMate] }), "sitemap-ready.json");
  const sitemapPlan = assertExit(await runNode(["--input", sitemapPath], { cwd: dir }), 2, "FAIL");
  const submit = sitemapPlan.actions.find((action) => action.action === "SUBMIT_SITEMAP_MANUALLY");
  assert.ok(submit, "failed sitemap submission is manually actionable only after a healthy eligible cohort");
  assertAction(submit, { url: null, phase: "P0" });
  const submitBlockers = [
    ["crawl failure", input({ sitemapSubmitted: claim("FAIL", "E4"), crawlHealth: claim("FAIL", "E4"), urls: [sitemapReady] })],
    ["crawl unknown", input({ sitemapSubmitted: claim("FAIL", "E4"), crawlHealth: claim("UNKNOWN", "E0"), urls: [sitemapReady] })],
    ...prerequisiteFailures.flatMap(([claimName, evidenceLevel]) => [
      [`${claimName} failure`, input({ sitemapSubmitted: claim("FAIL", "E4"), urls: [page({ claims: { [claimName]: claim("FAIL", evidenceLevel), engineIndexed: engineClaim("UNKNOWN", "UNKNOWN", "E0") } })] })],
      [`${claimName} unknown`, input({ sitemapSubmitted: claim("FAIL", "E4"), urls: [page({ claims: { [claimName]: claim("UNKNOWN", "E0"), engineIndexed: engineClaim("UNKNOWN", "UNKNOWN", "E0") } })] })],
    ]),
  ];
  for (const [label, value] of submitBlockers) {
    const blockedPath = await writeInput(dir, value, `submit-blocked-${label.replace(/\W+/g, "-")}.json`);
    const blockedPlan = jsonOutput(await runNode(["--input", blockedPath], { cwd: dir }));
    assert.ok(!blockedPlan.actions.some((action) => action.action === "SUBMIT_SITEMAP_MANUALLY"), `${label} blocks manual sitemap submission`);
  }

  const orderedRecords = [
    page({ url: "https://www.example.test/z-home", priority: "P0", role: "homepage", claims: { internalDiscoverable: claim("FAIL", "E2"), engineIndexed: engineClaim("BLOCKED", "FAIL", "E4") } }),
    page({ url: "https://www.example.test/a-hub", priority: "P0", role: "hub", claims: { sitemapListed: claim("FAIL", "E2"), engineIndexed: engineClaim("DUPLICATE", "FAIL", "E4") } }),
    page({ url: "https://WWW.example.test/a-detail", priority: "P1", role: "detail", claims: { httpFetchable: claim("FAIL", "E2"), engineIndexed: engineClaim("CRAWLED_NOT_INDEXED", "FAIL", "E4") } }),
  ];
  const orderingPath = await writeInput(dir, input({ urls: orderedRecords }), "action-order.json");
  const orderingPlan = assertExit(await runNode(["--input", orderingPath], { cwd: dir }), 2, "FAIL");
  orderingPlan.actions.forEach((action) => assertAction(action));
  assertActionOrder(orderedRecords, orderingPlan.actions);
});

test("indexing-plan covers every Google state, engine evidence, and ordinary action route", async (t) => {
  const dir = await tempDir(t);
  const ordinaryStates = [
    ["UNKNOWN", engineClaim("UNKNOWN", "UNKNOWN", "E0"), 3, "UNKNOWN", "INSPECT_IN_SEARCH_CONSOLE"],
    ["UNKNOWN_TO_GOOGLE", engineClaim("UNKNOWN_TO_GOOGLE", "FAIL", "E4"), 2, "FAIL", "DIAGNOSE_CRAWL_DEMAND_CAPACITY"],
    ["DISCOVERED_NOT_CRAWLED", engineClaim("DISCOVERED_NOT_CRAWLED", "FAIL", "E4"), 2, "FAIL", "DIAGNOSE_CRAWL_DEMAND_CAPACITY"],
    ["CRAWLED_NOT_INDEXED", engineClaim("CRAWLED_NOT_INDEXED", "FAIL", "E4"), 2, "FAIL", "IMPROVE_VALUE_CANONICAL_UNIQUENESS"],
    ["INDEXED", engineClaim("INDEXED", "PASS", "E4"), 0, "PASS", "MONITOR_INDEXED"],
    ["BLOCKED", engineClaim("BLOCKED", "FAIL", "E4"), 2, "FAIL", "FIX_ELIGIBILITY"],
    ["DUPLICATE", engineClaim("DUPLICATE", "FAIL", "E4"), 2, "FAIL", "IMPROVE_VALUE_CANONICAL_UNIQUENESS"],
    ["REDIRECT", engineClaim("REDIRECT", "FAIL", "E4"), 2, "FAIL", "FIX_ELIGIBILITY"],
    ["ERROR", engineClaim("ERROR", "UNKNOWN", "E0"), 3, "UNKNOWN", "INSPECT_IN_SEARCH_CONSOLE"],
  ];
  for (const [googleState, engineIndexed, exitCode, status, expectedAction] of ordinaryStates) {
    const record = page({ url: `https://www.example.test/${googleState.toLowerCase()}`, priority: "P1", role: "detail", claims: { engineIndexed } });
    const path = await writeInput(dir, input({ urls: [record] }), `${googleState}.json`);
    const plan = assertExit(await runNode(["--input", path], { cwd: dir }), exitCode, status);
    const action = plan.actions.find((item) => item.url === record.url && item.action === expectedAction);
    assert.ok(action, `${googleState} routes to ${expectedAction} when not selected for a request`);
    assertAction(action);
    assert.deepEqual(plan.requestCandidates, [], `${googleState} detail is never a request candidate`);
    if (googleState === "UNKNOWN_TO_GOOGLE") assert.equal(plan.summary.knownNotIndexed, 1, "observed UNKNOWN_TO_GOOGLE is a known-not-indexed state, not unknown evidence");
  }
  for (const [googleState, engineIndexed] of [
    ["UNKNOWN_TO_GOOGLE", engineClaim("UNKNOWN_TO_GOOGLE", "FAIL", "E4")],
    ["DISCOVERED_NOT_CRAWLED", engineClaim("DISCOVERED_NOT_CRAWLED", "FAIL", "E4")],
  ]) {
    const record = page({ url: `https://www.example.test/request-${googleState.toLowerCase()}`, priority: "P1", role: "hub", claims: { engineIndexed } });
    const path = await writeInput(dir, input({ urls: [record] }), `selected-${googleState}.json`);
    const selected = assertExit(await runNode(["--input", path, "--max-requests", "1"], { cwd: dir }), 2, "FAIL");
    assert.deepEqual(selected.requestCandidates, [record.url], `${googleState} is requestable only with observed E4+ failure evidence and all candidate prerequisites`);
    assertAction(selected.actions.find((item) => item.action === "REQUEST_INDEXING_MANUALLY"));
    assert.ok(!selected.actions.some((item) => item.url === record.url && item.action === "DIAGNOSE_CRAWL_DEMAND_CAPACITY"), "selected candidate gets the manual request route rather than a duplicate diagnosis");
    const capped = assertExit(await runNode(["--input", path, "--max-requests", "0"], { cwd: dir }), 2, "FAIL");
    assert.deepEqual(capped.requestCandidates, [], "zero cap leaves observed requestable state unselected");
    assertAction(capped.actions.find((item) => item.action === "DIAGNOSE_CRAWL_DEMAND_CAPACITY"));
  }
  for (const [label, engineIndexed] of [
    ["indexed without E4 PASS", engineClaim("INDEXED", "PASS", "E3")],
    ["known nonindexed without E4 FAIL", engineClaim("DUPLICATE", "FAIL", "E3")],
    ["unknown-to-Google cannot be E0 UNKNOWN", engineClaim("UNKNOWN_TO_GOOGLE", "UNKNOWN", "E0")],
    ["unknown-to-Google must be FAIL", engineClaim("UNKNOWN_TO_GOOGLE", "PASS", "E4")],
    ["unknown-to-Google must be E4+", engineClaim("UNKNOWN_TO_GOOGLE", "FAIL", "E3")],
    ["unknown with conclusive FAIL", engineClaim("UNKNOWN", "FAIL", "E4")],
    ["unknown state with non-E0 evidence", engineClaim("UNKNOWN", "UNKNOWN", "E4")],
    ["error with PASS", engineClaim("ERROR", "PASS", "E4")],
    ["error state with non-E0 evidence", engineClaim("ERROR", "UNKNOWN", "E4")],
    ["unknown state", engineClaim("SOMETHING_ELSE", "UNKNOWN", "E0")],
  ]) {
    const path = await writeInput(dir, input({ urls: [page({ claims: { engineIndexed } })] }), `invalid-${label.replace(/\W+/g, "-")}.json`);
    assertNoPlanJson(await runNode(["--input", path], { cwd: dir }), label);
  }
});

test("indexing-plan keeps every engine state independent of queued and validation submission evidence", async (t) => {
  const dir = await tempDir(t);
  const engineStates = [
    ["UNKNOWN", engineClaim("UNKNOWN", "UNKNOWN", "E0"), "INSPECT_IN_SEARCH_CONSOLE"],
    ["UNKNOWN_TO_GOOGLE", engineClaim("UNKNOWN_TO_GOOGLE", "FAIL", "E4"), "DIAGNOSE_CRAWL_DEMAND_CAPACITY"],
    ["DISCOVERED_NOT_CRAWLED", engineClaim("DISCOVERED_NOT_CRAWLED", "FAIL", "E4"), "DIAGNOSE_CRAWL_DEMAND_CAPACITY"],
    ["CRAWLED_NOT_INDEXED", engineClaim("CRAWLED_NOT_INDEXED", "FAIL", "E4"), "IMPROVE_VALUE_CANONICAL_UNIQUENESS"],
    ["INDEXED", engineClaim("INDEXED", "PASS", "E4"), "MONITOR_INDEXED"],
    ["BLOCKED", engineClaim("BLOCKED", "FAIL", "E4"), "FIX_ELIGIBILITY"],
    ["DUPLICATE", engineClaim("DUPLICATE", "FAIL", "E4"), "IMPROVE_VALUE_CANONICAL_UNIQUENESS"],
    ["REDIRECT", engineClaim("REDIRECT", "FAIL", "E4"), "FIX_ELIGIBILITY"],
    ["ERROR", engineClaim("ERROR", "UNKNOWN", "E0"), "INSPECT_IN_SEARCH_CONSOLE"],
  ];
  const submissionStates = [
    ["NOT_REQUESTED", "E1"],
    ["REQUEST_QUEUED", "E4"],
    ["VALIDATION_STARTED", "E4"],
    ["VALIDATION_PASSED", "E4"],
    ["VALIDATION_FAILED", "E4"],
  ];
  for (const [googleState, engineIndexed, engineAction] of engineStates) {
    for (const [submissionState, evidenceLevel] of submissionStates) {
      const record = page({
        url: `https://www.example.test/${googleState.toLowerCase()}-${submissionState.toLowerCase()}`,
        priority: "P1",
        role: "hub",
        claims: { engineIndexed },
        submission: submission(submissionState, evidenceLevel),
      });
      const path = await writeInput(dir, input({ urls: [record] }), `${googleState}-${submissionState}.json`);
      const plan = jsonOutput(await runNode(["--input", path], { cwd: dir }));
      const selected = submissionState === "NOT_REQUESTED" && ["UNKNOWN_TO_GOOGLE", "DISCOVERED_NOT_CRAWLED"].includes(googleState);
      assert.deepEqual(plan.requestCandidates, selected ? [record.url] : [], `${googleState}/${submissionState} must not be promoted except a selected fresh candidate`);
      assert.ok(!plan.actions.some((action) => action.action === "RESTART_VALIDATION_MANUALLY"), `${googleState}/${submissionState} must never auto-restart validation without issue-fixed evidence`);
      const expectedEngineAction = selected ? "REQUEST_INDEXING_MANUALLY" : engineAction;
      const independent = plan.actions.find((action) => action.url === record.url && action.action === expectedEngineAction);
      assert.ok(independent, `${googleState}/${submissionState} retains independent ${expectedEngineAction} engine routing`);
      assertAction(independent);
      if (submissionState !== "NOT_REQUESTED") {
        const wait = plan.actions.find((action) => action.url === record.url && action.action === "WAIT_AND_REINSPECT");
        assert.ok(wait, `${googleState}/${submissionState} adds wait/reinspect without suppressing engine routing`);
        assertAction(wait);
        assert.ok(!plan.actions.some((action) => action.action === "REQUEST_INDEXING_MANUALLY"), `${googleState}/${submissionState} never repeats a request`);
      }
    }
  }
  const unknown = page({ role: "hub", claims: { engineIndexed: engineClaim("UNKNOWN_TO_GOOGLE", "FAIL", "E4") }, submission: submission("UNKNOWN", "E0") });
  const unknownPath = await writeInput(dir, input({ urls: [unknown] }), "submission-unknown.json");
  const plan = jsonOutput(await runNode(["--input", unknownPath], { cwd: dir }));
  assert.deepEqual(plan.requestCandidates, [], "unknown submission evidence must not be promoted to a request");
  assert.ok(!plan.actions.some((action) => action.action === "REQUEST_INDEXING_MANUALLY"), "unknown submission cannot repeat a request");
});

test("indexing-plan has fail-closed exit semantics and a frozen JSON envelope", async (t) => {
  const dir = await tempDir(t);
  const allIndexed = await writeInput(dir, input(), "all-indexed.json");
  const pass = assertExit(await runNode(["--input", allIndexed], { cwd: dir }), 0, "PASS");
  assert.deepEqual(Object.keys(pass).sort(), EXPECTED_TOP_LEVEL_KEYS);
  assert.deepEqual({ kind: pass.kind, contractVersion: pass.contractVersion, generatedAt: pass.generatedAt, property: pass.property, evidenceLevel: pass.evidenceLevel }, {
    kind: "seo-indexing-plan", contractVersion: "seo-indexing-plan/v1.1", generatedAt: AS_OF, property: "sc-domain:example.test", evidenceLevel: "E4",
  });
  assert.deepEqual(Object.keys(pass.summary).sort(), ["blockedPrerequisites", "indexed", "knownNotIndexed", "requestCandidateCount", "total", "unknown"]);
  assert.equal(pass.summary.total, 1);
  assert.equal(pass.summary.indexed, 1);

  const failPath = await writeInput(dir, input({ urls: [page({ claims: { engineIndexed: engineClaim("CRAWLED_NOT_INDEXED", "FAIL", "E4") } })] }), "known-fail.json");
  const failed = assertExit(await runNode(["--input", failPath], { cwd: dir }), 2, "FAIL");
  assert.equal(failed.summary.knownNotIndexed, 1);
  const unknownPath = await writeInput(dir, input({ urls: [page({ claims: { engineIndexed: engineClaim("UNKNOWN", "UNKNOWN", "E0") } })] }), "unknown.json");
  const incomplete = assertExit(await runNode(["--input", unknownPath], { cwd: dir }), 3, "UNKNOWN");
  assert.equal(incomplete.summary.unknown, 1);
  const mixedPath = await writeInput(dir, input({ urls: [page({ claims: { engineIndexed: engineClaim("UNKNOWN", "UNKNOWN", "E0") } }), page({ url: "https://www.example.test/fail", claims: { engineIndexed: engineClaim("BLOCKED", "FAIL", "E4") } })] }), "fail-outranks-unknown.json");
  assertExit(await runNode(["--input", mixedPath], { cwd: dir }), 2, "FAIL");
});

test("indexing-plan Markdown is semantically equivalent and its CLI is offline, credential-free, and write-free", async (t) => {
  const dir = await tempDir(t);
  const source = await readFile(cli, "utf8");
  assert.match(source, /readFileSync/, "planner reads only its supplied local input/schema");
  assert.doesNotMatch(source, /node:(?:http|https|net|dns|child_process)/, "planner source has no network or subprocess dependency");
  assert.doesNotMatch(source, /\b(?:fetch|curl)\s*\(/i, "planner source does not make a network request");
  assert.doesNotMatch(source, /\b(?:GOOGLE_APPLICATION_CREDENTIALS|GSC_|GOOGLE_[A-Z_]+)\b/, "planner source does not demand engine credentials");
  assert.ok(((await stat(cli)).mode & 0o111) !== 0, "new CLI follows the executable-script mode of its sibling SEO CLIs");
  const path = await writeInput(dir, input({ urls: [
    page({ url: "https://www.example.test/unknown", role: "detail", claims: { engineIndexed: engineClaim("UNKNOWN", "UNKNOWN", "E0") } }),
    page({ url: "https://www.example.test/blocked", role: "hub", claims: { engineIndexed: engineClaim("BLOCKED", "FAIL", "E4") } }),
    page({ url: "https://www.example.test/candidate", priority: "P1", role: "hub", claims: { engineIndexed: engineClaim("DISCOVERED_NOT_CRAWLED", "FAIL", "E4") } }),
  ] }));
  const sentinel = join(dir, "sentinel.txt");
  const trap = join(dir, "offline-trap.cjs");
  await writeFile(sentinel, "must not change\n");
  await writeFile(trap, `
const fs = require("node:fs");
const net = require("node:net");
const http = require("node:http");
const https = require("node:https");
const dns = require("node:dns");
const deny = (name) => () => { throw new Error("network disabled by indexing-plan contract: " + name); };
net.connect = deny("net.connect"); net.createConnection = deny("net.createConnection");
http.request = deny("http.request"); http.get = deny("http.get"); https.request = deny("https.request"); https.get = deny("https.get");
dns.lookup = deny("dns.lookup");
for (const name of ["writeFileSync", "appendFileSync", "mkdirSync", "rmSync", "renameSync", "copyFileSync", "unlinkSync"]) fs[name] = deny("fs." + name);
globalThis.fetch = deny("fetch");
`);
  const env = { PATH: process.env.PATH, HOME: dir, NODE_OPTIONS: `--require=${trap}` };
  const before = (await readdir(dir)).sort();
  const json = assertExit(await runNode(["--input", path], { cwd: dir, env }), 2, "FAIL");
  const markdown = await runNode(["--input", path, "--md"], { cwd: dir, env });
  assert.equal(markdown.status, json.exitCode, markdown.stderr);
  assert.equal(await readFile(sentinel, "utf8"), "must not change\n", "CLI must not write its working directory");
  assert.deepEqual((await readdir(dir)).sort(), before, "CLI must not create, remove, or rename working-directory entries");
  assert.equal(existsSync(join(dir, ".credentials")), false, "CLI must not demand or create credentials");
  json.actions.forEach((action) => assertAction(action));
  const markdownValues = [
    json.kind,
    json.contractVersion,
    json.generatedAt,
    json.property,
    json.status,
    json.verdict,
    json.exitClassification,
    String(json.exitCode),
    json.evidenceLevel,
    ...Object.entries(json.summary).flatMap(([key, value]) => [key, String(value)]),
    ...json.requestCandidates,
    ...json.limitations,
    ...json.prohibitedActions,
    ...json.actions.flatMap((action) => [action.url ?? "property", action.phase, action.action, action.status, action.evidenceLevel, String(action.requiresApproval), String(action.manualOnly), action.reason]),
  ];
  for (const value of markdownValues) assert.match(markdown.stdout, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `Markdown must express ${value}`);
});
