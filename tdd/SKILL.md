---
name: tdd
summary: "Write the failing test first, make it pass, then clean up."
description: Drive red→green→refactor — write a failing test first, minimal code to pass, then refactor with tests green. Use when implementing a feature or fixing a bug with testable behavior.
---

# Test-Driven Development

## When to use
You are implementing a feature or fixing a bug whose behavior can be expressed as a test. Reach for this whenever you can name the expected output for a given input before writing the code.

## Steps
1. **Red — write one failing test.** Capture a single behavior as a concrete assertion. Name it after the behavior, not the function (`returns 0 for an empty cart`, not `testCalc`).
2. **Run it and watch it fail.** Confirm it fails for the right reason (assertion, not import error). A test that never failed proves nothing.
3. **Green — write the minimal code to pass.** Hardcode if that's genuinely the smallest step; the next test will force generality. Resist building ahead.
4. **Run the whole suite.** All green before you touch anything else.
5. **Refactor — improve names, dedupe, clarify — with tests staying green.** Rerun after each change. Refactor production and test code both.
6. **Repeat** one behavior at a time. Keep the loop tight; commit at green points.

Example loop:
```bash
npm run check        # or the project's single-test runner — see CLAUDE.md
```

Guidance: one logical assertion per test; test behavior through the public interface, not internals; never edit code and its test in the same red step.

## Done when
Every targeted behavior has a test that failed before the code existed and passes now, the full suite is green, and the code has been refactored at least once with tests guarding it.
