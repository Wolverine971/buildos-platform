<!-- docs/technical/reviews/AGENTIC_CHAT_SQL_FUNCTION_AUDIT_2026-09-04.md -->
<!-- doc-status: point-in-time -->

# Agentic chat SQL function audit — September 4, 2026

Plan item C7, run read-only against branch `one-engine`. Evidence for the post-bake drop migration
(plan item B8). No source, migration, or database change was made.

## Method

Inventory: every `CREATE [OR REPLACE] FUNCTION` in `supabase/migrations/*.sql` whose name matches
`agentic_chat`, `chat_turn`, `chat_session`, `prepared_prompt`, `turn_lease`, `transport_lease`,
`reap_`, `admit_`, or `kill_epoch` — 86 distinct functions across 425 migrations. No migration
contains a real `DROP FUNCTION` for any of them (the only chat-adjacent drop is
`reset_stalled_jobs(text)`; every other `DROP FUNCTION` line is a commented rollback note).

Callers were resolved in this order: `.rpc('<name>')` in `apps/web/src`, `apps/worker/src`,
`packages/*/src`; live `CREATE TRIGGER … EXECUTE FUNCTION`; column `DEFAULT <name>(`;
`pg_cron`/`cron.schedule`; and calls from other SQL function bodies. Generated files
(`packages/shared-types/src/database.types.ts`, `database.schema.ts`) were excluded. Trigger
bindings were resolved by replaying every `CREATE TRIGGER`/`DROP TRIGGER` in migration-timestamp
and in-file order, so a trigger dropped and not recreated counts as no binding.
`supabase/tests/*.sql` and `scripts/**` callers are recorded but do not keep a function alive.

There are no `cron.schedule` bodies and no column `DEFAULT` referencing any audited function.

## Totals

| Class | Count |
| --- | --- |
| LIVE | 81 |
| LEGACY-ONLY | 2 |
| DEAD | 2 |
| TEST-ONLY | 1 |
| **Total** | **86** |

Of the 81 LIVE functions, 37 have a direct `.rpc()` caller, 24 are bound to a live trigger, and the
remainder are reachable only as callees of another live SQL function. An earlier survey that
estimated "~14 of ~79 still called" counted direct `.rpc()` calls only; it missed trigger bindings
and SQL-internal callees.

## Findings

- **`apply_agentic_chat_terminal_pending_intent_v1()` is orphaned.** Its trigger
  `trg_chat_turn_runs_terminal_pending_intent` was dropped by
  `supabase/migrations/20260814010000_agentic_chat_terminal_pending_contract_metadata.sql:401` and
  never recreated; that migration installed `trg_chat_turn_runs_terminal_pending_contract` in its
  place. The function body still exists with no binding and no caller. Its helper
  `agentic_chat_expected_write_tool_names_v1(jsonb)` stays LIVE because
  `validate_agentic_chat_turn_intent_snapshot_v1()` (trigger
  `trg_chat_turn_input_artifacts_z_turn_intent`) still calls it.
- **`increment_chat_session_metrics(uuid, integer, integer, integer)` has zero callers and is
  granted to `authenticated`** (`supabase/migrations/20260102_increment_chat_session_metrics.sql:23`).
  It is the only audited function reachable by a non-service role with no production caller.
- **`persist_agentic_chat_supervisor_question_checkpoint(...)` is exercised only by pgTAP.** The
  legacy supervisor path writes `chat_turn_checkpoints` directly through `createTurnCheckpoint`
  (`apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/checkpoint-service.server.ts:104`),
  not through this RPC.
- **`recover_agentic_chat_resume_checkpoints(...)` is LIVE, not legacy.** Its wrapper
  `recoverCheckpointResumeLifecycle` is imported by the worker path
  (`apps/web/src/lib/services/agentic-chat-v2/worker-turn-preparation.server.ts:114-121`) as well as
  by the legacy handler. Same for `merge_chat_session_agent_metadata`, which has callers in the
  worker (`apps/worker/src/workers/chat/chatSessionClassifier.ts:692`) and in non-legacy web
  services in addition to `routes/api/agent/v2/stream/**`.
- **`admit_legacy_agentic_chat_turn` is patched in place.** Its live body is not the
  `20260731150000` text: `20260830010000_agentic_chat_track_i_hardening.sql:115-145` reads
  `pg_get_functiondef`, splices a capacity gate, and re-executes it. The 21-argument signature is
  unchanged, so the drop statement is unaffected.
- **Three contract helpers no longer live in `public`.**
  `agentic_chat_normalize_contract_outcome_v1`, `agentic_chat_contract_argument_fields_v1`, and
  `agentic_chat_contract_effect_matches_v1` were moved to schema `agentic_chat_internal` by
  `supabase/migrations/20260814013000_agentic_chat_contract_internal_helpers.sql:22-27`. Any future
  drop must name that schema. All three are LIVE.
- **Filter spillover.** `admit_cycle_run`, `admit_manual_cycle_run`, `admit_claimed_cycle_trigger`,
  and `admit_question_tree_proposals` match the `admit_` filter but belong to Cycles v0 and the
  question-tree experiment. All four are LIVE and out of scope for B8.

## Grants, RLS, and constraint dependencies

| Function | Grants | Other dependencies |
| --- | --- | --- |
| `admit_legacy_agentic_chat_turn` | `REVOKE ALL … FROM PUBLIC, anon, authenticated`; `GRANT EXECUTE … TO service_role` (`20260731150000:524-534`) | Referenced by name in the `20260830010000` patch block only. No RLS policy, view, or constraint references it. |
| `reap_stale_legacy_agentic_chat_turns` | `REVOKE ALL … FROM PUBLIC, anon, authenticated`; `GRANT EXECUTE … TO service_role` (`20260830155952:74-77`) | Reads `chat_turn_runs` via `idx_chat_turn_runs_legacy_running_progress` (`20260830155952:11`). Scheduled by `apps/web/vercel.json:17` → `/api/cron/agentic-chat-stale-turns`. |
| `apply_agentic_chat_terminal_pending_intent_v1` | `REVOKE ALL …` (`20260813060000:361`); no `GRANT` | No trigger, no policy, no constraint. |
| `increment_chat_session_metrics` | `GRANT EXECUTE … TO authenticated` (`20260102…:23`) | None. |
| `persist_agentic_chat_supervisor_question_checkpoint` | `REVOKE ALL … FROM PUBLIC, anon, authenticated`; `GRANT EXECUTE … TO service_role` (`20260813010000:316-321`) | Writes `chat_turn_checkpoints`; that table stays (worker path uses it). |

`chk_chat_turn_runs_execution_mode`
(`supabase/migrations/20260801010000_agentic_chat_worker_phase2a_trust_foundation.sql:86-87`) is a
plain value check — `CHECK (execution_mode IN ('legacy_sse', 'worker_realtime'))` — and depends on
no function. Historical `legacy_sse` rows keep it satisfiable, so it is deliberately left alone;
only the column `DEFAULT` moves.

## Drop order

Callers before callees. Nothing in the drop set is called by anything else in the drop set, so the
only ordering constraints are against non-function objects.

1. Application first: delete the legacy engine (stage S8) and the
   `/api/cron/agentic-chat-stale-turns` route plus its `apps/web/vercel.json` cron entry. Both
   LEGACY-ONLY functions must have no live caller before the migration runs.
2. `DROP INDEX idx_chat_turn_runs_legacy_running_progress` — its only reader is
   `reap_stale_legacy_agentic_chat_turns`; drop it in the same transaction, order between them is
   free.
3. `DROP FUNCTION reap_stale_legacy_agentic_chat_turns(integer, integer)`.
4. `DROP FUNCTION admit_legacy_agentic_chat_turn(<21 args>)`.
5. `DROP FUNCTION apply_agentic_chat_terminal_pending_intent_v1()` — already unbound; safe at any
   point.
6. `DROP FUNCTION increment_chat_session_metrics(uuid, integer, integer, integer)` — drops the
   `authenticated` grant with it.
7. `ALTER TABLE chat_turn_runs ALTER COLUMN execution_mode SET DEFAULT 'worker_realtime'` plus a
   `COMMENT ON COLUMN`. Do not tighten `chk_chat_turn_runs_execution_mode`.
8. Optional, separately: `persist_agentic_chat_supervisor_question_checkpoint(...)`. Dropping it
   requires deleting `supabase/tests/20260813010000_agentic_chat_supervisor_question_checkpoint.test.sql`
   and the two web postgres tests that shell out to it
   (`apps/web/src/lib/services/agentic-chat-v2/p4-supervisor-question-checkpoint.postgres.test.ts`,
   `…/p4-checkpoint-resume-lifecycle.postgres.test.ts`) in the same change.

Draft migration: `artifacts/agentic-chat-sql-drop-migration-DRAFT-2026-09-04.sql`. It is a draft
only — apply after 72 hours at zero `legacy_sse` rows post-merge, then move it under
`supabase/migrations/` with a fresh timestamp.

## Full inventory

¹ Now lives in schema `agentic_chat_internal`, not `public`
(`20260814013000_agentic_chat_contract_internal_helpers.sql`).
² Body patched in place from the `20260731150000` definition; signature unchanged.

| Function | Signature | Created | Last (re)defined | Class | Caller |
| --- | --- | --- | --- | --- | --- |
| `admit_legacy_agentic_chat_turn` | `(uuid, uuid, uuid, uuid, text, text, text, text, text, uuid, uuid, text, boolean, text, timestamptz, text, jsonb, integer, integer, integer, integer)` | `20260731150000_agentic_chat_legacy_atomic_admission.sql:62` | `20260830010000_agentic_chat_track_i_hardening.sql:115 ²` | LEGACY-ONLY | `apps/web/src/lib/services/agentic-chat-v2/turn-admission.ts:124` |
| `reap_stale_legacy_agentic_chat_turns` | `(integer, integer)` | `20260830155952_agentic_chat_stale_legacy_turn_reaper.sql:19` | `20260830155952_agentic_chat_stale_legacy_turn_reaper.sql:19` | LEGACY-ONLY | `apps/web/src/routes/api/cron/agentic-chat-stale-turns/+server.ts:94` |
| `apply_agentic_chat_terminal_pending_intent_v1` | `()` | `20260813060000_agentic_chat_terminal_pending_intent_metadata.sql:226` | `20260813060000_agentic_chat_terminal_pending_intent_metadata.sql:226` | DEAD | none |
| `increment_chat_session_metrics` | `(uuid, integer, integer, integer)` | `20260102_increment_chat_session_metrics.sql:4` | `20260102_increment_chat_session_metrics.sql:4` | DEAD | none |
| `persist_agentic_chat_supervisor_question_checkpoint` | `(uuid, uuid, uuid, uuid, integer, uuid, uuid, integer, text, text, jsonb, jsonb, jsonb)` | `20260813010000_agentic_chat_supervisor_question_checkpoint.sql:41` | `20260813010000_agentic_chat_supervisor_question_checkpoint.sql:41` | TEST-ONLY | `supabase/tests/20260813010000_agentic_chat_supervisor_question_checkpoint.test.sql:50` |
| `acknowledge_agentic_chat_stream_delivery` | `(uuid, uuid, uuid, integer, integer)` | `20260802034000_agentic_chat_worker_stream_delivery_ack.sql:11` | `20260802034000_agentic_chat_worker_stream_delivery_ack.sql:11` | LIVE | `apps/worker/src/workers/agentic-chat/supabaseStreamPublisherAdapters.ts:111` |
| `admit_claimed_cycle_trigger` | `(uuid, uuid, jsonb, jsonb, timestamptz, timestamptz)` | `20260826011409_cycle_due_trigger_coordinator.sql:111` | `20260826011409_cycle_due_trigger_coordinator.sql:111` | LIVE | `apps/worker/src/workers/cycle/cycleCoordinator.ts:149` |
| `admit_cycle_run` | `(uuid, text, text, jsonb, jsonb, uuid, timestamptz, timestamptz, timestamptz)` | `20260825211343_cycles_v0_foundation.sql:244` | `20260826010526_harden_cycle_service_role_wrappers.sql:67` | LIVE | `SQL supabase/migrations/20260826011409_cycle_due_trigger_coordinator.sql:179` |
| `admit_manual_cycle_run` | `(uuid, uuid, text, jsonb, jsonb)` | `20260825211344_cycles_v0_commands.sql:666` | `20260826010526_harden_cycle_service_role_wrappers.sql:271` | LIVE | `apps/web/src/lib/server/cycles/cycle-service.ts:645` |
| `admit_question_tree_proposals` | `(uuid, uuid[])` | `20260801040100_admin_question_tree_experiment.sql:403` | `20260801040100_admin_question_tree_experiment.sql:403` | LIVE | `apps/worker/src/workers/question-tree/questionTreeRepository.ts:455` |
| `agentic_chat_contract_argument_fields_v1` ¹ | `(jsonb)` | `20260814011000_agentic_chat_turn_contract_worker_hardening.sql:128` | `20260814011000_agentic_chat_turn_contract_worker_hardening.sql:128` | LIVE | `SQL supabase/migrations/20260814011000_agentic_chat_turn_contract_worker_hardening.sql:365` |
| `agentic_chat_contract_effect_matches_v1` ¹ | `(text, text, text, jsonb, jsonb)` | `20260814011000_agentic_chat_turn_contract_worker_hardening.sql:148` | `20260814011000_agentic_chat_turn_contract_worker_hardening.sql:148` | LIVE | `SQL supabase/migrations/20260814011000_agentic_chat_turn_contract_worker_hardening.sql:350` |
| `agentic_chat_contract_effect_target_id_v1` | `(text, jsonb, jsonb)` | `20260814010000_agentic_chat_terminal_pending_contract_metadata.sql:59` | `20260814010000_agentic_chat_terminal_pending_contract_metadata.sql:59` | LIVE | `SQL supabase/migrations/20260814011000_agentic_chat_turn_contract_worker_hardening.sql:342` |
| `agentic_chat_contract_tool_semantics_v1` | `(text)` | `20260814010000_agentic_chat_terminal_pending_contract_metadata.sql:13` | `20260814010000_agentic_chat_terminal_pending_contract_metadata.sql:13` | LIVE | `SQL supabase/migrations/20260814011000_agentic_chat_turn_contract_worker_hardening.sql:162` |
| `agentic_chat_domain_reference_map_v1_is_valid` | `(jsonb)` | `20260813070000_agentic_chat_terminal_domain_metadata.sql:10` | `20260813070000_agentic_chat_terminal_domain_metadata.sql:10` | LIVE | `SQL supabase/migrations/20260813070000_agentic_chat_terminal_domain_metadata.sql:332` |
| `agentic_chat_epoch_ms` | `(timestamptz)` | `20260806020000_agentic_chat_timing_evidence_repair.sql:31` | `20260806020000_agentic_chat_timing_evidence_repair.sql:31` | LIVE | `SQL supabase/migrations/20260806020000_agentic_chat_timing_evidence_repair.sql:197` |
| `agentic_chat_expected_write_tool_names_v1` | `(jsonb)` | `20260813060000_agentic_chat_terminal_pending_intent_metadata.sql:14` | `20260813060000_agentic_chat_terminal_pending_intent_metadata.sql:14` | LIVE | `SQL supabase/migrations/20260813060000_agentic_chat_terminal_pending_intent_metadata.sql:192` |
| `agentic_chat_frozen_attachment_v1_is_valid` | `(jsonb, boolean)` | `20260812030000_agentic_chat_attachment_reference_contract.sql:215` | `20260812030000_agentic_chat_attachment_reference_contract.sql:215` | LIVE | `SQL supabase/migrations/20260812030000_agentic_chat_attachment_reference_contract.sql:346` |
| `agentic_chat_frozen_attachments_v1_are_valid` | `(jsonb, boolean)` | `20260812030000_agentic_chat_attachment_reference_contract.sql:327` | `20260812030000_agentic_chat_attachment_reference_contract.sql:327` | LIVE | `SQL supabase/migrations/20260812030000_agentic_chat_attachment_reference_contract.sql:126` |
| `agentic_chat_jsonb_array_of_objects_v1_is_valid` | `(jsonb, integer)` | `20260813070000_agentic_chat_terminal_domain_metadata.sql:75` | `20260813070000_agentic_chat_terminal_domain_metadata.sql:75` | LIVE | `SQL supabase/migrations/20260813070000_agentic_chat_terminal_domain_metadata.sql:324` |
| `agentic_chat_merge_domain_gap_v1` | `(jsonb, jsonb, text)` | `20260813070000_agentic_chat_terminal_domain_metadata.sql:171` | `20260813070000_agentic_chat_terminal_domain_metadata.sql:171` | LIVE | `SQL supabase/migrations/20260813070000_agentic_chat_terminal_domain_metadata.sql:576` |
| `agentic_chat_merge_domain_ids_v1` | `(jsonb, jsonb, integer)` | `20260813070000_agentic_chat_terminal_domain_metadata.sql:52` | `20260813070000_agentic_chat_terminal_domain_metadata.sql:52` | LIVE | `SQL supabase/migrations/20260813070000_agentic_chat_terminal_domain_metadata.sql:216` |
| `agentic_chat_merge_used_domain_signal_v1` | `(jsonb, jsonb, text, uuid)` | `20260813070000_agentic_chat_terminal_domain_metadata.sql:98` | `20260813070000_agentic_chat_terminal_domain_metadata.sql:98` | LIVE | `SQL supabase/migrations/20260813070000_agentic_chat_terminal_domain_metadata.sql:568` |
| `agentic_chat_normalize_contract_outcome_v1` ¹ | `(jsonb, text)` | `20260814011000_agentic_chat_turn_contract_worker_hardening.sql:14` | `20260814011000_agentic_chat_turn_contract_worker_hardening.sql:14` | LIVE | `SQL supabase/migrations/20260814011000_agentic_chat_turn_contract_worker_hardening.sql:269` |
| `agentic_chat_normalize_frozen_attachment_v1` | `(jsonb, bigint, boolean)` | `20260812030000_agentic_chat_attachment_reference_contract.sql:12` | `20260812030000_agentic_chat_attachment_reference_contract.sql:12` | LIVE | `SQL supabase/migrations/20260812030000_agentic_chat_attachment_reference_contract.sql:165` |
| `agentic_chat_research_log_entries` | `(text)` | `20260813030000_agentic_chat_research_capture.sql:11` | `20260813030000_agentic_chat_research_capture.sql:11` | LIVE | `SQL supabase/migrations/20260813030000_agentic_chat_research_capture.sql:456` |
| `agentic_chat_research_result_urls` | `(jsonb, integer)` | `20260813030000_agentic_chat_research_capture.sql:44` | `20260813030000_agentic_chat_research_capture.sql:44` | LIVE | `SQL supabase/migrations/20260813030000_agentic_chat_research_capture.sql:75` |
| `apply_agentic_chat_research_capture` | `(uuid, uuid, uuid, uuid, integer, uuid, text, uuid, text, text, text)` | `20260813030000_agentic_chat_research_capture.sql:231` | `20260813030000_agentic_chat_research_capture.sql:231` | LIVE | `apps/worker/src/workers/agentic-chat/researchCapture.ts:136` |
| `apply_agentic_chat_terminal_domain_metadata_v1` | `()` | `20260813070000_agentic_chat_terminal_domain_metadata.sql:350` | `20260813070000_agentic_chat_terminal_domain_metadata.sql:350` | LIVE | `trigger trg_chat_turn_runs_terminal_domain_metadata @ supabase/migrations/20260813070000_agentic_chat_terminal_domain_metadata.sql:604` |
| `apply_agentic_chat_terminal_pending_contract_v1` | `()` | `20260814010000_agentic_chat_terminal_pending_contract_metadata.sql:95` | `20260814011000_agentic_chat_turn_contract_worker_hardening.sql:204` | LIVE | `trigger trg_chat_turn_runs_terminal_pending_contract @ supabase/migrations/20260814010000_agentic_chat_terminal_pending_contract_metadata.sql:405` |
| `begin_agentic_chat_effect` | `(uuid, uuid, uuid, uuid, integer, text, text)` | `20260801041100_agentic_chat_worker_effect_rpcs.sql:234` | `20260801041100_agentic_chat_worker_effect_rpcs.sql:234` | LIVE | `apps/worker/src/workers/agentic-chat/effectControl.ts:89` |
| `begin_agentic_chat_turn_execution` | `(uuid, uuid, uuid, integer)` | `20260802031000_agentic_chat_worker_execution_recovery.sql:11` | `20260802031000_agentic_chat_worker_execution_recovery.sql:11` | LIVE | `apps/worker/src/workers/agentic-chat/executionControl.ts:130` |
| `claim_agentic_chat_resume_checkpoint_for_artifact` | `()` | `20260813020000_agentic_chat_checkpoint_resume_lifecycle.sql:9` | `20260813020000_agentic_chat_checkpoint_resume_lifecycle.sql:9` | LIVE | `trigger trg_chat_turn_input_artifacts_checkpoint_resume @ supabase/migrations/20260813020000_agentic_chat_checkpoint_resume_lifecycle.sql:138` |
| `claim_agentic_chat_turn` | `(uuid, uuid, uuid)` | `20260802020100_agentic_chat_worker_claim_fencing.sql:16` | `20260806020000_agentic_chat_timing_evidence_repair.sql:111` | LIVE | `apps/worker/src/workers/agentic-chat/executionControl.ts:117` |
| `cleanup_agentic_chat_sensitive_transcripts` | `(integer, integer)` | `20260830010000_agentic_chat_track_i_hardening.sql:44` | `20260830010000_agentic_chat_track_i_hardening.sql:44` | LIVE | `apps/worker/src/scheduler/agenticChatRetention.ts:11` |
| `cleanup_agentic_chat_worker_artifacts` | `(integer, integer, integer, integer)` | `20260820010000_agentic_chat_worker_retention_cleanup.sql:178` | `20260820010000_agentic_chat_worker_retention_cleanup.sql:178` | LIVE | `apps/worker/src/scheduler.ts:495` |
| `cleanup_expired_agentic_chat_prepared_prompts` | `()` | `20260502000002_agentic_chat_prepared_prompts.sql:97` | `20260827132854_query_performance_cleanup.sql:122` | LIVE | `apps/worker/src/scheduler/promptArtifactRetention.ts:49` |
| `create_agentic_chat_turn_with_job` | `(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, uuid, uuid, text, uuid, uuid, text, boolean, text, jsonb, text, text, jsonb, integer, text, jsonb, jsonb, text, integer, integer, uuid, text, text, jsonb, boolean)` | `20260802020000_agentic_chat_worker_atomic_admission.sql:49` | `20260802020000_agentic_chat_worker_atomic_admission.sql:49` | LIVE | `apps/web/src/lib/services/agentic-chat-v2/worker-turn-admission.server.ts:50` |
| `enforce_agentic_chat_control_row_retention` | `()` | `20260801030500_agentic_chat_worker_stream_signal_foundation.sql:282` | `20260801030500_agentic_chat_worker_stream_signal_foundation.sql:282` | LIVE | `trigger trg_chat_turn_events_retention @ supabase/migrations/20260820010000_agentic_chat_worker_retention_cleanup.sql:165` |
| `enforce_agentic_chat_effect_transition` | `()` | `20260801041000_agentic_chat_worker_effect_foundation.sql:99` | `20260801041000_agentic_chat_worker_effect_foundation.sql:99` | LIVE | `trigger trg_chat_turn_effects_transition @ supabase/migrations/20260801041000_agentic_chat_worker_effect_foundation.sql:156` |
| `finalize_agentic_chat_turn` | `(uuid, uuid, uuid, uuid, integer, text, text, text, uuid, text, jsonb, integer, integer, integer, jsonb, jsonb)` | `20260802030500_agentic_chat_worker_terminal_control_rpcs.sql:14` | `20260808140000_agentic_chat_true_tool_round_count.sql:72` | LIVE | `apps/worker/src/workers/agentic-chat/executionControl.ts:260` |
| `finalize_agentic_chat_turn_with_failure_events` | `(uuid, uuid, uuid, uuid, integer, text, text, text, uuid, text, jsonb, integer, integer, integer, jsonb, jsonb, text, uuid, jsonb, uuid)` | `20260804034000_agentic_chat_provider_failure_terminal_events.sql:208` | `20260806020000_agentic_chat_timing_evidence_repair.sql:351` | LIVE | `apps/worker/src/workers/agentic-chat/executionControl.ts:260` |
| `finalize_agentic_chat_turn_with_last_context` | `(uuid, uuid, uuid, uuid, integer, text, text, text, uuid, text, jsonb, integer, integer, integer, jsonb, jsonb, jsonb, uuid)` | `20260804000100_agentic_chat_terminal_last_turn_context.sql:12` | `20260804000110_agentic_chat_terminal_sequence_capacity.sql:12` | LIVE | `apps/worker/src/workers/agentic-chat/executionControl.ts:264` |
| `finalize_agentic_chat_turn_with_terminal_events` | `(uuid, uuid, uuid, uuid, integer, text, text, text, uuid, text, jsonb, integer, integer, integer, jsonb, jsonb, jsonb, uuid, jsonb, uuid)` | `20260804000120_agentic_chat_terminal_timing.sql:7` | `20260806020000_agentic_chat_timing_evidence_repair.sql:230` | LIVE | `apps/worker/src/workers/agentic-chat/executionControl.ts:265` |
| `flush_agentic_chat_text_batches` | `(jsonb)` | `20260802033200_agentic_chat_worker_stream_write_rpcs.sql:528` | `20260802033200_agentic_chat_worker_stream_write_rpcs.sql:528` | LIVE | `apps/worker/src/workers/agentic-chat/supabaseStreamPublisherAdapters.ts:67` |
| `link_agentic_chat_worker_message_attachments` | `()` | `20260812030000_agentic_chat_attachment_reference_contract.sql:516` | `20260812030000_agentic_chat_attachment_reference_contract.sql:516` | LIVE | `trigger trg_chat_messages_link_worker_attachments @ supabase/migrations/20260812030000_agentic_chat_attachment_reference_contract.sql:603` |
| `load_agentic_chat_research_capture_evidence` | `(uuid, uuid, uuid, uuid, integer)` | `20260813030000_agentic_chat_research_capture.sql:100` | `20260813030000_agentic_chat_research_capture.sql:100` | LIVE | `apps/worker/src/workers/agentic-chat/researchCapture.ts:104` |
| `load_agentic_chat_stated_future_evidence` | `(uuid, uuid, uuid, uuid, integer)` | `20260813040000_agentic_chat_stated_future_evidence.sql:10` | `20260813040000_agentic_chat_stated_future_evidence.sql:10` | LIVE | `apps/worker/src/workers/agentic-chat/statedFutureCapture.ts:186` |
| `merge_chat_session_agent_metadata` | `(uuid, jsonb)` | `20260428000005_add_chat_session_agent_metadata_merge_rpc.sql:4` | `20260428000005_add_chat_session_agent_metadata_merge_rpc.sql:4` | LIVE | `apps/web/src/lib/server/inbox-chat-session.service.ts:637` |
| `observe_agentic_chat_turn_cancellations` | `(jsonb)` | `20260802035000_agentic_chat_worker_cancel_observation.sql:11` | `20260802035000_agentic_chat_worker_cancel_observation.sql:11` | LIVE | `apps/worker/src/workers/agentic-chat/supabaseCancellationObserverAdapter.ts:16` |
| `persist_agentic_chat_counted_tool_validation_failure` | `(uuid, uuid, uuid, uuid, integer, uuid, integer, text, text, text, jsonb, text)` | `20260828214734_agentic_chat_validation_failure_count.sql:6` | `20260828214734_agentic_chat_validation_failure_count.sql:6` | LIVE | `apps/worker/src/workers/agentic-chat/toolExecution.ts:175` |
| `persist_agentic_chat_execution_observation` | `(uuid, uuid, uuid, uuid, integer, text, text, text, jsonb)` | `20260806010000_agentic_chat_execution_hardening.sql:50` | `20260902040000_agentic_chat_read_planning_observability.sql:122` | LIVE | `apps/worker/src/workers/agentic-chat/executionObservation.ts:76` |
| `persist_agentic_chat_mutation_tool_execution` | `(uuid, uuid, uuid, uuid, integer, uuid, text, uuid, integer, text, text, text, jsonb, integer, integer, boolean, jsonb)` | `20260809010000_agentic_chat_mutation_tool_execution_ledger.sql:47` | `20260809020000_agentic_chat_mutation_tool_execution_legacy_category.sql:9` | LIVE | `apps/worker/src/workers/agentic-chat/toolExecution.ts:212` |
| `persist_agentic_chat_prompt_snapshot` | `(uuid, uuid, uuid, uuid, integer, uuid, jsonb, text, text, integer, integer, integer)` | `20260804032000_agentic_chat_prompt_snapshot.sql:10` | `20260804032000_agentic_chat_prompt_snapshot.sql:10` | LIVE | `apps/worker/src/workers/agentic-chat/promptSnapshot.ts:55` |
| `persist_agentic_chat_prompt_snapshot_v2` | `(uuid, uuid, uuid, uuid, integer, uuid, jsonb, jsonb, text, text, text, integer, integer, integer)` | `20260813050000_agentic_chat_prompt_snapshot_tool_definitions.sql:12` | `20260813050000_agentic_chat_prompt_snapshot_tool_definitions.sql:12` | LIVE | `SQL supabase/migrations/20260817010000_agentic_chat_prompt_snapshot_runtime_augmentation.sql:73` |
| `persist_agentic_chat_prompt_snapshot_v3` | `(uuid, uuid, uuid, uuid, integer, uuid, jsonb, jsonb, text, text, text, integer, integer, integer)` | `20260817010000_agentic_chat_prompt_snapshot_runtime_augmentation.sql:7` | `20260817010000_agentic_chat_prompt_snapshot_runtime_augmentation.sql:7` | LIVE | `apps/worker/src/workers/agentic-chat/promptSnapshot.ts:74` |
| `persist_agentic_chat_provider_attempt_observation` | `(uuid, uuid, uuid, uuid, integer, text, text, text, jsonb)` | `20260828221405_agentic_chat_provider_pass_telemetry.sql:83` | `20260828221405_agentic_chat_provider_pass_telemetry.sql:83` | LIVE | `apps/worker/src/workers/agentic-chat/executionObservation.ts:75` |
| `persist_agentic_chat_read_tool_execution` | `(uuid, uuid, uuid, uuid, integer, uuid, integer, text, text, text, jsonb, jsonb, integer, boolean, integer, integer, boolean, jsonb)` | `20260804036000_agentic_chat_read_tool_execution_ledger.sql:141` | `20260804036000_agentic_chat_read_tool_execution_ledger.sql:141` | LIVE | `apps/worker/src/workers/agentic-chat/toolExecution.ts:94` |
| `persist_agentic_chat_semantic_event` | `(uuid, uuid, uuid, integer, uuid, text, text, text, jsonb, jsonb)` | `20260802033200_agentic_chat_worker_stream_write_rpcs.sql:246` | `20260802033200_agentic_chat_worker_stream_write_rpcs.sql:246` | LIVE | `apps/worker/src/workers/agentic-chat/supabaseStreamPublisherAdapters.ts:85` |
| `persist_agentic_chat_session_handoff` | `(uuid, uuid, uuid, uuid, integer, text, uuid, uuid)` | `20260828040905_agentic_chat_worker_session_handoff.sql:7` | `20260828040905_agentic_chat_worker_session_handoff.sql:7` | LIVE | `apps/worker/src/workers/agentic-chat/sessionHandoff.ts:51` |
| `persist_agentic_chat_text_batch` | `(uuid, uuid, uuid, integer, uuid, text, text)` | `20260802033200_agentic_chat_worker_stream_write_rpcs.sql:10` | `20260806020000_agentic_chat_timing_evidence_repair.sql:75` | LIVE | `SQL supabase/migrations/20260802033200_agentic_chat_worker_stream_write_rpcs.sql:574` |
| `persist_agentic_chat_tool_validation_failure` | `(uuid, uuid, uuid, uuid, integer, uuid, integer, text, text, text, jsonb, text)` | `20260808130000_agentic_chat_tool_validation_failure_ledger.sql:7` | `20260808130000_agentic_chat_tool_validation_failure_ledger.sql:7` | LIVE | `apps/worker/src/workers/agentic-chat/toolExecution.ts:176` |
| `reconcile_agentic_chat_effect` | `(uuid, uuid, uuid, uuid, integer, text, text, jsonb, text)` | `20260801041100_agentic_chat_worker_effect_rpcs.sql:434` | `20260801041100_agentic_chat_worker_effect_rpcs.sql:434` | LIVE | `apps/worker/src/workers/agentic-chat/effectControl.ts:102` |
| `reconcile_agentic_chat_turn` | `(uuid, uuid, integer, integer)` | `20260802037000_agentic_chat_worker_reconciliation.sql:9` | `20260802037000_agentic_chat_worker_reconciliation.sql:9` | LIVE | `apps/web/src/lib/services/agentic-chat-v2/reconciliation.server.ts:24` |
| `record_agentic_chat_effect_uncertain_reconciliation` | `()` | `20260820010000_agentic_chat_worker_retention_cleanup.sql:50` | `20260820010000_agentic_chat_worker_retention_cleanup.sql:50` | LIVE | `trigger zz_trg_chat_turn_effects_uncertain_reconciliation @ supabase/migrations/20260820010000_agentic_chat_worker_retention_cleanup.sql:71` |
| `recover_agentic_chat_resume_checkpoints` | `(uuid, timestamptz, timestamptz)` | `20260813020000_agentic_chat_checkpoint_resume_lifecycle.sql:238` | `20260813020000_agentic_chat_checkpoint_resume_lifecycle.sql:238` | LIVE | `apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/checkpoint-service.server.ts:318` |
| `recover_agentic_chat_turn` | `(uuid, uuid, uuid, integer, text, text)` | `20260802031000_agentic_chat_worker_execution_recovery.sql:213` | `20260802031000_agentic_chat_worker_execution_recovery.sql:213` | LIVE | `apps/worker/src/workers/agentic-chat/executionControl.ts:149` |
| `reject_active_agentic_chat_input_artifact_delete` | `()` | `20260801010000_agentic_chat_worker_phase2a_trust_foundation.sql:239` | `20260820010000_agentic_chat_worker_retention_cleanup.sql:129` | LIVE | `trigger trg_chat_turn_input_artifacts_active_retention @ supabase/migrations/20260801010000_agentic_chat_worker_phase2a_trust_foundation.sql:262` |
| `reject_agentic_chat_execution_mode_change` | `()` | `20260801010000_agentic_chat_worker_phase2a_trust_foundation.sql:136` | `20260801010000_agentic_chat_worker_phase2a_trust_foundation.sql:136` | LIVE | `trigger trg_chat_turn_runs_execution_mode_immutable @ supabase/migrations/20260801010000_agentic_chat_worker_phase2a_trust_foundation.sql:153` |
| `reject_agentic_chat_input_artifact_update` | `()` | `20260801010000_agentic_chat_worker_phase2a_trust_foundation.sql:220` | `20260801010000_agentic_chat_worker_phase2a_trust_foundation.sql:220` | LIVE | `trigger trg_chat_turn_input_artifacts_immutable @ supabase/migrations/20260801010000_agentic_chat_worker_phase2a_trust_foundation.sql:235` |
| `reject_protected_agentic_chat_effect_delete` | `()` | `20260801041000_agentic_chat_worker_effect_foundation.sql:160` | `20260820010000_agentic_chat_worker_retention_cleanup.sql:75` | LIVE | `trigger trg_chat_turn_effects_protected_delete @ supabase/migrations/20260801041000_agentic_chat_worker_effect_foundation.sql:186` |
| `request_agentic_chat_turn_cancel` | `(uuid, uuid, text, text)` | `20260802030500_agentic_chat_worker_terminal_control_rpcs.sql:486` | `20260802030500_agentic_chat_worker_terminal_control_rpcs.sql:486` | LIVE | `apps/web/src/lib/services/agentic-chat-v2/worker-turn-gateway.server.ts:27` |
| `reserve_agentic_chat_effect` | `(uuid, uuid, uuid, uuid, integer, text, text, text, boolean, text)` | `20260801041100_agentic_chat_worker_effect_rpcs.sql:12` | `20260801041100_agentic_chat_worker_effect_rpcs.sql:12` | LIVE | `apps/worker/src/workers/agentic-chat/effectControl.ts:74` |
| `resolve_agentic_chat_resume_checkpoint_on_terminal` | `()` | `20260813020000_agentic_chat_checkpoint_resume_lifecycle.sql:142` | `20260813020000_agentic_chat_checkpoint_resume_lifecycle.sql:142` | LIVE | `trigger trg_chat_turn_runs_checkpoint_resume_terminal @ supabase/migrations/20260813020000_agentic_chat_checkpoint_resume_lifecycle.sql:234` |
| `validate_agentic_chat_attachment_contract` | `()` | `20260812030000_agentic_chat_attachment_reference_contract.sql:367` | `20260812030000_agentic_chat_attachment_reference_contract.sql:367` | LIVE | `trigger trg_chat_turn_input_artifacts_attachment_contract @ supabase/migrations/20260812030000_agentic_chat_attachment_reference_contract.sql:512` |
| `validate_agentic_chat_domain_metadata_snapshot_v1` | `()` | `20260813070000_agentic_chat_terminal_domain_metadata.sql:286` | `20260813070000_agentic_chat_terminal_domain_metadata.sql:286` | LIVE | `trigger trg_chat_turn_input_artifacts_zz_domain_metadata @ supabase/migrations/20260813070000_agentic_chat_terminal_domain_metadata.sql:346` |
| `validate_agentic_chat_input_artifact_link` | `()` | `20260801010000_agentic_chat_worker_phase2a_trust_foundation.sql:285` | `20260801010000_agentic_chat_worker_phase2a_trust_foundation.sql:285` | LIVE | `trigger trg_chat_turn_runs_input_artifact_scope @ supabase/migrations/20260801010000_agentic_chat_worker_phase2a_trust_foundation.sql:310` |
| `validate_agentic_chat_input_artifact_version` | `()` | `20260804000000_agentic_chat_input_v3_lifecycle_snapshots.sql:19` | `20260804000000_agentic_chat_input_v3_lifecycle_snapshots.sql:19` | LIVE | `trigger trg_chat_turn_input_artifacts_version @ supabase/migrations/20260804000000_agentic_chat_input_v3_lifecycle_snapshots.sql:71` |
| `validate_agentic_chat_live_vision_policy` | `()` | `20260812040000_agentic_chat_live_vision_resolution_receipts.sql:11` | `20260812040000_agentic_chat_live_vision_resolution_receipts.sql:11` | LIVE | `trigger trg_chat_turn_input_artifacts_live_vision_policy @ supabase/migrations/20260812040000_agentic_chat_live_vision_resolution_receipts.sql:54` |
| `validate_agentic_chat_message_idempotency_key` | `()` | `20260802029900_agentic_chat_worker_message_idempotency_guard.sql:46` | `20260802029900_agentic_chat_worker_message_idempotency_guard.sql:46` | LIVE | `trigger trg_chat_messages_agentic_chat_idempotency @ supabase/migrations/20260802029900_agentic_chat_worker_message_idempotency_guard.sql:94` |
| `validate_agentic_chat_prepared_history_currency` | `()` | `20260812000000_agentic_chat_prepared_history_currency_guard.sql:12` | `20260831003232_fix_agentic_chat_history_state_trigger_composition.sql:10` | LIVE | `trigger trg_chat_turn_input_artifacts_prepared_history_currency @ supabase/migrations/20260812000000_agentic_chat_prepared_history_currency_guard.sql:59` |
| `validate_agentic_chat_signal_write` | `()` | `20260801030500_agentic_chat_worker_stream_signal_foundation.sql:189` | `20260801030500_agentic_chat_worker_stream_signal_foundation.sql:189` | LIVE | `trigger trg_chat_turn_signals_validate @ supabase/migrations/20260801030500_agentic_chat_worker_stream_signal_foundation.sql:278` |
| `validate_agentic_chat_stream_state_write` | `()` | `20260801030500_agentic_chat_worker_stream_signal_foundation.sql:62` | `20260802033000_agentic_chat_worker_stream_write_foundation.sql:50` | LIVE | `trigger trg_chat_turn_stream_state_validate @ supabase/migrations/20260801030500_agentic_chat_worker_stream_signal_foundation.sql:134` |
| `validate_agentic_chat_tool_effect_scope` | `()` | `20260801041000_agentic_chat_worker_effect_foundation.sql:193` | `20260801041000_agentic_chat_worker_effect_foundation.sql:193` | LIVE | `trigger trg_chat_tool_executions_effect_scope @ supabase/migrations/20260811230000_agentic_chat_effect_scope_trigger_null_guard.sql:15` |
| `validate_agentic_chat_turn_event_write` | `()` | `20260802030000_agentic_chat_worker_event_identity_foundation.sql:38` | `20260802030000_agentic_chat_worker_event_identity_foundation.sql:38` | LIVE | `trigger trg_chat_turn_events_validate @ supabase/migrations/20260802030000_agentic_chat_worker_event_identity_foundation.sql:95` |
| `validate_agentic_chat_turn_intent_snapshot_v1` | `()` | `20260813060000_agentic_chat_terminal_pending_intent_metadata.sql:98` | `20260813060000_agentic_chat_terminal_pending_intent_metadata.sql:98` | LIVE | `trigger trg_chat_turn_input_artifacts_z_turn_intent @ supabase/migrations/20260813060000_agentic_chat_terminal_pending_intent_metadata.sql:222` |
