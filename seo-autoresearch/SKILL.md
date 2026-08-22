---
name: seo-autoresearch
summary: "Autonomous keep/revert loop that improves a site's technical SEO and indexability against a deterministic scorecard, without bleeding infra cost — no content, no publishing, no email."
description: Run an autoresearch-style loop (karpathy/autoresearch pattern) on technical SEO — pick one hypothesis from the scorecard's failing checks, make one small change, run the scorecard (live checks as Googlebot + static repo checks + cost guardrails), KEEP if the score rises with no guardrail broken, REVERT otherwise, log it, repeat under a fixed budget; never deploy per iteration, never touch content/design/UX, never email or publish. Use for "keep improving technical SEO automatically", "make sure all pages are indexable without raising Vercel costs", "run the SEO experiment loop overnight", "top-notch technical SEO", or as the body of a scheduled task after the plan exists (/seo-autoresearch [iterations] [--base preview-url]).
source: dockialabs
---

# SEO Autoresearch (technical only, keep/revert)

## When to use
A project already has its visibility plan + pipeline doc and a scorecard config (`scripts/seo/scorecard.config.json`; create one from the
sportplan example if missing). You want the technical/indexability layer driven to 100 % autonomously — payload, exposure integrity,
canonical/hreflang/robots correctness, schema validity, notify plumbing — with cost invariants as hard constraints. Not for content,
design/UX, emails or publishing; those stay human/plan-driven.

## The loop (program.md)
Runner: `R=~/.claude/skills/seo-visibility-audit/scripts/seo-scorecard.mjs`. Objective = scorecard score ↑; guardrails = never fail.
Budget: `N` iterations (default 8) or a wall-clock cap; one hypothesis, one small change, one measurement per iteration.
1. **Baseline** on a fresh branch (`seo/autoresearch-<date>`): `node $R --config scripts/seo/scorecard.config.json --md` → `.agents/runs/seo-scorecard/latest.json`.
   Copy it to `baseline.json`. Read the failing checks — that list IS the hypothesis queue, ordered: guardrail > static > live, then by how
   many pages/URLs the check touches.
2. **Hypothesize** (write it first, one line in `.agents/runs/seo-scorecard/LOG.md`): check name → the smallest change that should flip it
   (e.g. `prefetch={false}` on list links; `HubEventIndex` → market-locale URL; slim DTO to the client list; `revalidateTag('sitemap')` call
   in the cron; per-chunk `lastmod`; self-referencing canonical on a template; Event JSON-LD required field). Blast radius ≤ 3 files.
3. **Change** it. Static checks must still pass `npm run check`. **Never**: shorten a `revalidate`, add `force-dynamic`, touch robots/AI-bot
   lists, add image hosts, add high-cardinality routes, change the scorecard config to make a check pass, edit the runner.
4. **Measure**: `node $R --config … --compare .agents/runs/seo-scorecard/baseline.json --md`. Live checks run against production (cache-served,
   they measure the *deployed* tree, not yours) — so for changes that only show after deploy, rely on the static check that encodes the
   intent, and optionally `--base <preview-url>` when a preview deployment exists (previews don't reset the prod ISR cache).
5. **Decide**: verdict `KEEP` → `git commit -m "seo(autoresearch): <check> — <change>"` and promote `latest.json` to `baseline.json`;
   `REVERT`/`NEUTRAL` → `git checkout -- . && git clean -fd` for the touched files, log why. Guardrail failure = always revert, no debate.
6. **Loop** to step 2 until the queue is empty, the budget is spent, or two consecutive reverts on the same check (then leave a note and move on).
7. **Exit report**: score before → after, kept commits (one per change), reverted hypotheses with reason, the checks still failing and why
   they need a human (design/UX, data, migration, cost decision). Open one PR for the batch; **deploying is the human's call and happens in the
   sprint wave** (every prod deploy resets the ISR cache — COSTS.md). The outer validation is `/seo-visibility-loop` next week (GSC funnel,
   verdict sampler) — if the score rose but CCNI/clicks didn't move after two weeks, the scorecard is missing a check: add it with evidence.

## Done when
Budget spent or queue empty; every kept change is a separate commit with its hypothesis line and score delta; no guardrail ever failed in a
kept state; `npm run check` green; a PR exists; the exit report lists what was kept, reverted and left for humans — and nothing was deployed,
emailed or published by the loop.
