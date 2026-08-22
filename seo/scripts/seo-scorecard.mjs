#!/usr/bin/env node
// seo-scorecard.mjs — deterministic technical-SEO scorecard: the experiment runner behind /seo mode C (autoresearch keep/revert).
// It never changes anything; it measures the working tree (static checks) and/or a live/preview site (live checks)
// and prints a score you can keep/revert against.
//
// Usage: node seo-scorecard.mjs --config scripts/seo/scorecard.config.json [--base https://preview.host] [--out .agents/runs/seo-scorecard]
//        [--compare prev.json] [--static-only | --live-only] [--md]
// Exit: 0 ok · 2 a guardrail failed (= REVERT) · 1 error.
//
// Config (JSON): { base, userAgent?, sitemapIndex?, hreflangSample?, samples:[{path, template}], thresholds:{<template|default>:{maxRawKB,maxRscShare,minWords}},
//                  jsonld:{<template>:["SportsEvent|Event","BreadcrumbList"]}, staticChecks:[{name, cmd, guardrail?}], weights?:{live,static,guardrail} }

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2); const args = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const k = argv[i].slice(2); args[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'; }
if (!args.config) { console.error('--config <file> required'); process.exit(1); }
const cfg = JSON.parse(readFileSync(args.config, 'utf8'));
const BASE = (args.base || cfg.base || '').replace(/\/$/, '');
const UA = cfg.userAgent || 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const OUT = args.out || cfg.out || '.agents/runs/seo-scorecard';
const W = { live: 1, static: 1, guardrail: 5, ...(cfg.weights || {}) };
const checks = [];
const add = (group, name, pass, detail = '', guardrail = false) => checks.push({ group, name, pass: !!pass, detail: String(detail).slice(0, 240), guardrail });

// ---------- fetch helpers ----------
function fetchPage(url) {
  const hdr = join(OUT, '.h'); const body = join(OUT, '.b');
  const r = spawnSync('curl', ['-sL', '--compressed', '-A', UA, '-D', hdr, '-o', body, '-w', '%{http_code} %{num_redirects} %{size_download} %{url_effective}', url], { encoding: 'utf8' });
  const [code, redirects, gz, finalUrl] = (r.stdout || '').trim().split(' ');
  const headersRaw = existsSync(hdr) ? readFileSync(hdr, 'utf8') : '';
  const lastBlock = headersRaw.trim().split(/\r?\n\r?\n/).pop() || '';
  const headers = {}; for (const line of lastBlock.split(/\r?\n/)) { const m = line.match(/^([^:]+):\s*(.*)$/); if (m) headers[m[1].toLowerCase()] = m[2]; }
  const html = existsSync(body) ? readFileSync(body, 'utf8') : '';
  return { code: +code, redirects: +redirects, gz: +gz, finalUrl, headers, html };
}
function measure(html) {
  const bytes = Buffer.byteLength(html);
  const flight = [...html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g)].reduce((a, m) => a + m[1].length, 0);
  const bodyHtml = (html.match(/<body[\s\S]*<\/body>/i) || [html])[0];
  const text = bodyHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  const words = text ? text.split(' ').length : 0;
  const h1 = (html.match(/<h1\b/gi) || []).length;
  const canonical = (html.match(/<link rel="canonical" href="([^"]*)"/i) || [])[1] || null;
  const robots = (html.match(/<meta name="robots" content="([^"]*)"/i) || [])[1] || '';
  const noindex = /noindex/i.test(robots) || /noindex/i.test(html.match(/<meta name="googlebot" content="([^"]*)"/i)?.[1] || '');
  const hreflang = [...html.matchAll(/<link rel="alternate" hrefLang="([^"]+)" href="([^"]+)"/gi)].map((m) => ({ lang: m[1], href: m[2] }));
  const jsonld = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => { try { return JSON.parse(m[1]); } catch { return { __invalid: true }; } });
  return { bytes, rscShare: bytes ? flight / bytes : 0, words, h1, canonical, robots, noindex, hreflang, jsonld };
}
const norm = (u) => u.replace(/\/$/, '').toLowerCase();
function ldTypes(j) { const out = []; const walk = (x) => { if (!x || typeof x !== 'object') return; if (Array.isArray(x)) return x.forEach(walk); if (x['@type']) out.push(...[].concat(x['@type'])); if (x['@graph']) walk(x['@graph']); }; walk(j); return out; }
function ldFind(j, type) { let hit = null; const walk = (x) => { if (hit || !x || typeof x !== 'object') return; if (Array.isArray(x)) return x.forEach(walk); if ([].concat(x['@type'] || []).includes(type)) { hit = x; return; } if (x['@graph']) walk(x['@graph']); }; walk(j); return hit; }

// ---------- sitemap set (for robots ⇄ sitemap consistency) ----------
let sitemapSet = null;
function loadSitemaps() {
  if (!cfg.sitemapIndex || !BASE) return null;
  try {
    const idx = execFileSync('curl', ['-sL', '--compressed', '-A', UA, BASE + cfg.sitemapIndex], { encoding: 'utf8', maxBuffer: 1 << 26 });
    const locs = [...idx.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const set = new Set();
    const files = locs.filter((l) => /\.xml(\?|$)/.test(l)).slice(0, cfg.maxSitemapFiles || 40);
    if (!files.length) locs.forEach((l) => set.add(norm(l)));
    for (const f of files) { const x = execFileSync('curl', ['-sL', '--compressed', '-A', UA, f], { encoding: 'utf8', maxBuffer: 1 << 27 }); for (const m of x.matchAll(/<loc>([^<]+)<\/loc>/g)) set.add(norm(m[1])); }
    return set;
  } catch (e) { add('live', 'sitemaps fetchable', false, e.message); return null; }
}

// ---------- live checks ----------
function liveChecks() {
  if (!BASE) return;
  mkdirSync(OUT, { recursive: true });
  sitemapSet = loadSitemaps();
  if (sitemapSet) add('live', 'sitemap index parses', sitemapSet.size > 0, `${sitemapSet.size} URLs`);
  for (const s of cfg.samples || []) {
    const url = BASE + s.path; const t = cfg.thresholds?.[s.template] || cfg.thresholds?.default || {};
    const p = fetchPage(url); const tag = `[${s.template}] ${s.path}`;
    add('live', `${tag} 200 & ≤1 redirect`, p.code === 200 && p.redirects <= 1, `${p.code}, ${p.redirects} redirects → ${p.finalUrl}`);
    if (p.code !== 200) continue;
    const m = measure(p.html);
    add('live', `${tag} canonical self-ref`, m.canonical && norm(m.canonical) === norm(p.finalUrl), m.canonical || 'missing');
    add('live', `${tag} one H1`, m.h1 === 1, `h1=${m.h1}`);
    if (t.maxRawKB) add('live', `${tag} raw ≤ ${t.maxRawKB} KB`, m.bytes / 1024 <= t.maxRawKB, `${(m.bytes / 1024).toFixed(0)} KB (gz ${(p.gz / 1024).toFixed(0)} KB)`);
    if (t.maxRscShare) add('live', `${tag} RSC share ≤ ${t.maxRscShare}`, m.rscShare <= t.maxRscShare, m.rscShare.toFixed(2));
    if (t.minWords) add('live', `${tag} words ≥ ${t.minWords}`, m.words >= t.minWords, `${m.words} words`);
    const inSitemap = sitemapSet ? sitemapSet.has(norm(p.finalUrl)) : null;
    if (inSitemap !== null) add('live', `${tag} robots ⇄ sitemap consistent`, inSitemap ? !m.noindex : true, `noindex=${m.noindex} inSitemap=${inSitemap}`);
    const xr = p.headers['x-robots-tag'] || ''; if (xr) add('live', `${tag} X-Robots-Tag not blocking`, !/noindex/i.test(xr), xr);
    add('live', `${tag} cache headers (cache-control + etag/last-modified)`, !!p.headers['cache-control'] && (!!p.headers.etag || !!p.headers['last-modified']), `cc=${p.headers['cache-control'] || '-'} etag=${p.headers.etag ? 'y' : 'n'} cf=${p.headers['cf-cache-status'] || '-'} vercel=${p.headers['x-vercel-cache'] || '-'}`);
    const invalid = m.jsonld.filter((j) => j.__invalid).length; add('live', `${tag} JSON-LD parses`, invalid === 0, `${m.jsonld.length} blocks, ${invalid} invalid`);
    for (const req of cfg.jsonld?.[s.template] || []) { const alts = req.split('|'); const found = m.jsonld.some((j) => alts.some((a) => ldTypes(j).includes(a))); add('live', `${tag} JSON-LD has ${req}`, found); }
    for (const j of m.jsonld) { const ev = ldFind(j, 'SportsEvent') || ldFind(j, 'Event'); if (ev) { add('live', `${tag} Event required fields`, !!(ev.name && ev.startDate && ev.location), `name=${!!ev.name} startDate=${!!ev.startDate} location=${!!ev.location}`); const offers = [].concat(ev.offers || []); if (offers.some((o) => o && o.availability && o.price == null)) add('live', `${tag} offers: availability only with price`, false, 'availability set without price'); break; } }
    if (!m.noindex && m.hreflang.length) {
      const n = cfg.hreflangSample ?? 2; let ok = 0, tried = 0;
      for (const alt of m.hreflang.filter((h) => h.lang !== 'x-default' && norm(h.href) !== norm(p.finalUrl)).slice(0, n)) {
        tried++; const q = fetchPage(alt.href); if (q.code !== 200) continue; const mm = measure(q.html);
        if (!mm.noindex && mm.hreflang.some((h) => norm(h.href) === norm(p.finalUrl))) ok++;
      }
      if (tried) add('live', `${tag} hreflang reciprocal & indexable (${n} sampled)`, ok === tried, `${ok}/${tried}`);
    }
  }
}

// ---------- static checks ----------
function staticChecks() {
  for (const c of cfg.staticChecks || []) {
    const r = spawnSync('sh', ['-c', c.cmd], { encoding: 'utf8', timeout: (c.timeoutSec || 900) * 1000 });
    add('static', c.name, r.status === 0, (r.stdout || r.stderr || '').trim().split('\n').slice(-2).join(' | '), !!c.guardrail);
  }
}

if (args['static-only'] !== 'true') liveChecks();
if (args['live-only'] !== 'true') staticChecks();

// ---------- score ----------
const weight = (c) => (c.guardrail ? W.guardrail : W[c.group] || 1);
const total = checks.reduce((a, c) => a + weight(c), 0); const got = checks.filter((c) => c.pass).reduce((a, c) => a + weight(c), 0);
const score = total ? +((100 * got) / total).toFixed(1) : 0;
const guardrailFails = checks.filter((c) => c.guardrail && !c.pass);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const result = { stamp, base: BASE || null, score, passed: checks.filter((c) => c.pass).length, total: checks.length, guardrailFails: guardrailFails.map((c) => c.name), checks };
mkdirSync(OUT, { recursive: true }); const file = join(OUT, `scorecard-${stamp}.json`); writeFileSync(file, JSON.stringify(result, null, 2)); writeFileSync(join(OUT, 'latest.json'), JSON.stringify(result, null, 2));
let verdict = 'BASELINE';
if (args.compare) { const prev = JSON.parse(readFileSync(args.compare, 'utf8')); const d = +(score - prev.score).toFixed(1); verdict = guardrailFails.length ? `REVERT (guardrail: ${guardrailFails.map((c) => c.name).join('; ')})` : d > 0 ? `KEEP (+${d})` : d < 0 ? `REVERT (${d})` : 'NEUTRAL (0)'; result.delta = d; }
else if (guardrailFails.length) verdict = `GUARDRAIL FAILED: ${guardrailFails.map((c) => c.name).join('; ')}`;
if (args.md === 'true') {
  console.log(`**Score ${score}** (${result.passed}/${result.total}) — ${verdict}\n`);
  console.log('| group | check | pass | detail |\n|---|---|---|---|');
  for (const c of checks) console.log(`| ${c.group}${c.guardrail ? ' 🛡' : ''} | ${c.name} | ${c.pass ? '✅' : '❌'} | ${c.detail.replace(/\|/g, '/')} |`);
  console.log(`\nsaved ${file}`);
} else console.log(JSON.stringify({ score, verdict, passed: result.passed, total: result.total, guardrailFails: result.guardrailFails, file }, null, 2));
process.exit(guardrailFails.length ? 2 : 0);
