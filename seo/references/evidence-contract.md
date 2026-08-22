# SEO/GEO evidence contract

Verified 2026-08-22. Source hierarchy: official platform documentation and first-party reports;
then reproducible local/runtime observations; then search-platform observations; then AI-answer
observations; then business analytics. A claim must not be promoted above the evidence that proves it.

## Evidence levels

- **E0 — assertion/no evidence:** an unverified claim, assumption, or requested check. It proves
  nothing and must not be promoted.
- **E1 — repository/static intent:** source, configuration, metadata, schema, robots declarations,
  tests, or generated artifacts. It proves intended implementation only.
- **E2 — actual HTTP/runtime response:** the named URL's actual HTTP response and headers, robots, sitemap, and raw served HTML. It does not prove browser execution or engine observation.
- **E3 — browser-executed runtime:** browser-executed rendered DOM and runtime behavior, captured for
  the named URL and date. It does not prove search-engine indexing or visibility.
- **E4 — engine-observed:** Google/Bing inspection, indexing, sitemap, or index reports for a named
  property and cohort. API gaps, truncation, and absent publisher consoles remain UNKNOWN.
- **E5 — observed outcomes:** impressions, clicks, citations, referrals, conversions, and retention
  over a named window with denominators and cohorts. Correlation is not causation.
- **E6 — preregistered comparable experiment:** a predeclared experiment/control group with matching
  cohorts, exposure, timing, guardrails, and a reproducible delta. It supports one bounded decision,
  not a universal ranking law.

## Required readiness record

For each URL/template/cohort record: owner, environment, deployment, URL, property, locale, timestamp,
observedAt, source, evidence, denominator, cohort, declared_indexable, http_fetchable,
rendered_content_available, canonical_consistent, engine_indexed, search_visible, ai_cited, referred,
and converted. Every field has status PASS, FAIL, UNKNOWN, or N/A and an evidence level/source.

Technical readiness is necessary but insufficient. Do not promote E0/E1 checks to E2/E3 runtime
claims, E2/E3 observations to E4 engine claims, E4 observations to E5 outcomes, or E5 correlation
to E6 causality. Empty, missing, stale, or truncated external data is UNKNOWN, never zero or proof
of success. A source-fetch with a Googlebot UA is not rendered or engine-observed evidence.

## Conclusive claim floors

PASS and FAIL are conclusive and require at least the evidence shown below. UNKNOWN and N/A may use
E0 when nothing was observed; every E1-E6 record requires a source and observation time.

- `declared_indexable` — E1 for a local source declaration; E2 for preview or production.
- `http_fetchable` — E2.
- `rendered_content_available` — E3.
- `canonical_consistent` — the scope must be explicit: `served` E2, `rendered` E3, or
  `engine-selected` E4.
- `engine_indexed` — E4.
- `search_visible` — E5.
- `ai_cited` — E5.
- `referred` — E5.
- `converted` — E5.

The GEO funnel has the same no-promotion rule: `crawlerAccess` E2, `eligibilityIndexing` E4,
`impressionsVisibility` E5, `citation` E5, `referral` E5, and `conversionRetention` E5. A conclusive
funnel stage requires a finite numerator greater than or equal to zero and a finite denominator
greater than zero. Thus a measured zero can be a valid FAIL; missing measurement is UNKNOWN.

## Status and process semantics

Required claims and funnel stages use precedence: FAIL outranks UNKNOWN; UNKNOWN outranks a mixture
of PASS and N/A; all N/A produces N/A; otherwise the report is PASS. An evidence report's `status`,
`verdict`, and `exitClassification` must be that same derived value. Its top evidence level must be
the highest level present in its evidence records, never an aspirational label.

Command-line exits are stable automation interfaces:

- exit code 0 — PASS (including a valid BASELINE, KEEP, or NEUTRAL scorecard verdict).
- exit code 1 — invalid input, invalid schema/configuration, or internal/launch failure.
- exit code 2 — required FAIL or REVERT.
- exit code 3 — required UNKNOWN or incomplete external observation.

No command may turn absence, truncation, an unobserved external system, or a lower evidence level
into PASS merely to produce exit code 0.
