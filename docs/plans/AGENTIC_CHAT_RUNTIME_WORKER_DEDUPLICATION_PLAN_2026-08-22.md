<!-- docs/plans/AGENTIC_CHAT_RUNTIME_WORKER_DEDUPLICATION_PLAN_2026-08-22.md -->

# Agentic Chat Runtime Worker Deduplication Plan

**Date:** 2026-08-22  
**Status:** Core implementation complete; web-deletion cleanup deferred  
**Scope:** `packages/agentic-chat-runtime` and `apps/worker`  
**Out of scope:** Refactoring the retiring web agentic-chat backend

## Objective

Make `@buildos/agentic-chat-runtime` the single owner of deterministic, host-neutral agentic-chat behavior while keeping the worker responsible for provider transport, authorization, persistence, retries, deadlines, telemetry, billing, and delivery.

The migration must remove real duplication without turning the package into a second orchestration host or adding network/database round trips.

## Target ownership

### Shared runtime package

- Standard turn-control parsing, validation, and result construction.
- Typed shared-read tool names, argument contracts, aliases, and dispatch.
- Shared ontology/read payload builders over `AgenticChatSharedReadContextV1`.
- Turn contracts, tool classification/repair, outcome evaluation, and supervisor semantics.

### Worker

- Provider/OpenRouter streaming and tool-round orchestration.
- Queue execution, retries, deadlines, cancellation, and capacity.
- Service-role access adapter and authorization context.
- Persistence, realtime delivery, telemetry, billing, and result-size enforcement.
- Web-research tools and worker-specific reviewer controls.
- Mutation execution and effect reconciliation.

## Implementation tracker

### Slice 1 — Standard control-tool single sourcing

- [x] Add a structured shared executor for the four standard control tools.
- [x] Make existing `ChatToolCall` wrappers delegate to the structured executor.
- [x] Remove the four duplicated worker handlers.
- [x] Preserve worker error mapping, canonicalization, `requires_user_action`, and `decided_by` behavior.
- [x] Add package and worker success/error regression coverage.

### Slice 2 — Typed shared-read dispatch

- [x] Add a package-owned shared-read name/argument contract and dispatcher.
- [x] Keep `search_buildos` as an explicit alias of `search_all_projects`.
- [x] Export the immutable shared-read name list and type guard.
- [x] Replace the worker's individual read imports and `args as never` dispatch table.
- [x] Compose shared reads, standard controls, reviewer controls, and web research in the worker.
- [x] Add registry/metadata/allowlist exhaustiveness tests.

### Slice 3 — Worker adapter separation

- [x] Keep the worker execution envelope as the composition root.
- [x] Separate shared runtime dispatch, reviewer-control dispatch, and web-research dispatch.
- [x] Keep deadlines, authorization, telemetry, provider error vocabulary, and payload limits worker-owned.

### Slice 4 — Package API and documentation cleanup

- [x] Update the package README and description to match the implemented boundary.
- [x] Add a focused `/context` production subpath and move the worker to it.
- [ ] Re-check generic `ports.ts` consumers after the web backend is removed.
- [ ] Delete speculative ports and legacy parity-only exports only after a zero-consumer gate.

### Slice 5 — Small internal DRY cleanup

- [x] Reuse `normalizeTaskStateInput` from `@buildos/shared-agent-ops` where semantics match.
- [x] Consolidate duplicated search-term normalization.
- [ ] Consolidate internal payload-field stripping only if both callers require identical behavior. The two current implementations have different object-identity behavior, so this remains intentionally deferred.

## Non-goals

- Moving the full worker provider/executor loop into the package.
- Refactoring the retiring web backend.
- Moving reviewer-only controls into the package before another host needs them.
- Reworking tool-catalog provider injection without a demonstrated co-hosting/test-isolation problem.
- Upgrading Supabase or TypeScript independently from the monorepo.
- Centralizing tiny helpers solely because their implementations look similar.

## Validation gates

- [x] `@buildos/agentic-chat-runtime` typecheck, build, and all 260 tests pass.
- [x] Worker typecheck and changed-path tests pass.
- [x] Shared registry names agree with shared metadata and the worker allowlist.
- [x] Worker shared-read dispatch contains no `as never` escape hatch.
- [x] Package production code imports no application host, SvelteKit, Railway, or global service client.
- [x] CommonJS and ESM `/context` imports pass from the worker package.
- [x] No new network calls, database calls, or steady-state runtime boundary are introduced.
- [x] Existing staged/user changes remain intact.

## Rollout notes

Each behavior-bearing slice should land independently. Compare exact control results and worker execution envelopes before and after migration, then run the worker fixture battery. The package dispatcher remains an in-process function call, so expected steady-state performance is neutral; focused package entrypoints may reduce startup parsing later.

## Evidence log

- 2026-08-22: Worker/package ownership and duplicated dispatch paths audited. Highest-priority duplication is the worker-local implementation of four standard controls plus the untyped shared-read dispatch table.
- 2026-08-22: Standard controls moved behind `executeAgenticChatStandardControlToolV1`; legacy wrappers now delegate to it and worker-local copies were removed.
- 2026-08-22: Added a typed 34-name shared-read registry/dispatcher and migrated the worker away from individual imports and local `as never` calls.
- 2026-08-22: Added registry/metadata, worker-boundary, and package-portability guards; added and smoke-tested the focused `/context` entry point.
- 2026-08-22: Package typecheck/build and 260 tests passed. Worker typecheck, source lint, 62 focused dispatch/client tests, and the new boundary test passed.
- 2026-08-22: Updated the terminal-correction fixture to establish mutation authority through a declared turn contract rather than the superseded raw-message heuristic.
- 2026-08-22: Final full worker result: 122 test files and 1,127 tests passed; the opt-in Phase A workflow test remains skipped as configured.
- 2026-08-22: Final double-check repeated package build/typecheck/tests, full worker lint/HTTP-size/typecheck checks, CJS and ESM export smoke tests, and the complete worker suite with no errors.
