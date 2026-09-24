<!-- docs/technical/reviews/supabase-health/2026-09-24/qa-report.md -->

# Supabase health — daudvqczjqxhpzstlfih

Collected 2026-09-24T17:19:53.415449+00:00. Source: saved read-only snapshot.

Times below are PostgreSQL execution times, not HTTP latency or percentiles. Counters cover their own reset windows and can include previous code versions, operator diagnostics, and evicted entries. Do not sum nested and top-level timings if tracking mode changes.

```json
{
	"bytes": 390763311,
	"stats": {
		"datid": "5",
		"datname": "postgres",
		"blks_hit": 286815831,
		"sessions": 111278,
		"blks_read": 64581,
		"conflicts": 0,
		"deadlocks": 674,
		"temp_bytes": 115856525455,
		"temp_files": 37342,
		"active_time": 23948572.5,
		"numbackends": 8,
		"stats_reset": "2026-08-25T20:38:15.05763+00:00",
		"tup_deleted": 153936,
		"tup_fetched": 158079495,
		"tup_updated": 191894,
		"xact_commit": 1372256,
		"session_time": 4727002734.665,
		"tup_inserted": 391234,
		"tup_returned": 2233842606,
		"blk_read_time": 0,
		"xact_rollback": 98213,
		"blk_write_time": 0,
		"sessions_fatal": 0,
		"sessions_killed": 10,
		"checksum_failures": 0,
		"sessions_abandoned": 18,
		"checksum_last_failure": null,
		"idle_in_transaction_time": 1362855.497
	},
	"database": "postgres",
	"started_at": "2026-09-11T01:18:36.673716+00:00",
	"observed_at": "2026-09-24T17:19:57.574743+00:00",
	"statements_info": {
		"dealloc": 23,
		"stats_reset": "2026-09-11T01:11:35.305801+00:00"
	},
	"transaction_read_only": "on"
}
```

## Top 20 by total execution time

| Query ID / role OID            | SQL shape                                                                                            |   Calls |  Total s | Mean ms |   Max ms | Blocks read | Temp blocks written |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | ------: | -------: | ------: | -------: | ----------: | ------------------: |
| `8073567005574114929` / 16478  | SELECT/RPC claim_pending_jobs                                                                        | 151,176 | 1,847.80 |   12.22 | 7,782.86 |           0 |                   0 |
| `-2025370557647521259` / 16478 | SELECT/RPC persist_agentic_chat_semantic_event                                                       |  17,305 |   964.50 |   55.74 | 6,612.69 |         210 |                   0 |
| `3988854028208233806` / 16478  | SELECT/RPC observe_agentic_chat_turn_cancellations                                                   |  16,557 |   857.48 |   51.79 | 7,857.00 |           0 |                   0 |
| `-86378621254902171` / 16478   | DELETE FROM onto_projects                                                                            |   1,353 |   725.32 |  536.08 | 6,310.31 |           7 |                   0 |
| `3248400240373745198` / 16478  | SELECT/RPC reconcile_agentic_chat_turn                                                               |  12,752 |   547.56 |   42.94 | 7,911.15 |          17 |                   0 |
| `-1910831359249200216` / 16478 | SELECT/RPC acknowledge_agentic_chat_stream_delivery                                                  |  18,309 |   532.41 |   29.08 | 5,704.90 |           2 |                   0 |
| `4641728520548500675` / 16478  | SELECT/RPC create_agentic_chat_turn_with_job                                                         |   1,601 |   529.92 |  330.99 | 6,102.88 |          44 |                   0 |
| `4710483520943389857` / 16478  | SELECT/RPC finalize_agentic_chat_turn_with_terminal_events                                           |   1,548 |   522.25 |  337.37 | 6,476.05 |          34 |                   0 |
| `-753657135885790294` / 16478  | SELECT/RPC persist_agentic_chat_provider_attempt_observation                                         |   8,744 |   510.72 |   58.41 | 7,539.34 |          73 |                   0 |
| `-827995166086297652` / 16478  | SELECT/RPC persist_agentic_chat_prompt_snapshot_v3                                                   |   1,569 |   471.41 |  300.45 | 7,028.56 |          10 |                   0 |
| `6226398489387947042` / 16478  | SELECT/RPC persist_agentic_chat_execution_observation                                                |   8,560 |   450.50 |   52.63 | 6,558.85 |          12 |                   0 |
| `-2404184757309317838` / 16478 | SELECT/RPC persist_agentic_chat_read_tool_execution                                                  |   2,801 |   359.03 |  128.18 | 7,067.16 |          15 |                   0 |
| `-4721591859456279780` / 16477 | SELECT/RPC load_fastchat_context                                                                     |   1,487 |   355.14 |  238.83 | 4,956.04 |           0 |                   0 |
| `-3489638461111459862` / 10    | realtime.list_changes                                                                                |  20,487 |   298.89 |   14.59 |   868.47 |           1 |                   0 |
| `6853360515440450587` / 16478  | SELECT/RPC claim_agentic_chat_turn                                                                   |   4,328 |   284.51 |   65.74 | 4,306.10 |           0 |                   0 |
| `-1208810832848109643` / 16479 | WITH base_types AS ( WITH RECURSIVE recurse AS ( SELECT oid, typbasetype, typnamespace AS base_names |   1,500 |   281.90 |  187.93 | 1,667.14 |         152 |             154,547 |
| `1374137181295181563` / 16479  | SELECT name FROM pg_timezone_names                                                                   |   1,500 |   260.46 |  173.64 | 2,437.05 |           0 |                   0 |
| `-6072101164044309806` / 16478 | INSERT INTO llm_usage_logs                                                                           |   3,810 |   254.36 |   66.76 | 6,522.08 |           4 |                   0 |
| `-7046832244166701603` / 16478 | SELECT/RPC onto_project_doc_structure_update_atomic                                                  |   1,903 |   251.63 |  132.23 | 4,073.08 |           7 |                   0 |
| `-8624772272815785795` / 16478 | INSERT INTO onto_projects                                                                            |   1,373 |   209.80 |  152.80 | 6,592.19 |          10 |                   0 |

## Top 20 by calls

| Query ID / role OID            | SQL shape                                                                                            |   Calls |  Total s | Mean ms |   Max ms | Blocks read | Temp blocks written |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | ------: | -------: | ------: | -------: | ----------: | ------------------: |
| `-6161800192636870106` / 16478 | select set_config('[literal]', $1, true), set_config('[literal]', $2, true), set_config('[literal]', | 371,212 |    76.63 |    0.21 |   838.42 |           0 |                   0 |
| `8073567005574114929` / 16478  | SELECT/RPC claim_pending_jobs                                                                        | 151,176 | 1,847.80 |   12.22 | 7,782.86 |           0 |                   0 |
| `-8342133797375863531` / 16478 | NEW.input_artifact_id IS NOT NULL AND NOT EXISTS ( SELECT $18 FROM public.chat_turn_input_artifacts  |  46,804 |     2.68 |    0.06 |    69.32 |           0 |                   0 |
| `-1619054212951445842` / 16477 | select set_config('[literal]', $1, true), set_config($2, $3, true), set_config('[literal]', $4, true |  30,182 |    11.96 |    0.40 |   796.32 |           0 |                   0 |
| `-3489638461111459862` / 10    | realtime.list_changes                                                                                |  20,487 |   298.89 |   14.59 |   868.47 |           1 |                   0 |
| `-1910831359249200216` / 16478 | SELECT/RPC acknowledge_agentic_chat_stream_delivery                                                  |  18,309 |   532.41 |   29.08 | 5,704.90 |           2 |                   0 |
| `-2025370557647521259` / 16478 | SELECT/RPC persist_agentic_chat_semantic_event                                                       |  17,305 |   964.50 |   55.74 | 6,612.69 |         210 |                   0 |
| `-1977551142665435827` / 16533 | SELECT mfa_factors.created_at, mfa_factors.factor_type, mfa_factors.friendly_name, mfa_factors.id, m |  16,944 |     2.51 |    0.15 |    85.39 |           0 |                   0 |
| `-6741714421281226334` / 16533 | SELECT identities.created_at, identities.email, identities.id, identities.identity_data, identities. |  16,944 |     2.24 |    0.13 |    68.85 |           0 |                   0 |
| `2378097356691258145` / 16533  | SELECT sessions.aal, sessions.created_at, sessions.factor_id, sessions.id, sessions.ip, sessions.not |  16,915 |     4.25 |    0.25 |   259.64 |           0 |                   0 |
| `9039850951332189225` / 16533  | SELECT mfa_amr_claims.authentication_method, mfa_amr_claims.created_at, mfa_amr_claims.id, mfa_amr_c |  16,915 |     1.89 |    0.11 |   110.29 |           0 |                   0 |
| `6097116438742246222` / 16533  | SELECT users.aud, users.banned_until, users.confirmation_sent_at, users.confirmation_token, users.co |  16,728 |     7.69 |    0.46 |   172.86 |           0 |                   0 |
| `3988854028208233806` / 16478  | SELECT/RPC observe_agentic_chat_turn_cancellations                                                   |  16,557 |   857.48 |   51.79 | 7,857.00 |           0 |                   0 |
| `2613261722393013028` / 16477  | SELECT/RPC users                                                                                     |  16,358 |     7.81 |    0.48 |   213.55 |           0 |                   0 |
| `3248400240373745198` / 16478  | SELECT/RPC reconcile_agentic_chat_turn                                                               |  12,752 |   547.56 |   42.94 | 7,911.15 |          17 |                   0 |
| `-753657135885790294` / 16478  | SELECT/RPC persist_agentic_chat_provider_attempt_observation                                         |   8,744 |   510.72 |   58.41 | 7,539.34 |          73 |                   0 |
| `6226398489387947042` / 16478  | SELECT/RPC persist_agentic_chat_execution_observation                                                |   8,560 |   450.50 |   52.63 | 6,558.85 |          12 |                   0 |
| `-4126166512466496573` / 16478 | SELECT/RPC llm_usage_logs                                                                            |   4,666 |     2.70 |    0.58 |   223.16 |           0 |                   0 |
| `-8973851897831304683` / 16478 | SELECT/RPC chat_turn_runs                                                                            |   4,386 |     0.91 |    0.21 |   140.00 |           0 |                   0 |
| `6853360515440450587` / 16478  | SELECT/RPC claim_agentic_chat_turn                                                                   |   4,328 |   284.51 |   65.74 | 4,306.10 |           0 |                   0 |

## Top 20 by maximum execution time

| Query ID / role OID            | SQL shape                                                                                             |   Calls |  Total s |   Mean ms |    Max ms | Blocks read | Temp blocks written |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- | ------: | -------: | --------: | --------: | ----------: | ------------------: |
| `5451368687170242357` / 16427  | select p.proname, pg_size_pretty(avg(pg_column_size(s.\*))::bigint) avg_row, pg_size_pretty(max(pg_co |       1 |    25.71 | 25,708.48 | 25,708.48 |      11,251 |                   0 |
| `3248400240373745198` / 16478  | SELECT/RPC reconcile_agentic_chat_turn                                                                |  12,752 |   547.56 |     42.94 |  7,911.15 |          17 |                   0 |
| `3988854028208233806` / 16478  | SELECT/RPC observe_agentic_chat_turn_cancellations                                                    |  16,557 |   857.48 |     51.79 |  7,857.00 |           0 |                   0 |
| `8073567005574114929` / 16478  | SELECT/RPC claim_pending_jobs                                                                         | 151,176 | 1,847.80 |     12.22 |  7,782.86 |           0 |                   0 |
| `-753657135885790294` / 16478  | SELECT/RPC persist_agentic_chat_provider_attempt_observation                                          |   8,744 |   510.72 |     58.41 |  7,539.34 |          73 |                   0 |
| `-3750485010128303337` / 16478 | SELECT/RPC onto_search_entities                                                                       |     231 |   123.11 |    532.95 |  7,408.65 |           0 |                   0 |
| `-7470775121542680431` / 16478 | SELECT/RPC finalize_agentic_chat_turn                                                                 |      11 |    15.25 |  1,386.76 |  7,216.51 |           2 |                   0 |
| `-2404184757309317838` / 16478 | SELECT/RPC persist_agentic_chat_read_tool_execution                                                   |   2,801 |   359.03 |    128.18 |  7,067.16 |          15 |                   0 |
| `-827995166086297652` / 16478  | SELECT/RPC persist_agentic_chat_prompt_snapshot_v3                                                    |   1,569 |   471.41 |    300.45 |  7,028.56 |          10 |                   0 |
| `-2025370557647521259` / 16478 | SELECT/RPC persist_agentic_chat_semantic_event                                                        |  17,305 |   964.50 |     55.74 |  6,612.69 |         210 |                   0 |
| `-8624772272815785795` / 16478 | INSERT INTO onto_projects                                                                             |   1,373 |   209.80 |    152.80 |  6,592.19 |          10 |                   0 |
| `6226398489387947042` / 16478  | SELECT/RPC persist_agentic_chat_execution_observation                                                 |   8,560 |   450.50 |     52.63 |  6,558.85 |          12 |                   0 |
| `-9141211176195814770` / 16478 | SELECT/RPC get_project_document_tree_metadata                                                         |   1,908 |    24.25 |     12.71 |  6,530.01 |           0 |                   0 |
| `-6072101164044309806` / 16478 | INSERT INTO llm_usage_logs                                                                            |   3,810 |   254.36 |     66.76 |  6,522.08 |           4 |                   0 |
| `4710483520943389857` / 16478  | SELECT/RPC finalize_agentic_chat_turn_with_terminal_events                                            |   1,548 |   522.25 |    337.37 |  6,476.05 |          34 |                   0 |
| `7512473918656696221` / 16478  | INSERT INTO onto_project_logs                                                                         |   1,378 |    63.95 |     46.41 |  6,419.38 |           3 |                   0 |
| `-6901561773274055917` / 16478 | SELECT/RPC finalize_agentic_chat_turn_with_failure_events                                             |      43 |    27.40 |    637.15 |  6,335.75 |           3 |                   0 |
| `-86378621254902171` / 16478   | DELETE FROM onto_projects                                                                             |   1,353 |   725.32 |    536.08 |  6,310.31 |           7 |                   0 |
| `4641728520548500675` / 16478  | SELECT/RPC create_agentic_chat_turn_with_job                                                          |   1,601 |   529.92 |    330.99 |  6,102.88 |          44 |                   0 |
| `-1910831359249200216` / 16478 | SELECT/RPC acknowledge_agentic_chat_stream_delivery                                                   |  18,309 |   532.41 |     29.08 |  5,704.90 |           2 |                   0 |

## Largest tables (includes indexes and TOAST)

| Table                                      |    MiB |  Heap | Index |  TOAST | Live estimate | Dead estimate | Updates | HOT % | Autovacuums |
| ------------------------------------------ | -----: | ----: | ----: | -----: | ------------: | ------------: | ------: | ----: | ----------: |
| public.chat_prompt_snapshots               | 121.87 |  3.07 |  0.59 | 118.18 |         1,569 |           201 |   3,138 |  68.1 |          13 |
| public.chat_turn_input_artifacts           |  70.10 |  1.00 |  0.49 |  68.58 |         1,605 |             0 |       0 |   0.0 |           1 |
| public.chat_turn_events                    |  33.06 | 18.86 | 11.80 |   2.38 |        22,119 |             8 |       0 |   0.0 |           7 |
| public.queue_jobs                          |  18.39 |  7.98 | 10.38 |   0.01 |        14,339 |         1,504 |   4,890 |   0.0 |           7 |
| public.agentic_chat_execution_observations |  17.23 | 12.98 |  4.21 |   0.01 |        17,300 |             0 |       0 |   0.0 |           6 |
| public.chat_turn_stream_state              |  15.76 |  1.95 |  0.38 |  13.40 |         1,605 |           323 |  39,158 |   0.0 |         210 |
| public.llm_usage_logs                      |  12.82 |  7.06 |  5.72 |   0.01 |         5,114 |         1,000 |   4,336 |   0.0 |          11 |
| public.chat_tool_executions                |  10.85 |  6.44 |  2.85 |   1.53 |         4,281 |           568 |   4,182 |  50.0 |           7 |
| public.chat_messages                       |   6.52 |  3.61 |  2.03 |   0.85 |         3,160 |             2 |       3 | 100.0 |           2 |
| public.chat_turn_runs                      |   5.71 |  2.27 |  1.62 |   1.79 |         1,605 |           353 |  45,208 |  23.6 |         188 |
| public.chat_sessions                       |   5.17 |  0.65 |  1.56 |   2.93 |         1,401 |           250 |  10,165 |  18.6 |          57 |
| public.agentic_chat_prepared_prompts       |   4.37 |  0.40 |  0.15 |   3.79 |           203 |            65 |     199 |   0.0 |           2 |
| public.onto_documents                      |   2.80 |  0.09 |  2.36 |   0.32 |            24 |            35 |   2,395 |   5.6 |          75 |
| public.chat_turn_effects                   |   2.18 |  1.68 |  0.40 |   0.07 |         1,476 |            92 |   2,952 |   0.0 |          18 |
| public.onto_projects                       |   1.30 |  0.11 |  1.11 |   0.05 |            11 |             8 |   1,913 |   0.0 |          61 |
| public.onto_tasks                          |   0.88 |  0.09 |  0.75 |   0.01 |            58 |            25 |     147 |   0.0 |          57 |
| public.onto_goals                          |   0.59 |  0.03 |  0.51 |   0.02 |             1 |            32 |       4 |  75.0 |           0 |
| public.agent_runs                          |   0.55 |  0.02 |  0.11 |   0.41 |            11 |            19 |      16 |   0.0 |           0 |
| public.onto_plans                          |   0.45 |  0.02 |  0.40 |   0.01 |             9 |            36 |      36 |   0.0 |           0 |
| public.onto_document_versions              |   0.35 |  0.05 |  0.05 |   0.22 |             9 |            25 |      16 | 100.0 |           6 |
| public.onto_project_logs                   |   0.34 |  0.10 |  0.19 |   0.02 |           127 |            26 |       0 |   0.0 |         101 |
| public.onto_edges                          |   0.27 |  0.02 |  0.22 |   0.01 |            17 |            12 |      51 |  94.1 |           6 |
| public.tasks                               |   0.27 |  0.00 |  0.26 |   0.01 |             0 |             0 |       0 |   0.0 |           0 |
| public.onto_risks                          |   0.27 |  0.01 |  0.25 |   0.01 |             4 |             0 |       0 |   0.0 |           0 |
| public.agentic_chat_context_snapshots      |   0.25 |  0.01 |  0.05 |   0.16 |             6 |            17 |      14 |   0.0 |          28 |

## Largest zero-scan indexes

Observation only: zero scans do not establish that an index is safe to drop. Constraints, rare operations, reset windows, and FK checks matter.

| Index                                      | Table                                      |  MiB | Unique | Constraint-backed |
| ------------------------------------------ | ------------------------------------------ | ---: | ------ | ----------------- |
| idx_queue_jobs_metadata_gin                | public.queue_jobs                          | 2.72 | False  | False             |
| idx_chat_turn_events_session_user_created  | public.chat_turn_events                    | 1.68 | False  | False             |
| queue_jobs_queue_job_id_key                | public.queue_jobs                          | 1.44 | True   | True              |
| idx_onto_documents_props_trgm              | public.onto_documents                      | 1.29 | False  | False             |
| chat_turn_events_pkey                      | public.chat_turn_events                    | 0.91 | True   | True              |
| idx_llm_usage_logs_operation               | public.llm_usage_logs                      | 0.59 | False  | False             |
| idx_llm_usage_logs_model                   | public.llm_usage_logs                      | 0.53 | False  | False             |
| idx_llm_usage_logs_model_created_at        | public.llm_usage_logs                      | 0.50 | False  | False             |
| idx_queue_jobs_pending_claim               | public.queue_jobs                          | 0.48 | False  | False             |
| idx_llm_usage_logs_client_turn_created     | public.llm_usage_logs                      | 0.46 | False  | False             |
| idx_llm_usage_logs_user_created            | public.llm_usage_logs                      | 0.44 | False  | False             |
| idx_onto_documents_search_vector           | public.onto_documents                      | 0.43 | False  | False             |
| idx_llm_usage_logs_openrouter_request_id   | public.llm_usage_logs                      | 0.42 | False  | False             |
| idx_onto_projects_description              | public.onto_projects                       | 0.40 | False  | False             |
| idx_llm_usage_logs_operation_created_at    | public.llm_usage_logs                      | 0.40 | False  | False             |
| agentic_chat_execution_observations_pkey   | public.agentic_chat_execution_observations | 0.39 | True   | True              |
| idx_chat_tool_executions_tool_created      | public.chat_tool_executions                | 0.37 | False  | False             |
| idx_chat_sessions_user_recent_active       | public.chat_sessions                       | 0.36 | False  | False             |
| idx_llm_usage_logs_user_cost               | public.llm_usage_logs                      | 0.33 | False  | False             |
| idx_chat_tool_executions_category_created  | public.chat_tool_executions                | 0.29 | False  | False             |
| idx_chat_tool_executions_success_created   | public.chat_tool_executions                | 0.29 | False  | False             |
| idx_chat_turn_stream_state_session_updated | public.chat_turn_stream_state              | 0.27 | False  | False             |
| idx_llm_usage_logs_user_created_at         | public.llm_usage_logs                      | 0.26 | False  | False             |
| idx_queue_jobs_metadata_project_id         | public.queue_jobs                          | 0.25 | False  | False             |
| idx_chat_tool_executions_created_at        | public.chat_tool_executions                | 0.22 | False  | False             |

## Advisor counts

| Kind        | Finding                                            | Count |
| ----------- | -------------------------------------------------- | ----: |
| security    | authenticated_security_definer_function_executable |   115 |
| security    | function_search_path_mutable                       |   112 |
| security    | anon_security_definer_function_executable          |    96 |
| security    | rls_enabled_no_policy                              |    53 |
| security    | extension_in_public                                |     4 |
| security    | auth_otp_long_expiry                               |     1 |
| security    | auth_leaked_password_protection                    |     1 |
| performance | unused_index                                       |   871 |
| performance | multiple_permissive_policies                       |   551 |
| performance | auth_rls_initplan                                  |   249 |
| performance | unindexed_foreign_keys                             |   190 |
| performance | auth_db_connections_absolute                       |     1 |
