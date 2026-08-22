// Small deterministic JSON Schema subset validator for persisted local artifacts.
export function validateArtifact(value, schema) {
  const errors = [];
  const pointer = (path, part) => `${path}/${String(part).replace(/~/g, '~0').replace(/\//g, '~1')}`;
  const resolve = (ref) => ref === '#' ? schema : ref.startsWith('#/') ? ref.slice(2).split('/').reduce((node, key) => node?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], schema) : undefined;
  const typeOk = (item, type) => ({ object: item !== null && typeof item === 'object' && !Array.isArray(item), array: Array.isArray(item), string: typeof item === 'string', number: typeof item === 'number' && Number.isFinite(item), integer: Number.isInteger(item), boolean: typeof item === 'boolean', null: item === null })[type];
  const date = (text) => {
    if (!/^\d{4}-\d\d-\d\d$/.test(text)) return false;
    const [year, month, day] = text.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  };
  const dateTime = (text) => {
    const match = text.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d+)?(Z|([+-])(\d\d):(\d\d))$/);
    if (!match) return false;
    const [, year, month, day, hour, minute, second, zone, , offsetHour, offsetMinute] = match;
    if (!date(`${year}-${month}-${day}`) || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return false;
    if (zone !== 'Z' && (Number(offsetHour) > 23 || Number(offsetMinute) > 59)) return false;
    return !Number.isNaN(Date.parse(text));
  };
  const walk = (item, rule, path) => {
    if (!rule) return;
    if (rule.$ref) return walk(item, resolve(rule.$ref), path);
    if (rule.allOf) rule.allOf.forEach((branch) => walk(item, branch, path));
    if (rule.oneOf) {
      const outcomes = rule.oneOf.map((branch) => {
        const before = errors.length;
        walk(item, branch, path);
        const branchErrors = errors.splice(before);
        return branchErrors;
      });
      const matches = outcomes.filter((branchErrors) => branchErrors.length === 0);
      if (matches.length !== 1) {
        errors.push({ pointer: path || '/', message: 'must match exactly one schema branch' });
        // A failed union is more actionable when it retains the smallest,
        // deterministic branch error set (for example a missing required key).
        if (matches.length === 0) {
          const best = outcomes.slice().sort((a, b) => a.length - b.length || JSON.stringify(a).localeCompare(JSON.stringify(b)))[0] || [];
          errors.push(...best);
        }
      }
    }
    if (rule.const !== undefined && item !== rule.const) errors.push({ pointer: path || '/', message: `must equal ${JSON.stringify(rule.const)}` });
    if (rule.enum && !rule.enum.includes(item)) errors.push({ pointer: path || '/', message: `must be one of ${rule.enum.join(', ')}` });
    if (rule.type) { const kinds = Array.isArray(rule.type) ? rule.type : [rule.type]; if (!kinds.some((kind) => typeOk(item, kind))) { errors.push({ pointer: path || '/', message: `must be ${kinds.join(' or ')}` }); return; } }
    if (typeof item === 'string') { if (rule.minLength != null && item.length < rule.minLength) errors.push({ pointer: path || '/', message: `must have length >= ${rule.minLength}` }); if (rule.pattern && !(new RegExp(rule.pattern).test(item))) errors.push({ pointer: path || '/', message: 'must match pattern' }); if (rule.format === 'date' && !date(item)) errors.push({ pointer: path || '/', message: 'must be ISO date' }); if (rule.format === 'date-time' && !dateTime(item)) errors.push({ pointer: path || '/', message: 'must be RFC3339 date-time' }); if (rule.format === 'uri') { try { new URL(item); } catch { errors.push({ pointer: path || '/', message: 'must be URI' }); } } }
    if (Array.isArray(item)) { if (rule.minItems != null && item.length < rule.minItems) errors.push({ pointer: path || '/', message: `must have at least ${rule.minItems} item(s)` }); if (rule.items) item.forEach((entry, index) => walk(entry, rule.items, pointer(path, index))); }
    if (typeOk(item, 'object')) { for (const key of rule.required || []) if (!Object.hasOwn(item, key)) errors.push({ pointer: pointer(path, key), message: 'is required' }); for (const [key, child] of Object.entries(rule.properties || {})) if (Object.hasOwn(item, key)) walk(item[key], child, pointer(path, key)); if (rule.additionalProperties === false) for (const key of Object.keys(item)) if (!Object.hasOwn(rule.properties || {}, key)) errors.push({ pointer: pointer(path, key), message: 'additional property is not allowed' }); }
  };
  walk(value, schema, '');
  if (value?.artifactKind === 'scorecard' && Array.isArray(value.checks)) {
    value.checks.forEach((check, index) => {
      if (!check || typeof check !== 'object') return;
      const path = `/checks/${index}`;
      if (typeof check.pass === 'boolean' && check.pass !== (check.status === 'PASS')) errors.push({ pointer: path, message: 'pass must equal status PASS' });
      if (typeof check.guardrail === 'boolean' && check.guardrail !== (check.class === 'guardrail')) errors.push({ pointer: path, message: 'guardrail must equal class guardrail' });
    });
    const required = value.checks.filter((check) => check && ['eligibility', 'guardrail'].includes(check.class));
    const failures = required.filter((check) => check.status === 'FAIL');
    const unknowns = required.filter((check) => check.status === 'UNKNOWN');
    const expectedStatus = failures.length ? 'FAIL' : !required.length || unknowns.length ? 'UNKNOWN' : 'PASS';
    const equalStrings = (actual, expected) => Array.isArray(actual) && actual.length === expected.length && actual.every((entry, index) => entry === expected[index]);
    const expectedFailures = failures.map((check) => check.name);
    const expectedUnknowns = required.length ? unknowns.map((check) => check.name) : ['no required checks produced'];
    const expectedGuardrailFails = failures.filter((check) => check.class === 'guardrail').map((check) => check.name);
    const expectedPassed = value.checks.filter((check) => check?.status === 'PASS').length;
    const evidenceRank = (level) => /^E[0-6]$/.test(level || '') ? Number(level.slice(1)) : -1;
    const expectedEvidenceRank = Math.max(0,
      ...(Array.isArray(value.evidence) ? value.evidence.map((record) => evidenceRank(record?.level)) : []),
      ...value.checks.map((check) => evidenceRank(check?.evidenceLevel)),
    );
    const expectedEvidenceLevel = `E${expectedEvidenceRank}`;

    if (value.status !== expectedStatus) errors.push({ pointer: '/status', message: `must be ${expectedStatus} from required check outcomes` });
    if (value.total !== value.checks.length) errors.push({ pointer: '/total', message: 'must equal the number of checks' });
    if (value.passed !== expectedPassed) errors.push({ pointer: '/passed', message: 'must equal the number of PASS checks' });
    if (!equalStrings(value.failures, expectedFailures)) errors.push({ pointer: '/failures', message: 'must equal required FAIL check names in check order' });
    if (!equalStrings(value.unknowns, expectedUnknowns)) errors.push({ pointer: '/unknowns', message: 'must equal required UNKNOWN check names in check order' });
    if (!equalStrings(value.guardrailFails, expectedGuardrailFails)) errors.push({ pointer: '/guardrailFails', message: 'must equal failed guardrail check names in check order' });
    if (value.evidenceLevel !== expectedEvidenceLevel) errors.push({ pointer: '/evidenceLevel', message: 'must equal the highest evidence or check evidence level' });

    if (expectedStatus === 'PASS') {
      if (!['BASELINE', 'KEEP', 'NEUTRAL'].includes(value.verdict)) errors.push({ pointer: '/verdict', message: 'PASS requires BASELINE, KEEP, or NEUTRAL verdict' });
      if (value.exitClassification !== 'PASS') errors.push({ pointer: '/exitClassification', message: 'PASS requires PASS exit classification' });
      if (value.exitCode !== 0) errors.push({ pointer: '/exitCode', message: 'PASS requires exit code 0' });
    } else if (expectedStatus === 'FAIL') {
      if (!['FAIL', 'REVERT'].includes(value.verdict)) errors.push({ pointer: '/verdict', message: 'FAIL requires FAIL or REVERT verdict' });
      const expectedExit = value.verdict === 'REVERT' ? 'REVERT' : 'FAIL';
      if (value.exitClassification !== expectedExit) errors.push({ pointer: '/exitClassification', message: `FAIL requires ${expectedExit} exit classification` });
      if (value.exitCode !== 2) errors.push({ pointer: '/exitCode', message: 'FAIL requires exit code 2' });
    } else {
      if (value.verdict !== 'UNKNOWN') errors.push({ pointer: '/verdict', message: 'UNKNOWN requires UNKNOWN verdict' });
      if (value.exitClassification !== 'UNKNOWN') errors.push({ pointer: '/exitClassification', message: 'UNKNOWN requires UNKNOWN exit classification' });
      if (value.exitCode !== 3) errors.push({ pointer: '/exitCode', message: 'UNKNOWN requires exit code 3' });
    }
  }
  if (value?.artifactKind === 'evidence-report') {
    const rank = (level) => /^E[0-6]$/.test(level || '') ? Number(level.slice(1)) : -1;
    const readinessFloors = { declared_indexable: 1, http_fetchable: 2, rendered_content_available: 3, canonical_consistent: 2, engine_indexed: 4, search_visible: 5, ai_cited: 5, referred: 5, converted: 5 };
    const funnelFloors = { crawlerAccess: 2, eligibilityIndexing: 4, impressionsVisibility: 5, citation: 5, referral: 5, conversionRetention: 5 };
    const conclusive = (claim) => ['PASS', 'FAIL'].includes(claim?.status);
    for (const [field, floor] of Object.entries(readinessFloors)) {
      const claim = value.readiness?.[field]; const path = `/readiness/${field}`;
      if (!conclusive(claim)) continue;
      let expected = floor;
      if (field === 'declared_indexable' && ['preview', 'production'].includes(value.readiness?.environment)) expected = 2;
      if (field === 'canonical_consistent') {
        const scope = claim?.value?.scope;
        const scopedFloor = { served: 2, rendered: 3, 'engine-selected': 4 }[scope];
        if (!scopedFloor) { errors.push({ pointer: path, message: 'conclusive canonical claim requires value.scope' }); continue; }
        expected = scopedFloor;
      }
      if (rank(claim.evidenceLevel) < expected) errors.push({ pointer: path, message: `conclusive claim requires E${expected} evidence or stronger` });
    }
    for (const [field, floor] of Object.entries(funnelFloors)) {
      const stage = value.geoFunnel?.[field]; const path = `/geoFunnel/${field}`;
      if (!conclusive(stage)) continue;
      if (rank(stage.evidenceLevel) < floor) errors.push({ pointer: path, message: `conclusive funnel stage requires E${floor} evidence or stronger` });
      if (!(typeof stage.numerator === 'number' && Number.isFinite(stage.numerator) && stage.numerator >= 0)) errors.push({ pointer: path, message: 'conclusive funnel stage requires a finite non-negative numerator' });
      if (!(typeof stage.denominator === 'number' && Number.isFinite(stage.denominator) && stage.denominator > 0)) errors.push({ pointer: path, message: 'conclusive funnel stage requires a finite positive denominator' });
    }
    const evidenceLevels = Array.isArray(value.evidence) ? value.evidence.map((record) => rank(record?.level)) : [];
    const highest = evidenceLevels.length ? Math.max(...evidenceLevels) : 0;
    if (rank(value.evidenceLevel) !== highest) errors.push({ pointer: '/evidenceLevel', message: 'must equal the highest evidence record level' });
    if (['PASS', 'FAIL'].includes(value.status) && highest === 0) errors.push({ pointer: '/evidenceLevel', message: 'conclusive top-level status requires evidence above E0' });
    const required = [...Object.values(readinessFloors).map((_, index) => value.readiness?.[Object.keys(readinessFloors)[index]]), ...Object.values(funnelFloors).map((_, index) => value.geoFunnel?.[Object.keys(funnelFloors)[index]])];
    const statuses = required.map((claim) => claim?.status);
    const expectedTop = statuses.includes('FAIL') ? 'FAIL' : statuses.includes('UNKNOWN') ? 'UNKNOWN' : statuses.every((status) => status === 'N/A') ? 'N/A' : 'PASS';
    if (value.status !== expectedTop || value.verdict !== expectedTop) errors.push({ pointer: '/', message: `top status and verdict must be ${expectedTop}` });
    if (value.exitClassification !== value.status) errors.push({ pointer: '/exitClassification', message: 'must equal evidence-report status' });
  }
  errors.sort((a, b) => a.pointer.localeCompare(b.pointer) || a.message.localeCompare(b.message));
  return { valid: errors.length === 0, errors };
}
