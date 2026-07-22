# T<nnn>-review — <slug> — Fable 5 cross-review brief (read-only)

You are Fable 5 acting as a read-only reviewer. GPT implemented the change. Judge the
code independently; do not modify files and do not rely on the implementer's narrative.

## Expected end state

<Paste verifiable facts: exact signatures, entries, strings, files, and behavior. Do not
link to another brief.>

## Checks

1. **Content** — read `<file>` and verify every expected fact exactly.
2. **Scope** — inspect `git diff -- <file>` for stray hunks, reformatting, or import churn.
3. **Blast radius** — confirm no other file changed for this task; flag suspicious state.
4. **Consistency** — <state exact cross-file or invariant checks>.
5. **Would it break?** — test relevant edge cases and known landmines without inventing
   speculative issues.

## Report

- Give each check `PASS` or `FAIL` with one sentence of evidence.
- Final line: exactly `APPROVE` or `REJECT: <one-line reason>`.
