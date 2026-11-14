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

- `current_actor_has_project_access(project_id, access)` is the public-aware check for read/write/admin.
    - Grants service-role access.
    - Grants public read access for `is_public` projects.
    - Grants admin, owner, or member access based on `onto_project_members.access`.
- `current_actor_has_project_member_access(project_id, access)` is the internal collaboration check for the current actor.
    - Does not grant public project reads.
    - Use this for internal project APIs that return documents, members, archived data, or private project context.
- `actor_has_project_member_access(actor_id, project_id, access)` is the explicit actor check for service-role code, workers, and durable agent principals.
    - Does not grant public project reads.
    - Does not treat service-role access as authorization by itself.
- `current_actor_is_project_member(project_id)` checks owner or active membership, ignoring access tiers.

## RLS enforcement and client types

- RLS is enforced for browser and server clients using the anon key.
- Service-role clients bypass RLS and must only be used in trusted server contexts.
- The web app explicitly distinguishes between RLS-enforced clients and admin/service-role clients.

## RLS policy patterns (ontology tables)

- `onto_projects`
    - SELECT: members and admins through member-only RLS.
    - Public/example project reads go through explicit public routes that shape the payload.
    - INSERT: `created_by = current_actor_id()` (or admin).
    - UPDATE: member write access (or admin).
    - DELETE: member admin access (or admin).
- Project child tables (goals/tasks/risks/etc.)
    - SELECT: `current_actor_has_project_member_access(project_id, 'read')` (or admin).
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

## Native app sessions (bearer path)

Added 2026-10-28 for the iPhone app (`apps/mobile`, plan in `docs/specs/MOBILE_APP_PLAN_2026-10-23.md`).

- The web signs in with cookies. The native app keeps its Supabase session on the device
  (iOS keychain) and sends `Authorization: Bearer <Supabase access token>` on every request.
- `apps/web/src/hooks.server.ts` decides per request (`locals.authSource`: `'cookie'` or
  `'bearer'`). A JWT-shaped bearer token (`$lib/server/bearer-auth.ts`) gets a client built by
  `createSupabaseBearer` that forwards the token for RLS and never reads or writes cookies.
  `getVerifiedBearerSession` verifies it the same way as the cookie path: signature and claims
  locally for ordinary reads, a live Auth lookup for mutations and the sensitive route families.
  A bad or expired bearer token yields no session and never falls back to cookies.
- Agent credentials (`boca_…`, `bo_…`) travel in the same header but are not JWTs, so they take
  the cookie path untouched and their routes keep authenticating them as before.
- Every existing `/api` route therefore works for the phone without per-route changes, because
  routes only use `locals.safeGetSession()` and `locals.supabase`. Two routes call
  `supabase.auth.getUser()` directly (`/api/llm-usage/summary`, `/api/admin/llm-usage/stats`);
  they return no user for a bearer client and need `safeGetSession()` before the app uses them.
- **Web pages inside the app** (settings, billing, integrations, account deletion) use a session
  handoff (`$lib/server/auth-handoff.service.ts`): `POST /api/auth/handoff` (bearer only) stores
  the sha256 of a random 60-second, single-use code in `auth_handoff_codes` (service role only);
  the in-app browser opens `/auth/handoff?code=…`, which consumes the code in one UPDATE, mints a
  magic-link token hash on the server with the admin API, verifies it on the cookie client (so
  the token never leaves the server) and redirects to the page with `?app=1`. App mode
  (`$lib/server/app-mode.ts`, cookie `buildos_app`) hides the site navigation and footer.
- Universal links: `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`
  are served from env (`PRIVATE_IOS_APP_IDS`, `PRIVATE_ANDROID_PACKAGE`,
  `PRIVATE_ANDROID_SHA256_FINGERPRINTS`) and return 404 until configured; they claim only the
  paths the app renders natively (`$lib/server/app-site-association.ts`).

## Drift risks and failure points

- Missing `onto_actors` row: `current_actor_id()` returns null and RLS denies access.
- Membership gaps: if owner membership is missing or `removed_at` is set, access and logs disappear.
- Public projects: `is_public` must not grant collaboration-table/RPC reads. Use explicit public routes for example projects and published pages.
- Public projects: public read is not collaboration access. Do not use the public-aware helper for internal document trees, member lists, archived content, logs, full project payloads, graph payloads, comments, assets, snapshots, or connector project scopes.
- `onto_assignments`/`onto_permissions` are not enforced by RLS; assuming they grant access will cause confusion.
- Service-role usage in user-facing flows can mask real RLS failures and create auth drift.
- RPC drift: `log_project_change` is not present in the database; avoid referencing it in code or docs.

## Troubleshooting: activity logs not loading

- Verify `ensure_actor_for_user` ran for the session user and `current_actor_id()` resolves.
- Confirm the user has an active membership row for the project (`removed_at` is null) or owns the project.
- Check that `project_logs_select_member` uses `current_actor_has_project_member_access(project_id, 'read')` after the access fix migration.
- Confirm logs exist in `onto_project_logs` for the project.
- For admin/global views, use service-role clients or admin policies; user-scoped clients only see member projects.

## References

- `supabase/migrations/20250601000001_ontology_system.sql:61` - `onto_actors` table definition.
- `supabase/migrations/20250601000001_ontology_system.sql:417` - `onto_assignments` and `onto_permissions` tables.
- `packages/shared-types/src/functions/ensure_actor_for_user.sql:4` - Actor creation for authenticated users.
- `packages/shared-types/src/functions/current_actor_id.sql:4` - Actor lookup used by RLS.
- `packages/shared-types/src/functions/current_actor_has_project_access.sql:4` - Project access helper (read/write/admin).
- `packages/shared-types/src/functions/current_actor_has_project_member_access.sql:4` - Internal current-actor member access helper.
- `packages/shared-types/src/functions/actor_has_project_member_access.sql:4` - Explicit actor member access helper for service-role and agent-principal code.
- `packages/shared-types/src/functions/current_actor_is_project_member.sql:4` - Membership-only helper.
- `packages/shared-types/src/functions/is_admin.sql:4` - Admin checks.
- `supabase/migrations/20260320000000_project_sharing_membership.sql:11` - `onto_project_members` and `onto_project_invites` tables.
- `supabase/migrations/20260320000000_project_sharing_membership.sql:225` - `set_project_log_actor` trigger.
- `supabase/migrations/20260320000000_project_sharing_membership.sql:255` - Owner membership trigger.
- `supabase/migrations/20260320000000_project_sharing_membership.sql:660` - RLS policies for logs/members/invites.
- `supabase/migrations/20260320000002_project_sharing_access_fixes.sql:392` - RLS adjustments for logs and members.
- `supabase/migrations/20260514001000_tighten_public_project_internal_access.sql:1` - Removes project-wide public read from internal collaboration RLS and RPC surfaces.
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
