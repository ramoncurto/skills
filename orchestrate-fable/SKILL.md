---
name: orchestrate-fable
description: Multi-model coding orchestration where the active GPT-5.6 Sol Codex session at xhigh reasoning owns diagnosis, decisions, briefs, acceptance, and commits while Claude Fable 5 executes bounded no-decisions briefs across isolated subscription profiles with safe quota fallback. Use when the user says GPT orchestrates and Fable executes, delegate or dispatch to Fable, rotate Fable accounts, reverse orchestrate, run a GPT-to-Fable pipeline, or invokes /orchestrate-fable for substantial implementation or cross-model review (/orchestrate-fable).
---

# Orchestrate Fable — GPT decides, Fable 5 executes

## When to use
Use for implementation worth delegating: 3+ files, mechanical sweeps, test authoring,
parallel disjoint workstreams, or more than about 15 minutes of typing. Do small edits
directly. Fable writes and GPT audits; send GPT-written changes to Fable for read-only
cross-review.

## Steps
1. **Confirm the head.** Require the active Codex session to be `gpt-5.6-sol` with
   `model_reasoning_effort = "xhigh"`. Configuration is supporting evidence; active
   session metadata wins. If either differs, disclose it and do not silently substitute
   the orchestrator. Do not spawn the head with `codex exec`; the local CLI may lag the
   app's model support.
2. **Bootstrap once per repo.** If `scripts/agents/dispatch-fable.sh` is absent or lacks
   `--account`, refresh this skill's `scripts/*.sh` and `assets/*.md` into
   `scripts/agents/`, then `chmod +x` the two scripts.
   Add `.agents/` to `.gitignore`. Verify Fable with
   `claude -p "Reply OK" --model claude-fable-5 --effort high`. Find the project's real
   verification gate. Set `ORCH_FORBIDDEN_EXTRA` for project-specific protected paths.
3. **Prepare subscription profiles once.** Use `$HOME/.claude-accounts/profiles` with
   `alias=/absolute/config/path` lines. Authenticate each path interactively with
   `CLAUDE_CONFIG_DIR=<path> claude auth login --claudeai`; never store OAuth tokens,
   passwords, or account emails in the skill or repository.
4. **Decide everything first.** Read the code, identify the root cause, and settle exact
   files, names, APIs, edits, and tests. Snapshot `git status` and target-file diffs in a
   shared worktree. The GPT orchestrator owns all judgment.
5. **Write a no-decisions brief.** Run
   `bash scripts/agents/new-fable-brief.sh <slug>` and complete all eight sections.
   Paste relevant current-state excerpts, exhaustive allowed paths, exact edits, ordered
   checks with expected output, and task-specific landmines. If Fable would face a
   choice, the brief is incomplete.
6. **Dispatch.** Run `bash scripts/agents/dispatch-fable.sh <brief>`; account `auto`
   stays on its current profile until quota exhaustion. Use `--account <alias|current>`
   to select one, `--read-only` for review, and `--yolo` only for bounded arbitrary
   commands. On an official plan-quota error, make the next profile current and retry it
   only if the Git-visible worktree is unchanged; otherwise stop for GPT audit. Use one
   writer at a time.
7. **Accept as an auditor.** Read the diff and Fable's report. Require touched files to
   stay inside the brief's blast radius and reject any forbidden-path sentinel. Run the
   verification gate yourself and inspect its real exit code. On failure, issue a
   fix-forward brief with the exact evidence; revert only run-owned files when needed.
8. **Record.** The GPT orchestrator alone updates worklogs, commits, migrations, and
   user-facing status. Never delegate ownership actions to Fable.

## Done when
Fable reports `DONE`, its delta is inside the declared blast radius, GPT independently
reads the diff and gets a green verification gate, and GPT records the outcome. A
`BLOCKED` run is incomplete until GPT resolves the blocker or escalates it to the user.
