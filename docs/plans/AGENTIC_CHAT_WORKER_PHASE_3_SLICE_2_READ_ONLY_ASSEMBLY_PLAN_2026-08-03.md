<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_3_SLICE_2_READ_ONLY_ASSEMBLY_PLAN_2026-08-03.md -->

# Agentic Chat Worker Phase 3 Slice 2 — Default-off Read-only Assembly

**Prepared:** 2026-08-03 EDT
**Status:** Implemented locally; the Slice 3 client satisfies the injected seam and Slice 5 mounts the default-off lifecycle. Capacity publication, deployment, and routing remain closed.
**Authority:** The user's instruction to re-audit the prior work and continue with the next item authorizes local implementation and validation. It does not authorize a deployment, an internal traffic cohort, web worker-mode negotiation, or a paid provider call.

## Migration status

This slice changes worker TypeScript and tests only. The linked hosted Agentic Chat migration chain remains current through exact receipt `20260802037000`; no new migration is required or applied.

## Re-audit result

The Phase 3 Slice 1 focused suite, worker typecheck, diff check, and production-entrypoint search remained clean. The review identified one processor-managed lifecycle defect before activation: an impossible out-of-cohort claimed row previously threw before the executor, leaving the queue row in `processing` until the chat stalled-recovery sweep. The consumer now requires a typed rejection port, and the executor durably finalizes the turn with `internal_cohort_rejected` before reconciling the queue. It performs no input load, provider start, or stream publication on that path.

## Implemented boundary

### Provider start and capacity ownership

- A generic provider contract separates `prepare()` from `stream()`.
- `prepare()` validates immutable input and reserves the only local provider slot before the database execution-start compare-and-set.
- The network-facing client is not called until the executor receives the exact `started` / `invoke_provider=true` receipt from `begin_agentic_chat_turn_execution`.
- Start denial, cancellation, begin-response loss, provider error, and normal completion all idempotently release the prepared reservation.
- Typed provider-pressure errors reach the existing recovery classifier as `provider_throttle`.

### Initial read-only surface

- The adapter sends the exact frozen system prompt, exact frozen history, and current admitted user message.
- Provider tool choice is forced to `none`; request/history attachments and every provider tool-call event fail permanently.
- Reasoning events remain private and never enter assistant text or the public stream.
- Text and finish/usage events are normalized into the executor contract, with strict single-use, completion, and token-total validation.
- The composed assembly installs defensive disabled read/mutating tool ports even though the provider adapter cannot emit either step.

### Live worker capacity evidence

- `SupabaseQueue` exposes a read-only capacity snapshot covering concurrency, active slots, acceptance, and drain state.
- The ready-age adapter reads only the oldest ready `pending` `agentic_chat_turn` row.
- Provider capacity reflects explicit credential configuration, its one in-flight lease, and a bounded retryable-degradation cooldown.
- The collector combines a running healthy runtime, coherent isolated queue slots, fresh provider state, publisher pressure, and ready-job age into the exact evidence shape already consumed by web admission.
- Missing, stale, contradictory, malformed, stopped, or failed dependencies return `null`, preserving fail-closed admission. Valid pressure remains explicit closed evidence rather than being hidden as missing evidence.

### Hosted adapter composition, still inert

`createAgenticChatPhase3Assembly(...)` composes the hosted execution-control, immutable-input, stream-persistence/Broadcast publisher, cancellation observer, chat-only stalled recovery, read-only provider boundary, consumer runtime, and capacity collector. Construction starts nothing. At Slice 2 completion it had no production entrypoint import; Slice 5 now reaches it only through the default-off bootstrap. It still has no web capacity publisher or routing call site.

The assembly intentionally requires an injected provider network client. The shared worker `SmartLLMService.streamText()` contains an explicit parity warning: it lacks live chat stream/error/routing/fallback fixes. This slice does not bypass that warning or reinterpret the generic client seam as a production-ready provider integration.

## Validation

Focused validation after implementation:

- 6 focused files / 50 tests passed across consumer lifecycle, durable cohort rejection, prepared-provider ordering, read-only provider protocol, provider capacity, capacity collection, and inert hosted assembly.
- Complete worker package: 83 files / 679 tests passed, with one explicit opt-in file/test skipped.
- Worker typecheck passed.
- Touched worker source lint passed without errors or warnings.
- Whole-worktree tracked diff check passed.

## Production boundary retained

- No worker entrypoint imports or starts the assembly.
- `AGENTIC_CHAT_WORKER_ENABLED` still does not silently start anything.
- The Slice 3 client is reachable only through the Slice 5 bootstrap with the production flag defaulting false; no provider call was made.
- Web capacity observation still defaults closed.
- New transport decisions remain legacy SSE, and the browser still does not invoke worker admission.
- No mutating tool can be reached.

## Continuation

Phase 3 Slice 3 is now recorded in `AGENTIC_CHAT_WORKER_PHASE_3_SLICE_3_PROVIDER_NETWORK_CLIENT_PLAN_2026-08-03.md`. It adds the default-off provider network client behind the injected seam and proves mid-stream error frames, stream-close completion, pre-acceptance route fallback, abort propagation, usage accounting, private reasoning, and retryable pressure classification. Default-off startup wiring, capacity evidence publication to web, internal routing, and paid provider use remain separately reviewed work.
