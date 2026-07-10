# T<nnn> — <slug> — brief for Claude Fable 5

You are Fable 5 executing a brief inside this repository. The GPT-5.6 Sol xhigh
orchestrator has made every decision already. Execute faithfully; do not redesign. If
anything forces a choice this brief does not settle, stop and report `BLOCKED` (§8).

## 1. Objective

<One sentence, followed by the exact user-visible behavior when complete.>

## 2. Current state (read this; do not rediscover it)

<For each relevant file, paste the path and verbatim excerpt with enough context. State
why the current behavior matters when it prevents a wrong turn.>

- `path/to/file` — <what it does today and the relevant excerpt>
- Task landmines: <line endings, locale fan-out, generated files, schema quirks, etc.>

## 3. Exact steps

<Give numbered, per-file, code-level edits. Fix exact names, signatures, locations, and
wording. Fable must not have to invent a name or choose an approach.>

1. In `path/to/file`, <perform the exact edit>. Use:
   ```
   <exact snippet when wording or structure matters>
   ```
2. <Continue exhaustively.>

## 4. Blast radius (exhaustive)

You may create or modify only:

- `path/one`
- `path/two`

Touching any other file is task failure. Do not improve adjacent code.

## 5. Forbidden (standing list plus task-specific rules)

- Do not run `git commit`, `git push`, `git stash`, or branch operations.
- Do not touch databases, secrets, external services, or files outside the repository.
- Do not edit worklogs, quality baselines, `.env*`, `.github/workflows/*`, or lockfiles.
- Do not install or remove dependencies.
- Do not write outside §4.
- <Add project- and task-specific prohibitions.>

## 6. Verify (run in this order)

```bash
<project verification command> # expect: <exact output>
```

<State known pre-existing failures so Fable does not chase them.>

## 7. Report (final message must contain)

- `CHANGED:` every file actually created or modified.
- `VERIFY:` each §6 command and its actual output.
- `DEVIATIONS:` anything different from §3 and why; normally empty.
- `NOTES:` optional observations for the orchestrator.
- Final line: exactly `DONE` or `BLOCKED: <one-line reason>`.

## 8. If blocked

Stop at the first obstacle the brief does not cover. Report what you found. Do not widen
the blast radius, work around a rule, or guess.
