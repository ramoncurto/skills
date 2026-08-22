#!/usr/bin/env bash
# Fail closed when a changed cache window is shortened or crawlable content is force-dynamic.
set -euo pipefail
BASE_REF="${1:-origin/main}"; SRC="${2:-src}"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "ERROR: not a git worktree" >&2; exit 1; }
cd "$ROOT"
git rev-parse --verify --quiet "${BASE_REF}^{commit}" >/dev/null || { echo "ERROR: base ref does not exist: $BASE_REF" >&2; exit 3; }
[[ -d "$SRC" ]] || { echo "ERROR: source directory does not exist: $SRC" >&2; exit 1; }
fail=0
values_from_file() { grep -Eho 'export[[:space:]]+const[[:space:]]+revalidate[[:space:]]*=[[:space:]]*[0-9]+|revalidate[[:space:]]*:[[:space:]]*[0-9]+' "$1" 2>/dev/null | grep -Eo '[0-9]+$' | sort -n || true; }
values_from_ref() { git show "${BASE_REF}:$1" 2>/dev/null | grep -Eho 'export[[:space:]]+const[[:space:]]+revalidate[[:space:]]*=[[:space:]]*[0-9]+|revalidate[[:space:]]*:[[:space:]]*[0-9]+' | grep -Eo '[0-9]+$' | sort -n || true; }
compare_windows() {
  local previous_path="$1" current_path="$2" label="$3"
  case "$previous_path" in "$SRC"/*.ts|"$SRC"/*.tsx) ;; *) return ;; esac
  current=(); previous=()
  [[ -n "$current_path" && -f "$current_path" ]] && while IFS= read -r value; do [[ -n "$value" ]] && current+=("$value"); done < <(values_from_file "$current_path")
  while IFS= read -r value; do [[ -n "$value" ]] && previous+=("$value"); done < <(values_from_ref "$previous_path")
  [[ "${#previous[@]}" -eq 0 ]] && return
  if [[ "${#current[@]}" -ne "${#previous[@]}" ]]; then echo "SHORTENED OR LOST DECLARATION: $label tree=${#current[@]} $BASE_REF=${#previous[@]}"; fail=1; return; fi
  for ((i=0; i<${#previous[@]}; i++)); do
    if (( current[i] < previous[i] )); then echo "SHORTENED: $label value[$i]=${current[i]} $BASE_REF=${previous[i]}"; fail=1; fi
  done
}
while IFS= read -r -d '' status; do
  kind="${status:0:1}"
  case "$kind" in
    R|C) IFS= read -r -d '' old; IFS= read -r -d '' new; compare_windows "$old" "$new" "$old -> $new" ;;
    M|T) IFS= read -r -d '' path; compare_windows "$path" "$path" "$path" ;;
    D) IFS= read -r -d '' old; compare_windows "$old" "" "$old (deleted)" ;;
    A) IFS= read -r -d '' new ;;
    *) IFS= read -r -d '' path; compare_windows "$path" "$path" "$path" ;;
  esac
done < <(git diff --name-status -z -M "$BASE_REF" -- "$SRC")
if [[ -d "$SRC/app" ]]; then
  while IFS= read -r -d '' page; do
    if grep -Eq "export[[:space:]]+const[[:space:]]+dynamic[[:space:]]*=[[:space:]]*['\"]force-dynamic['\"]" "$page"; then
      case "/$page" in */dashboard/*|*/admin/*|*/my-*/*|*/onboarding/*|*/sign-*/*|*/auth/*|*/profile/*|*/api/*) ;; *) echo "FORCE-DYNAMIC on crawlable page: $page"; fail=1 ;; esac
    fi
  done < <(find "$SRC/app" -type f -name 'page.tsx' -print0)
fi
[[ "$fail" -eq 0 ]] && echo "OK: no changed cache window shortened vs $BASE_REF; no force-dynamic crawlable page"
[[ "$fail" -eq 0 ]] && exit 0
exit 2
