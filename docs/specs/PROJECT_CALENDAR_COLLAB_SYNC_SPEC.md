<!-- docs/specs/PROJECT_CALENDAR_COLLAB_SYNC_SPEC.md -->

# Project Calendar Collaboration and Event Sync Spec

_Status: Active implementation (Phase 1 complete, Phase 2 in progress)_  
_Date: 2026-02-27_  
_Owner: Web/Ontology platform_

## 1. Problem Statement

Projects are collaborative, but calendar sync behavior currently has mixed assumptions:

1. Collaboration permissions are project-member based.
2. Calendar mappings are per-user-per-project.
3. Some sync/update paths still assume creator ownership or a single sync mapping.

This leads to drift/failures when collaborators edit shared project events.

## 2. Goals

1. Establish **BuildOS ontology events as the single source of truth** for project scheduling data.
2. Keep calendar integration reliable for collaborative projects.
3. Support per-user calendar mapping to a project by default.
4. Allow linking an existing Google calendar to a project mapping (not create-only).
5. Ensure collaborator access controls are project-access based, not owner-only.

## 3. Non-Goals (Phase 1)

1. Full shared-team-calendar external mode as default.
2. Two-way Google->BuildOS conflict resolution for project events.
3. Full event-fanout orchestration redesign in one release.

## 4. Decision Summary

1. Default architecture remains **per-user-per-project calendar mappings**.
2. BuildOS remains canonical; Google calendars are projections.
3. Single shared external project calendar remains an optional future mode, not default.

## 4.1 Implementation Progress (2026-02-27)

### Completed in Phase 1

1. Added unique DB backstop for one mapping per `(project_id, user_id)`:
    - `supabase/migrations/20260426000016_project_calendars_unique_project_user.sql`
2. Added ability to link existing Google calendar IDs when creating project mappings:
    - API/service + agentic tool support for `calendarId` / `calendar_id`.
3. Stopped writing per-user sync settings into shared `onto_projects.props.calendar`.
4. Replaced owner-only calendar executor checks with project-access checks.
5. Removed creator-only assumptions in collaborator scheduling/update helper paths.

### Completed in Phase 2 (current)

1. Added explicit user scope to event sync targets:
    - `onto_event_sync.user_id` + FK + backfill + dedupe + unique index on `(event_id, user_id, provider)`.
    - `supabase/migrations/20260426000017_onto_event_sync_user_scope.sql`
2. Updated event sync read/write paths to be user-scoped:
    - Sync rows now written with `user_id`.
    - Event mapping resolution for update/delete only uses caller-owned mapping.
3. Updated API/tooling consumers to read caller-scoped sync rows:
    - project events list
    - single event get
    - task-events endpoint
    - calendar executor list/detail/update flows

### Remaining for Phase 2 completion

1. Add background sync worker with retry/backoff and attempt tracking.
2. Add optional member-fanout sync mode (default remains actor-projection).
3. Add UI/telemetry for per-target sync status and retry visibility.

## 5. Current-State Risks (Baseline)

1. `onto_event_sync` is not explicitly user-scoped.
2. Sync/update/delete can fail when collaborator token differs from calendar owner.
3. Legacy schedule/update paths still filter by `created_by`.
4. Agentic calendar tooling is owner-only.
5. Per-user calendar settings are written into shared `onto_projects.props.calendar`.
6. Service assumes one calendar mapping per `(project_id, user_id)` without explicit DB uniqueness backstop.

## 6. Target Architecture

## 6.1 Source of truth

1. `onto_events` is canonical for event state.
2. Any BuildOS mutation writes canonical event first.
3. External calendar sync is an asynchronous side effect.

## 6.2 Sync projection model

1. Each event can project to one or more sync targets.
2. In Phase 1, projection still uses existing model with hardened behavior.
3. In Phase 2, projection metadata becomes explicitly user-scoped.

## 6.3 Permission model

1. Project event/calendar operations require `current_actor_has_project_access(project_id, 'write')`.
2. Owner-only checks are removed from calendar collaboration tool paths.

## 7. Phase Plan

## 7.1 Phase 1 (Implement now)

### Data integrity

1. Add unique index on `project_calendars(project_id, user_id)`.

### API + service behavior

1. Add `calendarId` support for project calendar create endpoint to link existing Google calendars.
2. Keep create-new path as default when `calendarId` is absent.
3. Stop mutating shared `onto_projects.props.calendar` for per-user settings updates/deletes.

### Collaboration access alignment

1. Replace owner-only checks in agentic calendar executor paths with project-access checks.

### Scheduling path hardening

1. Remove creator-only (`created_by`) filters in calendar scheduling/update helper lookups that should work for collaborators.

## 7.2 Phase 2 (In Progress)

1. Implement explicit user-scoped sync target model for ontology event projections.
2. Define authoritative sync semantics:
    - actor-projection default
    - optional member-fanout mode
3. Add background sync worker with retries/backoff and per-target status.

## 7.3 Phase 3 (Optional)

1. Add optional shared external team calendar mode.
2. Add ACL reconciliation jobs for shared calendar permissions.

## 8. Data Model Changes

## 8.1 Phase 1 migration

1. `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_project_calendars_project_user ON project_calendars(project_id, user_id);`

Notes:

1. If duplicate rows exist, migration will fail; preflight query required for remediation.

## 8.2 Phase 2 data model (implemented foundation + pending extensions)

Implemented:

1. Extended `onto_event_sync` with `user_id uuid` FK to `users(id)`.
2. Backfilled `user_id` from `project_calendars`.
3. Added unique partial index on `(event_id, user_id, provider)` where `user_id IS NOT NULL`.

Pending extensions:

1. Add attempt/backoff fields (or a dedicated job table) for durable retry workflow.
2. Add optional `last_synced_version` semantics for stronger idempotency/version tracking.

## 9. API Contract Changes

## 9.1 Project calendar API

`POST /api/onto/projects/:id/calendar` request adds optional:

1. `calendarId: string` (existing Google calendar ID to link)

Behavior:

1. If `calendarId` provided -> validate access and insert mapping.
2. Else -> create new Google calendar then insert mapping.

## 9.2 Agentic calendar tools

1. `set_project_calendar` gains optional `calendar_id` argument (same semantics as `calendarId`).

## 10. Sync Semantics (Design)

Authoritative model:

1. BuildOS event updates are authoritative.
2. External sync is best-effort with durable retry and visibility.

Mutation flow (target state):

1. User updates event in BuildOS.
2. Canonical row updated (`onto_events`).
3. Sync jobs emitted for relevant targets.
4. Worker applies changes to Google.
5. Per-target sync state updated.

Conflict policy:

1. For project events, default to one-way BuildOS->Google.
2. Google-side edits are not canonical unless explicit import/merge feature is introduced.

## 11. Observability and Error Handling

1. Track sync failures at per-target granularity.
2. Expose “last sync status” in event and calendar settings UI.
3. Add structured logs for:
    - mapping resolution failures
    - token/auth failures
    - Google permission errors
    - missing target calendars

## 12. Backward Compatibility

1. Existing project calendar mappings continue working.
2. Existing API clients can omit new `calendarId` field.
3. Agentic tool calls without `calendar_id` keep old behavior.

## 13. Security and Access

1. No collaborator should mutate calendar mapping/events without `write` project access.
2. Linking a calendar only affects the caller's mapping row unless explicitly in future team mode.
3. Avoid writing per-user sync flags into shared project props.

## 14. Test Plan

Phase 1 test additions:

1. Project calendar create with existing `calendarId` links mapping and does not create new calendar.
2. Collaborator (non-owner, write member) can use calendar agentic tool flows.
3. Scheduling/update paths no longer fail solely due to `created_by` mismatch.
4. Unique index prevents duplicate `(project_id, user_id)` mappings.

Phase 2 test additions:

1. Multi-user event edit sync behavior across per-user targets.
2. Retry/backoff and partial-failure behavior.

## 15. Rollout Status

1. Phase 1 code + migration: completed.
2. Phase 2 user-scoped schema foundation + service/API alignment: completed.
3. Next rollout step: background worker + retry/backoff + fanout policy controls.

## 16. Open Questions

1. Should Phase 2 use actor-based identity for sync targets rather than user ID?
2. Should default projection mode be actor-only or member-fanout?
3. Should shared team calendar mode require explicit Google ACL management ownership policy?
