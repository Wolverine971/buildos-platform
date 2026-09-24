<!-- scripts/migration-rehearsal/README.md -->

# Migration rehearsal

Run a migration against a local copy of **production's schema** before it touches production.
This replaces the retired QA branch (Tasker 104). It is free, needs no hosted test database, and a
cached run takes about 3 seconds.

```sh
pnpm db:rehearse supabase/migrations/20260926120000_my_change.sql
pnpm db:rehearse a.sql b.sql --check supabase/tests/my_assertions.sql   # applied in order
pnpm db:rehearse my_change.sql --refresh      # re-snapshot now (cache lasts 24 h)
```

## What it does

1. **Snapshot (cached 24 h, ~2 min to refresh).** `pg_dump --schema-only` of production over the
   same temporary login `supabase db dump --linked` uses. Every session is forced
   `default_transaction_read_only=on`, and pg_dump reads inside a READ ONLY transaction. **No
   table data is copied.** The production migration ledger, table row counts and sizes, and role
   names are read through the Management API with `read_only: true`. The cache lives in
   `~/.cache/buildos/migration-rehearsal/<ref>/` (mode 0600), outside the repo.
2. **Rehearse.** A disposable, socket-only PostgreSQL loads the snapshot (~1 s). It applies each
   file with `ON_ERROR_STOP`, then runs optional `--check` assertion SQL. The cluster is deleted
   afterwards unless you pass `--keep`.
3. **Report.** Every object each migration added (+), removed (-) or changed (~): tables, columns,
   constraints, indexes, views, functions (including `SECURITY DEFINER`, `search_path`, and
   grants), policies, triggers, and enum/domain types. It also reports the production size of
   every touched table and flags risks:
    - **SECURITY:** a `SECURITY DEFINER` function that `PUBLIC`/`anon`/`authenticated` can
      execute. Supabase's default privileges grant EXECUTE on every new function to `anon` and
      `authenticated`, so a migration must revoke explicitly. That default caused the Tasker 76
      exposures. It also flags a definer without a fixed `search_path` and RLS being disabled.
    - **DATA:** checks a schema-only copy cannot prove against production's real rows: `NOT NULL`
      without a default, constraints validated against existing rows, type changes, and unique
      index builds. Each gives the production row count.
    - **Ledger:** the file is already recorded in production, or newer unrecorded local
      migrations sit before it.

Exit codes: `0` passed (read the findings), `1` a migration or check failed, `2` harness error.

## Limits

- **Schema only.** A data-dependent failure is flagged, never proven. Query production read-only
  for violators before applying a flagged migration.
- Local PostgreSQL is 16 (prod is 15.8). Hosted-only extensions (`pgjwt`, `supabase_vault`,
  `hypopg`, `index_advisor`) and the platform schemas (`extensions`, `vault`, `realtime`, …) are
  not loaded. A migration that depends on their internals needs a manual check.
- Lock duration and concurrent traffic are not simulated. Keep `SET LOCAL lock_timeout` in DDL
  migrations that touch populated tables.

## One-time setup

```sh
brew install postgresql@16
# pgvector for PG16 (Homebrew's pgvector bottle targets 17/18). Match prod's version (0.8.0).
curl -sL https://github.com/pgvector/pgvector/archive/refs/tags/v0.8.0.tar.gz | tar xz -C /tmp
make -C /tmp/pgvector-0.8.0 PG_CONFIG=/opt/homebrew/opt/postgresql@16/bin/pg_config
make -C /tmp/pgvector-0.8.0 install PG_CONFIG=/opt/homebrew/opt/postgresql@16/bin/pg_config
```

The Management API token comes from `SUPABASE_ACCESS_TOKEN` or `~/.supabase/access-token`.
The token and the temporary database password are never printed or written to disk.

## Applying to production after a clean rehearsal

Migrations are applied one file at a time. Never use `db push --include-all`, and do not replay
the historical unrecorded files (Tasker 63).

```sh
supabase db query --linked -f supabase/migrations/<file>.sql        # --linked is PRODUCTION
supabase migration repair --status applied <version> --linked       # record it in the ledger
```

Tests: `python3 -m unittest discover -s scripts/migration-rehearsal -v` (offline; the end-to-end
cases use a synthetic snapshot and a disposable local cluster).
