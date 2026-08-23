import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testsDir = dirname(fileURLToPath(import.meta.url));
const skillDir = join(testsDir, "..");
const skillPath = join(skillDir, "SKILL.md");
const protocolPath = join(skillDir, "references", "google-indexing-protocol.md");
const sourcesPath = join(skillDir, "references", "sources.md");
const skill = readFileSync(skillPath, "utf8");
const skillLines = skill.split(/\r?\n/);
const skillBody = skill.replace(/^---[\s\S]*?---\s*/, "");

const FROZEN_AUTHORITY = "The user’s requested scope and repository instructions are the authority. Read-only repository inspection and public-page measurement are permitted within that scope. Source edits require an implementation request. Credentials may only be used read-only for a property the user asked to inspect and must never be printed. Account settings, robots/meta/header policy, sitemap or IndexNow behavior, publishing, deployment, commits, pull requests, outreach, purchases, and production writes require explicit authorization for that action. Search and answer engines remain external decision systems: never promise crawling, indexing, ranking, citations, traffic, conversions, or a time to effect.";
const FROZEN_DONE_WHEN = "Done means the requested scope has a dated report in which every required check is PASS, FAIL, UNKNOWN, or N/A with its evidence level and source; no required check was silently skipped; authorized changes passed the deterministic gate and comparable before/after evidence; and no failed guardrail was retained. External outcomes remain UNKNOWN unless directly observed in the relevant owner property, official platform report, server logs, or first-party analytics. Done never means guaranteed indexing, ranking, citation, traffic growth, conversion, or timing.";

function normalize(value) {
  return value.replace(/\s+/g, " ").trim();
}

function readProtocol() {
  return readFileSync(protocolPath, "utf8");
}

function assertInOrder(text, patterns, label) {
  let cursor = 0;
  for (const pattern of patterns) {
    const match = text.slice(cursor).match(pattern);
    assert.ok(match, `${label}: missing ${pattern}`);
    cursor += match.index + match[0].length;
  }
}

test("SEO indexing triggers route to the protocol and plan while frozen contracts stay intact", () => {
  assert.ok(skillLines.length <= 70, `SKILL.md is ${skillLines.length} lines; expected <= 70`);
  const authorityMatch = skillBody.match(/^## Authority and safety\s+([\s\S]*?)\n\n/m);
  assert.ok(authorityMatch, "frozen authority paragraph is missing");
  assert.equal(normalize(authorityMatch[1]), normalize(FROZEN_AUTHORITY), "authority paragraph drifted from the frozen contract");
  const doneMatch = skillBody.match(/^## Done when\s+([\s\S]*?)(?:\n\s*$)/m);
  assert.ok(doneMatch, "frozen Done when paragraph is missing");
  assert.equal(normalize(doneMatch[1]), normalize(FROZEN_DONE_WHEN), "Done when paragraph drifted from the frozen contract");

  for (const trigger of [
    /new\s*(?:\/|or|and|&)\s*changed URLs?/i,
    /indexing lag/i,
    /Discovered\s*(?:\/|or|and)\s*Crawled[^\n]*currently not indexed/i,
    /acceleration requests?/i,
  ]) assert.match(skill, trigger, `missing indexing trigger ${trigger}`);
  assert.match(skill, /references\/google-indexing-protocol\.md/);
  assert.match(skill, /scripts\/indexing-plan\.mjs/);
  assert.match(skill, /never\s+infer(?:red|ring)?(?:\s+submission)?\s+authorit(?:y|ies)/i);
  assert.match(skill, /generic indexing API/i);
});

test("the protocol orders queue state through search measurement and separates each outcome", () => {
  const rawProtocol = readProtocol();
  const protocol = normalize(rawProtocol);
  assertInOrder(protocol, [
    /\bsubmitted\s*(?:\/|or|→|->)\s*queued\b/i,
    /\bdiscovered\b/i,
    /\bcrawled\b/i,
    /\bindexed\b/i,
    /\bimpressions?\s*(?:\/|and|→|->)\s*traffic\b/i,
  ], "ordered indexing states");
  assert.match(protocol, /queue[^.]{0,100}(?:acceptance|accepted)[^.]{0,160}(?:not|does not|is not)[^.]{0,100}(?:crawl|index)/i);
  assert.match(protocol, /indexing[^.]{0,120}(?:not|does not|is not)[^.]{0,100}(?:ranking|traffic)/i);

  const stateTableMatch = rawProtocol.match(/^##[^\n]*(?:state table|state routing|state matrix)[^\n]*\n([\s\S]*?)(?=\n## |\s*$)/im);
  assert.ok(stateTableMatch, "protocol requires a compact state table or routing section");
  const stateTable = normalize(stateTableMatch[0]);
  assert.match(stateTable, /(?:engine|Google)[^.]{0,300}(?:submission|request|validation)|(?:submission|request|validation)[^.]{0,300}(?:engine|Google)/i, "state table must route both engine and submission state");
  for (const state of [
    "UNKNOWN",
    "UNKNOWN_TO_GOOGLE",
    "DISCOVERED_NOT_CRAWLED",
    "CRAWLED_NOT_INDEXED",
    "INDEXED",
    "BLOCKED",
    "DUPLICATE",
    "REDIRECT",
    "ERROR",
    "NOT_REQUESTED",
    "REQUEST_QUEUED",
    "VALIDATION_STARTED",
    "VALIDATION_PASSED",
    "VALIDATION_FAILED",
  ]) assert.match(stateTable, new RegExp(`\\b${state}\\b`), `state table is missing ${state}`);
  assert.match(protocol, /(?:queue|REQUEST_QUEUED)[^.]{0,180}(?:not|never|must not|do not)[^.]{0,180}(?:promot|candidate|engine evidence|index)/i);
  assert.match(protocol, /(?:validation|VALIDATION_(?:STARTED|PASSED|FAILED))[^.]{0,180}(?:not|never|must not|do not)[^.]{0,180}(?:promot|candidate|engine evidence|index)/i);
  assert.match(protocol, /(?:queue|submission state)[^.]{0,180}(?:alongside|separate|coexist|both|retain)[^.]{0,180}(?:engine|Google)[^.]{0,120}(?:evidence|state)/i);
  assert.match(protocol, /UNKNOWN_TO_GOOGLE[^.]{0,180}E4[^.]{0,180}(?:observed|known)[^.]{0,180}not[- ]indexed/i);
  assert.match(protocol, /ERROR[^.]{0,180}(?:E0|unknown)[^.]{0,180}(?:inspect|collect|diagnos)/i, "ERROR must remain unknown evidence until an owner-property observation identifies the error");
  assert.match(protocol, /(?:CRAWLED_NOT_INDEXED[^.]{0,180}(?:no|never|must not|do not)[^.]{0,120}(?:re-?request|request(?:ing)? again|manual)|(?:no|never|must not|do not)[^.]{0,180}(?:re-?request|request(?:ing)? again|manual)[^.]{0,180}CRAWLED_NOT_INDEXED)/i);
});

test("the protocol distinguishes cohort sitemaps, priority inspection, and issue validation", () => {
  const protocol = normalize(readProtocol());
  assert.match(protocol, /sitemap[^.]{0,180}(?:submission|submit)[^.]{0,120}(?:cohort|sitewide)[^.]{0,100}discover|sitemap[^.]{0,180}(?:cohort|sitewide)[^.]{0,100}discover[^.]{0,100}(?:submission|submit)/i);
  assert.match(protocol, /URL Inspection/i);
  assert.match(protocol, /Request indexing/i);
  assert.match(protocol, /limited[^.]{0,120}(?:manual|URL Inspection|Request indexing)/i);
  assert.match(protocol, /(?:URL Inspection|Request indexing)[^.]{0,160}priority URLs?/i);
  assert.match(protocol, /(?:Validate Fix[^.]{0,200}(?:actual|reported)[^.]{0,100}(?:issue|bug)[^.]{0,100}fixed|(?:actual|reported)[^.]{0,100}(?:issue|bug)[^.]{0,100}fixed[^.]{0,200}Validate Fix)/i);
  assert.match(protocol, /(?:never|do not|must not|no)[^.]{0,100}automat/i);
  assert.match(protocol, /(?:never|do not|must not)[^.]{0,100}infer(?:red|ring)?(?:\s+submission)?[^.]{0,100}authorit/i);
  assert.match(protocol, /URL Inspection[^.]{0,220}(?:read[- ]only|evidence collection)[^.]{0,180}(?:does not|never|not|cannot)[^.]{0,120}(?:change|submit|request indexing)/i);
  for (const action of ["Request indexing", "sitemap submission", "Validate Fix"]) {
    const escaped = action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(protocol, new RegExp(`${escaped}[^.]{0,260}(?:(?:manual[- ]only|manual)[^.]{0,180}(?:explicit(?:ly)?\\s+authori[sz]|approval)|(?:explicit(?:ly)?\\s+authori[sz]|approval)[^.]{0,180}(?:manual[- ]only|manual))`, "i"), `${action} must be manual-only and explicitly authorized`);
  }
});

test("the protocol owns the complete legitimate acceleration workflow in order", () => {
  const protocol = normalize(readProtocol());
  assertInOrder(protocol, [
    /eligibility\s*[/,&+]\s*canonical\s+inventory|eligibility[^.]{0,80}canonical[^.]{0,80}inventory/i,
    /(?:homepage|home page)[^.]{0,120}hub[^.]{0,120}detail[^.]{0,160}crawlable(?: link)?(?: graph)?/i,
    /canonical sitemap[^.]{0,160}truthful[^.]{0,120}(?:significant[- ]change|lastmod)[^.]{0,100}lastmod|canonical sitemap[^.]{0,160}lastmod[^.]{0,120}truthful/i,
    /limited[^.]{0,180}(?:URL Inspection|Request indexing)[^.]{0,180}(?:sitemap cohort|cohort)/i,
    /Validate Fix[^.]{0,220}(?:actual|reported)[^.]{0,100}(?:issue|bug)[^.]{0,100}fixed/i,
    /crawl[- ]demand[^.]{0,160}capacity|capacity[^.]{0,160}crawl[- ]demand/i,
    /submitted\s*(?:\/|or|→|->)\s*queued[^.]{0,180}discovered[^.]{0,180}crawled[^.]{0,180}indexed[^.]{0,180}impressions?\s*(?:\/|and|→|->)\s*traffic/i,
    /(?:prohibited|folklore|unsafe)[^.]{0,220}(?:generic Indexing API|guarantee|guaranteed)/i,
  ], "eight-step indexing workflow");
  assertInOrder(protocol, [
    /eligibility\s*[/,&+]\s*canonical\s+inventory|eligibility[^.]{0,80}canonical[^.]{0,80}inventory/i,
    /(?:homepage|home page)[^.]{0,120}hub[^.]{0,120}detail[^.]{0,160}crawlable(?: link)?(?: graph)?/i,
    /canonical sitemap/i,
    /(?:truthful[^.]{0,160}(?:significant[- ]change|lastmod)[^.]{0,100}lastmod|lastmod[^.]{0,160}truthful[^.]{0,120}(?:significant[- ]change|significant change))/i,
    /(?:(?:explicitly|approval[- ]gated|approved)[^.]{0,180}(?:manual )?sitemap submission|(?:manual )?sitemap submission[^.]{0,180}(?:explicitly|approval[- ]gated|approved))/i,
    /limited[^.]{0,220}(?:URL Inspection|Request indexing)[^.]{0,160}priority URLs?/i,
  ], "eligibility-to-acceleration order");
});

test("official sources cover every required Google indexing topic with current freshness metadata", () => {
  const sources = readFileSync(sourcesPath, "utf8");
  for (const url of [
    "https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl",
    "https://support.google.com/webmasters/answer/9012289?hl=en",
    "https://support.google.com/webmasters/answer/7440203?hl=en",
    "https://developers.google.com/search/docs/crawling-indexing/links-crawlable",
    "https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap",
    "https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping",
    "https://developers.google.com/crawling/docs/crawl-budget",
    "https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors",
    "https://developers.google.com/search/apis/indexing-api/v3/using-api",
    "https://developers.google.com/search/apis/indexing-api/v3/quota-pricing",
    "https://developers.google.com/search/docs/essentials/spam-policies",
    "https://support.google.com/webmasters/answer/34592?hl=en",
  ]) {
    const row = sources.split(/\r?\n/).find((line) => line.includes(`| ${url} |`));
    assert.ok(row, `missing official source row ${url}`);
    assert.match(row, /2026-08-23/, `source row is not verified on 2026-08-23: ${url}`);
  }
  assert.match(sources, /Verified 2026-08-23/, "sources header must be refreshed on 2026-08-23");
});

test("the protocol rejects unsafe folklore and states the narrow Indexing API boundary", () => {
  const protocol = normalize(readProtocol());
  assert.match(protocol, /(?:never|do not|must not)[^.]{0,140}(?:generic )?Indexing API[^.]{0,140}(?:ordinary|normal|non[- ]job|non[- ]livestream)[^.]{0,100}pages?/i);
  assert.match(protocol, /Indexing API[^.]{0,220}(?:restricted|limited|only)[^.]{0,160}(?:job post(?:ing)?|job-posting)[^.]{0,160}(?:livestream|live stream|BroadcastEvent)/i);
  assert.match(protocol, /livestream[^.]{0,220}(?:BroadcastEvent[^.]{0,120}(?:embedded|inside|in)[^.]{0,100}VideoObject|VideoObject[^.]{0,120}(?:embedding|with|contains|includes)[^.]{0,100}BroadcastEvent)/i);
  assert.match(protocol, /https:\/\/developers\.google\.com\/search\/apis\/indexing-api\/v3\/quota-pricing/);
  for (const term of ["quota", "project", "account", "credential"]) {
    assert.match(protocol, new RegExp(`(?:(?:no|never|do not|must not)[^.]{0,180}\\b${term}\\b[^.]{0,180}(?:circumvent|bypass|evad|circumvention)|(?:no|never|do not|must not)[^.]{0,180}(?:circumvent|bypass|evad|circumvention)[^.]{0,180}\\b${term}\\b)`, "i"), `missing no-circumvention boundary for ${term}`);
  }
  assert.match(protocol, /repeat(?:ed|ing)?[^.]{0,100}(?:manual|URL Inspection)[^.]{0,100}(?:request|submission)/i);
  assert.match(protocol, /(?:repeat(?:ed|ing)?|unchanged|same)[^.]{0,120}sitemap[^.]{0,100}(?:re-?submission|submission)/i);
  assert.match(protocol, /(?:deprecated|retired|unsupported|never use|do not use)[^.]{0,100}sitemap ping|sitemap ping[^.]{0,100}(?:deprecated|retired|unsupported|never use|do not use)/i);
  assert.match(protocol, /(?:fake|fabricated|false|manipulated|artificial)[^.]{0,100}lastmod|lastmod[^.]{0,100}(?:fake|fabricated|false|manipulated|artificial)/i);
  assert.match(protocol, /(?:manipulated|artificial|fake|paid)[^.]{0,120}(?:traffic|links?|link scheme)/i);
  for (const outcome of ["indexing", "ranking", "traffic", "timing"]) {
    assert.match(protocol, new RegExp(`(?:never|no|cannot|do not)[^.]{0,100}(?:guarantee|guaranteed|promise|promised)[^.]{0,180}\\b${outcome}\\b`, "i"), `missing no-guarantee boundary for ${outcome}`);
  }
});
