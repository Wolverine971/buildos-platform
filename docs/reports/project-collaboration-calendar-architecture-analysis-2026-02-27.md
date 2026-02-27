<!-- docs/reports/project-collaboration-calendar-architecture-analysis-2026-02-27.md -->

# Project Collaboration Calendar Architecture Analysis (2026-02-27)

## Scope

This document captures:

1. The current implementation status for project collaboration and calendar sync.
2. Gaps and risks discovered in code and schema.
3. A decision analysis of whether to move to a single shared project calendar model.
4. A recommended target architecture and phased rollout plan.

## Executive Decision

- **Do not switch to a single shared project calendar as the default architecture.**
- **Keep and harden the per-user-per-project calendar mapping model** (already mostly in place).
- **Add optional shared-calendar workflows later** (link existing shared calendar, or team fanout mode) only if product requirements demand it.

Reason: the single shared calendar model introduces fragile ownership/token dependencies, complicated ACL lifecycle handling, and worse failure characteristics for collaborative editing unless you also build substantial new infra.

## Current Implementation Snapshot

### What is working

1. Collaboration access model is implemented and mature:
    - Membership/invite tables and access helper function exist.
    - Access checks include owner + membership + public read behavior.
    - References:
        - `supabase/migrations/20260320000000_project_sharing_membership.sql`
        - `supabase/migrations/20260320000002_project_sharing_access_fixes.sql`
        - `packages/shared-types/src/functions/current_actor_has_project_access.sql`

2. Project calendar mapping is user-scoped:
    - `project_calendars` has both `project_id` and `user_id`.
    - APIs/services fetch by `(project_id, user_id)`.
    - References:
        - `packages/shared-types/src/database.schema.ts`
        - `apps/web/src/lib/services/project-calendar.service.ts`
        - `apps/web/src/routes/api/onto/projects/[id]/calendar/+server.ts`

3. Project calendar API allows collaborators with write access:
    - Uses `current_actor_has_project_access(..., 'write')`, not owner-only.
    - Reference:
        - `apps/web/src/routes/api/onto/projects/[id]/calendar/+server.ts`

4. Dashboard calendar visibility includes shared membership:
    - `list_calendar_items` includes both owner projects and active member projects.
    - Reference:
        - `supabase/migrations/20260208_120000_fix_calendar_items_user_scope.sql`

## Findings and Risks

### Critical

1. Ontology event external sync mapping is not user-scoped.
    - `onto_event_sync` stores a `calendar_id` FK to `project_calendars.id`, but no `user_id`.
    - Update/delete paths resolve one mapping then call Google with the current actor's token.
    - In collaboration, user B can edit user A's ontology event and then fail to update/delete A's Google event.
    - References:
        - `packages/shared-types/src/database.schema.ts`
        - `packages/shared-types/src/database.types.ts`
        - `apps/web/src/lib/services/ontology/onto-event-sync.service.ts`

2. Calendar sync failures can be silent to collaborators.
    - Event mutation succeeds in ontology; Google sync can fail and only mark `sync_status='failed'`.
    - This creates cross-calendar drift.
    - Reference:
        - `apps/web/src/lib/services/ontology/onto-event-sync.service.ts`

3. Legacy task scheduling path still assumes creator ownership.
    - `CalendarService.scheduleTask` filters task by `created_by = actorId`.
    - In shared projects, collaborator-triggered scheduling can fail for tasks created by another member.
    - References:
        - `apps/web/src/lib/services/calendar-service.ts`
        - `apps/web/src/lib/services/project-calendar.service.ts`

### High

4. Agentic calendar tools are owner-only.
    - `assertProjectOwnership` checks `onto_projects.created_by` only.
    - Collaborators with write access are blocked in chat-tool flows.
    - References:
        - `apps/web/src/lib/services/agentic-chat/tools/core/executors/base-executor.ts`
        - `apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.ts`

5. No first-class "link existing Google calendar to project" flow.
    - Current path creates a new calendar; no API/tool input for existing `calendar_id`.
    - References:
        - `apps/web/src/routes/api/onto/projects/[id]/calendar/+server.ts`
        - `apps/web/src/lib/services/project-calendar.service.ts`
        - `apps/web/src/lib/services/agentic-chat/tools/core/definitions/calendar.ts`

6. Shared `onto_projects.props.calendar` stores per-user settings.
    - Per-user operations write shared project props (`sync_enabled`, `color_id`), causing last-write-wins conflicts.
    - Reference:
        - `apps/web/src/lib/services/project-calendar.service.ts`

### Medium

7. Potential missing DB uniqueness backstop for one mapping per project/user.
    - Service assumes single row for `(project_id, user_id)` via `.single()/.maybeSingle()`.
    - Migration set inspected did not show an explicit unique index for that pair.
    - References:
        - `apps/web/src/lib/services/project-calendar.service.ts`
        - `supabase/migrations/20260129_align_project_calendars_to_onto_projects.sql`

8. UI is singular and user-centric, not multi-calendar aware.
    - Modal assumes one mapping exists or not; no multi-mapping management UI.
    - Reference:
        - `apps/web/src/lib/components/project/ProjectCalendarSettingsModal.svelte`

## Decision Analysis: Single Shared Project Calendar

## Option A: One shared external project calendar (single canonical Google calendar)

How it would work:

1. One Google calendar per project acts as canonical external calendar.
2. Members subscribe to/view that calendar in their own Google accounts.
3. App writes all project events to that one calendar.

Potential advantages:

1. One external feed per project.
2. No duplicated event projections across user calendars.
3. Simpler mental model for "team calendar."

Major drawbacks:

1. **Ownership/token fragility**:
    - If canonical calendar is owned by a user OAuth token and that user disconnects, operations break.
2. **ACL lifecycle complexity**:
    - Membership changes must reliably update calendar ACLs.
    - Pending invites, removals, and role changes must map cleanly to Google ACL permissions.
3. **Write-permission mismatch**:
    - If collaborators should edit project events, they need Google write ACL on canonical calendar.
    - Without that ACL, app must centralize writes through one privileged integration path.
4. **Operational complexity**:
    - Requires robust reconciliation jobs for ACL drift and ownership drift.
5. **Platform constraints**:
    - Service-account-first central ownership is straightforward mainly with Google Workspace + domain controls.
    - Mixed consumer accounts increase complexity.

Conclusion:

- **Good as an optional feature for specific teams.**
- **Not a good default architecture for your current collaboration model.**

## Option B: Per-user project calendar mapping (current direction, hardened)

How it works:

1. Each user can connect one calendar mapping per project.
2. Ontology events are projected to each user's chosen calendar according to that user's sync settings.

Advantages:

1. No single-owner external dependency.
2. Each user controls their own Google connection and calendar destination.
3. Easier privacy and account boundary handling.
4. Works naturally with mixed account types.

Tradeoffs:

1. Requires explicit user-scoped sync mappings and status tracking.
2. Need to define multi-user projection semantics (actor-only sync vs. fanout).
3. Can duplicate event copies across user calendars by design.

Conclusion:

- **Best default for your product as it exists now.**

## Option C: Hybrid (recommended long-term shape)

1. Keep Option B as default.
2. Add optional project-level shared external calendar mode:
    - Link an existing shared calendar.
    - Expose read-only or read-write team mode.
3. Let teams choose:
    - Personal projection calendars, shared team calendar, or both.

This avoids forcing all users into the operational complexity of shared-calendar ownership while still enabling "one team calendar" for teams that want it.

## Recommended Target Architecture

### Phase 1 (now): harden current model

1. Add DB unique constraint/index on `project_calendars(project_id, user_id)`.
2. Add user-scoped event sync mapping model:
    - Either extend `onto_event_sync` with `user_id`, or create `onto_event_sync_targets`.
3. Stop writing per-user sync state to shared `onto_projects.props.calendar`.
4. Replace owner-only agentic calendar checks with `current_actor_has_project_access(..., 'write')`.
5. Support linking an existing Google calendar ID in project calendar setup.
6. Remove creator-only (`created_by`) filters from collaborator-safe scheduling paths.

### Phase 2 (after hardening): collaboration sync semantics

Choose one default explicitly:

1. **Actor-projection mode**:
    - When collaborator updates an event, sync only to collaborator's mapped calendar.
2. **Member-fanout mode**:
    - Event changes sync to all project members with enabled mappings.

Recommendation: start with **actor-projection** for reliability and lower blast radius; add fanout later.

### Phase 3 (optional): shared team calendar mode

1. Add project setting for "shared external calendar."
2. Allow linking existing team-shared Google calendar.
3. Add ACL reconciliation jobs and health telemetry.
4. Keep per-user calendars as fallback.

## Go / No-Go Recommendation

1. **No-Go** on replacing current direction with single shared project calendar as the only model.
2. **Go** on continuing per-user project calendar architecture, with the hardening changes above.
3. **Go** on adding optional shared-calendar mode later if customer demand justifies added operational cost.

## Implementation Notes for Next Review

If needed, this report can be turned into:

1. An ADR in `docs/architecture/decisions/` for the default model choice.
2. A migration plan ticket set (schema + service + UI + tooling).
3. A rollout checklist with backfill scripts and data integrity checks.
