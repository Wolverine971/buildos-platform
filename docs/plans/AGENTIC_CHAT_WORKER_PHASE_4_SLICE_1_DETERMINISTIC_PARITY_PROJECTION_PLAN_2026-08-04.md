<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_1_DETERMINISTIC_PARITY_PROJECTION_PLAN_2026-08-04.md -->

# Agentic Chat Worker Phase 4 Slice 1 — Deterministic Parity Projection

**Prepared:** 2026-08-04 EDT  
**Status:** Implemented and validated locally. This slice is inert contract/test infrastructure: it does not change transport selection, admission, the provider surface, worker startup, schema, or production environment state.  
**Authority:** The user asked to continue with the next part. The production one-turn Phase 3 canary remains gated on the already-reviewed CI cache-mode follow-up reaching green. While that external gate is closed, Phase 4 may begin only with deterministic, default-off comparison infrastructure.

## Why this is the next safe slice

The thin Phase 3 worker deliberately supports one text-only, no-tools provider lane. The migration plan requires Phase 4 parity work to use the same deterministic fixtures against legacy and worker adapters and compare normalized ordered events, messages, tool rows, checkpoints, outcomes, and metadata.

Before individual parity features can be added safely, those comparisons need one shared definition of equality. Ad hoc per-test normalizers would make it easy to ignore a real product difference or accidentally compare transport identifiers and streaming chunk sizes as product behavior.

## Scope

Add a transport-neutral Phase 4 projection to `@buildos/agentic-chat-runtime` that:

- accepts both legacy SSE payload envelopes and durable worker event envelopes;
- rejects mismatched `type` / `event_type`, invalid phases, mixed execution generations, and non-monotonic sequences;
- removes only transport ownership fields;
- treats adjacent `text` and `text_delta` chunks as one assistant-text segment;
- preserves semantic event order and payloads exactly;
- repairs the unused legacy `phase_update.phase` type collision by naming the product field
  `session_phase`, distinct from the transport envelope's `phase` field, and fails closed on
  the ambiguous old shape;
- preserves ordered message, tool-execution, and checkpoint collections exactly; and
- canonicalizes JSON object keys while rejecting non-finite or non-wire-safe values.

The projection intentionally has no general-purpose ignore list. Deterministic adapter fixtures must inject stable clocks and product identifiers so parity tests cannot conceal timing, metadata, or persistence regressions behind broad normalization. Repository search found no `phase_update` producer or consumer beyond the shared union and phase classifier, so correcting its impossible type shape does not alter a live wire producer.

## Non-goals

- No live provider call.
- No routing activation or cohort expansion.
- No schema migration.
- No attachment, vision, read-tool, mutating-tool, supervisor, billing, or post-processing implementation yet.
- No claim that Phase 4 parity is complete from testing the projection itself.

## Validation gate

1. Focused runtime parity tests prove envelope/chunk equivalence, including the repaired
   `phase_update` shape.
2. Negative tests prove semantic payload, final-reason, message, ordering, generation,
   ambiguous phase, and serialization differences remain visible or fail closed.
3. Runtime package test suite passes: 3 files / 9 tests.
4. Runtime typecheck and declaration/package build pass.
5. Shared-types typecheck, complete 2-file / 24-test suite, and package build pass.
6. Whole web/Svelte check and worker typecheck pass.
7. Portability guard remains green.
8. Repository diff check passes for the slice.

## Exact next slice

Wire one deterministic text-only success fixture through both the existing legacy adapter and the Phase 3 worker executor, then compare their complete projections with this shared contract. That first composed differential must expose—not paper over—the thin worker's known missing lifecycle events and persistence metadata. Use the resulting diff to choose the first product parity implementation slice.

The production canary remains an independent operational gate: do not enable routing until the CI follow-up is pushed, CI is green, the resulting deployment is Ready with routing false, authenticated disabled-mode negotiation returns legacy, and Railway health/capacity are reconfirmed.
