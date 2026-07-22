---
name: grill
summary: "Get asked the hard questions up front, so the plan has no surprises later."
description: Interrogate before building — sharp clarifying questions until a vague request, or a plan you want stress-tested, is unambiguous; grounded in the project's real docs and code when inside a codebase. Use at the start of an underspecified task, when the user says grill me, stress-test this plan, poke holes, or any 'grill' phrase (formerly grill-me / grill-with-docs / grilling) (/grill).
---

# Grill — interrogate until unambiguous

## When to use
Two situations, same discipline:
- **A vague request** — underspecified, broad, or buildable several incompatible ways. Grill at the very start, before designing or coding, while changing direction is free.
- **An existing plan or design** — the user wants it stress-tested before building. Grill every branch of the design tree until you share one understanding.

## Steps
1. **Do not implement yet.** Your only job in this phase is to remove ambiguity.
2. **Read before you ask (in a codebase).** Skim CLAUDE.md, architecture/HANDOFF docs, the
   schema, and the modules the task touches. Answer for yourself what the codebase can answer —
   explore instead of asking — and let evidence shape the remaining questions.
3. **Find the unknowns.** Probe the dimensions that change the build: scope (in/out), users and
   their goals, inputs/outputs, edge cases, error behavior, scale/performance, constraints
   (deadline, stack, deps), success criteria, and what "done" looks like.
4. **Ask sharp, answerable questions, grounded when possible.** Concrete beats open-ended:
   "Should deleting an account also delete its orders, or soft-delete?" beats "How should
   deletion work?" In a codebase, cite the file/table/doc that prompts the question ("HANDOFF §3c
   says agent RPCs are loop-safe — does this new call follow that contract?"). Offer options,
   and give your recommended answer with each question.
5. **Pace by mode.** Grilling a *plan*: one question at a time, waiting for each answer —
   resolve dependent decisions in order; a barrage is bewildering. Grilling a *request*: a small
   prioritized batch is fine — lead with the questions whose answers most change the design.
6. **Surface conflicts and assumptions.** Where the request contradicts an existing pattern or
   hard rule, raise it rather than silently picking a side. State the assumptions you'd otherwise
   make silently and have each confirmed or corrected.
7. **Loop until unambiguous, then summarize.** Follow up on vague answers. Stop when another
   engineer could build the same thing from the spec. Write the agreed requirements in a few
   lines, with supporting references where they exist.

## Done when
Every design-changing ambiguity is resolved, assumptions are confirmed, conflicts with existing
patterns are surfaced, and a short written summary of the agreed requirements (with references,
in a codebase) exists that someone else could build from unambiguously.
