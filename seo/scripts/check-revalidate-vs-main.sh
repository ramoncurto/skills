#!/usr/bin/env bash
# check-revalidate-vs-main.sh — cache-window guard for the /seo scorecard (Next.js App Router projects).
# Fails if the working tree SHORTENS any ISR / Data-Cache window vs the base ref, or makes a crawlable page force-dynamic.
# Usage: check-revalidate-vs-main.sh [base-ref=origin/main] [src-dir=src]
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
BASE_REF="${1:-origin/main}"; SRC="${2:-src}"
PRIVATE_RE='/(dashboard|admin|my-|onboarding|sign-|auth|profile|api)/'
fail=0
files=$(grep -rlE 'export const revalidate = [0-9]+|revalidate: [0-9]+' "$SRC" --include='*.ts' --include='*.tsx' 2>/dev/null || true)
for f in $files; do
  tree_min=$(grep -hoE 'export const revalidate = [0-9]+|revalidate: [0-9]+' "$f" | grep -oE '[0-9]+$' | sort -n | head -1)
  main_min=$(git show "$BASE_REF:$f" 2>/dev/null | grep -hoE 'export const revalidate = [0-9]+|revalidate: [0-9]+' | grep -oE '[0-9]+$' | sort -n | head -1 || true)
  if [[ -n "$tree_min" && -n "$main_min" && "$tree_min" -lt "$main_min" ]]; then
    echo "SHORTENED: $f tree=$tree_min $BASE_REF=$main_min"; fail=1
  fi
done
dyn=$(grep -rlE "^export const dynamic = 'force-dynamic'" "$SRC/app" --include=page.tsx 2>/dev/null | grep -vE "$PRIVATE_RE" || true)
if [[ -n "$dyn" ]]; then echo "FORCE-DYNAMIC on crawlable page(s):"; echo "$dyn"; fail=1; fi
[[ $fail -eq 0 ]] && echo "OK: no window shortened vs $BASE_REF; no force-dynamic on crawlable pages"
exit $fail
