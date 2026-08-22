import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const scorecard = join(here, '..', 'scripts', 'seo-scorecard.mjs');
const measurePage = join(here, '..', 'scripts', 'measure-page.mjs');
const gsc = join(here, '..', 'scripts', 'gsc.mjs');
const revalidate = join(here, '..', 'scripts', 'check-revalidate-vs-main.sh');

async function tempDir(t) {
  const dir = await mkdtemp(join(os.tmpdir(), 'seo-tooling-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

function runNode(script, args, options = {}) {
  return run(process.execPath, [...(options.nodeArgs || []), script, ...args], options);
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function startServer(t, responder) {
  const server = http.createServer(responder);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  return `http://127.0.0.1:${server.address().port}`;
}

async function gscMock(t, dir) {
  const mock = join(dir, 'mock-fetch.mjs');
  await writeFile(mock, `
import { appendFileSync } from 'node:fs';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url) => {
  const target = String(url);
  if (target.includes('oauth2.googleapis.com/token')) return json({ access_token: 'local-test-token', expires_in: 3600 });
  if (target.includes('/sitemaps')) return json(JSON.parse(process.env.SEO_TEST_SITEMAPS || '[]'));
  if (target.includes('searchAnalytics/query')) return json(JSON.parse(process.env.SEO_TEST_PERFORMANCE || '{"rows":[]}'));
  if (target.includes('/sites')) {
    const calls = process.env.SEO_TEST_CALLS;
    if (calls) appendFileSync(calls, 'api\\n');
    if (process.env.SEO_TEST_RETRY === 'transient') {
      const count = calls ? (await import('node:fs')).readFileSync(calls, 'utf8').trim().split('\\n').filter(Boolean).length : 1;
      if (count === 1) return json({ error: 'rate limited' }, 429);
      if (count === 2) return json({ error: 'server error' }, 500);
    }
    if (process.env.SEO_TEST_RETRY === 'permanent') return json({ error: 'bad request' }, 400);
    return json({ siteEntry: [] });
  }
  throw new Error('unexpected local GSC fixture request: ' + target);
};
`);
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
  return {
    nodeArgs: ['--import', mock],
    env: {
      GSC_CLIENT_EMAIL: 'local-test@example.invalid',
      GSC_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      GSC_SITE_URL: 'sc-domain:fixture.invalid',
    },
  };
}

test('live scorecard fails a noindex sample even when no sitemap is configured', async (t) => {
  const dir = await tempDir(t);
  const base = await startServer(t, (request, response) => {
    const origin = `http://${request.headers.host}`;
    response.writeHead(200, { 'cache-control': 'max-age=60', etag: '"fixture"', 'content-type': 'text/html' });
    response.end(`<!doctype html><html><head><link rel="canonical" href="${origin}/Indexable"><meta name="robots" content="noindex"></head><body><h1>Indexable</h1></body></html>`);
  });
  const config = join(dir, 'scorecard.json');
  await writeJson(config, { base, out: join(dir, 'out'), samples: [{ path: '/Indexable', template: 'page' }] });

  const result = await runNode(scorecard, ['--config', config, '--live-only']);

  assert.notEqual(result.status, 0, `a live noindex page must fail closed\n${result.stdout}\n${result.stderr}`);
});

test('scorecard ordinary failed checks exit nonzero instead of emitting a passing process status', async (t) => {
  const dir = await tempDir(t);
  const config = join(dir, 'scorecard.json');
  await writeJson(config, { out: join(dir, 'out'), staticChecks: [{ name: 'ordinary failure', cmd: 'exit 9' }] });

  const result = await runNode(scorecard, ['--config', config, '--static-only']);

  assert.notEqual(result.status, 0, `ordinary failed checks must fail the scorecard process\n${result.stdout}\n${result.stderr}`);
});

test('scorecard zero-check configurations fail closed', async (t) => {
  const dir = await tempDir(t);
  const config = join(dir, 'scorecard.json');
  await writeJson(config, { out: join(dir, 'out'), staticChecks: [] });

  const result = await runNode(scorecard, ['--config', config, '--static-only']);

  assert.notEqual(result.status, 0, `a scorecard with no evidence must not report success\n${result.stdout}\n${result.stderr}`);
});

test('compared scorecard artifacts persist their verdict and delta', async (t) => {
  const dir = await tempDir(t);
  const out = join(dir, 'out');
  const previous = join(dir, 'previous.json');
  const config = join(dir, 'scorecard.json');
  const sentinel = join(dir, 'ready');
  await writeJson(config, { out, staticChecks: [{ name: 'contract check', cmd: `test -f "${sentinel}"` }] });

  const baseline = await runNode(scorecard, ['--config', config, '--static-only']);
  assert.equal(baseline.status, 2, baseline.stderr);
  await writeFile(previous, await readFile(join(out, 'latest.json')));
  await writeFile(sentinel, 'ready\n');

  const result = await runNode(scorecard, ['--config', config, '--static-only', '--compare', previous]);
  assert.equal(result.status, 0, result.stderr);
  const artifact = JSON.parse(await readFile(join(out, 'latest.json'), 'utf8'));

  assert.equal(artifact.delta, 100, 'the persisted artifact must retain the compare delta');
  assert.equal(artifact.verdict, 'KEEP', 'the persisted artifact must retain the finite compare verdict');
  assert.match(artifact.verdictDetail || '', /^KEEP \(\+100\)$/, 'the persisted artifact must retain the dynamic compare explanation');
});

test('scorecard rejects comparisons whose check contracts are not comparable', async (t) => {
  const dir = await tempDir(t);
  const previous = join(dir, 'previous.json');
  const config = join(dir, 'scorecard.json');
  await writeJson(previous, { score: 100, checks: [{ group: 'static', name: 'old check', guardrail: false }] });
  await writeJson(config, { out: join(dir, 'out'), staticChecks: [{ name: 'replacement check', cmd: 'true' }] });

  const result = await runNode(scorecard, ['--config', config, '--static-only', '--compare', previous]);

  assert.notEqual(result.status, 0, `different checks must be incomparable, not a score comparison\n${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /incomparable|contract|check set/i);
});

test('check-revalidate fails closed when its declared git base ref is missing', async (t) => {
  const dir = await tempDir(t);
  await writeFile(join(dir, 'package.json'), '{"name":"fixture"}\n');
  await (await import('node:fs/promises')).mkdir(join(dir, 'src'));
  await writeFile(join(dir, 'src', 'page.tsx'), 'export const revalidate = 600;\n');
  await execFileAsync('git', ['init', '-q'], { cwd: dir });

  const result = await run('bash', [revalidate, 'refs/heads/does-not-exist', 'src'], { cwd: dir });

  assert.notEqual(result.status, 0, `a missing comparison ref must not silently pass\n${result.stdout}\n${result.stderr}`);
});

test('check-revalidate detects a shortened non-minimum revalidate window', async (t) => {
  const dir = await tempDir(t);
  await (await import('node:fs/promises')).mkdir(join(dir, 'src'));
  const file = join(dir, 'src', 'page.tsx');
  await writeFile(file, "export const revalidate = 60;\nconst upstream = { revalidate: 3600 };\n");
  await execFileAsync('git', ['init', '-q'], { cwd: dir });
  await execFileAsync('git', ['add', '.'], { cwd: dir });
  await execFileAsync('git', ['-c', 'user.name=SEO test', '-c', 'user.email=seo-test@example.invalid', 'commit', '-qm', 'base'], { cwd: dir });
  await writeFile(file, "export const revalidate = 60;\nconst upstream = { revalidate: 300 };\n");

  const result = await run('bash', [revalidate, 'HEAD', 'src'], { cwd: dir });

  assert.notEqual(result.status, 0, `shortening 3600 to 300 must be caught even though 60 remains the minimum\n${result.stdout}\n${result.stderr}`);
});

test('measure-page accepts flexible HTML attributes, base-derived internal links, case-sensitive paths, and character counts', async (t) => {
  const dir = await tempDir(t);
  const page = join(dir, 'page.html');
  const base = 'https://fixture.example';
  await writeFile(page, `<!doctype html><html><head>
    <title data-kind=fixture>Fixture title</title>
    <link data-x=1 HREF='/CaseSensitive/Canonical' REL=canonical>
    <meta CONTENT=noindex NAME=robots>
  </head><body><main>你好世界 mixed text
    <a HREF=/Relative/Path>relative</a>
    <a href='${base}/CaseSensitive/Path'>fixture</a>
    <a href="https://sportplan.es/not-internal">outside</a>
  </main></body></html>`);

  const result = await runNode(measurePage, [page, '--base', base]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);

  assert.equal(report.canonical, '/CaseSensitive/Canonical');
  assert.equal(report.internalLinks, 2, 'only relative and supplied-base links are internal');
  assert.deepEqual(report.internalUrls, ['/Relative/Path', `${base}/CaseSensitive/Path`]);
  assert.equal(report.visibleTextChars, '你好世界 mixed text relative fixture outside'.length);
});

test('GSC green board leaves empty performance evidence UNKNOWN', async (t) => {
  const dir = await tempDir(t);
  const mocked = await gscMock(t, dir);
  const result = await runNode(gsc, ['green'], { cwd: dir, ...mocked, env: { ...mocked.env, SEO_TEST_SITEMAPS: JSON.stringify({ sitemap: [] }) } });
  assert.equal(result.status, 3, 'required empty performance evidence must use the frozen incomplete/UNKNOWN exit');
  const board = JSON.parse(result.stdout).rows;

  assert.equal(board.find((row) => row.report === 'Performance continuity')?.status, 'UNKNOWN');
});

test('GSC green board leaves an empty URL-inspection sample UNKNOWN', async (t) => {
  const dir = await tempDir(t);
  const urls = join(dir, 'urls.txt');
  await writeFile(urls, '');
  const mocked = await gscMock(t, dir);
  const result = await runNode(gsc, ['green', '--urls', urls], { cwd: dir, ...mocked, env: { ...mocked.env, SEO_TEST_SITEMAPS: JSON.stringify({ sitemap: [] }) } });
  assert.equal(result.status, 3, 'an empty inspection sample is required UNKNOWN evidence');
  const board = JSON.parse(result.stdout).rows;

  for (const report of ['Indexing (sample)', 'Canonical agreement (sample)', 'Rich results (sample)']) assert.equal(board.find((row) => row.report === report)?.status, 'UNKNOWN', `${report} needs actual inspection evidence`);
});

test('GSC green board never marks warning or never-downloaded sitemaps GREEN', async (t) => {
  const dir = await tempDir(t);
  const mocked = await gscMock(t, dir);
  const sitemaps = { sitemap: [{ path: 'https://fixture.example/sitemap.xml', errors: 0, warnings: 1, lastDownloaded: undefined }] };
  const result = await runNode(gsc, ['green'], { cwd: dir, ...mocked, env: { ...mocked.env, SEO_TEST_SITEMAPS: JSON.stringify(sitemaps) } });
  assert.equal(result.status, 2, 'warning or never-downloaded sitemap evidence is an observed required FAIL');
  const board = JSON.parse(result.stdout).rows;

  assert.notEqual(board.find((row) => row.report === 'Sitemaps')?.status, 'GREEN');
});

test('GSC retries bounded transient 429 and 5xx responses before succeeding', async (t) => {
  const dir = await tempDir(t);
  const calls = join(dir, 'calls.txt');
  const mocked = await gscMock(t, dir);
  const result = await runNode(gsc, ['sites'], { cwd: dir, ...mocked, env: { ...mocked.env, SEO_TEST_RETRY: 'transient', SEO_TEST_CALLS: calls } });

  assert.equal(result.status, 0, `429/5xx responses should be retried within a bounded policy\n${result.stdout}\n${result.stderr}`);
  assert.equal((await readFile(calls, 'utf8')).trim().split('\n').length, 3, 'retry policy should stop after the successful third API attempt');
});

test('GSC does not retry permanent 4xx responses', async (t) => {
  const dir = await tempDir(t);
  const calls = join(dir, 'calls.txt');
  const mocked = await gscMock(t, dir);
  const result = await runNode(gsc, ['sites'], { cwd: dir, ...mocked, env: { ...mocked.env, SEO_TEST_RETRY: 'permanent', SEO_TEST_CALLS: calls } });

  assert.notEqual(result.status, 0);
  assert.equal((await readFile(calls, 'utf8')).trim().split('\n').length, 1, 'permanent client failures must fail immediately');
});
