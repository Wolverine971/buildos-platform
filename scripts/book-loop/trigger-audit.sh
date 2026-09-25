#!/usr/bin/env bash
# scripts/book-loop/trigger-audit.sh
# Book loop: run the Project Loop (audit) on DJ's real book project by hand, as DJ, via the API.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
project="${BOOK_LOOP_PROJECT_ID:-445dd429-db93-4878-90a9-b3ab1627a9f2}"
read -r email password < <(grep -A1 '^# dj buildos pass' "$root/.env" | tail -1 | sed 's/^#[[:space:]]*//')
jar="$(mktemp)"; trap 'rm -f "$jar"' EXIT
python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2]}))' "$email" "$password" \
  | curl -s -c "$jar" -H 'Content-Type: application/json' --data @- https://build-os.com/api/auth/login -o /dev/null -w "login %{http_code}\n"
curl -s -b "$jar" -X POST "https://build-os.com/api/onto/projects/$project/loops"; echo
