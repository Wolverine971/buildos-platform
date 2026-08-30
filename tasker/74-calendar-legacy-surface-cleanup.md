<!-- tasker/74-calendar-legacy-surface-cleanup.md -->

# 74 — Reconcile legacy calendar surfaces with the ontology calendar model

**Created:** 2026-08-29
**Status:** Ready — two deterministic production defects isolated during the route smoke
**Mission:** Make the remaining legacy calendar UI surfaces use the same connection and task schema
contracts as the verified multi-source ontology calendar route.

## Why this work exists

The authenticated Tasker 54 production smoke completed the core calendar route lifecycle, but it
also exposed two independent UI contract drifts:

1. The calendar dashboard correctly showed two connected Google accounts, while `/time-blocks` and
   the legacy `GET /api/calendar` connection check reported `connected: false` and displayed
   "Calendar Connection Required."
2. Saving recurrence from the task editor failed with
   `column "plan_id" of relation "onto_tasks" does not exist`. The editor is still targeting a
   removed legacy task column instead of the current ontology scheduling contract.

These are not failures of the source-aware `/api/calendar` mutation route. That route created,
read, updated, and deleted a three-instance recurring Google series in production and left no live
event, mapping, orphan, or temporary task behind.

## Work packages

### W1 — Unify calendar connection status

- Characterize the dashboard, `/time-blocks`, and `GET /api/calendar` connection queries.
- Replace the stale single-connection check with the canonical multi-source connection service or
  query already used by the dashboard.
- Preserve the intended feature gate and exact-user allowlist behavior.
- Add regression coverage proving that at least one healthy source yields `connected: true`, with
  disconnected and revoked-source cases still failing closed.

### W2 — Repair task recurrence editing

- Trace the task editor recurrence save path and remove its dependency on `onto_tasks.plan_id`.
- Reuse the ontology event/edge scheduling contract rather than introducing another task-calendar
  mapping model.
- Cover initial recurrence, recurrence update, recurrence removal, and failure compensation.

### W3 — Verify live

- Run focused route, service, and component tests plus the web typecheck and route guard.
- Deploy the fixes.
- With an authenticated connected account, verify `/time-blocks` recognizes the connection and the
  task editor can add, change, and remove recurrence.
- Delete all temporary tasks and calendar events and record zero-orphan cleanup evidence.

## Boundaries

- Do not reopen the completed Tasker 54 route split or replace its verified
  `onto_events`/`onto_event_sync`/`onto_edges` write path.
- Do not include the held legacy agent-chat retirement in this tracker.
- Do not use a service-role bypass to hide a user-scope RLS or schema mismatch.

## Exit condition

Both deterministic production defects are fixed, focused and repository gates are recorded,
deployment is healthy, the authenticated live checks pass, and their temporary data is removed.
