#!/usr/bin/env bash
# scripts/book-loop/restart.sh
# Book dogfood loop: (re)start local web :5188 + worker :5189 on the isolated QA database.
# Pass --reset to re-copy the book project from production first.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$root"
for port in 5188 5189; do
  for pid in $(lsof -tiTCP:$port -sTCP:LISTEN 2>/dev/null); do
    kill -TERM -"$(ps -o pgid= "$pid" | tr -d ' ')" 2>/dev/null || kill "$pid" 2>/dev/null || true
  done
done
sleep 2
[[ "${1:-}" == "--reset" ]] && AGENTIC_GATE_ENV_FILE=.env.agentic-gate.local node --import tsx scripts/book-loop/clone-book.mts
mkdir -p output/book-loop/services
WORKFLOW_PROTOTYPE_OUTPUT_DIR=output/book-loop/services AGENTIC_GATE_ENV_FILE=.env.agentic-gate.local \
  nohup pnpm agentic:workflow > output/book-loop/services/runner.log 2>&1 &
for _ in $(seq 1 60); do
  grep -q "ready" output/book-loop/services/runner.log 2>/dev/null && { echo "services ready"; exit 0; }
  grep -qi "failed\|refusing\|error" output/book-loop/services/runner.log 2>/dev/null && break
  sleep 3
done
cat output/book-loop/services/runner.log; exit 1
