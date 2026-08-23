#!/usr/bin/env node
// Local, evidence-bound planning only. This command never contacts an engine,
// submits a URL, reads credentials, or writes an artifact.
import { readFileSync } from "node:fs";
import { parseArgs, integer } from "./lib/cli.mjs";
import { validateArtifact } from "./lib/schema.mjs";

const INPUT_SCHEMA = JSON.parse(readFileSync(new URL("../assets/indexing-plan.schema.json", import.meta.url), "utf8"));
const PRIORITY_ORDER = new Map([["P0", 0], ["P1", 1], ["P2", 2]]);
const ROLE_ORDER = new Map([["homepage", 0], ["hub", 1], ["detail", 2]]);
const EVIDENCE_RANK = new Map([["E0", 0], ["E1", 1], ["E2", 2], ["E3", 3], ["E4", 4], ["E5", 5], ["E6", 6]]);
const NON_ENGINE_PREREQUISITES = ["declaredIndexable", "httpFetchable", "renderedContent", "canonicalConsistent", "internalDiscoverable", "sitemapListed", "lastmodAccurate"];
const CONCLUSIVE_FLOORS = { declaredIndexable: 2, httpFetchable: 2, renderedContent: 3, canonicalConsistent: 2, internalDiscoverable: 2, sitemapListed: 2, lastmodAccurate: 2, engineIndexed: 4 };
const KNOWN_NOT_INDEXED = new Set(["UNKNOWN_TO_GOOGLE", "DISCOVERED_NOT_CRAWLED", "CRAWLED_NOT_INDEXED", "BLOCKED", "DUPLICATE", "REDIRECT"]);
const UNKNOWN_STATES = new Set(["UNKNOWN", "ERROR"]);
const QUEUED_OR_VALIDATING = new Set(["REQUEST_QUEUED", "VALIDATION_STARTED", "VALIDATION_PASSED", "VALIDATION_FAILED"]);
const LIMITATIONS = ["no submission", "queued not crawl/index", "discovery hints", "no guarantees indexing/rank/traffic/timing"];
const PROHIBITED_ACTIONS = ["generic Indexing API ordinary URLs", "repeated requests/unchanged sitemap resubmission", "deprecated sitemap ping", "fake lastmod", "manipulated traffic/links", "guaranteed outcomes/timing"];
const ACTION_POLICY = Object.freeze({
  INSPECT_IN_SEARCH_CONSOLE: Object.freeze({ requiresApproval: false, manualOnly: true }),
  FIX_ELIGIBILITY: Object.freeze({ requiresApproval: true, manualOnly: false }),
  ADD_CRAWLABLE_INTERNAL_LINK: Object.freeze({ requiresApproval: true, manualOnly: false }),
  FIX_SITEMAP_MEMBERSHIP: Object.freeze({ requiresApproval: true, manualOnly: false }),
  CORRECT_OR_REMOVE_LASTMOD: Object.freeze({ requiresApproval: true, manualOnly: false }),
  IMPROVE_VALUE_CANONICAL_UNIQUENESS: Object.freeze({ requiresApproval: true, manualOnly: false }),
  SUBMIT_SITEMAP_MANUALLY: Object.freeze({ requiresApproval: true, manualOnly: true }),
  REQUEST_INDEXING_MANUALLY: Object.freeze({ requiresApproval: true, manualOnly: true }),
  RESTART_VALIDATION_MANUALLY: Object.freeze({ requiresApproval: true, manualOnly: true }),
  WAIT_AND_REINSPECT: Object.freeze({ requiresApproval: false, manualOnly: false }),
  DIAGNOSE_CRAWL_DEMAND_CAPACITY: Object.freeze({ requiresApproval: false, manualOnly: false }),
  MONITOR_INDEXED: Object.freeze({ requiresApproval: false, manualOnly: false }),
});

function fail(message) { throw new Error(message); }
function rank(level) { return EVIDENCE_RANK.get(level) ?? -1; }
function conclusive(claim) { return claim.status === "PASS" || claim.status === "FAIL"; }
function isRfc3339(text) { return typeof text === "string" && Number.isFinite(Date.parse(text)); }

function validateEvidence(record, path, asOf, errors) {
  const evidence = rank(record.evidenceLevel);
  if (!(typeof record.detail === "string" && record.detail.trim())) errors.push(`${path}.detail must be nonblank`);
  if (evidence === 0) {
    if (record.source !== null || record.observedAt !== null) errors.push(`${path} E0 requires source and observedAt to be null`);
    return;
  }
  if (!(typeof record.source === "string" && record.source.trim())) errors.push(`${path} E1+ requires a nonempty source`);
  if (!isRfc3339(record.observedAt)) errors.push(`${path} E1+ requires an RFC3339 observedAt`);
  else if (Date.parse(record.observedAt) > Date.parse(asOf)) errors.push(`${path}.observedAt must not be after asOf`);
}

function parsedTargetUrl(value, label) {
  if (value !== value.trim() || /[\u0000-\u001F\u007F]/u.test(value)) fail(label + " must not include surrounding whitespace or control characters");
  if (value.includes("#")) fail(label + " must not include a fragment");
  let parsed;
  try { parsed = new URL(value); } catch { fail(`${label} must be an absolute HTTP(S) URL`); }
  if (!(["http:", "https:"].includes(parsed.protocol)) || !parsed.hostname) fail(`${label} must be an absolute HTTP(S) URL`);
  if (parsed.username || parsed.password || parsed.hash) fail(`${label} must not include userinfo or a fragment`);
  return parsed;
}

function propertyScope(value) {
  if (value.startsWith("sc-domain:")) {
    const domain = value.slice("sc-domain:".length);
    let parsed;
    try { parsed = new URL(`https://${domain}`); } catch { fail("property sc-domain must contain a hostname"); }
    if (!domain || parsed.hostname !== domain.toLowerCase() || parsed.pathname !== "/" || parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash) fail("property sc-domain must contain only a hostname");
    return { kind: "domain", domain: parsed.hostname };
  }
  const prefix = parsedTargetUrl(value, "property URL-prefix");
  if (prefix.search) fail("property URL-prefix must not include a query");
  return { kind: "prefix", origin: prefix.origin, literal: prefix.href };
}

function urlInScope(parsed, scope) {
  if (scope.kind === "domain") return parsed.hostname === scope.domain || parsed.hostname.endsWith(`.${scope.domain}`);
  return parsed.origin === scope.origin && parsed.href.startsWith(scope.literal);
}

function semanticErrors(input) {
  const errors = [];
  if (input.exampleOnly) errors.push("exampleOnly input cannot be executed");
  if (!isRfc3339(input.asOf)) errors.push("asOf must be RFC3339");
  let scope;
  try { scope = propertyScope(input.property); } catch (error) { errors.push(error.message); }
  for (const [name, value] of [["sitemapSubmitted", input.sitemapSubmitted], ["crawlHealth", input.crawlHealth]]) {
    validateEvidence(value, name, input.asOf, errors);
    if (value.status === "N/A") errors.push(`${name} cannot be N/A`);
    if (conclusive(value) && rank(value.evidenceLevel) < 4) errors.push(`${name} conclusive status requires E4 evidence or stronger`);
  }
  const normalized = new Set();
  for (const [index, record] of input.urls.entries()) {
    const path = `urls[${index}]`;
    let parsed;
    try {
      parsed = parsedTargetUrl(record.url, `${path}.url`);
      if (scope && !urlInScope(parsed, scope)) errors.push(`${path}.url is outside property scope`);
      if (normalized.has(parsed.href)) errors.push(`${path}.url duplicates a normalized URL`);
      normalized.add(parsed.href);
    } catch (error) { errors.push(error.message); }
    for (const [claimName, claimValue] of Object.entries(record.claims)) {
      const claimPath = `${path}.claims.${claimName}`;
      validateEvidence(claimValue, claimPath, input.asOf, errors);
      if (claimValue.status === "N/A" && claimName !== "lastmodAccurate") errors.push(`${claimPath} cannot be N/A`);
      if (claimName === "lastmodAccurate" && claimValue.status === "N/A" && claimValue.evidenceLevel !== "E0") errors.push(`${claimPath} N/A requires E0 evidence`);
      if (conclusive(claimValue) && rank(claimValue.evidenceLevel) < CONCLUSIVE_FLOORS[claimName]) errors.push(`${claimPath} conclusive status requires E${CONCLUSIVE_FLOORS[claimName]} evidence or stronger`);
    }
    const engine = record.claims.engineIndexed;
    if (engine.googleState === "INDEXED" && !(engine.status === "PASS" && rank(engine.evidenceLevel) >= 4)) errors.push(`${path}.claims.engineIndexed INDEXED requires PASS E4+`);
    if (KNOWN_NOT_INDEXED.has(engine.googleState) && !(engine.status === "FAIL" && rank(engine.evidenceLevel) >= 4)) errors.push(`${path}.claims.engineIndexed known nonindexed state requires FAIL E4+`);
    if (UNKNOWN_STATES.has(engine.googleState) && engine.status !== "UNKNOWN") errors.push(`${path}.claims.engineIndexed ${engine.googleState} requires UNKNOWN`);
    if (UNKNOWN_STATES.has(engine.googleState) && rank(engine.evidenceLevel) !== 0) errors.push(`${path}.claims.engineIndexed ${engine.googleState} requires E0 evidence`);
    validateEvidence(record.submission, `${path}.submission`, input.asOf, errors);
    const submissionRank = rank(record.submission.evidenceLevel);
    if (record.submission.state === "UNKNOWN" && submissionRank !== 0) errors.push(`${path}.submission UNKNOWN requires E0`);
    if (record.submission.state === "NOT_REQUESTED" && submissionRank < 1) errors.push(`${path}.submission NOT_REQUESTED requires E1+`);
    if (QUEUED_OR_VALIDATING.has(record.submission.state) && submissionRank < 4) errors.push(`${path}.submission ${record.submission.state} requires E4+`);
  }
  return errors;
}

function prerequisitesPass(record) {
  return NON_ENGINE_PREREQUISITES.every((name) => name === "lastmodAccurate" ? ["PASS", "N/A"].includes(record.claims[name].status) : record.claims[name].status === "PASS");
}

function candidate(record, globalReady) {
  const engineState = record.claims.engineIndexed.googleState;
  return globalReady && prerequisitesPass(record) && ["P0", "P1"].includes(record.priority) && ["homepage", "hub"].includes(record.role) && ["UNKNOWN_TO_GOOGLE", "DISCOVERED_NOT_CRAWLED"].includes(engineState) && record.submission.state === "NOT_REQUESTED";
}

function compareRecords(left, right) {
  return PRIORITY_ORDER.get(left.priority) - PRIORITY_ORDER.get(right.priority)
    || ROLE_ORDER.get(left.role) - ROLE_ORDER.get(right.role)
    || codePointCompare(normalizedUrl(left.url), normalizedUrl(right.url))
    || codePointCompare(left.url, right.url);
}

function codePointCompare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function normalizedUrl(value) { return new URL(value).href; }

function highestEvidence(input) {
  const records = [input.sitemapSubmitted, input.crawlHealth];
  for (const record of input.urls) records.push(...Object.values(record.claims), record.submission);
  return `E${Math.max(0, ...records.map((record) => rank(record.evidenceLevel)))}`;
}

function makeAction({ url, phase, action, status, evidenceLevel, reason }) {
  const policy = ACTION_POLICY[action];
  if (!policy) fail(`unsupported action: ${action}`);
  return { url, phase, action, status, evidenceLevel, reason, requiresApproval: policy.requiresApproval, manualOnly: policy.manualOnly };
}

function canSubmitSitemap(input) {
  return input.sitemapSubmitted.status === "FAIL"
    && rank(input.sitemapSubmitted.evidenceLevel) >= 4
    && input.crawlHealth.status === "PASS"
    && rank(input.crawlHealth.evidenceLevel) >= 4
    && input.urls.every(prerequisitesPass);
}

function addEngineAction(record, cappedUrls, add) {
  const engine = record.claims.engineIndexed;
  const base = { url: record.url, phase: record.priority, status: engine.status, evidenceLevel: engine.evidenceLevel };
  if (["UNKNOWN", "ERROR"].includes(engine.googleState)) {
    add({ ...base, action: "INSPECT_IN_SEARCH_CONSOLE", reason: `${engine.googleState} engine evidence requires a manual inspection.` });
    return;
  }
  if (["UNKNOWN_TO_GOOGLE", "DISCOVERED_NOT_CRAWLED"].includes(engine.googleState)) {
    if (!cappedUrls.has(record.url)) add({ ...base, action: "DIAGNOSE_CRAWL_DEMAND_CAPACITY", reason: `${engine.googleState} is observed non-indexing evidence and needs a demand/capacity diagnosis.` });
    return;
  }
  if (["CRAWLED_NOT_INDEXED", "DUPLICATE"].includes(engine.googleState)) {
    add({ ...base, action: "IMPROVE_VALUE_CANONICAL_UNIQUENESS", reason: `${engine.googleState} requires a value and canonical-uniqueness diagnosis.` });
    return;
  }
  if (["BLOCKED", "REDIRECT"].includes(engine.googleState)) {
    add({ ...base, action: "FIX_ELIGIBILITY", reason: `${engine.googleState} must be fixed before reconsidering indexing.` });
    return;
  }
  if (engine.googleState === "INDEXED") add({ ...base, action: "MONITOR_INDEXED", reason: "Engine evidence says the URL is indexed; monitoring makes no outcome guarantee." });
}

function compareActions(left, right, recordsByUrl) {
  const priority = PRIORITY_ORDER.get(left.phase) - PRIORITY_ORDER.get(right.phase);
  if (priority) return priority;
  const leftRecord = left.url === null ? null : recordsByUrl.get(left.url);
  const rightRecord = right.url === null ? null : recordsByUrl.get(right.url);
  if (!leftRecord || !rightRecord) {
    if (!leftRecord && !rightRecord) return codePointCompare(left.action, right.action);
    return leftRecord ? 1 : -1;
  }
  return ROLE_ORDER.get(leftRecord.role) - ROLE_ORDER.get(rightRecord.role)
    || codePointCompare(normalizedUrl(left.url), normalizedUrl(right.url))
    || codePointCompare(left.action, right.action);
}

function planActions(input, cappedCandidates) {
  const actions = [];
  const add = (spec) => actions.push(makeAction(spec));
  if (canSubmitSitemap(input)) add({ url: null, phase: "P0", action: "SUBMIT_SITEMAP_MANUALLY", status: input.sitemapSubmitted.status, evidenceLevel: input.sitemapSubmitted.evidenceLevel, reason: "Sitemap submission failed while crawl health and every URL prerequisite are observed passing; manual submission still requires approval." });
  if (input.crawlHealth.status === "FAIL") add({ url: null, phase: "P0", action: "DIAGNOSE_CRAWL_DEMAND_CAPACITY", status: input.crawlHealth.status, evidenceLevel: input.crawlHealth.evidenceLevel, reason: "Crawl-health evidence is failed; diagnose demand and capacity without making changes." });
  const failedPrerequisiteActions = {
    declaredIndexable: "FIX_ELIGIBILITY",
    httpFetchable: "FIX_ELIGIBILITY",
    renderedContent: "FIX_ELIGIBILITY",
    canonicalConsistent: "FIX_ELIGIBILITY",
    internalDiscoverable: "ADD_CRAWLABLE_INTERNAL_LINK",
    sitemapListed: "FIX_SITEMAP_MEMBERSHIP",
    lastmodAccurate: "CORRECT_OR_REMOVE_LASTMOD",
  };
  const cappedUrls = new Set(cappedCandidates.map((record) => record.url));
  for (const record of input.urls) {
    for (const claimName of NON_ENGINE_PREREQUISITES) {
      const claim = record.claims[claimName];
      if (claim.status === "FAIL") add({ url: record.url, phase: record.priority, action: failedPrerequisiteActions[claimName], status: claim.status, evidenceLevel: claim.evidenceLevel, reason: `${claimName} has conclusive failed evidence; the proposed repair requires approval.` });
      if (claim.status === "UNKNOWN") add({ url: record.url, phase: record.priority, action: "INSPECT_IN_SEARCH_CONSOLE", status: claim.status, evidenceLevel: claim.evidenceLevel, reason: `${claimName} is incomplete; inspect manually before deciding on a change.` });
    }
    if (QUEUED_OR_VALIDATING.has(record.submission.state)) add({ url: record.url, phase: record.priority, action: "WAIT_AND_REINSPECT", status: record.submission.state === "VALIDATION_FAILED" ? "FAIL" : "UNKNOWN", evidenceLevel: record.submission.evidenceLevel, reason: `${record.submission.state} is not evidence of crawl or indexing; wait and reinspect without restarting validation.` });
    if (record.submission.state === "UNKNOWN") {
      add({ url: record.url, phase: record.priority, action: "INSPECT_IN_SEARCH_CONSOLE", status: "UNKNOWN", evidenceLevel: record.submission.evidenceLevel, reason: "Submission state is unknown; inspect manually and do not repeat a request." });
      add({ url: record.url, phase: record.priority, action: "WAIT_AND_REINSPECT", status: "UNKNOWN", evidenceLevel: record.submission.evidenceLevel, reason: "Submission state is unknown; wait for evidence before any further manual action." });
    }
    addEngineAction(record, cappedUrls, add);
  }
  for (const record of cappedCandidates) {
    const engine = record.claims.engineIndexed;
    add({ url: record.url, phase: record.priority, action: "REQUEST_INDEXING_MANUALLY", status: engine.status, evidenceLevel: engine.evidenceLevel, reason: "Eligible high-priority URL is a manual request candidate, not a submission or guarantee." });
  }
  const recordsByUrl = new Map(input.urls.map((record) => [record.url, record]));
  return actions.sort((left, right) => compareActions(left, right, recordsByUrl));
}

function outcome(input) {
  const required = [input.sitemapSubmitted, input.crawlHealth, ...input.urls.flatMap((record) => Object.values(record.claims))];
  if (required.some((claim) => claim.status === "FAIL")) return "FAIL";
  const incomplete = [input.sitemapSubmitted, input.crawlHealth].some((claim) => claim.status === "UNKNOWN" || claim.status === "N/A")
    || input.urls.some((record) => Object.entries(record.claims).some(([name, claim]) => (name !== "lastmodAccurate" || claim.status !== "N/A") && (claim.status === "UNKNOWN" || claim.status === "N/A")))
    || input.urls.some((record) => record.claims.engineIndexed.googleState !== "INDEXED");
  return incomplete ? "UNKNOWN" : "PASS";
}

function buildPlan(input, maxRequests) {
  const globalReady = input.sitemapSubmitted.status === "PASS" && input.crawlHealth.status === "PASS";
  const candidates = input.urls.filter((record) => candidate(record, globalReady)).sort(compareRecords);
  const cappedCandidates = candidates.slice(0, maxRequests);
  const status = outcome(input);
  const knownNotIndexed = input.urls.filter((record) => KNOWN_NOT_INDEXED.has(record.claims.engineIndexed.googleState)).length;
  const indexed = input.urls.filter((record) => record.claims.engineIndexed.googleState === "INDEXED").length;
  const unknown = input.urls.filter((record) => UNKNOWN_STATES.has(record.claims.engineIndexed.googleState)).length;
  const exitCode = status === "PASS" ? 0 : status === "FAIL" ? 2 : 3;
  return {
    kind: "seo-indexing-plan",
    contractVersion: "seo-indexing-plan/v1.1",
    generatedAt: input.asOf,
    property: input.property,
    status,
    verdict: status,
    exitClassification: status,
    exitCode,
    evidenceLevel: highestEvidence(input),
    summary: {
      total: input.urls.length,
      indexed,
      knownNotIndexed,
      unknown,
      blockedPrerequisites: input.urls.filter((record) => !prerequisitesPass(record)).length,
      requestCandidateCount: cappedCandidates.length,
    },
    requestCandidates: cappedCandidates.map((record) => record.url),
    actions: planActions(input, cappedCandidates),
    limitations: LIMITATIONS,
    prohibitedActions: PROHIBITED_ACTIONS,
  };
}

function markdown(plan) {
  const lines = [
    "# SEO indexing plan",
    "",
    `Kind: ${plan.kind}`,
    `Contract version: ${plan.contractVersion}`,
    `Generated at: ${plan.generatedAt}`,
    `Property: ${plan.property}`,
    `Status: ${plan.status}`,
    `Verdict: ${plan.verdict}`,
    `Exit classification: ${plan.exitClassification}`,
    `Exit code: ${plan.exitCode}`,
    `Evidence level: ${plan.evidenceLevel}`,
    "",
    "## Summary",
    ...Object.entries(plan.summary).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Request candidates",
    ...(plan.requestCandidates.length ? plan.requestCandidates.map((url) => `- ${url}`) : ["- none"]),
    "",
    "## Actions",
    ...(plan.actions.length ? plan.actions.map((action) => `- url: ${action.url === null ? "null (property)" : action.url}; phase: ${action.phase}; action: ${action.action}; status: ${action.status}; evidenceLevel: ${action.evidenceLevel}; requiresApproval: ${action.requiresApproval}; manualOnly: ${action.manualOnly}; reason: ${action.reason}`) : ["- none"]),
    "",
    "## Limitations",
    ...plan.limitations.map((value) => `- ${value}`),
    "",
    "## Prohibited actions",
    ...plan.prohibitedActions.map((value) => `- ${value}`),
  ];
  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2), { value: ["input", "max-requests"], boolean: ["md"] });
  if (!args.input) fail("--input <file.json> is required");
  const maxRequests = integer(args["max-requests"], 10, { min: 0, max: 50, name: "max-requests" });
  let input;
  try { input = JSON.parse(readFileSync(args.input, "utf8")); } catch (error) { fail(`cannot read input JSON: ${error.message}`); }
  const schemaResult = validateArtifact(input, INPUT_SCHEMA);
  if (!schemaResult.valid) fail(`invalid input: ${schemaResult.errors.map((error) => `${error.pointer} ${error.message}`).join("; ")}`);
  const errors = semanticErrors(input);
  if (errors.length) fail(`invalid input: ${errors.sort().join("; ")}`);
  const plan = buildPlan(input, maxRequests);
  process.stdout.write(args.md ? markdown(plan) : `${JSON.stringify(plan)}\n`);
  process.exitCode = plan.exitCode;
}

try { main(); } catch (error) {
  process.stderr.write(`indexing-plan.mjs: ${error.message}\n`);
  process.exitCode = 1;
}
