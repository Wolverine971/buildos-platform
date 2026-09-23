#!/usr/bin/env bash
# scripts/book-loop/capture-eval/e2e-qa.sh
# Tasker 95: free end-to-end capture check on the isolated QA db (canned model; restores state).
set -euo pipefail
root="$(cd "$(dirname "$0")/../../.." && pwd)"
set -a; source "$root/.env.agentic-gate.local"; set +a
cd "$root/apps/worker" && node --import tsx "$root/scripts/book-loop/capture-eval/e2e-qa.mts"
