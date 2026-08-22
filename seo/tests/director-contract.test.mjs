import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const tests = dirname(fileURLToPath(import.meta.url));
const root = join(tests, '..');
const scripts = join(root, 'scripts');
const scorecard = join(scripts, 'seo-scorecard.mjs');
const gsc = join(scripts, 'gsc.mjs');
const measurePage = join(scripts, 'measure-page.mjs');
const cacheGuard = join(scripts, 'check-revalidate-vs-main.sh');
const fetchAsGooglebot = join(scripts, 'fetch-as-googlebot.sh');

async function temporary(t) {
  const dir = await mkdtemp(join(os.tmpdir(), 'seo-director-contract-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

const runNode = (script, args, options = {}) => run(process.execPath, [...(options.nodeArgs || []), script, ...args], options);
const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);

async function git(command, cwd) {
  const result = await run('git', command, { cwd });
  assert.equal(result.status, 0, result.stderr);
}

async function server(t, responder) {
  const instance = http.createServer(responder);
  await new Promise((resolve) => instance.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => instance.close((error) => error ? reject(error) : resolve())));
  return `http://127.0.0.1:${instance.address().port}`;
}

async function closedOrigin() {
  const instance = http.createServer();
  await new Promise((resolve) => instance.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${instance.address().port}`;
  await new Promise((resolve, reject) => instance.close((error) => error ? reject(error) : resolve()));
  return origin;
}

async function gscFixture(t, dir, mode = 'empty') {
  const loader = join(dir, 'mock-fetch.mjs');
  const calls = join(dir, 'calls.txt');
  await writeFile(loader, `
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url) => {
  const target = String(url);
  if (target.includes('oauth2.googleapis.com/token')) return json({ access_token: 'fixture-token', expires_in: 3600 });
  appendFileSync(process.env.SEO_DIRECTOR_CALLS, target + '\\n');
  const count = existsSync(process.env.SEO_DIRECTOR_CALLS) ? readFileSync(process.env.SEO_DIRECTOR_CALLS, 'utf8').trim().split('\\n').length : 1;
  if (process.env.SEO_DIRECTOR_MODE === 'retry408' && count === 1) return json({ error: 'request timeout' }, 408);
  if (target.includes('/sitemaps')) return json({ sitemap: [] });
  if (target.includes('searchAnalytics/query')) return json({ rows: [] });
  if (target.includes('urlInspection')) return json({});
  if (target.includes('/sites')) return json({ siteEntry: [] });
  throw new Error('unexpected fixture request: ' + target);
};
`);
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
  return {
    nodeArgs: ['--import', loader],
    env: {
      GSC_CLIENT_EMAIL: 'fixture@example.invalid',
      GSC_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      GSC_SITE_URL: 'sc-domain:fixture.invalid',
      SEO_DIRECTOR_CALLS: calls,
      SEO_DIRECTOR_MODE: mode,
    },
    calls,
  };
}

test('scorecard uses the frozen 0/1/2/3 exit contract', async (t) => {
  const dir = await temporary(t);
  const empty = join(dir, 'empty.json');
  const failed = join(dir, 'failed.json');
  await writeJson(empty, { out: join(dir, 'empty-out'), staticChecks: [] });
  await writeJson(failed, { out: join(dir, 'failed-out'), staticChecks: [{ name: 'required failure', cmd: 'false', class: 'eligibility' }] });

  const noEvidence = await runNode(scorecard, ['--config', empty, '--static-only']);
  const requiredFailure = await runNode(scorecard, ['--config', failed, '--static-only']);

  assert.equal(noEvidence.status, 3, `zero required evidence is UNKNOWN/incomplete\n${noEvidence.stdout}\n${noEvidence.stderr}`);
  assert.equal(requiredFailure.status, 2, `a completed required FAIL uses exit 2\n${requiredFailure.stdout}\n${requiredFailure.stderr}`);
  const report = JSON.parse(await readFile(join(dir, 'failed-out', 'latest.json'), 'utf8'));
  assert.equal(report.status, 'FAIL');
  assert.equal(report.exitCode, 2);
  assert.ok(report.checks.every((check) => ['PASS', 'FAIL', 'UNKNOWN', 'N/A'].includes(check.status)));
});

test('scorecard separates unavailable evidence and diagnostics from required readiness', async (t) => {
  const dir = await temporary(t);
  const unavailableConfig = join(dir, 'unavailable.json');
  await writeJson(unavailableConfig, {
    base: await closedOrigin(),
    out: join(dir, 'unavailable-out'),
    timeoutSec: 1,
    samples: [{ path: '/page', template: 'page', expectedIndexable: true }],
  });
  const unavailable = await runNode(scorecard, ['--config', unavailableConfig, '--live-only']);
  assert.equal(unavailable.status, 3, `unavailable required evidence is UNKNOWN\n${unavailable.stdout}\n${unavailable.stderr}`);
  const unavailableReport = JSON.parse(await readFile(join(dir, 'unavailable-out', 'latest.json'), 'utf8'));
  assert.equal(unavailableReport.status, 'UNKNOWN');
  assert.ok(unavailableReport.checks.some((check) => check.status === 'UNKNOWN'));

  const diagnosticConfig = join(dir, 'diagnostic.json');
  await writeJson(diagnosticConfig, {
    out: join(dir, 'diagnostic-out'),
    staticChecks: [
      { name: 'required pass', cmd: 'true', class: 'eligibility' },
      { name: 'contextual diagnostic miss', cmd: 'false', class: 'diagnostic' },
    ],
  });
  const diagnostic = await runNode(scorecard, ['--config', diagnosticConfig, '--static-only']);
  assert.equal(diagnostic.status, 0, diagnostic.stderr);
  const diagnosticReport = JSON.parse(await readFile(join(dir, 'diagnostic-out', 'latest.json'), 'utf8'));
  assert.equal(diagnosticReport.status, 'PASS');
  assert.equal(diagnosticReport.requiredScore ?? diagnosticReport.score, 100, 'diagnostics must not lower the required readiness score');
  assert.equal(diagnosticReport.diagnosticScore, 0, 'diagnostics remain visible in a separate score');
});

test('scorecard resolves a relative canonical against the fetched URL', async (t) => {
  const dir = await temporary(t);
  const base = await server(t, (request, response) => {
    response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'max-age=60', etag: '"fixture"' });
    response.end('<!doctype html><html><head><link data-x=1 href="/Case/Canonical" rel="canonical"></head><body><main><h1>Page</h1>Useful content</main></body></html>');
  });
  const config = join(dir, 'relative-canonical.json');
  await writeJson(config, {
    base,
    out: join(dir, 'relative-out'),
    samples: [{ path: '/Case/Canonical', template: 'page', expectedIndexable: true }],
  });

  const result = await runNode(scorecard, ['--config', config, '--live-only']);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(await readFile(join(dir, 'relative-out', 'latest.json'), 'utf8'));
  assert.equal(report.status, 'PASS');
  assert.equal(report.checks.find((check) => /canonical self-reference/.test(check.name))?.status, 'PASS');
});

test('live scorecard evidence names its requested URL and comparison rejects a different base', async (t) => {
  const firstBase = await server(t, (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<html><head><link rel="canonical" href="/page"></head><body><h1>Page</h1></body></html>');
  });
  const secondBase = await server(t, (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<html><head><link rel="canonical" href="/page"></head><body><h1>Page</h1></body></html>');
  });
  const dir = await temporary(t); const out = join(dir, 'out'); const config = join(dir, 'scorecard.json');
  await writeJson(config, { base: firstBase, out, samples: [{ path: '/page', template: 'page', expectedIndexable: true }] });
  const first = await runNode(scorecard, ['--config', config, '--live-only']);
  assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
  const baseline = join(dir, 'baseline.json'); await writeFile(baseline, await readFile(join(out, 'latest.json')));
  const artifact = JSON.parse(await readFile(baseline, 'utf8'));
  for (const check of artifact.checks.filter((item) => item.group === 'live')) {
    assert.equal(check.evidenceLevel, 'E2');
    assert.equal(check.source, `${firstBase}/page`);
    assert.match(check.observedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/);
  }
  await writeJson(config, { base: secondBase, out, samples: [{ path: '/page', template: 'page', expectedIndexable: true }] });
  const compared = await runNode(scorecard, ['--config', config, '--live-only', '--compare', baseline]);
  assert.equal(compared.status, 1, `base drift must be incomparable\n${compared.stdout}\n${compared.stderr}`);
});

test('cache guard distinguishes missing evidence from a completed guardrail failure', async (t) => {
  const dir = await temporary(t);
  await mkdir(join(dir, 'src'));
  await writeFile(join(dir, 'src', 'page.tsx'), 'export const revalidate = 3600;\n');
  await git(['init', '-q'], dir);
  await git(['add', '.'], dir);
  await git(['-c', 'user.name=SEO test', '-c', 'user.email=seo@example.invalid', 'commit', '-qm', 'base'], dir);
  await writeFile(join(dir, 'src', 'page.tsx'), 'export const revalidate = 300;\n');

  const missing = await run('bash', [cacheGuard, 'does-not-exist', 'src'], { cwd: dir });
  const shortened = await run('bash', [cacheGuard, 'HEAD', 'src'], { cwd: dir });

  assert.equal(missing.status, 3, missing.stderr);
  assert.equal(shortened.status, 2, shortened.stdout);
});

test('GSC fail-closed commands return 3 when required evidence is UNKNOWN', async (t) => {
  const dir = await temporary(t);
  const urls = join(dir, 'urls.txt');
  await writeFile(urls, '');
  const mocked = await gscFixture(t, dir);

  const green = await runNode(gsc, ['green', '--urls', urls], { cwd: dir, ...mocked });
  assert.equal(green.status, 3, `green must fail closed on required UNKNOWN rows\n${green.stdout}\n${green.stderr}`);
  const rows = JSON.parse(green.stdout).rows;
  assert.ok(rows.some((row) => row.status === 'UNKNOWN'));
  assert.ok(rows.every((row) => ['PASS', 'FAIL', 'UNKNOWN', 'N/A'].includes(row.status)));

  const inspect = await runNode(gsc, ['inspect', '--urls', urls], { cwd: dir, ...mocked });
  assert.equal(inspect.status, 3, `empty inspection evidence must be incomplete\n${inspect.stdout}\n${inspect.stderr}`);
});

test('report-only empty GSC output labels completeness instead of implying exhaustive zero', async (t) => {
  const dir = await temporary(t);
  const mocked = await gscFixture(t, dir);
  const result = await runNode(gsc, ['sites'], { cwd: dir, ...mocked });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.rows, []);
  assert.match(output.summary?.completeness || '', /valid empty|unknown|top rows/i);
});

test('Search Analytics always discloses top-row/privacy limits and bulk-export path', async (t) => {
  const dir = await temporary(t);
  const mocked = await gscFixture(t, dir);
  const result = await runNode(gsc, ['performance', '--days', '1'], { cwd: dir, ...mocked });

  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.stringify(JSON.parse(result.stdout).summary || {});
  assert.match(summary, /TOP_ROWS_ONLY/i);
  assert.match(summary, /privacy/i);
  assert.match(summary, /bulk export|BigQuery/i);
});

test('unsupported GSC commands are invalid invocations, while help remains valid', async (t) => {
  const dir = await temporary(t);
  const unknown = await runNode(gsc, ['not-a-command'], { cwd: dir });
  const help = await runNode(gsc, ['help'], { cwd: dir });

  assert.equal(unknown.status, 1, `${unknown.stdout}\n${unknown.stderr}`);
  assert.equal(help.status, 0, help.stderr);
});

test('GSC retries HTTP 408 within the same bounded three-attempt policy', async (t) => {
  const dir = await temporary(t);
  const mocked = await gscFixture(t, dir, 'retry408');
  const result = await runNode(gsc, ['sites'], { cwd: dir, ...mocked });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const calls = (await readFile(mocked.calls, 'utf8')).trim().split('\n');
  assert.equal(calls.length, 2);
});

test('measure-page resolves canonical evidence and labels CJK segmentation diagnostic', async (t) => {
  const dir = await temporary(t);
  const page = join(dir, 'cjk.html');
  await writeFile(page, '<!doctype html><html><head><link href="/Case/Canonical" rel="canonical"></head><body><main>搜索可见性测试</main></body></html>');
  const result = await runNode(measurePage, [page, '--base', 'https://Fixture.Example/base']);

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.canonicalResolved, 'https://fixture.example/Case/Canonical');
  assert.ok(report.textSegments > 0);
  assert.match(report.textSegmentMetric || '', /diagnostic|heuristic/i);
});

test('the aggregate gate covers every suite, schema, fixtures, and public script syntax', async () => {
  const source = await readFile(join(scripts, 'seo-gate.mjs'), 'utf8');
  for (const name of ['tooling.test.mjs', 'skill-contract.test.mjs', 'seo.test.mjs', 'director-contract.test.mjs', 'artifact-contract.test.mjs', 'autoreview-contract.test.mjs', 'scorecard-preflight.test.mjs', 'gsc-preflight.test.mjs', 'report.schema.json']) {
    assert.match(source, new RegExp(name.replaceAll('.', '\\.')), `aggregate gate omits ${name}`);
  }
  for (const file of ['seo-scorecard.mjs', 'gsc.mjs', 'measure-page.mjs', 'seo-gate.mjs', 'check-revalidate-vs-main.sh', 'fetch-as-googlebot.sh']) {
    const mode = (await stat(join(scripts, file))).mode;
    assert.notEqual(mode & 0o111, 0, `${file} must remain directly executable`);
  }
});

test('the shipped example config is rejected until its placeholders are replaced', async () => {
  const example = join(root, 'assets', 'scorecard.config.example.json');
  const result = await runNode(scorecard, ['--config', example, '--static-only']);

  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /example|placeholder|replace/i);
});

test('attribute-only charset and favicon tags do not crash HTML evidence extraction', async (t) => {
  const dir = await temporary(t);
  const page = join(dir, 'metadata.html');
  await writeFile(page, '<html><head><meta charset=utf-8><link href=/favicon.ico><meta content=noindex name=robots><link href=/Case/Canonical rel=canonical></head><body><h1><span>Real Heading</span></h1></body></html>');
  const measured = await runNode(measurePage, [page, '--base', 'https://fixture.example']);
  assert.equal(measured.status, 0, measured.stderr);
  const report = JSON.parse(measured.stdout);
  assert.equal(report.robots, 'noindex');
  assert.equal(report.canonical, '/Case/Canonical');

  const base = await server(t, (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'max-age=60', etag: '"fixture"' });
    response.end('<html><head><meta charset=utf-8><link href=/favicon.ico><meta content=index name=robots><link href=/page rel=canonical></head><body><h1>Page</h1></body></html>');
  });
  const config = join(dir, 'scorecard.json');
  await writeJson(config, { base, out: join(dir, 'out'), samples: [{ path: '/page', template: 'page' }] });
  const scored = await runNode(scorecard, ['--config', config, '--live-only']);
  assert.equal(scored.status, 0, `${scored.stdout}\n${scored.stderr}`);
});

test('scorecard compare rejects a baseline when same-named command or weights change', async (t) => {
  const dir = await temporary(t);
  const baseline = join(dir, 'baseline.json');
  const config = join(dir, 'scorecard.json');
  const out = join(dir, 'out');
  await writeJson(config, { out, weights: { static: 1 }, staticChecks: [{ name: 'same name', cmd: 'true', class: 'eligibility' }] });
  const first = await runNode(scorecard, ['--config', config, '--static-only']);
  assert.equal(first.status, 0, first.stderr);
  await writeFile(baseline, await readFile(join(out, 'latest.json')));
  await writeJson(config, { out, weights: { static: 2 }, staticChecks: [{ name: 'same name', cmd: 'printf changed', class: 'eligibility' }] });
  const compared = await runNode(scorecard, ['--config', config, '--static-only', '--compare', baseline]);
  assert.equal(compared.status, 1, `${compared.stdout}\n${compared.stderr}`);
  assert.match(`${compared.stdout}\n${compared.stderr}`, /incomparable|contract|weight|command/i);
});

test('cache guard detects a removed short value and a renamed cache-window regression', async (t) => {
  const dir = await temporary(t);
  await mkdir(join(dir, 'src'));
  const original = join(dir, 'src', 'page.tsx');
  await writeFile(original, 'export const revalidate = 60;\nconst upstream = { revalidate: 3600 };\n');
  await git(['init', '-q'], dir); await git(['add', '.'], dir); await git(['-c', 'user.name=SEO test', '-c', 'user.email=seo@example.invalid', 'commit', '-qm', 'base'], dir);
  await writeFile(original, 'export const revalidate = 300;\n');
  const removedValue = await run('bash', [cacheGuard, 'HEAD', 'src'], { cwd: dir });
  assert.notEqual(removedValue.status, 0, removedValue.stdout);
  assert.ok([2, 3].includes(removedValue.status));

  await git(['restore', '--source', 'HEAD', '--', 'src/page.tsx'], dir);
  await run('git', ['mv', 'src/page.tsx', 'src/renamed.tsx'], { cwd: dir });
  await writeFile(join(dir, 'src', 'renamed.tsx'), 'export const revalidate = 300;\n');
  const renamed = await run('bash', [cacheGuard, 'HEAD', 'src'], { cwd: dir });
  assert.notEqual(renamed.status, 0, renamed.stdout);
  assert.ok([2, 3].includes(renamed.status));
});

test('cache guard does not silently pass a renamed file with a shorter cache window', async (t) => {
  const dir = await temporary(t); await mkdir(join(dir, 'src'));
  await writeFile(join(dir, 'src', 'page.tsx'), 'export const revalidate = 3600;\n');
  await git(['init', '-q'], dir); await git(['add', '.'], dir); await git(['-c', 'user.name=SEO test', '-c', 'user.email=seo@example.invalid', 'commit', '-qm', 'base'], dir);
  await git(['mv', 'src/page.tsx', 'src/renamed.tsx'], dir); await writeFile(join(dir, 'src', 'renamed.tsx'), 'export const revalidate = 300;\n');
  const result = await run('bash', [cacheGuard, 'HEAD', 'src'], { cwd: dir });
  assert.notEqual(result.status, 0, result.stdout);
  assert.ok([2, 3].includes(result.status));
});

test('an unrelated larger cache window cannot mask a shortened renamed declaration', async (t) => {
  const dir = await temporary(t); await mkdir(join(dir, 'src'));
  await writeFile(join(dir, 'src', 'page.tsx'), 'export const revalidate = 3600;\n');
  await writeFile(join(dir, 'src', 'unrelated.tsx'), 'export const revalidate = 86400;\n');
  await git(['init', '-q'], dir); await git(['add', '.'], dir); await git(['-c', 'user.name=SEO test', '-c', 'user.email=seo@example.invalid', 'commit', '-qm', 'base'], dir);
  await git(['mv', 'src/page.tsx', 'src/renamed.tsx'], dir);
  await writeFile(join(dir, 'src', 'renamed.tsx'), 'export const revalidate = 300;\n');
  const result = await run('bash', [cacheGuard, 'HEAD', 'src'], { cwd: dir });
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /SHORTENED|REMOVED|rename/i);
});

test('GSC green marks all inspection-derived rows UNKNOWN when inspection requests fail', async (t) => {
  const dir = await temporary(t); const urls = join(dir, 'urls.txt'); await writeFile(urls, 'https://fixture.example/page\n');
  const loader = join(dir, 'inspection-failure.mjs');
  await writeFile(loader, `
const json = (value) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url) => { const target = String(url); if (target.includes('oauth2')) return json({ access_token: 'token', expires_in: 3600 }); if (target.includes('/sitemaps')) return json({ sitemap: [] }); if (target.includes('searchAnalytics/query')) return json({ rows: [] }); if (target.includes('urlInspection')) throw new Error('fixture inspection outage'); return json({ siteEntry: [] }); };
`);
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
  const result = await runNode(gsc, ['green', '--urls', urls], { cwd: dir, nodeArgs: ['--import', loader], env: { GSC_CLIENT_EMAIL: 'fixture@example.invalid', GSC_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }), GSC_SITE_URL: 'sc-domain:fixture.invalid' } });
  assert.equal(result.status, 3, `${result.stdout}\n${result.stderr}`);
  const rows = JSON.parse(result.stdout).rows.filter((row) => ['Indexing (sample)', 'Canonical agreement (sample)', 'Rich results (sample)'].includes(row.report));
  assert.deepEqual(rows.map((row) => row.status), ['UNKNOWN', 'UNKNOWN', 'UNKNOWN']);
});

test('a timed-out required static check is UNKNOWN rather than a completed FAIL', async (t) => {
  const dir = await temporary(t); const config = join(dir, 'timeout.json');
  await writeJson(config, { out: join(dir, 'out'), staticChecks: [{ name: 'timed operation', cmd: 'sleep 2', timeoutSec: 1, class: 'eligibility' }] });
  const result = await runNode(scorecard, ['--config', config, '--static-only']);
  assert.equal(result.status, 3, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(await readFile(join(dir, 'out', 'latest.json'), 'utf8'));
  assert.equal(report.checks[0].status, 'UNKNOWN');
});

test('missing GSC URL input is invalid local invocation, not unavailable external evidence', async (t) => {
  const dir = await temporary(t);
  const result = await runNode(gsc, ['inspect', '--urls', join(dir, 'missing.txt')], { cwd: dir });
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
});

test('measure-page returns nested H1 text rather than opening-tag markup', async (t) => {
  const dir = await temporary(t); const page = join(dir, 'heading.html');
  await writeFile(page, '<html><body><h1><span>Real Heading</span></h1></body></html>');
  const result = await runNode(measurePage, [page]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).h1, ['Real Heading']);
});

test('fetch-as-googlebot keeps collision-resistant evidence for distinct normalized paths', async (t) => {
  const dir = await temporary(t); const out = join(dir, 'evidence');
  const base = await server(t, (request, response) => { response.writeHead(200, { 'content-type': 'text/plain' }); response.end(request.url === '/a/b' ? 'slash path' : 'underscore path'); });
  const result = await run('bash', [fetchAsGooglebot, base, out, '/a/b', '/a_b']);
  assert.equal(result.status, 0, result.stderr);
  const files = await readdir(out); const bodies = await Promise.all(files.filter((file) => file.endsWith('.html')).map((file) => readFile(join(out, file), 'utf8')));
  assert.equal(files.filter((file) => file.endsWith('.status')).length, 2);
  assert.deepEqual(new Set(bodies), new Set(['slash path', 'underscore path']));
});

test('failed refetch removes stale status and body evidence for that path', async (t) => {
  const dir = await temporary(t); const out = join(dir, 'evidence'); let fail = false;
  const base = await server(t, (_request, response) => { response.writeHead(fail ? 503 : 200, { 'content-type': 'text/plain' }); response.end(fail ? 'unavailable' : 'first success'); });
  const first = await run('bash', [fetchAsGooglebot, base, out, '/same']); assert.equal(first.status, 0, first.stderr);
  fail = true; const second = await run('bash', [fetchAsGooglebot, base, out, '/same']); assert.notEqual(second.status, 0);
  const files = await readdir(out); assert.equal(files.filter((file) => /\.(status|html|headers)$/.test(file)).length, 0, `stale evidence remains: ${files.join(', ')}`);
});
