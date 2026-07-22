---
name: features
summary: "Turn a rough product idea into a page-by-page feature list that's ready to build."
description: Turn a vague, overall product idea into a per-page atomic-features spec, then refine it pass-by-pass until it's detailed and build-ready. Use when you only have a rough idea and need to develop the pages + features your build agents will follow — or to keep sharpening an existing draft (formerly atomic-features) (/features).
---

# Atomic Features

## When to use
You have an overall, half-formed product idea ("a school back-office", "a marketplace for X") but not yet a list of pages or features — and you need to develop it into a build-ready spec the agents can implement: one `docs/features/<page>.md` per page, each with its **atomic features**. Re-run it as a loop to keep improving a draft until it's detailed enough to hand off. It's the upstream partner to the build pipeline's Align stage, which *consumes* what this produces.

## Steps
1. **Anchor the idea.** Restate the overall idea in one sentence: its purpose, the primary user, and the single core job it must do. A one-liner from the human is enough — you'll expand it. Don't start writing features yet.
2. **Propose the page map.** From the idea, propose the **minimal** set of pages/screens that delivers the core job — each as `name — one-line purpose`. Show the list; ask the human to add / remove / rename / merge. Put "maybe later" pages in a separate *Candidates* list, not the build set. Don't over-build.
3. **Generate atomic features per agreed page.** For each page, draft a `docs/features/<page>.md` with an **Atomic features** list in plain **product-owner voice** — one small, independently-testable capability per bullet (what the user can do or see), not engineering jargon and no "acceptance criterion". Follow the project's `docs/features/_TEMPLATE.md` (purpose · atomic features · states · copy · done-when · non-goals). Close each list with a one-line `_Built on:_` footnote left as a TODO until the build wires the real data/components.
4. **Refine in passes — this is the loop; re-run as often as needed.** Each pass, sharpen:
   - **Split** any bullet that's really two capabilities; **delete** vague or duplicate ones.
   - **Add the obvious-but-missing**: empty / loading / error states, create-edit-delete, search / filter / sort, permissions & roles, export, the "back" and confirmation paths.
   - **Pin the copy** (exact user-facing labels/messages) and write down the **non-goals** so the agent doesn't invent scope.
   - Reflect each page back and ask the human: *"what's wrong, what's missing, what's out of scope?"* Push for a specific number or concrete example wherever they're vague.
5. **Pressure-test for build-readiness.** For each page ask: *could an agent build EXACTLY this, with no further questions?* If a bullet leaves a decision open, make it concrete or log it as an open question and resolve it with the human. Remove anything you can't tie to the core job.
6. **Stop when ready, then hand off.** Ready = every page's atomic features are specific, deduped, non-overlapping, in friendly voice, with states/copy/non-goals filled, no build-blocking unknowns, and the human confirms they capture the intent. The `docs/features/*` are now the build contract — feed them to the build pipeline (the new-project Align stage / your agents build strictly to them).

## Done when
Every planned page has a `docs/features/<page>.md` whose atomic-features list is detailed, deduped, in plain product-owner voice (+ states, copy, non-goals), with no open decision that would block a build agent — and the human confirms it's ready to build.
