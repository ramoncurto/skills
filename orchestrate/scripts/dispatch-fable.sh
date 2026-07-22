#!/usr/bin/env bash
# Run Fable 5 headlessly against a no-decisions brief, with logging and a delta report.
# Usage: dispatch-fable.sh <brief-file> [--account <name>] [--read-only] [--yolo]

set -euo pipefail

BRIEF="${1:-}"
shift || true

READ_ONLY=false
YOLO=false
FABLE_MODEL="${ORCH_FABLE_MODEL:-claude-fable-5}"
FABLE_EFFORT="${ORCH_FABLE_EFFORT:-high}"
ACCOUNT="${ORCH_FABLE_ACCOUNT:-auto}"
PROFILES_FILE="${ORCH_FABLE_PROFILES_FILE:-$HOME/.claude-accounts/profiles}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --read-only) READ_ONLY=true; shift ;;
    --yolo) YOLO=true; shift ;;
    --account) ACCOUNT="${2:?--account needs a profile name or current}"; shift 2 ;;
    --effort) FABLE_EFFORT="${2:?--effort needs low, medium, high, xhigh, or max}"; shift 2 ;;
    *) echo "Unknown flag: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$BRIEF" ]]; then
  echo "Usage: bash scripts/agents/dispatch-fable.sh <brief-file> [--account <name>] [--read-only] [--yolo] [--effort <level>]" >&2
  exit 2
fi
if [[ ! -f "$BRIEF" ]]; then
  echo "Brief not found: $BRIEF" >&2
  exit 2
fi
if [[ "$READ_ONLY" == true && "$YOLO" == true ]]; then
  echo "--read-only and --yolo are mutually exclusive" >&2
  exit 2
fi
case "$FABLE_EFFORT" in
  low|medium|high|xhigh|max) ;;
  *) echo "Invalid Fable effort: $FABLE_EFFORT" >&2; exit 2 ;;
esac

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
STATE_FILE="${ORCH_FABLE_ACCOUNT_STATE_FILE:-$ROOT/.agents/fable-account-next}"

PROFILE_NAMES=()
PROFILE_DIRS=()
if [[ -f "$PROFILES_FILE" ]]; then
  while IFS='=' read -r NAME DIR; do
    [[ -z "$NAME" || "$NAME" == \#* ]] && continue
    PROFILE_NAMES+=("$NAME")
    PROFILE_DIRS+=("$DIR")
  done < "$PROFILES_FILE"
fi

ATTEMPT_NAMES=()
ATTEMPT_DIRS=()
AUTO_MODE=false

append_profile_cycle() {
  local START="$1"
  local OFFSET INDEX
  for ((OFFSET=0; OFFSET<${#PROFILE_NAMES[@]}; OFFSET++)); do
    INDEX=$(((START + OFFSET) % ${#PROFILE_NAMES[@]}))
    [[ -d "${PROFILE_DIRS[$INDEX]}" ]] || continue
    ATTEMPT_NAMES+=("${PROFILE_NAMES[$INDEX]}")
    ATTEMPT_DIRS+=("${PROFILE_DIRS[$INDEX]}")
  done
}

if [[ "$ACCOUNT" == "auto" && "${#PROFILE_NAMES[@]}" -eq 0 ]]; then
  ATTEMPT_NAMES+=("current")
  ATTEMPT_DIRS+=("${CLAUDE_CONFIG_DIR:-}")
elif [[ "$ACCOUNT" == "auto" ]]; then
  AUTO_MODE=true
  START_INDEX=0
  if [[ -f "$STATE_FILE" ]]; then
    SAVED_INDEX="$(tr -d '[:space:]' < "$STATE_FILE")"
    if [[ "$SAVED_INDEX" =~ ^[0-9]+$ ]] && [[ "$SAVED_INDEX" -lt "${#PROFILE_NAMES[@]}" ]]; then
      START_INDEX="$SAVED_INDEX"
    fi
  fi
  append_profile_cycle "$START_INDEX"
  if [[ "${#ATTEMPT_NAMES[@]}" -eq 0 ]]; then
    echo "No usable Fable account profiles in: $PROFILES_FILE" >&2
    exit 2
  fi
elif [[ "$ACCOUNT" != "current" ]]; then
  if [[ "${#PROFILE_NAMES[@]}" -eq 0 ]]; then
    echo "Fable profiles file not found: $PROFILES_FILE" >&2
    exit 2
  fi
  START_INDEX=-1
  for ((I=0; I<${#PROFILE_NAMES[@]}; I++)); do
    if [[ "${PROFILE_NAMES[$I]}" == "$ACCOUNT" ]]; then
      START_INDEX=$I
      break
    fi
  done
  if [[ "$START_INDEX" -lt 0 ]]; then
    echo "Unknown or missing Fable account profile: $ACCOUNT" >&2
    exit 2
  fi
  if [[ ! -d "${PROFILE_DIRS[$START_INDEX]}" ]]; then
    echo "Unknown or missing Fable account profile: $ACCOUNT" >&2
    exit 2
  fi
  append_profile_cycle "$START_INDEX"
else
  ATTEMPT_NAMES+=("current")
  ATTEMPT_DIRS+=("${CLAUDE_CONFIG_DIR:-}")
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
STEM="$(basename "$BRIEF" .md)"
RUN_DIR="$ROOT/.agents/runs"
mkdir -p "$RUN_DIR"
LOG="$RUN_DIR/$STAMP-fable-$STEM.log"
LAST="$RUN_DIR/$STAMP-fable-$STEM.last.md"
BEFORE="$(git status --porcelain -uall)"

{
  echo "── dispatch $STAMP ── agent=fable account=$ACCOUNT model=$FABLE_MODEL effort=$FABLE_EFFORT read_only=$READ_ONLY yolo=$YOLO"
  echo
} | tee "$LOG"

ARGS=(-p --model "$FABLE_MODEL" --effort "$FABLE_EFFORT")
if [[ "$YOLO" == true ]]; then
  ARGS+=(--dangerously-skip-permissions)
elif [[ "$READ_ONLY" == true ]]; then
  ARGS+=(--allowedTools "Read" "Glob" "Grep"
    "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)" "Bash(ls:*)")
else
  ARGS+=(--permission-mode acceptEdits --allowedTools
    "Read" "Glob" "Grep" "Edit" "Write" "MultiEdit"
    "Bash(npx tsc:*)" "Bash(npx jest:*)" "Bash(npm run:*)" "Bash(node:*)"
    "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)" "Bash(ls:*)"
    "Bash(grep:*)" "Bash(find:*)")
fi

worktree_fingerprint() {
  {
    git status --porcelain=v1 -z -uall
    git diff --no-ext-diff --binary
    git diff --cached --no-ext-diff --binary
    while IFS= read -r -d '' PATHNAME; do
      printf '%s\0' "$PATHNAME"
      git hash-object -- "$PATHNAME"
    done < <(git ls-files --others --exclude-standard -z)
  } | git hash-object --stdin
}

set_auto_account() {
  local TARGET="$1"
  local I
  [[ "$AUTO_MODE" == true ]] || return 0
  for ((I=0; I<${#PROFILE_NAMES[@]}; I++)); do
    if [[ "${PROFILE_NAMES[$I]}" == "$TARGET" ]]; then
      printf '%s\n' "$I" > "$STATE_FILE"
      return 0
    fi
  done
}

STATUS=0
ATTEMPT_OUTPUT="$RUN_DIR/.$STAMP-fable-$STEM.attempt.tmp"
trap 'rm -f "$ATTEMPT_OUTPUT"' EXIT
QUOTA_RE="${ORCH_FABLE_QUOTA_RE:-hit your (session|weekly|Opus) limit}"

for ((ATTEMPT=0; ATTEMPT<${#ATTEMPT_NAMES[@]}; ATTEMPT++)); do
  ATTEMPT_NAME="${ATTEMPT_NAMES[$ATTEMPT]}"
  CONFIG_DIR="${ATTEMPT_DIRS[$ATTEMPT]}"
  : > "$ATTEMPT_OUTPUT"
  echo "── account attempt=$((ATTEMPT + 1))/${#ATTEMPT_NAMES[@]} name=$ATTEMPT_NAME ──" | tee -a "$LOG"
  ATTEMPT_BEFORE="$(worktree_fingerprint)"

  set +e
  if [[ "$ATTEMPT_NAME" != "current" ]]; then
    (
      unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN
      export CLAUDE_CONFIG_DIR="$CONFIG_DIR"
      claude "${ARGS[@]}" < "$BRIEF"
    ) 2>&1 | tee -a "$LOG" "$ATTEMPT_OUTPUT"
    STATUS=${PIPESTATUS[0]}
  elif [[ -n "$CONFIG_DIR" ]]; then
    CLAUDE_CONFIG_DIR="$CONFIG_DIR" claude "${ARGS[@]}" < "$BRIEF" 2>&1 \
      | tee -a "$LOG" "$ATTEMPT_OUTPUT"
    STATUS=${PIPESTATUS[0]}
  else
    claude "${ARGS[@]}" < "$BRIEF" 2>&1 | tee -a "$LOG" "$ATTEMPT_OUTPUT"
    STATUS=${PIPESTATUS[0]}
  fi
  set -e
  ATTEMPT_AFTER="$(worktree_fingerprint)"

  cp "$ATTEMPT_OUTPUT" "$LAST"
  if [[ "$STATUS" -eq 0 ]]; then
    set_auto_account "$ATTEMPT_NAME"
    break
  fi
  if grep -Eiq "$QUOTA_RE" "$ATTEMPT_OUTPUT" \
      && ! grep -Fqi "not your usage limit" "$ATTEMPT_OUTPUT" \
      && [[ "$((ATTEMPT + 1))" -lt "${#ATTEMPT_NAMES[@]}" ]]; then
    if [[ "$ATTEMPT_BEFORE" != "$ATTEMPT_AFTER" ]]; then
      echo "── quota hit after partial worktree changes; refusing automatic account fallback ──" \
        | tee -a "$LOG"
      break
    fi
    set_auto_account "${ATTEMPT_NAMES[$((ATTEMPT + 1))]}"
    echo "── account quota exhausted: $ATTEMPT_NAME; trying account=${ATTEMPT_NAMES[$((ATTEMPT + 1))]} ──" \
      | tee -a "$LOG"
    continue
  fi
  break
done

AFTER="$(git status --porcelain -uall)"
FORBIDDEN_RE='\.env|\.github/workflows/|package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|go\.sum'
if [[ -n "${ORCH_FORBIDDEN_EXTRA:-}" ]]; then
  FORBIDDEN_RE="$FORBIDDEN_RE|$ORCH_FORBIDDEN_EXTRA"
fi

DELTA=""
if [[ "$BEFORE" != "$AFTER" ]]; then
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
      echo "⚠⚠ FORBIDDEN PATH TOUCHED — reject this run and revert only its files ⚠⚠"
    fi
  fi
  echo "── exit=$STATUS log=$LOG last=$LAST ──"
} | tee -a "$LOG"

exit "$STATUS"
