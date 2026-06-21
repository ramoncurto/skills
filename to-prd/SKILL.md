---
name: to-prd
description: Turn a discussion or rough idea into a written product requirements doc — problem, users, scope, non-goals, acceptance criteria. Use before building a feature (/to-prd).
---

# To PRD

## When to use
You have a rough idea or a back-and-forth discussion and you're about to build a feature. Use this to crystallize the conversation into a durable, reviewable spec before implementation.

## Steps
1. **Gather the raw material.** Pull from the discussion, any clarifying answers, and relevant docs/code. If key questions are still open, resolve them first (see grill-me / grill-with-docs).
2. **Write the PRD** with these sections, kept tight:
   - **Problem** — what's wrong today and why it matters. One paragraph.
   - **Users / context** — who is affected and the scenario they're in.
   - **Goals** — the outcomes this must achieve, stated as results not features.
   - **Scope** — what's being built, at a feature/behavior level.
   - **Non-goals** — explicitly what is OUT, to prevent scope creep and set expectations.
   - **Acceptance criteria** — concrete, testable conditions for "done" (prefer Given/When/Then or a checklist).
   - **Open questions / risks** — known unknowns and dependencies.
3. **Make acceptance criteria verifiable.** Each should map to something you could test or demo; no vague "works well."
4. **Keep it skimmable.** Bullets over prose; a reader should grasp the whole in a couple of minutes.
5. **Circulate for sign-off** before building; treat the PRD as the source of truth and update it if scope changes.

## Done when
A written PRD exists covering problem, users, goals, scope, non-goals, and testable acceptance criteria, open questions are listed, and the relevant stakeholder has agreed to it.
