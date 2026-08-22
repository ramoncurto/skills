#!/usr/bin/env bash
# Source-fetch with a Googlebot user agent. This is not Google's rendered view.
set -euo pipefail
usage() { echo "usage: fetch-as-googlebot.sh <https-base-url> <out-dir> <absolute-path>..." >&2; exit 1; }
[[ "$#" -ge 3 ]] || usage
BASE="$1"; OUT="$2"; shift 2
[[ "$BASE" =~ ^https?://[^[:space:]]+$ ]] || { echo "ERROR: base must be an absolute http(s) URL" >&2; exit 1; }
mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"
UA='Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
for path in "$@"; do
  [[ "$path" == /* && "$path" != *$'\n'* && "$path" != *'..'* ]] || { echo "ERROR: path must be a safe absolute URL path: $path" >&2; exit 1; }
  name="${path#/}"; name="${name//\//_}"; name="${name:-root}"; name="${name//[^A-Za-z0-9._-]/_}"
  hash="$(printf '%s' "$path" | shasum -a 256 | cut -c1-12)"; name="${name}-${hash}"
  body="$OUT/$name.html"; headers="$OUT/$name.headers"; status="$OUT/$name.status"
  rm -f "$body" "$headers" "$status"
  code="$(curl -sS -L --compressed --connect-timeout 10 --max-time 30 --retry 2 --retry-all-errors -A "$UA" -D "$headers" -o "$body" -w '%{http_code}' "${BASE%/}$path")" || { rm -f "$body" "$headers" "$status"; echo "ERROR: source fetch failed for $path" >&2; exit 2; }
  [[ "$code" =~ ^2[0-9][0-9]$ ]] || { rm -f "$body" "$headers" "$status"; echo "ERROR: source fetch returned HTTP $code for $path" >&2; exit 2; }
  printf '%s\n' "$code" > "$status"; printf '%s -> HTTP %s (source fetch with Googlebot UA; not Google-rendered)\n' "$path" "$code"
done
