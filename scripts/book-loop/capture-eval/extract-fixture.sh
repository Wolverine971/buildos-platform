#!/usr/bin/env bash
# scripts/book-loop/capture-eval/extract-fixture.sh
# Freeze the book project + book-loop sessions from the isolated QA db (read-only).
set -euo pipefail
root="$(cd "$(dirname "$0")/../../.." && pwd)"
set -a; source "$root/.env.agentic-gate.local"; set +a
mkdir -p "$root/scripts/book-loop/capture-eval/fixtures"
out="${1:-$root/scripts/book-loop/capture-eval/fixtures/book-loop.json}"
cd "$root/apps/worker" && node --import tsx "$root/scripts/book-loop/capture-eval/extract-fixture.mts" "$out"
