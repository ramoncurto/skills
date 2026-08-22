#!/usr/bin/env bash
# fetch-as-googlebot.sh <base-url> <out-dir> <path>... — fetch pages with a Googlebot UA (gz + raw), print code/size/cache headers.
# Then: node measure-page.mjs <out-dir>/<file>.html  → bytes, RSC flight share, class share, visible text, headings, landmarks, JSON-LD validity.
set -euo pipefail
BASE="$1"; OUT="$2"; shift 2; mkdir -p "$OUT"
UA='Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
for p in "$@"; do
  f="$OUT/$(echo "$p" | sed 's#^/##; s#/#_#g; s#^$#root#').html"
  curl -sL --compressed -A "$UA" -o "$f" -w "$p -> %{http_code} %{size_download}B gz %{time_total}s cache=%header{x-vercel-cache}/%header{cf-cache-status} redirect=%{redirect_url}\n" "$BASE/$p"
done
