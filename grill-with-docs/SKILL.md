---
name: grill-with-docs
description: Interrogate a vague request with clarifying questions grounded in the project's real docs and code, so each question is specific and informed. Use at the start of an underspecified task in an existing codebase (/grill-with-docs).
---

# Grill With Docs

## When to use
Same trigger as grill-me — an underspecified task — but inside an existing codebase with real docs, schema, and conventions. Use this when the answers should be anchored to how the project actually works, not asked in the abstract.

## Steps
1. **Read before you ask.** Skim the relevant docs and code first: CLAUDE.md, HANDOFF / architecture docs, the schema, and the modules the task touches. Let evidence shape the questions.
2. **Do not implement yet.** This phase only removes ambiguity.
3. **Ground every question in a concrete reference.** Cite the file, function, table, or doc section that prompts it: "HANDOFF §3c says agent RPCs are loop-safe — should this new call follow that contract, or is it outside the loop?" A grounded question both informs the user and proves you've done the reading.
4. **Surface conflicts.** Where the request contradicts an existing pattern, constraint, or hard rule (e.g. "never touch the `public` schema"), raise it as a question rather than silently picking a side.
5. **Confirm assumptions against the code.** State what the codebase implies and ask the user to confirm: "The `app` schema is multi-tenant — should this be tenant-scoped like the rest?"
6. **Prioritize and loop** until the spec is unambiguous, then summarize the agreed requirements with their supporting references.

## Done when
Every design-changing ambiguity is resolved with questions tied to real docs/code, conflicts with existing patterns are surfaced, and a short referenced summary of the agreed requirements exists.
