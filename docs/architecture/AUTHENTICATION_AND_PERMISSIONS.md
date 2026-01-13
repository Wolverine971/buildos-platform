<!-- docs/architecture/AUTHENTICATION_AND_PERMISSIONS.md -->

# Authentication and permissions architecture

## Goals

- Provide a clear, single source of truth for identity and permission checks.
- Explain how project sharing, membership, and RLS interact.
- Highlight known drift risks and where checks can fail.

## Non-goals

- Exhaustive documentation for every table or every RLS policy.
- OAuth provider configuration details or front-end auth UI flows.

## Identity model

- Supabase Auth provides `auth.uid()` for the authenticated user session.
- `public.users` stores app profile data used by admin checks and actor creation.
- `onto_actors` is the canonical identity for ontology ownership and access. Human actors have `user_id`; agent actors do not.
- `ensure_actor_for_user` guarantees a matching `onto_actors` row for a logged-in user and is expected to run at key entry points.
- `current_actor_id()` maps `auth.uid()` to `onto_actors.id` and is used by RLS helpers.
- `is_admin()` checks admin status via `public.users.is_admin` (and `admin_users` for explicit admin rows).

## Authorization model (project scope)

- Ownership is stored on `onto_projects.created_by` (actor id).
- Membership and access are stored in `onto_project_members`.
    - `role_key` is semantic (owner/editor/viewer).
    - `access` is enforcement (read/write/admin) and is what RLS checks.
- Invites are stored in `onto_project_invites` and managed via security-definer RPCs
  (`get_project_invite_preview`, `list_pending_project_invites`, `accept_project_invite`,
  `accept_project_invite_by_id`, `decline_project_invite`).
- `onto_assignments` and `onto_permissions` exist but are not part of RLS or the sharing flow.

## Access helpers

- `current_actor_has_project_access(project_id, access)` is the primary check for read/write/admin.
    - Grants service-role access.
    - Grants public read access for `is_public` projects.
    - Grants admin, owner, or member access based on `onto_project_members.access`.
- `current_actor_is_project_member(project_id)` checks owner or active membership, ignoring access tiers.

## RLS enforcement and client types

- RLS is enforced for browser and server clients using the anon key.
- Service-role clients bypass RLS and must only be used in trusted server contexts.
- The web app explicitly distinguishes between RLS-enforced clients and admin/service-role clients.

## RLS policy patterns (ontology tables)

- `onto_projects`
    - SELECT: members, admins, and public projects.
    - INSERT: `created_by = current_actor_id()` (or admin).
    - UPDATE: member write access (or admin).
    - DELETE: member admin access (or admin).
- Project child tables (goals/tasks/risks/etc.)
    - SELECT: `current_actor_has_project_access(project_id, 'read')` (or admin or public).
    - INSERT/UPDATE/DELETE: write access (or admin).
- `onto_project_logs`
    - SELECT: `current_actor_is_project_member(project_id)` (membership-based).
    - INSERT: write access and actor attribution checks.
    - Service role: full access for workers.
- `onto_project_members`
    - SELECT: membership-based.
    - INSERT/UPDATE/DELETE: admin access.
- `onto_project_invites`
    - SELECT/INSERT/UPDATE/DELETE: admin access only.
    - Invite acceptance goes through RPCs; invitees do not query this table directly.

## Activity logging and attribution

- `onto_project_logs` stores both `changed_by` (auth user id) and `changed_by_actor_id`.
- Log writes are performed by application services via direct inserts.
- `set_project_log_actor` runs before insert to populate `changed_by_actor_id`.
- Backfills add owner memberships and map existing `changed_by` values to actors.

## Key flows

1. Sign-in and session
    - The app calls `ensure_actor_for_user` so `current_actor_id()` resolves.
    - Without an actor row, most RLS checks return false.
2. Project creation
    - `created_by` is set to the actor id.
    - `add_project_owner_membership` trigger inserts owner membership.
3. Project sharing invite
    - Admin creates invite in `onto_project_invites`.
    - Invitees preview or list pending invites via RPCs and accept/decline via RPCs.
    - Acceptance validates token/email, ensures actor, and upserts membership.
4. Activity log reads
    - Logs are visible to members (including owners) via `current_actor_is_project_member`.
    - Public project visibility does not automatically grant log visibility.

## Drift risks and failure points

- Missing `onto_actors` row: `current_actor_id()` returns null and RLS denies access.
- Membership gaps: if owner membership is missing or `removed_at` is set, access and logs disappear.
- Public projects: `is_public` grants read access to project data, but logs still require membership.
- `onto_assignments`/`onto_permissions` are not enforced by RLS; assuming they grant access will cause confusion.
- Service-role usage in user-facing flows can mask real RLS failures and create auth drift.
- RPC drift: `log_project_change` is not present in the database; avoid referencing it in code or docs.

## Troubleshooting: activity logs not loading

- Verify `ensure_actor_for_user` ran for the session user and `current_actor_id()` resolves.
- Confirm the user has an active membership row for the project (`removed_at` is null) or owns the project.
- Check that `project_logs_select_member` uses `current_actor_is_project_member` after the access fix migration.
- Confirm logs exist in `onto_project_logs` for the project.
- For admin/global views, use service-role clients or admin policies; user-scoped clients only see member projects.

## References

- `supabase/migrations/20250601000001_ontology_system.sql:61` - `onto_actors` table definition.
- `supabase/migrations/20250601000001_ontology_system.sql:417` - `onto_assignments` and `onto_permissions` tables.
- `packages/shared-types/src/functions/ensure_actor_for_user.sql:4` - Actor creation for authenticated users.
- `packages/shared-types/src/functions/current_actor_id.sql:4` - Actor lookup used by RLS.
- `packages/shared-types/src/functions/current_actor_has_project_access.sql:4` - Project access helper (read/write/admin).
- `packages/shared-types/src/functions/current_actor_is_project_member.sql:4` - Membership-only helper.
- `packages/shared-types/src/functions/is_admin.sql:4` - Admin checks.
- `supabase/migrations/20260320000000_project_sharing_membership.sql:11` - `onto_project_members` and `onto_project_invites` tables.
- `supabase/migrations/20260320000000_project_sharing_membership.sql:225` - `set_project_log_actor` trigger.
- `supabase/migrations/20260320000000_project_sharing_membership.sql:255` - Owner membership trigger.
- `supabase/migrations/20260320000000_project_sharing_membership.sql:660` - RLS policies for logs/members/invites.
- `supabase/migrations/20260320000002_project_sharing_access_fixes.sql:392` - RLS adjustments for logs and members.
- `packages/shared-types/src/functions/accept_project_invite.sql:4` - Invite acceptance flow.
- `packages/shared-types/src/functions/accept_project_invite_by_id.sql:4` - Invite acceptance by ID.
- `packages/shared-types/src/functions/decline_project_invite.sql:4` - Invite decline flow.
- `packages/shared-types/src/functions/get_project_invite_preview.sql:4` - Invite preview flow.
- `packages/shared-types/src/functions/list_pending_project_invites.sql:4` - Pending invite listing.
- `packages/shared-types/src/database.schema.ts:1245` - `onto_project_logs` schema snapshot.
- `packages/supabase-client/src/index.ts:22` - RLS vs service-role client types.
- `apps/web/src/lib/supabase/admin.ts:6` - Admin client guidance (service role).
- `apps/web/src/lib/supabase/index.ts:8` - Web client decision tree.
- `apps/web/src/routes/+page.server.ts:41` - `ensure_actor_for_user` used on dashboard entry.
- `docs/architecture/decisions/ADR-004-project-sharing-membership-actors.md:12` - Rationale for membership model and non-use of assignments/permissions.
