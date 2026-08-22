#!/usr/bin/env node
// Generic HTML evidence extractor. Metrics are diagnostics, not universal SEO gates.
import fs from 'node:fs';
import { decodeBasicEntities, resolveUrl, tags as evidenceTags, visibleText } from './lib/html-evidence.mjs';

const argv = process.argv.slice(2); const file = argv.shift(); let base = null;
for (let i = 0; i < argv.length; i++) { if (argv[i] === '--base') base = argv[++i]; else throw new Error(`unknown argument: ${argv[i]}`); }
if (!file || !base && argv.includes('--base')) throw new Error('usage: node measure-page.mjs <file.html> [--base https://example.invalid]');
let baseUrl = null; if (base) { try { baseUrl = new URL(base); } catch { throw new Error('--base must be an absolute URL'); } }
const html = fs.readFileSync(file, 'utf8');
function decode(value) { return decodeBasicEntities(value); }
function textContent(value) { return decode(value.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()); }
const tagList = (name) => evidenceTags(html, name);
const body = (html.match(/<body\b[\s\S]*<\/body>/i) || [html])[0], text = visibleText(body);
const segments = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)].filter((entry) => entry.isWordLike).length : (text ? text.split(/\s+/).filter(Boolean).length : 0);
const linkTags = tagList('link'), metas = tagList('meta'), anchors = tagList('a');
const canonical = linkTags.find((link) => (link.attrs.rel || '').split(/\s+/).some((value) => value.toLowerCase() === 'canonical'))?.attrs.href;
const canonicalResolved = canonical && baseUrl ? resolveUrl(canonical, baseUrl) : null;
const links = anchors.map((anchor) => anchor.attrs.href).filter(Boolean);
const internalUrls = links.filter((href) => { if (!baseUrl) return href.startsWith('/'); try { return new URL(href, baseUrl).origin === baseUrl.origin; } catch { return false; } });
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)], jsonld = scripts.filter((script) => /\btype\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)/i.test(script[0]));
const count = (pattern) => (html.match(pattern) || []).length;
console.log(JSON.stringify({
  file, base: baseUrl?.href || null, bytes: Buffer.byteLength(html), kb: +(Buffer.byteLength(html) / 1024).toFixed(1),
  visibleTextChars: Array.from(text).length, visibleTextBytes: Buffer.byteLength(text), words: text ? text.split(' ').length : 0, textSample: text.slice(0, 600),
  title: textContent((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ''), canonical: canonical || null, canonicalResolved, canonicalInvalid: Boolean(canonical && baseUrl && !canonicalResolved),
  robots: metas.filter((meta) => ['robots', 'googlebot'].includes((meta.attrs.name || '').toLowerCase())).map((meta) => meta.attrs.content || '').join(','),
  h1: [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((heading) => textContent(heading[1])), h1n: tagList('h1').length, h2: tagList('h2').length, h3: tagList('h3').length,
  links: links.length, internalLinks: internalUrls.length, uniqueInternal: new Set(internalUrls).size, internalUrls, textSegments: segments, textSegmentMetric: 'diagnostic heuristic; language-dependent segmentation is not an SEO requirement',
  scriptBytes: scripts.reduce((sum, script) => sum + Buffer.byteLength(script[0]), 0), rscFlightBytes: [...html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g)].reduce((sum, match) => sum + match[1].length, 0),
  jsonld: jsonld.length, jsonldTypes: jsonld.map((script) => { try { const data = JSON.parse(script[1]); return data['@type'] || data['@graph']?.map((item) => item['@type']); } catch { return 'parse-error'; } }),
  landmarks: { header: count(/<header\b/gi), nav: count(/<nav\b/gi), main: count(/<main\b/gi), article: count(/<article\b/gi), footer: count(/<footer\b/gi) },
}, null, 2));
