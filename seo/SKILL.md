---
name: seo
summary: "Say seo and it takes organic search from wherever it is to the top — audits what Google really sees, plans it, fixes the technical layer, and keeps measuring."
description: Drive a project's organic search growth end-to-end, autonomously. Auto-invoke whenever the user mentions SEO, organic traffic, visitors, rankings, Google, Search Console, indexing or "crawled – currently not indexed" — including a bare "seo" — and whenever they ask to grow/boost/rise visitors, get pages indexed, check why traffic is flat, verify an SEO consultant's claims, or run a weekly/scheduled SEO check. Detects its own starting point and runs the whole process without asking which step to take: pulls Search Console itself, measures pages as Googlebot, writes/updates the visibility plan, runs keep/revert experiments against a technical scorecard with cost guardrails, then reports what moved and what needs a human.
source: dockialabs
---

# SEO — say "seo", the whole process runs

`S=~/.claude/skills/seo/scripts` — `gsc.mjs` (Search Console CLI) · `fetch-as-googlebot.sh` + `measure-page.mjs` (what the crawler gets) ·
`seo-scorecard.mjs` + `check-revalidate-vs-main.sh` (technical scorecard & cost guard) · `../assets/scorecard.config.example.json` (config template).
Auth: `GSC_CLIENT_EMAIL`/`GSC_PRIVATE_KEY`/`GSC_SITE_URL` (or `GOOGLE_APPLICATION_CREDENTIALS`) from env or `./.env.local`; the service account must
be a user on the property. If `node $S/gsc.mjs sites` doesn't list it, say so once and continue with the signed-in Search Console tab.

## Autopilot — never ask which step, detect and run
Read the project's cost/infra rules (CLAUDE.md, cost ledger) first; they bound everything below. Then pick up where the project actually is and
**chain phases in one go**, reporting at the end — not between steps:
- **No plan doc** (`docs/SEO_VISIBILITY_PLAN.md` or equivalent) → **P1 audit** → **P3 improve** → report.
- **Plan exists, scorecard failing** → **P3 improve** → **P2 measure** → report.
- **Plan exists, scorecard clean, last measurement > 6 days old** → **P2 measure** → decisions → dispatch → report.
- **Explicit ask** ("audit", "weekly check", "just fix technical") → that phase only.
Anything that needs a human (design/UX, content, a migration, a cost or product decision) is collected into a "needs you" list at the end — keep
going with everything else. Read-only work never needs permission; deploys, publishing and emails are never done by this skill.

## P1 — Audit & plan
1. **Baseline from Search Console, never from opinion**: `node $S/gsc.mjs sites` · `performance --days 90 --dimensions date --md` (trend, anomaly
   days) · `performance --days 90 --dimensions query --limit 50 --md` · `top-pages --days 90 --limit 1000 --csv` (grandfathering list) ·
   `funnel --days 28 --md` (clicks/impressions/CTR/position/pages per template × locale) · `sitemaps --md` · `inspect --urls <top-50 + 20 random
   indexable + 10 hubs> --md`. **No API** for Page-indexing totals, Crawl stats, CWV, Enhancements → read them from the signed-in Chrome tab (close
   it after) or estimate from the inspect sample and say so. The #1 click page is often already noindex or redirected — check it explicitly.
2. **Measure templates as Googlebot**: `bash $S/fetch-as-googlebot.sh https://site out/ "" hub-path item-path` then `node $S/measure-page.mjs
   out/<f>.html`. Name the mechanism: "70 % framework payload, 1.5 % text" is payload/cost; "60 unique words/page" is content.
3. **Exposure vs reality**: sitemap URLs by type/locale vs URLs Google knows. A 10×+ gap = internal links or hreflang exposing variants the sitemap
   never meant to publish. **Data completeness**: read-only counts of the fields that make each page unique.
4. **Answer every claim** made to the user (text/HTML ratio, "not semantic", speed) with verdict + real mechanism + evidence. Ratio and minification
   are not ranking factors; thin/duplicated content and scaled variants are what "crawled – currently not indexed" means.
5. **Traffic math before promises**: target ÷ blended CTR (2–4 %) = impressions needed vs today; the page systems that could carry it (action/tool
   pages, entity pages, hubs, guides) with units × avg visits; a rung ladder, each rung measured before the next. Score with
   `demand × click-necessity × repeatability × unique value × distribution × retention ÷ competition`; say plainly if SEO can't carry the target.
6. **Write and publish the plan**: north star, baseline → targets, current practitioner research with sources, competitor benchmark, workstreams with
   owner lanes and cost notes, sequencing, "what not to do". Never propose shorter cache windows, per-commit deploys, or new high-cardinality routes.

## P2 — Measure & decide (weekly cadence)
7. **Funnel + anomalies**: `funnel --days 28`, `performance --days 28 --dimensions date` (flag any day < 50 % of the 7-day median), `top-pages`.
   Clicks per indexed URL, and with the cost monitor clicks per 1,000 origin invocations. Compare to last week and to the plan's rung.
8. **Verdicts**: `inspect --urls <top-20 clicks + 20 enriched + 20 new-family + 10 hubs> --max 200` — verdict, coverage, canonical_ok (Google choosing
   another host/URL = bug), crawl age, rich-result issues. Flag pages that flipped to noindex/redirect and hubs uncrawled > 60 days.
9. **Integrity + health**: sitemap ⊆ indexable set, no links to noindex URLs, hreflang reciprocal, `lastmod` moving only on real change; notify
   plumbing batched; cost/day vs ceiling. Mismatches are bugs — ticket them with file refs.
10. **Decide per cohort, in writing**: indexable + not-indexed + demand → enrich & republish (bounded revalidation) · thin + no demand → de-expose ·
    junk/duplicate → 410/301 · past + real results → retain · notified but uncrawled > 14 d → fix exposure first. **New families** scale only on:
    crawled+indexed reliably, impressions for the intended queries, movement toward pages 1–2, real activation, no cannibalisation, no Google-chosen
    canonical. Diagnose misses by layer: not indexed → quality/duplication; indexed no impressions → demand; impressions no clicks → snippet; clicks
    no action → page/product; no return → retention. **Never answer a miss with "more pages."** Append the weekly report; dispatch fixes as briefs.

## P3 — Improve the technical layer (keep/revert)
11. **Config**: use the project's `scorecard.config.json` if present; otherwise bootstrap from `../assets/scorecard.config.example.json` — set `base`,
    one real URL per template, thresholds near today's numbers, and the project's own cost/robots invariants as `guardrail: true`. If the repo ignores
    the path, keep it anywhere and pass `--config`.
12. **Baseline** on a fresh branch: `node $S/seo-scorecard.mjs --config <cfg> --md`; save `latest.json` as `baseline.json`. Failing checks **are** the
    hypothesis queue: guardrail > static > live, then by URLs touched.
13. **One hypothesis → one small change** (≤3 files), logged first: e.g. disable list-link prefetch, link the canonical locale from hubs, slim the
    client payload, wire the cache-tag/IndexNow call, per-chunk `lastmod`, self-referencing canonical, a missing required schema field.
14. **Measure** `--compare baseline.json --md`. Live checks read the *deployed* site, so for deploy-only effects trust the static check that encodes
    the intent, or point `--base` at a preview deployment. **Decide**: KEEP → one commit per hypothesis with its delta, promote the new baseline;
    REVERT/NEUTRAL → restore the files and log why. **Guardrail failure = always revert.** Stop after two consecutive reverts on the same check.
15. **Exit**: score before → after, kept commits, reverted hypotheses with reasons, what's left for humans; open one PR. **Never** deploy per
    iteration, shorten a cache window, add `force-dynamic`, touch robots/AI-bot lists, add image hosts or high-cardinality routes, edit the
    scorecard/runner to make a check pass, publish content, or send email.

## Done when
The phase chain the autopilot picked has run to completion and the user has one report: what was measured (numbers, not adjectives), what changed
(commits/PR, each with its score delta), what was decided per cohort, and the "needs you" list — with no guardrail failing in a kept state, the
project's own check gate green, and nothing deployed, published or emailed.
