# Google indexing protocol

This is a documentation and evidence protocol. It plans legitimate discovery and measurement; it
does not submit URLs, call a search-engine API, or promise a Google outcome. Record the property,
cohort, evidence level, source, observed-at time, and UNKNOWNs for every claim.

## Ordered workflow

1. **Eligibility/canonical inventory.** Verify HTTP reachability, robots and noindex controls,
   rendered content, canonical consistency, and the intended URL inventory before any acceleration.
2. **Homepage → hub → detail crawlable link graph.** Build and inspect crawlable internal links
   from the homepage through hubs to detail pages; a URL list without links is not a crawlable graph.
3. **Canonical sitemap; truthful significant-change lastmod.** Keep only canonical, eligible URLs
   in the sitemap and change lastmod only for a truthful significant change.
4. **Explicitly authorized manual-only sitemap submission.** Sitemap submission is manual-only,
   requires explicit authorization, and supports cohort/sitewide discovery; it is not a crawl or
   indexing command.
5. **Limited manual URL Inspection / Request indexing for priority URLs versus the sitemap cohort.**
   URL Inspection is read-only evidence collection and does not change a page, submit a request, or
   request indexing. Request indexing is separate, manual-only, and requires explicit approval for
   limited priority URLs. Do not automate submissions or infer submission authority from a queue
   response, an empty report, or a missing Search Console observation.
6. **Validate Fix only after an actual reported issue is fixed.** Validate Fix is manual-only and
   requires explicit authorization; use it only after the actual reported issue is fixed.
7. **Crawl-demand/capacity diagnosis.** Distinguish demand, site quality and internal discovery
   from Google crawl capacity, errors, responses, and observed owner-property data. Missing data is
   UNKNOWN, not proof of a block or a successful crawl.
8. **Submitted/queued → discovered → crawled → indexed → impressions/traffic.** Queue acceptance
   is not crawling or indexing, and indexing is not ranking or traffic. Measure each state separately
   with first-party evidence; do not promote one state into the next.
9. **Prohibited folklore and guarantee boundary.** No unsafe shortcut, inferred authority, or
   guaranteed indexing, ranking, traffic, or timing is part of this workflow.

## State routing table
Engine and submission state routing are separate: Engine `UNKNOWN`, `UNKNOWN_TO_GOOGLE`, `DISCOVERED_NOT_CRAWLED`, `CRAWLED_NOT_INDEXED`, `INDEXED`, `BLOCKED`, `DUPLICATE`, `REDIRECT`, and `ERROR`; Submission `UNKNOWN`, `NOT_REQUESTED`, `REQUEST_QUEUED`, `VALIDATION_STARTED`, `VALIDATION_PASSED`, and `VALIDATION_FAILED`; detailed routes below govern evidence and actions.

| Layer | State | Evidence and routing |
|---|---|---|
| Engine | `UNKNOWN` | E0 unknown; collect evidence and never select as a request candidate. |
| Engine | `UNKNOWN_TO_GOOGLE` | E4 observed known-not-indexed; eligible for selection only after URL prerequisites pass. |
| Engine | `DISCOVERED_NOT_CRAWLED` | E4 observed known-not-crawled; eligible for a limited priority action only after prerequisites pass. |
| Engine | `CRAWLED_NOT_INDEXED` | E4 observed known-not-indexed; never re-request; route to value/canonical review. |
| Engine | `INDEXED` | E4 observed indexed; measure impressions/traffic separately and never infer ranking. |
| Engine | `BLOCKED` | E4 observed blocked; route to eligibility/access remediation, not a request shortcut. |
| Engine | `DUPLICATE` | E4 observed duplicate; route to canonical/value review, not repeated submission. |
| Engine | `REDIRECT` | E4 observed redirect; route to the canonical destination and eligibility review. |
| Engine | `ERROR` | E0 unknown error state; inspect in the owner property, diagnose only from observed evidence, and re-observe after repair. |
| Submission | `UNKNOWN` | E0 unknown; no request or validation action may be inferred. |
| Submission | `NOT_REQUESTED` | E1 local record only; it is not evidence of a queue, crawl, or index. |
| Submission | `REQUEST_QUEUED` | E4 queue evidence only; it never promotes crawl, index, or candidate status. |
| Submission | `VALIDATION_STARTED` | E4 validation evidence only; it never promotes crawl, index, or candidate status. |
| Submission | `VALIDATION_PASSED` | E4 validation evidence only; it never promotes crawl, index, or candidate status. |
| Submission | `VALIDATION_FAILED` | E4 validation evidence only; cannot restart until an actual issue fix is explicitly evidenced and approved. |

Only an eligible E4 `UNKNOWN_TO_GOOGLE` or `DISCOVERED_NOT_CRAWLED` URL is a candidate; no E0 URL
is a candidate. Queue and validation states never promote crawl, index, or candidate status;
submission state remains separate and coexists with engine evidence while the plan waits/reinspects.
`CRAWLED_NOT_INDEXED` gets no re-request and routes to value/canonical review. `VALIDATION_FAILED`
cannot restart until the actual issue fix is explicitly evidenced and approved; the v1.1 planner
does not infer that prerequisite.

## API and safety boundaries

The Indexing API is restricted to job posting (JobPosting) pages or eligible livestream pages with
`BroadcastEvent` embedded in a `VideoObject`, per the official documentation. Never use a generic
Indexing API for ordinary pages. Quota and approval rules are documented at
https://developers.google.com/search/apis/indexing-api/v3/quota-pricing. No quota, project, account,
or credential circumvention is permitted; never circumvent submission limits with additional
projects, accounts, or credentials.

Do not repeat manual URL Inspection requests, make repeated unchanged sitemap resubmissions, or use
the deprecated sitemap ping. Do not fabricate or fake lastmod values, manipulate traffic, buy links,
or use link schemes. Never guarantee indexing, ranking, traffic, or timing.

## Evidence handoff

The illustrative input at `../assets/indexing-plan.input.example.json` is `exampleOnly` and must be
rejected by the plan tool. A real input requires dated evidence and explicit owner approval for any
manual sitemap submission, Request indexing, or Validate Fix action. The plan tool is offline and
write-free: it emits candidates and actions only; it does not submit, validate, publish, or change a
search property.
