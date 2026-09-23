#!/usr/bin/env bash
# scripts/book-loop/close-chat.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
set -a; source "$root/.env.agentic-gate.local"; set +a
cd "$root/apps/worker" && node --import tsx "$root/scripts/book-loop/close-chat.mts" "$1"
