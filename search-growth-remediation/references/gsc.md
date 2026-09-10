# GSC diagnosis and recovery

Use the correct verified property/account and canonical production host. If access is unavailable, collect public evidence and identify the exact missing owner-side observation. A public fetch or a Googlebot user-agent string is not Google-rendered evidence.

## Collect enough evidence to decide

Record Page indexing counts and last update; submitted sitemap status/last read; representative URL inspections; robots report; crawl/host status; manual actions/security; HTTPS and field CWV when available. Use performance date ranges and country/query/page cohorts for a baseline. Report top-row/export limits and anonymization; do not call sampled competitor or query data exhaustive. Use an existing Semrush trial only within its available allowance and do not start/renew/upgrade one without explicit approval. Country demand can prioritize existing languages; it does not justify blanket translation expansion.

Read a bounded sample from each material exclusion family, including high-value pages. Where necessary, inspect the entire reported error cohort with bounded public requests. Do not fetch an unlimited site inventory merely because the tool permits it.

| Observed state | Appropriate action |
|---|---|
| Intentional noindex, redirect, canonical alias, retired 404 | Verify intent, destination and sitemap exclusion; preserve correct behavior. Not every excluded URL belongs in Google. |
| Server/robots/access failure | Reproduce the actual response and fix its owner. Historical 5xx examples may now legitimately be 404 or redirected; do not resurrect junk URLs. |
| Google-selected canonical differs | Compare current and last-crawled canonical, redirects, internal links, alternates and sitemap ownership. Link directly to the intended canonical. |
| Crawled, currently not indexed | Inspect native/rendered substance, intent, originality, duplication and canonical consistency. Do not keep requesting indexing for the same crawled page. |
| Unknown to Google or discovered, not crawled | First establish eligibility, useful rendered content, crawlable links and sitemap membership; then consider a small authorized priority request. |
| Indexed | Measure search impressions/clicks independently. Do not request again just to make the report look active. |
| Validation/request already queued | Preserve its state and wait for a new observation; queue acceptance is not completion. |

## Fix the actual contract

- Keep a canonical eligible inventory and a real homepage → hub → detail graph of HTML anchor links. Verify current locales and relevant exceptions; do not manufacture links solely as a score trick.
- Sitemaps list eligible canonical URLs with reciprocal, applicable language alternates. Use significant actual modification dates, including newly changed visible copy, not deployment time or a review date when nothing changed. Keep unrelated dates unchanged. A changed sitemap can justify submission; repeated unchanged resubmissions are not a recovery plan.
- In robots reports, distinguish fetching failures, recognized blocking rules, unsupported syntax and ignored extension warnings. Prioritize the demonstrated impact: an unsupported extension line is not automatically a site-wide outage or P0. A nonstandard line does not necessarily invalidate the file. Preserve the owner's explicit Content Signals policy; Google ignoring it does not prove blocked indexing. Keep optional catalog discovery in a valid supported location or a comment rather than inventing robots directives.
- Inspect meaningful main content excluding scripts/navigation when assessing source HTML. RSC/font requests are often normal resources; an “other file” percentage is not evidence to block resources or claim crawl starvation.
- Check JSON-LD against the current official contract. Google permits the terminal BreadcrumbList item to omit its URL; a fabricated homepage fragment is not an accurate substitute.
- Google must be able to crawl a page to read its noindex directive; blocking the same URL in robots can prevent that. Canonical declarations and sitemaps are signals, not commands.
- Field-data insufficiency is unknown, not a CWV pass. A successful live test is eligibility evidence, not inclusion in the index.

## Provider actions

Use the installed SEO indexing planner when available, with real dated evidence. Otherwise record the same prerequisites explicitly: fetchable/indexable, rendered content, canonical consistency, crawlable discovery, sitemap membership, truthful lastmod, recent crawl health, current Google state and prior request state.

For each limited request, record exact property/URL, existing user authority, prerequisite evidence, queue acknowledgement and later state separately. Use the ordinary owner UI or supported property tools. Never use the generic Indexing API for ordinary articles, create alternate accounts/projects to bypass quotas, use deprecated sitemap pings, or repeatedly restart validation. Request a robots recrawl after a real published correction and retain the old report until Google reads the new file.

## Primary references to refresh when needed

- [Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [URL Inspection](https://support.google.com/webmasters/answer/9012289)
- [Crawl statistics and host availability](https://support.google.com/webmasters/answer/9679690)
- [Canonicalization](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Crawlable links](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)
- [Sitemaps and lastmod](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [robots.txt specification](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec)
- [Breadcrumb structured data](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)
