<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_18_READ_LOOP_PARITY_PLAN_2026-08-07.md -->

# Phase 4 Slice 18 — P1 Read-Loop Parity Plan (tasker/51 P1)

**Prepared:** 2026-08-07 (deep-reasoner architecture pass; decisive claims re-verified firsthand in-session)
**Status:** Plan ratified. **S1 COMPLETE** (`32b2b2dfb`; evidence packet `AGENTIC_CHAT_WORKER_PHASE_4_SLICE_18_S1_EVIDENCE_2026-08-08.md`). **S2 COMPLETE** (see below; `pnpm pre-push` 35/35). **S3 IN PROGRESS — most of the slice landed 2026-08-08**: extraction map + T1/T3/T4/T5 + the worker composition are done (`85a304c3d`, `02f444dc1`, `67590adc3`, `e2bd6b32e`, `906dc3d02`, `9289fcd9e`) — the worker's read tool now dispatches 21 shared implementations and `get_project_overview` emits the LEGACY payload (Known live divergence 1 closed at the implementation layer). Remaining for S3 exit: provider catalog swap (the provider still ADVERTISES one tool, so live behavior is unchanged), the ≥3-real-tool golden, and the prod `tool_category` constraint diff (ops, pre-live). Working ledger: `AGENTIC_CHAT_WORKER_PHASE_4_S3_EXTRACTION_MAP_2026-08-08.md` (T1-T11 + verified access-surface corrections). Libri is fully REMOVED from the active chat tool system (`82a0d3705`, DJ-ratified). S4 note: the executor already speaks `continueWithToolResults` (S1) — S4 is the production adapter implementing it + composing the extracted leaves. **✅ S2 COMPLETE (2026-08-08, commits `747ea44a0` S2a → `1ea7b47dd` S2b-1 → `82a0d3705` libri removal [DJ-ratified] → `933f198de` S2c → `e114416a4` S2d; exit gate `pnpm pre-push` 35/35 green).** 24 modules live in `agentic-chat-runtime/src/loop/` including both hot prompt-text files, all classification/validation/round-analysis/context-ledger/repair/turn-intent/synthesis leaves, behind two injected ports (tool catalog + skill lookup, throwing getters, web installs via `install-loop-catalog.ts`). Ratified boundary decisions: (a) the three runners + `prompt-dump-debug` stay web-side as the legacy round driver per the hybrid architecture — the worker composes the extracted leaves directly in S4; (b) the skills catalog stays host-side because its definitions load markdown via Vite `?raw` imports, which neither tsup nor worker tsc resolve — **S3 premise correction: the "cheap pure in-memory skills/domains move" requires a markdown-loading answer (esbuild text loader + un-suffixed imports, or generated TS), it is NOT free**; (c) `limits.ts`/`context-usage.ts` gained injectable loaders, module-scope consts retained for legacy web call sites; (d) catalog/skill-dependent behavior tests stay web-side (real registry through shims). Also landed: libri fully removed from the active chat tool system (default-off, DJ-ratified; admin audit rendering of historical sessions kept) and the pre-existing oversized `api/agent/v2/turns` route split (`79a71ca19`).

**S2b unit 1 landed (2026-08-08):** the injected catalog port exists — `loop/tool-catalog.ts` (`provideAgenticChatLoopToolCatalog` installed provider; throwing getter, since a silently empty catalog would drift classification onto name heuristics unrefereed); web installs the real registry via `tools/registry/install-loop-catalog.ts`, imported by every catalog-dependent shim. Moved with it: `tool-classification` (22 exports, all `getToolRegistry()` sites → port), `write-ledger`, `shared` (pure types), and `model-routing-types` (the three variant/pass-role unions extracted from `model-tiering.ts`, which now re-exports them). Instrument note: catalog-dependent modules keep their behavior-pinning tests in WEB (they exercise package source through the vitest alias with the real registry installed) — package-side tests would need a fixture catalog, changing what the tests pin. **Remaining for S2 (S2c+):** `tool-validation` (blocked on its runtime libri manifest imports — needs a libri-lookup port or the S3 catalog move), `round-analysis` (type-coupled to tool-validation), `context-gathering-ledger`, `synthesis-context` + `repair-instructions` (turn-intent/tool-selector closure), `limits.ts`/`context-usage.ts` env-read conversion, the three runners, `prompt-dump-debug`, and the lint-rule/`pre-push` full exit gate. S3–S5 not started. Supersedes tasker/51 P1's one-paragraph sketch.
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
   `read_only_tools` golden uses a synthetic `fixture_project_read`, so no
   differential sees it. Register this as a known live divergence now; close
   it in S3.
3. **The orchestration-loop extraction wall is one import.**
   `stream-orchestrator/index.ts:36` (`import { dev } from '$app/environment'`)
   is the only SvelteKit-runtime import in the whole directory; the ~18 loop
   leaf modules (~9.5k LOC) import zero SvelteKit runtime — `$lib` there is a
   path alias. `executeToolCallPair` is already fully port-shaped. The
   extraction pattern is already ratified in this subsystem
   (`agentic-chat-v2/last-turn-context.ts` is a pure re-export shim over
   `@buildos/agentic-chat-runtime`).

## Architecture decision

**Hybrid extraction with same-commit web shims.** Move the loop's *pure
semantic leaves* into `@buildos/agentic-chat-runtime` (new `./loop` subpath);
the worker composes them behind its existing provider port; legacy
`streamFastChat`'s round driver stays untouched until after P1.

Decisive reason: the differential goldens referee round *sequencing* well but
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

| # | Slice | Exit gate |
| --- | --- | --- |
| S1 | Multi-round fence, existing single tool: contract change + executor budgets + `AgenticChatReadOnlyToolAdapter` accepts N calls. No extraction. Also: register the live `get_project_overview` payload divergence (finding 2) durably. | Postgres test: two `chat_tool_executions` rows, `sequence_index` 1,2, distinct stable ids. Existing 4 goldens byte-unchanged. `read_only_tools` golden extended to 2 rounds on BOTH sides. Worker diff ⊆ registered inventories. |
| S2 | Extract loop leaves to `agentic-chat-runtime/src/loop/*` (new export subpath + tsup entry), web files → re-export shims same commit. Convert `getToolRegistry()` singleton to injected catalog port; move `tool-metadata.ts` (818 LOC, source of `tool_category`); convert `limits.ts`/`context-usage.ts` module-scope env reads to injected config. | Moved tests pass unchanged in the package; web diff shows shims only; lint rule forbids `$app`/`$env` in the package; `pnpm pre-push` green. |
| S3 | Shared read-tool implementation behind the access port; web cuts over same commit; move skills/domains catalogs; worker catalog = artifact tool surface ∩ shared allowlist. | Prod `pg_constraint` diff on `chat_tool_executions_tool_category_check` BEFORE any live run. `get_project_overview` payload identical web vs worker (closes finding 2). A golden using ≥3 distinct real tools. |
| S4 | Compose the shared loop in the worker provider via the round bridge: validation, repair instructions, payload compaction, round analysis, read-loop escalation. | `read_only_tools` golden extended with validation-failure → repair round → success; that scenario's `workerOpenDivergences` shrinks, never grows. |
| S5 | Ledger + finalization semantics: context-gathering ledger, read-memo, context shifts, affected-entity capture, finalization-runner. | Context-shift events + `affected_entities` rows match golden; agentic E2E quality ≥ Phase 0 baseline on the read-only subset (spend-gated: DJ). |

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
2. **Durable `tool_round_count` caps at 1 on the worker (found during S1).**
   `finalize_agentic_chat_turn` derives the counters from the ledger and
   overrides caller metadata — `v_tool_round_count := CASE WHEN
   v_tool_call_count > 0 THEN 1 ELSE 0 END`
   (migration `20260804036000_agentic_chat_read_tool_execution_ledger.sql:61`).
   Ledger rows carry no round attribution, so a two-round worker turn persists
   `tool_round_count = 1` in `chat_turn_runs`/message metadata while legacy
   writes the real round count; the S1 executor computes the true count in its
   finalize input, but the RPC overrides it. The differential cannot see this
   (it reads the executor's finalize input, not the DB row). The extended
   ledger SQL test pins the current derivation with a comment. **Owned by S5
   (finalization semantics): either record round attribution on ledger rows or
   ratify caller-supplied round counts.**

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
  dead; S3 takes the shared-extraction path.**
  - `onto.task.get` returns `{ task }` (15 selected columns + injected
    `project_name`, archived hidden by default, not-found THROWS); legacy
    `get_onto_task_details` returns `{ task, linkedEntities, message }` with
    the full row + `assignees`, no `project_name`, archived visible, and a
    200-shaped `status:'not_found'` recovery payload.
  - `onto.search` returns `{ query, results, total, pagination }` (6 entity
    kinds, default limit 12, snippet truncated to 220 chars, archived
    excluded); legacy `search_ontology` returns
    `{ query, search_scope, project_id, total_returned, maybe_more, results,
    total, message }` (9 kinds + calendar events + task buckets, default 50,
    rank_score/why_matched/matched_fields per item, offset silently ignored).
  - Bonus finding: the legacy tool-schema `offset` parameter for
    `search_ontology` is dead — the executor never forwards it.
- Full `streamFastChat` body map (loop-termination conditions, closure-held
  per-round state) — affects S4 size only.
- If S3 exceeds ~2 weeks: cut the tool count, do NOT cut the shared
  implementation — shipping gateway payloads as ratified divergences would
  trade away the "quality ≥ Phase 0 baseline" exit gate.
