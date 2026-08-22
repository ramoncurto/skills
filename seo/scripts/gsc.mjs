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
function window(days, offsetDays = 0) { const end = new Date(Date.now() - (END_LAG_DAYS + offsetDays) * 86400e3); const start = new Date(end.getTime() - (days - 1) * 86400e3); return { startDate: iso(start), endDate: iso(end) }; }
// Heuristic CTR-by-position curve (industry aggregate, NOT a Google figure) — used only to rank opportunity size.
const CTR_CURVE = { 1: 0.28, 2: 0.15, 3: 0.11, 4: 0.08, 5: 0.06, 6: 0.05, 7: 0.04, 8: 0.033, 9: 0.028, 10: 0.025 };
const ctrAt = (pos) => CTR_CURVE[Math.max(1, Math.round(pos))] ?? (pos <= 20 ? 0.015 : 0.008);
function csv(rows) { if (!rows.length) return ''; const k = Object.keys(rows[0]); const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }; return [k.join(','), ...rows.map((r) => k.map((x) => esc(r[x])).join(','))].join('\n'); }
function md(rows) { if (!rows.length) return '(no rows)'; const k = Object.keys(rows[0]); return [`| ${k.join(' | ')} |`, `|${k.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${k.map((x) => r[x]).join(' | ')} |`)].join('\n'); }
function out(rows, summary) { if (args.csv) console.log(csv(rows)); else if (args.md) console.log(md(rows)); else console.log(JSON.stringify(summary ? { summary, rows } : rows, null, 2)); }

// ---------- commands ----------
async function performance({ days, dimensions, filter, limit, offsetDays = 0 }) {
  if (!site) die('--site or GSC_SITE_URL required');
  const { startDate, endDate } = window(days, offsetDays);
  const body = { startDate, endDate, dimensions, rowLimit: Math.min(25000, limit), startRow: 0, type: args.type || 'web' };
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
    case 'opportunities': {
      // Queries already close to the top: where do a few positions buy the most clicks?
      const days = +(args.days || 28), minImpr = +(args['min-impressions'] || 30);
      const r = await performance({ days, dimensions: ['query'], limit: +(args.limit || 25000) });
      const rows = r.rows
        .filter((q) => q.impressions >= minImpr && q.position >= 2.5 && q.position <= 20)
        .map((q) => { const target = ctrAt(3); const gap = Math.round(q.impressions * target - q.clicks); return { ...q, band: q.position <= 10 ? 'page1 (2.5-10)' : 'striking (10-20)', clicks_if_top3_heuristic: Math.round(q.impressions * target), upside_clicks: gap }; })
        .filter((q) => q.upside_clicks > 0).sort((a, b) => b.upside_clicks - a.upside_clicks).slice(0, +(args.top || 50));
      out(rows, { site, window: [r.startDate, r.endDate], note: 'upside uses a heuristic CTR curve (not a Google figure) — ranking aid only', totalUpside: rows.reduce((a, x) => a + x.upside_clicks, 0) }); break;
    }
    case 'ctr-gaps': {
      // Ranking well but under-clicked → snippet/title/format problem, not a ranking problem.
      const days = +(args.days || 28), minImpr = +(args['min-impressions'] || 100);
      const r = await performance({ days, dimensions: ['query'], limit: +(args.limit || 25000) });
      const rows = r.rows.filter((q) => q.impressions >= minImpr && q.position <= 10)
        .map((q) => ({ ...q, expected_ctr: +(100 * ctrAt(q.position)).toFixed(2), ctr_ratio: +((q.ctr / 100) / ctrAt(q.position)).toFixed(2) }))
        .filter((q) => q.ctr_ratio < +(args['max-ratio'] || 0.6)).sort((a, b) => b.impressions - a.impressions).slice(0, +(args.top || 50));
      out(rows, { site, window: [r.startDate, r.endDate], note: 'expected_ctr from the heuristic curve; ratio < 1 = under-clicked for its position' }); break;
    }
    case 'cannibalization': {
      // One query, several of our URLs → we split our own signals.
      const days = +(args.days || 28), minImpr = +(args['min-impressions'] || 50);
      const r = await performance({ days, dimensions: ['query', 'page'], limit: +(args.limit || 25000) });
      const byQuery = new Map();
      for (const row of r.rows) { const a = byQuery.get(row.query) || { query: row.query, pages: [], impressions: 0, clicks: 0 }; a.pages.push({ page: row.page, clicks: row.clicks, impressions: row.impressions, position: row.position }); a.impressions += row.impressions; a.clicks += row.clicks; byQuery.set(row.query, a); }
      const rows = [...byQuery.values()].filter((q) => q.pages.length > 1 && q.impressions >= minImpr)
        .map((q) => { q.pages.sort((a, b) => b.impressions - a.impressions); const top = q.pages[0]; return { query: q.query, urls: q.pages.length, impressions: q.impressions, clicks: q.clicks, top_page: top.page, top_share: +((100 * top.impressions) / q.impressions).toFixed(0), best_position: Math.min(...q.pages.map((p) => p.position)).toFixed(1), competing: q.pages.slice(1, 4).map((p) => `${p.page} (${p.impressions}i @${p.position.toFixed(1)})`).join(' ; ') }; })
        .sort((a, b) => b.impressions - a.impressions).slice(0, +(args.top || 50));
      out(rows, { site, window: [r.startDate, r.endDate], queriesWithSplit: rows.length }); break;
    }
    case 'movers': {
      // What changed vs the previous equal-length window — by query (default) or page.
      const days = +(args.days || 28), dim = args.dimensions || 'query', minImpr = +(args['min-impressions'] || 30);
      const cur = await performance({ days, dimensions: [dim], limit: 25000 });
      const prev = await performance({ days, dimensions: [dim], limit: 25000, offsetDays: days });
      const p = new Map(prev.rows.map((x) => [x[dim], x]));
      const rows = cur.rows.filter((c) => c.impressions >= minImpr || (p.get(c[dim])?.impressions || 0) >= minImpr)
        .map((c) => { const b = p.get(c[dim]) || { clicks: 0, impressions: 0, position: 100 }; return { [dim]: c[dim], clicks: c.clicks, d_clicks: c.clicks - b.clicks, impressions: c.impressions, d_impressions: c.impressions - b.impressions, position: c.position, d_position: +(b.position - c.position).toFixed(1) }; })
        .sort((a, b) => Math.abs(b.d_clicks) - Math.abs(a.d_clicks)).slice(0, +(args.top || 50));
      const lost = prev.rows.filter((b) => b.impressions >= minImpr * 3 && !cur.rows.some((c) => c[dim] === b[dim])).slice(0, 20).map((b) => ({ [dim]: b[dim], clicks: 0, d_clicks: -b.clicks, impressions: 0, d_impressions: -b.impressions, position: null, d_position: null }));
      out([...rows, ...lost], { site, current: [cur.startDate, cur.endDate], previous: [prev.startDate, prev.endDate], disappeared: lost.length }); break;
    }
    case 'green': {
      // Board of what the API can prove. Tab-only reports are listed as UNKNOWN, never as green.
      const board = []; const push = (report, source, status, detail) => board.push({ report, source, status, detail });
      try { const s = await api(`${WMT}/sites/${encodeURIComponent(site)}/sitemaps`); const sm = s.sitemap || []; const errs = sm.reduce((a, x) => a + (+x.errors || 0), 0); const warns = sm.reduce((a, x) => a + (+x.warnings || 0), 0); const stale = sm.filter((x) => x.lastDownloaded && (Date.now() - Date.parse(x.lastDownloaded)) > 7 * 86400e3).length;
        push('Sitemaps', 'API', errs === 0 && sm.length > 0 ? 'GREEN' : 'RED', `${sm.length} submitted, ${errs} errors, ${warns} warnings, ${stale} not downloaded in 7d`); } catch (e) { push('Sitemaps', 'API', 'ERROR', e.message); }
      const days = +(args.days || 28);
      const d = await performance({ days, dimensions: ['date'], limit: 1000 });
      const impr = d.rows.map((x) => x.impressions).sort((a, b) => a - b); const med = impr[Math.floor(impr.length / 2)] || 0;
      const bad = d.rows.filter((x) => x.impressions < med * 0.5).map((x) => x.date);
      push('Performance continuity', 'API', bad.length === 0 ? 'GREEN' : 'AMBER', bad.length ? `${bad.length} day(s) below 50% of median: ${bad.slice(0, 5).join(', ')}` : `no collapse days (median ${med}/day)`);
      const tot = d.rows.reduce((a, x) => ({ c: a.c + x.clicks, i: a.i + x.impressions }), { c: 0, i: 0 });
      push('Clicks / impressions', 'API', 'INFO', `${tot.c} clicks, ${tot.i} impressions, CTR ${(100 * tot.c / Math.max(1, tot.i)).toFixed(2)}% over ${days}d`);
      if (args.urls) {
        const urls = readFileSync(args.urls, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, +(args.max || 100));
        const counts = {}; let rich = 0, richIssues = 0, canonMismatch = 0;
        for (const url of urls) { try { const j = await api(INSPECT, { inspectionUrl: url, siteUrl: site, languageCode: 'en' }); const idx = j.inspectionResult?.indexStatusResult || {}; const rr = j.inspectionResult?.richResultsResult; counts[idx.coverageState || idx.verdict || 'unknown'] = (counts[idx.coverageState || idx.verdict || 'unknown'] || 0) + 1; if (idx.googleCanonical && idx.googleCanonical !== (idx.userCanonical || url)) canonMismatch++; if (rr) { rich++; richIssues += (rr.detectedItems || []).flatMap((x) => (x.items || []).flatMap((i) => i.issues || [])).length; } } catch { counts.ERROR = (counts.ERROR || 0) + 1; } }
        const indexed = Object.entries(counts).filter(([k]) => /indexed/i.test(k) && !/not indexed/i.test(k)).reduce((a, [, v]) => a + v, 0);
        push('Indexing (sample)', 'API sample', indexed === urls.length ? 'GREEN' : 'RED', `${indexed}/${urls.length} indexed — ${JSON.stringify(counts)}`);
        push('Canonical agreement (sample)', 'API sample', canonMismatch === 0 ? 'GREEN' : 'RED', `${canonMismatch} URL(s) where Google picked a different canonical`);
        push('Rich results (sample)', 'API sample', richIssues === 0 ? 'GREEN' : 'AMBER', `${rich} URL(s) with items, ${richIssues} issue(s)`);
      } else push('Indexing / canonical / rich results', 'API sample', 'UNKNOWN', 'pass --urls <file> to sample (URL Inspection, ≤2,000/day)');
      for (const [r2, why] of [['Page indexing totals', 'no API — read in the GSC UI (indexed vs not-indexed by reason)'], ['Crawl stats', 'no API — GSC UI (Settings → Crawl stats)'], ['Core Web Vitals', 'no API here — GSC UI or PageSpeed Insights/CrUX'], ['Enhancements dashboards', 'no API — GSC UI (per-type valid/invalid)'], ['Manual actions & Security', 'no API — GSC UI (must be empty)'], ['Links report', 'no API — GSC UI']]) push(r2, 'UI only', 'UNKNOWN', why);
      out(board, { site, greens: board.filter((b) => b.status === 'GREEN').length, reds: board.filter((b) => b.status === 'RED').length, unknown: board.filter((b) => b.status === 'UNKNOWN').length }); break;
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
