<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P5_TELEMETRY_BILLING_PLAN_2026-08-13.md -->

# Agentic Chat Worker Phase 4 — P5 Telemetry, Cost, Session Metadata, and Billing

**Prepared:** 2026-08-13  
**Status:** COMPLETE locally/hosted through S4; S1 terminal billing, S2 prompt/
usage accounting, and S3 structured session metadata are closed; production
application rollout remains off  
**Production state:** worker routing, provider mutation capabilities, supervisor,
live vision, consumption billing, and cohort widening remain off

## Kernel

Worker provider usage observation must settle before terminal billing
evaluation, and the same billing gate used by web admission must be
re-evaluated during every post-start worker terminalization or recovery.
Usage/billing observability may report failure, but it must never strand
authoritative terminal turn truth. Every healthy provider response must have
one replay-stable usage identity and its exact or catalog-derived cost split
settled before terminal billing. Prompt evidence must preserve the actual tool
definitions sent to the provider, not only the names prepared at admission.

## Locked boundaries

- The web hook remains the admission-time frozen-account rejection boundary.
- `evaluate_user_consumption_gate(uuid, integer, integer)` remains the database
  authority for freezing/unfreezing accounts. Its existing migration and
  service-role grant are already hosted; P5 S1 adds no schema.
- `PRIVATE_ENABLE_CONSUMPTION_BILLING_GATE` is shared by web and worker and
  remains exactly default-off.
- Usage observation is awaited before the provider exposes its terminal event.
  Healthy inserts use a replay-stable id and conflict-safe upsert. The existing
  five-second observation bound remains an availability boundary: database
  outage/timeout is reported but cannot strand authoritative terminal truth.
- Terminal gate failure is bounded, reported, and non-terminal. The final turn
  CAS/recovery still runs.
- Pre-start denial, stale generation, and cohort rejection do not run a
  terminal billing evaluation because worker-side model execution never began.
- Auto Power upgrade remains independently controlled by the web/Stripe flag;
  P5 S1 implements the master plan's explicit worker gate-RPC re-check. Do not
  copy Stripe side effects into the worker without a separately reviewed,
  idempotent orchestration contract.

## P5 inventory

| Surface                      | Current worker state                                                                                                                               | P5 action                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Message persistence          | Terminal RPC atomically links assistant message and done state                                                                                     | Already closed; retain differential coverage                                                             |
| Tool execution               | Generation/effect-fenced durable ledgers                                                                                                           | Already closed in P2                                                                                     |
| Prompt snapshot              | Exact first-response model messages plus canonical provider tool definitions, independent hashes, sizes, stable identity, and turn linkage         | Closed and hosted in S2 through a rollout-safe service-only v2 RPC                                       |
| Timing                       | Database-owned admitted/accepted/start/provider/first-event/first-response/terminal timestamps and metric linkage                                  | S2 audit closed: exact where async DB ownership permits, with documented delivery/timing divergences     |
| Provider usage/cost          | Every provider invocation attempts one replay-stable `llm_usage_logs` row with turn/session/client/round lineage and exact-or-catalog costs        | Healthy-path replay safety and legacy-compatible cost derivation closed in S2; outage replay is deferred |
| Consumption gate             | Web pre-check plus worker post-start terminal/recovery re-check                                                                                    | Closed locally in S1                                                                                     |
| Pending intent               | New v3 admissions freeze exact structured intent; completed worker terminalization atomically derives fulfillment and shallow-merges pending state | Closed and hosted in S3 unit 1; rolling artifacts without intent remain unchanged                        |
| Used domains / loaded skills | New admissions freeze sensed domain state plus bounded catalog maps; successful load executions already provide durable skill continuity           | Closed in S3 unit 2 through atomic terminal domain projection; no duplicate loaded-skill session field   |
| Agent state reconciliation   | Legacy starts a detached model reconciliation after assistant persistence                                                                          | Requires an explicit worker-owned durable job/receipt contract; do not add an untracked detached call    |

## S1 implementation

- Shared `CONSUMPTION_BILLING_LIMITS` now prevents drift between web admission,
  web Stripe checks, and worker finalization.
- `SupabaseAgenticChatConsumptionBillingAdapter` calls the existing gate with
  strict UUID, row cardinality, identity, type, and nonnegative-count checks.
- Phase 3 configuration parses the exact shared billing flag and only composes
  the adapter when enabled.
- Normal completion evaluates after the provider loop and before terminal CAS.
  Post-start failure/cancellation evaluates before recovery, including paths
  that discover an already-terminal/reconciled row. Pre-start paths skip it.
- The worker deployment example records that the flag must match web.

Focused proof is 112/112 across provider ordering, adapter protocol, executor,
startup config, and assembly. Shared-types build/declarations, worker typecheck,
and Svelte diagnostics are clean. The full package gate follows this document
update. No migration, deployment, provider spend, or production flag change is
required for S1.

## S2 implementation and differential classification

| Surface                           | Classification                   | Evidence / boundary                                                                                                                                                                                                                                                                                      |
| --------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prepared messages                 | Exact                            | Existing canonical prepared-message snapshot and SHA-256 remain unchanged.                                                                                                                                                                                                                               |
| Actual provider tools             | Exact                            | The prepared provider snapshot now carries canonical definitions and an independent SHA-256. Hosted `persist_agentic_chat_prompt_snapshot_v2` validates shape, duplicate names, artifact tool-surface membership, count, hash, replay, and conflict before adding `prompt_sections.actual_tool_surface`. |
| Rolling deploy compatibility      | Deliberate                       | The v2 RPC delegates the existing v1 identity/status/ownership checks in the same transaction. The v1 service grant remains available for an older worker during rollout; a later v2 replay backfills its exact tool payload.                                                                            |
| Usage identity                    | Exact for healthy/replayed calls | Stable UUID identity includes turn, execution generation, logical provider round, and route. Strict worker logging uses `ON CONFLICT (id) DO NOTHING`; callers without an id keep the legacy insert behavior.                                                                                            |
| Token/cache/reasoning lineage     | Exact                            | Existing provider usage fields remain intact and now also retain logical provider round in metadata and attempt observations.                                                                                                                                                                            |
| Provider cost split               | Exact when reported              | Prompt/completion cost details are retained when supplied. If only total provider cost exists, the legacy catalog input/output ratio is scaled to that total. Otherwise the catalog estimate or explicit unknown classification is retained.                                                             |
| Usage durability during DB outage | Deliberate availability boundary | The awaited writer is bounded to five seconds and reports failure without blocking terminal truth. Stable ids make a retried observation safe, but S2 does not invent an unowned delayed-retry queue.                                                                                                    |
| Async timing                      | Exact under DB-owned semantics   | The worker records admitted, accepted, worker-started, provider-authorized, first-event, first-response-persisted, and terminal-committed evidence under `agentic_chat_async_v1`.                                                                                                                        |
| Client delivery timestamp         | Deliberate                       | `done_emitted_at` remains null because the database can prove commit, not delivery to a connected or reconnecting client. Legacy in-process session/history/context subphase timings are not equivalent to asynchronous worker lifecycle evidence.                                                       |

Migration `20260813050000_agentic_chat_prompt_snapshot_tool_definitions.sql`
was applied from a receipt-isolated worktree. Source and staged SHA-256 matched
at `9d8b095b28ab8e981db243860f3fc820b3d9b5278d37caf2deb9b6bad111e8bd`;
the apply named only that migration and the post-apply dry run is empty. Live
service OpenAPI exposes the exact 14-argument RPC and anonymous access does not
expose it. Generated shared database types include the v2 RPC.

A later repository-wide source-header pass added only the leading file-path
comment. The current source hash is
`b467b1a805b2f6cfe84717963298a5ddfebcc7c2d9a9106fcf9deb30cf1c99cf`;
removing that first line leaves a byte-identical match to the deployed
`9d8b...` copy, so there is no executable SQL drift.

Final S2 proof:

- worker: 986 passed with one intentional live-eval skip;
- smart-LLM: 72/72 plus typecheck and declaration build;
- shared types: 28/28 plus typecheck and declaration build;
- prompt-tool PostgreSQL contract: 1/1, including migration replay, exact
  persist/replay, old-worker backfill, conflict rollback, unavailable-tool
  rollback, and ACLs;
- worker check: zero errors (176 existing warnings) and HTTP guardrail green;
- web/Svelte check: 0 errors and 0 warnings;
- `git diff --check`: clean.

No paid provider battery, worker/web deployment, routing flip, capability
widening, or production flag change occurred.

## S3 unit 1 implementation — structured pending intent

- The rolling-compatible `agentic_chat_input_v3` artifact now optionally freezes
  the exact structured turn intent and an independently derived ordered unique
  expected-write-tool list. New admissions always include it; older queued
  artifacts without it remain valid and retain their prior terminal behavior.
- Shared TypeScript and PostgreSQL validators enforce the bounded canonical
  shape, read/write consistency, unique tool names, and exact independent
  derivation. The database trigger intentionally runs after the existing v3
  lifecycle trigger used by atomic admission.
- Every existing terminal wrapper still funnels through the base terminal CAS.
  An `AFTER UPDATE OF status` trigger therefore performs the session metadata
  merge in the same transaction as assistant-message, terminal-event, and turn
  truth. A scope or metadata failure rolls the whole statement back.
- Fulfillment uses only immutable intent plus durable successful
  `chat_tool_executions` write rows. It never infers intent or success from
  provider prose. Explicit clear and fulfilled writes store JSON null at
  `fastchat_pending_turn_intent`; an unfulfilled write stores the bounded
  legacy-compatible pending shape with a database-owned terminal timestamp and
  exact 24-hour expiry. Unrelated `agent_metadata` keys are preserved.
- Completed assistant metadata now also carries the legacy-compatible
  `outcome_status` and exact frozen `turn_intent`, using the shared runtime
  outcome resolver rather than a worker fork.

Migration `20260813060000_agentic_chat_terminal_pending_intent_metadata.sql`
was applied from a receipt-isolated directory. Source and staged SHA-256
matched at
`822ba7ee6536fd2987949b27bb2358560770177aad5849b01778985a1e42c7f6`;
the dry run named only this migration, the linked receipt is present, and the
post-apply dry run is empty. The live service-role helper returned the exact
ordered unique tool list, anonymous invocation was denied, generated shared
types include the helper, and the 268-function RPC drift check is aligned.

A later repository-wide source-header pass added only the leading file-path
comment. The current source hash is
`65aaa9aaa0b06f1b6a9cb17d3c4a5e314849f5313957c63162d773d904428624`;
removing that first line leaves a byte-identical match to the deployed
`822ba...` copy, so there is no executable SQL drift.

Final S3 unit 1 proof:

- worker: 987 passed with one intentional live-eval skip;
- runtime: 212/212 plus typecheck and declaration build;
- shared types: 29/29 plus typecheck and declaration build;
- focused legacy/preparation web proof: 52/52;
- composed PostgreSQL parity: 14/14, including migration replay, fulfilled,
  unfulfilled, explicit-clear, rolling-artifact, invalid-admission, ACL, and
  atomic terminal rollback cases;
- worker check: zero errors (177 existing warnings) and HTTP guardrail green;
- web/Svelte check: 0 errors and 0 warnings;
- `git diff --check`: clean.

No paid provider battery, worker/web application deployment, routing flip,
capability widening, or production flag change occurred. The SQL contract is
hosted but remains dormant for worker metadata until the corresponding web and
worker code is deployed and routing is explicitly enabled.

## S3 unit 2 implementation — deterministic domain-session metadata

- New v3 admissions freeze the exact legacy domain state after deterministic
  sensing plus bounded, sorted skill/outcome-card-to-domain catalog maps. The
  optional field preserves rolling compatibility for older queued artifacts;
  shared and database validators reject malformed, oversized, unsorted, or
  noncanonical snapshots.
- Every terminal wrapper still reaches the base status transition. Its new
  trigger shallow-merges only `fastchat_domain_state` in the same transaction
  as terminal turn truth. Deterministic sensing is retained for all terminal
  statuses; completed and cancelled turns additionally project successful
  durable `skill_load`, `resource_load`, `domain_load`, `outcome_card_load`,
  and `work_capability_load` results. Exceptional failed paths do not claim
  tool success.
- Used-domain signals, outcome-card coverage gaps, and research backlog entries
  are deduplicated per turn, stably ordered, bounded, and merged with legacy
  occurrence/priority semantics. Scope corruption or projection failure rolls
  back the terminal statement rather than leaving split session/turn truth.
- Loaded-skill continuity required no new session patch: successful
  `skill_load` rows are already durable and included in subsequent admission
  history. The frozen map exists only to derive domain signals from those rows
  without reloading mutable registries or inferring anything from prompt text.

Migration `20260813070000_agentic_chat_terminal_domain_metadata.sql` was
applied from a receipt-isolated directory. Source and staged SHA-256 matched at
`ba0fdbb76ef1d5446912749c33ad2a133e77c9ea90fe3fd57a4a6c2b7a485aca`;
the dry run named only this migration, the linked receipt is present, and the
post-apply dry run is empty. Hosted service-role probes returned the expected
map validation and ordered domain union, anonymous execution was denied, five
helper RPCs are present in regenerated shared types, and the 273-function RPC
drift check is aligned. A concurrent post-deploy edit later added only the
leading file-path comment; the current source hash is
`348feeca79d47e6987b87fabe23a37c95f51fdc6e4b830eeced86e74d6e0b643`,
and removing that comment leaves a byte-identical match to the deployed copy.

Final S3 unit 2 proof:

- worker: 987 passed with one intentional live-eval skip;
- runtime: 212/212 plus typecheck and declaration build;
- smart-LLM: 72/72 plus typecheck and build;
- shared types: 30/30 plus typecheck and declaration build;
- focused legacy/preparation web proof: 52/52;
- composed PostgreSQL parity: 15/15, including migration replay, sensing on
  successful and failed terminals, load-result compaction, gaps/backlog,
  invalid admission, ACL, session-scope rollback, and atomicity;
- worker check: zero errors (177 existing warnings) and HTTP guardrail green;
- web/Svelte check: 0 errors and 0 warnings;
- `git diff --check`: clean before the documentation/type regeneration pass.

No paid provider battery, worker/web application deployment, routing flip,
capability widening, or production flag change occurred. The schema is hosted,
but new artifact fields remain dormant until the corresponding application code
is deliberately deployed and worker routing is explicitly enabled.

## S4 package exit

The post-generation package-wide rerun is clean: worker 987 passed with one
intentional live-eval skip, runtime 212/212, smart-LLM 72/72, shared types
30/30, focused web 52/52, composed PostgreSQL 15/15, and Svelte 0/0. Worker
check has zero errors (177 existing warnings), the HTTP size guardrail is green,
RPC drift is aligned at 273 names, and `git diff --check` is clean.

The production examples still default worker runtime, web routing, live vision,
supervisor, consumption billing, and cohort widening to off. P5 therefore exits
without an application deployment, provider spend, route change, capability
widening, or billing-flag change. The remaining Phase 4 gate belongs to P6:
finish the deterministic eight-class differential and then run the separately
authorized hosted quality battery against the retained Phase 0 baseline.

## Next slices

1. **P6 — quality gate.** The eight-class deterministic matrix is complete;
   run the 24/24 hosted agentic E2E battery only with explicit provider-spend
   and application-deployment authorization.
2. **Deferred durable work.** Agent-state reconciliation remains out of scope
   until it has a separately owned durable job/receipt contract.

## Gate commands

```sh
pnpm --filter @buildos/shared-types test:run
pnpm --filter @buildos/shared-types typecheck
pnpm --filter @buildos/shared-types build

pnpm --filter @buildos/worker test:run
pnpm --filter @buildos/worker check

pnpm --filter @buildos/web check
pnpm --filter @buildos/web exec vitest run src/lib/services/agentic-chat-v2/turn-outcome.test.ts src/lib/services/agentic-chat-v2/worker-turn-preparation.test.ts src/routes/api/agent/v2/stream/server.test.ts
pnpm --filter @buildos/web exec vitest run src/lib/services/agentic-chat-v2/phase2c-stream-write.postgres.test.ts
pnpm check:supabase-rpc-drift
git diff --check
```
