<!-- docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_P2_EXIT_EVIDENCE_2026-08-11.md -->

# Phase 4 P2 — mutation/effect parity exit evidence

**Gate date:** 2026-08-11
**Result:** PASS for the reviewed worker mutation surface; production gates OFF
**Scope:** local implementation plus hosted SQL/catalog evidence; no worker deploy, provider spend, or live mutation

## Decision

P2 is complete for the bounded worker mutation surface. The signed write union
contains 38 tools. Exactly 20 have independently gated, recovery-classified
worker adapters; the other 18 are explicitly deferred because their current
authoritative path is irreversible, partially committing, sensitive,
provider-coupled, or missing a stable effect-to-receipt mapping.

This is not permission to advertise mutations in production. The production
bootstrap still supplies no provider or adapter capabilities, and routing
remains OFF. Any future live mutation gate still requires an isolated test
project, exact cohort, explicit write/spend authorization, verified deploys,
and unconditional routing-OFF cleanup.

## Executable 38/20/18 boundary

`mutationToolCatalog.ts` now audits the shared signed metadata at module load:

- 38 signed `write` tools;
- 20 reviewed worker mutation specs;
- 18 explicit deferrals with machine-readable reasons;
- no overlap, missing policy, or stale policy entries.

Any new signed write must be reviewed or deliberately deferred before the
worker can assemble. Default capability normalization also proves all 20 gates
false unless supplied explicitly. Only `create_onto_task` and
`create_task_document` claim downstream replayability; the other 18 reviewed
adapters remain one-attempt/uncertain.

The exit audit found and closed one additional fail-open assembly seam. Provider
capabilities previously required matching adapter flags, but assembly did not
prove that every enabled flag actually installed a router entry. Exact coverage
validation now compares enabled capability tools with installed entries and
fails on duplicates, omissions, or unexpected adapters. The all-capabilities
assembly test therefore proves all 20 reviewed tools are actually routed, not
merely flagged.

## Explicit deferrals

- Calendar create/update/delete and project-calendar binding remain deferred
  pending the concurrent multi-calendar refactor and exact provider-side
  reconciliation/tombstone contracts.
- Seven ontology deletes remain deferred because no durable tombstone can
  reconstruct an exact lost-response receipt.
- Graph reorganization remains deferred because its multi-edge rewrite can
  partially commit without a complete change receipt.
- Contact upsert, candidate resolution, and linking remain deferred because
  they touch sensitive multi-row state, merge/link side effects, and audit rows
  without a stable effect key.
- Corsair MCP mutation remains an opaque external write.
- Agent delegation remains a two-phase run-create/queue control mutation without
  a stable chat-effect mapping.
- Change-set commit remains an item-wise partial-commit workflow owned by the
  later supervisor/checkpoint package.

These are excluded from the worker catalog; none is silently treated as a
generic one-attempt write.

## Exit-gate evidence

- Two-sided mutation differential: the legacy route and worker fixture both
  exercise the exact mutation golden. Mutation-specific contested differences
  are zero; the effect receipt/link fields are the ratified P2 asymmetry. The
  cross-scenario async timing split and worker done-event extras remain in the
  Phase 4 parity ledger for P6 rather than being hidden here.
- Stable effect identity: runtime logical operation IDs remain independent of
  provider call IDs; every reviewed adapter rechecks effect key, signed surface,
  project/context scope, arguments, and idempotency classification.
- Recovery: focused provider/effect/executor/adapter/assembly proof passes
  187/187, including reserve/begin winner fencing, cancellation boundaries,
  known versus uncertain failure classification, replayable receipts, durable
  effect-linked telemetry, and exact router coverage.
- PostgreSQL: the composed disposable suite passes 13/13. Required P2 migrations
  are hosted, the linked ledger is current through `20260811230000`, and the
  null-effect trigger correction retains exact worker effect-to-turn scope.
- Complete worker suite: 913 passed, one intentional skip.
- Runtime: 183/183 tests, typecheck, declarations, and build pass.
- Legacy route golden: 42/42 focused route tests pass.
- Worker typecheck passes. Worker lint/HTTP guard reports zero errors and the
  unchanged 175-warning baseline.
- Svelte diagnostics: zero errors and zero warnings.
- Formatting and diff checks pass for the closing files.

## Next package

Proceed to tasker/51 P3: prepared-prompt/session/history/context consumption,
attachment references, and vision parity. P3 must begin with an inventory and a
single bounded differential; it must not activate the P2 production capability
gates or absorb the deferred P4 supervisor/control work.
