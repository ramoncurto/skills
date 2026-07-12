#!/usr/bin/env bash
# dispatch.sh — run a subagent (Opus 4.8 via claude CLI, GPT-5.6 Terra via codex CLI)
# against a brief file, headless, with logging and a file-delta report.
#
# Usage:
#   bash scripts/agents/dispatch.sh <opus|gpt> <brief-file> [--read-only] [--yolo]
#
#   opus         claude -p --model $ORCH_OPUS_MODEL   (default claude-opus-4-8)
#   gpt          codex exec -m $ORCH_GPT_MODEL        (default gpt-5.6-terra)
#   --read-only  reviewer/scout mode: no write tools / read-only sandbox
#   --yolo       opus only: --dangerously-skip-permissions instead of the
#                curated allowlist (for briefs that need arbitrary commands)
#
# Env:
#   ORCH_OPUS_MODEL / ORCH_GPT_MODEL   model overrides
#   ORCH_FORBIDDEN_EXTRA               extra regex OR-ed into the forbidden-path sentinel
#                                      (project worklogs, baselines, generated files…)
#
# Output: transcript in .agents/runs/<utc>-<agent>-<brief>.log, the agent's final
# message on stdout + .last.md, and a git-porcelain file delta with a forbidden-path
# sentinel so the orchestrator can check the blast radius at a glance.

set -euo pipefail

AGENT="${1:-}"
BRIEF="${2:-}"
shift 2 || true

READ_ONLY=false
YOLO=false
for arg in "$@"; do
  case "$arg" in
    --read-only) READ_ONLY=true ;;
    --yolo) YOLO=true ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

if [[ -z "$AGENT" || -z "$BRIEF" ]]; then
  echo "Usage: bash scripts/agents/dispatch.sh <opus|gpt> <brief-file> [--read-only] [--yolo]" >&2
  exit 2
fi
if [[ ! -f "$BRIEF" ]]; then
  echo "Brief not found: $BRIEF" >&2
  exit 2
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

OPUS_MODEL="${ORCH_OPUS_MODEL:-claude-opus-4-8}"
GPT_MODEL="${ORCH_GPT_MODEL:-gpt-5.6-terra}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
STEM="$(basename "$BRIEF" .md)"
RUN_DIR="$ROOT/.agents/runs"
mkdir -p "$RUN_DIR"
LOG="$RUN_DIR/$STAMP-$AGENT-$STEM.log"
LAST="$RUN_DIR/$STAMP-$AGENT-$STEM.last.md"

BEFORE="$(git status --porcelain -uall)"

{
  echo "── dispatch $STAMP ── agent=$AGENT brief=$BRIEF read_only=$READ_ONLY yolo=$YOLO"
  echo
} | tee "$LOG"

STATUS=0
case "$AGENT" in
  opus)
    CLAUDE_ARGS=(-p --model "$OPUS_MODEL")
    if [[ "$YOLO" == true ]]; then
      CLAUDE_ARGS+=(--dangerously-skip-permissions)
    elif [[ "$READ_ONLY" == true ]]; then
      CLAUDE_ARGS+=(--allowedTools "Read" "Glob" "Grep" \
        "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)" "Bash(ls:*)")
    else
      CLAUDE_ARGS+=(--permission-mode acceptEdits --allowedTools \
        "Read" "Glob" "Grep" "Edit" "Write" "MultiEdit" \
        "Bash(npx tsc:*)" "Bash(npx jest:*)" "Bash(npm run:*)" "Bash(node:*)" \
        "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)" "Bash(ls:*)" \
        "Bash(grep:*)" "Bash(find:*)")
    fi
    claude "${CLAUDE_ARGS[@]}" < "$BRIEF" 2>&1 | tee -a "$LOG" || STATUS=$?
    # claude -p prints only the final message; the log IS the last message too.
    tail -n +3 "$LOG" > "$LAST" || true
    ;;
  gpt)
    SANDBOX="workspace-write"
    [[ "$READ_ONLY" == true ]] && SANDBOX="read-only"
    codex exec -m "$GPT_MODEL" -s "$SANDBOX" -C "$ROOT" \
      -o "$LAST" --color never - < "$BRIEF" 2>&1 | tee -a "$LOG" || STATUS=$?
    ;;
  *)
    echo "Unknown agent: $AGENT (use opus|gpt)" >&2
    exit 2
    ;;
esac

AFTER="$(git status --porcelain -uall)"

# Paths a subagent may never touch. Universal set + optional project extras.
FORBIDDEN_RE='\.env|\.github/workflows/|package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|go\.sum'
if [[ -n "${ORCH_FORBIDDEN_EXTRA:-}" ]]; then
  FORBIDDEN_RE="$FORBIDDEN_RE|$ORCH_FORBIDDEN_EXTRA"
fi

DELTA=""
if [[ "$BEFORE" != "$AFTER" ]]; then
  # Lines present now that weren't there before the run.
  DELTA="$(comm -13 <(sort <<<"$BEFORE") <(sort <<<"$AFTER") || true)"
fi

{
  echo
  echo "── file delta (vs. dispatch start) ──"
  if [[ -z "$DELTA" ]]; then
    echo "(no new changes in worktree)"
  else
    echo "$DELTA"
    if grep -qE "$FORBIDDEN_RE" <<<"$DELTA"; then
      echo "⚠⚠ FORBIDDEN PATH TOUCHED — reject this run and revert those files ⚠⚠"
    fi
  fi
  echo "── exit=$STATUS log=$LOG last=$LAST ──"
} | tee -a "$LOG"

exit "$STATUS"
