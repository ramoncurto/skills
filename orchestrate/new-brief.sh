#!/usr/bin/env bash
# new-brief.sh — scaffold the next brief in .agents/briefs/ from a template.
#
# Usage:
#   bash scripts/agents/new-brief.sh <slug>                  # task brief, next free Tnnn
#   bash scripts/agents/new-brief.sh <slug> --review         # review brief, next free Tnnn
#   bash scripts/agents/new-brief.sh <slug> --review --id T042   # review for existing task
#
# Prints the created file path. Protocol: docs/ORCHESTRATION.md.

set -euo pipefail

SLUG="${1:?usage: new-brief.sh <slug> [--review] [--id Tnnn]}"
shift || true

KIND="task"
ID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --review) KIND="review"; shift ;;
    --id) ID="${2:?--id needs a value like T042}"; shift 2 ;;
    *) echo "Unknown flag: $1" >&2; exit 2 ;;
  esac
done

ROOT="$(git rev-parse --show-toplevel)"
BRIEFS="$ROOT/.agents/briefs"
mkdir -p "$BRIEFS"

if [[ -z "$ID" ]]; then
  LAST="$(ls "$BRIEFS" 2>/dev/null | grep -oE '^T[0-9]{3}' | sort -u | tail -1 | tr -d 'T' || true)"
  LAST="${LAST:-0}"
  # Force base-10 (leading zeros would otherwise read as octal).
  ID="$(printf 'T%03d' $((10#$LAST + 1)))"
fi

TEMPLATE="$ROOT/scripts/agents/brief-template.md"
SUFFIX=""
if [[ "$KIND" == "review" ]]; then
  TEMPLATE="$ROOT/scripts/agents/review-template.md"
  SUFFIX="-review"
fi

DEST="$BRIEFS/$ID-$SLUG$SUFFIX.md"
if [[ -e "$DEST" ]]; then
  echo "Already exists: $DEST" >&2
  exit 1
fi

sed "s/T<nnn>/$ID/g; s/<slug>/$SLUG/g" "$TEMPLATE" > "$DEST"
echo "$DEST"
