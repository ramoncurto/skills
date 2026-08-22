import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const skillDir = join(here, "..");
const scriptsDir = join(skillDir, "scripts");
const scorecardPath = join(scriptsDir, "seo-scorecard.mjs");
const schemaPath = join(skillDir, "assets", "report.schema.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const fixtures = ["complete-report.json", "unknown-external-report.json"].map((name) => JSON.parse(readFileSync(join(here, "fixtures", name), "utf8")));
const statusEnum = ["PASS", "FAIL", "UNKNOWN", "N/A"];
const evidenceEnum = ["E0", "E1", "E2", "E3", "E4", "E5", "E6"];
const evidenceReportVerdicts = ["PASS", "FAIL", "UNKNOWN", "N/A"];
const scorecardVerdicts = ["BASELINE", "KEEP", "REVERT", "NEUTRAL", "FAIL", "UNKNOWN"];
const envelopeFields = ["artifactKind", "schemaVersion", "contractVersion", "status", "verdict", "verdictDetail", "exitClassification", "generatedAt", "observedAt", "evidenceLevel", "evidence", "limitations", "configHash", "sourceRevision", "checks", "failures", "unknowns", "delta"];

let schemaModule;
try {
  schemaModule = await import(pathToFileURL(join(scriptsDir, "lib", "schema.mjs")).href);
} catch (error) {
  schemaModule = { importError: error };
}

function validator() {
  const validate = schemaModule.validateArtifact ?? schemaModule.validateReport ?? schemaModule.validateSchema ?? schemaModule.validate ?? schemaModule.default?.validate;
  assert.equal(typeof validate, "function", `expected zero-dependency validator API from scripts/lib/schema.mjs (${schemaModule.importError?.message || "missing validate export"})`);
  return validate;
}

function validationResult(validate, value) {
  const result = validate(value, schema);
  if (typeof result === "boolean") return { valid: result, errors: validate.errors || [] };
  if (result && typeof result.valid === "boolean") return result;
  return { valid: false, errors: [{ message: "validator must return boolean or { valid, errors }" }] };
}

function assertValid(value, label) {
  const result = validationResult(validator(), value);
  assert.equal(result.valid, true, `${label} should validate: ${JSON.stringify(result.errors)}`);
}

function assertInvalid(value, pointer, label) {
  const result = validationResult(validator(), value);
  assert.equal(result.valid, false, `${label} should be rejected`);
  assert.match(JSON.stringify(result.errors), new RegExp(pointer.replaceAll("/", "\\/")), `${label} should identify ${pointer}`);
}

function scorecardFixture(overrides = {}) {
  return Object.assign(structuredClone(fixtures[0]), {
    artifactKind: "scorecard",
    schemaVersion: "1",
    contractVersion: "1",
    base: null,
    configVersion: "1",
    score: 0,
    requiredScore: 0,
    diagnosticScore: 0,
    evidenceSummary: { liveSamples: 0, staticChecks: 0 },
    exitCode: 0,
    passed: 0,
    total: 0,
    guardrailFails: [],
    ...overrides,
  });
}

const readinessFloors = {
  declared_indexable: "E1",
  http_fetchable: "E2",
  rendered_content_available: "E3",
  canonical_consistent: "E2",
  engine_indexed: "E4",
  search_visible: "E5",
  ai_cited: "E5",
  referred: "E5",
  converted: "E5",
};
const funnelFloors = {
  crawlerAccess: "E2",
  eligibilityIndexing: "E4",
  impressionsVisibility: "E5",
  citation: "E5",
  referral: "E5",
  conversionRetention: "E5",
};
const evidenceTimestamp = "2026-08-22T00:00:00Z";
const evidenceRank = (level) => Number(level.slice(1));

function setTopStatus(report, status) {
  report.status = status;
  report.verdict = status;
  report.exitClassification = status;
}

function preparedEvidenceReport() {
  const report = structuredClone(fixtures[0]);
  report.readiness.environment = "local";
  for (const [field, floor] of Object.entries(readinessFloors)) {
    const claim = report.readiness[field];
    claim.status = "PASS";
    claim.evidenceLevel = floor;
    claim.source = `test readiness ${field}`;
    claim.observedAt = evidenceTimestamp;
    if (field === "canonical_consistent") claim.value = { scope: "served" };
  }
  for (const [field, floor] of Object.entries(funnelFloors)) {
    const stage = report.geoFunnel[field];
    stage.status = "PASS";
    stage.evidenceLevel = floor;
    stage.numerator = 1;
    stage.denominator = 1;
    stage.source = `test funnel ${field}`;
    stage.observedAt = evidenceTimestamp;
  }
  setTopStatus(report, "PASS");
  report.evidenceLevel = "E5";
  report.evidence = [{ level: "E5", source: "test top-level evidence", observedAt: evidenceTimestamp }];
  return report;
}

function setRequiredStatus(report, status) {
  for (const [field, floor] of Object.entries(readinessFloors)) {
    const claim = report.readiness[field];
    claim.status = status;
    if (status === "N/A") {
      claim.evidenceLevel = "E0";
      claim.source = null;
      claim.observedAt = null;
    } else {
      claim.evidenceLevel = floor;
      claim.source = `test readiness ${field}`;
      claim.observedAt = evidenceTimestamp;
    }
  }
  for (const [field, floor] of Object.entries(funnelFloors)) {
    const stage = report.geoFunnel[field];
    stage.status = status;
    if (status === "N/A") {
      stage.evidenceLevel = "E0";
      stage.source = null;
      stage.observedAt = null;
    } else {
      stage.evidenceLevel = floor;
      stage.numerator = 1;
      stage.denominator = 1;
      stage.source = `test funnel ${field}`;
      stage.observedAt = evidenceTimestamp;
    }
  }
}

function assertRejected(value, label) {
  const result = validationResult(validator(), value);
  assert.equal(result.valid, false, `${label} should be rejected: ${JSON.stringify(result.errors)}`);
  return result;
}

function commonEnvelopeAssertions(artifact) {
  for (const field of envelopeFields) assert.ok(Object.hasOwn(artifact, field), `missing envelope field ${field}`);
  assert.equal(artifact.artifactKind, "scorecard");
  assert.equal(typeof artifact.schemaVersion, "string");
  assert.equal(typeof artifact.contractVersion, "string");
  assert.ok(statusEnum.includes(artifact.status));
  assert.ok(scorecardVerdicts.includes(artifact.verdict));
  assert.ok(artifact.verdictDetail === null || typeof artifact.verdictDetail === "string");
  assert.ok(["PASS", "FAIL", "UNKNOWN", "N/A", "REVERT"].includes(artifact.exitClassification));
  assert.match(artifact.generatedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/);
  assert.match(artifact.observedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/);
  assert.ok(evidenceEnum.includes(artifact.evidenceLevel));
  assert.ok(Array.isArray(artifact.evidence));
  assert.deepEqual(Object.keys(artifact.evidenceSummary).sort(), ["liveSamples", "staticChecks"]);
  assert.ok(Object.values(artifact.evidenceSummary).every(Number.isInteger));
  assert.ok(Array.isArray(artifact.limitations));
  assert.equal(typeof artifact.configHash, "string");
  assert.equal(typeof artifact.sourceRevision, "object");
  assert.ok(Array.isArray(artifact.checks));
  assert.ok(Array.isArray(artifact.failures));
  assert.ok(Array.isArray(artifact.unknowns));
}

function staticConfig(out) {
  return { version: 1, out, staticChecks: [{ name: "contract fixture", cmd: "true", class: "eligibility" }] };
}

function runScorecard(configPath, script = scorecardPath) {
  return spawnSync(process.execPath, [script, "--config", configPath, "--static-only"], { encoding: "utf8" });
}

test("report schema is a discriminator for the two persisted artifact kinds", () => {
  assert.ok(Array.isArray(schema.oneOf), "schema must use oneOf");
  assert.equal(schema.oneOf.length, 2);
  assert.deepEqual(schema.oneOf.map((branch) => branch.properties?.artifactKind?.const).sort(), ["evidence-report", "scorecard"]);
  for (const field of envelopeFields) assert.ok(schema.required?.includes(field) || schema.oneOf.every((branch) => branch.required?.includes(field)), `common field ${field} must be required`);
  assert.deepEqual(schema.$defs?.status?.enum, statusEnum);
  assert.deepEqual(schema.$defs?.evidenceLevel?.enum, evidenceEnum);
  assert.deepEqual(schema.$defs?.verdicts?.evidenceReport?.enum, evidenceReportVerdicts);
  assert.deepEqual(schema.$defs?.verdicts?.scorecard?.enum, scorecardVerdicts);
  assert.equal(schema.properties.schemaVersion.const, "1");
  assert.ok(schema.properties.contractVersion.minLength >= 1);
  assert.deepEqual(new Set(schema.properties.verdictDetail.type), new Set(["string", "null"]));
  assert.deepEqual(new Set(schema.properties.observedAt.type), new Set(["string", "null"]));
  assert.equal(schema.properties.observedAt.format, "date-time");
  assert.match(schema.properties.configHash.pattern, /64|\{64\}/);
  assert.deepEqual(new Set(schema.$defs.evidence.properties.observedAt.type), new Set(["string", "null"]));
  assert.deepEqual(schema.$defs.check.properties.group.enum, ["static", "live"]);
  assert.ok(schema.$defs.check.properties.name.minLength >= 1);
  assert.ok(schema.$defs.check.properties.source.minLength >= 1);
  assert.ok(schema.$defs.check.oneOf?.some((branch) => branch.properties?.group?.const === "static" && branch.properties?.evidenceLevel?.const === "E1"));
  assert.ok(schema.$defs.check.oneOf?.some((branch) => branch.properties?.group?.const === "live" && branch.properties?.evidenceLevel?.const === "E2"));
});

test("static-only scorecard persists the exact common envelope and evidence-bearing checks", () => {
  const temp = mkdtempSync(join(process.env.TMPDIR || "/tmp", "seo-artifact-contract-"));
  try {
    const configPath = join(temp, "config.json");
    writeFileSync(configPath, JSON.stringify(staticConfig(join(temp, "out"))));
    const result = runScorecard(configPath);
    assert.equal(result.status, 0, result.stderr);
    const latest = JSON.parse(readFileSync(join(temp, "out", "latest.json"), "utf8"));
    commonEnvelopeAssertions(latest);
    assert.equal(latest.evidenceLevel, "E1");
    for (const check of latest.checks) {
      for (const field of ["group", "name", "class", "guardrail", "status", "pass", "detail", "evidenceLevel", "source", "observedAt"]) assert.ok(Object.hasOwn(check, field), `check missing ${field}`);
      assert.equal(check.evidenceLevel, "E1");
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("the zero-dependency schema validator accepts both evidence fixtures and generated latest", () => {
  assertValid(fixtures[0], "complete evidence fixture");
  assertValid(fixtures[1], "unknown-external evidence fixture");
  const temp = mkdtempSync(join(process.env.TMPDIR || "/tmp", "seo-artifact-validator-"));
  try {
    const configPath = join(temp, "config.json");
    writeFileSync(configPath, JSON.stringify(staticConfig(join(temp, "out"))));
    assert.equal(runScorecard(configPath).status, 0);
    assertValid(JSON.parse(readFileSync(join(temp, "out", "latest.json"), "utf8")), "generated latest");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("deleting one required field produces a deterministic JSON-pointer rejection", () => {
  const broken = structuredClone(fixtures[0]);
  delete broken.readiness.deployment;
  assertInvalid(broken, "/readiness/deployment", "missing deployment");
});

test("source verifiedAt accepts another valid ISO date but rejects an invalid date", () => {
  const valid = structuredClone(fixtures[0]);
  valid.sources[0].verifiedAt = "2026-08-23";
  assertValid(valid, "alternate verifiedAt");
  const invalid = structuredClone(valid);
  invalid.sources[0].verifiedAt = "2026-99-99";
  assertInvalid(invalid, "/sources/0/verifiedAt", "invalid verifiedAt");
});

test("date-time fields require a time and accept an explicit numeric timezone", () => {
  const valid = structuredClone(fixtures[0]);
  valid.generatedAt = "2026-08-22T18:00:00+02:00";
  assertValid(valid, "numeric-timezone generatedAt");
  const invalid = structuredClone(valid);
  invalid.generatedAt = "2026-08-22";
  assertInvalid(invalid, "/generatedAt", "date-only generatedAt");
  const rolled = structuredClone(valid);
  rolled.generatedAt = "2026-02-30T18:00:00Z";
  assertInvalid(rolled, "/generatedAt", "rolled-over generatedAt");
});

test("null evidence observation time is reserved for E0", () => {
  const assertion = structuredClone(fixtures[0]);
  assertion.evidence[0].level = "E0";
  assertion.evidence[0].observedAt = null;
  assertion.evidenceLevel = "E0";
  assertValid(assertion, "E0 assertion without observation time");
  const observed = structuredClone(assertion);
  observed.evidence[0].level = "E2";
  assertInvalid(observed, "/evidence/0", "E2 evidence without observation time");
});

test("top-level PASS or FAIL requires evidence above E0 while UNKNOWN and N/A may remain E0", () => {
  for (const [status, setup] of [["UNKNOWN", "UNKNOWN"], ["N/A", "N/A"]]) {
    const allowed = preparedEvidenceReport();
    setRequiredStatus(allowed, setup);
    setTopStatus(allowed, status);
    allowed.evidence = [];
    allowed.evidenceLevel = "E0";
    assertValid(allowed, `top-level ${status} E0`);
  }
  for (const status of ["PASS", "FAIL"]) {
    const forbidden = preparedEvidenceReport();
    setRequiredStatus(forbidden, status);
    setTopStatus(forbidden, status);
    forbidden.evidence = [];
    forbidden.evidenceLevel = "E0";
    assertRejected(forbidden, `top-level ${status} E0`);
  }
});

test("readiness conclusive claims meet their evidence floors", () => {
  for (const [field, floor] of Object.entries(readinessFloors)) {
    for (const status of ["PASS", "FAIL"]) {
      const atFloor = preparedEvidenceReport();
      const claim = atFloor.readiness[field];
      claim.status = status;
      setTopStatus(atFloor, status);
      assertValid(atFloor, `${field} ${status} ${floor}`);
      const belowFloor = structuredClone(atFloor);
      belowFloor.readiness[field].evidenceLevel = `E${evidenceRank(floor) - 1}`;
      assertRejected(belowFloor, `${field} ${status} below ${floor}`);
    }
  }
});

test("canonical conclusive claims carry scope and scope-specific evidence floors", () => {
  for (const [scope, floor] of [["served", "E2"], ["rendered", "E3"], ["engine-selected", "E4"]]) {
    const atFloor = preparedEvidenceReport();
    const claim = atFloor.readiness.canonical_consistent;
    claim.status = "PASS";
    claim.value = { scope };
    claim.evidenceLevel = floor;
    assertValid(atFloor, `canonical ${scope} ${floor}`);
    const belowFloor = structuredClone(atFloor);
    belowFloor.readiness.canonical_consistent.evidenceLevel = `E${evidenceRank(floor) - 1}`;
    assertRejected(belowFloor, `canonical ${scope} below ${floor}`);
  }
  for (const status of ["PASS", "FAIL"]) {
    const missingScope = preparedEvidenceReport();
    const claim = missingScope.readiness.canonical_consistent;
    claim.status = status;
    claim.value = {};
    assertRejected(missingScope, `canonical ${status} without value.scope`);
  }
});

test("UNKNOWN and N/A readiness and funnel evidence remain valid across E0-E6", () => {
  const targets = [
    ["readiness", (report) => report.readiness.http_fetchable],
    ["funnel", (report) => report.geoFunnel.crawlerAccess],
  ];
  for (const status of ["UNKNOWN", "N/A"]) {
    for (const [kind, select] of targets) {
      for (const level of evidenceEnum) {
        const report = structuredClone(fixtures[0]);
        const claim = select(report);
        claim.status = status;
        claim.evidenceLevel = level;
        claim.source = level === "E0" ? null : "test non-conclusive evidence";
        claim.observedAt = level === "E0" ? null : evidenceTimestamp;
        assertValid(report, `${kind} ${status} ${level}`);
      }
    }
  }
});

test("funnel conclusive stages meet floors and require positive observed counts", () => {
  for (const [field, floor] of Object.entries(funnelFloors)) {
    const atFloor = preparedEvidenceReport();
    assertValid(atFloor, `${field} ${floor}`);
    const belowFloor = structuredClone(atFloor);
    belowFloor.geoFunnel[field].evidenceLevel = `E${evidenceRank(floor) - 1}`;
    assertRejected(belowFloor, `${field} below ${floor}`);
  }
  const nullNumerator = preparedEvidenceReport();
  nullNumerator.geoFunnel.crawlerAccess.numerator = null;
  assertRejected(nullNumerator, "funnel null numerator");
  const zeroDenominator = preparedEvidenceReport();
  zeroDenominator.geoFunnel.crawlerAccess.denominator = 0;
  assertRejected(zeroDenominator, "funnel zero denominator");
});

test("declared_indexable E1 is environment-bounded while E2 is valid everywhere", () => {
  const productionE1 = structuredClone(fixtures[0]);
  productionE1.readiness.declared_indexable.evidenceLevel = "E1";
  assertRejected(productionE1, "production declared_indexable E1");
  for (const status of ["PASS", "FAIL"]) {
    const local = preparedEvidenceReport();
    local.readiness.environment = "local";
    local.readiness.declared_indexable.status = status;
    local.readiness.declared_indexable.evidenceLevel = "E1";
    setTopStatus(local, status);
    assertValid(local, `local declared_indexable ${status} E1`);
    for (const environment of ["preview", "production"]) {
      const restricted = structuredClone(local);
      restricted.readiness.environment = environment;
      assertRejected(restricted, `${environment} declared_indexable ${status} E1`);
      restricted.readiness.declared_indexable.evidenceLevel = "E2";
      assertValid(restricted, `${environment} declared_indexable ${status} E2`);
    }
  }
});

test("conclusive funnel counts accept zero numerator but require finite numerator and positive denominator", () => {
  const zero = preparedEvidenceReport();
  zero.geoFunnel.crawlerAccess.status = "FAIL";
  zero.geoFunnel.crawlerAccess.numerator = 0;
  zero.geoFunnel.crawlerAccess.denominator = 100;
  setTopStatus(zero, "FAIL");
  assertValid(zero, "FAIL funnel 0/100");
  for (const numerator of [-1, null, Number.POSITIVE_INFINITY]) {
    const invalid = structuredClone(zero);
    invalid.geoFunnel.crawlerAccess.numerator = numerator;
    assertRejected(invalid, `invalid funnel numerator ${numerator}`);
  }
  for (const denominator of [0, -1, null, Number.POSITIVE_INFINITY]) {
    const invalid = structuredClone(zero);
    invalid.geoFunnel.crawlerAccess.denominator = denominator;
    assertRejected(invalid, `invalid funnel denominator ${denominator}`);
  }
});

test("top-level evidenceLevel equals the highest actual evidence record", () => {
  const observed = preparedEvidenceReport();
  setTopStatus(observed, "UNKNOWN");
  setRequiredStatus(observed, "UNKNOWN");
  observed.evidence = [
    { level: "E2", source: "test lower evidence", observedAt: evidenceTimestamp },
    { level: "E5", source: "test highest evidence", observedAt: evidenceTimestamp },
  ];
  observed.evidenceLevel = "E5";
  assertValid(observed, "highest E5 evidence");
  const understated = structuredClone(observed);
  understated.evidenceLevel = "E4";
  assertRejected(understated, "understated top evidence level");
  const empty = structuredClone(observed);
  empty.evidence = [];
  empty.evidenceLevel = "E0";
  assertValid(empty, "empty evidence is E0");
  empty.evidenceLevel = "E1";
  assertRejected(empty, "empty evidence above E0");
});

test("a cloned PASS/E1 production http claim is invalid only at its claim pointer", () => {
  const invalid = structuredClone(fixtures[1]);
  invalid.readiness.environment = "production";
  invalid.readiness.http_fetchable.status = "PASS";
  invalid.readiness.http_fetchable.source = "served production HTML and response metadata";
  invalid.readiness.http_fetchable.observedAt = evidenceTimestamp;
  const result = validationResult(validator(), invalid);
  assert.equal(result.valid, false, "cloned production PASS/E1 claim should expose its conclusive floor violation");
  assert.deepEqual([...new Set(result.errors.map((error) => error.pointer))], ["/readiness/http_fetchable"]);
});

test("evidence-report top status follows required claim and stage precedence", () => {
  const failed = preparedEvidenceReport();
  setRequiredStatus(failed, "PASS");
  failed.readiness.http_fetchable.status = "FAIL";
  for (const topStatus of ["UNKNOWN", "PASS"]) {
    const forbidden = structuredClone(failed);
    setTopStatus(forbidden, topStatus);
    assertRejected(forbidden, `required FAIL with top ${topStatus}`);
  }
  setTopStatus(failed, "FAIL");
  assertValid(failed, "required FAIL with top FAIL");

  const unknown = preparedEvidenceReport();
  setRequiredStatus(unknown, "PASS");
  unknown.readiness.http_fetchable.status = "UNKNOWN";
  setTopStatus(unknown, "PASS");
  assertRejected(unknown, "required UNKNOWN with top PASS");
  setTopStatus(unknown, "UNKNOWN");
  assertValid(unknown, "required UNKNOWN with top UNKNOWN");

  const allNa = preparedEvidenceReport();
  setRequiredStatus(allNa, "N/A");
  setTopStatus(allNa, "UNKNOWN");
  assertRejected(allNa, "all N/A with top UNKNOWN");
  setTopStatus(allNa, "N/A");
  assertValid(allNa, "all N/A with top N/A");

  const passAndNa = preparedEvidenceReport();
  setRequiredStatus(passAndNa, "N/A");
  passAndNa.readiness.declared_indexable.status = "PASS";
  passAndNa.readiness.declared_indexable.evidenceLevel = "E1";
  passAndNa.readiness.declared_indexable.source = "test PASS evidence";
  passAndNa.readiness.declared_indexable.observedAt = evidenceTimestamp;
  setTopStatus(passAndNa, "PASS");
  assertValid(passAndNa, "PASS with PASS and N/A requirements");
});

test("evidence-report status, verdict, and exit classification form the exact tuple", () => {
  for (const status of ["PASS", "FAIL", "UNKNOWN", "N/A"]) {
    const report = preparedEvidenceReport();
    setRequiredStatus(report, status);
    setTopStatus(report, status);
    assertValid(report, `${status}/${status}/${status}`);
  }
  for (const mismatch of [
    { status: "PASS", verdict: "FAIL", exitClassification: "PASS" },
    { status: "FAIL", verdict: "PASS", exitClassification: "FAIL" },
    { status: "UNKNOWN", verdict: "UNKNOWN", exitClassification: "PASS" },
    { status: "N/A", verdict: "REVERT", exitClassification: "N/A" },
    { status: "FAIL", verdict: "FAIL", exitClassification: "REVERT" },
  ]) {
    const report = preparedEvidenceReport();
    setRequiredStatus(report, mismatch.status);
    report.status = mismatch.status;
    report.verdict = mismatch.verdict;
    report.exitClassification = mismatch.exitClassification;
    assertRejected(report, `inconsistent evidence tuple ${JSON.stringify(mismatch)}`);
  }
});

test("E0 null source and observation are only valid for non-conclusive readiness and funnel claims", () => {
  const targets = [
    ["/readiness/http_fetchable", (report) => report.readiness.http_fetchable],
    ["/geoFunnel/crawlerAccess", (report) => report.geoFunnel.crawlerAccess],
  ];
  for (const [pointer, select] of targets) {
    for (const status of ["UNKNOWN", "N/A"]) {
      const allowed = structuredClone(fixtures[0]);
      const claim = select(allowed);
      claim.status = status;
      claim.evidenceLevel = "E0";
      claim.source = null;
      claim.observedAt = null;
      assertValid(allowed, `${pointer} ${status} E0 assertion`);
    }
    for (const status of ["PASS", "FAIL"]) {
      const forbidden = structuredClone(fixtures[0]);
      const claim = select(forbidden);
      claim.status = status;
      claim.evidenceLevel = "E0";
      claim.source = null;
      claim.observedAt = null;
      assertInvalid(forbidden, pointer, `${pointer} ${status} E0 assertion`);
    }
  }
});

test("scorecard exitCode enumerates only the defined process classifications", () => {
  assert.deepEqual(schema.properties.exitCode.enum, [0, 1, 2, 3]);
});

function persistedCheck(overrides = {}) {
  return {
    group: "static",
    name: "check contract",
    class: "eligibility",
    guardrail: false,
    status: "PASS",
    pass: true,
    detail: "ok",
    evidenceLevel: "E1",
    source: "test fixture",
    observedAt: "2026-08-22T00:00:00Z",
    ...overrides,
  };
}

function scorecardWithCheck(mapping, check = persistedCheck({ status: mapping.status, pass: mapping.status === "PASS" })) {
  const required = ["eligibility", "guardrail"].includes(check.class);
  const failed = required && check.status === "FAIL";
  const unknown = required && check.status === "UNKNOWN";
  return scorecardFixture({
    ...mapping,
    checks: [check],
    passed: check.status === "PASS" ? 1 : 0,
    total: 1,
    failures: failed ? [check.name] : [],
    unknowns: unknown ? [check.name] : [],
    guardrailFails: failed && check.class === "guardrail" ? [check.name] : [],
    evidenceLevel: "E1",
    evidence: [{ level: "E1", source: "test scorecard evidence", observedAt: evidenceTimestamp }],
  });
}

test("scorecard status, verdict, exit classification, and exit code mappings are internally consistent", () => {
  const validMappings = [
    { status: "PASS", verdict: "BASELINE", exitClassification: "PASS", exitCode: 0 },
    { status: "PASS", verdict: "KEEP", exitClassification: "PASS", exitCode: 0 },
    { status: "PASS", verdict: "NEUTRAL", exitClassification: "PASS", exitCode: 0 },
    { status: "FAIL", verdict: "FAIL", exitClassification: "FAIL", exitCode: 2 },
    { status: "FAIL", verdict: "REVERT", exitClassification: "REVERT", exitCode: 2 },
    { status: "UNKNOWN", verdict: "UNKNOWN", exitClassification: "UNKNOWN", exitCode: 3 },
  ];
  for (const mapping of validMappings) assertValid(scorecardWithCheck(mapping), `${mapping.status}/${mapping.verdict}`);

  const invalidMappings = [
    { status: "PASS", verdict: "UNKNOWN", exitClassification: "PASS", exitCode: 0 },
    { status: "FAIL", verdict: "KEEP", exitClassification: "PASS", exitCode: 0 },
    { status: "UNKNOWN", verdict: "UNKNOWN", exitClassification: "PASS", exitCode: 0 },
    { status: "FAIL", verdict: "FAIL", exitClassification: "FAIL", exitCode: 0 },
    { status: "PASS", verdict: "BASELINE", exitClassification: "PASS", exitCode: 1 },
  ];
  for (const mapping of invalidMappings) {
    const result = validationResult(validator(), scorecardWithCheck(mapping));
    assert.equal(result.valid, false, `inconsistent mapping should be rejected: ${JSON.stringify(mapping)}`);
  }
});

test("persisted check pass equals status PASS", () => {
  const scorecardState = { status: "PASS", verdict: "BASELINE", exitClassification: "PASS", exitCode: 0 };
  const check = persistedCheck();
  assertValid(scorecardWithCheck(scorecardState, check), "consistent check");
  assertInvalid(scorecardWithCheck(scorecardState, persistedCheck({ status: "PASS", pass: false })), "/checks/0", "PASS with pass=false");
  assertInvalid(scorecardWithCheck({ status: "FAIL", verdict: "FAIL", exitClassification: "FAIL", exitCode: 2 }, persistedCheck({ status: "FAIL", pass: true })), "/checks/0", "FAIL with pass=true");
});

test("persisted check guardrail equals class guardrail", () => {
  const scorecardState = { status: "PASS", verdict: "BASELINE", exitClassification: "PASS", exitCode: 0 };
  assertValid(scorecardWithCheck(scorecardState, persistedCheck()), "non-guardrail check");
  assertInvalid(scorecardWithCheck(scorecardState, persistedCheck({ class: "guardrail", guardrail: false })), "/checks/0", "guardrail class with guardrail=false");
  assertInvalid(scorecardWithCheck(scorecardState, persistedCheck({ class: "eligibility", guardrail: true })), "/checks/0", "eligibility class with guardrail=true");
});

test("a schema-required field that scorecard cannot supply fails before persisting artifacts", () => {
  const temp = mkdtempSync(join(process.env.TMPDIR || "/tmp", "seo-artifact-required-"));
  try {
    const scriptsCopy = join(temp, "scripts");
    const assetsCopy = join(temp, "assets");
    cpSync(scriptsDir, scriptsCopy, { recursive: true });
    cpSync(join(skillDir, "assets"), assetsCopy, { recursive: true });
    const copiedSchemaPath = join(assetsCopy, "report.schema.json");
    const copiedSchema = JSON.parse(readFileSync(copiedSchemaPath, "utf8"));
    copiedSchema.required = [...(copiedSchema.required || []), "schemaSentinel"];
    writeFileSync(copiedSchemaPath, JSON.stringify(copiedSchema));
    const configPath = join(temp, "config.json");
    const out = join(temp, "out");
    writeFileSync(configPath, JSON.stringify(staticConfig(out)));
    const result = runScorecard(configPath, join(scriptsCopy, "seo-scorecard.mjs"));
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(existsSync(join(out, "latest.json")), false);
    assert.equal(existsSync(out) && readdirSync(out).some((name) => /^scorecard-.*\.json$/.test(name)), false);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("seo-gate includes or discovers this persisted-artifact suite", () => {
  const gate = readFileSync(join(scriptsDir, "seo-gate.mjs"), "utf8");
  const discoversTests = /readdirSync\(join\(root,\s*["']tests["']\)\)[\s\S]{0,300}(?:filter|endsWith)[\s\S]{0,180}\.test\.mjs/.test(gate);
  assert.ok(/artifact-contract\.test\.mjs/.test(gate) || discoversTests, "seo-gate must include or discover artifact-contract.test.mjs");
});

test("scorecard artifacts reject derived-state contradictions rather than hiding failed or incomplete readiness", () => {
  const pass = persistedCheck({ name: "required pass" });
  const coherent = scorecardFixture({
    status: "PASS", verdict: "BASELINE", exitClassification: "PASS", exitCode: 0,
    checks: [pass], failures: [], unknowns: [], guardrailFails: [],
    passed: 1, total: 1, score: 100, requiredScore: 100, diagnosticScore: 0,
    evidenceLevel: "E1", evidence: [{ level: "E1", source: "test scorecard evidence", observedAt: evidenceTimestamp }],
  });
  assertValid(coherent, "coherent required PASS scorecard");

  const requiredFail = persistedCheck({ name: "required fail", status: "FAIL", pass: false });
  const requiredUnknown = persistedCheck({ name: "required unknown", status: "UNKNOWN", pass: false });
  const onlyDiagnostic = persistedCheck({ name: "only diagnostic", class: "diagnostic" });
  const guardrailFail = persistedCheck({ name: "guardrail fail", class: "guardrail", guardrail: true, status: "FAIL", pass: false });
  const cases = [
    ["required FAIL hidden under PASS/BASELINE/0", { ...coherent, checks: [requiredFail], passed: 0, score: 0, requiredScore: 0 }],
    ["required UNKNOWN hidden under PASS", { ...coherent, checks: [requiredUnknown], passed: 0, score: 0, requiredScore: 0 }],
    ["no required checks hidden under PASS", { ...coherent, checks: [onlyDiagnostic], requiredScore: 100 }],
    ["top evidence level differs from its maximum actual evidence", { ...coherent, evidenceLevel: "E2" }],
    ["passed total and failure collections disagree with checks", { ...coherent, passed: 0, total: 2, failures: ["ghost"], unknowns: ["ghost"], guardrailFails: ["ghost"] }],
    ["guardrail failure omitted from guardrailFails", { ...coherent, status: "FAIL", verdict: "FAIL", exitClassification: "FAIL", exitCode: 2, checks: [guardrailFail], passed: 0, score: 0, requiredScore: 0, failures: ["guardrail fail"], guardrailFails: [] }],
  ];
  const accepted = cases.filter(([, artifact]) => validationResult(validator(), artifact).valid).map(([label]) => label);
  assert.deepEqual(accepted, [], `derived scorecard contradictions accepted: ${accepted.join(", ")}`);
});

test("scorecard top evidenceLevel includes evidence-bearing checks as well as evidence records", () => {
  const live = persistedCheck({ name: "live E2 evidence", group: "live", evidenceLevel: "E2" });
  const hiddenLiveEvidence = scorecardFixture({
    status: "PASS", verdict: "BASELINE", exitClassification: "PASS", exitCode: 0,
    checks: [live], failures: [], unknowns: [], guardrailFails: [],
    passed: 1, total: 1, score: 100, requiredScore: 100, diagnosticScore: 0,
    evidenceLevel: "E1", evidence: [{ level: "E1", source: "summary evidence only", observedAt: evidenceTimestamp }],
  });
  assertInvalid(hiddenLiveEvidence, "/evidenceLevel", "top E1 must not hide an E2 live check");
});
