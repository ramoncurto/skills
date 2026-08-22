#!/usr/bin/env node
// gsc.mjs — zero-dependency Google Search Console CLI for the seo-visibility skills (read-only).
//
// Auth (service account added as a user on the GSC property):
//   GSC_CLIENT_EMAIL + GSC_PRIVATE_KEY (PEM, "\n" escapes ok)   — or —   GOOGLE_APPLICATION_CREDENTIALS=/path/sa.json
//   GSC_SITE_URL (default --site), e.g. sc-domain:example.com or https://example.com/
//   Missing vars are read from ./.env.local then ./.env (never written).
//
// Commands (all print JSON unless --csv / --md):
//   node gsc.mjs sites
//   node gsc.mjs performance --days 90 --dimensions page[,query|country|device|date] [--filter 'page~^https://x/es/events/'] [--limit 25000] [--csv]
//   node gsc.mjs top-pages   --days 90 --limit 1000 [--csv]                 # clicks-ranked pages (grandfathering list)
//   node gsc.mjs funnel      --days 28 [--buckets buckets.json] [--md]      # clicks/impr/ctr/pos/pages by template × locale
//   node gsc.mjs inspect     --urls urls.txt [--max 200] [--concurrency 4] [--csv]   # URL Inspection verdicts (quota 2,000/day)
//   node gsc.mjs sitemaps                                                    # submitted sitemaps, downloads, errors, counts
//   node gsc.mjs green       --days 28 [--urls urls.txt --max 100] [--md]     # board: which GSC reports are green / red / unknown
//   node gsc.mjs opportunities  --days 28 [--min-impressions 30] [--top 50]   # queries at pos 2.5-20 ranked by click upside
//   node gsc.mjs ctr-gaps       --days 28 [--min-impressions 100]             # top-10 queries clicked far below their position
//   node gsc.mjs cannibalization --days 28                                    # one query → several of our URLs
//   node gsc.mjs movers         --days 28 [--dimensions query|page]           # vs previous window: gained, lost, disappeared
// Add --type discover|googleNews to any performance-based command (default web).
// Not available via API (use the signed-in GSC tab): Page indexing totals, Crawl stats, CWV, Enhancements dashboards, manual actions, links.

import { createSign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { retryDelay } from './lib/http.mjs';
import { parseArgs } from './lib/cli.mjs';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const WMT = 'https://www.googleapis.com/webmasters/v3';
const INSPECT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
const END_LAG_DAYS = 3; // performance data finalises ~2–3 days late

// ---------- args / env ----------
const [, , cmd = 'help', ...rest] = process.argv;
function die(msg) { console.error(`gsc.mjs: ${msg}`); process.exit(1); }
const commandOptions = {
  sites: { value: ['timeout-ms'], boolean: ['csv', 'md'] },
  performance: { value: ['site', 'days', 'dimensions', 'filter', 'limit', 'type', 'timeout-ms'], boolean: ['csv', 'md'] },
  'top-pages': { value: ['site', 'days', 'limit', 'type', 'timeout-ms'], boolean: ['csv', 'md'] },
  funnel: { value: ['site', 'days', 'limit', 'buckets', 'type', 'timeout-ms'], boolean: ['csv', 'md'] },
  inspect: { value: ['site', 'urls', 'max', 'concurrency', 'timeout-ms'], boolean: ['csv', 'md'] },
  sitemaps: { value: ['site', 'timeout-ms'], boolean: ['csv', 'md'] },
  green: { value: ['site', 'days', 'urls', 'max', 'type', 'timeout-ms'], boolean: ['csv', 'md'] },
  opportunities: { value: ['site', 'days', 'limit', 'min-impressions', 'top', 'type', 'timeout-ms'], boolean: ['csv', 'md'] },
  'ctr-gaps': { value: ['site', 'days', 'limit', 'min-impressions', 'top', 'max-ratio', 'type', 'timeout-ms'], boolean: ['csv', 'md'] },
  cannibalization: { value: ['site', 'days', 'limit', 'min-impressions', 'top', 'type', 'timeout-ms'], boolean: ['csv', 'md'] },
  movers: { value: ['site', 'days', 'limit', 'dimensions', 'min-impressions', 'top', 'type', 'timeout-ms'], boolean: ['csv', 'md'] },
  help: { value: [], boolean: [] },
};
let args;
try {
  args = parseArgs(rest, commandOptions[cmd] || { value: [], boolean: [] });
} catch (error) { die(error.message); }
function loadDotEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = resolve(process.cwd(), f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m || process.env[m[1]] !== undefined) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}
loadDotEnv();
const site = args.site !== undefined ? args.site : process.env.GSC_SITE_URL;

// ---------- auth ----------
function creds() {
  try {
    let email; let key;
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const j = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
      email = j.client_email; key = j.private_key;
    } else {
      email = process.env.GSC_CLIENT_EMAIL; key = process.env.GSC_PRIVATE_KEY;
    }
    if (typeof email !== 'string' || !email.trim() || typeof key !== 'string' || !key.trim()) throw new Error('missing client_email/private_key');
    key = key.replace(/\\n/g, '\n').replace(/^"|"$/g, '');
    createSign('RSA-SHA256').update('gsc-credential-preflight').sign(key);
    return { email, key };
  } catch (error) {
    die(`invalid GSC credentials: ${error.message}`);
  }
}
const b64u = (s) => Buffer.from(s).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
let tokenCache = null;
const MAX_RETRIES = 3;
const INTEGER_TEXT = /^(?:0|[1-9][0-9]*)$/;
function integerArg(name, value, fallback, min, max) {
  const text = value === undefined ? String(fallback) : String(value);
  if (!INTEGER_TEXT.test(text)) die(`${name} must be an unsigned integer`);
  const n = Number(text);
  if (!Number.isSafeInteger(n) || n < min || n > max) die(`${name} must be an integer from ${min} to ${max}`);
  return n;
}
const timeoutMs = integerArg('timeout-ms', args['timeout-ms'], 15000, 1000, 120000);
const positiveInt = (name, value, fallback, max) => integerArg(name, value, fallback, 1, max);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(url, options) {
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (response.ok || ![408, 429, 500, 501, 502, 503, 504].includes(response.status) || attempt === MAX_RETRIES - 1) return response;
      await pause(retryDelay(response, attempt));
    } catch (error) {
      clearTimeout(timer); lastError = error;
      if (attempt === MAX_RETRIES - 1) throw new Error(`network/timeout after ${MAX_RETRIES} attempts: ${error.message}`);
      await pause(50 * 2 ** attempt + attempt * 17);
    }
  }
  throw lastError || new Error('request failed');
}
async function token() {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.t;
  const { email, key } = creds();
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }))}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(key, 'base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const res = await request(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }) });
  const j = await res.json();
  if (!res.ok) throw new Error(`token: ${res.status} ${JSON.stringify(j)}`);
  tokenCache = { t: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.t;
}
async function api(url, body) {
  const res = await request(url, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let j; try { j = text ? JSON.parse(text) : {}; } catch { j = { raw: text }; }
  if (!res.ok) throw new Error(`${res.status} ${url.split('?')[0]} ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

// ---------- helpers ----------
const iso = (d) => d.toISOString().slice(0, 10);
function window(days, offsetDays = 0) { const end = new Date(Date.now() - (END_LAG_DAYS + offsetDays) * 86400e3); const start = new Date(end.getTime() - (days - 1) * 86400e3); return { startDate: iso(start), endDate: iso(end) }; }
// Heuristic CTR-by-position curve (industry aggregate, NOT a Google figure) — used only to rank opportunity size.
const CTR_CURVE = { 1: 0.28, 2: 0.15, 3: 0.11, 4: 0.08, 5: 0.06, 6: 0.05, 7: 0.04, 8: 0.033, 9: 0.028, 10: 0.025 };
const ctrAt = (pos) => CTR_CURVE[Math.max(1, Math.round(pos))] ?? (pos <= 20 ? 0.015 : 0.008);
function csv(rows) { if (!rows.length) return ''; const k = Object.keys(rows[0]); const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }; return [k.join(','), ...rows.map((r) => k.map((x) => esc(r[x])).join(','))].join('\n'); }
function md(rows) { if (!rows.length) return '(no rows)'; const k = Object.keys(rows[0]); const cell = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/[\r\n]+/g, '<br>'); return [`| ${k.map(cell).join(' | ')} |`, `|${k.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${k.map((x) => cell(r[x])).join(' | ')} |`)].join('\n'); }
function out(rows, summary) {
  const metadata = [];
  if (summary?.boardCompleteness !== undefined) {
    metadata.push(`boardStatus: ${summary.boardStatus}`, `boardCompleteness: ${summary.boardCompleteness}`);
    metadata.push(`Search Analytics completeness: ${summary.completeness}`, `clientTruncated: ${JSON.stringify(summary.clientTruncated ?? 'unknown')}`);
  } else if (summary?.completeness) metadata.push(`Completeness: ${summary.completeness}`, `clientTruncated: ${JSON.stringify(summary.clientTruncated ?? 'unknown')}`);
  if (args.csv) console.log([...metadata.map((line) => `# ${line}`), csv(rows)].filter(Boolean).join('\n'));
  else if (args.md) console.log([metadata.length ? `Metadata:\n${metadata.map((line) => `- ${line}`).join('\n')}` : null, md(rows)].filter(Boolean).join('\n\n'));
  else console.log(JSON.stringify(summary ? { summary, rows } : rows, null, 2));
}
const analyticsMetadata = (result) => ({ completeness: result.completeness, clientTruncated: result.clientTruncated, truncated: result.truncated });
const SEARCH_DIMENSIONS = new Set(['country', 'device', 'page', 'query', 'searchAppearance', 'date', 'hour']);
const FILTER_DIMENSIONS = new Set(['country', 'device', 'page', 'query', 'searchAppearance']);
const SEARCH_TYPES = new Set(['web', 'image', 'video', 'news', 'discover', 'googleNews']);
const MOVERS_DIMENSIONS = new Set(['query', 'page']);
function urlsFromFile(path) {
  if (!path || !existsSync(path)) die(`--urls file does not exist: ${path || '(missing)'}`);
  let lines;
  try { lines = readFileSync(path, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean); } catch (error) { die(`cannot read --urls file: ${error.message}`); }
  for (const url of lines) {
    try { const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol'); } catch { die(`invalid URL in --urls file: ${url}`); }
  }
  return lines;
}
function dimensionsArg(value, fallback) {
  const values = String(value ?? fallback).split(',');
  if (!values.length || values.some((item) => !SEARCH_DIMENSIONS.has(item)) || new Set(values).size !== values.length) die(`dimensions must be unique values from ${[...SEARCH_DIMENSIONS].join('|')}`);
  return values;
}
function enumArg(name, value, fallback, allowed) {
  const result = String(value ?? fallback);
  if (!allowed.has(result)) die(`${name} must be one of ${[...allowed].join('|')}`);
  return result;
}
function filterArg(value) {
  if (value === undefined) return undefined;
  const text = String(value); const split = text.indexOf('~');
  if (split <= 0 || split === text.length - 1) die('--filter must be dimension~regex');
  const dimension = text.slice(0, split); const expression = text.slice(split + 1);
  if (!FILTER_DIMENSIONS.has(dimension)) die(`filter dimension must be one of ${[...FILTER_DIMENSIONS].join('|')}`);
  try { new RegExp(expression); } catch (error) { die(`invalid filter regex: ${error.message}`); }
  return { dimension, expression };
}
function ratioArg(value, fallback) {
  const text = value === undefined ? String(fallback) : String(value); const result = Number(text);
  if (!Number.isFinite(result) || result <= 0 || result > 1) die('max-ratio must be finite and greater than 0 and at most 1');
  return result;
}
function readBuckets(path) {
  if (!path || !existsSync(path)) die(`--buckets file does not exist: ${path || '(missing)'}`);
  let defs;
  try { defs = JSON.parse(readFileSync(path, 'utf8')); } catch (error) { die(`invalid --buckets JSON: ${error.message}`); }
  if (!Array.isArray(defs)) die('--buckets must contain an array');
  return defs.map((def, index) => {
    if (!def || typeof def !== 'object' || typeof def.name !== 'string' || !def.name.trim() || typeof def.pattern !== 'string' || !def.pattern) die(`invalid --buckets record at index ${index}`);
    try { return { name: def.name, pattern: def.pattern, regex: new RegExp(def.pattern) }; } catch (error) { die(`invalid --buckets regex at index ${index}: ${error.message}`); }
  });
}
const API_COMMANDS = new Set(['sites', 'performance', 'top-pages', 'funnel', 'inspect', 'sitemaps', 'green', 'opportunities', 'ctr-gaps', 'cannibalization', 'movers']);
const SITE_COMMANDS = new Set(['performance', 'top-pages', 'funnel', 'inspect', 'sitemaps', 'green', 'opportunities', 'ctr-gaps', 'cannibalization', 'movers']);
function preflight() {
  if (!API_COMMANDS.has(cmd)) return {};
  if (args.site !== undefined && (typeof args.site !== 'string' || !args.site.trim())) die('--site must be a non-empty property');
  if (SITE_COMMANDS.has(cmd) && (typeof site !== 'string' || !site.trim())) die('--site or GSC_SITE_URL required');
  const config = { type: enumArg('type', args.type, 'web', SEARCH_TYPES) };
  if (cmd === 'performance' || cmd === 'top-pages' || cmd === 'funnel') {
    config.days = integerArg('days', args.days, cmd === 'funnel' ? 28 : 90, 1, 3650);
    config.limit = integerArg('limit', args.limit, cmd === 'top-pages' ? 1000 : 25000, 1, 100000);
    config.dimensions = cmd === 'performance' ? dimensionsArg(args.dimensions, 'page') : undefined;
    config.filter = cmd === 'performance' ? filterArg(args.filter) : undefined;
    config.buckets = cmd === 'funnel' && args.buckets ? readBuckets(args.buckets) : undefined;
  }
  if (cmd === 'inspect') {
    if (!args.urls) die('--urls <file> required (one URL per line)');
    config.urls = urlsFromFile(args.urls); config.max = integerArg('max', args.max, 200, 1, 2000); config.concurrency = integerArg('concurrency', args.concurrency, 4, 1, 20);
  }
  if (cmd === 'green') {
    config.days = integerArg('days', args.days, 28, 1, 3650); config.max = integerArg('max', args.max, 100, 1, 2000); config.urls = args.urls === undefined ? undefined : urlsFromFile(args.urls);
  }
  if (cmd === 'opportunities' || cmd === 'ctr-gaps' || cmd === 'cannibalization' || cmd === 'movers') {
    config.days = integerArg('days', args.days, 28, 1, 3650); config.limit = integerArg('limit', args.limit, 25000, 1, 100000); config.top = integerArg('top', args.top, 50, 1, 100000); config.minImpressions = integerArg('min-impressions', args['min-impressions'], cmd === 'opportunities' ? 30 : cmd === 'ctr-gaps' ? 100 : 50, 0, Number.MAX_SAFE_INTEGER);
    if (cmd === 'ctr-gaps') config.maxRatio = ratioArg(args['max-ratio'], 0.6);
    if (cmd === 'movers') config.dimensions = enumArg('movers dimensions', args.dimensions, 'query', MOVERS_DIMENSIONS);
  }
  if (args.urls !== undefined && config.urls === undefined) config.urls = urlsFromFile(args.urls);
  creds();
  return config;
}

// ---------- commands ----------
async function performance({ days, dimensions, filter, limit, offsetDays = 0, type = 'web' }) {
  if (!site) die('--site or GSC_SITE_URL required');
  if (!Number.isInteger(days) || days < 1 || days > 3650) die('days must be an integer from 1 to 3650');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100000) die('limit must be an integer from 1 to 100000');
  const { startDate, endDate } = window(days, offsetDays);
  const body = { startDate, endDate, dimensions, rowLimit: Math.min(25000, limit), startRow: 0, type };
  if (filter) body.dimensionFilterGroups = [{ filters: [{ dimension: filter.dimension, operator: 'includingRegex', expression: filter.expression }] }];
  const rows = [];
  let truncated = false;
  while (rows.length < limit) {
    const j = await api(`${WMT}/sites/${encodeURIComponent(site)}/searchAnalytics/query`, body);
    const batch = (j.rows || []).map((r) => { const o = {}; dimensions.forEach((d, i) => (o[d] = r.keys[i])); return { ...o, clicks: r.clicks, impressions: r.impressions, ctr: +(r.ctr * 100).toFixed(2), position: +r.position.toFixed(1) }; });
    rows.push(...batch);
    if (batch.length < body.rowLimit) break;
    body.startRow += body.rowLimit;
    if (rows.length >= limit) truncated = true;
  }
  // Search Analytics can omit low-volume rows for privacy and apply internal
  // top-row limits. API pages are never proof of an exhaustive export.
  return { startDate, endDate, rows: rows.slice(0, limit), completeness: 'TOP_ROWS_ONLY; privacy omission possible; completeness unknown; use Search Console bulk export to BigQuery for exhaustive analysis', clientTruncated: truncated, truncated };
}

const DEFAULT_BUCKETS = (u) => {
  // /<xx>/<template>/... → locale xx; /<template>/... (no locale prefix) → locale "(root)"; host root → home.
  const path = u.replace(/^https?:\/\/[^/]+/, '').split(/[?#]/)[0];
  const segs = path.split('/').filter(Boolean);
  if (!segs.length) return { locale: '(root)', template: 'home' };
  if (/^[a-z]{2}$/i.test(segs[0])) return { locale: segs[0].toLowerCase(), template: segs[1] || 'home' };
  return { locale: '(root)', template: segs[0] };
};

async function main() {
  const config = preflight();
  switch (cmd) {
    case 'sites': { const j = await api(`${WMT}/sites`); const rows = j.siteEntry || []; out(rows, { completeness: rows.length ? 'TOP_ROWS_ONLY; COMPLETENESS UNKNOWN' : 'VALID_EMPTY; COMPLETENESS UNKNOWN', sites: rows.length }); break; }
    case 'performance': {
      const r = await performance({ days: config.days, dimensions: config.dimensions, filter: config.filter, limit: config.limit, type: config.type });
      out(r.rows, { site, window: [r.startDate, r.endDate], rows: r.rows.length, ...analyticsMetadata(r) }); break;
    }
    case 'top-pages': {
      const r = await performance({ days: config.days, dimensions: ['page'], limit: config.limit, type: config.type });
      out(r.rows, { site, window: [r.startDate, r.endDate], rows: r.rows.length, ...analyticsMetadata(r) }); break;
    }
    case 'funnel': {
      const r = await performance({ days: config.days, dimensions: ['page'], limit: config.limit, type: config.type });
      let bucketFn = DEFAULT_BUCKETS;
      if (config.buckets) bucketFn = (u) => { const hit = config.buckets.find((d) => d.regex.test(u)); return { locale: DEFAULT_BUCKETS(u).locale, template: hit ? hit.name : 'other' }; };
      const agg = new Map();
      for (const row of r.rows) {
        const { locale, template } = bucketFn(row.page); const k = `${template} ${locale}`;
        const a = agg.get(k) || { template, locale, pages: 0, clicks: 0, impressions: 0, posw: 0 };
        a.pages++; a.clicks += row.clicks; a.impressions += row.impressions; a.posw += row.position * row.impressions; agg.set(k, a);
      }
      const rows = [...agg.values()].map((a) => ({ template: a.template, locale: a.locale, pages_with_impressions: a.pages, clicks: a.clicks, impressions: a.impressions, ctr: +((100 * a.clicks) / Math.max(1, a.impressions)).toFixed(2), position: +(a.posw / Math.max(1, a.impressions)).toFixed(1), clicks_per_page: +(a.clicks / Math.max(1, a.pages)).toFixed(2) })).sort((x, y) => y.clicks - x.clicks);
      const total = rows.reduce((t, x) => ({ pages: t.pages + x.pages_with_impressions, clicks: t.clicks + x.clicks, impressions: t.impressions + x.impressions }), { pages: 0, clicks: 0, impressions: 0 });
      out(rows, { site, window: [r.startDate, r.endDate], ...total, ctr: +((100 * total.clicks) / Math.max(1, total.impressions)).toFixed(2), ...analyticsMetadata(r) }); break;
    }
    case 'inspect': {
      const urls = config.urls.slice(0, config.max);
      if (!urls.length) { out([], { site, inspected: 0, completeness: 'UNKNOWN: no URLs supplied' }); process.exitCode = 3; break; }
      const conc = config.concurrency; const rows = []; let i = 0;
      async function worker() {
        while (i < urls.length) {
          const url = urls[i++];
          try {
            const j = await api(INSPECT, { inspectionUrl: url, siteUrl: site, languageCode: 'en' });
            const r = j.inspectionResult || {}; const idx = r.indexStatusResult || {}; const rr = r.richResultsResult || {};
            const types = (rr.detectedItems || []).map((d) => d.richResultType); const issues = (rr.detectedItems || []).flatMap((d) => (d.items || []).flatMap((it) => (it.issues || []).map((x) => `${x.severity}:${x.issueMessage}`)));
            rows.push({ url, verdict: idx.verdict, coverage: idx.coverageState, indexing: idx.indexingState, robots: idx.robotsTxtState, fetch: idx.pageFetchState, lastCrawl: idx.lastCrawlTime, crawledAs: idx.crawledAs, canonical_ok: idx.googleCanonical ? idx.googleCanonical === (idx.userCanonical || url) : null, googleCanonical: idx.googleCanonical, richResults: types.join('|'), richIssues: issues.join('; ').slice(0, 300), sitemaps: (idx.sitemap || []).length, referrers: (idx.referringUrls || []).slice(0, 2).join('|') });
          } catch (e) { rows.push({ url, verdict: 'ERROR', coverage: String(e.message).slice(0, 200) }); }
        }
      }
      await Promise.all(Array.from({ length: conc }, worker));
      const byCoverage = {}; for (const r of rows) byCoverage[r.coverage || r.verdict] = (byCoverage[r.coverage || r.verdict] || 0) + 1;
      const observedFail = rows.some((row) => row.verdict !== 'ERROR' && /not indexed|fail/i.test(`${row.verdict || ''} ${row.coverage || ''}`));
      const unknown = rows.some((row) => row.verdict === 'ERROR' || !row.verdict);
      out(rows, { site, inspected: rows.length, byCoverage, completeness: unknown ? 'UNKNOWN' : 'OBSERVED' }); process.exitCode = observedFail ? 2 : unknown ? 3 : 0; break;
    }
    case 'opportunities': {
      // Queries already close to the top: where do a few positions buy the most clicks?
      const { days, minImpressions: minImpr, limit, top } = config;
      const r = await performance({ days, dimensions: ['query'], limit, type: config.type });
      const rows = r.rows
        .filter((q) => q.impressions >= minImpr && q.position >= 2.5 && q.position <= 20)
        .map((q) => { const target = ctrAt(3); const gap = Math.round(q.impressions * target - q.clicks); return { ...q, band: q.position <= 10 ? 'page1 (2.5-10)' : 'striking (10-20)', clicks_if_top3_heuristic: Math.round(q.impressions * target), upside_clicks: gap }; })
        .filter((q) => q.upside_clicks > 0).sort((a, b) => b.upside_clicks - a.upside_clicks).slice(0, top);
      out(rows, { site, window: [r.startDate, r.endDate], note: 'upside uses a heuristic CTR curve (not a Google figure) — ranking aid only', totalUpside: rows.reduce((a, x) => a + x.upside_clicks, 0), ...analyticsMetadata(r) }); break;
    }
    case 'ctr-gaps': {
      // Ranking well but under-clicked → snippet/title/format problem, not a ranking problem.
      const { days, minImpressions: minImpr, limit, top, maxRatio } = config;
      const r = await performance({ days, dimensions: ['query'], limit, type: config.type });
      const rows = r.rows.filter((q) => q.impressions >= minImpr && q.position <= 10)
        .map((q) => ({ ...q, expected_ctr: +(100 * ctrAt(q.position)).toFixed(2), ctr_ratio: +((q.ctr / 100) / ctrAt(q.position)).toFixed(2) }))
        .filter((q) => q.ctr_ratio < maxRatio).sort((a, b) => b.impressions - a.impressions).slice(0, top);
      out(rows, { site, window: [r.startDate, r.endDate], note: 'expected_ctr from the heuristic curve; ratio < 1 = under-clicked for its position', ...analyticsMetadata(r) }); break;
    }
    case 'cannibalization': {
      // One query, several of our URLs → we split our own signals.
      const { days, minImpressions: minImpr, limit, top } = config;
      const r = await performance({ days, dimensions: ['query', 'page'], limit, type: config.type });
      const byQuery = new Map();
      for (const row of r.rows) { const a = byQuery.get(row.query) || { query: row.query, pages: [], impressions: 0, clicks: 0 }; a.pages.push({ page: row.page, clicks: row.clicks, impressions: row.impressions, position: row.position }); a.impressions += row.impressions; a.clicks += row.clicks; byQuery.set(row.query, a); }
      const rows = [...byQuery.values()].filter((q) => q.pages.length > 1 && q.impressions >= minImpr)
        .map((q) => { q.pages.sort((a, b) => b.impressions - a.impressions); const top = q.pages[0]; return { query: q.query, urls: q.pages.length, impressions: q.impressions, clicks: q.clicks, top_page: top.page, top_share: +((100 * top.impressions) / q.impressions).toFixed(0), best_position: Math.min(...q.pages.map((p) => p.position)).toFixed(1), competing: q.pages.slice(1, 4).map((p) => `${p.page} (${p.impressions}i @${p.position.toFixed(1)})`).join(' ; ') }; })
        .sort((a, b) => b.impressions - a.impressions).slice(0, top);
      out(rows, { site, window: [r.startDate, r.endDate], queriesWithSplit: rows.length, ...analyticsMetadata(r) }); break;
    }
    case 'movers': {
      // What changed vs the previous equal-length window — by query (default) or page.
      const { days, dimensions: dim, minImpressions: minImpr, top, limit } = config;
      const cur = await performance({ days, dimensions: [dim], limit, type: config.type });
      const prev = await performance({ days, dimensions: [dim], limit, offsetDays: days, type: config.type });
      const currentByKey = new Map(cur.rows.map((row) => [row[dim], row]));
      const previousByKey = new Map(prev.rows.map((row) => [row[dim], row]));
      const unknownDetail = 'comparison row absent from one window; privacy/top-row omission may explain the gap';
      const observed = cur.rows.filter((row) => row.impressions >= minImpr || (previousByKey.get(row[dim])?.impressions || 0) >= minImpr).map((row) => {
        const before = previousByKey.get(row[dim]);
        if (!before) return { [dim]: row[dim], clicks: row.clicks, d_clicks: null, impressions: row.impressions, d_impressions: null, position: row.position, d_position: null, status: 'UNKNOWN', detail: unknownDetail };
        return { [dim]: row[dim], clicks: row.clicks, d_clicks: row.clicks - before.clicks, impressions: row.impressions, d_impressions: row.impressions - before.impressions, position: row.position, d_position: +(before.position - row.position).toFixed(1) };
      }).sort((a, b) => (a.status === 'UNKNOWN') - (b.status === 'UNKNOWN') || Math.abs(b.d_clicks || 0) - Math.abs(a.d_clicks || 0)).slice(0, top);
      const missingPrevious = prev.rows.filter((row) => row.impressions >= minImpr && !currentByKey.has(row[dim])).slice(0, top).map((row) => ({ [dim]: row[dim], clicks: null, d_clicks: null, impressions: null, d_impressions: null, position: null, d_position: null, status: 'UNKNOWN', detail: unknownDetail }));
      const unknownRows = [...observed, ...missingPrevious].filter((row) => row.status === 'UNKNOWN');
      const incomplete = unknownRows.length > 0 || cur.clientTruncated || prev.clientTruncated;
      out([...observed, ...missingPrevious], { site, current: [cur.startDate, cur.endDate], previous: [prev.startDate, prev.endDate], completeness: incomplete ? 'UNKNOWN: comparison windows are incomplete' : cur.completeness, clientTruncated: { current: cur.clientTruncated, previous: prev.clientTruncated }, currentCompleteness: cur.completeness, previousCompleteness: prev.completeness }); process.exitCode = incomplete ? 3 : 0; break;
    }
    case 'green': {
      // Board of what the API can prove. Tab-only reports are listed as UNKNOWN, never as green.
      const board = []; const push = (report, source, status, detail) => board.push({ report, source, status, detail });
      try { const s = await api(`${WMT}/sites/${encodeURIComponent(site)}/sitemaps`); const sm = s.sitemap || []; const errs = sm.reduce((a, x) => a + (+x.errors || 0), 0); const warns = sm.reduce((a, x) => a + (+x.warnings || 0), 0); const pending = sm.filter((x) => x.isPending).length; const staleOrMissing = sm.filter((x) => !x.lastDownloaded || !Number.isFinite(Date.parse(x.lastDownloaded)) || Date.now() - Date.parse(x.lastDownloaded) > 7 * 86400e3).length;
        push('Sitemaps', 'API', !sm.length ? 'UNKNOWN' : errs || warns || pending || staleOrMissing ? 'RED' : 'GREEN', `${sm.length} submitted, ${errs} errors, ${warns} warnings, ${pending} pending, ${staleOrMissing} missing/stale download`); } catch (e) { push('Sitemaps', 'API', 'UNKNOWN', e.message); }
      const { days } = config;
      const d = await performance({ days, dimensions: ['date'], limit: Math.max(1000, days), type: config.type });
      const impr = d.rows.map((x) => x.impressions).sort((a, b) => a - b); const med = impr[Math.floor(impr.length / 2)] || 0;
      const bad = d.rows.filter((x) => x.impressions < med * 0.5).map((x) => x.date);
      const expectedDates = new Set(); const start = new Date(`${d.startDate}T00:00:00Z`); const end = new Date(`${d.endDate}T00:00:00Z`);
      for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 86400e3)) expectedDates.add(iso(cursor));
      const actualDates = new Set(d.rows.map((row) => row.date).filter(Boolean)); const missingDates = [...expectedDates].filter((date) => !actualDates.has(date));
      const continuityIncomplete = !d.rows.length || d.clientTruncated || missingDates.length > 0;
      const continuityStatus = continuityIncomplete ? 'UNKNOWN' : bad.length === 0 ? 'GREEN' : 'AMBER';
      const continuityDetail = !d.rows.length ? 'no performance rows returned; insufficient evidence' : d.clientTruncated ? 'Search Analytics response was client-truncated; continuity is incomplete' : missingDates.length ? `missing ${missingDates.length} expected date(s): ${missingDates.slice(0, 5).join(', ')}` : bad.length ? `${bad.length} day(s) below 50% of median: ${bad.slice(0, 5).join(', ')}` : `no collapse days (median ${med}/day)`;
      push('Performance continuity', 'API', continuityStatus, continuityDetail);
      const tot = d.rows.reduce((a, x) => ({ c: a.c + x.clicks, i: a.i + x.impressions }), { c: 0, i: 0 });
      push('Clicks / impressions', 'API', 'INFO', `${tot.c} clicks, ${tot.i} impressions, CTR ${(100 * tot.c / Math.max(1, tot.i)).toFixed(2)}% over ${days}d`);
      if (config.urls) {
        const urls = config.urls.slice(0, config.max);
        const counts = {}; let rich = 0, richIssues = 0, canonMismatch = 0;
        for (const url of urls) { try { const j = await api(INSPECT, { inspectionUrl: url, siteUrl: site, languageCode: 'en' }); const idx = j.inspectionResult?.indexStatusResult || {}; const rr = j.inspectionResult?.richResultsResult; counts[idx.coverageState || idx.verdict || 'unknown'] = (counts[idx.coverageState || idx.verdict || 'unknown'] || 0) + 1; if (idx.googleCanonical && idx.googleCanonical !== (idx.userCanonical || url)) canonMismatch++; if (rr) { rich++; richIssues += (rr.detectedItems || []).flatMap((x) => (x.items || []).flatMap((i) => i.issues || [])).length; } } catch { counts.ERROR = (counts.ERROR || 0) + 1; } }
        const indexed = Object.entries(counts).filter(([k]) => /indexed/i.test(k) && !/not indexed/i.test(k)).reduce((a, [, v]) => a + v, 0); const unavailable = !urls.length || counts.ERROR;
        const status = unavailable ? 'UNKNOWN' : indexed === urls.length ? 'GREEN' : 'RED';
        push('Indexing (sample)', 'API sample', status, unavailable ? 'inspection request failed or no URLs supplied; insufficient evidence' : `${indexed}/${urls.length} indexed — ${JSON.stringify(counts)}`);
        push('Canonical agreement (sample)', 'API sample', unavailable ? 'UNKNOWN' : canonMismatch === 0 ? 'GREEN' : 'RED', unavailable ? 'inspection request failed or no URLs supplied; insufficient evidence' : `${canonMismatch} URL(s) where Google picked a different canonical`);
        push('Rich results (sample)', 'API sample', unavailable ? 'UNKNOWN' : richIssues === 0 ? 'GREEN' : 'AMBER', unavailable ? 'inspection request failed or no URLs supplied; insufficient evidence' : `${rich} URL(s) with items, ${richIssues} issue(s)`);
      } else push('Indexing / canonical / rich results', 'API sample', 'UNKNOWN', 'pass --urls <file> to sample (URL Inspection, ≤2,000/day)');
      for (const [r2, why] of [['Page indexing totals', 'no API — read in the GSC UI (indexed vs not-indexed by reason)'], ['Crawl stats', 'no API — GSC UI (Settings → Crawl stats)'], ['Core Web Vitals', 'no API here — GSC UI or PageSpeed Insights/CrUX'], ['Enhancements dashboards', 'no API — GSC UI (per-type valid/invalid)'], ['Manual actions & Security', 'no API — GSC UI (must be empty)'], ['Links report', 'no API — GSC UI']]) push(r2, 'UI only', 'UNKNOWN', why);
      for (const row of board) row.status = ({ GREEN: 'PASS', RED: 'FAIL', AMBER: 'FAIL', INFO: 'N/A', ERROR: 'UNKNOWN' })[row.status] || row.status;
      const required = board.filter((row) => row.status !== 'N/A'); const hasFail = required.some((row) => row.status === 'FAIL'); const hasUnknown = required.some((row) => row.status === 'UNKNOWN');
      const pass = board.filter((b) => b.status === 'PASS').length;
      const fail = board.filter((b) => b.status === 'FAIL').length;
      const unknown = board.filter((b) => b.status === 'UNKNOWN').length;
      const notApplicable = board.filter((b) => b.status === 'N/A').length;
      const boardStatus = fail ? 'FAIL' : unknown ? 'UNKNOWN' : pass ? 'PASS' : 'N/A';
      const summary = { site, window: [d.startDate, d.endDate], boardStatus, boardCompleteness: unknown ? 'UNKNOWN' : 'OBSERVED', pass, fail, unknown, notApplicable, completeness: d.completeness, clientTruncated: d.clientTruncated };
      out(board, summary); process.exitCode = hasFail ? 2 : hasUnknown ? 3 : 0; break;
    }
    case 'sitemaps': {
      if (!site) die('--site or GSC_SITE_URL required');
      const j = await api(`${WMT}/sites/${encodeURIComponent(site)}/sitemaps`);
      const rows = (j.sitemap || []).map((s) => ({ path: s.path, type: s.type, isSitemapsIndex: !!s.isSitemapsIndex, lastSubmitted: s.lastSubmitted, lastDownloaded: s.lastDownloaded, isPending: !!s.isPending, errors: +s.errors || 0, warnings: +s.warnings || 0, submitted: (s.contents || []).map((c) => `${c.type}:${c.submitted}`).join('|') }));
      out(rows, { site, sitemaps: rows.length }); break;
    }
    case 'help':
      console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 23).join('\n').replace(/^\/\/ ?/gm, ''));
      break;
    default:
      console.error(`gsc.mjs: unsupported command: ${cmd}`);
      console.error(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 23).join('\n').replace(/^\/\/ ?/gm, ''));
      process.exitCode = 1;
  }
}
main().catch((e) => { console.error(`gsc.mjs: ${e.message}`); process.exit(3); });
