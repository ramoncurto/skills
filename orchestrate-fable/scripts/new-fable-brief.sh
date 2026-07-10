#!/usr/bin/env bash
# Scaffold a task or review brief for the Fable executor.
# Usage: new-fable-brief.sh <slug> [--review] [--id Tnnn]

set -euo pipefail

SLUG="${1:?usage: new-fable-brief.sh <slug> [--review] [--id Tnnn]}"
shift || true

if [[ ! "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "Slug must use lowercase letters, digits, and hyphens" >&2
  exit 2
fi

KIND="task"
ID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --review) KIND="review"; shift ;;
    --id) ID="${2:?--id needs a value like T042}"; shift 2 ;;
    *) echo "Unknown flag: $1" >&2; exit 2 ;;
  esac
done

if [[ -n "$ID" && ! "$ID" =~ ^T[0-9]{3}$ ]]; then
  echo "ID must match Tnnn, for example T042" >&2
  exit 2
fi

ROOT="$(git rev-parse --show-toplevel)"
BRIEFS="$ROOT/.agents/briefs"
mkdir -p "$BRIEFS"

if [[ -z "$ID" ]]; then
  LAST="$(find "$BRIEFS" -maxdepth 1 -type f -exec basename {} \; 2>/dev/null | sed -nE 's/^T([0-9]{3}).*/\1/p' | sort -n | tail -1)"
  LAST="${LAST:-0}"
  ID="$(printf 'T%03d' $((10#$LAST + 1)))"
fi

TEMPLATE="$ROOT/scripts/agents/fable-brief-template.md"
SUFFIX=""
if [[ "$KIND" == "review" ]]; then
  TEMPLATE="$ROOT/scripts/agents/fable-review-template.md"
  SUFFIX="-review"
fi
if [[ ! -f "$TEMPLATE" ]]; then
  echo "Template not found: $TEMPLATE" >&2
  exit 2
fi

DEST="$BRIEFS/$ID-$SLUG$SUFFIX.md"
if [[ -e "$DEST" ]]; then
  echo "Already exists: $DEST" >&2
  exit 1
fi

sed "s/T<nnn>/$ID/g; s/<slug>/$SLUG/g" "$TEMPLATE" > "$DEST"
echo "$DEST"
