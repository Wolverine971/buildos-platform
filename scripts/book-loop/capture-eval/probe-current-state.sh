#!/usr/bin/env bash
# scripts/book-loop/capture-eval/probe-current-state.sh
# Tasker 96 Finding 10 probe (Current state vs chat claims). Paid unless --dry: ask DJ first.
set -euo pipefail
root="$(cd "$(dirname "$0")/../../.." && pwd)"
set -a; source "$root/.env.agentic-gate.local"; set +a
cd "$root/apps/worker" && node --import tsx "$root/scripts/book-loop/capture-eval/probe-current-state.mts" "$@"
