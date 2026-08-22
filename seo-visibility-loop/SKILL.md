---
name: seo-visibility-loop
summary: "Weekly measure-and-decide loop that keeps a site's pages indexed, crawled efficiently and earning clicks — the operating cadence behind an SEO visibility plan."
description: Run the recurring indexing → crawl → rank → visitors loop for a project that already has a visibility plan/pipeline doc — pull the weekly funnel per template × locale (known → crawled → indexed → impressions → clicks), sample index verdicts, check exposure integrity (sitemap ⊆ indexable set, no links to noindex URLs, hreflang reciprocal), check notify health and cost, then decide per cohort (enrich / de-expose / 410 / retain), append the weekly report and dispatch the fixes. Use for "run the SEO loop", "weekly SEO check", "are we indexed yet", "did the enrichment get picked up", as the body of a scheduled/cron task, or after any SEO deploy (/seo-visibility-loop).
source: dockialabs
---

# SEO Visibility Loop (weekly)

## When to use
Weekly (scheduled task or `/loop 7d`), after every batched SEO deploy, or when someone asks "is it working?". Requires the project's
pipeline doc (e.g. `docs/SEO_INDEXING_PIPELINE.md`) and plan (`docs/SEO_VISIBILITY_PLAN.md`); if absent, run `/seo-visibility-audit` first.

## Steps
1. **Read the contract**: the pipeline doc's stage table + §0 baseline/targets, the cost ledger (`docs/COSTS.md` or equivalent) and CLAUDE.md
   guardrails. Note the last report's open decisions. Never change cache windows, robots, or deploy cadence from inside the loop.
2. **Funnel per template × locale — pull it yourself** with `S=~/.claude/skills/seo-visibility-audit/scripts/gsc.mjs` (service-account
   creds from env / `./.env.local`): `node $S funnel --days 28 --md` (clicks/impr/CTR/pos/pages-with-impressions per template × locale),
   `node $S performance --days 28 --dimensions date --md` (flag any day with impressions < 50 % of the 7-day median → outage/deindex check),
   `node $S top-pages --days 28 --limit 200 --csv`. BigQuery bulk export when set up. Page-indexing totals and crawl stats have no API —
   read them from the signed-in GSC tab if available, else skip and say so. Compute clicks per indexed URL and, with the cost monitor,
   clicks per 1,000 origin invocations. Compare with last week and with the plan's rung.
3. **Verdict sampler** — `node $S inspect --urls <file> --max 200 --md` on: top-20 click pages, 20 recently enriched pages, 20 new-family
   pages, 10 hubs (quota 2,000/day; stay ≤200). Check verdict, coverage, canonical_ok (Google choosing another host/URL = bug), last crawl
   age, rich-result issues. Flag any top-click page that flipped to noindex/redirect (past-event rule, edition roll-over) and any hub not
   crawled in > 60 days.
4. **Exposure integrity** — parse the live sitemaps; assert every URL is indexable by the publish gate; fetch ~200 hub pages as Googlebot
   and assert no link targets a noindex URL; hreflang clusters reciprocal; sitemap `lastmod` moved only where content changed.
   Mismatches = bugs → ticket them with file refs.
5. **Notify + cost health** — last runs of ingest/enrichment/edition-link: did they revalidate only published locales (≤ the daily cap)? IndexNow
   volume? Cost monitor: ISR write units/day, invocations/day, $/day vs ceiling; any deploy in the window? If cost moved, append COSTS.md.
6. **Decide per cohort** (write it down): eligible + CCNI + demand → enrich & republish (bounded revalidation); thin + no demand → de-expose
   (tier B/C); junk/true duplicate → 410/301; past + verified results → retain indexable; notified but uncrawled > 14 d → fix exposure first.
   Also: top pages at risk this week (events ending soon without next-edition link) → link/redirect before the grace window closes.
   **Families** (new tool / hub type / locale / public-object batch): scale only if crawled+indexed reliably, impressions for the intended
   queries, movement toward pages 1–2, real activation, no cannibalisation, no Google-chosen canonical — else hold or de-expose.
   Diagnose misses by layer: not indexed → quality/duplication; indexed no impressions → demand mismatch; impressions no clicks → snippet;
   clicks no action → page/product; no return → retention. Never answer a miss with "more pages".
7. **Report + dispatch** — append `## YYYY-WW` to the project's SEO log (PROGRESS.md stage or `docs/SEO_WEEKLY.md`): funnel table, deltas,
   verdict flips, integrity failures, decisions, cost line. Dispatch concrete fixes as briefs to the right lane (UI vs data executors per the
   project's rules); never leave a decision as prose only. If nothing changed: say so in two lines and stop.

## Done when
The weekly report exists with numbers (funnel per template, verdict flips, integrity failures = N, cost line), every cohort has a written
decision, at-risk top pages are handled before their grace window, and fixes are dispatched as briefs — with no cache-window, robots, or
deploy-cadence change made by the loop itself.
