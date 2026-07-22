---
name: orchestrate
summary: "Split coding work between AI models — one directs, the others execute, and you stay in control."
description: Multi-model orchestration with explicit roles — say who directs and who executes (e.g. "/orchestrate fable→opus", "/orchestrate gpt→fable", "opus executes", "gpt orchestrates and fable executes"). The director owns every decision, writes no-decisions briefs, audits diffs, runs the gate, and commits; executors (claude -p / codex exec) implement briefs with blast-radius control. Use when the user says orchestrate, delegate to opus/gpt/fable, dispatch a brief, multi-model workflow, rotate accounts, or hands over a multi-file/mechanical task (formerly orchestrate + orchestrate-fable) (/orchestrate).
---

# Orchestrate — director decides, executors implement

## Roles — declared at invocation
The invocation names **who directs** and **who executes**: `/orchestrate fable→opus`,
`/orchestrate gpt→fable`, or prose ("gpt orchestrates, fable executes"). Defaults when
unstated: the **active session model directs** and never executes; pick the executor by
routing (step 4). The two proven configurations:

| Direction | Director (active session) | Executors | Dispatcher |
|---|---|---|---|
| `fable→opus/gpt` | Claude Fable 5 | Opus 4.8 (`claude -p`), GPT-5.6 Terra (`codex exec`) | `dispatch.sh <opus\|gpt> <brief>` (brief via `new-brief.sh`) |
| `gpt→fable` | Codex/GPT session | Claude Fable 5 (`claude -p --model claude-fable-5`, profile rotation) | `dispatch-fable.sh <brief>` (brief via `new-fable-brief.sh`) |

Invariants in every configuration: the director owns all judgment, briefs, acceptance,
worklogs, commits, and migrations; executors never decide, never commit; cross-review goes
to a model that did NOT write the change.

## When to use
Implementation worth delegating: 3+ files, mechanical sweeps, parallel disjoint workstreams,
test authoring, or >~15 min of typing. NOT for few-line ≤2-file edits — there the brief costs
more than the work. Reviews: route any non-trivial diff to a non-author model, `--read-only`.

## Steps
1. **Bootstrap (once per repo).** If the dispatcher for your direction exists in
   `scripts/agents/`, skip. Else copy from this skill's directory: `fable→opus/gpt` uses the
   top-level `dispatch.sh`, `new-brief.sh`, `brief-template.md`, `review-template.md`;
   `gpt→fable` uses `scripts/*.sh` + `assets/*.md` (dispatch-fable / new-fable-brief).
   `chmod +x` the scripts; add `.agents/` to `.gitignore`. Verify the executor CLIs
   (`claude -p "Reply OK" --model <model>`; `codex exec -m gpt-5.6-terra -s read-only
   --skip-git-repo-check "Reply OK"`). Identify the project's verify gate (package.json
   `check`/`test`, Makefile) — briefs must cite it. Set `ORCH_FORBIDDEN_EXTRA` (regex) for
   repo-specific protected paths (worklogs, baselines).
   For `gpt→fable` quota rotation: keep profiles in `$HOME/.claude-accounts/profiles`
   (`alias=/abs/config/path` lines), each authenticated interactively via
   `CLAUDE_CONFIG_DIR=<path> claude auth login --claudeai`; never store tokens or emails
   in the skill or repo.
2. **Scope it yourself first.** Read the code, find the root cause, make every decision:
   files, names, patterns, exact edits, tests. Snapshot `git status`/target-file diffs if the
   worktree is shared.
3. **Write the brief.** `new-brief.sh <slug>` or `new-fable-brief.sh <slug>` per direction;
   fill all 8 sections. The bar is the **no-decisions test**: if the executor would face a
   choice anywhere, the brief is incomplete. Paste current-state excerpts; list the exhaustive
   blast radius; state verify commands with expected outputs; warn task-relevant landmines
   (CRLF, i18n locales, sandbox limits).
4. **Dispatch.** `fable→opus/gpt`: route house-pattern product code → opus, mechanical/
   parallel/tests → gpt; `--read-only` for reviews, `--yolo` only when arbitrary commands are
   truly needed; codex cannot write gitignored dirs like `.agents/`. `gpt→fable`: account
   `auto` stays on its profile until quota exhaustion; on an official plan-quota error,
   advance to the next profile and retry only if the Git-visible worktree is unchanged —
   otherwise stop and audit. All directions: one writer at a time unless blast radii are
   provably disjoint; long runs → background, monitor `.agents/runs/*.log`.
5. **Accept like an auditor.** Read the diff yourself (never trust the report). Touched
   files ⊆ blast radius — the dispatcher's delta + `⚠ FORBIDDEN` sentinel flag violations.
   Run the project gate and check the REAL exit code (piping to `tail` eats it). Shared
   worktree: isolate the run's changes by diffing before/after snapshots. Reject →
   fix-forward brief with the exact failure pasted, or surgical `git checkout -- <files>`
   of only the run's files.
6. **Record.** The director — never an executor — updates the worklog per project
   conventions and owns commits and migrations.

## Done when
The brief-driven change is merged into the worktree with: executor report `DONE`, delta ⊆
blast radius, director-run gate green on real exit codes, and the outcome recorded. A run
ending `BLOCKED` is done only when its blocker is resolved or escalated to the user.
