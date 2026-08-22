import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const skillDir = join(here, "..");
const schema = JSON.parse(readFileSync(join(skillDir, "assets", "report.schema.json"), "utf8"));
const statusEnum = ["PASS", "FAIL", "UNKNOWN", "N/A"];
const evidenceEnum = ["E0", "E1", "E2", "E3", "E4", "E5", "E6"];
const readinessFields = [
  "declared_indexable", "http_fetchable", "rendered_content_available", "canonical_consistent",
  "engine_indexed", "search_visible", "ai_cited", "referred", "converted",
];
const readinessContextFields = ["owner", "environment", "deployment", "locale"];
const funnelFields = ["crawlerAccess", "eligibilityIndexing", "impressionsVisibility", "citation", "referral", "conversionRetention"];

function fixture(name) {
  return JSON.parse(readFileSync(join(here, "fixtures", name), "utf8"));
}

function requiredFields(value, schemaNode, path = "report") {
  for (const field of schemaNode.required ?? []) {
    assert.ok(Object.hasOwn(value, field), `${path}.${field} is required`);
  }
}

function validateClaim(claim, path) {
  assert.ok(statusEnum.includes(claim.status), `${path}.status must be PASS|FAIL|UNKNOWN|N/A`);
  assert.ok(evidenceEnum.includes(claim.evidenceLevel), `${path}.evidenceLevel must be E0-E6`);
  for (const field of ["source", "observedAt", "cohort", "denominator"]) assert.ok(Object.hasOwn(claim, field), `${path}.${field} is required`);
}

function validateReport(report) {
  requiredFields(report, schema);
  assert.ok(statusEnum.includes(report.status));
  assert.ok(evidenceEnum.includes(report.evidenceLevel));
  requiredFields(report.readiness, schema.properties.readiness, "readiness");
  for (const field of readinessContextFields) assert.ok(Object.hasOwn(report.readiness, field), `readiness.${field} is required in every fixture`);
  for (const field of readinessFields) validateClaim(report.readiness[field], `readiness.${field}`);
  requiredFields(report.geoFunnel, schema.properties.geoFunnel, "geoFunnel");
  for (const field of funnelFields) {
    const stage = report.geoFunnel[field];
    assert.ok(statusEnum.includes(stage.status), `geoFunnel.${field}.status must use the exact enum`);
    assert.ok(evidenceEnum.includes(stage.evidenceLevel), `geoFunnel.${field}.evidenceLevel must use E0-E6`);
    for (const required of ["numerator", "denominator", "cohort", "source", "observedAt"]) assert.ok(Object.hasOwn(stage, required), `geoFunnel.${field}.${required} is required`);
  }
  assert.ok(Array.isArray(report.sources) && report.sources.length > 0);
  for (const source of report.sources) {
    for (const field of ["publisher", "directUrl", "supportedClaim", "verifiedAt"]) assert.ok(source[field], `source.${field} is required`);
    assert.equal(source.verifiedAt, "2026-08-22");
  }
}

test("schema uses exact evidence levels and claim statuses", () => {
  assert.deepEqual(schema.$defs.evidenceLevel.enum, evidenceEnum);
  assert.deepEqual(schema.$defs.status.enum, statusEnum);
  assert.doesNotMatch(JSON.stringify(schema), /GREEN|RED|BLOCKED|NOT_RUN/);
  assert.deepEqual(schema.properties.readiness.required.slice(-9), readinessFields);
  assert.deepEqual(schema.properties.geoFunnel.required, funnelFields);
});

test("schema defines the exact readiness fields and requires evidence-bearing metadata", () => {
  const required = schema.properties.readiness.required;
  for (const field of ["timestamp", "observedAt", "source", "url", "property", "denominator", "cohort", "evidence"]) assert.ok(required.includes(field), `${field} is required`);
  for (const field of readinessContextFields) {
    assert.ok(Object.hasOwn(schema.properties.readiness.properties, field), `readiness.properties.${field} is required`);
    assert.ok(required.includes(field), `readiness.required must include ${field}`);
  }
  for (const field of readinessFields) {
    const claim = schema.properties.readiness.properties[field];
    assert.equal(claim.$ref, `#/$defs/claim`);
  }
  const evidenceReport = schema.oneOf?.find((branch) => branch.properties?.artifactKind?.const === "evidence-report");
  assert.ok(evidenceReport?.required?.includes("sources"), "sources must be required for evidence-report artifacts");
});

test("E0-E6 definitions state the exact evidence boundary and non-promotion rule", () => {
  const contract = readFileSync(join(skillDir, "references", "evidence-contract.md"), "utf8");
  assert.match(contract, /E0[^\n]*assertion[^\n]*no evidence/i);
  assert.match(contract, /E1[^\n]*repository\/static[^\n]*intent/i);
  assert.match(contract, /E2[^\n]*HTTP response[^\n]*headers[^\n]*robots[^\n]*sitemap[^\n]*raw served HTML/i);
  assert.match(contract, /E3[^\n]*browser-executed[^\n]*rendered DOM[^\n]*runtime/i);
  assert.match(contract, /E4[^\n]*Google\/Bing[^\n]*(?:inspection|index) reports/i);
  assert.match(contract, /E5[^\n]*impressions[^\n]*clicks[^\n]*citations[^\n]*referrals[^\n]*conversions/i);
  assert.match(contract, /E6[^\n]*preregistered[^\n]*comparable experiment/i);
  assert.match(contract, /never promote|do not promote/i);
});

test("report fixtures satisfy the exact contract and preserve UNKNOWN external evidence", () => {
  const complete = fixture("complete-report.json");
  const unknown = fixture("unknown-external-report.json");
  validateReport(complete);
  validateReport(unknown);
  assert.equal(complete.status, "UNKNOWN");
  assert.equal(unknown.status, "UNKNOWN");
  for (const field of ["engine_indexed", "search_visible", "ai_cited", "referred", "converted"]) {
    assert.equal(unknown.readiness[field].status, "UNKNOWN", `${field} must remain UNKNOWN without external data`);
  }
  for (const stage of Object.values(unknown.geoFunnel)) {
    assert.equal(stage.status, "UNKNOWN");
    assert.equal(stage.numerator, null);
    assert.equal(stage.denominator, null);
  }
  assert.match(unknown.unknowns.join(" "), /missing external data|publisher consoles/i);
});

test("deterministic HTML/XML fixtures cover parser and indexability boundaries", () => {
  const expected = {
    "cjk.html": /世界|中文|日本語|한국어/,
    "empty.html": /<body>\s*<\/body>/i,
    "indexable.html": /robots[^>]+index|index[^>]+robots/i,
    "metadata-variants.html": /canonical|robots/i,
    "noindex.html": /noindex/i,
    "sitemap-index.xml": /<sitemapindex|<sitemap>/i,
    "sitemap-urlset.xml": /<urlset|<url>/i,
  };
  for (const [name, pattern] of Object.entries(expected)) {
    const path = join(here, "fixtures", name);
    assert.ok(existsSync(path), `missing fixture ${name}`);
    assert.match(readFileSync(path, "utf8"), pattern, `fixture ${name} lacks its boundary`);
  }
});

test("GEO references preserve publisher-console UNKNOWN and crawler-policy distinctions", () => {
  const geo = readFileSync(join(skillDir, "references", "geo-controls.md"), "utf8");
  const sources = readFileSync(join(skillDir, "references", "sources.md"), "utf8");
  for (const term of ["Googlebot", "Search AI", "snippet", "Google-Extended", "NOARCHIVE", "NOCACHE", "IndexNow", "AI Performance", "OpenAI SearchBot", "GPTBot", "ChatGPT-User", "PerplexityBot", "Perplexity-User", "ClaudeBot", "Claude-SearchBot", "Claude-User"]) assert.match(geo, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `missing GEO control ${term}`);
  assert.match(geo, /publisher consoles[^\n]*UNKNOWN|absence[^\n]*consoles[^\n]*UNKNOWN/i);
  assert.match(geo, /ordinary indexed[^\n]*snippet-eligible|no special AI file[^\n]*schema/i);
  assert.match(geo, /noindex[^\n]*blocks indexing/i);
  assert.match(geo, /NOARCHIVE[^\n]*Copilot[^\n]*(?:linking|training)/i);
  assert.match(geo, /NOCACHE[\s\S]*?URL[\s\S]*?title[\s\S]*?snippet/i);
  assert.match(geo, /IndexNow[^\n]*(?:notification|not a guarantee)[^\n]*(?:crawl|index|rank)/i);
  assert.match(geo, /PerplexityBot[^\n]*obeys robots/i);
  assert.match(geo, /Perplexity-User[^\n]*(?:user-triggered|generally ignores robots)/i);
  assert.match(geo, /blocked-URL summarization misuse[^\n]*disabled/i);
  for (const url of [
    "https://developers.google.com/search/docs/appearance/ai-features",
    "https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers#google-extended",
    "https://www.bing.com/webmasters/help/robots-meta-tags-and-attributes-that-bing-supports-5198d240",
    "https://www.bing.com/indexnow/getstarted",
    "https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c",
    "https://www.perplexity.ai/help-center/en/articles/10354969-how-does-perplexity-follow-robots-txt",
    "https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler",
  ]) assert.match(sources, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing official source ${url}`);
  assert.match(sources, /Publisher\s*\|\s*Direct URL\s*\|\s*Supported claim\s*\|\s*Verified/i);
  assert.match(sources, /re-check|recheck|re-check first-party sources/i);
  assert.match(sources, /2026-08-22/g);
});

test("GEO controls preserve current Google and Bing presentation and reporting limits", () => {
  const geo = readFileSync(join(skillDir, "references", "geo-controls.md"), "utf8");
  assert.match(geo, /Googlebot[^\n]*(?:Search crawling|Search AI)|(?:Search crawling|Search AI)[^\n]*Googlebot/i);
  for (const control of ["noindex", "nosnippet", "data-nosnippet", "max-snippet"]) assert.match(geo, new RegExp(control, "i"), `missing Google presentation control ${control}`);
  assert.match(geo, /generative AI report[^\n]*impressions/i);
  assert.match(geo, /generative AI report[^\n]*(?:limited dimensions|not causal)|(?:limited dimensions|not causal)[^\n]*generative AI report/i);
  assert.match(geo, /AI Performance[^\n]*(?:sampled|aggregated)/i);
  assert.match(geo, /citations[^\n]*(?:not|aren't|are not)[^\n]*(?:rankings|clicks|traffic|authority|causal)/i);
  assert.match(geo, /(?:OpenAI|OAI-SearchBot)[^\n]*(?:no|does not)[^\n]*publisher[^\n]*(?:console|report)|publisher[^\n]*(?:console|report)[^\n]*(?:OpenAI|OAI-SearchBot)/i);
  assert.match(geo, /Anthropic[^\n]*(?:no|does not)[^\n]*publisher[^\n]*(?:console|report)|publisher[^\n]*(?:console|report)[^\n]*Anthropic/i);
});
