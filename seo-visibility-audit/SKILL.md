---
name: seo-visibility-audit
summary: "Evidence-based SEO visibility audit of any site: Search Console numbers, pages as Googlebot sees them, index/crawl verdicts, then a prioritised TODO plan."
description: Audit a project's organic visibility end-to-end and produce a prioritised visibility plan — pull Search Console (performance, page indexing, crawl stats, rich-result enhancements), fetch key templates as Googlebot and measure what the crawler actually gets (bytes, RSC/JS payload share, visible text, headings, landmarks, JSON-LD validity), parse sitemaps vs URLs Google knows, count data completeness in the DB, check the claims someone made ("low content", "not semantic", "thin pages"), and write the TODO plan. Use when asked to boost visitors / organic traffic, check why pages aren't indexed ("crawled – currently not indexed"), audit SEO, verify a consultant's SEO claims, or before any SEO work on a new project (/seo-visibility-audit <site-url> [gsc-property]).
source: dockialabs
---

# SEO Visibility Audit

## When to use
"boost visitors", "why aren't we indexed", "SEO audit", "a specialist says our HTML is thin / not semantic", "crawled – currently not
indexed", "we did SEO but no traffic", starting SEO on a new project. One project per run; works for any stack (measure from the outside).

## Steps
Shorthand: `S=~/.claude/skills/seo-visibility-audit/scripts/gsc.mjs` (GSC CLI), scripts in the same folder for Googlebot fetch + measure.
1. **Baseline from Search Console first (never from opinion) — pull it yourself with `scripts/gsc.mjs`** (zero-dep, read-only; auth =
   service account `GSC_CLIENT_EMAIL/GSC_PRIVATE_KEY` or `GOOGLE_APPLICATION_CREDENTIALS`, read from env or `./.env.local`; the SA email must
   be a user on the property — if not, tell the user exactly that and use the signed-in GSC tab meanwhile). Run from the project root:
   `node $S sites` · `node $S performance --days 90 --dimensions date --md` (trend + anomaly days) · `node $S performance --days 90 --dimensions query --limit 50 --md`
   · `node $S top-pages --days 90 --limit 1000 --csv > gsc-top-pages.csv` · `node $S funnel --days 28 --md` (clicks/impr/CTR/pos/pages by
   template × locale) · `node $S sitemaps --md` · `node $S inspect --urls <top-50 + 20 random indexable + 10 hubs> --md` (verdict, canonical,
   last crawl, rich-result issues). *No API exists* for the Page-indexing totals (CCNI / noindex / duplicate counts), Crawl stats, CWV and
   Enhancements dashboards — read those from the user's signed-in Chrome (claude-in-chrome) and close the tab afterwards; if no browser,
   estimate verdict mix from the inspect sample and say so. The #1 click page is often already noindex/redirected — check it explicitly.
2. **Fetch templates as Googlebot and measure.** `bash scripts/fetch-as-googlebot.sh https://site out/ "" es/ es/hub es/item-slug …` then
   `node scripts/measure-page.mjs out/<file>.html` per file. Report per template: gz vs raw bytes, script/RSC share, class-attr share,
   visible words, H1/H2/H3, landmarks, links, JSON-LD types + validity, hreflang count, a text sample. A site that is "70% RSC payload, 1.5%
   text" is a payload/cost problem; "60 unique words per page" is a content problem — say which.
3. **Exposure vs reality.** Parse `sitemap_index` → all sitemaps: URLs by locale and by path type; compare with "URLs known to Google"
   (indexed + not indexed). A 10×+ gap means internal links/hreflang fan-out exposes variants the sitemap never meant to publish.
4. **Data completeness.** Read-only counts (anon REST / read replica) of the fields that make pages unique (for events: distance, elevation,
   price, deadline, image, official URL, real localized copy, results links, edition links). Sample descriptions for template-ness.
5. **Check the claims, name the mechanism.** For each claim made to the user (text/HTML ratio, semantics, speed…) give: verdict, the real
   mechanism, and evidence. Text-to-HTML ratio and minification are not ranking factors; thin/duplicated *content* and scaled locale
   variants are what "crawled – currently not indexed" means. Don't parrot; measure.
6. **Do the traffic math before promising anything.** Organic target ÷ blended CTR (2–4 %) = eligible impressions needed; compare with
   today's impressions; list the organic page systems that could carry it (action/tool pages, entity pages, hubs, guides) with units × avg
   visits, and a rung ladder (today → ×2 → ×5 …) each measured before the next. Score the project with
   `demand × click-necessity × repeatability × unique value × distribution × retention ÷ competition`; say plainly if SEO can't carry the target.
7. **Write the plan** (`docs/SEO_VISIBILITY_PLAN.md` in the repo, or the project's docs dir): north star + rung ladder; baseline → targets table; what top
   practitioners do now (research with sources, don't assume); competitor benchmark of pages that outrank the client; workstreams with
   checkbox TODOs, owner lane, impact/effort/cost note; sprint sequencing; "what not to do". Respect the project's cost/infra rules
   (read its CLAUDE.md / cost ledger first) — never propose shorter cache windows or per-commit deploys to "feel fresh".
8. **Publish** the plan as an artifact for sharing and give the user the 5-line verdict + the first three moves. Hand off execution to
   `/seo-visibility-loop` (weekly measure-and-decide) and to build stages per workstream.

## Done when
GSC baseline captured with numbers (clicks, impressions, indexed, not-indexed by reason, crawl by type, rich-result items); ≥4 templates
measured as Googlebot with the script; sitemap vs known-URL gap quantified; every user-supplied claim has a verdict + mechanism + evidence;
a prioritised TODO plan exists in the repo docs and is published; no site change was made during the audit.
