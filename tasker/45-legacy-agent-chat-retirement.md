<!-- tasker/45-legacy-agent-chat-retirement.md -->

# 45 — Retire the legacy agent-chat generation

**Created:** 2026-08-04  
**Status:** Production database retired; web caller-cutover deployment still required  
**Owner:** Database operator for final migration application  
**Mission:** Remove the pre-ontology agent-chat tables and every remaining runtime dependency without damaging current `chat_sessions` / `chat_messages` / worker execution history.

**Last verified:** 2026-08-07. Migration `20260808020000_retire_legacy_agent_chat.sql` is recorded on production; all five relations are absent and all database post-deploy gates passed. The current production web deployment predates the local caller cutover and must be replaced with an isolated deployment of these runtime changes.

## Why this is a separate package

The old chat generation is not an isolated table bundle. It still feeds admin/retargeting analytics and is referenced by observability tables. A direct drop would either fail on foreign keys or silently remove useful historical attribution. Treat this as a cutover, not a schema-only cleanup.

Live census on 2026-08-04:

| Legacy relation       | Rows |
| --------------------- | ---: |
| `agents`              |  832 |
| `agent_plans`         |   81 |
| `agent_chat_sessions` |  164 |
| `agent_chat_messages` |  535 |
| `agent_executions`    |   94 |

Internal dependency chain:

- `agent_chat_messages` → `agents`, `agent_chat_sessions`
- `agent_chat_sessions` → `agents`, `agent_plans`
- `agent_executions` → `agents`, `agent_plans`, `agent_chat_sessions`
- `agent_plans` → `agents`

External dependencies:

- `llm_usage_logs` references `agent_executions`, `agent_plans`, and `agent_chat_sessions`.
- `timing_metrics` references `agents`, `agent_plans`, and `agent_chat_sessions`.
- Admin/user activity paths still read `agent_chat_sessions` and `agent_chat_messages`.

## Known runtime callers to remove or convert

- `apps/web/src/lib/services/email-generation-service.ts`
- `apps/web/src/lib/server/retargeting-pilot.service.ts`
- `apps/web/src/lib/services/admin/dashboard-analytics.service.ts`
- `apps/web/src/routes/api/admin/users/+server.ts`
- `apps/web/src/routes/api/admin/users/[userId]/activity/+server.ts`
- their focused tests and fixtures
- `get_admin_dashboard_comprehensive_analytics` from `20260702020000_admin_dashboard_comprehensive_analytics_rpc.sql` (or the latest replacement definition)

Repository search gate:

```bash
rg -n "agent_chat_sessions|agent_chat_messages|agent_plans|agent_executions|\.from\('agents'\)" \
  apps/web apps/worker packages scripts supabase \
  --glob '!supabase/migrations/**' \
  --glob '!**/database.types.ts' \
  --glob '!**/database.schema.ts' \
  --glob '!**/function-defs.md'
```

## 2026-08-07 implementation receipt

### History policy and live census

The live census matched the archived baseline exactly:

| Relation              |                                      Rows |
| --------------------- | ----------------------------------------: |
| `agents`              |                                       832 |
| `agent_plans`         |                                        81 |
| `agent_chat_sessions` |                                       164 |
| `agent_chat_messages` |                                       535 |
| `agent_executions`    |                                        94 |
| `llm_usage_logs`      | 19,535 total / 68 with legacy attribution |
| `timing_metrics`      |   1,314 total / 0 with legacy attribution |

The 68 affected usage rows break down as follows: 52 populated `agent_execution_id`, 68 populated `agent_plan_id`, and 52 populated `agent_session_id`. All 68 resolve to exactly one current `chat_sessions.id`; zero are unmapped and zero have conflicting candidates. There are 4,820 usage rows with an existing current `chat_session_id`.

Mapping policy:

- `llm_usage_logs.chat_session_id` becomes the only live relational chat attribution. It is filled from the legacy session parent, plan session, or execution session/plan when currently null.
- The original usage UUIDs remain immutable in `llm_usage_logs.metadata` under `legacy_agent_execution_id`, `legacy_agent_plan_id`, and `legacy_agent_session_id`; the obsolete columns and foreign keys are then removed.
- `timing_metrics.session_id` is rewired to current `chat_sessions`. Any late legacy timing UUIDs are first copied into `metadata` under `legacy_agent_session_id`, `legacy_agent_plan_id`, and `legacy_planner_agent_id`. The live census found no populated legacy timing reference.
- Cost, token, latency, error, and current turn/run attribution rows are retained. No observability row is deleted or nulled to permit the drop.

### Archive receipt

Archive directory (outside the repository, mode `0700`):

`/Users/djwayne/Documents/BuildOS Database Archives/legacy-agent-chat/legacy-agent-chat-2026-08-07T16-10-06-522Z`

Package SHA-256: `9038d36050b3da72659828a4e7fa8bd0e0d1e4f844b7606f5aa0b556eb426c29`

| Dataset                                   | Rows | SHA-256                                                            |
| ----------------------------------------- | ---: | ------------------------------------------------------------------ |
| `agents.jsonl`                            |  832 | `6c4819b23dcc51d0e6d3be97c3d58891a667dd8e7d47353232097eedc134db3e` |
| `agent_plans.jsonl`                       |   81 | `94cc3b407eeb8e06f346467b2f7c96294f4d9648ae27e15a96c0a5b63f55fc26` |
| `agent_chat_sessions.jsonl`               |  164 | `e862ec210c2cfc838709cf28584cb0200d9d9a8c8568baf5814ac1b999ea1551` |
| `agent_chat_messages.jsonl`               |  535 | `5a775b9653d04904b7a560ac220f1a25c3dc6f17a75aa72d88757cfb64173995` |
| `agent_executions.jsonl`                  |   94 | `348ec68f21d716718772f7533f890fc8c8b01d38cf82d3ff36faff33a34776f7` |
| `llm_usage_logs_legacy_attribution.jsonl` |   68 | `bf08845146f6b6691b1b9904dea8b1f60d9e0929c8e0bba38b6a5235f6312fd3` |
| `timing_metrics_legacy_attribution.jsonl` |    0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

`verify-retired-data-archive.mjs` independently recomputed every row count and hash and verified `0600` file modes plus the `0700` directory mode.

### Migration and validation receipt

- Migration: `supabase/migrations/20260808020000_retire_legacy_agent_chat.sql`.
- Guard: access-exclusive locks plus exact archive-count assertions; any post-archive write aborts the transaction and requires a fresh archive.
- Retirement: child-to-parent order, no `CASCADE`, legacy enums/RPC/trigger functions removed only after their callers are cut over.
- Disposable PostgreSQL proof: 68/68 usage rows mapped; all five tables retired; `timing_metrics.session_id` references `chat_sessions`; a second application completed successfully.
- Focused web tests: 4 files / 17 tests passed.
- Smart LLM tests: 9 files / 70 tests passed.
- `pnpm --filter @buildos/web check`: 0 errors / 0 warnings.
- Shared-types build and Smart LLM/shared-types type checks: passed.
- Phase 0 RLS catalog verification: all 56 relations passed.
- Repository search gate: no active runtime or SQL caller remains. Exact-name hits are limited to the archive exporter, the post-deploy absence manifest, and the unrelated `tree_agent_plans` name; broader documentation hits are confined to `docs/archive/legacy-agent-chat` and dated historical audit reports.
- Post-deploy absence verification: all five retired relations are absent.
- Post-deploy data integrity: all 68 migrated usage rows retain archived legacy attribution and a current `chat_session_id`; zero current session links are missing.
- Post-deploy RPC drift: clean at 244 function names.
- Post-deploy live type snapshot: regenerated from production into a temporary verification workspace; none of the retired tables, RPC, or enums remain, matching the repository contracts.
- Deployment-order follow-up: production deployment `dpl_2bgegXVLiRkXspX8gwwPxgABbPGF` was created before this cutover, while committed `HEAD` still contains legacy queries in email generation, retargeting analytics, and admin analytics. Core agentic chat has no active caller in the repository search gate. Do not deploy the entire current dirty worktree; isolate and deploy the retirement caller changes.
- Svelte autofixer: the touched component reported only its existing unkeyed-each/SvelteSet suggestions; the retirement edit introduced no Svelte diagnostic, and `svelte-check` is clean.
- Production migration timestamp: `2026-08-07T16:37:07Z` verification receipt (Supabase history version `20260808020000`).

## Required work

### W1 — Establish the history policy

- Inventory populated foreign-key columns in `llm_usage_logs` and `timing_metrics`, grouped by legacy parent table.
- Decide per column whether current product behavior needs a remap to a current chat/run identifier or only an immutable archived UUID.
- Preserve useful cost/timing/error history. Do not null attribution merely to make the drop easy.
- Document the mapping policy and actual affected-row counts in this tracker.

### W2 — Cut runtime reads to current chat/run models

- Convert admin user/activity counts to `chat_sessions`, `chat_messages`, `chat_turn_runs`, and/or worker control-plane tables.
- Convert email and retargeting context to current tables, or explicitly remove the metric if it no longer means anything.
- Replace the dashboard analytics RPC definition so it no longer queries legacy chat relations.
- Update focused unit tests so fixtures represent current models; do not keep legacy fixture adapters in production code.

### W3 — Archive

- Add a dedicated exporter using the canonical JSONL + manifest pattern from `scripts/security/export-phase2-retired-data.mjs`.
- Export all five tables to an operator-controlled directory outside the repository.
- Record row counts and SHA-256 hashes. Independently recompute hashes and verify mode `0600` files / `0700` directories.
- Include externally dependent rows or a correlation manifest sufficient to reconnect `llm_usage_logs` and `timing_metrics` to archived parent IDs.

### W4 — Guarded retirement migration

- Lock all five source tables and compare live counts against the verified archive.
- Rewire or deliberately relax external foreign keys according to W1.
- Drop in child-to-parent order and omit `CASCADE`.
- Remove obsolete indexes, enums, RPCs, policies, and grants only when their dependency is proven.
- Keep the migration transactional and idempotent after a successful run.

### W5 — Contract cleanup and verification

- Regenerate `packages/shared-types/src/database.types.ts` and `database.schema.ts` from the post-migration database.
- Remove any handwritten types, admin response fields, documentation, and fixtures that only describe the legacy generation.
- Run focused web tests, `pnpm --filter @buildos/web check`, shared-types build, RPC drift check, and the RLS verifier.
- Re-run the repository search gate. Remaining hits may exist only in historical migrations/archive docs and must be classified in the completion note.

## Non-goals

- Do not redesign the active agentic-chat worker architecture.
- Do not remove current `chat_sessions`, `chat_messages`, `chat_turn_runs`, `agent_runs`, or worker queue/control tables.
- Do not combine this work with the legacy project/task/phase retirement in tasker 46.

## Exit gate

- [x] No active runtime/API/RPC reads or writes target the five legacy tables in the post-migration code.
- [x] All five tables have verified external archives.
- [x] External history references are mapped or intentionally retained as documented archive UUIDs.
- [x] Guarded production migration succeeds without `CASCADE`.
- [x] Post-migration generated type contracts contain none of the retired relations; regenerate once more from production after deploy.
- [x] Focused tests, web check, shared-types build, RPC drift, and RLS verification pass.
- [x] This tracker records production counts, archive hashes, migration timestamp, and validation receipts.
- [ ] The isolated web caller cutover is deployed and the affected email/retargeting/admin paths are smoke-tested.
