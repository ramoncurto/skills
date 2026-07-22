---
name: refactor
description: Refactor targeted code to be more scalable, maintainable, modular, and easier to understand — best practices, clearer architecture, less duplication, separation of concerns — while preserving behavior, then explain the significant changes and trade-offs. Use when the user says refactor, clean up, simplify this module, reduce complexity/duplication, improve architecture or maintainability of specific code (/refactor). For periodic whole-codebase sweeps use improve-codebase-architecture instead.
---

# Refactor — behavior-preserving improvement of targeted code

## When to use
The user points at specific code (file, module, feature, diff) and wants it improved
structurally — "refactor this", "clean this up", "make this maintainable/modular",
"this is too complex", "there's a lot of duplication here" — without changing what it does.
Not for adding features, fixing bugs (use `diagnosing-bugs`), or codebase-wide architecture
sweeps (use `improve-codebase-architecture`).

## Steps
1. **Pin the safety net first.** Find the tests covering the target code and run them
   (e.g. `npx vitest run path/to/target`); note the green baseline. If coverage is thin,
   write characterization tests for current behavior BEFORE touching anything —
   behavior preservation is unverifiable without them.
2. **Read the whole target plus its callers.** Map responsibilities, data flow, and every
   external contract (exports, API shapes, DB reads/writes, i18n keys, side effects).
   List the contracts explicitly — these must not change.
3. **Diagnose before prescribing.** Name the concrete smells: duplication, mixed concerns,
   god functions, leaky abstractions, dead code, unclear naming, missing seams. Skip
   anything that is merely "not how I'd write it" — style churn is not refactoring.
4. **Plan the smallest sequence of safe moves.** Prefer established refactorings
   (extract function/module, inline, rename, replace conditional with polymorphism or
   lookup, introduce parameter object, pull pure logic out of I/O). Order them so the
   suite can run green between moves. Do NOT redesign product behavior, rewrite from
   scratch, or add speculative abstractions for imagined future needs.
5. **Execute move-by-move, verifying between.** After each logical move, run the target
   tests; after the batch, run the full project gate (e.g. `npm run check`). Match the
   surrounding code's idiom, naming, and comment density. Never mix a behavior change in —
   if you discover a real bug, report it separately instead of silently fixing it.
6. **Confirm behavior is preserved.** Full suite green, no public contract changed
   (or every deliberate contract change called out), typecheck/lint clean.
7. **Explain the result.** Report: the most significant changes and WHY each one improves
   scalability/maintainability/clarity; the trade-offs taken (e.g. more files vs. shorter
   ones, indirection added for testability); and any residual risks (thin test areas,
   behavior edges characterization tests might miss, callers to watch).

## Done when
Tests and the project gate are green, external contracts are unchanged (or explicitly
flagged), the diff contains only structural improvements with no behavior changes, and
the user has a written summary of significant changes, reasoning, trade-offs, and risks.
