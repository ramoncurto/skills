---
name: handoff
summary: "Leave clean notes so the next person or session can pick up right where you left off."
description: Produce a clean handoff for the next session or person — current state, what's done, what's left, gotchas, and how to verify. Use when ending a work session or transferring work (/handoff).
---

# Handoff

## When to use
You're ending a work session, hitting a context limit, or passing the task to someone else. Use this so the next person (or your future self) can resume without re-deriving everything.

## Steps
1. **Capture current state.** What is the task, and where does it stand right now? Branch name, what's committed vs. uncommitted, what's deployed vs. local.
2. **List what's done.** The completed pieces, with the key files/functions touched (absolute paths) so they can be found fast.
3. **List what's left.** Remaining work as concrete next actions, ordered, with the obvious starting point flagged.
4. **Record the gotchas.** Non-obvious decisions, dead ends already tried (so they aren't repeated), constraints, and any "don't touch X" landmines. This is the highest-value section — write down what isn't in the code.
5. **Give the verify recipe.** Exact commands to confirm the current state and to check future changes:
   ```bash
   npm run check        # lint + tests
   npm run check:full   # + build, before finishing
   ```
   Plus how to run/observe the thing (URL, fixture, login, env vars needed).
6. **Keep it scannable.** Short sections, real paths and commands, no narrative filler.

## Done when
The handoff states current state, done, remaining (with a clear next step), gotchas, and a concrete verify recipe — enough that a fresh session could pick up the work without asking questions.
