<!-- AGENTS.md -->

# BuildOS Collaboration Preferences

These are repository-wide defaults unless the user asks for a different approach.

## Make the idea tangible

- Find the specific insight inside the request and keep it central.
- Take the shortest credible path to a working, inspectable artifact.
- Default to frontend-first work. When that is impractical, build the smallest useful visual or
  interactive simulation.
- Finish the requested change before considering nearby simplification. Expand scope only when it
  removes meaningful duplication, steps, or future complexity.
- Revisit boundaries and abstractions at genuine complexity inflection points; early prototype code
  may optimize for learning first.

## Communicate for fast scanning

- Keep routine updates compact and lead with what is visible, working, risky, or newly learned.
- Explain decisions at length only when they are important, subtle, or hard to reverse.
- Surface landmines early and work around them where possible.
- Handle table-stakes implementation details in the background unless they block the prototype,
  create material risk, or require a product decision.

## Treat performance as product work

- Prefer fewer API calls, round trips, repeated computations, and user steps.
- Use unconventional optimizations when the gain is meaningful and document the expected or
  measured benefit.
- Preserve clarity unless evidence justifies the tradeoff.

## Run validation without hurting the machine

This repo is developed on a 24GB laptop that usually has several agent sessions open at once.
Every vitest run pays for a ~500MB main process plus ~300-400MB per busy worker, and svelte-check,
lint, and build are in the same weight class. Unbounded fan-out freezes the machine.

- Run the narrowest target that proves the change: `pnpm --filter <pkg> exec vitest run <files>`.
  Do not run root `pnpm test:run`, `pnpm verify`, or `pnpm pre-push` from a subagent, and never
  fan out parallel subagents that each run a suite or typecheck.
- Local worker caps live in `vitest.workers.ts` (4 workers, lazy spawn; CI keeps defaults) and
  agent sessions cap further via `VITEST_MAX_FORKS`. Do not pass `--maxWorkers`, `--no-isolate`,
  or `--pool` flags to get around them.
- Heavy validation commands run through `test-gate` (a machine-wide hook: at most 2 in flight,
  refused when memory is critical). If it refuses or times out waiting for a slot, do what the
  message says: wait at least 60s, retry once, then stop and report. `test-gate status` shows
  what is in flight.

## Decision order

1. Clearest test of the core insight.
2. Fastest visible prototype.
3. Earliest discovery of fatal constraints.
4. Simplest abstraction that can absorb the next layer.
5. Fewer calls, steps, and round trips.
6. Production hardening after the idea earns it.
