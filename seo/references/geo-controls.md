# GEO and answer-engine controls

Verified 2026-08-22. Source hierarchy: Google, Microsoft/Bing, OpenAI, Perplexity, and Anthropic
first-party documentation; then dated platform reports; then reproducible observations with cohorts.

## Controls and measurements

Googlebot governs Google Search crawling and Search AI eligibility; a source fetch using its
user-agent is not rendered Google evidence. Google AI features require ordinary indexed,
snippet-eligible pages; there is no special AI file or schema, and inclusion is never guaranteed.
Keep `noindex` (blocks indexing), `nosnippet` (withholds a text snippet), `data-nosnippet` (marks
specific text that must not appear in snippets), and `max-snippet` (limits snippet length) distinct.
Google generative AI controls and the Search Console generative AI report are platform observations,
not promises of inclusion. The generative AI report exposes impressions with limited dimensions; it
is not a causal attribution report. `Google-Extended` is an independent control for Gemini
training/grounding and does not control Google Search crawling or Search AI inclusion.

Bing AI Performance is a sampled, aggregated publisher-console signal: record intents, topics,
citation share, comparison cohort, dates, and denominators. Citations are not rankings, clicks,
traffic, authority, or causal results. Keep missing publisher consoles UNKNOWN. GEO/AEO is part of
solid SEO, not a magic separate hack. Do not invent a special AI schema, chunking rule, or `llms.txt`
effect.

Keep crawler controls distinct: OpenAI `OAI-SearchBot`/OpenAI SearchBot, `GPTBot`, and
`ChatGPT-User`; Perplexity `PerplexityBot` versus `Perplexity-User`; and Anthropic `ClaudeBot`,
`Claude-SearchBot`, versus `Claude-User`. A crawler's access is not a citation, a citation is not a
referral, and a referral is not a conversion or retention result. Bing `noindex` blocks indexing;
`NOARCHIVE` excludes Copilot linking/training; and `NOCACHE` limits use to the URL, title, and
snippet, winning when combined with NOARCHIVE. IndexNow is a notification, not a guarantee of crawl,
indexing, or rank. Never change robots or AI-bot access without explicit approval.

PerplexityBot obeys robots. Perplexity-User is user-triggered and its crawler reference generally
ignores robots; the July 2026 help page says the prior blocked-URL summarization misuse was disabled.
Report both facts and never claim robots guarantees every user-triggered access.

OpenAI and Anthropic do not expose a publisher console or report equivalent for these crawler
observations in the consulted first-party documentation. Without owner-platform reports, server
logs, or first-party analytics, access, citation, referral, conversion, and retention remain
UNKNOWN.

## Evidence funnel

Measure the dated funnel as **crawler access -> eligibility/indexing -> impressions/visibility ->
citation -> referral -> conversion/retention**. Store numerator, denominator, cohort, query/topic,
locale, platform, date range, and source for every transition; report UNKNOWN when an external step
cannot be observed. Use ChatGPT referral UTMs for attributable traffic, without treating UTM absence
as proof that no AI referral occurred. No publisher console or first-party log means UNKNOWN, not zero.

## Current platform references

- Google generative AI controls: https://support.google.com/webmasters/answer/16908024?hl=en
- Google generative AI report: https://support.google.com/webmasters/answer/16984139?hl=en
- Google AI features eligibility and snippets: https://developers.google.com/search/docs/appearance/ai-features
- Google-Extended independence: https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers#google-extended
- Bing AI Performance: https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview
- Bing visibility insights: https://blogs.bing.com/search/June-2026/New-AI-Visibility-Insights-in-Bing-Webmaster-Tools-Intents-Topics-Citation-Share-Compare
- Bing robots meta semantics: https://www.bing.com/webmasters/help/robots-meta-tags-and-attributes-that-bing-supports-5198d240
- Bing IndexNow notification: https://www.bing.com/indexnow/getstarted
- Bing AI Performance help: https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c
- OpenAI bots: https://developers.openai.com/api/docs/bots
- OpenAI publisher FAQ: https://help.openai.com/en/articles/12627856-publishers-and-developers-faq
- Perplexity crawlers: https://docs.perplexity.ai/docs/resources/perplexity-crawlers
- Perplexity robots clarification: https://www.perplexity.ai/help-center/en/articles/10354969-how-does-perplexity-follow-robots-txt
- Anthropic crawlers: https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler
