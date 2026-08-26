<!-- docs/operations/database/SUPABASE_MIGRATION_LEDGER.md -->

# Supabase migration ledger

**Status:** Current reference  
**Last updated:** 2026-08-26

## Contract

- New migrations use `YYYYMMDDHHMMSS_descriptive_name.sql`.
- Every version prefix is unique.
- Applied migration files are immutable. Correct an applied migration with a new migration.
- Historical filename and duplicate-version exceptions are recorded in `supabase/migration-ledger-baseline.json`; the baseline must not grow.
- Create migrations with `supabase migration new <name>` rather than inventing timestamps.
- PSQL-only files under `supabase/tests` must never run against a linked database.

Run the structural checks with:

```bash
pnpm check:migrations
pnpm check:sql-contracts
```

CI supplies `MIGRATION_BASE_REF`, which also rejects edits, renames, or deletions of migration files already present on the base branch.

## SQL contract modes

- `self-contained-disposable`: includes its fixture and migrations and runs in a fresh temporary PostgreSQL cluster.
- `vitest-disposable`: executed by a colocated `.postgres.test.ts` harness during the normal test suite.
- `legacy-schema-dependent`: historical SQL with unstated or project-wide prerequisites. These are explicit debt in `supabase/tests/sql-contract-baseline.json`; the list must only shrink.
- `production-verification` and `manual-preflight`: intentionally manual and never part of disposable mutation tests.

Run the self-contained lane with `pnpm test:sql-contracts`.

## Ledger disagreement repair

1. Stop and inspect both sides with `supabase migration list --local` or `supabase migration list --linked` as appropriate.
2. Confirm that the local file contents match the migration that was actually applied. Never use repair to conceal different SQL under the same version.
3. Back up the database and migration ledger before changing remote history.
4. If the database contains the intended migration and only the history row is wrong, use `supabase migration repair` with the exact version and status shown by `supabase migration repair --help` for the installed CLI.
5. Re-run `supabase migration list`, repository ledger checks, generated type checks, and the relevant disposable SQL contracts.

Historical duplicate prefixes require project-specific reconciliation before renaming or repairing them. Do not normalize those files mechanically.
