<!-- docs/technical/reviews/supabase-health/2026-09-24/README.md -->

# Supabase health baseline — 2026-09-24

Read-only evidence for [Tasker 104](../../../../../tasker/104-supabase-fitness-sizing-and-efficiency.md).
Start with the [decision brief](../../SUPABASE_FITNESS_DECISION_2026-09-24.md) or
[detailed audit](../../SUPABASE_FITNESS_AUDIT_2026-09-24.md).

| Artifact                                                                                                                             | Purpose                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [Production report](prod-report.md), [QA report](qa-report.md)                                                                       | Offline top 20 statements by total/calls/max, largest tables, index candidates, advisor counts                                                 |
| [Production final](prod-final.json.gz), [QA final](qa-final.json.gz)                                                                 | Complete collector outputs; 17:19–17:20 UTC; zero unavailable sections; explicit transaction read-only mode verified                           |
| [Derived summary](derived-summary.json)                                                                                              | Database/reset metadata, paging rates, request totals and advisor counts                                                                       |
| [Advisor triage](advisor-triage.json.gz)                                                                                             | Initial priority, disposition, owner and remediation link for all 4,018 returned findings; not approval to execute fixes                       |
| [Dashboard observations](dashboard-observations.json)                                                                                | Manually transcribed organization invoice/usage and observed resource charts, with limitations                                                 |
| [Deployments](deployments.json), [projects](project-metadata.json)                                                                   | Actual Vercel/Railway regions and replicas; project metadata restricted to BuildOS organization                                                |
| [Prod platform](prod-platform.json), [QA platform](qa-platform.json)                                                                 | API/pooler defaults, disk utilization, backup metadata, original branch action status                                                          |
| [Prod workload](prod-workload.json), [QA workload](qa-workload.json)                                                                 | Bounded aggregate turn/cron metadata and compression column settings; no message content                                                       |
| [Prod tail investigation](prod-tail-investigation.json)                                                                              | Single HTTP 522, maintenance RPC failures, SQLSTATE counts and non-executing list-query plan                                                   |
| [Statement delta](prod-statement-delta.json.gz)                                                                                      | Application-light polling rates over 162.62 seconds; includes operator and light web activity                                                  |
| [Follow-up status](followup-status.json.gz)                                                                                          | 17:40 UTC security grants, successful maintenance window, sanitized worker health and queue trigger inventory                                  |
| [Follow-up wakes](followup-wake.json.gz)                                                                                             | All four worker instances receiving wakes, actual 1 s startup intervals, separate stream-delivery health and redacted security function bodies |
| [General-worker follow-up](followup-general.json.gz)                                                                                 | Actual 5 s general-worker polling and redacted live enqueue-function bodies                                                                    |
| [Production maintenance preflight](prod-maintenance-preflight.json.gz), [QA maintenance preflight](qa-maintenance-preflight.json.gz) | Fresh exact-signature/grant/configuration/ledger checks; production cron succeeds, QA lacks three expected ledger versions                     |
| [Production security preparation](prod-security-preparation.json.gz), [QA security preparation](qa-security-preparation.json.gz)     | Role/table privileges and phase-RPC dependency/usage audit before the prepared containment migration                                           |

The [migration verification report](../../SUPABASE_MIGRATION_STATUS_2026-09-24.md) records the
later staging check. `migration-status.json.gz` compares all local versions with both ledgers;
`production-migration-schema.json.gz` and `qa-migration-schema.json.gz` distinguish selected live
schema effects from missing history. No hosted migration was applied during verification.

The subsequent production-only audit checks **all 477 active SQL migration files and seven
archived backups**, including names and stored SQL rather than versions alone:

- [Complete file checklist](production-migration-checklist.csv): every file, local hash, matching
  production entry, SQL comparison, live assessment, and notes.
- [Full unrecorded list](production-unrecorded-migrations.md): all 255 active files with no matching
  history, plus seven archived backups. This is not a replay list.
- [Complete comparison](production-all-migration-comparison.json.gz): names-only production
  ledger, hashes, classifications, and selected local/live function-body comparison results.
- [Live catalog evidence](production-all-migration-schema.json.gz): columns, constraints, indexes,
  effective grants, triggers, and function metadata/hashes; no retained function source bodies.

Four recent changes are confirmed absent. Ten other unrecorded migrations have matching live
effects; 241 historical files remain unverified at the effect level. Recorded SQL exceptions,
including a live email-review constraint mismatch, are explained in the migration report.

Additional raw observations:

- `prod-paging-{1,2}.json` and `qa-paging-{1,2}.json`: two pairs of metrics readings at least five
  minutes apart. Rate summaries were recalculated offline with the final helper; raw sample times
  and counter values remain intact. No exporter clock was available, so cached-scrape uncertainty
  applies. CPU fractions use summed CPU deltas.
- `prod-baseline.json.gz`, `qa-baseline.json.gz`, `prod-statements-2.json.gz`: earlier diagnostic
  snapshots supporting the delta. They predate the explicit transaction wrapper. All SQL was
  read-only; production's API-only `read_only: true` flag nevertheless reported transaction mode
  `off`. Final snapshots verify the corrected wrapper, `BEGIN READ ONLY … COMMIT`, as `on`.
- `*-inventory.json`, `*-logs.json`, `*-latency.json`: intermediate focused observations. Prefer
  final snapshots for the completed collector output. Production API window: September 23
  17:00–September 24 17:00 UTC; QA: September 24 03:00–03:30 UTC, the earlier gate window.
- `*-queue-function.json`: redacted live queue-function SQL shape. `*-function-flags.json`:
  source-text inspection leads only. Lock words can occur in comments; absence of a named auth
  helper does not prove absence of authorization.

The [follow-up work order](../../SUPABASE_WORK_ORDER_AND_QUEUE_WAKE_2026-09-24.md) explains the later
receipts; it supersedes any interpretation that the earlier maintenance 404s are still ongoing.
Worker health was reduced to operational status, counters and timestamps; unrelated health examples
and user identifiers were excluded from the retained follow-up files.

No secrets, customer messages, prompts, raw request payloads, IPs or auth headers were intentionally
collected. SQL literals/comments are redacted; detailed error bodies were excluded. All evidence
files passed a scan for the actual locally configured credentials without printing those values.
Object names, project refs, deployment IDs and aggregate operational metadata remain intentionally
present. Treat the evidence as internal operational documentation.

The expanded implementation suite passes 21 free health/preflight/security tests, including nine
in disposable local PostgreSQL. Five existing admin-route tests also pass. The
[implementation notes](../../SUPABASE_CONTAINMENT_IMPLEMENTATION_2026-09-24.md) distinguish local
validation from the still-pending hosted migration and paid chat gate. The
[health kit](../../../../../scripts/supabase-health/README.md) uses only Python's standard library.
Regenerate reports locally without credentials:

```sh
python3 scripts/supabase-health/report.py \
  --project-ref iwifjtlebphefldmwbkh \
  --snapshot docs/technical/reviews/supabase-health/2026-09-24/prod-final.json.gz \
  --out /tmp/prod-health-report.md
```

Discovery errors were resolved before the final run: `pg_stat_statements` lives in `extensions`;
`logs.all` now returns 410; the new log store uses `source` plus flattened attributes; aggregating
path×hour exceeded the 1,000-row cap, so those dimensions are collected separately and totals
cross-checked. Superseded incomplete discovery snapshots were discarded. The exact original branch
migration error and historical I/O-budget data remain unavailable, as documented in the audit.

No setting, size, schema, data, deployment, subscription or statistics reset was changed by this
investigation. No paid test or new monitoring service was started. [SHA-256 manifest](manifest.json)
covers the evidence files other than itself.
