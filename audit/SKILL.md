---
name: audit
summary: "Score the whole project area by area, then keep fixing and re-testing until everything earns a 10."
description: Run an evidence-based whole-project audit-remediation loop that discovers applicable areas, scores each 0-10, implements authorized fixes, tests, independently re-audits, and repeats until every area is verified at 10/10 or a real approval or external blocker remains. Use when the user asks to audit a project thoroughly, score all areas, make it 10/10, fix everything, prepare for production or growth, or keep implementing and retesting until clean (formerly audit-remediate-to-10) (/audit).
---

# Audit and Remediate to 10

## When to use
Use for a whole project with an implementation mandate. Do not use for a read-only
review, one narrow bug, or a request that forbids changes.

## Steps
1. **Set the contract.** Read repository instructions, identify the target path, product
   goal, users, and claimed environment. Snapshot `git status` and relevant diffs; preserve
   unrelated work. Treat local code/tests/docs as authorized by this invocation. Pause before
   auth or schema changes, shared/production data writes, secrets, deploys, purchases, account
   changes, destructive operations, or external messages unless the user explicitly authorized
   that exact boundary.
2. **Create or resume the baton.** Read `references/scoring-rubric.md` completely. Reuse an
   existing audit file; otherwise run `python3 <this-skill>/scripts/init-audit.py <project-root>`.
   Keep `docs/audit/AUDIT_TO_10.md` current after every pass. Never restart a valid baton or erase
   unresolved findings.
3. **Map before scoring.** Inventory architecture, instructions, critical journeys, data stores,
   tests, CI/release paths, live surfaces, and the business goal. Select every applicable rubric
   area; justify each `N/A`. Separate repository, local-runtime, production, and external/business
   claims. Inspect connected or live reality when access exists; never infer it from code.
4. **Establish the baseline.** Run representative commands and probes, record exact evidence and
   exit codes, then score each area with the rubric anchors. The headline score is the lowest
   applicable area; an average is supplementary only. Do not raise a score merely because code
   changed—require fresh tests, browser/runtime probes, or live evidence appropriate to the claim.
5. **Build the queue.** Give each finding an ID, severity, area, proof, root cause, proposed fix,
   acceptance test, dependencies, blast radius, and approval status. Order by severity, user
   impact, dependency, and risk. Convert vague concerns into falsifiable checks before editing.
6. **Run the remediation loop.** Until the completion gate is met:
   - Select the smallest high-impact unblocked batch; add a failing test or probe when practical.
   - Implement only authorized changes and keep touched files inside the declared blast radius.
   - Run focused checks, then the broadest relevant project gate; verify browser, data, and live
     behavior when the score depends on them.
   - Read the diff, update evidence and the iteration log, close only proven findings, and rescore.
   - Add newly discovered gaps to the queue instead of narrowing the rubric or grading generously.
   - At a candidate 10, ask a different agent/model to re-audit raw artifacts when available. The
     implementer must not self-certify the final 10. Reopen the loop for every reviewer finding.
7. **Converge or escalate.** Keep working while safe, authorized progress exists; a first report or
   green test run is not completion. If the same blocker survives three evidence-backed attempts,
   record it and request the exact approval, credential, external action, or decision needed. Never
   bypass a gate, lower the target, hide an `N/A`, or invent production evidence to finish.
8. **Report the real state.** Present the per-area scorecard, headline minimum, changes, commands
   and results, reviewer verdict, remaining blockers, and the next resume point. Keep source/local
   closure distinct from deployment and production readiness.

## Done when
Every applicable area is 10/10 under the rubric, no relevant finding remains open, the full
deterministic gate passes, and an independent re-audit accepts the evidence; or progress is
genuinely blocked and the baton names the exact external action and resume point. Repository-only
10/10 with an unverified release is a partial result, not completion.
