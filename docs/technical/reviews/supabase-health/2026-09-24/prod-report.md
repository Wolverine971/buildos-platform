<!-- docs/technical/reviews/supabase-health/2026-09-24/prod-report.md -->

# Supabase health — iwifjtlebphefldmwbkh

Collected 2026-09-24T17:19:48.858129+00:00. Source: saved read-only snapshot.

Times below are PostgreSQL execution times, not HTTP latency or percentiles. Counters cover their own reset windows and can include previous code versions, operator diagnostics, and evicted entries. Do not sum nested and top-level timings if tracking mode changes.

```json
{
	"bytes": 610194223,
	"stats": {
		"datid": "5",
		"datname": "postgres",
		"blks_hit": 75743667039,
		"sessions": 3024978,
		"blks_read": 5903859,
		"conflicts": 0,
		"deadlocks": 0,
		"temp_bytes": 5556188412665,
		"temp_files": 1197604,
		"active_time": 503693553.233,
		"numbackends": 15,
		"stats_reset": "2025-04-16T11:03:56.997116+00:00",
		"tup_deleted": 4445803,
		"tup_fetched": 45274608109,
		"tup_updated": 764493,
		"xact_commit": 107762942,
		"session_time": 416513418056.621,
		"tup_inserted": 4853012,
		"tup_returned": 129232731969,
		"blk_read_time": 0,
		"xact_rollback": 1325588,
		"blk_write_time": 0,
		"sessions_fatal": 0,
		"sessions_killed": 1,
		"checksum_failures": null,
		"sessions_abandoned": 139,
		"checksum_last_failure": null,
		"idle_in_transaction_time": 34182505.857
	},
	"database": "postgres",
	"started_at": "2025-04-28T03:56:57.263534+00:00",
	"observed_at": "2026-09-24T17:19:53.881048+00:00",
	"statements_info": {
		"dealloc": 12,
		"stats_reset": "2026-08-11T18:59:52.682029+00:00"
	},
	"transaction_read_only": "on"
}
```

## Top 20 by total execution time

| Query ID / role OID            | SQL shape                                                                                             |      Calls |  Total s |  Mean ms |    Max ms | Blocks read | Temp blocks written |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- | ---------: | -------: | -------: | --------: | ----------: | ------------------: |
| `-1244211463441676038` / 10    | realtime.list_changes                                                                                 |  1,509,075 | 9,463.14 |     6.27 | 10,484.12 |         198 |                   0 |
| `-2327107248597316362` / 16480 | SELECT/RPC claim_pending_jobs                                                                         | 13,314,205 | 2,106.83 |     0.16 |    159.06 |       1,466 |                   0 |
| `-2051358698060935295` / 16479 | SELECT/RPC agent_runs, onto_projects                                                                  |     44,627 |   876.61 |    19.64 |    717.91 |         383 |                   0 |
| `-6161800192636870106` / 16480 | select set_config('[literal]', $1, true), set_config('[literal]', $2, true), set_config('[literal]',  | 14,901,469 |   387.57 |     0.03 |     87.02 |          52 |                   0 |
| `3539838095694159883` / 16481  | WITH columns AS ( SELECT nc.nspname::name AS table_schema, c.relname::name AS table_name, a.attname:  |      1,015 |   222.55 |   219.26 |    932.07 |       3,331 |             123,777 |
| `-917864993417029807` / 16480  | INSERT INTO agentic_chat_prepared_prompts                                                             |     10,636 |   216.88 |    20.39 |    296.87 |       4,951 |                   0 |
| `-1260554882953010024` / 16479 | SELECT/RPC agent_runs, onto_projects                                                                  |     95,935 |   176.30 |     1.84 |     90.05 |         199 |                   0 |
| `1374137181295181563` / 16481  | SELECT name FROM pg_timezone_names                                                                    |      1,015 |   175.07 |   172.48 |    629.18 |           0 |                   0 |
| `2051372600341434634` / 16480  | INSERT INTO onto_embeddings                                                                           |        743 |   152.39 |   205.10 |  2,113.29 |      60,347 |                   0 |
| `4959214960458875162` / 16480  | SELECT/RPC refresh_sms_metrics_daily                                                                  |      1,533 |   116.27 |    75.85 |    787.63 |       3,851 |                   0 |
| `-4968881670149400243` / 16479 | SELECT/RPC load_fastchat_context                                                                      |      4,369 |   109.80 |    25.13 |    695.27 |         854 |                   0 |
| `-163698020578888185` / 16384  | with f as ( with functions as ( select \*, coalesce( p.proargmodes, array_fill($1::text, array[cardin |        138 |    81.90 |   593.47 |  1,088.73 |         494 |              15,089 |
| `-4067931195590211247` / 16480 | SELECT/RPC get_admin_dashboard_chat_usage                                                             |         43 |    78.22 | 1,819.07 |  3,098.80 |      17,252 |                   0 |
| `5039583862601996587` / 16480  | SELECT/RPC reset_stalled_jobs                                                                         |     92,152 |    72.86 |     0.79 |    111.86 |         434 |                   0 |
| `4288167062614706498` / 16479  | SELECT/RPC load_fastchat_context                                                                      |      1,577 |    69.04 |    43.78 |    758.39 |         678 |                   0 |
| `3910813797730834318` / 16480  | SELECT/RPC persist_agentic_chat_semantic_event                                                        |     11,831 |    67.20 |     5.68 |    165.10 |       8,467 |                   0 |
| `1387554379270893682` / 16480  | SELECT/RPC cleanup_agentic_chat_worker_artifacts                                                      |         49 |    59.33 | 1,210.88 |  3,756.19 |      27,788 |                   0 |
| `-1195393167539042252` / 16480 | SELECT/RPC observe_agentic_chat_turn_cancellations                                                    |     74,934 |    56.82 |     0.76 |    215.40 |          93 |                   0 |
| `5429516304775632291` / 16480  | SELECT/RPC get_onto_project_summaries_v1                                                              |      7,584 |    55.51 |     7.32 |    364.60 |       1,928 |                   0 |
| `755162456645557909` / 16480   | SELECT/RPC reconcile_agentic_chat_turn                                                                |     49,889 |    52.34 |     1.05 |  1,267.78 |         905 |                   0 |

## Top 20 by calls

| Query ID / role OID            | SQL shape                                                                                            |      Calls |  Total s | Mean ms |    Max ms | Blocks read | Temp blocks written |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------: | -------: | ------: | --------: | ----------: | ------------------: |
| `-6161800192636870106` / 16480 | select set_config('[literal]', $1, true), set_config('[literal]', $2, true), set_config('[literal]', | 14,901,469 |   387.57 |    0.03 |     87.02 |          52 |                   0 |
| `-2327107248597316362` / 16480 | SELECT/RPC claim_pending_jobs                                                                        | 13,314,205 | 2,106.83 |    0.16 |    159.06 |       1,466 |                   0 |
| `-1244211463441676038` / 10    | realtime.list_changes                                                                                |  1,509,075 | 9,463.14 |    6.27 | 10,484.12 |         198 |                   0 |
| `-1619054212951445842` / 16479 | select set_config('[literal]', $1, true), set_config($2, $3, true), set_config('[literal]', $4, true |    503,329 |    17.52 |    0.03 |      7.82 |           2 |                   0 |
| `-2407914024100690971` / 16535 | SELECT sessions.aal, sessions.created_at, sessions.factor_id, sessions.id, sessions.ip, sessions.not |    202,819 |     5.35 |    0.03 |      7.03 |         100 |                   0 |
| `8967690775825714418` / 16535  | SELECT mfa_amr_claims.authentication_method, mfa_amr_claims.created_at, mfa_amr_claims.id, mfa_amr_c |    202,812 |     3.87 |    0.02 |      9.33 |         122 |                   0 |
| `5205463632824262692` / 16535  | SELECT identities.created_at, identities.email, identities.id, identities.identity_data, identities. |    199,588 |     6.42 |    0.03 |      6.20 |          73 |                   0 |
| `4072614587127223683` / 16535  | SELECT mfa_factors.created_at, mfa_factors.factor_type, mfa_factors.friendly_name, mfa_factors.id, m |    199,588 |     1.87 |    0.01 |      1.89 |           7 |                   0 |
| `-3243400099343221335` / 16535 | SELECT users.aud, users.banned_until, users.confirmation_sent_at, users.confirmation_token, users.co |    199,108 |     8.85 |    0.04 |     10.73 |          38 |                   0 |
| `1778438801392625128` / 16480  | SELECT/RPC queue_jobs                                                                                |    192,595 |     6.60 |    0.03 |     14.89 |          14 |                   0 |
| `7722897642518585891` / 16479  | SELECT/RPC users                                                                                     |    190,887 |    18.63 |    0.10 |     35.97 |          13 |                   0 |
| `4243463304265105768` / 16480  | SELECT/RPC queue_jobs                                                                                |    181,014 |     4.83 |    0.03 |      4.07 |           2 |                   0 |
| `7558421993197381085` / 16385  | SELECT \* FROM pgbouncer.get_auth($1)                                                                |    137,224 |    14.96 |    0.11 |     38.19 |          37 |                   0 |
| `3960157135593997961` / 673750 | SELECT current_user::text AS role_name, role.rolcanlogin AS can_login, role.rolsuper AS is_superuser |    132,577 |    26.72 |    0.20 |     38.84 |          86 |                   0 |
| `-1260554882953010024` / 16479 | SELECT/RPC agent_runs, onto_projects                                                                 |     95,935 |   176.30 |    1.84 |     90.05 |         199 |                   0 |
| `5039583862601996587` / 16480  | SELECT/RPC reset_stalled_jobs                                                                        |     92,152 |    72.86 |    0.79 |    111.86 |         434 |                   0 |
| `-4436246621591381682` / 16480 | SELECT/RPC queue_jobs                                                                                |     88,031 |     1.94 |    0.02 |      2.17 |           0 |                   0 |
| `-8896550756678375077` / 16480 | SELECT/RPC queue_jobs                                                                                |     80,104 |     2.30 |    0.03 |      3.13 |          29 |                   0 |
| `-1195393167539042252` / 16480 | SELECT/RPC observe_agentic_chat_turn_cancellations                                                   |     74,934 |    56.82 |    0.76 |    215.40 |          93 |                   0 |
| `7439675109708785411` / 16480  | SELECT/RPC queue_jobs                                                                                |     62,290 |     1.82 |    0.03 |      1.29 |           0 |                   0 |

## Top 20 by maximum execution time

| Query ID / role OID            | SQL shape                                                                                            |     Calls |  Total s |  Mean ms |    Max ms | Blocks read | Temp blocks written |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | --------: | -------: | -------: | --------: | ----------: | ------------------: |
| `-1244211463441676038` / 10    | realtime.list_changes                                                                                | 1,509,075 | 9,463.14 |     6.27 | 10,484.12 |         198 |                   0 |
| `-7196494501888705501` / 16480 | UPDATE onto_projects                                                                                 |       220 |    17.70 |    80.47 |  7,632.27 |      11,477 |                   0 |
| `3982445106300127497` / 16422  | with tables as (SELECT c.oid :: int8 AS id, nc.nspname AS schema, c.relname AS name, c.relrowsecurit |         1 |     7.39 | 7,385.57 |  7,385.57 |           0 |                   0 |
| `2139995178883456328` / 16480  | SELECT/RPC cleanup_agentic_chat_prompt_artifacts                                                     |        28 |    44.89 | 1,603.29 |  6,638.10 |       8,973 |                   0 |
| `-2054820562454114702` / 16422 | with tables as (SELECT c.oid :: int8 AS id, nc.nspname AS schema, c.relname AS name, c.relrowsecurit |         7 |    33.66 | 4,808.82 |  6,623.76 |         102 |                   0 |
| `6978542015616761232` / 16480  | SELECT/RPC onto_search_semantic                                                                      |        27 |    29.03 | 1,075.34 |  5,351.73 |       1,566 |                   0 |
| `5612994904586648634` / 16480  | SELECT/RPC onto_search_semantic                                                                      |       225 |    14.79 |    65.72 |  5,184.59 |       1,397 |                   0 |
| `3032574603414263097` / 16384  | SELECT version, coalesce(name, $1) as name, statements FROM supabase_migrations.schema_migrations    |        21 |    44.48 | 2,117.99 |  5,067.37 |           0 |                   0 |
| `-3873733897595936084` / 16480 | SELECT/RPC onto_search_semantic                                                                      |        25 |    26.37 | 1,054.89 |  4,804.02 |          16 |                   0 |
| `1034264661570475770` / 16480  | SELECT/RPC cleanup_agentic_chat_sensitive_transcripts                                                |        35 |    45.56 | 1,301.78 |  4,243.36 |      23,593 |                   0 |
| `-4053741349183360732` / 16480 | SELECT/RPC cleanup_expired_agentic_chat_prepared_prompts                                             |         4 |    10.56 | 2,639.19 |  4,216.99 |       1,476 |                   0 |
| `-4738622811569993903` / 16480 | SELECT/RPC onto_search_semantic                                                                      |         2 |     3.92 | 1,961.88 |  3,873.18 |           8 |                   0 |
| `1387554379270893682` / 16480  | SELECT/RPC cleanup_agentic_chat_worker_artifacts                                                     |        49 |    59.33 | 1,210.88 |  3,756.19 |      27,788 |                   0 |
| `-4067931195590211247` / 16480 | SELECT/RPC get_admin_dashboard_chat_usage                                                            |        43 |    78.22 | 1,819.07 |  3,098.80 |      17,252 |                   0 |
| `2217102465540854843` / 16384  | select jsonb_build_object($1, (select jsonb_agg(to_jsonb(s)) from project_suggestions s where run_id |         1 |     3.07 | 3,073.12 |  3,073.12 |       1,490 |                   0 |
| `-206390752057540965` / 16480  | DELETE FROM chat_sessions                                                                            |        49 |    11.94 |   243.67 |  3,007.30 |       3,538 |                   0 |
| `7588572145416998859` / 16384  | ) stored                                                                                             |         2 |     2.98 | 1,489.87 |  2,978.11 |           3 |                   0 |
| `4763905530226242773` / 16480  | SELECT/RPC onto_search_semantic                                                                      |         5 |     4.81 |   961.11 |  2,939.30 |           0 |                   0 |
| `817830105285117439` / 16480   | SELECT/RPC cleanup_agentic_chat_prompt_artifacts                                                     |        32 |    30.56 |   954.98 |  2,711.20 |      17,969 |                   0 |
| `3211137318489683508` / 16384  | SELECT classid, objid, refclassid, refobjid, deptype FROM pg_depend WHERE deptype != $1 AND deptype  |         1 |     2.69 | 2,694.08 |  2,694.08 |           8 |                   0 |

## Largest tables (includes indexes and TOAST)

| Table                                      |   MiB |  Heap | Index | TOAST | Live estimate | Dead estimate | Updates | HOT % | Autovacuums |
| ------------------------------------------ | ----: | ----: | ----: | ----: | ------------: | ------------: | ------: | ----: | ----------: |
| public.onto_embeddings                     | 75.16 |  2.49 | 36.12 | 36.52 |         3,934 |            77 |     656 |   0.0 |           4 |
| public.llm_usage_logs                      | 48.34 | 22.57 | 25.73 |  0.01 |        24,632 |           967 |  12,031 |   1.9 |          13 |
| public.chat_tool_executions                | 34.93 |  8.53 |  4.39 | 21.98 |         1,324 |            39 |   3,499 |  55.2 |          16 |
| public.chat_messages                       | 21.63 |  5.24 |  3.45 | 12.91 |         6,400 |           394 |      36 |  52.8 |           4 |
| public.notification_logs                   | 19.95 | 15.02 |  4.89 |  0.01 |        11,763 |             0 |       0 |   0.0 |          11 |
| public.chat_sessions                       | 17.69 |  1.30 |  3.49 | 12.86 |         2,141 |           244 |  39,379 |  20.6 |         135 |
| public.chat_prompt_snapshots               | 15.99 |  0.33 |  0.45 | 15.19 |            67 |            46 |   1,590 |  52.7 |          24 |
| public.chat_turn_events                    | 15.45 |  4.09 | 10.27 |  1.07 |         1,245 |             0 |  10,324 |   1.0 |          31 |
| public.onto_documents                      | 14.31 |  0.79 |  8.52 |  4.98 |           639 |             1 |  18,639 |  40.2 |         105 |
| public.ontology_project_briefs             | 14.09 | 10.10 |  1.01 |  2.95 |         7,566 |             0 |     536 |  57.5 |           6 |
| public.project_audit_trigger_evaluations   | 12.12 | 10.19 |  1.90 |  0.01 |        10,374 |             4 |       0 |   0.0 |           5 |
| public.cron_logs                           | 10.88 |  7.52 |  3.32 |  0.01 |        35,278 |             0 |       0 |   0.0 |          10 |
| public.agentic_chat_prepared_prompts       | 10.33 |  0.05 |  1.83 |  8.42 |             1 |            45 |     199 |   0.0 |          57 |
| public.agentic_chat_execution_observations | 10.02 |  7.02 |  2.96 |  0.01 |        11,886 |             0 |       0 |   0.0 |           5 |
| public.emails                              |  9.75 |  5.04 |  1.15 |  3.53 |         3,419 |           282 |     453 |  34.0 |           3 |
| libri.derived_artifacts                    |  9.57 |  3.36 |  4.52 |  1.66 |         2,363 |             4 |       1 |   0.0 |           1 |
| public.queue_jobs                          |  9.07 |  3.59 |  5.31 |  0.13 |         3,062 |           272 |  62,610 |  23.2 |         125 |
| public.error_logs                          |  8.75 |  6.61 |  1.22 |  0.89 |         3,597 |           251 |   4,104 |   1.9 |          15 |
| auth.audit_log_entries                     |  8.61 |  7.20 |  1.38 |  0.01 |        27,785 |             2 |       0 |   0.0 |           8 |
| libri.source_chunks                        |  6.48 |  2.62 |  3.63 |  0.20 |         4,132 |             3 |       0 |   0.0 |           1 |
| public.agent_oauth_refresh_tokens          |  6.22 |  3.83 |  2.35 |  0.01 |         9,891 |           406 |   9,875 |  88.1 |           4 |
| public.notification_deliveries             |  6.18 |  4.05 |  2.09 |  0.01 |         7,445 |           282 |  10,644 |  17.1 |          13 |
| public.agent_call_sessions                 |  6.17 |  1.26 |  0.48 |  4.41 |         1,364 |             0 |      71 |   0.0 |           1 |
| public.agent_oauth_access_tokens           |  5.73 |  3.37 |  2.33 |  0.01 |         9,891 |           162 |   5,735 |  97.2 |           4 |
| public.agent_call_tool_executions          |  5.40 |  1.20 |  0.41 |  3.75 |         1,630 |           139 |     301 |   0.0 |           2 |

## Largest zero-scan indexes

Observation only: zero scans do not establish that an index is safe to drop. Constraints, rare operations, reset windows, and FK checks matter.

| Index                                            | Table                                |  MiB | Unique | Constraint-backed |
| ------------------------------------------------ | ------------------------------------ | ---: | ------ | ----------------- |
| idx_onto_documents_props_trgm                    | public.onto_documents                | 4.05 | False  | False             |
| idx_llm_usage_logs_operation                     | public.llm_usage_logs                | 2.98 | False  | False             |
| derived_artifacts_search_vector_idx              | libri.derived_artifacts              | 2.59 | False  | False             |
| idx_onto_milestones_props_trgm                   | public.onto_milestones               | 2.28 | False  | False             |
| idx_llm_usage_logs_openrouter_request_id         | public.llm_usage_logs                | 1.54 | False  | False             |
| idx_notification_logs_level_created              | public.notification_logs             | 1.26 | False  | False             |
| source_chunks_search_vector_idx                  | libri.source_chunks                  | 1.21 | False  | False             |
| idx_onto_tasks_props_trgm                        | public.onto_tasks                    | 1.20 | False  | False             |
| idx_history_chat_sessions_search_trgm            | public.chat_sessions                 | 1.12 | False  | False             |
| chapters_search_vector_idx                       | libri.chapters                       | 1.02 | False  | False             |
| idx_llm_usage_logs_client_turn_created           | public.llm_usage_logs                | 0.82 | False  | False             |
| idx_onto_plans_props_trgm                        | public.onto_plans                    | 0.78 | False  | False             |
| idx_onto_goals_props_trgm                        | public.onto_goals                    | 0.75 | False  | False             |
| idx_onto_documents_props_homework_gin            | public.onto_documents                | 0.71 | False  | False             |
| idx_onto_tasks_search                            | public.onto_tasks                    | 0.62 | False  | False             |
| idx_onto_projects_description                    | public.onto_projects                 | 0.61 | False  | False             |
| idx_visitors_visitor_created_at                  | public.visitors                      | 0.56 | False  | False             |
| idx_onto_projects_props_trgm                     | public.onto_projects                 | 0.52 | False  | False             |
| sources_search_vector_idx                        | libri.sources                        | 0.51 | False  | False             |
| idx_onto_milestones_search                       | public.onto_milestones               | 0.49 | False  | False             |
| idx_llm_usage_logs_reasoning_created             | public.llm_usage_logs                | 0.48 | False  | False             |
| uq_agentic_chat_prepared_prompt_nonce            | public.agentic_chat_prepared_prompts | 0.48 | True   | True              |
| derived_artifacts_library_idempotency_unique     | libri.derived_artifacts              | 0.43 | True   | True              |
| derived_artifacts_library_source_fingerprint_idx | libri.derived_artifacts              | 0.38 | False  | False             |
| idx_tasks_details_trgm                           | public.tasks                         | 0.36 | False  | False             |

## Advisor counts

| Kind        | Finding                                            | Count |
| ----------- | -------------------------------------------------- | ----: |
| security    | authenticated_security_definer_function_executable |   115 |
| security    | function_search_path_mutable                       |   111 |
| security    | anon_security_definer_function_executable          |    96 |
| security    | rls_enabled_no_policy                              |    59 |
| security    | extension_in_public                                |     4 |
| security    | auth_otp_long_expiry                               |     1 |
| security    | auth_leaked_password_protection                    |     1 |
| security    | vulnerable_postgres_version                        |     1 |
| performance | multiple_permissive_policies                       |   511 |
| performance | unused_index                                       |   421 |
| performance | auth_rls_initplan                                  |   250 |
| performance | unindexed_foreign_keys                             |   203 |
| performance | auth_db_connections_absolute                       |     1 |
