<!-- docs/technical/reviews/SUPABASE_CONTAINMENT_IMPLEMENTATION_2026-09-24.md -->

# Supabase containment implementation — September 24, 2026

**Prepared and locally validated; not applied to production or QA.** DJ authorized starting
fixes, approved the wake-aware five-second polling recommendation, and asked us to investigate
retiring the legacy phase-date RPC. QA stays in place. No paid tests, hosted writes, deployment,
resize, or database deletion occurred in this change set.

## The focused security patch

[Migration 20260924202321](../../../supabase/migrations/20260924202321_contain_legacy_admin_rpcs.sql)
does three things in one transaction, with a two-second lock timeout:

| Function                                             | Change                                                                                                       | Caller / compatibility evidence                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `batch_update_phase_dates(uuid,jsonb)`               | Drop with `RESTRICT`; remove its source snapshot and TypeScript declaration. Keep every phase table and row. | No application caller, catalog dependency, or other function-body reference on either project. No execution calls observed in available statement statistics; QA's five references were GRANT/COMMENT/ALTER operations. Statistics are not an all-time usage guarantee. |
| `acquire_migration_platform_lock(uuid,uuid,integer)` | Keep behavior; service-only execution, `SECURITY INVOKER`, empty fixed search path, qualified table names.   | Admin migration-start route checks session/admin status, then passes `createAdminSupabaseClient()` into `MigrationStatsService`. Both databases grant the service role the required SELECT/UPDATE rights and BYPASSRLS.                                                 |
| `get_subscription_overview()`                        | Keep behavior; same restrictions and safe name resolution.                                                   | Subscription-overview and analytics-dashboard admin routes authorize first, then use the admin client. The service role has SELECT on subscriptions/plans on both databases.                                                                                            |

The migration revokes execution from **PUBLIC, anon, and authenticated**, then explicitly grants
the service role. Revoking PUBLIC closes the inherited default grant. Removing unnecessary
definer privileges also limits the damage of future accidental grants. An unexpected phase-RPC
dependency aborts the migration rather than cascading into another object. A schema reload
notification is sent on commit.

The [incident rollback](../../../supabase/manual/rollback_20260924202321_contain_legacy_admin_rpcs.sql)
restores the two admin functions' previous execution identity and a service-only phase RPC,
while keeping safe paths and denying client execution. It deliberately does not restore the
original security exposure. It is a manual incident option, not an automatic migration. A
phase rollback requires server-side table privileges; it does not authorize a legacy browser
caller. The forward migration can be reapplied after the cause is resolved.

## Release checks and the QA finding

The new [read-only preflight](../../../scripts/supabase-health/preflight.py) checks exact RPC
signatures, named arguments, service-only grants, invoker/path settings, recovery lock timeout,
and required ledger versions. Optional cron checks fail when the latest receipt fails, a
warning/error appears in the last 15 minutes, or no success exists within five minutes.
It never invokes a recovery or reaper function as a probe, and is not an installed alert.

- **Production maintenance: 17/17 checks pass**, including current successful cron receipts.
- **QA maintenance: 11 function checks pass; three ledger checks fail.** Versions
  `20260924000000`, `20260924000100`, and `20260924150000` are absent. No alternate ledger
  entries with the relevant lease/reaper/lock-free names were found. Verify complete migration
  effects under Tasker 63 before repairing ledger metadata. Do not replay old DDL or assume that
  checking two functions proves every statement in those migrations ran.
- **Security preflight correctly fails before deployment.** The original exposed grants and
  phase RPC remain live, and the new migration is not yet recorded.

Receipts: [production maintenance](supabase-health/2026-09-24/prod-maintenance-preflight.json.gz),
[QA maintenance](supabase-health/2026-09-24/qa-maintenance-preflight.json.gz),
[production security baseline](supabase-health/2026-09-24/prod-security-preparation.json.gz),
[QA security baseline](supabase-health/2026-09-24/qa-security-preparation.json.gz).

Deployment sequence: apply only the reviewed new security migration to QA; verify the security
preflight and API authorization/legitimate admin reads; apply the same migration to production;
verify again and inspect authorization errors. Preserve/record the exact migration version in
the ledger. A metadata pass does not prove PostgREST schema-cache visibility. Never exercise
the production migration lock or phase mutation just to test an endpoint. No broad `db push
--include-all` or historical migration replay belongs in this release.

## Validation

- **21 free health/security checks passed**, including nine disposable PostgreSQL tests:
  client denial (including a role with only PUBLIC grants), allowed service behavior, lock
  exclusion, correct revenue totals, temporary-table shadowing, safe function settings,
  idempotent application, dependency refusal, and compatibility rollback containment.
- **Five existing admin-route tests passed** across the subscription and analytics route files.
- Local migration naming/duplicate-version guard passed: 477 files; only its existing 29
  filename exceptions and nine historical duplicate versions. Historical immutability comparison
  was not run; no existing migration was edited. `git diff --check` passed.

## Five-second polling implemented locally

DJ removed the mandatory per-change-set gate requirement. `AGENTS.md` and the gate guide now
use focused free tests for routine changes; each paid run still requires explicit approval.
No paid gate ran, and earlier failed gate evidence is not relabeled as passing.

The dedicated chat consumer now uses:

- immediate claims at startup, on every successful subscription (including the first), on wake,
  and when a slot opens;
- a five-second safety deadline plus 0–250 ms jitter while the wake channel is subscribed;
- the existing one-second fallback while disabled, connecting or retrying;
- one in-flight claim and one coalesced wake follow-up, with the idle timer reset after a claim;
- no safety timer/claim while all execution slots are occupied, with immediate refill afterward.

The general worker keeps its existing fixed interval. Cancellation, leases, recovery and job
execution do not change. The existing `CHAT_POLL_INTERVAL_MS=1000` production setting remains the
fast fallback; the new optional `CHAT_IDLE_POLL_INTERVAL_MS` defaults to 5000, so the optimization
will take effect on deployment without requiring a new environment value. Set it to 1000 to
restore the old cadence while keeping immediate wakes. A silently missed notification can wait
up to the five-second interval plus jitter and claim duration.

Queue health exposes the current interval, jitter bound, wake health, next safety deadline,
claims by startup/timer/wake/refill reason, and empty claims. These support comparing an idle
window after deployment against the audit. The expected chat idle claim reduction is about 80%;
no live reduction or invoice saving is claimed yet.

Validation: **101 distinct focused worker tests pass** across queue scheduling, refill/drain,
consumer/config, bootstrap and wake listener. Tests cover missed notifications, recovery requeues,
future-due jobs, overlapping wake/timer claims, a completion during a claim, connection failures,
reconnects, full capacity, and shutdown. The first run caught a queued callback executing after
listener shutdown; that race is fixed and the listener suite passes. Worker source typechecking
passes, and the worker test typecheck passes with zero errors. No app deployment has occurred.

## Migration verification and staging

The [migration verification report](SUPABASE_MIGRATION_STATUS_2026-09-24.md) distinguishes
recorded versions, directly observed schema and Git state. The only uncommitted migration is
`20260924202321_contain_legacy_admin_rpcs.sql`: neither database has its ledger entry or security
changes, so it remains **unstaged**, following DJ's instruction to stage migrations only if
already applied. Today's production-recorded recovery/privacy migrations are already committed.
