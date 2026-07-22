# Scoring rubric

Use this rubric to prevent optimistic or self-referential 10/10 scores. Adapt the checks to the
project, but do not weaken the anchors or omit an applicable area to improve the result.

## Score mechanics

- Score every applicable area with an integer from 0 through 10. Mark an area `N/A` only with
  evidence that it cannot affect the declared goal, users, or operating environment.
- Assess four dimensions in each area: coverage, correctness, resilience, and evidence. The area
  score is the lowest dimension, not their average.
- The headline score is the lowest applicable area score. Also report separate minimums for
  repository/local and production/external evidence when both are in scope. An arithmetic mean may
  be shown only as secondary context.
- A change is not evidence. Evidence is a reproducible command, test, trace, browser observation,
  database/security inspection, production probe, or authoritative external result.

## Anchors

| Score | Meaning |
|---:|---|
| 0 | Absent, unusable, catastrophic, or no meaningful control exists. |
| 1-2 | Fundamentally broken; critical users, data, or security are at immediate risk. |
| 3-4 | Major failures or missing foundations make the area unfit for its declared goal. |
| 5-6 | Core path works, but material gaps, weak edge handling, or thin verification remain. |
| 7 | Generally sound with at least one important gap or incomplete evidence layer. |
| 8 | Production-capable for normal use, with bounded material improvements still open. |
| 9 | Excellent and well verified; only a minor but real goal-relevant gap remains. |
| 10 | Complete for the declared scope: all required positive and negative checks pass, no known goal-relevant gap remains, and the strongest applicable evidence layer is fresh. |

Severity constrains scoring: an open P0 caps its area at 2, P1 at 5, P2 at 8, and P3 at 9.
A failed required build/check, exploitable authorization path, data-loss risk, or broken critical
journey is at least P1. Missing an evidence layer required by the claim caps the area at 8.

## Evidence layers

| Layer | Evidence |
|---|---|
| E1 | Static source/configuration inspection. |
| E2 | Deterministic lint, types, unit/integration tests, builds, scans, or query checks. |
| E3 | Local runtime, browser, device, load, migration rehearsal, or failure-path observation. |
| E4 | Production, hosted database, deployed route, monitoring, analytics, search, or other external reality. |

Use the strongest layer the claim requires. E1-E3 can certify repository/local quality but cannot
certify a deployed production claim. Lack of credentials or live access is a blocker, not proof.

## Default areas

Start with all areas below. Split an area when its risks differ materially; combine only when no
check or finding would be lost.

| Area | Examine at minimum |
|---|---|
| Product and requirements | User/problem fit, feature and route inventory, requirements traceability, critical journey completeness, empty/error states. |
| Functional correctness and data integrity | Happy/edge/negative paths, validation, state transitions, concurrency, idempotency, migrations, constraints, recovery from partial writes. |
| UX and accessibility | Information architecture, responsiveness, keyboard/focus, semantics, contrast, forms/errors, assistive technology, perceived quality. |
| Security, privacy, and abuse | Authentication, authorization, tenant/RLS boundaries, input/output handling, secrets, dependencies, threat/abuse cases, consent and retention. |
| Architecture and maintainability | Boundaries, coupling, duplication, types/contracts, complexity, dependency health, extensibility, dead paths, ownership clarity. |
| Tests and quality gates | Risk-shaped unit/integration/e2e coverage, regression and negative tests, deterministic CI, build/type/lint gates, flaky-test handling. |
| Performance and scalability | User-centric timings, bundles/assets, rendering, caching, queries/indexes, hot paths, load/concurrency, budgets and representative data. |
| Reliability and resilience | Timeouts, retries/backoff, error isolation, fallbacks, queues/jobs, offline/degraded behavior, backups, restore and rollback rehearsal. |
| Observability and operations | Structured/redacted logs, metrics, traces, alerts, dashboards, health checks, runbooks, ownership, incident and support workflows. |
| Delivery and configuration | Reproducible setup/build, environment validation, CI/CD, migration order, preview/staging parity, release controls, rollback, deployed health. |
| SEO and discoverability | For public surfaces: crawl/index controls, metadata/canonicals, sitemaps, structured data, content quality, internal links, social previews. |
| Localization and internationalization | For multi-locale goals: native coverage, fallbacks, locale routing, hreflang, RTL, formatting, translation leakage and parity. |
| Analytics, growth, and monetization | For business/growth goals: event correctness, consent, funnels, attribution, KPIs, experiments, acquisition loops, revenue/ad/payment integrity. |
| Documentation and developer experience | Accurate onboarding, architecture/decision docs, commands, fixtures, local parity, troubleshooting, dependency and maintenance workflows. |

## Completion gate

A certified 10/10 requires all of the following:

1. Every applicable area is 10 and every `N/A` is justified.
2. No open finding affects the declared goal; the remediation queue is empty.
3. Focused checks and the full deterministic project gate pass with current exit codes.
4. Runtime/browser/data/production checks cover every layer claimed in the verdict.
5. A reviewer that did not implement the changes independently checks the rubric, raw evidence,
   current diff, and high-risk paths, then returns no actionable finding.

If independent review is unavailable, report the candidate scores as provisional. If production or
another external layer is approval-gated, report repository/local closure separately and leave the
overall loop blocked at that gate.
