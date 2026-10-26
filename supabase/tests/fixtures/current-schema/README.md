<!-- supabase/tests/fixtures/current-schema/README.md -->

# Current-schema contract baseline

This is the schema-only PostgreSQL 15.8 snapshot captured by migration rehearsal on
2026-10-25, compressed with deterministic gzip. It contains no application/user
rows. The one COPY payload is `private.project_fold_table_policy`, schema
configuration required by the fold coverage assertion. The manifest contains only
capture metadata, role names, checksums, and migration filenames; production table
sizes and credentials are omitted.

The runner uses the rehearsal's `prepare_dump` to omit hosted extension/event-trigger
plumbing. It preserves application functions, policies, constraints, and grants.
`service_role` has Supabase's BYPASSRLS attribute; `anon` and `authenticated` do not.
Each check seeds synthetic data in a separate database cloned from this baseline
plus current migrations. A failure is fatal; no checks are quarantined or skipped.

## Run

```sh
pnpm test:sql-current
pnpm test:sql-current --check email_campaign_daily_cap.check.sql
python3 scripts/database/current_schema.py --list
```

Locally, PostgreSQL server/client binaries and pgvector are required. The runner
starts one socket-only disposable cluster. Use the repository's `test-gate` wrapper
for validation sessions. CI runs a separate PostgreSQL 15 + pgvector service and
provides `BUILDOS_CURRENT_SCHEMA_DATABASE_URL` and `BUILDOS_EXPECTED_POSTGRES_MAJOR`.
Only localhost URLs with the `postgres` maintenance database are accepted. That
server must be disposable: the runner provisions test roles, creates uniquely named
databases, and drops only those databases. It never uses the linked Supabase project
or hosted credentials. Local PostgreSQL 16 is also supported; CI owns the 15 check.

Every top-level `supabase/tests/*.check.sql` is discovered automatically and classified
as `current-schema-disposable` by the SQL inventory. The campaign contract also runs
two real concurrent sessions with caps of one and two, proving shared-budget
serialization and exclusive claims. Existing self-contained historical migration
contracts keep their separate runner.

## Migration composition

`absorbed_migrations` freezes repository history at `cutoff_version`; those files are
never replayed. This is a squashed baseline, not a claim that every historical file
is in the production migration ledger. Editing or removing an absorbed file fails.
Newer files run automatically in filename order. An unknown older file fails until
reviewed and added to `late_migrations`; historical unrecorded migrations must never
be swept into a replay. The initial late file is the four-ways project-join migration,
which was absent from the captured ledger despite its earlier timestamp.

When refreshing, compare the new snapshot's ledger and schema with the manifest and
the intended code branch. Explicitly identify pending files below the new cutoff.
Inspect the complete SQL for secrets and data, then pin it using:

```sh
python3 scripts/database/pin_current_schema.py \
  --schema /path/to/rehearsal/schema.sql --metadata /path/to/rehearsal/meta.json \
  --cutoff 20261024030000 --late 20261024023325_four_ways_project_join.sql
```

Those example versions describe the initial baseline; do not reuse them blindly for
a later snapshot. Review the manifest diff and decompressed SQL (`gzip -dc
supabase/tests/fixtures/current-schema/schema.sql.gz`) and run the full lane before
committing. The pin tool checks the COPY allowlist, not arbitrary embedded secrets.

Rollout singletons are synthetic fixtures inside their checks. Tests exercise both
disabled and enabled behavior instead of depending on production flag values.
