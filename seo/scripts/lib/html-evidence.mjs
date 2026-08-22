export function decodeBasicEntities(value) {
  return String(value).replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[name.toLowerCase()]).replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16))).replace(/&#(\d+);/g, (_, decimal) => safeCodePoint(parseInt(decimal, 10)));
}
function safeCodePoint(value) { return Number.isInteger(value) && value >= 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : '\uFFFD'; }
export function parseAttributes(tag) { const result = {}; for (const match of String(tag).matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) if (!match[1].startsWith('<')) result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? ''; return result; }
export function tags(html, name) { return [...String(html).matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((match) => ({ raw: match[0], attrs: parseAttributes(match[0]) })); }
export function visibleText(html) { return decodeBasicEntities(String(html).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()); }
export function resolveUrl(value, base) { try { const url = new URL(value, base); url.hostname = url.hostname.toLowerCase(); return url.href; } catch { return null; } }
export function normalizeUrl(value, base) { const resolved = resolveUrl(value, base); if (!resolved) return String(value).replace(/\/$/, ''); const url = new URL(resolved); if (url.pathname.length > 1 && url.pathname.endsWith('/')) url.pathname = url.pathname.slice(0, -1); return url.href; }
export function extractHtmlEvidence(html) {
  const linkTags = tags(html, 'link'), metas = tags(html, 'meta');
  const canonical = linkTags.find((link) => (link.attrs.rel || '').split(/\s+/).some((value) => value.toLowerCase() === 'canonical'))?.attrs.href || null;
  const robots = metas.filter((meta) => ['robots', 'googlebot'].includes((meta.attrs.name || '').toLowerCase())).map((meta) => meta.attrs.content || '').join(',');
  const body = (String(html).match(/<body\b[\s\S]*<\/body>/i) || [html])[0]; const text = visibleText(body);
  const jsonld = [...String(html).matchAll(/<script\b[^>]*type\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => { try { return JSON.parse(match[1]); } catch { return { __invalid: true }; } });
  return { canonical, robots, noindex: /\bnoindex\b/i.test(robots), h1: tags(html, 'h1').length, text, textChars: Array.from(text).length, words: text ? text.split(' ').length : 0, jsonld };
}
