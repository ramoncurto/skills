---
name: improve-codebase-architecture
description: Find and reduce accumulating complexity — duplication, leaky abstractions, tangled dependencies — introduced by fast AI-assisted edits, then propose and apply targeted refactors. Run periodically as the codebase grows (/improve-codebase-architecture).
---

# Improve Codebase Architecture

## When to use
Invoke periodically as the codebase grows, especially after bursts of fast AI-assisted edits that optimize for "make it work" over "make it coherent." Symptoms: copy-pasted blocks, modules that know too much about each other, helpers that almost-but-not-quite do the same thing.

## Steps
1. **Survey, don't assume.** Map the modules and their dependency arrows. Look for the usual decay: duplicated logic, leaky abstractions (callers reaching into internals), cyclic or fan-in-heavy dependencies, god-files, and divergent solutions to the same problem.
2. **Quantify the pain.** For each smell, note where it is and what it costs — bugs, friction, repeated edits. Rank by cost-to-fix vs. value. Don't refactor for aesthetics alone.
3. **Propose targeted refactors.** For the top items, write the specific change: extract this shared logic, hide that internal behind an interface, break this cycle by inverting a dependency, consolidate these three near-duplicates into one. Keep each refactor small and independently shippable.
4. **Confirm before large moves.** Surface the plan; let the human veto scope. Avoid one giant rewrite.
5. **Apply behavior-preserving changes with tests as the harness.** Run the suite before and after each refactor — green to green, no behavior change. One refactor per commit.
6. **Re-verify.** `npm run check` (and `check:full` before finishing) per CLAUDE.md.

## Done when
The highest-cost complexity is identified, the chosen refactors are applied without changing behavior, tests stay green throughout, and remaining lower-priority items are noted for next time.
