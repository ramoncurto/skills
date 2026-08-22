import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const scorecard = join(here, '..', 'scripts', 'seo-scorecard.mjs');

async function temporary(t) {
  const dir = await mkdtemp(join(os.tmpdir(), 'seo-scorecard-preflight-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scorecard, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function localServer(t, responder) {
  const instance = http.createServer(responder);
  await new Promise((resolve) => instance.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => instance.close((error) => error ? reject(error) : resolve())));
  return `http://127.0.0.1:${instance.address().port}`;
}

const html = '<!doctype html><html><head><link rel="canonical" href="/page"></head><body><h1>Page</h1>Visible copy</body></html>';
const noArtifact = (out) => assert.equal(existsSync(join(out, 'latest.json')), false, 'invalid preflight must not write latest.json');

test('full mode rejects missing or invalid bases before any work or artifact', async (t) => {
  const dir = await temporary(t);
  const cases = [
    ['samples without a base', { samples: [{ path: '/page', template: 'page' }] }],
    ['sitemap without a base', { sitemapIndex: '/sitemap.xml' }],
    ['host-only base', { base: 'example.test', samples: [{ path: '/page' }] }],
    ['relative base', { base: '/preview', samples: [{ path: '/page' }] }],
    ['non-http base', { base: 'ftp://example.test', samples: [{ path: '/page' }] }],
  ];
  for (const [label, config] of cases) {
    const out = join(dir, label.replaceAll(/[^a-z]+/gi, '-'));
    const file = join(dir, `${label.replaceAll(/[^a-z]+/gi, '-')}.json`);
    await writeJson(file, { out, ...config });
    const result = await run(['--config', file]);
    assert.equal(result.status, 1, `${label}: ${result.stdout}\n${result.stderr}`);
    noArtifact(out);
  }
});

test('every static and live declaration is validated before requests, commands, or artifacts', async (t) => {
  const dir = await temporary(t); let requests = 0;
  const base = await localServer(t, (_request, response) => { requests += 1; response.writeHead(200, { 'content-type': 'text/html' }); response.end(html); });
  const marker = join(dir, 'static-command-ran'); const out = join(dir, 'out'); const config = join(dir, 'invalid-static.json');
  await writeJson(config, {
    base, out, samples: [{ path: '/page', template: 'page', expectedIndexable: true }],
    staticChecks: [{ name: 'bad class must not run', cmd: `touch "${marker}"`, class: 'not-a-class' }],
  });
  const result = await run(['--config', config]);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.equal(requests, 0, 'invalid static config must stop the live network phase too');
  assert.equal(existsSync(marker), false, 'invalid static declaration must stop command execution');
  noArtifact(out);

  const invalidDeclarations = [
    ['unknown config key', { unexpected: true }],
    ['static name', { staticChecks: [{ name: '', cmd: 'true' }] }],
    ['static command', { staticChecks: [{ name: 'missing command', cmd: '' }] }],
    ['static unknown key', { staticChecks: [{ name: 'bad key', cmd: 'true', unexpected: true }] }],
    ['static guardrail', { staticChecks: [{ name: 'bad guardrail', cmd: 'true', guardrail: 'yes' }] }],
    ['static class guardrail mismatch', { staticChecks: [{ name: 'mismatch', cmd: 'true', class: 'guardrail', guardrail: false }] }],
    ['static eligibility guardrail mismatch', { staticChecks: [{ name: 'mismatch', cmd: 'true', class: 'eligibility', guardrail: true }] }],
    ['static duplicate names', { staticChecks: [{ name: 'duplicate', cmd: 'true' }, { name: 'duplicate', cmd: 'true' }] }],
    ['static timeout', { staticChecks: [{ name: 'bad timeout', cmd: 'true', timeoutSec: 0 }] }],
    ['static fractional timeout', { staticChecks: [{ name: 'fractional timeout', cmd: 'true', timeoutSec: 1.5 }] }],
    ['sample shape', { samples: [null] }],
    ['sample path', { samples: [{ path: 'relative' }] }],
    ['sample unsafe path', { samples: [{ path: '/../escape' }] }],
    ['sample whitespace path', { samples: [{ path: '/white space' }] }],
    ['sample unknown key', { samples: [{ path: '/page', unexpected: true }] }],
    ['sample note is not an allowed key', { samples: [{ path: '/page', $note: 'not permitted' }] }],
    ['sample template', { samples: [{ path: '/page', template: 7 }] }],
    ['sample expectedIndexable', { samples: [{ path: '/page', expectedIndexable: 'yes' }] }],
    ['sample duplicate normalized paths', { samples: [{ path: '/page' }, { path: '/page' }] }],
    ['sitemap path', { sitemapIndex: 'sitemap.xml' }],
    ['sitemap unknown key', { sitemapIndex: '/sitemap.xml', unexpectedSitemapKey: true }],
    ['sitemap max without sitemap', { maxSitemapFiles: 1 }],
    ['sitemap count zero', { sitemapIndex: '/sitemap.xml', maxSitemapFiles: 0 }],
    ['sitemap count fractional', { sitemapIndex: '/sitemap.xml', maxSitemapFiles: 1.5 }],
    ['sitemap count unbounded', { sitemapIndex: '/sitemap.xml', maxSitemapFiles: 101 }],
    ['unsupported jsonld config', { jsonld: {} }],
    ['unsupported hreflang config', { hreflangSample: '/page' }],
    ['invalid numeric version', { version: 0 }],
    ['invalid schema version', { schemaVersion: {} }],
  ];
  for (const [label, invalid] of invalidDeclarations) {
    const invalidOut = join(dir, `out-${label.replaceAll(/[^a-z]+/gi, '-')}`);
    const invalidFile = join(dir, `${label.replaceAll(/[^a-z]+/gi, '-')}.json`);
    await writeJson(invalidFile, { base, out: invalidOut, ...invalid });
    const checked = await run(['--config', invalidFile, '--static-only']);
    assert.equal(checked.status, 1, `${label}: ${checked.stdout}\n${checked.stderr}`);
    noArtifact(invalidOut);
  }
});

for (const httpStatus of [404, 429, 503]) test(`observed sitemap HTTP ${httpStatus} is a completed FAIL while downstream evidence is UNKNOWN`, async (t) => {
  const dir = await temporary(t);
  const base = await localServer(t, (request, response) => {
    if (request.url === '/sitemap.xml') { response.writeHead(httpStatus, { 'content-type': 'text/plain' }); response.end('unavailable'); return; }
    response.writeHead(200, { 'content-type': 'text/html' }); response.end(html);
  });
  const out = join(dir, 'out'); const config = join(dir, 'scorecard.json');
  await writeJson(config, { base, out, sitemapIndex: '/sitemap.xml', samples: [{ path: '/page', template: 'page', expectedIndexable: true }] });
  const result = await run(['--config', config, '--live-only']);
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(await readFile(join(out, 'latest.json'), 'utf8'));
  const check = (name) => report.checks.find((item) => item.name === name);
  assert.equal(check('sitemaps fetchable')?.status, 'FAIL');
  assert.equal(check('sitemaps fetchable')?.evidenceLevel, 'E2');
  const status = (name) => check(name)?.status;
  assert.equal(status('sitemap index parses'), 'UNKNOWN');
  assert.equal(status('[page] /page expected indexable URL is in sitemap'), 'UNKNOWN');
});

test('sitemap transport failure is UNKNOWN and always emits both planned sitemap rows', async (t) => {
  const dir = await temporary(t);
  const base = await localServer(t, (request, response) => {
    if (request.url === '/sitemap.xml') { response.destroy(); return; }
    response.writeHead(200, { 'content-type': 'text/html' }); response.end(html);
  });
  const out = join(dir, 'out'); const config = join(dir, 'scorecard.json');
  await writeJson(config, { base, out, sitemapIndex: '/sitemap.xml', samples: [{ path: '/page', template: 'page', expectedIndexable: true }] });
  const result = await run(['--config', config, '--live-only']);
  assert.equal(result.status, 3, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(await readFile(join(out, 'latest.json'), 'utf8'));
  const check = (name) => report.checks.find((item) => item.name === name);
  assert.equal(check('sitemaps fetchable')?.status, 'UNKNOWN');
  assert.equal(check('sitemaps fetchable')?.evidenceLevel, 'E2');
  assert.equal(check('sitemap index parses')?.status, 'UNKNOWN');
  assert.equal(check('[page] /page expected indexable URL is in sitemap')?.status, 'UNKNOWN');
});

for (const location of ['child.xml', 'https://not-the-scorecard-origin.invalid/child.xml', 'http://[broken']) test(`invalid sitemap child location ${JSON.stringify(location)} is a parse FAIL and is never resolved`, async (t) => {
  const dir = await temporary(t);
  const base = await localServer(t, (request, response) => {
    if (request.url === '/sitemap.xml') { response.writeHead(200, { 'content-type': 'application/xml' }); response.end(`<urlset><url><loc>${location}</loc></url></urlset>`); return; }
    response.writeHead(200, { 'content-type': 'text/html' }); response.end(html);
  });
  const out = join(dir, 'out'); const config = join(dir, 'scorecard.json');
  await writeJson(config, { base, out, sitemapIndex: '/sitemap.xml', samples: [{ path: '/page', template: 'page', expectedIndexable: true }] });
  const result = await run(['--config', config, '--live-only']);
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(await readFile(join(out, 'latest.json'), 'utf8'));
  const check = (name) => report.checks.find((item) => item.name === name);
  assert.equal(check('sitemaps fetchable')?.status, 'PASS');
  assert.equal(check('sitemap index parses')?.status, 'FAIL');
  assert.equal(check('sitemap index parses')?.class, 'eligibility');
  assert.equal(check('sitemap index parses')?.evidenceLevel, 'E2');
  assert.equal(check('[page] /page expected indexable URL is in sitemap')?.status, 'UNKNOWN');
});

for (const location of ['ftp://fixture.invalid/page', 'data:text/plain,sitemap']) test(`non-HTTP sitemap URL ${JSON.stringify(location)} is a parse FAIL and never becomes membership evidence`, async (t) => {
  const dir = await temporary(t);
  const base = await localServer(t, (request, response) => {
    if (request.url === '/sitemap.xml') { response.writeHead(200, { 'content-type': 'application/xml' }); response.end(`<urlset><url><loc>${location}</loc></url></urlset>`); return; }
    response.writeHead(200, { 'content-type': 'text/html' }); response.end(html);
  });
  const out = join(dir, 'out'); const config = join(dir, 'scorecard.json');
  await writeJson(config, { base, out, sitemapIndex: '/sitemap.xml', samples: [{ path: '/page', template: 'page', expectedIndexable: true }] });
  const result = await run(['--config', config, '--live-only']);
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(await readFile(join(out, 'latest.json'), 'utf8'));
  const check = (name) => report.checks.find((item) => item.name === name);
  assert.equal(check('sitemaps fetchable')?.status, 'PASS');
  assert.equal(check('sitemap index parses')?.status, 'FAIL');
  assert.equal(check('sitemap index parses')?.class, 'eligibility');
  assert.equal(check('sitemap index parses')?.evidenceLevel, 'E2');
  assert.equal(check('[page] /page expected indexable URL is in sitemap')?.status, 'UNKNOWN');
});

for (const [label, body] of [
  ['malformed location', '<urlset><url><loc>relative.xml</loc></url></urlset>'],
  ['empty urlset', '<urlset></urlset>'],
]) test(`zero-sample ${label} is a required sitemap parse FAIL`, async (t) => {
  const dir = await temporary(t);
  const base = await localServer(t, (request, response) => {
    assert.equal(request.url, '/sitemap.xml');
    response.writeHead(200, { 'content-type': 'application/xml' }); response.end(body);
  });
  const out = join(dir, 'out'); const config = join(dir, 'scorecard.json');
  await writeJson(config, { base, out, sitemapIndex: '/sitemap.xml' });
  const result = await run(['--config', config, '--live-only']);
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(await readFile(join(out, 'latest.json'), 'utf8'));
  const parse = report.checks.find((item) => item.name === 'sitemap index parses');
  assert.equal(parse?.status, 'FAIL');
  assert.equal(parse?.class, 'eligibility');
  assert.equal(parse?.evidenceLevel, 'E2');
});

test('a nested sitemap tag does not substitute for the actual document root', async (t) => {
  const dir = await temporary(t);
  const base = await localServer(t, (request, response) => {
    const origin = `http://${request.headers.host}`;
    assert.equal(request.url, '/sitemap.xml');
    response.writeHead(200, { 'content-type': 'application/xml' });
    response.end(`<wrapper><urlset><url><loc>${origin}/page</loc></url></urlset></wrapper>`);
  });
  const out = join(dir, 'out'); const config = join(dir, 'scorecard.json');
  await writeJson(config, { base, out, sitemapIndex: '/sitemap.xml' });
  const result = await run(['--config', config, '--live-only']);
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  const parse = JSON.parse(await readFile(join(out, 'latest.json'), 'utf8')).checks.find((item) => item.name === 'sitemap index parses');
  assert.equal(parse?.status, 'FAIL');
});

test('a mixed same-origin and cross-origin URL set is an explicit parse FAIL', async (t) => {
  const dir = await temporary(t);
  const base = await localServer(t, (request, response) => {
    const origin = `http://${request.headers.host}`;
    assert.equal(request.url, '/sitemap.xml');
    response.writeHead(200, { 'content-type': 'application/xml' });
    response.end(`<urlset><url><loc>${origin}/page</loc></url><url><loc>https://outside.invalid/page</loc></url></urlset>`);
  });
  const out = join(dir, 'out'); const config = join(dir, 'scorecard.json');
  await writeJson(config, { base, out, sitemapIndex: '/sitemap.xml' });
  const result = await run(['--config', config, '--live-only']);
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(await readFile(join(out, 'latest.json'), 'utf8'));
  const parse = report.checks.find((item) => item.name === 'sitemap index parses');
  assert.equal(parse?.status, 'FAIL');
  assert.equal(parse?.evidenceLevel, 'E2');
});

test('sitemap child and page locations follow the declared XML root, not filename suffixes', async (t) => {
  const dir = await temporary(t);
  const base = await localServer(t, (request, response) => {
    const origin = `http://${request.headers.host}`;
    if (request.url === '/index.xml') { response.writeHead(200, { 'content-type': 'application/xml' }); response.end(`<sitemapindex><sitemap><loc>${origin}/child-without-suffix</loc></sitemap></sitemapindex>`); return; }
    if (request.url === '/child-without-suffix') { response.writeHead(200, { 'content-type': 'application/xml' }); response.end(`<urlset><url><loc>${origin}/page</loc></url></urlset>`); return; }
    if (request.url === '/pages.xml') { response.writeHead(200, { 'content-type': 'application/xml' }); response.end(`<urlset><url><loc>${origin}/page.xml</loc></url></urlset>`); return; }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(request.url === '/page.xml' ? '<html><head><link rel="canonical" href="/page.xml"></head><body><h1>Page XML</h1>Visible copy</body></html>' : html);
  });
  const execute = async (name, sitemapIndex, path) => {
    const out = join(dir, name); const config = join(dir, `${name}.json`);
    await writeJson(config, { base, out, sitemapIndex, samples: [{ path, template: 'page', expectedIndexable: true }] });
    const result = await run(['--config', config, '--live-only']);
    assert.equal(result.status, 0, `${name}: ${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(await readFile(join(out, 'latest.json'), 'utf8'));
    assert.equal(report.checks.find((item) => item.name === `[page] ${path} expected indexable URL is in sitemap`)?.status, 'PASS');
  };
  await execute('index-child', '/index.xml', '/page');
  await execute('urlset-page-xml', '/pages.xml', '/page.xml');
});

test('sitemap truncation is explicit: partial absence is UNKNOWN, complete-set absence is FAIL', async (t) => {
  const dir = await temporary(t);
  const base = await localServer(t, (request, response) => {
    const path = request.url;
    const origin = `http://${request.headers.host}`;
    const xml = (locations) => `<?xml version="1.0"?><urlset>${locations.map((url) => `<url><loc>${url}</loc></url>`).join('')}</urlset>`;
    const sitemapIndex = (locations) => `<?xml version="1.0"?><sitemapindex>${locations.map((url) => `<sitemap><loc>${url}</loc></sitemap>`).join('')}</sitemapindex>`;
    if (path === '/sitemap.xml') { response.writeHead(200, { 'content-type': 'application/xml' }); response.end(sitemapIndex([`${origin}/one.xml`, `${origin}/two.xml`])); return; }
    if (path === '/one.xml') { response.writeHead(200, { 'content-type': 'application/xml' }); response.end(xml([`${origin}/one`])); return; }
    if (path === '/two.xml') { response.writeHead(200, { 'content-type': 'application/xml' }); response.end(xml([`${origin}/two`])); return; }
    response.writeHead(200, { 'content-type': 'text/html' }); response.end(html);
  });
  const execute = async (name, maxSitemapFiles) => {
    const out = join(dir, name); const config = join(dir, `${name}.json`);
    await writeJson(config, { base, out, sitemapIndex: '/sitemap.xml', maxSitemapFiles, samples: [{ path: '/page', template: 'page', expectedIndexable: true }] });
    const result = await run(['--config', config, '--live-only']);
    return { result, report: JSON.parse(await readFile(join(out, 'latest.json'), 'utf8')) };
  };
  const partial = await execute('partial', 1);
  assert.equal(partial.result.status, 3, `${partial.result.stdout}\n${partial.result.stderr}`);
  const membership = partial.report.checks.find((check) => check.name === '[page] /page expected indexable URL is in sitemap');
  assert.equal(membership?.status, 'UNKNOWN');
  assert.match(partial.report.checks.find((check) => check.name === 'sitemap index parses')?.detail || '', /truncat/i);

  const complete = await execute('complete', 2);
  assert.equal(complete.result.status, 2, `${complete.result.stdout}\n${complete.result.stderr}`);
  assert.equal(complete.report.checks.find((check) => check.name === '[page] /page expected indexable URL is in sitemap')?.status, 'FAIL');
});

test('one-sided guardrail aliases are valid and normalize, while explicit contradictions remain invalid', async (t) => {
  const dir = await temporary(t); const out = join(dir, 'out'); const config = join(dir, 'aliases.json');
  await writeJson(config, { out, staticChecks: [
    { name: 'class alias', cmd: 'true', class: 'guardrail' },
    { name: 'boolean alias', cmd: 'true', guardrail: true },
  ] });
  const result = await run(['--config', config, '--static-only']);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(await readFile(join(out, 'latest.json'), 'utf8'));
  for (const name of ['class alias', 'boolean alias']) {
    const check = report.checks.find((item) => item.name === name);
    assert.equal(check?.class, 'guardrail');
    assert.equal(check?.guardrail, true);
  }
});

for (const [label, indexBody, childBody] of [
  ['unclosed index', (origin) => `<urlset><url><loc>${origin}/page</loc></url>`, null],
  ['mismatched index', (origin) => `<urlset><url><loc>${origin}/page</loc></url></sitemapindex>`, null],
  ['trailing content', (origin) => `<urlset><url><loc>${origin}/page</loc></url></urlset>outside`, null],
  ['empty fetched child', (origin) => `<sitemapindex><sitemap><loc>${origin}/child</loc></sitemap></sitemapindex>`, '<urlset></urlset>'],
]) test(`malformed sitemap XML (${label}) is an E2 parse FAIL even without samples`, async (t) => {
  const dir = await temporary(t);
  const base = await localServer(t, (request, response) => {
    const origin = `http://${request.headers.host}`;
    if (request.url === '/sitemap.xml') { response.writeHead(200, { 'content-type': 'application/xml' }); response.end(indexBody(origin)); return; }
    if (request.url === '/child') { response.writeHead(200, { 'content-type': 'application/xml' }); response.end(childBody); return; }
    response.writeHead(404); response.end();
  });
  const out = join(dir, 'out'); const config = join(dir, 'sitemap.json');
  await writeJson(config, { base, out, sitemapIndex: '/sitemap.xml' });
  const result = await run(['--config', config, '--live-only']);
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(await readFile(join(out, 'latest.json'), 'utf8'));
  const parse = report.checks.find((item) => item.name === 'sitemap index parses');
  assert.equal(parse?.status, 'FAIL');
  assert.equal(parse?.class, 'eligibility');
  assert.equal(parse?.evidenceLevel, 'E2');
});

test('XML declaration, comments, and a default namespace remain supported sitemap syntax', async (t) => {
  const dir = await temporary(t);
  const base = await localServer(t, (request, response) => {
    const origin = `http://${request.headers.host}`;
    response.writeHead(200, { 'content-type': 'application/xml' });
    response.end(`<?xml version="1.0"?><!-- fixture --><urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/page</loc></url></urlset>`);
  });
  const out = join(dir, 'out'); const config = join(dir, 'valid-sitemap.json');
  await writeJson(config, { base, out, sitemapIndex: '/sitemap.xml' });
  const result = await run(['--config', config, '--live-only']);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const parse = JSON.parse(await readFile(join(out, 'latest.json'), 'utf8')).checks.find((item) => item.name === 'sitemap index parses');
  assert.equal(parse?.status, 'PASS');
});

test('a comparable negative scorecard delta persists FAIL/REVERT/2 rather than an invalid artifact', async (t) => {
  const dir = await temporary(t); const out = join(dir, 'out'); const sentinel = join(dir, 'ready'); const config = join(dir, 'compare.json'); const previous = join(dir, 'previous.json');
  await writeFile(sentinel, 'ready\n');
  await writeJson(config, { out, staticChecks: [{ name: 'comparable check', cmd: `test -f "${sentinel}"` }] });
  const baseline = await run(['--config', config, '--static-only']);
  assert.equal(baseline.status, 0, `${baseline.stdout}\n${baseline.stderr}`);
  await writeFile(previous, await readFile(join(out, 'latest.json')));
  await rm(sentinel);
  const compared = await run(['--config', config, '--static-only', '--compare', previous]);
  assert.equal(compared.status, 2, `${compared.stdout}\n${compared.stderr}`);
  const report = JSON.parse(await readFile(join(out, 'latest.json'), 'utf8'));
  assert.equal(report.status, 'FAIL');
  assert.equal(report.verdict, 'REVERT');
  assert.equal(report.exitCode, 2);
  assert.equal(report.delta, -100);
});
