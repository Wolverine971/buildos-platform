<!-- apps/web/docs/technical/email/SUPABASE-MIGRATION-LEDGER-BASELINE.md -->

# Supabase Migration Ledger Baseline for Gmail Relevance

**Recorded:** 2026-07-22  
**Scope:** Gmail relevance Phase A and later forward migrations  
**Production project:** `iwifjtlebphefldmwbkh` (`build_os`)  
**Decision:** Treat the live production schema as the legacy physical baseline, preserve existing
local migrations as historical evidence, and use an exact-file forward-apply protocol until a
separate migration-ledger modernization is completed.

## Evidence

- Stable Supabase CLI `2.90.0` linked to the intended production project and successfully generated
  fresh public-schema types without `--allow-stale`.
- The remote migration ledger contained `20260716000000` and `20260722000000` when checked on
  2026-07-22. The Gmail migration `20260722000000` is present locally and remotely.
- The repository contains 243 SQL migration files but only 227 distinct leading version keys.
- Nine version keys are duplicated. Some older files use eight-digit date keys while newer files
  use fourteen-digit timestamp keys.
- Generated production types contain the expected Gmail tables/RPCs, so the physical schema and
  the sparse migration ledger are separate concerns.

## Locked safety decision

Do not run `supabase db push`, `supabase migration up`, or a bulk `migration repair` against
production from this repository. Those commands can interpret hundreds of legacy local files as
pending, while duplicated version keys cannot be represented unambiguously in the remote ledger.

Do not rename, delete, squash, or mark all legacy migrations applied as part of Gmail relevance.
That would create a large, difficult-to-audit change unrelated to the Phase A schema.

## Forward-only protocol

Every new production migration, beginning with Gmail relevance Phase A, follows this protocol:

1. Use a globally unique fourteen-digit UTC version later than the largest production-ledger
   version. Check both filenames and the remote ledger immediately before choosing it.
2. Keep one SQL file for that version. CI must reject duplicate version prefixes.
3. Make the migration transactional and fail closed. Avoid destructive compatibility cleanup in
   the same file.
4. Review the exact SQL file and test it against a disposable PostgreSQL/Supabase database where
   practical.
5. Apply only that reviewed file to production through a direct transactional SQL path. Do not use
   repository-wide `db push`.
6. Verify the expected tables, constraints, indexes, RLS state, and policies through read-only
   production queries.
7. Mark only that exact version applied in the remote migration ledger, then confirm local/remote
   alignment for the new version.
8. Regenerate database types from production without `--allow-stale`, build shared types, and run
   the focused application suites.
9. Record the apply/verification receipt in the feature handoff. Never include credentials or
   mailbox content in the receipt.

If any step fails, stop. Do not repair other versions opportunistically.

## Phase A consequence

This decision unblocks authoring the narrowly scoped profile/rule migration. It does not authorize
applying that migration to production automatically. The exact file still needs schema review,
disposable-database verification, a production apply decision, and post-apply verification.

## Separate modernization project

The legacy ledger should be normalized outside Gmail relevance:

1. export a content-free production schema snapshot;
2. inventory physical-schema drift against all 243 historical files;
3. choose an archive/baseline boundary;
4. renumber or archive duplicated version keys without changing production objects;
5. prove a fresh local database can be built from the new baseline plus forward migrations; and
6. only then re-enable repository-wide `db push` in deployment documentation.

Until that project is complete, the exact-file forward protocol above is the production rule for
new Gmail relevance migrations.

## Known duplicate version keys

- `20260116` (2 files)
- `20260126` (6 files)
- `20260127` (4 files)
- `20260130` (2 files)
- `20260205` (3 files)
- `20260426000014` (2 files)
- `20260428000017` (2 files)
- `20260508000000` (2 files)
- `20260514000000` (2 files)
