---
name: grill-me
description: Interrogate a vague request with sharp clarifying questions BEFORE any implementation, until requirements are unambiguous. Use at the start of an underspecified task (/grill-me).
---

# Grill Me

## When to use
The request is underspecified, broad, or could be built several incompatible ways. Use this at the very start — before designing or coding — to surface hidden requirements while changing direction is still free.

## Steps
1. **Do not implement yet.** Your only job in this phase is to remove ambiguity.
2. **Find the unknowns.** Probe the dimensions that change the build: scope (what's in/out), users and their goals, inputs/outputs, edge cases, error behavior, scale/performance, constraints (deadline, stack, deps), success criteria, and what "done" looks like.
3. **Ask sharp, answerable questions.** Concrete and specific beats open-ended. Prefer "Should deleting an account also delete its orders, or soft-delete?" over "How should deletion work?" Offer options when it speeds the answer.
4. **Batch and prioritize.** Lead with the questions whose answers most change the design. A handful of decisive questions beats twenty trivial ones.
5. **Surface assumptions explicitly.** State the assumptions you'd otherwise make silently and ask the user to confirm or correct each.
6. **Loop until unambiguous.** Ask follow-ups on vague answers. Stop when you could hand the spec to another engineer and they'd build the same thing.
7. **Summarize the agreed spec** in a few lines before moving to design/implementation.

## Done when
Every design-changing ambiguity is resolved, assumptions are confirmed, and a short written summary of the agreed requirements exists that someone else could build from unambiguously.
