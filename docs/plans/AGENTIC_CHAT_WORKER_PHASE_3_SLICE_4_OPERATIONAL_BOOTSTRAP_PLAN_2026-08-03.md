<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_3_SLICE_4_OPERATIONAL_BOOTSTRAP_PLAN_2026-08-03.md -->

# Agentic Chat Worker Phase 3 Slice 4 — Default-off Operational Bootstrap

**Prepared:** 2026-08-03 EDT
**Status:** Implemented locally; Slice 5 now mounts this bootstrap into the production lifecycle behind the default-false flag. Capacity publication, web admission, deployment, and paid provider calls remain closed.
**Authority:** The user's instruction to double-check the prior work and continue with the next item authorizes local implementation and validation. It does not authorize deployment, production startup, an internal traffic cohort, capacity publication, or a paid provider call.

## Migration status

This slice changes worker TypeScript, tests, environment documentation, and planning records only. The hosted Agentic Chat migration chain remains current through exact receipt `20260802037000`; no new migration is required or applied.

## Slice 3 re-audit

Before bootstrap work, the provider/start-fence suite passed 48/48 focused tests and worker typecheck. Production-entrypoint inspection again found no import of the hosted assembly or network client.

The re-audit retained these invariants:

- constructing the provider client performs no network I/O;
- its async stream does not call `fetch` until the executor iterates after the database start-winner receipt;
- accepted streams are never replayed through fallback;
- read-only tool, attachment, and private-reasoning boundaries remain intact; and
- provider/usage failures cannot silently become successful completion.

## Implemented boundary

### Explicit enabled configuration

`loadAgenticChatPhase3Config(...)` now returns a discriminated disabled/enabled configuration:

- Disabled is still the default and returns `provider: null` without reading or validating provider credentials, model, fallback, or endpoint values.
- Enabled still requires a nonempty canonical UUID cohort and exact `CHAT_CONCURRENCY=1` consumer envelope.
- Enabled additionally requires `PRIVATE_OPENROUTER_API_KEY` and an explicit `AGENTIC_CHAT_OPENROUTER_MODEL`.
- Optional fallback models are canonical, unique, exclude the primary model, and are bounded to three.
- The optional OpenRouter base URL must be clean HTTPS without credentials, query, or fragment; otherwise the canonical OpenRouter endpoint is used.
- The produced route, fallback list, and route collection are frozen. The initial operational bootstrap intentionally supports one explicit OpenRouter route rather than silently inventing direct-provider credentials or policy.

### Inert dependency construction

`createAgenticChatPhase3Bootstrap(...)` constructs no usage logger, provider client, hosted assembly, queue, or background service when disabled. `start()` returns `disabled`, `wake()` is harmless, `stop()` is a no-op, and capacity evidence is `null`.

When explicitly enabled, construction creates:

1. the shared durable `LLMUsageLogger`;
2. the Agentic Chat usage observer;
3. the bounded read-only OpenRouter network client; and
4. the hosted Phase 3 assembly using the exact cohort and one-slot consumer config.

Enabled construction is still inert. It does not start the runtime, claim a row, query capacity, open a channel, or call the provider.

### Owned lifecycle and fail-closed evidence

- The bootstrap owns a single-use `ready -> starting -> running -> stopping -> stopped` lifecycle with explicit `disabled` and `failed` states.
- Concurrent starts and stops share their in-flight promise. A stop requested during startup waits for startup to settle before draining.
- Startup and shutdown failures are retained as unhealthy state; a failed/stopped bootstrap cannot silently restart.
- Disabled state is healthy for the surrounding service. Ready, starting, failed, or an unhealthy running runtime is unhealthy. Intentional stopping/stopped state is healthy during drain.
- `collectCapacityEvidence()` returns `null` unless the bootstrap is running and its runtime is healthy. Collector exceptions also return `null`.
- The method only exposes the already-validated in-process evidence; it does not publish it or connect it to web admission.
- Health and capacity output contain no provider credential or model configuration.

## Validation

Validation after implementation:

- 8 focused files / 66 tests passed across consumer/runtime lifecycle, provider start ordering, read-only protocol, provider network behavior, capacity collection, inert assembly, and operational bootstrap.
- Complete worker package: 85 files / 695 tests passed, with one explicit opt-in file/test skipped.
- Worker typecheck passed.
- Touched worker source lint passed without errors or warnings.
- The worker HTTP-module size guard passed with no new violation.
- Whole-worktree tracked diff check passed.

Bootstrap tests prove disabled dependency non-construction, validated enabled assembly input, idempotent startup/drain, stop-during-start ordering, startup-failure closure, capacity-exception closure, and real default assembly construction without database or provider I/O.

## Boundary at Slice 4 completion

- At the completion of Slice 4, neither `worker.ts`, `index.ts`, nor `scheduler.ts` imported or constructed the bootstrap.
- Slice 5 has since mounted it behind `AGENTIC_CHAT_WORKER_ENABLED=false` by default; no hosted flag was changed.
- No capacity writer, shared store, endpoint, or web reader is connected.
- Web capacity observation defaults closed, browser worker admission remains unused, and all new turns remain legacy SSE.
- No internal worker turn, provider request, or paid model call was made.

## Continuation

Phase 3 Slice 5 is now recorded in `AGENTIC_CHAT_WORKER_PHASE_3_SLICE_5_PRODUCTION_LIFECYCLE_MOUNT_PLAN_2026-08-03.md`. It integrates one bootstrap instance with worker startup, combined health, crash cleanup, and concurrent bounded shutdown while preserving the general/chat queue isolation.

Capacity publication, web admission, worker transport selection, deployment, and the first internal paid turn remain later activation decisions.
