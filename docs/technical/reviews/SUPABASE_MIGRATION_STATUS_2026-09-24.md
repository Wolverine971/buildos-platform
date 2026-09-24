<!-- docs/technical/reviews/SUPABASE_MIGRATION_STATUS_2026-09-24.md -->

# All local migrations versus production — September 24, 2026

> **Status update, 2026-09-24 evening:** three of the four "confirmed absent" migrations are now
> in production and recorded in its ledger: `20260924193000` lock-first and `20260909194302`
> onboarding progress (Tasker 103 session), then `20260924202321` containment (Tasker 104,
> verified through PostgREST). Only `20260910170101` Libri quota settlement remains unapplied,
> deliberately. The counts below are the 21:59 UTC snapshot.

**Checked every active local SQL migration: 477 files, plus seven archived backups.**
Production is `iwifjtlebphefldmwbkh`. Its migration history was read at 21:59 UTC;
subsequent catalog checks verified selected live effects. No database changes were made.

| Result                           | Active files | Meaning                                                                                                              |
| -------------------------------- | -----------: | -------------------------------------------------------------------------------------------------------------------- |
| Same version and name recorded   |          220 | Production has a deployment-history entry; content exceptions are below.                                             |
| Recorded under another timestamp |            2 | Same name and matching stored SQL; these are not missing deployments.                                                |
| No matching production history   |          255 | Four recent changes are confirmed absent; ten have live evidence of application; 241 remain historically unverified. |
| **Total**                        |      **477** | Every file directly under `supabase/migrations` is included.                                                         |

The [complete checklist](supabase-health/2026-09-24/production-migration-checklist.csv)
contains one row for every active file and archived backup, including local file hashes,
production version, SQL comparison, live assessment, and notes. The
[full unrecorded-file list](supabase-health/2026-09-24/production-unrecorded-migrations.md)
names all 255 active files lacking matching history and all seven archived backups.

## Confirmed not applied to production — rollout checklist

These four files have neither matching deployment history nor their required live effects in
the September 24 audit. All remain pending; no migration was applied while updating this report.

- [ ] `20260924202321_contain_legacy_admin_rpcs.sql` — security containment.
- [ ] `20260924193000_task_create_project_lock_first.sql` — task-create lock-order fix.
- [ ] `20260909194302_onboarding_activation_progress.sql` — onboarding progress storage.
- [ ] `20260910170101_libri_unissued_upload_quota_settlement.sql` — gated Libri quota settlement.

Check an item only after its hosted application and post-apply verification are recorded,
including the target project, migration version, and receipt. Commit/staging state alone does
not complete a deployment. [Tasker 104](../../../tasker/104-supabase-fitness-sizing-and-efficiency.md)
records the overall progress, findings, and prioritized plan.

| Local migration                                                                                                                                       | Evidence in production                                                                                                              | Next action                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [`20260924202321_contain_legacy_admin_rpcs.sql`](../../../supabase/migrations/20260924202321_contain_legacy_admin_rpcs.sql)                           | `batch_update_phase_dates` still exists. Both retained admin RPCs remain `SECURITY DEFINER` with `anon`/`authenticated` execution.  | First priority: deploy the prepared security containment with its verification and rollback.      |
| [`20260924193000_task_create_project_lock_first.sql`](../../../supabase/migrations/20260924193000_task_create_project_lock_first.sql)                 | Task-create body differs from local and lacks `v_lock_project_id`.                                                                  | Deploy the task-creation lock-order fix under Tasker 101.                                         |
| [`20260909194302_onboarding_activation_progress.sql`](../../../supabase/migrations/20260909194302_onboarding_activation_progress.sql)                 | Both `users.onboarding_step` and `users.onboarding_project_id`, and the accompanying index, are absent.                             | Align this migration with the onboarding feature rollout; its database prerequisites are missing. |
| [`20260910170101_libri_unissued_upload_quota_settlement.sql`](../../../supabase/migrations/20260910170101_libri_unissued_upload_quota_settlement.sql) | Both new intent columns and `libri.release_unissued_image_upload_slot` are absent. `reserve_image_upload` still differs from local. | Follow the file's explicit dependency: issuance-broker rollout first, with upload admission off.  |

This is the **confirmed** missing set from the focused live checks, not a claim that every
older unrecorded migration is already applied. The 241 unresolved historical files below
still need reconciliation before production/local parity can be certified.

## Applied history can still differ from local SQL

One additional mismatch is confirmed in the current schema:

- [`20260724020000_gmail_relevance_review_evaluation.sql`](../../../supabase/migrations/20260724020000_gmail_relevance_review_evaluation.sql)
  is recorded, but its local `wrong_project` adjudication constraint requires
  `corrected_project_id IS NOT NULL`. Both the stored production migration and the live
  constraint omit that requirement. Five function bodies from this file match production.
  Decide which constraint is intended, then use a forward migration if the stricter local
  contract is desired. Replaying this whole historical file is not the correction.

All 222 matched history entries were compared with stored SQL, beyond checking filenames:

- **213** match after ignoring comments and whitespace outside quoted values. Quoted strings
  and function bodies were preserved during this comparison.
- **One** additional file differs only in comments/whitespace within its function body.
- **Five** have substantive differences in stored SQL; this does not imply their current live
  definitions are wrong, because later migrations can replace them.
- **Three** have missing or placeholder SQL in the ledger, so the history entry alone cannot
  verify the file's content.

| Recorded local migration                                   | Content exception and live finding                                                                                                                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260724020000_gmail_relevance_review_evaluation`         | Confirmed constraint mismatch described above.                                                                                                                                                  |
| `20260804000100_agentic_chat_terminal_last_turn_context`   | Stored SQL uses `<>` where local uses `IS DISTINCT FROM`. The current function body matches the later `20260804000110_agentic_chat_terminal_sequence_capacity` migration.                       |
| `20260804000120_agentic_chat_terminal_timing`              | Stored SQL lacks some local timing/receipt checks. Current production has subsequent terminal/cancellation changes; its complete final contract was not certified against this historical file. |
| `20260806020000_agentic_chat_timing_evidence_repair`       | Ledger contains no statements. The current `agentic_chat_epoch_ms` body matches; other dynamic repair effects were not fully checked.                                                           |
| `20260806021000_log_client_error_inet_hardening`           | Ledger contains no statements. The current `safe_inet` body matches; other dynamic repair effects were not fully checked.                                                                       |
| `20260815010000_agentic_chat_clarification_contract_reset` | Local SQL adds prerequisite and already-applied checks around the migration patch. Stored SQL predates those replay guards.                                                                     |
| `20260825161846_agentic_chat_queue_first_admission`        | Stored statement is only the migration name, not executable SQL. Deployment is recorded, but the SQL content cannot be verified from that row.                                                  |
| `20260827022510_create_document_proposals`                 | Function-body comments/whitespace differ; SQL tokens otherwise match. No functional difference found.                                                                                           |
| `20260901155435_libri_ocr_admission_finalizer_hardening`   | Two stored trigger functions differ from local. All five **current** production function bodies match the local migration, including those two corrections.                                     |

## Missing history with live changes already present

These ten files must not be treated as automatically pending deployments:

| Local migration                                              | Live evidence and remaining limit                                                                                                                                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `20260828040905_agentic_chat_worker_session_handoff`         | Handoff function body matches and is service-only; not every other effect was checked.                                                                                                                                   |
| `20260829235308_agent_call_bootstrap_hardening`              | Cleanup function body matches and is service-only; not every other effect was checked.                                                                                                                                   |
| `20260830190000_semantic_discovery_phase3_search_scope`      | Search function body matches; execution is available to authenticated/service roles, not anon.                                                                                                                           |
| `20260904000000_start_here_document_selection_marker`        | Both project-full RPC bodies match. The historical Start Here data backfill was not verified.                                                                                                                            |
| `20260905012719_agentic_chat_prepared_overlay_copy_contract` | Exact new prepared-surface guard is present. `pgcrypto`, schema access, and service-role `digest` execution are present.                                                                                                 |
| `20260909034006_project_calendar_delete_cleanup`             | Three function bodies match; all three deletion/late-event triggers exist and are enabled. No provider deletion was invoked.                                                                                             |
| `20260921042959_agentic_chat_project_review_v2`              | The two v2-only bodies match. Shared functions now match v3, which supersedes part of v2.                                                                                                                                |
| `20260921143217_agentic_chat_project_review_v3`              | All six function bodies match and are service-only.                                                                                                                                                                      |
| `20260921154425_fix_daily_brief_projectless_scheduling`      | Both function bodies match; eligible-user RPC is service-only.                                                                                                                                                           |
| `20260924120000_email_scan_checks`                           | Complete declared schema checked: eight columns/types/nullability/defaults, primary key, two cascading foreign keys, three checks, valid/ready indexes, RLS, table comment, and effective service-only grants all match. |

Except for the fully checked email-scan schema, these are selected-effect checks rather than
certifications of every grant, comment, backfill, or historical intermediate state. They establish
why absence from the ledger is insufficient evidence to replay a migration.

## Two timestamp differences resolved

| Local file                                                      | Production version | Verification                                        |
| --------------------------------------------------------------- | ------------------ | --------------------------------------------------- |
| `20260827132854_query_performance_cleanup.sql`                  | `20260827133601`   | Same name and complete normalized stored SQL match. |
| `20260830195800_fix_agent_run_atomic_dispatch_trigger_cast.sql` | `20260830200035`   | Same name and complete normalized stored SQL match. |

These two explain all production ledger entries without an exact local version/name pair.
The earlier version-only result of 257 missing files is therefore refined to **255 unrecorded
files**, not 257 missing deployments.

## Historical reconciliation still needed

The earliest retained production ledger entry is `20260716000000`. **234** unrecorded active
files predate it; their absence does not prove that their database changes never ran.
Another **21** unrecorded files fall on or after that date: the 14 August/September files covered
above and these seven July files whose full live effects have not been verified:

- `20260718010000_inbox_items_deferred_status.sql`
- `20260719010000_agent_run_effort.sql`
- `20260719020000_deep_research_orchestration.sql`
- `20260719030000_agent_run_cost_ledger.sql`
- `20260719040000_agent_run_cost_reconciliation.sql`
- `20260719050000_agent_run_cost_rpc_privileges.sql`
- `20260720010000_deep_research_hardening.sql`

The full 255-file list is linked above. Local duplicate version prefixes also mean reconciliation
must be file/name-aware rather than merely marking a timestamp applied. Tasker 63 owns establishing
an authoritative baseline, checking data migrations, and resolving superseded/skipped changes.
Do not use `db push --include-all` to turn this historical uncertainty into a production replay.

## Scope, evidence, and staging

- Active scope: every `.sql` directly in `supabase/migrations`; archived scope: all seven `.sql`
  files recursively under `supabase/migrations/applied_backup`.
- Function snapshots, SQL tests/fixtures, diagnostics, manual rollback/repair scripts, and the
  explicitly `DRAFT` artifact are not deployment migrations and were excluded from ledger counts.
- Every active/archived file was checked by exact version plus name, then alternate timestamp
  with the same name, then complete normalized SQL against every retained ledger entry. No extra
  matches appeared under other names. Duplicate local prefixes did not produce false matches.
- [Complete comparison](supabase-health/2026-09-24/production-all-migration-comparison.json.gz)
  includes every file, local hashes, ledger metadata, and selected function comparisons.
  [Live catalog evidence](supabase-health/2026-09-24/production-all-migration-schema.json.gz)
  retains schema/grant metadata and function-body hashes, without production function source.
- All hosted queries used `BEGIN READ ONLY` plus the management API's `read_only` flag. No
  migration, ledger repair, function call with side effects, or application deployment occurred.
- No migration was newly staged. The only uncommitted migration remains the unapplied containment
  file; all other active migration files were already committed.

The earlier QA check remains in [the original comparison](supabase-health/2026-09-24/migration-status.json.gz)
and [QA schema evidence](supabase-health/2026-09-24/qa-migration-schema.json.gz): none of the exact local
versions were in QA's eight-entry ledger, but selected effects were present, including an exact
trimmed task-create lock-first body match. QA was not re-audited for this production-only request.
