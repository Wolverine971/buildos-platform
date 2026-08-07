<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_3_SLICE_5_PRODUCTION_LIFECYCLE_MOUNT_PLAN_2026-08-03.md -->

# Agentic Chat Worker Phase 3 Slice 5 — Default-off Production Lifecycle Mount

**Prepared:** 2026-08-03 EDT
**Status:** Implemented locally; not deployed. Production code now mounts the bootstrap lifecycle. Slice 6 subsequently added the authenticated capacity transport and the hosted activation prerequisites were set, but worker transport selection and paid provider use remain disconnected.
**Authority:** The user's instruction to double-check the prior work and continue with the next item authorizes local implementation and validation. It does not authorize deployment, changing hosted environment flags, routing an internal cohort, or making a paid provider call.

## Migration status

This slice changes worker TypeScript, tests, environment documentation, and planning records only. The hosted Agentic Chat migration chain remains current through exact receipt `20260802037000`; no new migration is required or applied.

## Slice 4 re-audit

Before lifecycle integration, the exact Slice 4 matrix passed 66/66 focused tests and worker typecheck. The review reconfirmed that disabled bootstrap construction creates no chat queue, provider, usage logger, assembly, background timer, database request, or network request.

The integration review found and closed two operational edge cases:

- A disabled deployment may retain the earlier `CHAT_DRAIN_TIMEOUT_MS=25000` value without failing startup. The new 22-second chat ceiling applies only when chat is enabled or a chat consumer is actually constructed.
- A failure after worker startup, such as scheduler startup failure, now enters the same bounded dual-runtime crash cleanup instead of exiting immediately.

## Implemented lifecycle mount

### Lazy default-off construction

`worker.ts` now lazily creates one Agentic Chat bootstrap before startup cleanup or either queue begins. With `AGENTIC_CHAT_WORKER_ENABLED` absent or exactly `false`, bootstrap creation still constructs no chat dependencies and `start()` returns `disabled`. The existing general queue registers and starts once as before.

With the flag exactly `true`, startup additionally requires the canonical UUID cohort, provider credential, explicit model, and the bounded one-slot chat configuration established in Slice 4. No hosted environment flag was changed in this slice. Later on 2026-08-03, the user explicitly authorized the real switch and Slice 6 atomically set the required cohort/model plus `AGENTIC_CHAT_WORKER_ENABLED=true` in Railway. The current deployment still predates this local lifecycle.

### Coordinated startup and rollback

`WorkerRuntimeLifecycle` owns the existing general queue and the isolated chat bootstrap:

1. start the general queue;
2. start the chat bootstrap, which is a no-op when disabled;
3. report running only after both startup operations succeed; and
4. if either startup fails, attempt both cleanup paths concurrently before surfacing the original error.

Synchronous or asynchronous rollback failures cannot prevent the other runtime's cleanup. Incomplete rollback is surfaced as an `AggregateError`, and the coordinator remains unhealthy and non-restartable.

### Composite health

The existing `/health` response and status now come from composite worker health. It retains the general `queue` payload and adds:

- `runtimeState`; and
- `agenticChat`, including enabled/disabled state and nested runtime health when enabled.

An enabled unhealthy chat runtime makes the worker health response unhealthy. Disabled chat is explicitly healthy and cannot disappear from the payload. Ambiguous pre-initialization flags fail closed without exposing credentials or model configuration.

### Crash and graceful shutdown

- Normal shutdown drains the general queue and chat bootstrap concurrently, so one queue does not consume the other's drain window.
- Both production default drain bounds are now 22 seconds. This leaves room beneath the existing 28-second hard stop for the 2-second HTTP close, 3-second PostHog flush, and scheduling overhead.
- `QUEUE_DRAIN_TIMEOUT_MS` values above 22 seconds are capped for the production general queue.
- Enabled chat configuration rejects a drain above 22 seconds. Disabled configuration keeps accepting the earlier value because no chat runtime exists to consume it.
- Uncaught exceptions, unhandled rejections, and startup failures all use the existing bounded five-second crash cleanup through `shutdownWorker()`, which now owns both runtimes.

## Validation

Validation after implementation:

- 10 focused files / 77 tests passed across the eight Slice 4 files, production lifecycle coordination, and generic queue drain behavior.
- Complete worker package: 86 files / 702 tests passed, with one explicit opt-in file/test skipped.
- Worker typecheck passed.
- Touched worker source lint passed without errors or warnings.
- The worker HTTP-module size guard passed with no new violation.
- Whole-worktree tracked and staged diff checks passed.

The lifecycle tests prove disabled startup parity, explicit composite health, enabled chat startup rollback, cleanup despite synchronous stop failure, concurrent dual drains, aggregated shutdown failure, the 22-second process budget, and retained production wiring. Static guards also prove the general queue does not register `agentic_chat_turn` and the production mount does not collect or publish capacity.

## Activation boundary (superseded by Slice 6 environment update)

The code path is production-shaped and still defaults false in source/example configuration. The hosted production environment is now explicitly true with valid cohort/provider/model prerequisites, but the Phase 3 lifecycle remains local and uncommitted. The isolated runtime will not actually start until a later reviewed deployment publishes this code.

Still disconnected:

- Slice 6 now provides a private capacity endpoint and strict web-side fetch;
- new transport decisions remain legacy SSE;
- the browser does not invoke worker admission; and
- no provider request or paid model call was made.

## Exact next slice

Phase 3 Slice 6 is recorded in `AGENTIC_CHAT_WORKER_PHASE_3_SLICE_6_AUTHENTICATED_CAPACITY_TRANSPORT_PLAN_2026-08-03.md`. It adds the separately reviewed authenticated capacity-evidence transport without opening routing.

Even when valid capacity produces an `open` decision, transport selection and browser admission remain legacy-only until a later internal-cohort routing slice explicitly opens them.
