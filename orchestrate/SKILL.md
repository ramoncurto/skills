---
name: orchestrate
description: Multi-model orchestration — the session model (Fable) is head of coding, makes every decision and writes super-detailed briefs; Opus 4.8 (claude -p) and GPT-5.6 Terra (codex exec) execute them as CLI subagents with blast-radius control. Use when the user says orchestrate, delegate to opus/gpt, dispatch a brief, run it through the pipeline, multi-model workflow, or hands over a multi-file/mechanical task worth delegating (/orchestrate).
---

# Orchestrate — Fable decides, Opus 4.8 + GPT-5.6 Terra execute

## When to use
Implementation work worth delegating: 3+ files, mechanical sweeps, parallel disjoint
workstreams, test authoring, or >~15 min of typing. NOT for few-line ≤2-file edits —
there the brief costs more than the work; do those directly. Reviews: route any
non-trivial diff to the model that did NOT write it.

## Steps
1. **Bootstrap (once per repo).** If `scripts/agents/dispatch.sh` exists, skip. Else copy
   `dispatch.sh`, `new-brief.sh`, `brief-template.md`, `review-template.md` from this
   skill's directory into `<repo>/scripts/agents/`, `chmod +x` the two scripts, add
   `.agents/` to `.gitignore`. Verify CLIs: `claude -p "Reply OK" --model claude-opus-4-8`
   and `codex exec -m gpt-5.6-terra -s read-only --skip-git-repo-check "Reply OK"`. Identify the
   project's verify gate (package.json `check`/`test`, Makefile) — briefs must cite it.
   Set project-specific forbidden paths via `ORCH_FORBIDDEN_EXTRA` (regex) if the repo has
   worklogs/baselines subagents must never touch.
2. **Scope it yourself first.** Read the code, find the root cause, make every decision:
   files, names, patterns, exact edits. Snapshot `git status`/`git diff` of target files
   if the worktree is shared.
3. **Write the brief.** `bash scripts/agents/new-brief.sh <slug>` then fill all 8
   sections. The bar is the **no-decisions test**: if the executor would face a choice
   anywhere, the brief is incomplete. Paste current-state excerpts; list the exhaustive
   blast radius; state verify commands with expected outputs; warn task-relevant
   landmines (CRLF, i18n locales, sandbox limits).
4. **Dispatch.** `bash scripts/agents/dispatch.sh <opus|gpt> <brief>` — `--read-only`
   for reviews, `--yolo` (opus) only when arbitrary commands are truly needed. Routing:
   house-pattern product code → opus; mechanical/parallel/tests → gpt. Long runs →
   background, monitor `.agents/runs/*.log`. One writer at a time unless blast radii are
   provably disjoint. Note: codex cannot write gitignored dirs like `.agents/`.
5. **Accept like an auditor.** Read the diff yourself (never trust the report). Touched
   files ⊆ blast radius — the dispatcher's delta + `⚠ FORBIDDEN` sentinel flag
   violations. Run the project gate and check the REAL exit code (piping to `tail` eats
   it). Shared worktree: isolate the run's changes by diffing before/after patch
   snapshots. Reject → fix-forward brief with the exact failure pasted, or surgical
   `git checkout -- <files>` of only the run's files.
6. **Record.** Update the project's worklog per its conventions; the orchestrator — never
   a subagent — owns logs, commits, migrations.

## Done when
The brief-driven change is merged into the worktree with: executor report `DONE`,
delta ⊆ blast radius, orchestrator-run gate green on real exit codes, and the outcome
recorded. A run ending `BLOCKED` is done only when its blocker is resolved or escalated
to the user.
