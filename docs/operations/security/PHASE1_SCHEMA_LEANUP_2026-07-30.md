<!-- docs/operations/security/PHASE1_SCHEMA_LEANUP_2026-07-30.md -->

# Phase 1 Schema Lean-Up — 2026-07-30

**Status:** Core production cleanup verified on 2026-08-04; the 78-row preferences backup remains pending archive and removal.

## Production verification

The non-mutating Phase 1 verifier now passes 15 of 16 retirement invariants. The nine isolated tables, `task_documents`, and the complete Tree Agent bundle are absent. The only failure is `user_notification_preferences_backup`, which still exists with exactly 78 rows.

No Phase 1 archive manifest exists in the configured external archive directory, so the guarded backup-table migration should not be retried yet. The next safe sequence is:

1. run `scripts/security/export-phase1-retired-data.mjs` to an external directory;
2. independently verify the JSONL row count and SHA-256 receipt;
3. apply `20260730050000_phase1_drop_notification_preferences_backup.sql`;
4. rerun the Phase 1 verifier and regenerate the database contracts.

## Removed by the guarded cleanup

Migration `20260730040000_phase1_retired_schema_cleanup.sql` removes:

- Nine isolated zero-row tables: `api_keys`, `calendar_themes`, `chat_sessions_daily_briefs`, `chat_sessions_tasks`, `llm_prompts`, `onto_tools`, `question_metrics`, `question_templates`, and `research_artifact_refs`.
- The empty, unused `task_documents` view.
- The retired Tree Agent bundle: five empty tables, five enums, two trigger functions, the cross-schema Realtime policy, and the dead shared TypeScript contract/export.
- Eight RPC residues that survived the January cleanup because its `DROP FUNCTION` identities were wrong.

The migration counts every candidate table inside its transaction and raises if any row exists. Every `DROP` intentionally omits `CASCADE`, so an unexpected dependency also aborts the transaction.

The retired `queue_type.buildos_tree_agent` enum label remains. PostgreSQL cannot remove an enum label in place; rebuilding the shared queue enum for one inert value would add disproportionate deployment risk.

## Expired preferences backup

`user_notification_preferences_backup` still holds 78 rows and must be exported before removal. Migration `20260730040000` creates a private archive-receipt table and a temporary service-only recorder RPC. Migration `20260730050000_phase1_drop_notification_preferences_backup.sql` refuses to drop the backup unless:

1. a receipt exists;
2. it contains a syntactically valid SHA-256 hash; and
3. its exported row count still equals the locked table's current row count.

Create the archive outside the repository and on an encrypted/durable operator-controlled volume:

```bash
node scripts/security/export-phase1-retired-data.mjs \
	--output "/Users/djwayne/Documents/BuildOS Database Archives/phase1"
```

The tool writes canonical JSONL plus a manifest, both mode `0600`, prints the SHA-256 checksum, and records the receipt only after the files are safely written. It refuses to write inside the Git repository.
The path above is an example for this workstation; use another durable, encrypted location if preferred. Quoted paths beginning with `~/` are also accepted.

## Remaining production order

1. Run the archive command above and independently retain both output files.
2. Apply `20260730050000_phase1_drop_notification_preferences_backup.sql`.
3. Regenerate types from the post-migration database with `pnpm gen:types`, then run `pnpm gen:schema`.
4. Run `node scripts/security/verify-rls-lockdown.mjs --tables scripts/security/phase1-cleanup.json`.
5. Run `pnpm check:supabase-rpc-drift` with the production service key in the operator environment.

The generated types in this changeset are already prepared for the post-migration shape. Regeneration in step 5 must produce no retired-object reintroductions.

## Local proof

A disposable PostgreSQL 16 cluster verified:

- Phase 0 migrations apply twice after removing the hard-coded migration-owner assumption.
- The Phase 1 cleanup applies twice and leaves zero target relations, zero target RPCs, and zero `tree_agent_*` types.
- A non-empty removal candidate aborts the transaction and remains untouched.
- The preferences-backup drop fails without a receipt, succeeds with a count-matched receipt, and is idempotent afterward.

The shared-types build and repository typecheck are the dependency backstop: removing the generated table/RPC entries and Tree Agent module will fail compilation if any typed runtime consumer still exists.

## Deliberately deferred

Phase 1 does not drop non-empty or product-decision bundles merely because repository call sites are absent. `onto_decisions`, the beta-events bundle, homework runs, the recurring-task migration log, and all legacy project/brain-dump/chat generations remain pending archive confirmation or cutover work.
