---
name: diagnosing-bugs
description: Structured debugging — reproduce, isolate, hypothesize, test the hypothesis, fix the root cause not the symptom, add a regression test. Use when a test fails or behavior is unexpected.
---

# Diagnosing Bugs

## When to use
A test is failing, a behavior is wrong, or something works "sometimes." Use this instead of guessing-and-poking at the code.

## Steps
1. **Reproduce reliably.** Find the smallest, deterministic way to trigger it. If you can't reproduce it, you can't fix it — gather logs/inputs until you can. Flaky? Run it in a loop.
2. **Isolate.** Bisect the surface: comment out, binary-search the input, `git bisect` across commits, or add log points to narrow where reality diverges from expectation.
3. **Form one hypothesis.** State it plainly: "the value is null because X is computed before Y runs." A hypothesis is falsifiable; a hunch is not.
4. **Test the hypothesis cheaply.** Add a log/assert/breakpoint that would confirm or kill it. Don't fix yet — verify the cause first.
5. **Fix the root cause, not the symptom.** Patching the observable (clamping a NaN, swallowing an error) hides the real defect. Ask "why did this state happen?" until you reach the origin.
6. **Add a regression test** that fails on the old code and passes on the fix. This is the proof the bug is gone and the guard against its return.
7. **Run the full suite** — confirm no new breakage.

## Done when
The cause is understood and stated, the fix addresses that cause, a regression test covers it, and the whole suite is green.
