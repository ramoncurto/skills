---
name: refactor
summary: "Tidy up code so it's easier to read and grow, without changing what it does."
description: Refactor code to be more scalable, maintainable, modular, and easier to understand — best practices, clearer architecture, less duplication, separation of concerns — while preserving behavior, then explain the significant changes and trade-offs. Works on targeted code (a file/module) or as a periodic whole-codebase architecture sweep. Use when the user says refactor, clean up, simplify this module, reduce complexity/duplication, improve architecture or maintainability (formerly refactor + improve-codebase-architecture) (/refactor).
---

# Refactor — behavior-preserving improvement, targeted or codebase-wide

## When to use
The user wants code improved structurally — "refactor this", "clean this up", "make this
maintainable/modular", "reduce duplication" — without changing what it does. Two scopes:
- **Targeted** (default): a specific file, module, feature, or diff.
- **Sweep**: run periodically as the codebase grows, especially after bursts of fast
  AI-assisted edits that optimized "make it work" over "make it coherent."
Not for adding features or fixing bugs (use `debug`).

## Steps
1. **Set the scope.** Targeted: the code the user pointed at plus its callers. Sweep: survey
   the module map and dependency arrows first — duplicated logic, leaky abstractions (callers
   reaching into internals), cyclic or fan-in-heavy dependencies, god-files, divergent
   solutions to the same problem. Quantify each smell's cost (bugs, friction, repeated edits),
   rank by cost-to-fix vs. value, and confirm the shortlist with the user before large moves —
   never one giant rewrite.
2. **Pin the safety net.** Find the tests covering the target code and run them
   (e.g. `npx vitest run path/to/target`); note the green baseline. If coverage is thin,
   write characterization tests for current behavior BEFORE touching anything —
   behavior preservation is unverifiable without them.
3. **Map the contracts.** Read the target plus its callers; list every external contract
   (exports, API shapes, DB reads/writes, i18n keys, side effects). These must not change.
4. **Diagnose before prescribing.** Name the concrete smells: duplication, mixed concerns,
   god functions, leaky abstractions, dead code, unclear naming, missing seams. Skip anything
   that is merely "not how I'd write it" — style churn is not refactoring.
5. **Plan the smallest sequence of safe moves.** Prefer established refactorings (extract
   function/module, inline, rename, replace conditional with polymorphism or lookup,
   introduce parameter object, pull pure logic out of I/O, consolidate near-duplicates,
   break a cycle by inverting a dependency). Order them so the suite can run green between
   moves; keep each independently shippable. Do NOT redesign product behavior, rewrite from
   scratch, or add speculative abstractions for imagined future needs.
6. **Execute move-by-move, verifying between.** After each logical move, run the target
   tests; after the batch, run the full project gate (e.g. `npm run check`). One refactor per
   commit in sweep mode. Match the surrounding code's idiom, naming, and comment density.
   Never mix a behavior change in — if you discover a real bug, report it separately.
7. **Confirm behavior is preserved.** Full suite green, no public contract changed (or every
   deliberate contract change called out), typecheck/lint clean.
8. **Explain the result.** Report: the most significant changes and WHY each improves
   scalability/maintainability/clarity; the trade-offs taken (more files vs. shorter ones,
   indirection added for testability); any residual risks (thin test areas, behavior edges
   characterization tests might miss, callers to watch); and — in sweep mode — the remaining
   lower-priority items for next time.

## Done when
Tests and the project gate are green, external contracts are unchanged (or explicitly
flagged), the diff contains only structural improvements with no behavior changes, and the
user has a written summary of significant changes, reasoning, trade-offs, and risks (plus
the deferred-items list in sweep mode).
