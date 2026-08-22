import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const skill = join(here, '..');
const scripts = join(skill, 'scripts');
const scorecard = join(scripts, 'seo-scorecard.mjs');
const gsc = join(scripts, 'gsc.mjs');
const measurePage = join(scripts, 'measure-page.mjs');
const gate = join(scripts, 'seo-gate.mjs');

async function temporary(t) {
  const dir = await mkdtemp(join(os.tmpdir(), 'seo-autoreview-contract-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, ...options.env }; delete env.NODE_TEST_CONTEXT;
    const child = spawn(command, args, { cwd: options.cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

const runNode = (script, args, options = {}) => run(process.execPath, [...(options.nodeArgs || []), script, ...args], options);
const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);

async function server(t, responder) {
  const instance = http.createServer(responder);
  await new Promise((resolve) => instance.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => instance.close((error) => error ? reject(error) : resolve())));
  return `http://127.0.0.1:${instance.address().port}`;
}

async function gscFixture(t, rows = []) {
  const dir = await temporary(t);
  const loader = join(dir, 'mock-fetch.mjs');
  const calls = join(dir, 'calls.txt');
  await writeFile(loader, `
import { appendFileSync } from 'node:fs';
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url) => {
  const target = String(url);
  appendFileSync(process.env.SEO_AUTOREVIEW_CALLS, target + '\\n');
  if (target.includes('oauth2.googleapis.com/token')) return json({ access_token: 'fixture-token', expires_in: 3600 });
  if (target.includes('/sitemaps')) return json({ sitemap: [] });
  if (target.includes('searchAnalytics/query')) return json({ rows: ${JSON.stringify(rows)} });
  if (target.includes('urlInspection')) return json({});
  if (target.includes('/sites')) return json({ siteEntry: [] });
  throw new Error('unexpected fixture request: ' + target);
};
`);
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
  return {
    cwd: dir,
    nodeArgs: ['--import', loader],
    env: {
      GSC_CLIENT_EMAIL: 'fixture@example.invalid',
      GSC_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      GSC_SITE_URL: 'sc-domain:fixture.invalid',
      SEO_AUTOREVIEW_CALLS: calls,
    },
    calls,
  };
}

async function gateSandbox(t) {
  const dir = await temporary(t);
  await cp(scripts, join(dir, 'scripts'), { recursive: true });
  await cp(join(skill, 'assets'), join(dir, 'assets'), { recursive: true });
  await mkdir(join(dir, 'tests', 'fixtures'), { recursive: true });
  for (const name of ['tooling.test.mjs', 'skill-contract.test.mjs', 'seo.test.mjs', 'director-contract.test.mjs', 'artifact-contract.test.mjs', 'autoreview-contract.test.mjs', 'scorecard-preflight.test.mjs', 'gsc-preflight.test.mjs']) {
    await writeFile(join(dir, 'tests', name), "import test from 'node:test';\ntest('fixture suite', () => {});\n");
  }
  return dir;
}

test('known scorecard failure outranks an unrelated UNKNOWN and remains a REVERT', async (t) => {
  const dir = await temporary(t); const config = join(dir, 'scorecard.json'); const out = join(dir, 'out');
  await writeJson(config, { out, staticChecks: [
    { name: 'known required failure', cmd: 'false', class: 'eligibility' },
    { name: 'unavailable observation', cmd: 'exec sleep 2', timeoutSec: 1, class: 'eligibility' },
  ] });
  const baseline = await runNode(scorecard, ['--config', config, '--static-only']);
  assert.ok([2, 3].includes(baseline.status), baseline.stderr);
  const previous = join(dir, 'previous.json'); await writeFile(previous, await readFile(join(out, 'latest.json')));
  const compared = await runNode(scorecard, ['--config', config, '--static-only', '--compare', previous]);
  assert.equal(compared.status, 2, `${compared.stdout}\n${compared.stderr}`);
  const report = JSON.parse(await readFile(join(out, 'latest.json'), 'utf8'));
  assert.equal(report.status, 'FAIL');
  assert.equal(report.verdict, 'REVERT');
});

test('scorecard rejects a legacy comparison artifact without a contract fingerprint', async (t) => {
  const dir = await temporary(t); const config = join(dir, 'scorecard.json'); const previous = join(dir, 'legacy.json');
  await writeJson(config, { out: join(dir, 'out'), staticChecks: [{ name: 'same check', cmd: 'true', class: 'eligibility' }] });
  await writeJson(previous, { score: 100, checks: [{ group: 'static', name: 'same check', class: 'eligibility', guardrail: false }] });
  const result = await runNode(scorecard, ['--config', config, '--static-only', '--compare', previous]);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /legacy|fingerprint|contract|incomparable/i);
});

test('a non-200 live sample and a later 200 use one stable comparison plan with UNKNOWN downstream rows', async (t) => {
  const dir = await temporary(t); let healthy = false;
  const base = await server(t, (_request, response) => {
    response.writeHead(healthy ? 200 : 503, { 'content-type': 'text/html' });
    response.end('<html><head><link rel="canonical" href="/page"></head><body><h1>Page</h1>content</body></html>');
  });
  const out = join(dir, 'out'); const config = join(dir, 'scorecard.json');
  await writeJson(config, { base, out, samples: [{ path: '/page', template: 'page', expectedIndexable: true }] });
  const first = await runNode(scorecard, ['--config', config, '--live-only']);
  assert.equal(first.status, 2, `${first.stdout}\n${first.stderr}`);
  const baseline = join(dir, 'baseline.json'); await writeFile(baseline, await readFile(join(out, 'latest.json')));
  healthy = true;
  const compared = await runNode(scorecard, ['--config', config, '--live-only', '--compare', baseline]);
  assert.equal(compared.status, 0, `${compared.stdout}\n${compared.stderr}`);
  const firstReport = JSON.parse(await readFile(baseline, 'utf8'));
  assert.ok(firstReport.checks.some((check) => check.status === 'UNKNOWN'), 'unobserved downstream checks must be recorded as UNKNOWN');
});

test('maxRawKB and minTextCharacters run as diagnostic scorecard checks', async (t) => {
  const dir = await temporary(t);
  const base = await server(t, (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(`<html><head><link rel="canonical" href="/page"></head><body><h1>Page</h1>${'visible text '.repeat(80)}</body></html>`);
  });
  const out = join(dir, 'out'); const config = join(dir, 'thresholds.json');
  await writeJson(config, { base, out, samples: [{ path: '/page', template: 'page' }], thresholds: { page: { maxRawKB: 0.01, minTextCharacters: 99999 } } });
  const result = await runNode(scorecard, ['--config', config, '--live-only']);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const checks = JSON.parse(await readFile(join(out, 'latest.json'), 'utf8')).checks;
  for (const pattern of [/raw.*KB/i, /text characters\s*>=/i]) {
    const check = checks.find((item) => pattern.test(item.name));
    assert.equal(check?.class, 'diagnostic', `missing diagnostic ${pattern}`);
    assert.equal(check?.status, 'FAIL', `threshold miss must remain observable: ${pattern}`);
  }
});

test('nonpositive score weights are invalid before an artifact is written', async (t) => {
  const dir = await temporary(t); const out = join(dir, 'out'); const config = join(dir, 'zero-weight.json');
  await writeJson(config, { out, weights: { static: 0 }, staticChecks: [{ name: 'pass', cmd: 'true', class: 'eligibility' }] });
  const result = await runNode(scorecard, ['--config', config, '--static-only']);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /weight/i);
  assert.equal(existsSync(join(out, 'latest.json')), false);
});

test('nonfinite score weights are invalid before an artifact is written', async (t) => {
  const dir = await temporary(t); const out = join(dir, 'out'); const config = join(dir, 'nonfinite-weight.json');
  await writeJson(config, { out, weights: { static: 'not-a-number' }, staticChecks: [{ name: 'pass', cmd: 'true', class: 'eligibility' }] });
  const result = await runNode(scorecard, ['--config', config, '--static-only']);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /weight/i);
  assert.equal(existsSync(join(out, 'latest.json')), false);
});

for (const format of ['md', 'csv']) test(`GSC ${format} output retains Search Analytics completeness caveats`, async (t) => {
  const mocked = await gscFixture(t, [{ keys: ['https://fixture.example/page'], clicks: 1, impressions: 2, ctr: 0.5, position: 2 }]);
  const result = await runNode(gsc, ['performance', '--days', '1', '--limit', '10', `--${format}`], mocked);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /TOP_ROWS_ONLY/i);
  assert.match(result.stdout, /privacy/i);
  assert.match(result.stdout, /bulk export|BigQuery/i);
});

test('missing GSC URL files are invalid for inspect', async (t) => {
  const mocked = await gscFixture(t);
  const result = await runNode(gsc, ['inspect', '--urls', join(mocked.cwd, 'missing.txt')], mocked);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
});

test('missing GSC URL files are invalid for green', async (t) => {
  const mocked = await gscFixture(t);
  const result = await runNode(gsc, ['green', '--urls', join(mocked.cwd, 'missing.txt')], mocked);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
});

test('measure-page keeps malformed canonical evidence as invalid rather than crashing', async (t) => {
  const dir = await temporary(t); const page = join(dir, 'malformed-canonical.html');
  await writeFile(page, '<html><head><link rel="canonical" href="http://[not-a-host"></head><body><h1>Page</h1></body></html>');
  const result = await runNode(measurePage, [page, '--base', 'https://fixture.example']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.canonicalResolved, null);
  assert.ok(report.canonicalInvalid === true || report.canonical === null, 'report must label malformed canonical evidence');
});

test('Search Analytics clientTruncated reflects the actual returned row count', async (t) => {
  const mocked = await gscFixture(t, [{ keys: ['https://fixture.example/page'], clicks: 1, impressions: 2, ctr: 0.5, position: 2 }]);
  const result = await runNode(gsc, ['performance', '--days', '1', '--limit', '10'], mocked);
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout).summary;
  assert.equal(summary.clientTruncated, false, JSON.stringify(summary));
});

test('seo-gate treats a missing canonical suite as invalid invocation', async (t) => {
  const dir = await gateSandbox(t);
  await unlink(join(dir, 'tests', 'tooling.test.mjs'));
  const result = await runNode(join(dir, 'scripts', 'seo-gate.mjs'), [], { cwd: dir });
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /missing.*tooling|canonical.*suite/i);
});

test('seo-gate returns invalid-input exit 1 for corrupt config', async (t) => {
  const dir = await gateSandbox(t);
  await writeFile(join(dir, 'assets', 'scorecard.config.example.json'), '{not valid json');
  const result = await runNode(join(dir, 'scripts', 'seo-gate.mjs'), [], { cwd: dir });
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
});

test('seo-gate returns policy-failure exit 2 when a discovered suite fails', async (t) => {
  const dir = await gateSandbox(t);
  await writeFile(join(dir, 'tests', 'policy.test.mjs'), "import assert from 'node:assert/strict'; import test from 'node:test'; test('failing policy', () => assert.equal(1, 2));\n");
  const result = await runNode(join(dir, 'scripts', 'seo-gate.mjs'), [], { cwd: dir });
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
});

test('unknown score weight keys fail before checks execute or artifacts persist', async (t) => {
  const dir = await temporary(t); const out = join(dir, 'out'); const marker = join(dir, 'executed'); const config = join(dir, 'weight-key.json');
  await writeJson(config, { out, weights: { unexpected: 1 }, staticChecks: [{ name: 'must not execute', cmd: `touch "${marker}"`, class: 'eligibility' }] });
  const result = await runNode(scorecard, ['--config', config, '--static-only']);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /weight|unexpected|unknown/i);
  assert.equal(existsSync(marker), false, 'all configured weights must validate before checks run');
  assert.equal(existsSync(join(out, 'latest.json')), false);
});

test('template thresholds merge default values with template overrides', async (t) => {
  const dir = await temporary(t);
  const base = await server(t, (_request, response) => { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<html><head><link rel="canonical" href="/page"></head><body><h1>Page</h1>small text</body></html>'); });
  const out = join(dir, 'out'); const config = join(dir, 'threshold-merge.json');
  await writeJson(config, { base, out, samples: [{ path: '/page', template: 'page' }], thresholds: { default: { maxRawKB: 0.01, minTextCharacters: 9999 }, page: { maxRawKB: 999 } } });
  const result = await runNode(scorecard, ['--config', config, '--live-only']);
  assert.equal(result.status, 0, result.stderr);
  const checks = JSON.parse(await readFile(join(out, 'latest.json'), 'utf8')).checks;
  assert.equal(checks.find((check) => /raw.*KB/i.test(check.name))?.status, 'PASS');
  assert.equal(checks.find((check) => /text characters\s*>=/i.test(check.name))?.status, 'FAIL', 'template config must retain default minTextCharacters');
});

for (const [label, thresholds] of [
  ['zero', { default: { maxRawKB: 0 } }],
  ['negative', { default: { minTextCharacters: -1 } }],
  ['string', { default: { maxRawKB: '1' } }],
  ['unknown key', { default: { madeUpLimit: 1 } }],
]) test(`${label} scorecard threshold config is rejected before persistence`, async (t) => {
  const dir = await temporary(t); const out = join(dir, 'out'); const config = join(dir, 'bad-threshold.json');
  await writeJson(config, { out, samples: [{ path: '/page', template: 'page' }], thresholds, staticChecks: [{ name: 'pass', cmd: 'true' }] });
  const result = await runNode(scorecard, ['--config', config, '--static-only']);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /threshold/i);
  assert.equal(existsSync(join(out, 'latest.json')), false);
});

test('invalid fingerprint-matching compare artifact is rejected before commands or persistence', async (t) => {
  const dir = await temporary(t); const out = join(dir, 'out'); const marker = join(dir, 'marker'); const config = join(dir, 'compare.json');
  await writeJson(config, { out, staticChecks: [{ name: 'side-effect check', cmd: `touch "${marker}"`, class: 'eligibility' }] });
  const first = await runNode(scorecard, ['--config', config, '--static-only']);
  assert.equal(first.status, 0, first.stderr);
  const previous = JSON.parse(await readFile(join(out, 'latest.json'), 'utf8')); previous.status = 'INVALID';
  const prior = join(dir, 'invalid-prior.json'); await writeJson(prior, previous); await rm(marker, { force: true });
  const before = await readdir(out);
  const compared = await runNode(scorecard, ['--config', config, '--static-only', '--compare', prior]);
  assert.equal(compared.status, 1, `${compared.stdout}\n${compared.stderr}`);
  assert.equal(existsSync(marker), false, 'invalid prior must be rejected before configured commands execute');
  assert.deepEqual(await readdir(out), before, 'invalid prior must not write a new artifact');
});

for (const [baselineArgs, compareArgs, label] of [
  [['--static-only'], [], 'static-only to full'],
  [[], ['--live-only'], 'full to live-only'],
]) test(`scorecard comparison identity includes selected execution mode (${label})`, async (t) => {
  const dir = await temporary(t);
  const base = await server(t, (_request, response) => { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<html><head><link rel="canonical" href="/page"></head><body><h1>Page</h1>text</body></html>'); });
  const out = join(dir, 'out'); const config = join(dir, 'mode.json');
  await writeJson(config, { base, out, samples: [{ path: '/page', template: 'page' }], staticChecks: [{ name: 'pass', cmd: 'true' }] });
  const first = await runNode(scorecard, ['--config', config, ...baselineArgs]); assert.equal(first.status, 0, first.stderr);
  const prior = join(dir, 'prior.json'); await writeFile(prior, await readFile(join(out, 'latest.json')));
  const compared = await runNode(scorecard, ['--config', config, ...compareArgs, '--compare', prior]);
  assert.equal(compared.status, 1, `${compared.stdout}\n${compared.stderr}`);
  assert.match(`${compared.stdout}\n${compared.stderr}`, /mode|incomparable|contract/i);
});

for (const format of ['md', 'csv']) test(`GSC ${format} metadata precedes rows and includes complete Search Analytics caveats`, async (t) => {
  const mocked = await gscFixture(t, [{ keys: ['https://fixture.example/page'], clicks: 1, impressions: 2, ctr: 0.5, position: 2 }]);
  const result = await runNode(gsc, ['performance', '--days', '1', '--limit', '10', `--${format}`], mocked);
  assert.equal(result.status, 0, result.stderr);
  for (const text of ['TOP_ROWS_ONLY', 'privacy', 'bulk export', 'completeness unknown', 'clientTruncated']) assert.match(result.stdout, new RegExp(text, 'i'));
  assert.ok(result.stdout.indexOf('TOP_ROWS_ONLY') < result.stdout.indexOf('https://fixture.example/page'), 'metadata must precede tabular rows');
});

for (const command of ['funnel', 'opportunities', 'ctr-gaps', 'cannibalization', 'movers']) test(`GSC ${command} preserves Search Analytics completeness caveats`, async (t) => {
  const mocked = await gscFixture(t, [{ keys: ['https://fixture.example/page'], clicks: 1, impressions: 100, ctr: 0.01, position: 5 }]);
  const result = await runNode(gsc, [command, '--days', '1'], mocked);
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.stringify(JSON.parse(result.stdout).summary || {});
  assert.match(summary, /TOP_ROWS_ONLY/i);
  assert.match(summary, /privacy/i);
  assert.match(summary, /bulk export|BigQuery/i);
  assert.match(summary, /completeness unknown/i);
});

test('green rejects a missing URL file before making an API call', async (t) => {
  const mocked = await gscFixture(t);
  const result = await runNode(gsc, ['green', '--urls', join(mocked.cwd, 'missing.txt')], mocked);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.equal(existsSync(mocked.calls), false, 'invalid local URL input must not trigger token or API requests');
});

test('seo-gate treats child-process launch failure as invalid input', async (t) => {
  const dir = await gateSandbox(t); const copiedGate = join(dir, 'scripts', 'seo-gate.mjs');
  const source = await readFile(copiedGate, 'utf8');
  await writeFile(copiedGate, source.replace('const commands = [', "const commands = [['definitely-not-an-executable-for-seo-gate', []],"));
  const result = await runNode(copiedGate, [], { cwd: dir });
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
});
