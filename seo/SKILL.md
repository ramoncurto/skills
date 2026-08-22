---
name: seo
summary: "Grow organic search traffic on evidence: audit what Google actually sees, plan it, then keep improving and re-measuring until the pages are indexed and earning."
description: Own a project's organic search growth end-to-end — pull Search Console yourself (performance, verdicts, sitemaps, URL inspection), fetch pages as Googlebot and measure what the crawler really gets, write and maintain the visibility plan, run the weekly funnel/decide loop, and drive a keep/revert experiment loop against a deterministic technical scorecard with cost guardrails. Use for boost visitors / organic traffic, SEO audit, "crawled – currently not indexed", why aren't we indexed, verify a consultant's SEO claims, weekly SEO check, "are we indexed yet", make sure all pages are indexable without raising infra cost, top-notch technical SEO, run the SEO loop, or as the body of a scheduled SEO task (/seo [audit|loop|auto] [site-url|iterations]).
source: dockialabs
---

# SEO — audit, plan, loop, improve

`S=~/.claude/skills/seo/scripts` · `gsc.mjs` (Search Console CLI) · `fetch-as-googlebot.sh` + `measure-page.mjs` (what the crawler gets) ·
`seo-scorecard.mjs` (deterministic technical scorecard). Auth: service account `GSC_CLIENT_EMAIL`/`GSC_PRIVATE_KEY`/`GSC_SITE_URL` (or
`GOOGLE_APPLICATION_CREDENTIALS`) from env or `./.env.local`; the SA must be a user on the property — if `node $S/gsc.mjs sites` doesn't list it,
say so and use the signed-in GSC tab meanwhile. Read the project's cost/infra rules (CLAUDE.md, cost ledger) **before** proposing anything.

## Mode A — Audit & plan (first run per project, re-run quarterly)
1. **Baseline from Search Console, never from opinion.** `node $S/gsc.mjs sites` · `performance --days 90 --dimensions date --md` (trend +
   anomaly days) · `performance --days 90 --dimensions query --limit 50 --md` · `top-pages --days 90 --limit 1000 --csv` (grandfathering list) ·
   `funnel --days 28 --md` (clicks/impressions/CTR/position/pages per template × locale) · `sitemaps --md` · `inspect --urls <top-50 + 20 random
   indexable + 10 hubs> --md`. **No API** for Page-indexing totals, Crawl stats, CWV, Enhancements → read those from the signed-in Chrome tab
   (close it after) or estimate from the inspect sample and say so. The #1 click page is often already noindex/redirected — check it.
2. **Measure templates as Googlebot**: `bash $S/fetch-as-googlebot.sh https://site out/ "" es/ es/hub es/item-slug` then `node $S/measure-page.mjs
   out/<f>.html` — bytes, script/RSC share, visible words, headings, landmarks, JSON-LD validity, hreflang. Name the mechanism: "70 % framework
   payload, 1.5 % text" is a payload/cost problem; "60 unique words/page" is a content problem.
3. **Exposure vs reality**: parse the sitemap index → URLs by type/locale; compare with URLs Google knows. A 10×+ gap means internal links or
   hreflang expose variants the sitemap never meant to publish.
4. **Data completeness**: read-only counts of the fields that make pages unique; sample copy for template-ness.
5. **Check every claim** made to the user (text/HTML ratio, semantics, speed): verdict + real mechanism + evidence. Ratio and minification are not
   ranking factors; thin/duplicated content and scaled variants are what "crawled – currently not indexed" means.
6. **Traffic math before promises**: target ÷ blended CTR (2–4 %) = impressions needed vs today; list the page systems that could carry it
   (action/tool pages, entity pages, hubs, guides) with units × avg visits, and a rung ladder each measured before the next. Score with
   `demand × click-necessity × repeatability × unique value × distribution × retention ÷ competition`; say plainly if SEO can't carry the target.
7. **Write + publish the plan** (`docs/SEO_VISIBILITY_PLAN.md`): north star, baseline → targets, current practitioner research with sources,
   competitor benchmark, workstreams with owner lanes and cost notes, sprint sequencing, "what not to do". Never propose shorter cache windows,
   per-commit deploys, or new high-cardinality routes without the project's cost rule attached.

## Mode B — Weekly loop (measure & decide)
8. **Funnel + anomalies**: `funnel --days 28`, `performance --days 28 --dimensions date` (flag any day < 50 % of the 7-day median), `top-pages`.
   Compute clicks per indexed URL and, with the cost monitor, clicks per 1,000 origin invocations. Compare with last week and the plan's rung.
9. **Verdicts**: `inspect --urls <top-20 clicks + 20 enriched + 20 new-family + 10 hubs> --max 200` — verdict, coverage, canonical_ok (Google
   choosing another host/URL = bug), crawl age, rich-result issues. Flag pages that flipped to noindex/redirect and hubs uncrawled > 60 days.
10. **Integrity + health**: sitemap ⊆ indexable set, no links to noindex URLs, hreflang reciprocal, `lastmod` moved only on real change; notify
    plumbing (revalidate/IndexNow volume, batched?); cost per day vs ceiling. Mismatches are bugs — ticket them with file refs.
11. **Decide per cohort, in writing**: eligible + not-indexed + demand → enrich & republish (bounded revalidation) · thin + no demand → de-expose ·
    junk/duplicate → 410/301 · past + real results → retain · notified but uncrawled > 14 d → fix exposure first. **Families** (new tool/hub/locale
    batch) scale only if crawled+indexed reliably, impressions for the intended queries, movement toward pages 1–2, real activation, no
    cannibalisation, no Google-chosen canonical. Diagnose misses by layer: not indexed → quality/duplication; indexed no impressions → demand;
    impressions no clicks → snippet; clicks no action → page/product; no return → retention. **Never answer a miss with "more pages".**
12. **Report + dispatch**: append the weekly section (funnel, deltas, verdict flips, integrity failures, decisions, cost line) to the project's SEO
    log; dispatch fixes as briefs to the right lane. Nothing changed → say so in two lines and stop.

## Mode C — Autoresearch (keep/revert improvement, technical only)
Needs `scripts/seo/scorecard.config.json` in the project (copy the sportplan one; thresholds + guardrails are project-specific).
13. **Baseline** on a fresh branch: `node $S/seo-scorecard.mjs --config scripts/seo/scorecard.config.json --md`; save `latest.json` as
    `baseline.json`. The failing checks **are** the hypothesis queue: guardrail > static > live, then by URLs touched.
14. **One hypothesis → one small change** (≤3 files), written to the run log first (e.g. disable list-link prefetch, link the canonical locale from
    hubs, slim the client payload, wire the cache-tag/IndexNow call, per-chunk `lastmod`, self-referencing canonical, a missing required schema field).
15. **Measure**: `--compare baseline.json --md`. Live checks read the *deployed* site, so for deploy-only effects rely on the static check that
    encodes the intent, or point `--base` at a preview deployment (previews don't reset the production cache).
16. **Decide**: `KEEP` → commit one change per hypothesis with its score delta, promote `latest.json` to `baseline.json`. `REVERT`/`NEUTRAL` →
    restore the touched files and log why. **Guardrail failure = always revert.** Stop after two consecutive reverts on the same check.
17. **Exit**: score before → after, kept commits, reverted hypotheses with reasons, checks left for humans (design/UX, data, migration, cost
    decision); open one PR. **Never**: deploy per iteration, shorten a cache window, add `force-dynamic`, touch robots/AI-bot lists, add image
    hosts or high-cardinality routes, edit the scorecard/runner to make a check pass, publish content, or send email.

## Done when
**A**: baseline captured with numbers, ≥4 templates measured as Googlebot, sitemap-vs-known gap quantified, every claim answered with mechanism +
evidence, traffic math done, plan written and published, site unchanged. **B**: weekly report exists with numbers, every cohort has a written
decision, at-risk pages handled before their grace window, fixes dispatched — no cache-window/robots/deploy change made by the loop. **C**: budget
spent or queue empty, each kept change is its own commit with hypothesis + delta, no guardrail failing in a kept state, project checks green, PR
open, exit report written — and nothing deployed, published or emailed.
