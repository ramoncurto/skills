import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const skillDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillPath = join(skillDir, "SKILL.md");
const skill = readFileSync(skillPath, "utf8");
const lines = skill.split(/\r?\n/);
const body = skill.replace(/^---[\s\S]*?---\s*/, "");

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(match, "SKILL.md must start with YAML frontmatter");
  return Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [, key, value] = line.match(/^([\w-]+):\s*(.*)$/) ?? [];
        assert.ok(key, `invalid frontmatter line: ${line}`);
        return [key, value.replace(/^(['"])(.*)\1$/, "$2")];
      }),
  );
}

const frontmatter = parseFrontmatter(skill);

const FROZEN_FRONTMATTER = {
  name: "seo",
  summary: "Audit, measure, and improve organic-search and answer-engine eligibility with explicit evidence boundaries.",
  description: "Use when the user asks to audit, diagnose, measure, plan, or implement SEO or GEO work involving crawlability, indexing, Search Console, Bing Webmaster Tools, structured data, organic traffic, or AI citations. Default to read-only evidence collection; a bare mention of SEO loads this skill but does not authorize edits, account or property changes, crawler-policy changes, publishing, deployment, commits, pull requests, outreach, or outcome guarantees.",
  source: "dockialabs",
};
const FROZEN_AUTHORITY = "The user’s requested scope and repository instructions are the authority. Read-only repository inspection and public-page measurement are permitted within that scope. Source edits require an implementation request. Credentials may only be used read-only for a property the user asked to inspect and must never be printed. Account settings, robots/meta/header policy, sitemap or IndexNow behavior, publishing, deployment, commits, pull requests, outreach, purchases, and production writes require explicit authorization for that action. Search and answer engines remain external decision systems: never promise crawling, indexing, ranking, citations, traffic, conversions, or a time to effect.";
const FROZEN_DONE_WHEN = "Done means the requested scope has a dated report in which every required check is PASS, FAIL, UNKNOWN, or N/A with its evidence level and source; no required check was silently skipped; authorized changes passed the deterministic gate and comparable before/after evidence; and no failed guardrail was retained. External outcomes remain UNKNOWN unless directly observed in the relevant owner property, official platform report, server logs, or first-party analytics. Done never means guaranteed indexing, ranking, citation, traffic growth, conversion, or timing.";

function normalizeProse(value) {
  return value.replace(/\s+/g, " ").trim();
}

function markdownFiles(dir) {
  if (!statSafe(dir)?.isDirectory()) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? markdownFiles(path) : entry.name.endsWith(".md") ? [path] : [];
  });
}

function statSafe(path) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

const referenceFiles = markdownFiles(join(skillDir, "references"));

function referenceFor(label, patterns) {
  const matching = referenceFiles.filter((path) => {
    const text = readFileSync(path, "utf8");
    return patterns.every((pattern) => pattern.test(text));
  });
  assert.ok(matching.length > 0, `missing current reference for ${label}`);
  const text = matching.map((path) => readFileSync(path, "utf8")).join("\n");
  assert.match(text, /https?:\/\//, `${label} reference must link to a source`);
  assert.match(text, /(?:20\d\d|current|updated|retrieved|verified)/i, `${label} reference must carry currency evidence`);
}

test("SEO frontmatter is valid and matches its skill folder", () => {
  assert.equal(frontmatter.name, basename(skillDir));
  assert.ok(frontmatter.description, "frontmatter requires a description");
  assert.match(frontmatter.description, /SEO|search|index|GEO/i);
});

test("SEO skill matches the frozen frontmatter, authority paragraph, and done-when contract", () => {
  for (const [key, value] of Object.entries(FROZEN_FRONTMATTER)) assert.equal(frontmatter[key], value, `frontmatter.${key} drifted from the frozen contract`);
  const authorityMatch = body.match(/^## Authority and safety\s+([\s\S]*?)\n\n/m);
  assert.ok(authorityMatch, "frozen authority paragraph is missing");
  assert.equal(normalizeProse(authorityMatch[1]), normalizeProse(FROZEN_AUTHORITY), "authority paragraph drifted from the frozen contract");
  const doneMatch = body.match(/^## Done when\s+([\s\S]*?)(?:\n\s*$)/m);
  assert.ok(doneMatch, "frozen Done when paragraph is missing");
  assert.equal(normalizeProse(doneMatch[1]), normalizeProse(FROZEN_DONE_WHEN), "Done when paragraph drifted from the frozen contract");
});

test("SEO skill uses the standard sections and stays within the reading budget", () => {
  assert.match(body, /^## When to use\s*$/m);
  assert.match(body, /^## Steps\s*$/m);
  assert.match(body, /^## Done when\s*$/m);
  assert.ok(lines.length <= 70, `SKILL.md is ${lines.length} lines; expected <= 70`);
});

test("SEO contract makes no outcome or timing promise", () => {
  const triggerText = `${frontmatter.summary ?? ""}\n${frontmatter.description}`;
  assert.doesNotMatch(triggerText, /\bto the top\b|\b(?:guarantee(?:s|d)?|promise(?:s|d)?)\s+(?:crawl(?:ing)?|index(?:ing)?|rank(?:ing)?|traffic|citation|conversion|outcome|timing)\b/i);
  assert.doesNotMatch(triggerText, /\b(?:rank(?:ing)?|index(?:ing)?|traffic)\b[^\n]{0,50}\b(?:will|within|in)\b/i);
  assert.match(skill, /never\s+(?:promise|guarantee)|no\s+guarantee/i);
});

test("SEO skill separates read-only authority from approval-gated writes", () => {
  assert.match(body, /^## (?:Authority|Authorization|Safety|Access)[^\n]*$/im);
  assert.match(body, /read[- ]only[^\n]*(?:no approval|without approval|does not require permission)/i);
  assert.match(body, /write[^\n]*(?:approval|permission|human|authori[sz]|gated)/i);
  assert.match(body, /(?:credential|robots|deploy|publish|production)/i);
});

test("SEO evidence labels source fetches separately from rendered Google evidence", () => {
  assert.match(skill, /(?:raw|source|HTTP)\s+(?:HTML|fetch|response)|source-fetch/i);
  assert.match(skill, /rendered\s+Google|Google-rendered|render(?:ed|ing)[^\n]*Google/i);
  assert.match(skill, /(?:separat|do not conflate|not the same|cannot prove)[^\n]*(?:source|render|Google)/i);
});

test("SEO guidance rejects universal CTR, word-count, and H1 ranking rules", () => {
  assert.match(skill, /\bCTR\b/i);
  assert.match(skill, /\b(?:word count|words? per page)\b/i);
  assert.match(skill, /\bH1\b/i);
  assert.match(skill, /(?:no|not|never)[^\n]{0,80}(?:universal|fixed|ranking rule|ranking factor)[^\n]{0,80}(?:CTR|word|H1|heading)/i);
  assert.doesNotMatch(skill, /\bCTR\s*\(?\s*\d+\s*[-–]\s*\d+\s*%/i);
  assert.doesNotMatch(skill, /\b\d+\s+(?:unique\s+)?words?\s*\/?\s*page/i);
});

test("SEO skill has current references for readiness, GEO measurement, official sources, and orchestration", () => {
  referenceFor("page readiness", [/page readiness|index(?:ing|able)|crawl(?:er|ability)/i]);
  referenceFor("GEO and measurement", [/GEO|generative engine|answer engine/i, /measure|citation|visibility|referral/i]);
  referenceFor("official sources", [/official|primary source|source hierarchy/i]);
  referenceFor("orchestration", [/orchestrat|Sol Ultra|Terra|Luna|bounded brief/i]);
});

test("SEO skill covers current generative-search controls and the evidence funnel", () => {
  assert.match(skill, /Google[^\n]*(?:generative|AI Overviews)|(?:generative|AI Overviews)[^\n]*Google/i);
  assert.match(skill, /(?:AI Overviews|generative AI)[^\n]*(?:control|report)|(?:control|report)[^\n]*(?:AI Overviews|generative AI)/i);
  assert.match(skill, /Bing AI Performance/i);
  assert.match(skill, /OAI-SearchBot[^\n]*(?:vs\.?|versus|different|separate)[^\n]*GPTBot|GPTBot[^\n]*(?:vs\.?|versus|different|separate)[^\n]*OAI-SearchBot/i);
  assert.match(skill, /crawler\s+access/i);
  assert.match(skill, /citation/i);
  assert.match(skill, /referral/i);
  assert.match(skill, /conversion/i);
  assert.match(skill, /(?:access|crawler)[^\n]*(?:→|->|to)[^\n]*citation[^\n]*(?:→|->|to)[^\n]*referral[^\n]*(?:→|->|to)[^\n]*conversion/i);
});

test("SEO skill gives Search Console API truncation and bulk-export guidance", () => {
  assert.match(skill, /Search Console API/i);
  assert.match(skill, /(?:truncat|row limit|pagination|top[- ]row)/i);
  assert.match(skill, /(?:bulk[- ]export|BigQuery|export all)/i);
});

test("SEO references cover international targeting, truthful structured data, and people-first scale", () => {
  const playbook = readFileSync(join(skillDir, "references", "seo-playbook.md"), "utf8");
  const sources = readFileSync(join(skillDir, "references", "sources.md"), "utf8");
  assert.match(playbook, /(?:separate|different) URLs[^\n]*(?:language|locale)|(?:language|locale)[^\n]*(?:separate|different) URLs/i);
  assert.match(playbook, /hreflang/i);
  assert.match(playbook, /reciprocal/i);
  assert.match(playbook, /x-default/i);
  assert.match(playbook, /(?:automatic|forced|IP)[^\n]*(?:redirect|rerout)|(?:redirect|rerout)[^\n]*(?:language|IP)/i);
  assert.match(playbook, /structured data[^\n]*(?:visible|main content|represent)/i);
  assert.match(playbook, /(?:feature-specific|supported type|Rich Results Test)/i);
  assert.match(playbook, /structured data[^\n]*(?:does not|never|no)[^\n]*guarantee|no guarantee[^\n]*rich result/i);
  assert.match(playbook, /people-first/i);
  assert.match(playbook, /Who[^\n]*How[^\n]*Why/i);
  assert.match(playbook, /scaled content abuse/i);
  for (const url of [
    "https://developers.google.com/search/docs/advanced/crawling/managing-multi-regional-sites",
    "https://developers.google.com/search/docs/appearance/structured-data/sd-policies",
    "https://developers.google.com/search/docs/fundamentals/creating-helpful-content",
    "https://developers.google.com/search/docs/essentials/spam-policies",
  ]) assert.match(sources, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing official source ${url}`);
});

test("SEO orchestration keeps Sol Ultra as director and Terra/Luna as bounded executors", () => {
  assert.match(skill, /Sol Ultra[^\n]*(?:direct|director)/i);
  assert.match(skill, /non[- ]author(?:itative)?\s+review|review(?:s|ed)?\s+by\s+(?:a\s+)?non[- ]author/i);
  assert.match(skill, /Terra[^\n]*Luna|Luna[^\n]*Terra/i);
  assert.match(skill, /bounded[^\n]*(?:disjoint|brief)|disjoint[^\n]*(?:bounded|brief)/i);
});

test("SEO reports missing external evidence as UNKNOWN", () => {
  assert.match(skill, /(?:missing|unavailable|absent)[^\n]*(?:external\s+data|evidence|source)[^\n]*UNKNOWN|external\s+data[^\n]*(?:missing|unavailable)[^\n]*UNKNOWN/i);
});

test("SEO evidence reference states the executable floors, canonical scopes, precedence, and exits", () => {
  const contract = readFileSync(join(skillDir, "references", "evidence-contract.md"), "utf8");
  for (const [field, floor] of Object.entries({
    declared_indexable: "E1",
    http_fetchable: "E2",
    rendered_content_available: "E3",
    engine_indexed: "E4",
    search_visible: "E5",
    ai_cited: "E5",
    referred: "E5",
    converted: "E5",
  })) assert.match(contract, new RegExp(`${field}[^\\n]*${floor}`, "i"), `missing ${field} ${floor} floor`);
  for (const [scope, floor] of [["served", "E2"], ["rendered", "E3"], ["engine-selected", "E4"]]) {
    assert.match(contract, new RegExp(`${scope}[^\\n]*${floor}`, "i"), `missing canonical ${scope} ${floor} floor`);
  }
  for (const [stage, floor] of Object.entries({
    crawlerAccess: "E2",
    eligibilityIndexing: "E4",
    impressionsVisibility: "E5",
    citation: "E5",
    referral: "E5",
    conversionRetention: "E5",
  })) assert.match(contract, new RegExp(`${stage}[^\\n]*${floor}`, "i"), `missing ${stage} ${floor} floor`);
  assert.match(contract, /FAIL[^\n]*(?:outranks|before|precedence)[^\n]*UNKNOWN|precedence[^\n]*FAIL[^\n]*UNKNOWN/i);
  for (const [code, meaning] of [[0, "PASS"], [1, "invalid"], [2, "FAIL"], [3, "UNKNOWN"]]) {
    assert.match(contract, new RegExp(`(?:exit|code)[^\\n]*${code}[^\\n]*${meaning}`, "i"), `missing exit ${code} ${meaning}`);
  }
});
