# T<nnn>-review — <slug> — cross-review brief (READ-ONLY)

You are a READ-ONLY reviewer. Another model implemented task T<nnn>; verify its work
independently. You may not modify anything. You were NOT shown the implementer's report
on purpose — judge the code, not the narrative.

## What was supposed to happen (facts, from the orchestrator)

<State the expected end-state as verifiable FACTS, not as a description of the diff:
exact entries a map must contain, exact signature a function must have, exact strings,
exact files. Copy from brief T<nnn> §1/§3 — do not link to it, paste it.>

## Checks (do all)

1. **Content** — read `<file>` and confirm the facts above hold (accents/spelling/exact
   strings matter).
2. **Scope** — `git diff -- "<file>"` touches only the expected block(s); no stray hunks,
   no reformatting, no import churn.
3. **Blast radius** — no OTHER file was changed for this task. (The dispatcher's delta is
   authoritative; still, flag anything suspicious you notice.)
4. **Consistency** — <task-specific cross-checks: e.g. "every X in file A has an entry in
   file B", "the i18n key exists in all 5 messages/*.json">.
5. **Would it break?** — think adversarially for one pass: nulls, empty lists, the
   repo's known landmines relevant here (<list them>). Flag anything real; don't invent.

## Report

- One line per check: `PASS` / `FAIL` + one-sentence evidence.
- Last line: exactly `APPROVE` or `REJECT: <one-line reason>`.
