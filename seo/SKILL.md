---
name: seo
summary: "Audit, measure, and improve organic-search and answer-engine eligibility with explicit evidence boundaries."
description: Use when the user asks to audit, diagnose, measure, plan, or implement SEO or GEO work involving crawlability, indexing, Search Console, Bing Webmaster Tools, structured data, organic traffic, or AI citations. Default to read-only evidence collection; a bare mention of SEO loads this skill but does not authorize edits, account or property changes, crawler-policy changes, publishing, deployment, commits, pull requests, outreach, or outcome guarantees.
source: dockialabs
---

# SEO and GEO evidence

## Authority and safety

The user’s requested scope and repository instructions are the authority. Read-only repository
inspection and public-page measurement are permitted within that scope. Source edits require an
implementation request. Credentials may only be used read-only for a property the user asked to
inspect and must never be printed. Account settings, robots/meta/header policy, sitemap or IndexNow
behavior, publishing, deployment, commits, pull requests, outreach, purchases, and production writes
require explicit authorization for that action. Search and answer engines remain external decision
systems: never promise crawling, indexing, ranking, citations, traffic, conversions, or a time to
effect.

Read-only audits need no approval; writes require explicit authorization and appropriate human gates.
Missing external data or evidence is UNKNOWN. Never promise or guarantee indexing, rank position,
traffic, revenue, or timing; “#1 in a month” and “millions” are unprovable outcomes.

## When to use

Use for a read-only SEO/GEO audit, a readiness review, a measurement question, or an explicitly
authorised bounded change. A bare mention or audit request is read-only; do not infer authority to
edit, publish, deploy, change crawler policy, or access an account.

Separate repository readiness, deployed/runtime truth, search-platform observations, AI visibility,
and business outcomes. Source-fetch HTML with a Googlebot UA is not rendered Google evidence;
separate source-fetch from rendered Google evidence and use URL Inspection/rendered testing.
No universal ranking rules for CTR, word count, H1, RSC, payload, or cache; use contextual
diagnostics and label official requirements separately from hypotheses.

## Steps

1. Read `references/evidence-contract.md`, then record readiness fields, evidence level, source,
   cohort, denominator, date, owner, and UNKNOWNs. Do not promote a lower evidence level to a
   search or business outcome.
2. Use `references/seo-playbook.md` to assess technical eligibility plus intent fit, non-commodity
   value, firsthand/expert evidence, entity/author trust, internal discovery, authority/mentions,
   distribution, conversion/retention, experimentation, and cannibalization controls.
3. Fetch source HTML only as a diagnostic; use Search Console URL Inspection or equivalent rendered
   evidence for Google-observed claims. The Search Console API returns top rows and may truncate;
   mark completeness and never infer zero from empty rows. For exhaustive history use bulk export.
4. Apply `references/geo-controls.md`: Google generative AI controls/report, Bing AI Performance
   (intents, topics, citation share), separate bot controls, and the access-to-retention funnel.
   Keep OAI-SearchBot versus GPTBot, PerplexityBot versus Perplexity-User, and ClaudeBot/Claude-SearchBot versus Claude-User distinct.
   Measure crawler access -> eligibility/indexing -> impressions/visibility -> citation -> referral -> conversion/retention with denominators.
   Do not change bot access or claim special AI schema, chunking, or `llms.txt` effects without
   official evidence and approval. Track ChatGPT referral UTMs by dated cohort.
5. For substantial audits/remediation, Sol Ultra directs and performs the final non-author review;
   Terra and Luna execute bounded, disjoint briefs. Executors do not broaden scope, change policy,
   commit, push, deploy, or claim completion; the root/integrator owns merge and gates.
6. Report evidence level, verdict, delta, limitations, UNKNOWNs, and approval-gated next actions;
   keep tiny read-only queries un-orchestrated when no change or broad audit is needed.

## Done when

Done means the requested scope has a dated report in which every required check is PASS, FAIL, UNKNOWN,
or N/A with its evidence level and source; no required check was silently skipped; authorized changes
passed the deterministic gate and comparable before/after evidence; and no failed guardrail was
retained. External outcomes remain UNKNOWN unless directly observed in the relevant owner property,
official platform report, server logs, or first-party analytics. Done never means guaranteed indexing,
ranking, citation, traffic growth, conversion, or timing.
