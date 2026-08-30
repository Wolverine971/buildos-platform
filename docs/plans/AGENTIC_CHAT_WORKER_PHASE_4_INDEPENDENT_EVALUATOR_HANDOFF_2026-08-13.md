<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_INDEPENDENT_EVALUATOR_HANDOFF_2026-08-13.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-08-26; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Agentic Chat Worker Phase 4 — Independent Evaluator Handoff

**Prepared:** 2026-08-13

**Intended reader:** an independent implementation/security/release evaluator

**Repository:** `/Users/djwayne/buildos-platform`

**Audit base:** `main` at `d72960f5d788a50782a0c4724f37e19642fc11c3`, plus the current shared dirty worktree

**Decision requested:** determine whether the deterministic Phase 4 package is sound enough to proceed to an explicitly authorized application rollout and hosted 24/24 quality battery

> **Continuation note (2026-08-16):** The independent evaluation authorized the
> hosted battery, but the battery and two focused retests did not close the
> Phase 4 quality gate. This document remains the pre-rollout audit record. For
> the current deployed state, failures, deployed-but-uncanaried remediation, and
> next-agent runbook, continue with
> `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_CONTINUATION_HANDOFF_2026-08-16.md`.

## Executive status

Phase 4's bounded implementation, hosted schema, and all eight deterministic
legacy/worker scenario classes are complete. The final Phase 4 exit gate is
**not complete**: the current application code has not been deliberately rolled
out for this package and the full hosted 24/24 provider/judge quality battery
has not been run against it.

The correct current verdict is therefore:

- **implementation/schema:** ready for independent review;
- **deterministic parity:** green for all eight registered classes;
- **production rollout:** not authorized by this handoff;
- **Phase 4 exit:** pending the hosted 24/24 quality battery and its retained
  evidence artifact.

Do not turn “P0–P5 complete” into a general production GO. It means the bounded
implementation packages are closed under their recorded contracts. It does not
mean the remaining quality gate has passed.

## Kernel to evaluate

The worker must preserve the legacy product's observable behavior while moving
execution outside the web request lifecycle, without weakening database-owned
admission, generation, effect, event, or terminal fences. When asynchronous
ownership makes literal equality dishonest, every difference must be narrow,
registered, and more truthful than the legacy value rather than merely easier
to implement.

The shortest useful evaluator question is:

> Does the current code and hosted schema credibly close deterministic Phase 4
> parity without widening capability or weakening ownership, and is the only
> remaining Phase 4 blocker the operator-authorized 24/24 quality battery?

## Safety and scope rules for the evaluator

1. Start read-only. Do not deploy the web or worker, spend provider/judge money,
   change environment variables, enable routing, widen a cohort, or enable a
   provider capability during evaluation.
2. The worktree contains unrelated work from other tasks. Do not clean, stage,
   commit, revert, or reformat files outside a specifically confirmed finding.
3. Never run Supabase SQL tests against the linked hosted database. Use only the
   disposable PostgreSQL test harness.
4. Never run `supabase db push` from the main migration directory. Migration
   checks must use a receipt-isolated directory so unrelated local/history gaps
   cannot be swept into the target database.
5. Do not run `test:agentic:phase0-evidence` during evaluation. It authenticates,
   writes hosted fixtures, and spends provider/judge money.
6. Checked-in examples default all Phase 4 gates off. This audit did not pull
   live secret values; verify live environment state separately immediately
   before any later rollout.

## What is claimed complete

| Package                         | Bounded claim                                                                                                                                                                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 — read parity                | Shared multi-round orchestration, 34 reviewed reads, legacy-compatible overview payloads, durable validation-failure visibility, memo/context-ledger/finalization safeguards, and a passed 9/9 worker-aware live read gate.                           |
| P2 — mutation/effects           | The current 39 signed writes are partitioned into 20 reviewed worker adapters and 19 explicit deferrals. Every reachable reviewed mutation is behind reserve/begin/receipt effect ownership; the excluded tools are not advertised as generic writes. |
| P3 — history/attachments/vision | Immutable prepared history, exact current-message handling, attachment references, rolling-compatible artifacts, and explicitly gated live vision inputs.                                                                                             |
| P4 — supervisor/finalization    | Supervisor questions/checkpoints, resume evidence, research and stated-future capture, finalization guards, and explicit deferrals where structured state or a durable compound transaction is absent.                                                |
| P5 — telemetry/billing/metadata | Shared consumption-billing limits and terminal recheck, stable provider-usage identity and cost lineage, exact prompt tool-definition snapshots, structured pending-intent metadata, and deterministic terminal domain metadata.                      |
| P6 — deterministic matrix       | Success, clarification, read-only tools, mutating tools, supervisor checkpoint, cancellation, timeout, and provider error all have executable legacy/worker coverage with no blocked class.                                                           |

The authoritative status/exit ledger is
`tasker/51-worker-behavioral-parity-phase4.md`. The master requirements are in
`docs/plans/AGENTIC_CHAT_WORKER_REALTIME_MIGRATION_PLAN_2026-07-29.md`, Phase 4.

## Latest audit corrections

The final deterministic gap was the timeout class. The first version used a
generic exception with timeout-looking text, which could pass without proving
the real terminal classification. The current fixture now rejects with
`LlmStreamPassTerminalError(..., 'timed_out', measurements)` and checks the
actual private `stream_terminal_failure` lifecycle observation.

That lifecycle row uses legacy phase `llm`. The shared projection type was
widened to include that existing value rather than normalizing it to `stream`.
Both executable adapters then passed against the same golden.

The audit also reconciled all three P5 migration checksums. Later repository
source-header work added only a leading filepath comment to each deployed SQL
file:

| Migration                                                          | Deployed/staged SHA-256                                            | Current source SHA-256                                             | Executable comparison                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `20260813050000_agentic_chat_prompt_snapshot_tool_definitions.sql` | `9d8b095b28ab8e981db243860f3fc820b3d9b5278d37caf2deb9b6bad111e8bd` | `b467b1a805b2f6cfe84717963298a5ddfebcc7c2d9a9106fcf9deb30cf1c99cf` | Removing current line 1 is byte-identical to the retained deployed copy. |
| `20260813060000_agentic_chat_terminal_pending_intent_metadata.sql` | `822ba7ee6536fd2987949b27bb2358560770177aad5849b01778985a1e42c7f6` | `65aaa9aaa0b06f1b6a9cb17d3c4a5e314849f5313957c63162d773d904428624` | Removing current line 1 is byte-identical to the retained deployed copy. |
| `20260813070000_agentic_chat_terminal_domain_metadata.sql`         | `ba0fdbb76ef1d5446912749c33ad2a133e77c9ea90fe3fd57a4a6c2b7a485aca` | `348feeca79d47e6987b87fabe23a37c95f51fdc6e4b830eeced86e74d6e0b643` | Removing current line 1 is byte-identical to the retained deployed copy. |

On 2026-08-13, a receipt-isolated `supabase db push --dry-run --include-all`
reported `Remote database is up to date`, and the live RPC drift gate reported
273 aligned function names.

## Deterministic matrix and registered differences

| Scenario              | Golden / primary proof                   | Important boundary                                                                                                                            |
| --------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Success               | `text-only-success-parity-fixture.ts`    | Worker async timing is database-owned; worker `done` carries explicit status/failure fields absent from legacy.                               |
| Clarification         | `supervisor-question-parity-fixture.ts`  | Uses the same supervisor-question golden as the checkpoint class but is independently registered.                                             |
| Read-only tools       | `read-only-tool-parity-fixture.ts`       | Multi-round reads, validation feedback, and lifecycle cardinality are pinned.                                                                 |
| Mutating tools        | `mutating-tool-parity-fixture.ts`        | Worker effect identity/receipt fields are a deliberate stronger contract.                                                                     |
| Supervisor checkpoint | `supervisor-question-parity-fixture.ts`  | Durable checkpoint and terminal semantics are pinned.                                                                                         |
| Cancellation          | `partial-cancellation-parity-fixture.ts` | Persisted partial output and terminal cancellation ordering are pinned.                                                                       |
| Timeout               | `timeout-parity-fixture.ts`              | Worker timing is async-owned; unknown tokens remain `null`; no first-response prompt snapshot/lifecycle is claimed when no response occurred. |
| Provider error        | `provider-error-parity-fixture.ts`       | The only open payload inventory is the same explicit worker `done` extras carried by all scenarios.                                           |

The executable registry is
`packages/agentic-chat-runtime/src/parity-scenarios.ts`. It rejects unregistered
differences. Do not widen a divergence prefix or open-gap inventory merely to
make a test pass; require a contract decision and document why the worker value
is safer or more truthful.

## P2 deferral boundary to verify

The executable policy currently requires an exact partition of 39 signed write
tools into 20 reviewed adapters and 19 deferrals. The original 38/20/18 exit
packet remains a historical snapshot; the nineteenth deferral is the later
browser-only Gmail OAuth client-action handoff.

The excluded groups are calendar create/update/delete and project-calendar
binding, seven ontology deletes, graph reorganization, contact upsert/candidate
resolution/linking, opaque external Corsair mutation, agent delegation,
change-set commit, and the browser OAuth handoff. Review
`apps/worker/src/workers/agentic-chat/mutationToolCatalog.ts` and
`docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P2_S5_MUTATION_ADAPTER_INVENTORY_2026-08-10.md`
for the exact machine-readable ledger.

The evaluator should confirm both sides of the boundary:

- every advertised/reachable reviewed mutation accepts and rechecks the
  reserved `effect_id`; and
- every deferred mutation is absent from the worker catalog and has a specific
  reconciliation/control reason rather than a generic “unsupported” escape.

## P5 ownership and atomicity points to inspect

1. Prompt tool-definition persistence must preserve the exact provider payload,
   independently hash it, validate artifact membership, permit old-v1-worker
   then v2-backfill rolling order, and reject conflicting replay atomically.
2. Pending intent must be derived only from immutable prepared intent plus
   durable successful write rows. It must not infer fulfillment from model text.
3. Terminal domain sensing is retained for every terminal status, while
   tool-derived skill/resource/domain/outcome/work-capability projection is
   limited to eligible durable successful rows. Failed exceptional terminals
   must not claim successful loads.
4. Both session metadata projections must occur in the same transaction as
   authoritative terminal truth. Scope/projection failure must roll back the
   terminal statement rather than split the session and turn.
5. Successful `skill_load` rows already supply loaded-skill continuity to later
   admissions; no duplicate session field was added.
6. Usage observation is bounded and non-stranding. A stable identity makes a
   future retry safe, but a delayed retry queue is intentionally not invented
   without an owner.
7. Detached legacy agent-state reconciliation remains deferred until it has a
   durable worker-owned job/receipt contract.

## Evidence most recently rechecked

The final audit reran these gates after the typed-timeout/lifecycle correction:

| Gate                                      | Result                     |
| ----------------------------------------- | -------------------------- |
| Shared contract tests + typecheck         | 30/30, clean               |
| Shared runtime tests + typecheck          | 212/212, clean             |
| Legacy stream route fixture               | 44/44                      |
| Real worker fixture executor              | 61/61                      |
| Composed disposable PostgreSQL parity     | 15/15                      |
| Hosted Supabase RPC drift                 | 273 aligned names          |
| Receipt-isolated hosted migration dry run | Remote database up to date |

The broader recorded package-exit sample before the final focused timeout edit
was worker 987 plus one intentional live-eval skip, smart-LLM 72/72, focused web
52/52, Svelte 0/0, and the spend-free instrument suite 44/44. The timeout edit
touches only the parity fixture/projection and its two adapter tests; the focused
post-edit gates above are the current proof for that change.

Useful reproduction commands from the repository root:

```bash
pnpm --filter @buildos/shared-types test:run
pnpm --filter @buildos/shared-types typecheck
pnpm --filter @buildos/agentic-chat-runtime test:run
pnpm --filter @buildos/agentic-chat-runtime typecheck
pnpm --filter @buildos/worker exec vitest run tests/agenticChatFixtureTurnExecutor.test.ts
pnpm --filter @buildos/web exec vitest run src/routes/api/agent/v2/stream/server.test.ts
pnpm --filter @buildos/web exec vitest run src/lib/services/agentic-chat-v2/phase2c-stream-write.postgres.test.ts
pnpm check:supabase-rpc-drift
```

The PostgreSQL test command creates a disposable local cluster. The RPC drift
command is read-only but requires network access. If rerunning the Supabase dry
run, use the existing receipt-isolated directory
`/private/tmp/buildos-p5-domain-metadata-receipts.NU3G5o` if it still exists, or
reconstruct an equivalent receipt-only directory; never substitute the main
migration tree.

## Current worktree landmine

This is a heavily shared dirty worktree. `git status --short` contains many
unrelated documentation, marketing, architecture, and artifact changes. A
whole-tree `git diff --check` currently reports pre-existing trailing whitespace
in
`apps/web/docs/technical/audits/AI_INBOX_PROJECT_REVIEW_LOOP_AUDIT_2026-08-13.md`.
That is not a Phase 4 defect and should not be edited or used to claim the
Phase 4 files are malformed. Run checks scoped to the files under review.

The current uncommitted Phase 4 timeout audit touches:

- `apps/web/src/routes/api/agent/v2/stream/server.test.ts`;
- `apps/worker/tests/agenticChatFixtureTurnExecutor.test.ts`;
- `packages/agentic-chat-runtime/src/lifecycle-observability.ts` and its test;
- `packages/agentic-chat-runtime/src/timeout-parity-fixture.ts`;
- `packages/agentic-chat-runtime/src/parity-scenarios.test.ts`; and
- Phase 4 status/handoff documents.

Preserve concurrent edits and inspect diffs by path before changing anything.

## Questions the evaluator should answer

1. Can any v1/v2 prompt-snapshot rolling order bypass exact identity, artifact
   membership, generation ownership, or conflict rejection?
2. Can terminal metadata triggers observe the wrong session/user/turn, project
   an unsuccessful tool execution, or commit session metadata without terminal
   truth (or vice versa)?
3. Are loaded-skill continuity and domain-map freezing sufficient without a
   duplicate session field or mutable-registry reload at terminal time?
4. Does the typed timeout fixture prove real `timed_out` classification, and
   are its four deliberate worker differences exactly as narrow as documented?
5. Are all 20 reviewed mutation adapters actually reachable only through effect
   ownership, and are all 19 deferrals excluded and specifically justified?
6. Does any document overclaim production readiness despite the application not
   being deliberately rolled out and the 24/24 battery not being run?
7. Can billing/usage observation failure strand a terminal turn, double-count a
   healthy replay, or silently cross a generation boundary?
8. Do service-only helpers remain denied to anonymous/authenticated clients,
   with safe search paths and no unexpected PostgREST exposure?
9. Does any unregistered legacy/worker difference remain in one of the eight
   scenario classes?

## Verdict rubric

- **GO to operator-authorized rollout/battery:** no P0/P1 ownership, security,
  reachability, or unregistered-parity finding; deterministic/schema gates are
  green; remaining concerns are explicitly non-blocking or deferred with an
  owner.
- **HOLD:** implementation review is acceptable, but deployment/spend/live-env
  authorization or a clean isolated release checkout is not yet available.
  This is not by itself an implementation failure.
- **NO-GO:** atomicity/fencing can be bypassed, a deferred mutation is reachable,
  a divergence is hidden or overly broad, terminal truth can split from session
  truth, or an RPC has an unsafe client grant/search path.

## What should happen next

1. Have an independent agent execute the review above and record a scoped
   GO/HOLD/NO-GO with file/line evidence.
2. Resolve any P0/P1 findings and rerun the affected deterministic/schema gates.
3. Only after explicit user authorization, prepare a clean isolated release
   checkout containing the reviewed application code, verify hosted constraints
   and live environment values, deploy web and worker, confirm both deployments
   are ready, and run a routing-off no-spend preflight.
4. Enable only the exact internal test user/cohort and capabilities required by
   the established worker-aware harness.
5. Run the retry-free eight-scenario × three-repetition hosted battery and
   retain its JSON artifact. Compare it with
   `docs/plans/evidence/agentic_chat_worker_phase0_gate_2026-07-31_0f63e47bb.json`:
   24/24 scenarios, 30/30 turn assertions, terminal completion, capture/stream
   errors, execution-mode attribution, cost, timing, and retained footprint.
6. Restore every routing/capability/billing/cohort gate off unconditionally,
   even if the battery or harness fails, and independently verify the restored
   state.
7. Mark Phase 4 exited only if the retained worker artifact meets or exceeds the
   Phase 0 acceptance bar and the evaluator's blocking findings are closed.

The paid reproduction command is documented in
`docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_CLOSURE_CHECKLIST_2026-07-30.md`.
It must not be run from this evaluation handoff without explicit deployment and
provider-spend authorization.

## Primary file map

- Master plan: `docs/plans/AGENTIC_CHAT_WORKER_REALTIME_MIGRATION_PLAN_2026-07-29.md`
- Phase 4 ledger: `tasker/51-worker-behavioral-parity-phase4.md`
- P5 plan: `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P5_TELEMETRY_BILLING_PLAN_2026-08-13.md`
- P2 inventory: `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P2_S5_MUTATION_ADAPTER_INVENTORY_2026-08-10.md`
- P2 exit packet: `docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_P2_EXIT_EVIDENCE_2026-08-11.md`
- Parity registry: `packages/agentic-chat-runtime/src/parity-scenarios.ts`
- Timeout fixture: `packages/agentic-chat-runtime/src/timeout-parity-fixture.ts`
- Lifecycle projection: `packages/agentic-chat-runtime/src/lifecycle-observability.ts`
- Legacy adapter proof: `apps/web/src/routes/api/agent/v2/stream/server.test.ts`
- Worker adapter proof: `apps/worker/tests/agenticChatFixtureTurnExecutor.test.ts`
- P5 migrations: `supabase/migrations/20260813050000_agentic_chat_prompt_snapshot_tool_definitions.sql`, `20260813060000_agentic_chat_terminal_pending_intent_metadata.sql`, and `20260813070000_agentic_chat_terminal_domain_metadata.sql`
- Composed SQL proof: `apps/web/src/lib/services/agentic-chat-v2/phase2c-stream-write.postgres.test.ts`
- Retained baseline: `docs/plans/evidence/agentic_chat_worker_phase0_gate_2026-07-31_0f63e47bb.json`
