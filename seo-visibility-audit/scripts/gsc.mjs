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
// Not available via API (use the signed-in GSC tab or sampling): Page indexing totals, Crawl stats, CWV, Enhancements dashboards.

import { createSign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const WMT = 'https://www.googleapis.com/webmasters/v3';
const INSPECT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
const END_LAG_DAYS = 3; // performance data finalises ~2–3 days late

// ---------- args / env ----------
const [, , cmd = 'help', ...rest] = process.argv;
const args = {};
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a.startsWith('--')) { const k = a.slice(2); const v = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : 'true'; args[k] = v; }
}
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
const site = args.site || process.env.GSC_SITE_URL;
function die(msg) { console.error(`gsc.mjs: ${msg}`); process.exit(2); }

// ---------- auth ----------
function creds() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const j = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
    return { email: j.client_email, key: j.private_key };
  }
  const email = process.env.GSC_CLIENT_EMAIL; let key = process.env.GSC_PRIVATE_KEY;
  if (!email || !key) die('missing GSC_CLIENT_EMAIL/GSC_PRIVATE_KEY (or GOOGLE_APPLICATION_CREDENTIALS)');
  key = key.replace(/\\n/g, '\n').replace(/^"|"$/g, '');
  return { email, key };
}
const b64u = (s) => Buffer.from(s).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
let tokenCache = null;
async function token() {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.t;
  const { email, key } = creds();
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }))}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(key, 'base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }) });
  const j = await res.json();
  if (!res.ok) die(`token: ${res.status} ${JSON.stringify(j)}`);
  tokenCache = { t: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.t;
}
async function api(url, body) {
  const res = await fetch(url, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let j; try { j = text ? JSON.parse(text) : {}; } catch { j = { raw: text }; }
  if (!res.ok) throw new Error(`${res.status} ${url.split('?')[0]} ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

// ---------- helpers ----------
const iso = (d) => d.toISOString().slice(0, 10);
function window(days) { const end = new Date(Date.now() - END_LAG_DAYS * 86400e3); const start = new Date(end.getTime() - (days - 1) * 86400e3); return { startDate: iso(start), endDate: iso(end) }; }
function csv(rows) { if (!rows.length) return ''; const k = Object.keys(rows[0]); const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }; return [k.join(','), ...rows.map((r) => k.map((x) => esc(r[x])).join(','))].join('\n'); }
function md(rows) { if (!rows.length) return '(no rows)'; const k = Object.keys(rows[0]); return [`| ${k.join(' | ')} |`, `|${k.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${k.map((x) => r[x]).join(' | ')} |`)].join('\n'); }
function out(rows, summary) { if (args.csv) console.log(csv(rows)); else if (args.md) console.log(md(rows)); else console.log(JSON.stringify(summary ? { summary, rows } : rows, null, 2)); }

// ---------- commands ----------
async function performance({ days, dimensions, filter, limit }) {
  if (!site) die('--site or GSC_SITE_URL required');
  const { startDate, endDate } = window(days);
  const body = { startDate, endDate, dimensions, rowLimit: Math.min(25000, limit), startRow: 0, type: 'web' };
  if (filter) { const [dim, expr] = filter.split('~'); body.dimensionFilterGroups = [{ filters: [{ dimension: dim, operator: 'includingRegex', expression: expr }] }]; }
  const rows = [];
  while (rows.length < limit) {
    const j = await api(`${WMT}/sites/${encodeURIComponent(site)}/searchAnalytics/query`, body);
    const batch = (j.rows || []).map((r) => { const o = {}; dimensions.forEach((d, i) => (o[d] = r.keys[i])); return { ...o, clicks: r.clicks, impressions: r.impressions, ctr: +(r.ctr * 100).toFixed(2), position: +r.position.toFixed(1) }; });
    rows.push(...batch);
    if (batch.length < body.rowLimit) break;
    body.startRow += body.rowLimit;
  }
  return { startDate, endDate, rows: rows.slice(0, limit) };
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
  switch (cmd) {
    case 'sites': { const j = await api(`${WMT}/sites`); out(j.siteEntry || []); break; }
    case 'performance': {
      const r = await performance({ days: +(args.days || 90), dimensions: (args.dimensions || 'page').split(','), filter: args.filter, limit: +(args.limit || 25000) });
      out(r.rows, { site, window: [r.startDate, r.endDate], rows: r.rows.length }); break;
    }
    case 'top-pages': {
      const r = await performance({ days: +(args.days || 90), dimensions: ['page'], limit: +(args.limit || 1000) });
      out(r.rows, { site, window: [r.startDate, r.endDate], rows: r.rows.length }); break;
    }
    case 'funnel': {
      const r = await performance({ days: +(args.days || 28), dimensions: ['page'], limit: +(args.limit || 100000) });
      let bucketFn = DEFAULT_BUCKETS;
      if (args.buckets) { const defs = JSON.parse(readFileSync(args.buckets, 'utf8')); bucketFn = (u) => { const hit = defs.find((d) => new RegExp(d.pattern).test(u)); return { locale: DEFAULT_BUCKETS(u).locale, template: hit ? hit.name : 'other' }; }; }
      const agg = new Map();
      for (const row of r.rows) {
        const { locale, template } = bucketFn(row.page); const k = `${template} ${locale}`;
        const a = agg.get(k) || { template, locale, pages: 0, clicks: 0, impressions: 0, posw: 0 };
        a.pages++; a.clicks += row.clicks; a.impressions += row.impressions; a.posw += row.position * row.impressions; agg.set(k, a);
      }
      const rows = [...agg.values()].map((a) => ({ template: a.template, locale: a.locale, pages_with_impressions: a.pages, clicks: a.clicks, impressions: a.impressions, ctr: +((100 * a.clicks) / Math.max(1, a.impressions)).toFixed(2), position: +(a.posw / Math.max(1, a.impressions)).toFixed(1), clicks_per_page: +(a.clicks / Math.max(1, a.pages)).toFixed(2) })).sort((x, y) => y.clicks - x.clicks);
      const total = rows.reduce((t, x) => ({ pages: t.pages + x.pages_with_impressions, clicks: t.clicks + x.clicks, impressions: t.impressions + x.impressions }), { pages: 0, clicks: 0, impressions: 0 });
      out(rows, { site, window: [r.startDate, r.endDate], ...total, ctr: +((100 * total.clicks) / Math.max(1, total.impressions)).toFixed(2) }); break;
    }
    case 'inspect': {
      if (!site) die('--site or GSC_SITE_URL required');
      if (!args.urls) die('--urls <file> required (one URL per line)');
      const urls = readFileSync(args.urls, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, +(args.max || 200));
      const conc = +(args.concurrency || 4); const rows = []; let i = 0;
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
      out(rows, { site, inspected: rows.length, byCoverage }); break;
    }
    case 'sitemaps': {
      if (!site) die('--site or GSC_SITE_URL required');
      const j = await api(`${WMT}/sites/${encodeURIComponent(site)}/sitemaps`);
      const rows = (j.sitemap || []).map((s) => ({ path: s.path, type: s.type, isSitemapsIndex: !!s.isSitemapsIndex, lastSubmitted: s.lastSubmitted, lastDownloaded: s.lastDownloaded, isPending: !!s.isPending, errors: +s.errors || 0, warnings: +s.warnings || 0, submitted: (s.contents || []).map((c) => `${c.type}:${c.submitted}`).join('|') }));
      out(rows, { site, sitemaps: rows.length }); break;
    }
    default:
      console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 16).join('\n').replace(/^\/\/ ?/gm, ''));
  }
}
main().catch((e) => { console.error(`gsc.mjs: ${e.message}`); process.exit(1); });
