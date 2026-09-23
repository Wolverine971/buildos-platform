#!/usr/bin/env bash
# scripts/book-loop/turn.sh
# Book dogfood loop: send one message to the cloned book project on the local stack.
# Prereq: `AGENTIC_GATE_ENV_FILE=.env.agentic-gate.local pnpm agentic:workflow` running (web :5188, worker :5189).
# Usage: scripts/book-loop/turn.sh <turn-name> "<message>" [session-id]
# Capture runs like prod (scripts/book-loop/checkpoint.sh): a new chat first captures earlier
# chats as idle (time passed between sittings); every turn is followed by the threshold check.
# BOOK_LOOP_NO_CAPTURE=1 skips both.
# BOOK_LOOP_TARGET=prod drives DJ's real project on build-os.com (prod capture sweep does the notes).
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
name="$1"; message="$2"; session="${3:-}"
out="$root/output/book-loop/$name.json"
if [[ "${BOOK_LOOP_TARGET:-}" == "prod" ]]; then
  # DJ's real account on build-os.com; credentials live in a comment at the end of the root .env.
  read -r BOOK_LOOP_EMAIL BOOK_LOOP_PASSWORD < <(grep -A1 '^# dj buildos pass' "$root/.env" | tail -1 | sed 's/^#[[:space:]]*//')
  export AGENTIC_TEST_USER_EMAIL="$BOOK_LOOP_EMAIL" AGENTIC_TEST_USER_PASSWORD="$BOOK_LOOP_PASSWORD"
  export AGENTIC_E2E_BASE_URL="https://build-os.com" BOOK_LOOP_NO_CAPTURE=1
  export BOOK_LOOP_PROD_CONFIRM="${BOOK_LOOP_PROJECT_ID:-445dd429-db93-4878-90a9-b3ab1627a9f2}"
else
  set -a; source "$root/.env.agentic-gate.local"; set +a
fi
export BOOK_LOOP=true BOOK_LOOP_MESSAGE="$message" BOOK_LOOP_SESSION_ID="$session" BOOK_LOOP_OUT="$out"
export BOOK_LOOP_PROJECT_ID="${BOOK_LOOP_PROJECT_ID:-445dd429-db93-4878-90a9-b3ab1627a9f2}"
export AGENTIC_E2E_BASE_URL="${AGENTIC_E2E_BASE_URL:-http://127.0.0.1:5188}"
cd "$root"
capture() { [[ -n "${BOOK_LOOP_NO_CAPTURE:-}" ]] || "$root/scripts/book-loop/checkpoint.sh" "$@"; }
[[ -z "$session" ]] && capture --idle
test-gate run pnpm --filter @buildos/web exec vitest run --config vitest.config.agentic.ts \
  src/lib/tests/agentic-e2e/book-loop.live.test.ts --retry=0
capture
echo "wrote $out"
