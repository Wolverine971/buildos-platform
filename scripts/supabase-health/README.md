<!-- scripts/supabase-health/README.md -->

# Supabase read-only health kit

Python 3.9+, standard library only. No packages, SQL migrations, model calls, load generation,
or live tests are needed. Run from the repository root. Every collector requires an explicit
project reference; there is no linked-project fallback or arbitrary-SQL command.

```sh
python3 scripts/supabase-health/health.py snapshot \
  --project-ref iwifjtlebphefldmwbkh --env-file apps/web/.env \
  --start 2026-09-23T17:00:00Z --end 2026-09-24T17:00:00Z \
  --out /tmp/prod-health.json.gz

python3 scripts/supabase-health/health.py snapshot \
  --project-ref daudvqczjqxhpzstlfih --parent-ref iwifjtlebphefldmwbkh \
  --env-file .env.agentic-gate.local \
  --start 2026-09-24T03:00:00Z --end 2026-09-24T03:30:00Z \
  --out /tmp/qa-health.json.gz

python3 scripts/supabase-health/health.py sample \
  --project-ref iwifjtlebphefldmwbkh --env-file apps/web/.env \
  --seconds 300 --out /tmp/prod-paging.json

python3 scripts/supabase-health/report.py \
  --project-ref iwifjtlebphefldmwbkh --snapshot /tmp/prod-health.json.gz \
  --top 20 --out /tmp/prod-health.md
```

Use fresh UTC time windows; examples document the audit, not a rolling monitor. `sample` saves
the first reading before sleeping locally; run it in a background terminal while doing other work.
It makes **two metrics requests**, with no held DB connection. Stop with Ctrl-C if necessary.
The minimum gap is five minutes because the endpoint is cached. Do not infer a busy workload from
the time of day; label the observed workload and correlate with API logs and turn metadata.

Individual commands: `metrics`, `statements`, `tables`, `inventory`, `workload`, `advisors`,
`logs`, and `latency`. All accept `--project-ref` and `--out`. Only metrics need `--env-file`.
`logs` and `latency` require `--start`/`--end` spanning at most 24 hours. `snapshot` includes both
when a window is supplied. `workload` is opt-in: it reads aggregate metadata from bounded samples
of the newest 1,000 turns/cron runs and current Realtime subscription counts, never message bodies.
The top-N report shows execution time, calls, maxima, shared reads, and temporary writes.

The Management API token is read from `SUPABASE_ACCESS_TOKEN` or `~/.supabase/access-token`.
Metrics use the service key in the explicitly selected environment and refuse to send it if the
Supabase URL does not match the project. No credentials are copied into artifacts or stdout.
Every `database/query` request sends `read_only: true` **and** wraps the fixed query in
`BEGIN READ ONLY … COMMIT`. The older production endpoint reported transaction mode `off` when
only the API flag was supplied; the explicit transaction was verified as `on` on both projects.
The kit has no database-write operation and does not reset statistics. Diagnostic reads still
consume a small amount of shared capacity; avoid tight loops and advisor calls during incidents.

The current logs endpoint is `/analytics/endpoints/logs` with ClickHouse SQL; `logs.all` was
removed on September 23, 2026. Latency is aggregated separately by path and hour to stay below
the API's 1,000-row response cap. These are API **origin times**, not end-to-end client RTT.
Log search projects only timestamps, SQLSTATEs, wait durations and relation OIDs; no raw SQL,
request bodies, auth headers, IPs, or customer content. A 500-row lock result may be truncated:
narrow the window. SQL literals and comments in statement samples are redacted before saving.

Interpretation:

- Rates report counter resets/reboots instead of negative activity. If available, the exporter
  clock supplies the interval; otherwise cached scrapes give approximate wall-time rates. CPU
  fractions use summed CPU counter deltas, avoiding >100% results from cache timing. Page-byte
  conversions assume Linux 4 KiB pages and are explicitly labeled.
- `pg_stat_statements` mean/max/stddev **cannot yield p95/p99**. Use the separate log aggregates.
  `track=top` does not expose nested RPC statements. `track_io_timing=off` means zero I/O timing
  is unavailable instrumentation, not proof of zero I/O.
- Table sizes include indexes and TOAST; do not add them again. Dead tuples are estimates,
  not a measured bloat percentage. Table, DB and statement counters have different reset windows.
- Source-text lock flags in the function inventory are leads, not a SQL parser: comments and
  conditional branches require inspection. A function mentioning an authorization helper is
  likewise not proof that authorization is correct.
- Advisors are triage input, not executable fixes. Never bulk-drop zero-scan indexes or apply
  generated security fixes without reviewing caller/constraint behavior.
- Missing extensions/permissions/endpoints are saved under `errors`; the process exits nonzero.
  Outputs are not an all-clear when a section is unavailable. `.gz` paths produce gzip JSON.

Read-only deployment preflight (does **not** call the mutating recovery RPCs):

```sh
python3 scripts/supabase-health/preflight.py \
  --project-ref iwifjtlebphefldmwbkh --scope maintenance --require-cron \
  --out /tmp/prod-maintenance-preflight.json

python3 scripts/supabase-health/preflight.py \
  --project-ref daudvqczjqxhpzstlfih --scope all \
  --out /tmp/qa-release-preflight.json
```

`maintenance` checks exact RPC signatures and named arguments, service-only grants,
invoker/search-path/lock-timeout settings, and three required migration ledger versions.
`security` checks the Tasker 104 containment migration and grants, including removal of the
phase-date RPC. `all` requires both. `--require-cron` additionally fails for no success within
five minutes, a failed latest receipt, or warnings/errors in the last 15 minutes; use it only
where the web cron is deployed. Cron checks use at most the newest 50 matching receipts.
This command is an on-demand check, not an installed alert or a proof of PostgREST cache state.
An API/cron receipt is still needed to verify actual endpoint availability.

On 2026-09-24 production passed maintenance + cron checks; QA passed the function contract but
failed all three expected ledger versions. Do not suppress that failure or replay historical DDL.
Reconcile QA's ledger under Tasker 63 after verifying the complete migration effects. The
containment migration is prepared locally; security checks must fail until it is applied.

Free offline checks (the RPC test additionally needs local `initdb`, `pg_ctl`, and `psql`;
it creates and destroys its own socket-only PostgreSQL cluster):

```sh
test-gate run python3 -m unittest discover -s scripts/supabase-health -v
```

The [2026-09-24 decision brief](../../docs/technical/reviews/SUPABASE_FITNESS_DECISION_2026-09-24.md)
links the validated baselines, recommendations and remaining measurement gaps.
