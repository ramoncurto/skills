---
name: search-growth-remediation
description: Diagnose and fix search-growth readiness problems across Google Search Console, AdSense low-value-content rejections, and isitagentready.com audits. Use for a combined recovery/remediation pass or a request to fix these issues fully and verify a release; ordinary keyword research alone belongs to the SEO workflow.
metadata:
  author: Dockia Labs
---

# Search Growth Remediation

## When to use

Use for a project recovery pass involving GSC exclusions, AdSense content/site readiness, or an AgentReady score target. Run only the requested tracks and mode. For an explicit audit/plan-only request, deliver the evidence and actionable plan without executing mutations; that requested deliverable can be complete while remediation remains unstarted. The shared discipline is evidence → bounded fixes → verified release → provider readback.

A high AgentReady score does not establish Google quality, indexing, ranking or AdSense approval. Treat these as separate outcomes throughout the run.

## Steps

1. **Recover context and authority.** Read the project instructions, latest worklog, previous receipts and existing session authorizations. Discover the real production domain, canonical host, stack, locales, provider accounts and release path; do not transplant another project's IDs, dates or settings. Preserve existing approval instead of asking again. A bare audit/skill invocation starts with read-only diagnosis; carry authorized fixes and releases to completion.
2. **Establish the current state.** Read the actual owner property and current scanner profile, not only screenshots or remembered numbers. Record report dates, URLs, cohort denominators, source evidence and unknowns. Recheck drift-prone facts against official documentation. Copy [assets/run-record.json](assets/run-record.json) into the project's normal evidence location and fill only observed fields, leaving unknowns null. Set templateOnly to false only for an actual captured run; template values are not observations.
3. **Route the requested tracks.** Read [references/gsc.md](references/gsc.md) for indexing/crawl findings, [references/adsense.md](references/adsense.md) for content/site rejection work, [references/agentready.md](references/agentready.md) for the scanner's concrete failed checks, and [references/semrush.md](references/semrush.md) when competitive, keyword-gap or country/language demand research is requested. Keep separate finding queues and provider outcomes even when one fix benefits several tracks.
4. **Separate defects from expected states.** Classify each finding as an owned defect, intended exclusion, inapplicable capability, stale observation, or external pending decision. Confirm applicability from the real product. Preserve unresolved failures in the scoreboard; do not hide checks, invent endpoints, pad content, or call a local pass an external success.
5. **Plan atomized work.** Read [references/release-and-swarm.md](references/release-and-swarm.md). Direct independent, disjoint tasks with explicit files, behavior, acceptance and stop conditions. Default independent bounded executors to an available Luna model (currently `gpt-5.6-luna` when advertised), unless the user explicitly chooses another model. If Luna is unavailable, disclose that, do small bounded work locally, and choose or escalate only a concrete difficult atom when warranted and allowed; do not launch an automatic replacement swarm or invent a model ID. Retain director ownership of integration, security/privacy decisions, review, release and provider actions.
6. **Implement and verify.** Reproduce concrete defects, make the smallest useful changes, and run meaningful focused regressions plus the project's required gate. Compare representative served HTML and real browser behavior. Use existing SEO/audit/review skills when installed and applicable; the references here also describe the standalone workflow. Do not install tools, start trials, spend money or change unrelated product scope merely to improve a score.
7. **Freeze and release.** Finish evidence-document edits before starting a review that hashes the working tree. Record exact source identity, review findings and fixes. Complete the already-authorized push/PR/CI/merge/deploy/cleanup path, preserving unrelated WIP. Verify the production alias and source revision, then retest the deployed behavior; local and preview checks are not production acceptance.
8. **Perform eligible provider follow-through.** Reuse valid session authorization for the concrete action. Submit only appropriate limited indexing/review/recrawl actions after prerequisites pass, and read back the queue/provider state. Do not repeat requests to force a result, restart an existing validation, bypass quotas, or send support/outreach messages without message authorization. If a genuinely missing approval remains, prepare the concrete action and evidence first, then ask once and explain its source.
9. **Close honestly.** Report shipped changes, exact verification, fresh provider results and remaining conditions. For external waits, record the next observable condition and safe timing. Schedule a follow-up only when requested. Continue all authorized controllable work; stop only at a real external dependency or unresolved authority boundary, without labelling the requested overall outcome complete.

## Done when

For diagnosis/plan-only mode, finish when the evidence, priorities, concrete proposed fixes, validation and authority requirements are delivered. The conditions below apply to an authorized remediation run, not to a plan-only deliverable.

- Every applicable finding is either corrected and verified at the required layer, or explicitly retained with evidence, an owner and a concrete next condition.
- Required review/tests and the authorized release/provider lifecycle are complete; unrelated work is preserved.
- The scanner's requested score is verified from the same live profile and its real score field. If unavailable or still below target, report that exact limit rather than a synthesized 10/10.
- GSC queue acceptance, crawl/index state, measured impressions and the AdSense decision remain separately labelled. “Review requested” is pending, not approval; a sampled content pass does not clear an entire site's low-value verdict.
