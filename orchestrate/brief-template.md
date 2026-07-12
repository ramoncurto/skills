# T<nnn> — <slug> — brief for <OPUS 4.8 | GPT-5.6 Terra>

You are a subagent executing a brief inside this repo. The orchestrator made every
decision already — your job is faithful execution, not judgment. If anything forces a
choice this brief doesn't settle, STOP and report BLOCKED (see §8).

## 1. Objective

<One sentence. Then: the exact user-visible behavior when this is done.>

## 2. Current state (read this, don't rediscover it)

<For each relevant file: path + the excerpt that matters, pasted verbatim, with line
context. State the WHY when it prevents a wrong turn.>

- `path/to/file` — <what it does today, the excerpt>
- Landmines relevant to THIS task only: <line endings, locale fan-out, generated files,
  sandbox limits (codex cannot write gitignored dirs), schema quirks…>

## 3. Exact steps

<Numbered. Per file. Code-level: exact names, signatures, key strings, snippets where
wording matters. A competent model should never have to invent a name or choose a
location.>

1. In `path/to/file`, <do X>. Use exactly:
   ```
   <snippet>
   ```
2. …

## 4. Blast radius (exhaustive)

You may create/modify ONLY:

- `path/one`
- `path/two`

Touching ANY other file = task failure. Do not "improve" adjacent code.

## 5. Forbidden (standing list + task-specific)

- `git commit` / `git push` / `git stash` / branch operations.
- Touching databases, secrets, or external services.
- Editing worklogs, quality baselines, `.env*`, `.github/workflows/*`, lockfiles.
- Installing/removing dependencies.
- Writing outside the repo or outside §4.
- <project- and task-specific bans>

## 6. Verify (run these, in this order)

```bash
<project verify command>    # expect: <exact output>
```

<Expected outputs stated exactly. If a check can't pass for a pre-existing reason, say so
here so the executor doesn't chase it.>

## 7. Report (your final message MUST contain)

- `CHANGED:` list of files actually modified/created.
- `VERIFY:` each §6 command with its actual output.
- `DEVIATIONS:` anything done differently from §3 and why (should be empty).
- `NOTES:` observations for the orchestrator (optional).
- Last line: exactly `DONE` or `BLOCKED: <one-line reason>`.

## 8. If blocked

Stop at the first obstacle this brief doesn't cover. Report `BLOCKED:` with what you
found. Do NOT work around rules, do NOT widen the blast radius, do NOT guess.
