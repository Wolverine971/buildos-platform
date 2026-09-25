#!/usr/bin/env bash
# scripts/book-loop/turn.sh
# Book dogfood loop: send one message to DJ's real book project on build-os.com (paid, ~2-4¢).
# Usage: BOOK_LOOP_TARGET=prod scripts/book-loop/turn.sh <turn-name> "<message>" [session-id]
# The prod capture sweep writes the notes. The local QA stack was retired on 2026-09-24
# (Tasker 104), so prod is the only target and it stays an explicit opt-in.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
name="$1"; message="$2"; session="${3:-}"
out="$root/output/book-loop/$name.json"
if [[ "${BOOK_LOOP_TARGET:-}" != "prod" ]]; then
  echo "Set BOOK_LOOP_TARGET=prod: the local QA stack was retired on 2026-09-24." >&2; exit 2
fi
# DJ's real account on build-os.com; credentials live in a comment at the end of the root .env.
read -r BOOK_LOOP_EMAIL BOOK_LOOP_PASSWORD < <(grep -A1 '^# dj buildos pass' "$root/.env" | tail -1 | sed 's/^#[[:space:]]*//')
export AGENTIC_TEST_USER_EMAIL="$BOOK_LOOP_EMAIL" AGENTIC_TEST_USER_PASSWORD="$BOOK_LOOP_PASSWORD"
export AGENTIC_E2E_BASE_URL="https://build-os.com"
export BOOK_LOOP_PROD_CONFIRM="${BOOK_LOOP_PROJECT_ID:-445dd429-db93-4878-90a9-b3ab1627a9f2}"
export BOOK_LOOP=true BOOK_LOOP_MESSAGE="$message" BOOK_LOOP_SESSION_ID="$session" BOOK_LOOP_OUT="$out"
export BOOK_LOOP_PROJECT_ID="${BOOK_LOOP_PROJECT_ID:-445dd429-db93-4878-90a9-b3ab1627a9f2}"
cd "$root"
test-gate run pnpm --filter @buildos/web exec vitest run --config vitest.config.agentic.ts \
  src/lib/tests/agentic-e2e/book-loop.live.test.ts --retry=0
echo "wrote $out"
