#!/usr/bin/env bash
# scripts/book-loop/capture-eval/run-eval.sh
# Tasker 95 capture eval on the frozen book-loop fixture. Paid unless --dry (≈1¢/run):
# ask DJ before every paid run.
set -euo pipefail
root="$(cd "$(dirname "$0")/../../.." && pwd)"
set -a; source "$root/.env.agentic-gate.local"; set +a
cd "$root/apps/worker" && node --import tsx "$root/scripts/book-loop/capture-eval/run-eval.mts" "$@"
