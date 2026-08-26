<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_18_READ_LOOP_PARITY_PLAN_2026-08-07.md -->

# Phase 4 Slice 18 — P1 Read-Loop Parity Plan (tasker/51 P1)

**Prepared:** 2026-08-07 (deep-reasoner architecture pass; decisive claims re-verified firsthand in-session)
**Status:** Plan ratified. **S1 COMPLETE** (`32b2b2dfb`; evidence packet `AGENTIC_CHAT_WORKER_PHASE_4_SLICE_18_S1_EVIDENCE_2026-08-08.md`). **S2 COMPLETE** (see below; `pnpm pre-push` 35/35). **S3 COMPLETE (working-tree implementation + hosted gate, 2026-08-08)**: extraction map + T1/T3/T4/T5 + the worker composition are done (`85a304c3d`, `02f444dc1`, `67590adc3`, `e2bd6b32e`, `906dc3d02`, `9289fcd9e`); the worker dispatches 21 shared implementations, advertises the ordered artifact tool surface ∩ that allowlist, and `get_project_overview` emits the LEGACY payload. The differential golden now uses `get_workspace_overview`, `get_project_overview`, and `list_onto_tasks` on both adapters. Migration `20260808010000_agentic_chat_read_tool_categories.sql` passed disposable Postgres, was the only file named by the isolated linked dry run, applied successfully, and has a matching remote receipt. A Management API query verified `chat_tool_executions_tool_category_check` is validated, preserves every legacy value, and admits `read`/`search`; the pre-existing expression already contained one equivalent read/search branch, so the additive migration's second branch is redundant but harmless. Working ledger: `AGENTIC_CHAT_WORKER_PHASE_4_S3_EXTRACTION_MAP_2026-08-08.md` (T1-T11 + verified access-surface corrections). Libri is fully REMOVED from the active chat tool system (`82a0d3705`, DJ-ratified). S4 note: the executor already speaks `continueWithToolResults` (S1) — S4 is the production adapter implementing it + composing the extracted leaves. **✅ S2 COMPLETE (2026-08-08, commits `747ea44a0` S2a → `1ea7b47dd` S2b-1 → `82a0d3705` libri removal [DJ-ratified] → `933f198de` S2c → `e114416a4` S2d; exit gate `pnpm pre-push` 35/35 green).** 24 modules live in `agentic-chat-runtime/src/loop/` including both hot prompt-text files, all classification/validation/round-analysis/context-ledger/repair/turn-intent/synthesis leaves, behind two injected ports (tool catalog + skill lookup, throwing getters, web installs via `install-loop-catalog.ts`). Ratified boundary decisions: (a) the three runners + `prompt-dump-debug` stay web-side as the legacy round driver per the hybrid architecture — the worker composes the extracted leaves directly in S4; (b) the skills catalog stays host-side because its definitions load markdown via Vite `?raw` imports, which neither tsup nor worker tsc resolve — **S3 premise correction: the "cheap pure in-memory skills/domains move" requires a markdown-loading answer (esbuild text loader + un-suffixed imports, or generated TS), it is NOT free**; (c) `limits.ts`/`context-usage.ts` gained injectable loaders, module-scope consts retained for legacy web call sites; (d) catalog/skill-dependent behavior tests stay web-side (real registry through shims). Also landed: libri fully removed from the active chat tool system (default-off, DJ-ratified; admin audit rendering of historical sessions kept) and the pre-existing oversized `api/agent/v2/turns` route split (`79a71ca19`).

**S4 COMPLETE (working tree + hosted gate, 2026-08-08):** the former
one-read-plus-synthesis production adapter
now keeps its capacity lease across sequential provider rounds and exposes each
valid read through the executor's existing durable/public fence before accepting
the result back through `continueWithToolResults`. Returned data is passed
through shared payload compaction and the untrusted-tool-result wrapper. The
worker installs a reviewed 34-tool catalog with canonical ops, uses shared round
analysis and read-loop escalation, and shares the configured
`CHAT_MAX_TOOL_ROUNDS` budget with the escalation policy. Invalid calls are now
recorded as failed durable/public tool executions before the shared repair pass
resumes, while remaining unreachable to the read adapter; at most two repair
passes are allowed before a permanent fail-closed error. The single two-sided
`read_only_tools` golden now pins valid read → validation failure → corrected
read → success across four rounds and three distinct real tools. Local unit,
type, formatting, Svelte, differential, and disposable-Postgres gates are green.
Migration `20260808130000_agentic_chat_tool_validation_failure_ledger.sql`
(`c23e5b39a9560015413274c7ff745d2864bc0f14f16687368c7cfc0cf70439eb`)
was the only file named by the receipt-isolated linked dry run, applied
successfully, and now has matching local/remote receipts; the post-apply dry run
reports the remote database up to date. A live catalog query verified one exact
12-argument `jsonb` function, `SECURITY INVOKER`, fixed
`search_path=pg_catalog, public`, expected fencing/body markers, service-role
execute, and no PUBLIC/anon/authenticated execute grant. Service-role PostgREST
exposes the exact all-required argument contract; anonymous OpenAPI returns 401
and does not expose the route. No worker deploy, routing change, or live provider
turn was part of this schema-only gate. S5 has now started below.

**S5 IN PROGRESS — unit 1 complete; hosted schema verified (2026-08-08):** context-shift
extraction now lives in the shared loop package and both adapters emit the same
nested shift immediately after its tool result. The worker carries that shift
into terminal last-turn context; the four-round real-tool golden now pins the
event, `context_shift_emitted` lifecycle observation, project context, and
`context_shift` data-access marker on both sides. The instrument audit also
corrected the worker's `get_project_overview` bookkeeping: legacy read
persistence does not invent an affected-project row or search count, so both
adapters now record `affected_entities = []` and null result telemetry. New
migration `20260808140000_agentic_chat_true_tool_round_count.sql` keeps
`tool_call_count` ledger-derived while validating and retaining the executor's
real provider-round count. Its self-contained rollback/counter proof is green
in disposable Postgres. A later independent linked-ledger inspection found the
function body installed out of band but no `20260808140000` receipt. The
migration now accepts only that complete guarded semantic shape on replay; its
11/11 disposable proof passes, the receipt-isolated apply reconciled the missing
receipt, and the installed body/security boundary is independently verified.
Local
gates: worker 803 passed (1 intentional skip), runtime
183/183, legacy golden suite 40/40, composed Postgres 11/11, worker/runtime/web
typechecks, Svelte 0/0, full lint/guardrails, and changed-file formatting.
That unit handed off read memo, context-gathering saturation, and applicable
read-only finalization semantics to the continuation document; their unit-2
result follows. The quality battery still requires DJ's provider-spend
authorization.

**S5 unit 2 LOCAL COMPLETE; hosted schema complete; deploy/spend gate open
(2026-08-08):** the production worker now memo-serves only exact successful
pure reads within one invocation while retaining a fresh provider-call identity
and the normal durable-ledger-before-public fence for every repeat. One
`ContextGatheringLedger` per invocation observes the durable result and actual
model payload, emits monotonic narrowing/saturated/must-synthesize guidance,
and converts the terminal rank into a real `tools: []`, `toolChoice: 'none'`
provider request. That final pass is buffered: a tool request or empty answer
gets one bounded tool-free retry, rejected text never reaches public state, and
an accepted candidate is sanitized once before a single stream write while
retaining aggregate usage and the provider's finish reason. Local gates are
green: focused worker 64/64; full worker 812 passed plus one intentional skip;
runtime 183/183 plus typecheck/declaration build; legacy golden 40/40;
disposable Postgres 11/11; worker/runtime/web typechecks; Svelte 0/0; worker
lint/guardrails at the unchanged 175-warning baseline; and the five owned
worker files passing Prettier.
Hosted diagnosis found the complete S5 function body already installed out of
band without its migration receipt. The source migration was hardened to accept
only that full guarded shape, then a receipt-isolated push applied successfully.
The linked receipt matches and the post-apply isolated dry run is empty. A
rollback-only catalog diagnostic verified body MD5
`18a6f5d0333bb72b9129019d34be6b21`, every round-count guard,
`SECURITY INVOKER`, fixed `search_path=pg_catalog, public`, service-role execute,
and no PUBLIC/anon/authenticated execute. Service-role PostgREST exposes the
exact 16-required-argument route; anon and no-key OpenAPI requests return 401
without the route. No deploy, routing change, or provider spend occurred.

**S2b unit 1 landed (2026-08-08):** the injected catalog port exists — `loop/tool-catalog.ts` (`provideAgenticChatLoopToolCatalog` installed provider; throwing getter, since a silently empty catalog would drift classification onto name heuristics unrefereed); web installs the real registry via `tools/registry/install-loop-catalog.ts`, imported by every catalog-dependent shim. Moved with it: `tool-classification` (22 exports, all `getToolRegistry()` sites → port), `write-ledger`, `shared` (pure types), and `model-routing-types` (the three variant/pass-role unions extracted from `model-tiering.ts`, which now re-exports them). Instrument note: catalog-dependent modules keep their behavior-pinning tests in WEB (they exercise package source through the vitest alias with the real registry installed) — package-side tests would need a fixture catalog, changing what the tests pin. **Remaining for S2 (S2c+):** `tool-validation` (blocked on its runtime libri manifest imports — needs a libri-lookup port or the S3 catalog move), `round-analysis` (type-coupled to tool-validation), `context-gathering-ledger`, `synthesis-context` + `repair-instructions` (turn-intent/tool-selector closure), `limits.ts`/`context-usage.ts` env-read conversion, the three runners, `prompt-dump-debug`, and the lint-rule/`pre-push` full exit gate. (Historical note — all of this subsequently landed; see the Status line above.) Supersedes tasker/51 P1's one-paragraph sketch.
**Authority:** `docs/plans/AGENTIC_CHAT_WORKER_REALTIME_MIGRATION_PLAN_2026-07-29.md` §Phase 4 workstreams 3–4; `tasker/51-worker-behavioral-parity-phase4.md` P1; P0 registry (`packages/agentic-chat-runtime/src/parity-scenarios.ts`) is the referee.

## Headline findings that reshape P1 (verified, not assumed)

1. **Legacy read tools do NOT route through `shared-agent-ops`.** Zero hits for
   `runGatewayReadOp`/`executeGatewayOp`/`op-execution-gateway` anywhere under
   `apps/web/src/lib/services/agentic-chat/`. Legacy executes via (a) direct
   Supabase on the RLS user client (~20 tools in `ontology-read-executor.ts`,
   `utility-executor.ts`), (b) relative-URL HTTP to `/api/onto/*`
   (`base-executor.ts:199`, 11 tools), (c) web-only services (email, calendar,
   web search, libri, contacts — `$env`/`$lib/server`/OAuth).
2. **The gateway is a parallel implementation with different payloads.**
   Verified example: `op-execution-gateway.project-status.ts` returns
   `{ counts, count_summary, overdue_tasks, due_soon_tasks }`; legacy
   `overview-helper.ts` returns `{ counts, entity_counts, active_tasks,
blocked_tasks, … }`. **The Phase 3 worker's `get_project_overview`
   (→ `onto.project.status.get`) has therefore been returning a different
   payload than legacy in production canaries, unrefereed** — the
   At plan time the `read_only_tools` golden used a synthetic
   `fixture_project_read`, so no differential saw it. S3's working-tree golden
   now covers the real `get_project_overview` payload on both adapters.
3. **The orchestration-loop extraction wall is one import.**
   `stream-orchestrator/index.ts:36` (`import { dev } from '$app/environment'`)
   is the only SvelteKit-runtime import in the whole directory; the ~18 loop
   leaf modules (~9.5k LOC) import zero SvelteKit runtime — `$lib` there is a
   path alias. `executeToolCallPair` is already fully port-shaped. The
   extraction pattern is already ratified in this subsystem
   (`agentic-chat-v2/last-turn-context.ts` is a pure re-export shim over
   `@buildos/agentic-chat-runtime`).

## Architecture decision

**Hybrid extraction with same-commit web shims.** Move the loop's _pure
semantic leaves_ into `@buildos/agentic-chat-runtime` (new `./loop` subpath);
the worker composes them behind its existing provider port; legacy
`streamFastChat`'s round driver stays untouched until after P1.

Decisive reason: the differential goldens referee round _sequencing_ well but
cannot referee the ~135KB of prompt text in `repair-instructions.ts` (78KB) and
`tool-payload-compaction.ts` (57KB) — both hot files. Single-source what
differentials can't check; duplicate only what they can. Rejected: (b)
worker-side reimplementation (prompt-text drift invisible to goldens); (a)
wholesale `streamFastChat` extraction now (live-path risk, buys P1 nothing).
`agentic-chat-runtime/ports.ts` (tool catalog/execution ports, currently unused
by both adapters) was designed for exactly this composition.

**Tool execution: share the read implementations behind an access port; do NOT
adopt `runGatewayReadOp` as the parity path** (finding 2). Extract
`ontology-read-executor` + `overview-helper` (+ the `/api/onto/*` read handlers
they call) into a shared tools package parameterized by an access port — web
runs it with the RLS user client, worker with service-role +
`ensureActorId`/project scoping (`op-execution-gateway.access.ts:65` is the
worker-safe pattern). Web cuts over in the same commit (11 HTTP hops become
direct calls). **Do not** build a worker→web HTTP tool-exec callback — an
arbitrary-tool service-token endpoint is an unacceptable new surface given the
open RLS incident.

**P1 catalog scope:** two tranches in, one out:

- IN: ~26 ontology read/search tools (shared extraction above).
- IN (cheap): ~12 discovery tools + static info tools — pure in-memory
  catalogs (`tools/skills/`, `tools/domains/`, ~7k LOC, zero I/O) — move them.
- OUT (ratified capability gap, deferred to P3/P5): email (3), calendar (3),
  `web_search`/`web_visit`, libri (5), corsair (1), contacts (2),
  `get_linked_entities` — all need `$env`/`$lib/server`/per-user OAuth. The
  worker filters `prepared.toolSurface.definitions` to the shared allowlist;
  excluded tools are simply not offered to the model.

**Provider contract: no new step types.** Add optional
`continueWithToolResults?({ round, results })` to
`providerContract.ts` (retain `synthesize?` as the deprecated single-result
alias). Round boundary = provider ends its iterable without emitting `finish`;
executor drains accumulated read results, persists + publishes each (fence
preserved: nothing enters the next prompt until durable and public), then calls
`continueWithToolResults`. Executor-owned budgets: `maxProviderRounds`
(default 16 = `FASTCHAT_LIMITS.MAX_TOOL_ROUNDS`) and `maxToolCalls` (40) from
`CHAT_MAX_TOOL_ROUNDS`/`CHAT_MAX_TOOL_CALLS`. The ledger already supports N
rounds (`p_sequence_index` exists; no migration). One new component: a ~150-line
round bridge — the shared loop's injected `toolExecutor` closure pushes a
`read_tool` step onto the provider's outbound generator and awaits a deferred
resolved by `continueWithToolResults`. Tool calls execute sequentially in
emission order (no batch) for deterministic differentials.

## Sub-slices and exit gates

| #   | Slice                                                                                                                                                                                                                                                                                                                                                | Exit gate                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Multi-round fence, existing single tool: contract change + executor budgets + `AgenticChatReadOnlyToolAdapter` accepts N calls. No extraction. Also: register the live `get_project_overview` payload divergence (finding 2) durably.                                                                                                                | Postgres test: two `chat_tool_executions` rows, `sequence_index` 1,2, distinct stable ids. Existing 4 goldens byte-unchanged. `read_only_tools` golden extended to 2 rounds on BOTH sides. Worker diff ⊆ registered inventories. |
| S2  | Extract loop leaves to `agentic-chat-runtime/src/loop/*` (new export subpath + tsup entry), web files → re-export shims same commit. Convert `getToolRegistry()` singleton to injected catalog port; move `tool-metadata.ts` (818 LOC, source of `tool_category`); convert `limits.ts`/`context-usage.ts` module-scope env reads to injected config. | Moved tests pass unchanged in the package; web diff shows shims only; lint rule forbids `$app`/`$env` in the package; `pnpm pre-push` green.                                                                                     |
| S3  | Shared read-tool implementation behind the access port; web cuts over same commit; move skills/domains catalogs; worker catalog = artifact tool surface ∩ shared allowlist.                                                                                                                                                                          | Prod `pg_constraint` diff on `chat_tool_executions_tool_category_check` BEFORE any live run. `get_project_overview` payload identical web vs worker (closes finding 2). A golden using ≥3 distinct real tools.                   |
| S4  | Compose the shared loop in the worker provider via the round bridge: validation, repair instructions, payload compaction, round analysis, read-loop escalation.                                                                                                                                                                                      | `read_only_tools` golden extended with validation-failure → repair round → success; that scenario's `workerOpenDivergences` shrinks, never grows.                                                                                |
| S5  | Ledger + finalization semantics: context-gathering ledger, read-memo, context shifts, affected-entity capture, finalization-runner.                                                                                                                                                                                                                  | Context-shift events + `affected_entities` rows match golden; agentic E2E quality ≥ Phase 0 baseline on the read-only subset (spend-gated: DJ).                                                                                  |

## S4 progress ledger (working tree)

- ✅ Production `continueWithToolResults` bridge supports N sequential read
  rounds; later provider passes retain the reviewed tool surface instead of
  forcing `toolChoice: none`.
- ✅ Durable read feedback is identity-checked, compacted with the shared
  payload policy, stripped of internal fields, and wrapped with the shared
  untrusted-data notice before model replay.
- ✅ Worker catalog entries use the same canonical op taxonomy as web for the
  34 reachable reads, so shared validation and round analysis do not fall back
  to callable-name heuristics.
- ✅ Shared read-loop escalation is injected after completed read rounds and
  uses the executor's configured `CHAT_MAX_TOOL_ROUNDS` budget.
- ✅ Invalid provider calls receive the shared validation result + repair
  instruction and may retry twice. Each rejected attempt is fenced into the
  tool ledger and public stream before repair resumes, but never reaches the
  read adapter; even the final exhausting attempt remains observable.
- ✅ The existing two-sided `read_only_tools` golden now covers validation
  failure → repair → successful read without creating a second scenario.
  Legacy and worker adapters both match the one golden; the worker still has
  exactly the two pre-existing terminal `done` field gaps and no loop gap.
- ✅ Local exit matrix: worker 802 passed (1 skipped), runtime 180 passed,
  worker/runtime/shared typechecks clean, legacy goldens 40/40, web
  `svelte-check` 0 errors / 0 warnings, focused provider 12 passed, composed
  disposable Postgres 9/9, Prettier clean, and changed production sources lint
  clean.
- ✅ Premise correction to S4's literal “`workerOpenDivergences` shrinks” exit
  wording: before this change the scenario inventory contained only the two
  cross-scenario worker terminal `done` extras (`status`, `failure_code`), both
  owned by finalization rather than the read loop. The validation trace is exact
  and added zero gaps; shrinking that inventory here would require concealing or
  changing an unrelated terminal contract. It therefore remains byte-for-byte
  unchanged and is carried to S5.
- ✅ Hosted gate: the receipt-isolated dry run named only
  `20260808130000_agentic_chat_tool_validation_failure_ledger.sql`; application,
  matching linked receipt, empty post-apply dry run, live catalog contract, and
  PostgREST service-only boundary are verified. Start S5 next.

## S5 progress ledger — COMPLETE (local + hosted schema + live quality gate)

- ✅ One bounded shared `extractContextShiftPayload` implementation preserves
  legacy wrapper traversal, aliases, defaults, and malformed-payload rejection;
  the web module is now a compatibility re-export.
- ✅ Successful worker reads inspect the durable tool result, publish a stable
  `context_shift` transition after `tool_result`, and carry it into terminal
  last-turn context. Lifecycle projection records `context_shift_emitted` in
  exact public-event order.
- ✅ The real-tool differential now includes a nested project shift and proves
  matching public events, project-scoped last-turn context, entity capture, and
  `context_shift` data-access evidence across legacy and worker adapters.
- ✅ Instrument correction: read-only `get_project_overview` does not create
  affected-entity evidence or search-result telemetry in legacy. The worker now
  validates returned project identity without inventing either field; the
  golden and adapter test pin empty/null parity.
- ✅ `20260808140000_agentic_chat_true_tool_round_count.sql` ratifies the
  executor-owned round count behind a database fence: call count remains
  derived from durable rows; zero-call turns must report zero rounds; completed
  nonzero turns must report `1..tool_call_count`. An interrupted failed/cancelled
  turn that lost a committed ledger response receives a conservative one-round
  floor instead of deadlocking recovery. Invalid completed metadata rolls back
  terminal finalization. Disposable Postgres, including an exact migration
  replay proof, is 11/11.
- ✅ Hosted gate complete. The first guarded apply discovered that the S5 body
  was already installed out of band without a receipt; its transaction rolled
  back before any migration receipt. A rollback-only diagnostic verified the
  entire new semantic marker set and service-only function contract. The
  migration was hardened to accept only that exact already-installed semantic
  shape, then its replay proof passed. A receipt-isolated workdir containing the
  exact 80 prior remote receipts plus only the S5 target applied successfully
  with source/isolated SHA-256
  `ad7ef37205c6cbdf7128fc3d75794a93eb7c478219686759130d2de845d20d13`.
  The remote receipt is present and the post-apply isolated dry run is empty.
  Post-apply body MD5 is `18a6f5d0333bb72b9129019d34be6b21` (unchanged from
  the pre-apply body), all round-count guards are present, the function remains
  `SECURITY INVOKER` with fixed `search_path=pg_catalog, public`, and its ACL is
  exactly postgres + service-role execute. Service-role PostgREST exposes one
  16-required-argument route; anon and no-key OpenAPI return 401 without it.
- ✅ Exact successful pure-read repeats are served from a per-invocation memo.
  The repeated provider call receives a new identity, zero duration, and the
  canonical memo marker/notice; the executor skips only the source adapter and
  still persists and publishes a second normal execution before provider
  continuation. Different arguments and user-action results bypass the memo;
  validation failures never enter it.
- ✅ `ContextGatheringLedger` now observes each completed durable read with the
  real tool-round counter, current model-payload size, and v3 admission context
  snapshot. New evidence resets its low-novelty ladder; emitted ranks are
  monotonic and do not duplicate/regress the existing read-loop escalation.
- ✅ `must_synthesize` is a true no-tool pass. Candidate output stays buffered;
  tool-request and empty-answer outcomes each receive at most one tool-free
  retry, rejected text is never persisted/published, retry exhaustion fails
  deterministically, and accepted text preserves aggregate usage and finish
  reason. Both retry instructions now come from
  `agentic-chat-runtime/src/loop/no-tool-synthesis.ts`, with worker and legacy
  importing the same exact strings. The worker test includes a rejected pass
  that emits partial text before requesting a tool and proves none of that text
  reaches the accepted generator output.
- ✅ Unit-2 local proof: focused worker 64/64; full worker 812 passed plus one
  intentional skip; runtime 183/183 plus typecheck/declaration build; legacy
  golden 40/40; disposable Postgres 11/11; Svelte 0/0; worker lint/guardrails at
  the unchanged 175-warning baseline; all touched TypeScript files pass
  Prettier. This already-dirty plan file retains pre-existing formatting drift
  and was not mechanically rewritten.
- ⚠️ The first authorized live attempt is not valid worker evidence. Revision
  `f98062d23` reached both production runtimes and the one-user routing flag was
  enabled, but the selected harness still posted directly to
  `/api/agent/v2/stream`, bypassing transport negotiation and worker admission.
  Its nine turns were therefore legacy SSE: the decisive evidence is two
  successful `update_onto_task` calls, which the production P1 worker neither
  advertises nor executes. The invalid comparison artifact completed 9/9 turns,
  passed 7/9 assertions, cost `$0.01729275`, and had one incomplete retained-tool
  evidence record. Those numbers must not be attributed to S5 worker quality.
  Routing was restored to exact `false`; production deployment
  `build-dhlz7w05q` is Ready and aliased to `build-os.com`.
- ✅ The local harness now has an explicit `AGENTIC_E2E_EXECUTION_MODE` boundary.
  `worker_realtime` requires an exact worker lease without fallback, admits via
  `/api/agent/v2/turns`, consumes the product private Realtime runtime with its
  reconciliation path, creates worker-compatible harness sessions, records
  execution mode + transport contract in evidence, and checks every retained
  turn row for `worker_realtime/agentic_chat_worker_v1`. A routing-OFF live
  preflight authenticated and subscribed, received a legacy negotiation result,
  and failed before the selected model turn. Focused tests are 4/4, touched
  ESLint is clean, and Svelte check is 0/0. The paid worker battery still needs a
  clean committed harness revision, the same narrow route-on window, and an
  unconditional route-off rollback.
- ✅ The worker-aware rerun first exposed and then closed two production
  provider-contract defects. `fe338af7` accepts narrated text before a valid
  read call. `8f22819fc` replaces the singleton tool-call accumulator with a
  bounded indexed accumulator, emits same-round reads sequentially through the
  existing durable/public fence, and replays every ordered durable result in
  the next provider message. Focused bridge/executor proof is 66/66; the full
  worker suite is 814 passed plus one intentional skip; worker typecheck,
  formatting, diff check, and lint/HTTP guard are green at the unchanged
  warning baseline.
- ✅ Exact revision `8f22819fc96e61a8477c3b517d1bf2d8d9f522a7` deployed as
  Railway deployment `cf6e3753-f4d4-4c22-aa0d-64978a60bc58`, image digest
  `sha256:17c82db5f2122aa91c4629c863163c3765cb3659ed6c6f999effc68f390623c4`.
  The fresh worker/runtime health signature started at `03:22:13Z`.
- ✅ A repeated routing-OFF preflight failed before model execution. Under an
  unconditional route-off EXIT trap, the formerly failing cold catch-up then
  passed a one-turn diagnostic with five successful reads across three true
  provider rounds. The complete authorized gate passed 9/9 completed and 9/9
  assertions with zero stream/capture errors; every row was exact
  `worker_realtime/agentic_chat_worker_v1`. The three catch-ups recorded `4/2`,
  `5/2`, and `5/2` call/round counts. Total cost was `$0.00643681`, 60.9% below
  the matching Phase 0 subset's `$0.01646978`. Evidence:
  `docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_18_S5_LIVE_GATE_2026-08-09.md`.
- ✅ The EXIT trap and an independent post-run inspection both restored and
  verified `build-os.com` on routing-OFF Ready deployment `build-dhlz7w05q`.
  P1 is complete; routing remains internal-only and OFF. Return to tasker/51
  P2 rather than widening the cohort.

### Read-only finalization applicability (S5 unit 2)

| Legacy semantic                                                                                       | P1 read-only applicability                           | Disposition                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retry forced synthesis after the model requests another tool                                          | Required                                             | Implemented as one buffered retry with tools still absent. No rejected candidate delta can cross the executor's public fence.                                                                            |
| Retry a forced synthesis pass with no visible answer                                                  | Required                                             | Implemented as one buffered retry; a second empty/tool-request outcome becomes deterministic `provider_forced_synthesis_failed`.                                                                         |
| Final assistant-text sanitation                                                                       | Required only where stream equality can be preserved | Applied to the buffered forced-synthesis candidate before its sole `text_delta`; no post-hoc terminal-only rewrite exists.                                                                               |
| Exact option-count and explicit response-anchor repair                                                | Not proven for P1                                    | Deferred. Neither the single read-only differential nor the Phase 0 read-only quality baseline establishes this as a P1 parity requirement; porting it now would add an unrefereed answer-policy change. |
| Length continuation                                                                                   | Not safe in the current immediate-stream path        | Deferred. The worker cannot retract already durable/public partial deltas or safely merge a continuation without a larger streaming contract; no silent post-hoc divergence was introduced.              |
| Mutation, supervisor, skill-load, research-persistence, organize-commission, and stated-future repair | Out of P1 reachability                               | Not ported; these remain owned by later Phase 4 packages.                                                                                                                                                |

### Read-only quality gate — COMPLETE 2026-08-09

The Phase 0 artifact's entire P1-reachable, read-only subset is
`restraint-noop-and-ambiguity` (two turns) plus `project-catchup-cold` (one
turn). `research-log-readback` is excluded because its first turn requires web
research and deterministic persistence, which are explicitly outside P1. At
three repetitions this is a bounded nine-turn battery. The corresponding nine
Phase 0 turns were 9/9 completed and 9/9 assertion-passing, with aggregate
provider cost `$0.01646978`; that is the comparison baseline, not a new spend
estimate.

The hosted migration prerequisite was satisfied and the rerun used clean exact
descendant `8f22819fc96e61a8477c3b517d1bf2d8d9f522a7`. The fail-closed
routing-OFF preflight stopped before a model turn, the one-user cohort was the
only route-on target, and every paid invocation ran under an unconditional
route-off rollback.

```bash
AGENTIC_PHASE0_CAPTURE=true \
AGENTIC_ASSERT_TELEMETRY=true \
AGENTIC_E2E_EXECUTION_MODE=worker_realtime \
AGENTIC_PHASE0_REPETITIONS=3 \
AGENTIC_PHASE0_OUTPUT_PATH=/tmp/buildos-agentic-worker-p1-readonly-<run>.json \
AGENTIC_E2E_RUN_LABEL=phase4-p1-readonly \
AGENTIC_SCENARIOS=restraint-noop-and-ambiguity,project-catchup-cold \
AGENTIC_E2E_BASE_URL=https://build-os.com \
pnpm --filter @buildos/web exec vitest run \
  --config vitest.config.agentic.ts \
  src/lib/tests/agentic-e2e/__tests__/agentic-scenarios.test.ts \
  --retry=0
```

The harness intentionally refuses capture from a dirty tree and rejects any
turn whose retained row is not exact
`worker_realtime/agentic_chat_worker_v1`. The final artifact is
`/private/tmp/buildos-agentic-worker-p1-readonly-20260809T0326Z.json`, SHA-256
`e4b964c2bb3408aae3b79c98215d05d671acad6cc84c8aaae7fd29e72422a1c3`.
It records 9/9 completed, 9/9 assertion-passing, zero stream/capture errors, and
`$0.00643681` total cost versus the Phase 0 subset's `$0.01646978`. Routing is
OFF on Ready deployment `build-dhlz7w05q`. The earlier `T0032Z` artifact remains
evidence of the legacy-harness defect only; the `T0256Z` worker artifact records
the two adapter defects that the final revision closed. See the checksum-backed
evidence packet linked above for deployment, turn-run, call/round, and cost
details.

## Known live divergences (S1 ledger — registered 2026-08-08, shrink only)

The parity registry cannot express these (the goldens use synthetic fixture
tools), so this section is their durable record until the closing slice's
golden covers them.

1. **`get_project_overview` payload shape (LIVE, unrefereed).** The worker
   routes through the `shared-agent-ops` gateway
   (`op-execution-gateway.project-status.ts` → `onto.project.status.get`),
   returning `{ counts, count_summary, overdue_tasks, due_soon_tasks }`; legacy
   (`overview-helper.ts`) returns `{ counts, entity_counts, active_tasks,
blocked_tasks, … }`. Every Phase 3 canary that called this tool got the
   gateway shape. **Closed by S3's shared implementation; verified closed when
   S3's ≥3-real-tool golden covers `get_project_overview` on both sides.**
2. **Durable `tool_round_count` caps at 1 on the worker (CLOSED BY S5;
   HOSTED BODY + RECEIPT VERIFIED).**
   `finalize_agentic_chat_turn` derives the counters from the ledger and
   overrides caller metadata — `v_tool_round_count := CASE WHEN
v_tool_call_count > 0 THEN 1 ELSE 0 END`
   (migration `20260804036000_agentic_chat_read_tool_execution_ledger.sql:61`).
   Ledger rows carry no round attribution, so a two-round worker turn persists
   `tool_round_count = 1` in `chat_turn_runs`/message metadata while legacy
   writes the real round count; the S1 executor computes the true count in its
   finalize input, but the RPC overrides it. The differential cannot see this
   (it reads the executor's finalize input, not the DB row). The extended
   ledger SQL test originally pinned that derivation. S5 ratified the
   caller-supplied count because the executor owns provider-round boundaries;
   migration `20260808140000_agentic_chat_true_tool_round_count.sql` validates
   it against the durable call count and retains it on both turn and message.
   The hosted body had already been installed out of band, so the first guarded
   apply correctly stopped on its missing predecessor string. After the
   migration gained a complete-semantic-shape replay guard, the receipt-isolated
   apply succeeded. Receipt, unchanged body MD5, all new guards,
   invoker/search-path settings, ACL, and the service-only 16-argument PostgREST
   route are independently verified; the post-apply isolated dry run is empty.

## Landmines (repo-specific, carry into every slice)

1. Module-scope env reads: `limits.ts:24`, `context-usage.ts:25` — inject via
   the `phase3Config.ts:43` pattern. No `FASTCHAT_*`/`CHAT_*` var is in
   `turbo.json` `globalEnv` → Turbo can serve a stale cached build on flag
   changes.
2. `chat_tool_executions_tool_category_check` allowlist exists ONLY in prod
   (canary 8 precedent). S3 emits new categories — constraint diff first.
3. **Service-role fail-open reads:** `utility-executor.ts:1102`
   (`get_entity_relationships`) and `:320` (`get_user_profile_overview`) rely
   on `auth.uid()` for scoping, which is NULL under service role → they fail
   OPEN on the worker. Not reachable today (worker exposes one gateway-scoped
   tool) but every shared read in S3 MUST scope through `ensureActorId` +
   actor-visible project ids (`scopeEntityQueryToReadableProject` pattern).
4. One-golden-per-scenario is asserted by `parity-scenarios.test.ts`; widening
   to multiple goldens per class is a legitimate but explicit instrument change
   — ratify, don't slip in.
5. Adding `shared-agent-ops` as a runtime-package dependency is cycle-free, but
   the `./loop` subpath needs both a tsup entry and an `exports` map entry or
   web silently resolves stale `dist`.
6. Railway bundle grows ~7k LOC (skills/domains); keep
   `AGENTIC_CHAT_WORKER_ENABLED` + cohort gating unchanged; no widening in P1.

## Open questions (answer before S3 commits)

- **ANSWERED (2026-08-08, targeted payload diff, agent-verified with file:line
  evidence): both pairs are DIVERGENT — the allowlist-over-gateway collapse is
  dead; S3 takes the shared-extraction path.** - `onto.task.get` returns `{ task }` (15 selected columns + injected
  `project_name`, archived hidden by default, not-found THROWS); legacy
  `get_onto_task_details` returns `{ task, linkedEntities, message }` with
  the full row + `assignees`, no `project_name`, archived visible, and a
  200-shaped `status:'not_found'` recovery payload. - `onto.search` returns `{ query, results, total, pagination }` (6 entity
  kinds, default limit 12, snippet truncated to 220 chars, archived
  excluded); legacy `search_ontology` returns
  `{ query, search_scope, project_id, total_returned, maybe_more, results,
total, message }` (9 kinds + calendar events + task buckets, default 50,
  rank_score/why_matched/matched_fields per item, offset silently ignored). - Bonus finding: the legacy tool-schema `offset` parameter for
  `search_ontology` is dead — the executor never forwards it.
- Full `streamFastChat` body map (loop-termination conditions, closure-held
  per-round state) — affects S4 size only.
- If S3 exceeds ~2 weeks: cut the tool count, do NOT cut the shared
  implementation — shipping gateway payloads as ratified divergences would
  trade away the "quality ≥ Phase 0 baseline" exit gate.
