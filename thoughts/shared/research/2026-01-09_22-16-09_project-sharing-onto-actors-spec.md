---
date: 2026-01-09T22:16:12-0500
researcher: Codex
git_commit: 95a811ec3ddb0f293b0870b53965ec9489f05ae4
branch: main
repository: buildos-platform
topic: 'Project sharing, invitations, and actor-aware activity logs'
tags: [research, ontology, project-sharing, access-control, activity-logs, daily-briefs]
status: complete
last_updated: 2026-01-09
last_updated_by: Codex
last_updated_note: 'Added forward-looking architecture considerations and cross-cutting impacts'
path: thoughts/shared/research/2026-01-09_22-16-09_project-sharing-onto-actors-spec.md
---

# Research: Project sharing, invitations, and actor-aware activity logs

**Date**: 2026-01-09 22:16:12 -0500  
**Researcher**: Codex  
**Git Commit**: 95a811ec3ddb0f293b0870b53965ec9489f05ae4

## Research Question

What changes are required to support multi-user project sharing (invite flow, shared project visibility, actor-aware activity logging, and shared-project daily briefs) in the current ontology-based architecture?

## Summary

- Ontology ownership and RLS are actor-centric (`onto_actors`, `current_actor_id()`), but access-control tables (`onto_permissions`, `onto_assignments`) are defined without any RLS or project-sharing usage.  
- Project listing and dashboard queries filter `onto_projects` by `created_by` (actor-only), so shared projects are not surfaced on home/projects pages today.  
- Activity logging uses `onto_project_logs.changed_by` referencing `auth.users`, and the RLS policy checks `created_by = auth.uid()`; this conflicts with actor-based ownership and blocks shared-actor attribution.  
- Daily brief data loader selects projects by `created_by` and uses entity `updated_at` for activity, so shared-project activity and “who did what” are not captured.  
- Web app already has Gmail-backed `EmailService`, which can be reused for invite emails; there is no dedicated invite table or flow yet.

## Detailed Findings

### 1) Actor-based ownership is core, but sharing is not wired

- `onto_actors` is the canonical actor table (human/agent) and `onto_projects.created_by` is actor-scoped.  
  - `supabase/migrations/20250601000001_ontology_system.sql:64-193`
- RLS uses `current_actor_id()` to enforce ownership on ontology tables.  
  - `supabase/migrations/20251220_ontology_rls_policies.sql:40-138`
- Access-control tables exist (`onto_assignments`, `onto_permissions`) but are not referenced by RLS, nor surfaced in API/UI.  
  - `supabase/migrations/20250601000001_ontology_system.sql:470-495`

### 2) Project lists are owner-only

- Home dashboard and Projects page both filter by `created_by = actorId`.  
  - `apps/web/src/routes/+page.server.ts:34-93`  
  - `apps/web/src/routes/projects/+page.server.ts:27-47`
- Shared summary helper `fetchProjectSummaries()` is also owner-only (`.eq('created_by', actorId)`).  
  - `apps/web/src/lib/services/ontology/ontology-projects.service.ts:52-116`

### 3) Activity logs use user IDs, not actor IDs

- `onto_project_logs.changed_by` references `auth.users`, with RLS checks against `auth.uid()` and `onto_projects.created_by = auth.uid()`.  
  - `supabase/migrations/20251208_project_activity_logging.sql:11-73`
- Web async logger inserts `changed_by` using the calling user ID.  
  - `apps/web/src/lib/services/async-activity-logger.ts:140-183`
- Worker chat activity processor also inserts `changed_by` using the user ID.  
  - `apps/worker/src/workers/chat/chatSessionActivityProcessor.ts:260-310`
- The project log API additionally enforces ownership by comparing `project.created_by` to actorId.  
  - `apps/web/src/routes/api/onto/projects/[id]/logs/+server.ts:29-70`

### 4) Daily briefs are actor-aware at the DB layer, but not in aggregation

- `ontology_daily_briefs` stores both `user_id` and `actor_id`.  
  - `supabase/migrations/20251225_ontology_daily_briefs.sql:12-47`
- Data loader selects projects by `created_by = actorId` and collects recent updates by `updated_at`, without actor attribution.  
  - `apps/worker/src/workers/brief/ontologyBriefDataLoader.ts:563-739`

### 5) Email sending is available in the web app

- `EmailService` can send Gmail-backed email with tracking and metadata.  
  - `apps/web/src/lib/services/email-service.ts:1-127`

### 6) Collaboration preferences exist, but are not tied to sharing

- `collaboration_mode` (solo/async_team/realtime) exists in project preferences UI.  
  - `apps/web/src/lib/components/ontology/OntologyProjectEditModal.svelte:89-270`

## Spec Draft (Initial Outline)

### Goals

- Allow project owners to invite collaborators by email.  
- Show “My projects” and “Shared with me” on home and projects pages.  
- Track and display actor attribution for project activity (logs, daily briefs).  
- Enable shared-project access via RLS and API checks.

### Non-goals (v1)

- Org-level multi-project sharing.  
- Real-time concurrent editing or conflict resolution.  
- Granular per-entity sharing (beyond project scope).

### Data Model Changes

1) **Project membership**
   - Add `onto_project_members` (or use `onto_permissions` with `object_kind='project'`) to record:
     - `project_id`, `actor_id`, `role` (owner/editor/viewer), `access` (read/write/admin), `added_by_actor_id`, `created_at`.
   - Backfill owner as an initial member on project creation.

2) **Invites**
   - New `onto_project_invites` table:
     - `project_id`, `invitee_email`, `token_hash`, `role`, `status`, `expires_at`,
       `invited_by_actor_id`, `accepted_by_actor_id`, `accepted_at`.
   - Ensure unique active invite per `(project_id, invitee_email)`.

3) **Activity logs**
   - Add `changed_by_actor_id` (FK `onto_actors`) to `onto_project_logs`.
   - Backfill actor IDs from existing `changed_by` user IDs.
   - Update `ProjectLogEntry` types + UI to display actor name/email.

### Access Control & RLS

- Introduce helper `has_project_access(project_id, access_level)` or
  `current_actor_has_project_access(project_id, access)` using memberships.
- Update RLS policies for `onto_projects` and related tables to allow shared access:
  - SELECT: owner OR member with `read` access.
  - INSERT/UPDATE/DELETE: owner OR member with `write/admin`.
- Update `onto_project_logs` RLS to check membership/actor-based access.

### API Surface (Initial)

- `POST /api/onto/projects/:id/invites` → create invite, send email.
- `POST /api/onto/invites/:token/accept` → accept invite, create membership.
- `POST /api/onto/projects/:id/invites/:inviteId/revoke` → revoke.
- `GET /api/onto/projects/:id/invites` → list pending invites.
- `GET /api/onto/projects?scope=owned|shared|all` → list with access metadata.

### UI Updates

- Project detail: “Share” action + modal (invite form, role selector, list of members/invites).
- Home + Projects pages:
  - Split sections: “My projects” vs “Shared with me”.
  - Show owner + role badge for shared projects.
- Notifications/alerts: in-app notice for new invite + acceptance.

### Activity Logs & Daily Briefs

- Use actor-aware project logs to label “who did what”.
- Daily brief aggregation:
  - Include shared projects from membership list.
  - Pull recent activity from `onto_project_logs` with actor attribution.
  - Prompt templates should include activity by collaborator (name + action).

### Migration & Backfill

- Backfill owner membership for existing projects.
- Backfill `changed_by_actor_id` from `onto_actors` by `changed_by` user_id.
- Update analytics or admin dashboards that read `onto_project_logs.changed_by`.

### Open Questions

- Role semantics: Do we need “admin” vs “owner”, or can owner be a role key?  
- Invite acceptance: auto-accept if email matches a logged-in user, or always require explicit accept?  
- Should shared projects appear in all project pickers (agent chat, time blocks, etc.) by default?  
- How do calendar sharing and project sharing relate (reuse or separate)?

## Code References

- `supabase/migrations/20250601000001_ontology_system.sql:64-193` - `onto_actors`, `onto_projects` definitions.
- `supabase/migrations/20250601000001_ontology_system.sql:470-495` - `onto_assignments` / `onto_permissions`.
- `supabase/migrations/20251220_ontology_rls_policies.sql:40-138` - `current_actor_id()` + project RLS.
- `apps/web/src/lib/services/ontology/ontology-projects.service.ts:52-116` - Owner-only project summaries.
- `apps/web/src/routes/+page.server.ts:34-93` - Home dashboard project list.
- `apps/web/src/routes/projects/+page.server.ts:27-47` - Projects page list.
- `supabase/migrations/20251208_project_activity_logging.sql:11-73` - `onto_project_logs` schema + RLS.
- `apps/web/src/lib/services/async-activity-logger.ts:140-183` - Logs insert `changed_by` user ID.
- `apps/worker/src/workers/chat/chatSessionActivityProcessor.ts:260-310` - Chat logs use user ID.
- `apps/web/src/routes/api/onto/projects/[id]/logs/+server.ts:29-70` - Owner-only log access.
- `supabase/migrations/20251225_ontology_daily_briefs.sql:12-47` - Briefs store `actor_id`.
- `apps/worker/src/workers/brief/ontologyBriefDataLoader.ts:563-739` - Briefs filter by `created_by`.
- `apps/web/src/lib/services/email-service.ts:1-127` - Email sending service.
- `apps/web/src/lib/components/ontology/OntologyProjectEditModal.svelte:89-270` - Collaboration prefs UI.

## Architecture Insights

- The ontology system is already actor-centric, but shared access is not modeled in RLS or queries.
- Activity logging and RLS for `onto_project_logs` are still user-centric, creating a mismatch with actor-based ownership.
- Daily briefs already store actor_id but do not aggregate shared project activity or actor attribution.

## Related Research

- `/apps/web/docs/features/project-activity-logging/IMPLEMENTATION_PLAN.md`
- `/apps/worker/docs/features/daily-briefs/`

## Follow-up Research 2026-01-09 22:22:30 -0500

### Broader Architecture Direction (future-proof)

- **Unify identity around actors**: Treat `onto_actors.id` as canonical provenance.
  - Add `changed_by_actor_id` to `onto_project_logs` and optionally keep `changed_by_user_id`.
  - Consider `initiated_by_actor_id` / `impersonated_by_actor_id` for admin or automation.
- **Project membership as a first-class concept**:
  - Prefer a dedicated `onto_project_members` table (clear semantics) over overloading `onto_assignments`.
  - Retain `role_key` + `access` (read/write/admin) for future custom roles.
  - Add `added_by_actor_id`, `removed_at`, and `removed_by_actor_id` for audit.
- **Invite token security**:
  - Store only hashed tokens + expiry; never store raw tokens.
  - Support both existing-user and new-user acceptance flows.
  - Do not pre-create actors for invites (blocked by `chk_actor_identity` constraint).
- **Centralize access checks**:
  - Add `current_actor_has_project_access(project_id, access)` SQL helper and reuse in RLS.
  - Consider a `project_access` view or table for fast membership filtering and caching.

### Cross-cutting Surfaces to Update (beyond the obvious)

- **Project selection and search**:
  - Agent chat context pickers, project focus selectors, and any project dropdown.
  - Search endpoints / search vectors to include shared projects.
  - Any API that currently filters `.eq('created_by', actorId)`.
- **Entity CRUD across ontology**:
  - Most endpoints verify ownership; replace with membership checks.
  - Ensure RLS is the source of truth to avoid scattered access logic.
- **Activity logging + UI**:
  - Update `ProjectActivityLogPanel` to show actor names.
  - Log membership/invite events (entity_type `member` or separate audit table).
- **Daily briefs + next steps**:
  - Switch recent-activity detection to `onto_project_logs` for actor attribution.
  - Include shared-project summaries while honoring privacy (only shared project data).
- **Notifications**:
  - New invites, accepted invites, removed access should emit in-app events + emails.
  - Respect notification preferences to avoid spam.
- **Calendar integration**:
  - Decide whether project sharing implies calendar sharing or a separate toggle.
  - Ensure calendar ACLs follow membership changes.

### Architecture Edge Cases & "Around Corners"

- **Email identity mismatches**: invite email may differ from auth email (aliases, plus-addressing).
  - Decide if acceptance binds to `users.email` only or allow manual confirmation.
- **Ownership transfer**: long-term need to transfer ownership without breaking audit history.
  - Keep `created_by` immutable; introduce `owner_actor_id` if ownership can change.
- **Leaving a project**: handle read-only history, next steps, and activity log visibility.
- **Soft delete**: membership should be invalidated when a project is soft-deleted.
- **AI/agent authorship**: when an AI agent creates content, record both agent actor and initiating user.
- **Service role writes**: ensure `service_role` can write logs with actor attribution.

### Forward-looking Capabilities

- **Org/team model**:
  - When orgs arrive (`org_id` already exists), prefer org membership + project overrides.
  - Enable team briefs that aggregate shared project activity across a team.
- **Billing/seat enforcement**:
  - Membership count likely affects pricing; build for future seat checks.
- **Real-time collaboration**:
  - Supabase Realtime must respect RLS; shared access should map to memberships.
- **Audit + compliance**:
  - Provide exportable logs for "who did what" and when membership changed.

### Implementation Risk Areas

- `onto_project_logs` uses `auth.users` and `auth.uid()` RLS, conflicting with actor-based ownership.
- Project list and activity APIs hardcode ownership checks and will exclude shared data until refactored.
- Invites cannot create `onto_actors` ahead of user creation due to `chk_actor_identity`.
