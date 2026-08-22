#!/usr/bin/env node
// Read-only SEO evidence scorecard. Eligibility and guardrails fail closed;
// diagnostics are retained as observations, not ranking requirements.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from './lib/cli.mjs';
import { atomicJson } from './lib/report.mjs';
import { extractHtmlEvidence, normalizeUrl } from './lib/html-evidence.mjs';
import { validateArtifact } from './lib/schema.mjs';

const CLASSES = new Set(['eligibility', 'recommendation', 'guardrail', 'diagnostic']);
function die(message) { console.error(`seo-scorecard.mjs: ${message}`); process.exit(1); }
const args = (() => {
  try {
    const parsed = parseArgs(process.argv.slice(2), { value: ['config', 'base', 'out', 'compare'], boolean: ['static-only', 'live-only', 'md'] });
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, value === true ? 'true' : value]));
  } catch (error) { die(error.message); }
})();
if (!args.config) die('--config <file> required');
if (args['static-only'] === 'true' && args['live-only'] === 'true') die('--static-only and --live-only are mutually exclusive');
let cfg; try { cfg = JSON.parse(readFileSync(args.config, 'utf8')); } catch (error) { die(`invalid config: ${error.message}`); }
if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) die('config must be a JSON object');
const EXECUTION_MODE = args['static-only'] === 'true' ? 'static-only' : args['live-only'] === 'true' ? 'live-only' : 'full';
const ROOT_KEYS = new Set(['$doc', 'base', 'exampleOnly', 'maxSitemapFiles', 'out', 'samples', 'schemaVersion', 'sitemapIndex', 'staticChecks', 'thresholds', 'timeoutSec', 'userAgent', 'version', 'weights']);
const STATIC_KEYS = new Set(['$note', 'class', 'cmd', 'guardrail', 'name', 'timeoutSec']);
const SAMPLE_KEYS = new Set(['expectedIndexable', 'path', 'template']);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const hasOnly = (value, allowed, label) => { for (const key of Object.keys(value)) if (!allowed.has(key)) die(`unknown ${label} key: ${key}`); };
const isSafePath = (path) => {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\\?\s#\u0000-\u001f]/.test(path)) return false;
  return !path.split('/').some((segment) => { try { const decoded = decodeURIComponent(segment); return decoded === '.' || decoded === '..'; } catch { return true; } });
};
const normalizedSamplePath = (path) => { const parsed = new URL(path, 'http://scorecard.invalid'); return parsed.pathname.length > 1 && parsed.pathname.endsWith('/') ? parsed.pathname.slice(0, -1) : parsed.pathname; };
const httpUrl = (value) => { try { const parsed = new URL(value); return ['http:', 'https:'].includes(parsed.protocol) && Boolean(parsed.hostname) ? parsed : null; } catch { return null; } };
hasOnly(cfg, ROOT_KEYS, 'config');
if (cfg.exampleOnly === true) die('example/placeholder config cannot be executed; replace its example values first');
if (cfg.exampleOnly != null && typeof cfg.exampleOnly !== 'boolean') die('exampleOnly must be a boolean');
if (cfg.$doc != null && typeof cfg.$doc !== 'string') die('$doc must be a string');
for (const key of ['version', 'schemaVersion']) if (cfg[key] != null && !((typeof cfg[key] === 'string' && cfg[key].trim()) || (typeof cfg[key] === 'number' && Number.isInteger(cfg[key]) && cfg[key] > 0))) die(`${key} must be a non-empty string or positive integer`);
if (cfg.out != null && (typeof cfg.out !== 'string' || !cfg.out.trim())) die('out must be a non-empty string');
if (cfg.base != null && (typeof cfg.base !== 'string' || !httpUrl(cfg.base))) die('base must be an absolute HTTP(S) URL');
if (cfg.samples != null && !Array.isArray(cfg.samples)) die('samples must be an array');
if (cfg.staticChecks != null && !Array.isArray(cfg.staticChecks)) die('staticChecks must be an array');
if (cfg.weights != null && (!cfg.weights || typeof cfg.weights !== 'object' || Array.isArray(cfg.weights))) die('weights must be an object');
for (const [name, value] of Object.entries(cfg.weights || {})) { if (!['live', 'static', 'guardrail'].includes(name)) die(`unknown weight key: ${name}`); if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) die(`weight ${name} must be a positive finite number`); }
if (cfg.thresholds != null && (!cfg.thresholds || typeof cfg.thresholds !== 'object' || Array.isArray(cfg.thresholds))) die('thresholds must be an object');
for (const [group, values] of Object.entries(cfg.thresholds || {})) {
  if (group === '$note') { if (typeof values !== 'string') die('thresholds.$note must be a string'); continue; }
  if (!values || typeof values !== 'object' || Array.isArray(values)) die(`threshold group ${group} must be an object`);
  for (const [key, value] of Object.entries(values)) {
    if (!['maxRawKB', 'minTextCharacters'].includes(key)) die(`unknown threshold key ${group}.${key}`);
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) die(`threshold ${group}.${key} must be a positive finite number`);
  }
}
const seenSamplePaths = new Set();
for (const sample of cfg.samples || []) {
  if (!isObject(sample)) die('each sample must be an object');
  hasOnly(sample, SAMPLE_KEYS, 'sample');
  if (!isSafePath(sample.path)) die('each sample needs a safe absolute path');
  if (sample.template != null && (typeof sample.template !== 'string' || !sample.template.trim())) die(`sample template for ${sample.path} must be a non-empty string`);
  if (sample.expectedIndexable != null && typeof sample.expectedIndexable !== 'boolean') die(`sample expectedIndexable for ${sample.path} must be a boolean`);
  const normalized = normalizedSamplePath(sample.path);
  if (seenSamplePaths.has(normalized)) die(`duplicate normalized sample path: ${sample.path}`);
  seenSamplePaths.add(normalized);
}
const seenStaticNames = new Set();
for (const check of cfg.staticChecks || []) {
  if (!isObject(check)) die('each static check must be an object');
  hasOnly(check, STATIC_KEYS, 'static check');
  if (typeof check.name !== 'string' || !check.name.trim() || typeof check.cmd !== 'string' || !check.cmd.trim()) die('each static check needs name and cmd');
  if (seenStaticNames.has(check.name)) die(`duplicate static check name: ${check.name}`);
  seenStaticNames.add(check.name);
  if (check.class != null && !CLASSES.has(check.class)) die(`invalid static check class: ${check.class}`);
  if (check.guardrail != null && typeof check.guardrail !== 'boolean') die(`guardrail for ${check.name} must be a boolean`);
  // Either declaration is a sufficient, backwards-compatible guardrail alias.
  // Reject only the two states that explicitly contradict one another.
  if ((check.class === 'guardrail' && check.guardrail === false) || (check.guardrail === true && check.class != null && check.class !== 'guardrail')) die(`class and guardrail must agree for ${check.name}`);
  if (check.class === 'guardrail' || check.guardrail === true) {
    check.class = 'guardrail';
    check.guardrail = true;
  } else {
    check.class ??= 'eligibility';
    check.guardrail ??= false;
  }
  if (check.timeoutSec != null && (!Number.isInteger(check.timeoutSec) || check.timeoutSec < 1 || check.timeoutSec > 1800)) die(`invalid timeoutSec for ${check.name}`);
  if (check.$note != null && typeof check.$note !== 'string') die(`static check $note for ${check.name} must be a string`);
}
if (cfg.sitemapIndex != null && !isSafePath(cfg.sitemapIndex)) die('sitemapIndex must be a safe absolute path');
if (cfg.maxSitemapFiles != null && !cfg.sitemapIndex) die('maxSitemapFiles requires sitemapIndex');
if (cfg.maxSitemapFiles != null && (!Number.isInteger(cfg.maxSitemapFiles) || cfg.maxSitemapFiles < 1 || cfg.maxSitemapFiles > 100)) die('maxSitemapFiles must be an integer from 1 to 100');
if (cfg.timeoutSec != null && (typeof cfg.timeoutSec !== 'number' || !Number.isFinite(cfg.timeoutSec) || cfg.timeoutSec <= 0 || cfg.timeoutSec > 300)) die('timeoutSec must be a number between 1 and 300');
if (cfg.userAgent != null && (typeof cfg.userAgent !== 'string' || !cfg.userAgent.trim())) die('userAgent must be a non-empty string');
const selectedBase = args.base || cfg.base || '';
if (selectedBase && (typeof selectedBase !== 'string' || !httpUrl(selectedBase))) die('base must be an absolute HTTP(S) URL');
const BASE = selectedBase.replace(/\/$/, '');
const hasConfiguredLiveWork = (cfg.samples || []).length > 0 || Boolean(cfg.sitemapIndex);
if (EXECUTION_MODE !== 'static-only' && hasConfiguredLiveWork && !BASE) die('live mode with samples or sitemapIndex requires config.base or --base');
const OUT = args.out || cfg.out || '.agents/runs/seo-scorecard', UA = cfg.userAgent || 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const TIMEOUT = cfg.timeoutSec ?? 20;
const checks = [];
const OBSERVED_AT = new Date().toISOString();
function add(group, name, outcome, detail = '', type = 'eligibility', source = null) { const className = type === 'guardrail' ? 'guardrail' : type; if (!CLASSES.has(className)) die(`invalid check classification: ${type}`); const status = outcome === 'UNKNOWN' ? 'UNKNOWN' : outcome === 'N/A' ? 'N/A' : outcome ? 'PASS' : 'FAIL'; const evidenceLevel = group === 'static' ? 'E1' : 'E2'; checks.push({ group, name, pass: status === 'PASS', status, detail: String(detail).slice(0, 500), class: className, guardrail: className === 'guardrail', evidenceLevel, source: source || (group === 'static' ? 'local static command' : 'live source fetch'), observedAt: OBSERVED_AT }); }
function thresholdFor(sample) {
  return { ...(cfg.thresholds?.default || {}), ...(cfg.thresholds?.[sample.template || 'default'] || {}) };
}
function samplePlan(sample) {
  if (!sample || typeof sample.path !== 'string' || !sample.path.startsWith('/')) die('each sample needs an absolute path');
  const label = `[${sample.template || 'default'}] ${sample.path}`, indexable = sample.expectedIndexable !== false, threshold = thresholdFor(sample);
  const plan = [{ name: `${label} fetches 200 with <=1 redirect`, class: 'eligibility' }];
  if (indexable) plan.push({ name: `${label} is indexable`, class: 'eligibility' });
  plan.push({ name: `${label} canonical self-reference`, class: 'eligibility' }, { name: `${label} H1 count (diagnostic)`, class: 'diagnostic' }, { name: `${label} text characters (diagnostic)`, class: 'diagnostic' });
  if (threshold.maxRawKB != null) plan.push({ name: `${label} raw <= ${threshold.maxRawKB} KB (diagnostic)`, class: 'diagnostic' });
  if (threshold.minTextCharacters != null) plan.push({ name: `${label} text characters >= ${threshold.minTextCharacters} (diagnostic)`, class: 'diagnostic' });
  if (cfg.sitemapIndex && indexable) plan.push({ name: `${label} expected indexable URL is in sitemap`, class: 'eligibility' });
  plan.push({ name: `${label} cache evidence (diagnostic)`, class: 'diagnostic' }, { name: `${label} JSON-LD parses (diagnostic)`, class: 'diagnostic' });
  return plan;
}
const configuredLivePlan = (cfg.sitemapIndex ? [{ name: 'sitemaps fetchable', class: 'eligibility' }, { name: 'sitemap index parses', class: 'eligibility' }] : []).concat((cfg.samples || []).flatMap(samplePlan));
let schema; try { schema = JSON.parse(readFileSync(new URL('../assets/report.schema.json', import.meta.url), 'utf8')); } catch (error) { die(`cannot load artifact schema: ${error.message}`); }
let comparisonPrevious = null;
if (args.compare) {
  try { comparisonPrevious = JSON.parse(readFileSync(args.compare, 'utf8')); } catch (error) { die(`invalid compare artifact: ${error.message}`); }
  const priorValidation = validateArtifact(comparisonPrevious, schema);
  if (!priorValidation.valid) die(`invalid compare artifact: ${priorValidation.errors.map((error) => `${error.pointer} ${error.message}`).join('; ')}`);
}
function curl(url, prefix) { const headers = `${prefix}.headers`, body = `${prefix}.html`; const r = spawnSync('curl', ['-sS', '-L', '--compressed', '--connect-timeout', String(Math.min(10, TIMEOUT)), '--max-time', String(TIMEOUT), '--retry', '2', '--retry-all-errors', '-A', UA, '-D', headers, '-o', body, '-w', '%{http_code} %{num_redirects} %{url_effective}', url], { encoding: 'utf8' }); const [code, redirects, finalUrl] = (r.stdout || '').trim().split(' '); const raw = existsSync(headers) ? readFileSync(headers, 'utf8') : '', block = raw.trim().split(/\r?\n\r?\n/).pop() || ''; return { code: Number(code), redirects: Number(redirects), finalUrl, html: existsSync(body) ? readFileSync(body, 'utf8') : '', headers: Object.fromEntries([...block.matchAll(/^([^:]+):\s*(.*)$/gm)].map((m) => [m[1].toLowerCase(), m[2]])), error: r.error?.message || (r.status ? r.stderr : '') }; }
const xmlName = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;
const localXmlName = (name) => name.slice(name.lastIndexOf(':') + 1).toLowerCase();
const decodeXmlText = (text) => String(text).replace(/&(amp|lt|gt|quot|apos);|&#(\d+);|&#x([0-9a-f]+);/gi, (match, named, decimal, hexadecimal) => {
  if (named) return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[named.toLowerCase()];
  const codePoint = Number.parseInt(decimal || hexadecimal, hexadecimal ? 16 : 10);
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
});
const xmlTextWellFormed = (text) => !/&(?!(?:amp|lt|gt|quot|apos);|#\d+;|#x[0-9a-f]+;)/i.test(text);
function xmlTagEnd(xml, start) {
  let quote = null;
  for (let index = start + 1; index < xml.length; index += 1) {
    const character = xml[index];
    if (quote) { if (character === quote) quote = null; continue; }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '>') return index;
  }
  return -1;
}
function validXmlAttributes(raw) {
  let index = 0;
  while (index < raw.length) {
    while (/\s/.test(raw[index] || '')) index += 1;
    if (index >= raw.length) return true;
    const name = raw.slice(index).match(/^[A-Za-z_][A-Za-z0-9_.:-]*/)?.[0];
    if (!name) return false;
    index += name.length;
    while (/\s/.test(raw[index] || '')) index += 1;
    if (raw[index] !== '=') return false;
    index += 1;
    while (/\s/.test(raw[index] || '')) index += 1;
    const quote = raw[index];
    if (quote !== '"' && quote !== "'") return false;
    index += 1;
    const close = raw.indexOf(quote, index);
    if (close < 0 || raw.slice(index, close).includes('<')) return false;
    if (!xmlTextWellFormed(raw.slice(index, close))) return false;
    index = close + 1;
  }
  return true;
}
function parseSitemapXml(input) {
  const xml = String(input ?? '').replace(/^\uFEFF/, '');
  const stack = [], locations = [];
  let cursor = 0, root = null, rootClosed = false, activeLoc = null;
  const failure = (error) => ({ valid: false, root: null, locations: [], error });
  const text = (value) => {
    if (!xmlTextWellFormed(value)) return false;
    if (!stack.length && value.trim()) return false;
    if (activeLoc) activeLoc.parts.push(value);
    return true;
  };
  while (cursor < xml.length) {
    const start = xml.indexOf('<', cursor);
    const before = xml.slice(cursor, start < 0 ? xml.length : start);
    if (!text(before)) return failure('text outside the sitemap document root or malformed XML entity');
    if (start < 0) break;
    if (xml.startsWith('<!--', start)) {
      const end = xml.indexOf('-->', start + 4);
      if (end < 0) return failure('unclosed XML comment');
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', start)) {
      const end = xml.indexOf(']]>', start + 9);
      if (end < 0) return failure('unclosed CDATA section');
      if (!text(xml.slice(start + 9, end))) return failure('text outside the sitemap document root');
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith('<?', start)) {
      const end = xml.indexOf('?>', start + 2);
      if (end < 0) return failure('unclosed XML processing instruction');
      cursor = end + 2;
      continue;
    }
    if (xml.startsWith('<!DOCTYPE', start)) {
      if (root || stack.length || rootClosed) return failure('DOCTYPE must precede the sitemap document root');
      const end = xmlTagEnd(xml, start);
      if (end < 0) return failure('unclosed DOCTYPE declaration');
      cursor = end + 1;
      continue;
    }
    const end = xmlTagEnd(xml, start);
    if (end < 0) return failure('unclosed XML tag');
    const raw = xml.slice(start + 1, end);
    if (raw.startsWith('/')) {
      const name = raw.slice(1).trim();
      if (!xmlName.test(name) || !stack.length || stack.at(-1) !== name) return failure('mismatched XML closing tag');
      stack.pop();
      if (activeLoc?.name === name) {
        locations.push(decodeXmlText(activeLoc.parts.join('')).trim());
        activeLoc = null;
      }
      if (!stack.length) rootClosed = true;
      cursor = end + 1;
      continue;
    }
    if (raw.startsWith('!')) return failure('unsupported XML declaration');
    const selfClosing = /\/\s*$/.test(raw);
    const body = (selfClosing ? raw.replace(/\/\s*$/, '') : raw).trim();
    const match = body.match(/^([A-Za-z_][A-Za-z0-9_.:-]*)([\s\S]*)$/);
    if (!match || !xmlName.test(match[1]) || !validXmlAttributes(match[2])) return failure('malformed XML opening tag or attribute');
    const name = match[1];
    if (rootClosed && !stack.length) return failure('multiple roots or content after the sitemap document root');
    if (activeLoc) return failure('a sitemap loc element must contain text only');
    if (!root) root = localXmlName(name);
    else if (!stack.length) return failure('multiple XML document roots');
    if (selfClosing) {
      if (localXmlName(name) === 'loc') locations.push('');
      if (!stack.length) rootClosed = true;
    } else {
      stack.push(name);
      if (localXmlName(name) === 'loc') activeLoc = { name, parts: [] };
    }
    cursor = end + 1;
  }
  if (stack.length) return failure('unclosed XML element');
  if (!root || !rootClosed) return failure('missing sitemap document root');
  return { valid: true, root, locations, error: null };
}
const successfulHttp = (page) => page.code >= 200 && page.code < 300;
const observedHttpFailure = (page) => page.code >= 400 && page.code < 600;
function loadSitemaps() {
  if (!cfg.sitemapIndex || !BASE) return null;
  const sitemapUrl = `${BASE}${cfg.sitemapIndex}`, prefix = join(OUT, `sitemap-${process.pid}`), index = curl(sitemapUrl, `${prefix}-index`);
  const unknown = (detail) => { add('live', 'sitemaps fetchable', 'UNKNOWN', detail, 'eligibility', sitemapUrl); add('live', 'sitemap index parses', 'UNKNOWN', 'sitemap source evidence unavailable', 'eligibility', sitemapUrl); return { available: false, truncated: false, urls: new Set() }; };
  const failed = (detail) => { add('live', 'sitemaps fetchable', false, detail, 'eligibility', sitemapUrl); add('live', 'sitemap index parses', 'UNKNOWN', 'sitemap source did not provide parseable evidence', 'eligibility', sitemapUrl); return { available: false, truncated: false, urls: new Set() }; };
  if (!index.code || !index.finalUrl) return unknown(index.error || 'no HTTP response while fetching sitemap index');
  if (!successfulHttp(index)) return observedHttpFailure(index) ? failed(`HTTP ${index.code} from sitemap index`) : unknown(index.error || `unexpected HTTP status ${index.code}`);
  const indexDocument = parseSitemapXml(index.html), origin = new URL(BASE).origin, urls = new Set();
  const parseFailure = (detail) => { add('live', 'sitemaps fetchable', true, 'sitemap source fetched', 'eligibility', sitemapUrl); add('live', 'sitemap index parses', false, detail, 'eligibility', sitemapUrl); return { available: false, truncated: false, urls }; };
  const sameOriginHttp = (location) => { try { const parsed = new URL(location); return ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === origin ? parsed : null; } catch { return null; } };
  if (!indexDocument.valid || !['urlset', 'sitemapindex'].includes(indexDocument.root)) return parseFailure(indexDocument.error || 'unsupported or malformed sitemap root');
  const locations = indexDocument.locations;
  if (indexDocument.root === 'urlset') {
    for (const location of locations) { const parsed = sameOriginHttp(location); if (!parsed) return parseFailure(`invalid URL in sitemap: ${location}`); urls.add(normalizeUrl(parsed.href)); }
    const parsed = urls.size > 0;
    add('live', 'sitemaps fetchable', true, 'sitemap source fetched', 'eligibility', sitemapUrl);
    add('live', 'sitemap index parses', parsed, `${urls.size} URLs`, 'eligibility', sitemapUrl);
    return { available: parsed, truncated: false, urls };
  }
  const childLocations = [];
  for (const location of locations) { const parsed = sameOriginHttp(location); if (!parsed) return parseFailure(`invalid child sitemap location: ${location}`); childLocations.push(parsed.href); }
  const maxFiles = cfg.maxSitemapFiles ?? 40, truncated = childLocations.length > maxFiles;
  for (const [indexNumber, file] of childLocations.slice(0, maxFiles).entries()) {
    const child = curl(file, `${prefix}-child-${indexNumber}`);
    if (!child.code || !child.finalUrl) return unknown(child.error || `no HTTP response while fetching child sitemap ${file}`);
    if (!successfulHttp(child)) return observedHttpFailure(child) ? failed(`HTTP ${child.code} from child sitemap`) : unknown(child.error || `unexpected HTTP status ${child.code}`);
    const childDocument = parseSitemapXml(child.html);
    if (!childDocument.valid || childDocument.root !== 'urlset') return parseFailure(childDocument.error ? `malformed child sitemap ${file}: ${childDocument.error}` : `child sitemap does not have a urlset root: ${file}`);
    if (!childDocument.locations.length) return parseFailure(`child sitemap has no usable URL locations: ${file}`);
    for (const location of childDocument.locations) { const parsed = sameOriginHttp(location); if (!parsed) return parseFailure(`invalid URL in child sitemap: ${location}`); urls.add(normalizeUrl(parsed.href)); }
  }
  const parsed = childLocations.length > 0;
  add('live', 'sitemaps fetchable', true, 'sitemap source fetched', 'eligibility', sitemapUrl);
  add('live', 'sitemap index parses', parsed, `${urls.size} URLs${truncated ? `; truncated after ${maxFiles} child sitemap files` : ''}`, 'eligibility', sitemapUrl);
  return { available: parsed, truncated, urls };
}
function liveChecks() {
  if (!BASE) return;
  mkdirSync(OUT, { recursive: true });
  const sitemap = loadSitemaps();
  for (const sample of cfg.samples || []) {
    const label = `[${sample.template || 'default'}] ${sample.path}`;
    const plan = samplePlan(sample);
    const requestUrl = `${BASE}${sample.path}`;
    const page = curl(requestUrl, join(OUT, `page-${checks.length}-${process.pid}`));
    const unavailable = !page.code || !page.finalUrl;
    add('live', `${label} fetches 200 with <=1 redirect`, unavailable ? 'UNKNOWN' : page.code === 200 && page.redirects <= 1, `${page.code || 'no status'}, ${page.redirects || 0} redirects ${page.error || ''}`, 'eligibility', requestUrl);
    if (page.code !== 200) {
      for (const downstream of plan.slice(1)) add('live', downstream.name, 'UNKNOWN', 'page response was unavailable for this observation', downstream.class, requestUrl);
      continue;
    }
    const evidence = extractHtmlEvidence(page.html);
    const source = requestUrl;
    const indexable = sample.expectedIndexable !== false;
    const threshold = thresholdFor(sample);
    if (indexable) add('live', `${label} is indexable`, !evidence.noindex && !/\bnoindex\b/i.test(page.headers['x-robots-tag'] || ''), `meta=${evidence.noindex} x-robots=${page.headers['x-robots-tag'] || '-'}`, 'eligibility', source);
    add('live', `${label} canonical self-reference`, Boolean(evidence.canonical) && normalizeUrl(evidence.canonical, page.finalUrl) === normalizeUrl(page.finalUrl), evidence.canonical || 'missing', 'eligibility', source);
    add('live', `${label} H1 count (diagnostic)`, evidence.h1 === 1, `h1=${evidence.h1}`, 'diagnostic', source);
    add('live', `${label} text characters (diagnostic)`, evidence.textChars > 0, `${evidence.textChars} chars; ${evidence.words} whitespace words`, 'diagnostic', source);
    if (threshold.maxRawKB != null) add('live', `${label} raw <= ${threshold.maxRawKB} KB (diagnostic)`, Buffer.byteLength(page.html) / 1024 <= threshold.maxRawKB, `${(Buffer.byteLength(page.html) / 1024).toFixed(2)} KB`, 'diagnostic', source);
    if (threshold.minTextCharacters != null) add('live', `${label} text characters >= ${threshold.minTextCharacters} (diagnostic)`, evidence.textChars >= threshold.minTextCharacters, `${evidence.textChars} characters`, 'diagnostic', source);
    if (cfg.sitemapIndex && indexable) {
      const found = sitemap?.urls.has(normalizeUrl(page.finalUrl));
      const outcome = !sitemap?.available ? 'UNKNOWN' : found ? true : sitemap.truncated ? 'UNKNOWN' : false;
      const detail = !sitemap?.available ? 'sitemap evidence unavailable' : sitemap.truncated && !found ? 'URL absent from truncated sitemap set' : `inSitemap=${found}`;
      add('live', `${label} expected indexable URL is in sitemap`, outcome, detail, 'eligibility', source);
    }
    add('live', `${label} cache evidence (diagnostic)`, Boolean(page.headers['cache-control']) && Boolean(page.headers.etag || page.headers['last-modified']), `cache-control=${page.headers['cache-control'] || '-'}`, 'diagnostic', source);
    add('live', `${label} JSON-LD parses (diagnostic)`, evidence.jsonld.every((item) => !item.__invalid), `${evidence.jsonld.length} block(s)`, 'diagnostic', source);
  }
}
function staticChecks() { for (const check of cfg.staticChecks || []) { if (!check || typeof check.name !== 'string' || typeof check.cmd !== 'string' || !check.cmd.trim()) die('each static check needs name and cmd'); const timeout = Number(check.timeoutSec || 900); if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 1800) die(`invalid timeoutSec for ${check.name}`); const result = spawnSync('sh', ['-c', check.cmd], { encoding: 'utf8', timeout: timeout * 1000 }); const unavailable = result.error || result.status == null || result.signal; add('static', check.name, unavailable ? 'UNKNOWN' : result.status === 0, (result.stdout || result.stderr || result.error?.message || '').trim().split('\n').slice(-2).join(' | '), check.guardrail ? 'guardrail' : (check.class || 'eligibility'), `local static check: ${check.name}`); } }
if (args['static-only'] !== 'true') liveChecks(); if (args['live-only'] !== 'true') staticChecks();
const canonicalValue = (value) => Array.isArray(value) ? value.map(canonicalValue).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])])) : value;
const normChecks = [
  ...configuredLivePlan.map((check) => ({ group: 'live', name: check.name, class: check.class, guardrail: check.class === 'guardrail' })),
  ...(cfg.staticChecks || []).map((check) => ({ group: 'static', name: check.name, class: check.guardrail ? 'guardrail' : (check.class || 'eligibility'), guardrail: Boolean(check.guardrail) })),
].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const configVersion = String(cfg.version ?? cfg.schemaVersion ?? 1);
const contract = {
  version: configVersion,
  executionMode: EXECUTION_MODE,
  checks: normChecks,
  staticChecks: (cfg.staticChecks || []).map((check) => ({ name: check.name, cmd: check.cmd, class: check.guardrail ? 'guardrail' : (check.class || 'eligibility'), timeoutSec: check.timeoutSec || 900 })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  weights: canonicalValue(cfg.weights || {}),
  live: canonicalValue({
    base: BASE || null,
    samples: (cfg.samples || []).map((sample) => ({ path: sample?.path, template: sample?.template || 'default', expectedIndexable: sample?.expectedIndexable !== false })),
    sitemapIndex: cfg.sitemapIndex || null,
    maxSitemapFiles: cfg.maxSitemapFiles || null,
    timeoutSec: TIMEOUT,
    userAgent: UA,
    thresholds: cfg.thresholds || {},
  }),
};
const contractKey = JSON.stringify(contract);
// Persist a compact, reproducible identity. The full normalized contract stays
// in process memory only, so static command text is not copied into artifacts.
const persistedContractVersion = `${configVersion}+sha256:${createHash('sha256').update(contractKey).digest('hex')}`;
const weight = (check) => check.class === 'guardrail' ? Number(cfg.weights?.guardrail || 5) : Number(cfg.weights?.[check.group] || 1);
const weightedScore = (selected) => { const total = selected.reduce((n, check) => n + weight(check), 0), passed = selected.filter((check) => check.status === 'PASS').reduce((n, check) => n + weight(check), 0); return total ? +((100 * passed) / total).toFixed(1) : 0; };
const required = checks.filter((check) => ['eligibility', 'guardrail'].includes(check.class)), observations = checks.filter((check) => ['diagnostic', 'recommendation'].includes(check.class));
const requiredScore = weightedScore(required), diagnosticScore = weightedScore(observations);
const failures = required.filter((check) => check.status === 'FAIL'), unknownChecks = required.filter((check) => check.status === 'UNKNOWN'), guardrailFails = failures.filter((check) => check.class === 'guardrail');
let delta = null, verdict = checks.length ? 'BASELINE' : 'UNKNOWN: no checks produced';
if (args.compare) {
  const previous = comparisonPrevious;
  let encodedContract;
  try { encodedContract = typeof previous.contractVersion === 'string' ? JSON.parse(previous.contractVersion) : null; } catch { encodedContract = null; }
  const fingerprint = typeof previous.contractVersion === 'string' && /^.+\+sha256:[a-f0-9]{64}$/.test(previous.contractVersion) ? previous.contractVersion : null;
  const legacy = !previous.contract && !encodedContract && !fingerprint;
  if (legacy) die('incomparable scorecards: prior artifact lacks a contract fingerprint');
  const prior = previous.contract || encodedContract || { version: String(previous.configVersion ?? 1), checks: (previous.checks || []).map((check) => ({ group: check.group, name: check.name, class: check.class || (check.guardrail ? 'guardrail' : 'eligibility'), guardrail: Boolean(check.guardrail) })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) };
  if (fingerprint ? fingerprint !== persistedContractVersion : JSON.stringify(prior) !== contractKey) die('incomparable scorecards: config version, command, weight, or normalized check contract differs');
  if (!Number.isFinite(previous.requiredScore ?? previous.score)) die('incomparable scorecards: prior score is missing');
  delta = +(requiredScore - (previous.requiredScore ?? previous.score)).toFixed(1);
  verdict = failures.length ? `REVERT (${guardrailFails.length ? 'guardrail' : 'eligibility'} failure)` : unknownChecks.length ? 'UNKNOWN: required evidence unavailable' : delta > 0 ? `KEEP (+${delta})` : delta < 0 ? `REVERT (${delta})` : 'NEUTRAL (0)';
} else if (failures.length) verdict = `FAILED (${failures.map((check) => check.name).join('; ')})`; else if (unknownChecks.length) verdict = 'UNKNOWN: required evidence unavailable';
const gitEvidence = () => { try { return { revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()) }; } catch { return { revision: null, dirty: null }; } };
const unknown = !required.length || (!failures.length && unknownChecks.length > 0);
const exitCode = failures.length ? 2 : unknown ? 3 : 0;
const artifactStatus = failures.length ? 'FAIL' : unknown ? 'UNKNOWN' : 'PASS';
const finiteVerdict = failures.length ? (args.compare ? 'REVERT' : 'FAIL') : unknown ? 'UNKNOWN' : !args.compare ? 'BASELINE' : delta > 0 ? 'KEEP' : delta < 0 ? 'REVERT' : 'NEUTRAL';
const evidenceLevel = checks.some((check) => check.evidenceLevel === 'E2') ? 'E2' : checks.some((check) => check.evidenceLevel === 'E1') ? 'E1' : 'E0';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const result = { artifactKind: 'scorecard', schemaVersion: '1', contractVersion: persistedContractVersion, generatedAt: OBSERVED_AT, observedAt: OBSERVED_AT, base: BASE || null, configVersion, configHash: createHash('sha256').update(JSON.stringify(cfg)).digest('hex'), sourceRevision: gitEvidence(), evidenceLevel, evidence: checks.map((check) => ({ level: check.evidenceLevel, source: check.source, observedAt: check.observedAt, detail: check.name })), evidenceSummary: { liveSamples: (cfg.samples || []).length, staticChecks: (cfg.staticChecks || []).length }, limitations: ['Live source fetch with a Googlebot user agent is not Google rendering.', 'Diagnostic measurements are not universal ranking requirements.'], score: requiredScore, requiredScore, diagnosticScore, delta, verdict: finiteVerdict, verdictDetail: verdict, status: artifactStatus, exitCode, exitClassification: failures.length ? (args.compare ? 'REVERT' : 'FAIL') : unknown ? 'UNKNOWN' : 'PASS', passed: checks.filter((check) => check.status === 'PASS').length, total: checks.length, failures: failures.map((check) => check.name), unknowns: !required.length ? ['no required checks produced'] : unknownChecks.map((check) => check.name), guardrailFails: guardrailFails.map((check) => check.name), checks };
const validation = validateArtifact(result, schema); if (!validation.valid) { console.error(`seo-scorecard.mjs: artifact schema validation failed: ${validation.errors.map((error) => `${error.pointer} ${error.message}`).join('; ')}`); process.exit(1); }
mkdirSync(OUT, { recursive: true }); const file = join(OUT, `scorecard-${stamp}.json`); atomicJson(file, result); atomicJson(join(OUT, 'latest.json'), result);
const esc = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/[\r\n]+/g, '<br>'); if (args.md === 'true') { console.log(`**Score ${result.score}** (${result.passed}/${result.total}) — ${esc(verdict)}\n`); console.log('| group | class | check | status | detail |\n|---|---|---|---|---|'); for (const check of checks) console.log(`| ${esc(check.group)} | ${esc(check.class)} | ${esc(check.name)} | ${check.status} | ${esc(check.detail)} |`); console.log(`\nsaved ${file}`); } else console.log(JSON.stringify({ score: result.score, requiredScore, diagnosticScore, verdict, delta, passed: result.passed, total: result.total, guardrailFails: result.guardrailFails, file }, null, 2));
process.exit(exitCode);
