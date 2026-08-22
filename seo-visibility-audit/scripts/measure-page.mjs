// Usage: node measure.mjs <file.html> — prints HTML/text stats for SEO content audit
import fs from 'node:fs';
const f = process.argv[2];
const html = fs.readFileSync(f, 'utf8');
const bytes = Buffer.byteLength(html);
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
const scriptBytes = scripts.reduce((a, m) => a + Buffer.byteLength(m[0]), 0);
const jsonld = scripts.filter(m => /application\/ld\+json/i.test(m[0]));
const styleBytes = [...html.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)].reduce((a,m)=>a+Buffer.byteLength(m[0]),0);
const body = (html.match(/<body[\s\S]*<\/body>/i) || [html])[0];
let text = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&[a-z#0-9]+;/gi,' ').replace(/\s+/g,' ').trim();
const words = text.split(' ').filter(Boolean);
const count = (re) => (html.match(re) || []).length;
const h = (n) => count(new RegExp(`<h${n}\\b`, 'gi'));
const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m=>m[1].replace(/<[^>]+>/g,'').trim());
const title = (html.match(/<title>([\s\S]*?)<\/title>/i)||[])[1];
const desc = (html.match(/<meta name="description" content="([^"]*)"/i)||[])[1];
const canonical = (html.match(/<link rel="canonical" href="([^"]*)"/i)||[])[1];
const links = [...html.matchAll(/<a\b[^>]*href="([^"]*)"/gi)].map(m=>m[1]);
const internal = links.filter(l=>l.startsWith('/')||l.includes('sportplan.es'));
const classBytes = [...html.matchAll(/class="([^"]*)"/g)].reduce((a,m)=>a+m[1].length,0);
const hasTemplateMarker = /self\.__next_f\.push/.test(html);
const rscBytes = [...html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g)].reduce((a,m)=>a+m[1].length,0);
console.log(JSON.stringify({
  file: f, bytes, kb: +(bytes/1024).toFixed(1),
  scriptBytes, scriptPct: +(100*scriptBytes/bytes).toFixed(1),
  rscFlightBytes: rscBytes, rscPct: +(100*rscBytes/bytes).toFixed(1),
  styleBytes, classAttrBytes: classBytes, classPct: +(100*classBytes/bytes).toFixed(1),
  visibleTextBytes: Buffer.byteLength(text), textPct: +(100*Buffer.byteLength(text)/bytes).toFixed(1),
  words: words.length,
  title, descLen: desc?.length, canonical,
  h1: h1s, h1n: h(1), h2: h(2), h3: h(3), h4: h(4),
  landmarks: { header: count(/<header\b/gi), nav: count(/<nav\b/gi), main: count(/<main\b/gi), article: count(/<article\b/gi), section: count(/<section\b/gi), aside: count(/<aside\b/gi), footer: count(/<footer\b/gi), ul: count(/<ul\b/gi), table: count(/<table\b/gi), time: count(/<time\b/gi) },
  imgs: count(/<img\b/gi), imgNoAlt: count(/<img\b(?![^>]*\balt=)[^>]*>/gi),
  links: links.length, internalLinks: internal.length, uniqueInternal: new Set(internal).size,
  jsonld: jsonld.length, jsonldTypes: jsonld.map(m=>{try{const j=JSON.parse(m[1]);const t=(x)=>Array.isArray(x)?x.map(t):(x['@graph']?x['@graph'].map(t):x['@type']);return t(j)}catch(e){return 'parse-error'}}),
  hreflang: count(/hrefLang=/gi),
  textSample: text.slice(0, 600)
}, null, 2));
