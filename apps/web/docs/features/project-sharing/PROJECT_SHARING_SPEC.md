<!-- apps/web/docs/features/project-sharing/PROJECT_SHARING_SPEC.md -->

# Project sharing spec

**Status**: Draft  
**Last updated**: 2026-03-20  
**Owner**: Platform

## Overview

Project sharing lets multiple people collaborate on the same ontology project. It introduces project memberships, email invites, shared-project visibility, and actor-attributed activity (logs + daily briefs).

This spec is scoped to ontology projects (`onto_*` tables). Legacy `projects` support is noted only where it intersects with shared-project UX.

## Related docs

- `apps/web/docs/features/project-sharing/INVITE_REGISTRATION_FLOW_SPEC.md`

## Goals

- Allow owners to invite collaborators by email with role-based access.
- Show “My projects” and “Shared with me” on home and projects pages.
- Attribute changes to the correct actor in activity logs and daily briefs.
- Enforce access through RLS, not scattered per-endpoint checks.

## Implementation status (as of 2026-03-20)

Completed:

- [x] Migration applied: `onto_project_members`, `onto_project_invites`, log actor attribution, triggers, RLS, helper access RPC.
- [x] API access checks updated to use membership access (project routes + entity CRUD + graph/search + events/edges).
- [x] Project list queries include shared membership + expose `is_shared`, role, and access metadata.
- [x] Daily briefs include shared projects with actor-attributed activity (and omit shared section when none).
- [x] Activity log API/UI attribution (`changed_by_actor_id` + actor name).
- [x] Invite flow baseline (create invite + email + accept RPC + accept page).
- [x] Invite registration flow (pending invites + explicit accept/decline + redirect handling).
- [x] Share UI on project detail (invite form + members + pending invites).
- [x] Invite revoke/resend flows (API + UI actions).
- [x] Member management endpoints + UI (role changes, removals).
- [x] Types regeneration for new tables/fields (`onto_project_members`, `onto_project_invites`, `changed_by_actor_id`).

Pending:

- [ ] Tests for RLS access, invite lifecycle, and shared-project daily brief output.

## Non-goals (v1)

- Org-level multi-project sharing.
- Real-time collaborative editing with conflict resolution.
- Per-entity sharing beyond project membership.

## Definitions

- **Actor**: `onto_actors.id` (human or agent). Canonical identity for provenance.
- **Owner**: The actor who created the project. `onto_projects.created_by` stays immutable.
- **Member**: Actor with explicit access to a project via membership.
- **Role**: Human-readable label (`owner`, `editor`, `viewer`).
- **Access**: Enforced permission (`read`, `write`, `admin`).

## Data Model

### 1) Project membership (new)

**Table**: `onto_project_members`

Columns:

- `project_id` (uuid, fk → `onto_projects.id`)
- `actor_id` (uuid, fk → `onto_actors.id`)
- `role_key` (text) - `owner` | `editor` | `viewer`
- `access` (text) - `read` | `write` | `admin`
- `added_by_actor_id` (uuid, fk → `onto_actors.id`)
- `removed_at` (timestamptz, nullable)
- `removed_by_actor_id` (uuid, fk → `onto_actors.id`, nullable)
- `created_at` (timestamptz)

Constraints:

- unique `(project_id, actor_id)` for active membership (optionally use `removed_at is null` partial index).

### 2) Project invites (new)

**Table**: `onto_project_invites`

Columns:

- `project_id` (uuid, fk → `onto_projects.id`)
- `invitee_email` (text)
- `token_hash` (text) - store only hashed token
- `role_key` (text)
- `access` (text)
- `status` (text) - `pending` | `accepted` | `revoked` | `expired` | `declined`
- `expires_at` (timestamptz)
- `invited_by_actor_id` (uuid, fk → `onto_actors.id`)
- `accepted_by_actor_id` (uuid, fk → `onto_actors.id`, nullable)
- `accepted_at` (timestamptz, nullable)
- `created_at` (timestamptz)

Constraints:

- unique active invite per `(project_id, invitee_email)`.

### 3) Activity logs (update)

**Table**: `onto_project_logs`

Add:

- `changed_by_actor_id` (uuid, fk → `onto_actors.id`)
- Optionally keep `changed_by` as user id for backward compatibility.

Update Types:

- `ProjectLogEntry` should expose `changed_by_actor_id` and `changed_by_name`.

References:

- Current schema: `supabase/migrations/20251208_project_activity_logging.sql:11-73`
- Web logger insert: `apps/web/src/lib/services/async-activity-logger.ts:140-183`
- Worker chat logs: `apps/worker/src/workers/chat/chatSessionActivityProcessor.ts:260-310`

### 4) Daily briefs metadata (optional)

**Tables**: `ontology_daily_briefs`, `ontology_project_briefs`

Add optional metadata fields for team activity summaries by actor id.

References:

- `supabase/migrations/20251225_ontology_daily_briefs.sql:12-120`

## Access Control & RLS

### New helper functions

- `current_actor_id()` already exists.
    - `supabase/migrations/20251220_ontology_rls_policies.sql:40-55`
- Add `current_actor_has_project_access(project_id, access)` which checks active membership.
- Add `current_actor_project_role(project_id)` to annotate access in queries.

### RLS policy changes (map)

**Existing RLS**: owner-only via `created_by = current_actor_id()`.

Update these tables to allow membership-based access:

- `onto_projects`
- `onto_tasks`
- `onto_plans`
- `onto_outputs`
- `onto_documents`
- `onto_goals`
- `onto_milestones`
- `onto_risks`
- `onto_requirements`
- `onto_decisions`
- `onto_edges`
    - Policies live in `supabase/migrations/20251220_ontology_rls_policies.sql:94-586`

Add or update RLS on:

- `onto_project_logs`
    - `supabase/migrations/20251208_project_activity_logging.sql:54-79`
- `ontology_daily_briefs`, `ontology_project_briefs`, `ontology_brief_entities`
    - `supabase/migrations/20251225_ontology_daily_briefs.sql:222-326`
- New tables: `onto_project_members`, `onto_project_invites`

**Recommended policy model**

- SELECT:
    - owner OR `current_actor_has_project_access(project_id, 'read')`.
- INSERT/UPDATE/DELETE:
    - owner OR `current_actor_has_project_access(project_id, 'write')` or `admin`.

**Service role**

- Service role can access all tables (existing pattern) but must filter by membership in application logic when generating user-facing data (worker runs as service role).

## API Design

### New endpoints

- `POST /api/onto/projects/:id/invites`
    - Create invite, send email, log activity.
- `GET /api/onto/projects/:id/invites`
    - List pending invites (owner/admin only).
- `POST /api/onto/invites/token/:token/accept`
    - Accept invite, create membership, log activity.
- `GET /api/onto/invites/pending`
    - List pending invites for the current user (email match).
- `POST /api/onto/invites/:inviteId/accept`
    - Accept invite by id (used for pending list + invite page).
- `POST /api/onto/invites/:inviteId/decline`
    - Decline invite by id.
- `POST /api/onto/projects/:id/invites/:inviteId/revoke`
    - Revoke invite (owner/admin only).
- `GET /api/onto/projects/:id/members`
    - List members + roles.
- `POST /api/onto/projects/:id/members/:memberId/remove`
    - Remove member (owner/admin).
- `PATCH /api/onto/projects/:id/members/:memberId`
    - Update role/access.

### Updated endpoints (ownership checks → membership checks)

**Project listing**

- `GET /api/onto/projects` (and server loads)
    - Replace `created_by = actorId` with membership-based filtering.
    - `apps/web/src/lib/services/ontology/ontology-projects.service.ts:52-116`
    - `apps/web/src/routes/+page.server.ts:34-93`
    - `apps/web/src/routes/projects/+page.server.ts:27-47`

**Ontology CRUD endpoints with explicit owner checks**

All below currently enforce `project.created_by === actorId` and must pivot to membership checks:

- `apps/web/src/routes/api/onto/projects/[id]/+server.ts`
- `apps/web/src/routes/api/onto/projects/[id]/logs/+server.ts`
- `apps/web/src/routes/api/onto/projects/[id]/graph/+server.ts`
- `apps/web/src/routes/api/onto/projects/[id]/graph/full/+server.ts`
- `apps/web/src/routes/api/onto/projects/[id]/events/+server.ts`
- `apps/web/src/routes/api/onto/projects/[id]/calendar/+server.ts`
- `apps/web/src/routes/api/onto/projects/[id]/next-step/generate/+server.ts`
- `apps/web/src/routes/api/onto/projects/[id]/reorganize/+server.ts`
- `apps/web/src/routes/api/onto/search/+server.ts`
- `apps/web/src/routes/api/onto/graph/+server.ts`
- `apps/web/src/routes/api/onto/edges/+server.ts`
- `apps/web/src/routes/api/onto/edges/[id]/+server.ts`
- `apps/web/src/routes/api/onto/edges/available/+server.ts`
- `apps/web/src/routes/api/onto/edges/linked/+server.ts`
- `apps/web/src/routes/api/onto/tasks/create/+server.ts`
- `apps/web/src/routes/api/onto/tasks/[id]/+server.ts`
- `apps/web/src/routes/api/onto/tasks/[id]/full/+server.ts`
- `apps/web/src/routes/api/onto/tasks/[id]/documents/+server.ts`
- `apps/web/src/routes/api/onto/tasks/task-document-helpers.ts`
- `apps/web/src/routes/api/onto/plans/create/+server.ts`
- `apps/web/src/routes/api/onto/plans/[id]/+server.ts`
- `apps/web/src/routes/api/onto/plans/[id]/full/+server.ts`
- `apps/web/src/routes/api/onto/goals/create/+server.ts`
- `apps/web/src/routes/api/onto/goals/[id]/+server.ts`
- `apps/web/src/routes/api/onto/goals/[id]/full/+server.ts`
- `apps/web/src/routes/api/onto/goals/[id]/reverse/context.ts`
- `apps/web/src/routes/api/onto/goals/[id]/reverse/apply/+server.ts`
- `apps/web/src/routes/api/onto/milestones/create/+server.ts`
- `apps/web/src/routes/api/onto/milestones/[id]/+server.ts`
- `apps/web/src/routes/api/onto/risks/create/+server.ts`
- `apps/web/src/routes/api/onto/risks/[id]/+server.ts`
- `apps/web/src/routes/api/onto/requirements/[id]/+server.ts`
- `apps/web/src/routes/api/onto/decisions/+server.ts`
- `apps/web/src/routes/api/onto/decisions/[id]/+server.ts`
- `apps/web/src/routes/api/onto/documents/create/+server.ts`
- `apps/web/src/routes/api/onto/documents/[id]/+server.ts`
- `apps/web/src/routes/api/onto/documents/[id]/full/+server.ts`
- `apps/web/src/routes/api/onto/outputs/create/+server.ts`
- `apps/web/src/routes/api/onto/outputs/[id]/+server.ts`
- `apps/web/src/routes/api/onto/outputs/[id]/full/+server.ts`
- `apps/web/src/routes/api/onto/outputs/generate/+server.ts`
- `apps/web/src/routes/api/onto/events/[id]/+server.ts`

**Worker / service role access**

- `apps/worker/src/workers/brief/ontologyBriefDataLoader.ts:563-739`
    - Replace `created_by = actorId` with membership-based project list.

## UI/UX

### Home + Projects pages

- Split lists: “My projects” vs “Shared with me”.
- Show owner label and role badge for shared projects.
- Add filters for `owned`, `shared`, `all`.

### Project detail

- Add “Share” action to project header.
- Share modal:
    - Invite form (email + role).
    - List current members with roles.
    - List pending invites + revoke.

### Activity log panel

- Show actor name/avatar for each log entry.
- Include membership changes as activity events.

## Daily briefs

- Include shared projects in daily brief generation.
- Use `onto_project_logs` to show who did what, rather than `updated_at` only.
- Respect privacy: show only project-scoped activity for shared projects.

## Notifications & Email

- Invite email: send via `EmailService`, include project name + description and auth CTAs.
    - `apps/web/src/lib/services/email-service.ts:1-127`
- In-app notifications for:
    - Invite received
    - Invite accepted
    - Access removed
- Follow user notification preferences.

## Search & caching

- Update search endpoints to include shared projects.
- Ensure cached project lists invalidate on membership changes.
- Consider a `project_access` view to avoid expensive joins.

## Calendar integration

- Decide if project sharing implies calendar sharing.
- If linked, update calendar ACLs when membership changes.

## Migration & Backfill

1. Create `onto_project_members`, `onto_project_invites`.
2. Backfill owner membership for all projects.
3. Add `changed_by_actor_id` to `onto_project_logs`, backfill via `onto_actors.user_id`.
4. Update RLS policies + helper functions.
5. Update endpoints and UI.

## Telemetry

- Track invite creation/acceptance/revocation.
- Track member adds/removes and role changes.
- Track shared-project activity usage.

## Testing

- RLS policy tests for member access vs owner-only.
- Invite flow tests (create, accept, expire, revoke).
- Daily brief with shared projects (actor attribution).
- Activity log attribution and UI rendering.

## Rollout

- Add a feature flag for project sharing.
- Enable in internal accounts first, then wider rollout.
- Monitor RLS performance and log failures.

## Open questions

- Ownership transfer: keep `created_by` immutable or add `owner_actor_id`?
- Invite acceptance: auto-accept if authenticated email matches invite?
- Calendar sharing: inherit project membership or separate toggle?
