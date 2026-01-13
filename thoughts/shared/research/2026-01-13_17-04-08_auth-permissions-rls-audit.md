---
date: 2026-01-13T17:04:08Z
researcher: Codex
git_commit: 1e312ddccd4e5da6d4c8aeed140e34a50614f383
branch: main
repository: buildos-platform
topic: 'Authentication and permissions RLS audit (ontology tables)'
tags: [research, rls, auth, permissions, supabase, ontology]
status: complete
last_updated: 2026-01-13
last_updated_by: Codex
last_updated_note: 'Verified log_project_change is absent in DB; updated drift notes'
path: thoughts/shared/research/2026-01-13_17-04-08_auth-permissions-rls-audit.md
---

# Research: authentication and permissions RLS audit (ontology tables)

**Date**: 2026-01-13T17:04:08Z  
**Researcher**: Codex  
**Git Commit**: 1e312ddccd4e5da6d4c8aeed140e34a50614f383

## Research question

Where are RLS policies and access helpers defined for the ontology auth tables, and where might policy drift exist after recent stored procedure updates?

## Summary

- RLS policies for `onto_projects` and core child tables are defined in the project sharing migration, but only a subset of tables have explicit `ENABLE ROW LEVEL SECURITY` statements in migrations; verify actual DB state.
- `current_actor_has_project_access` grants public read and service-role access; `current_actor_is_project_member` is membership-only and is used for project log visibility.
- Invite access is admin-only at the table level; invitee flows use security-definer RPCs that validate email and expiry.
- `onto_assignments`, `onto_permissions`, and `onto_actors` have no RLS policies in migrations and are not used in access checks.
- `log_project_change` appears in migrations but is not present in the database; treat it as removed and avoid referencing it.

## Detailed findings

1. RLS enablement is explicit for a small set of tables.
   - `onto_project_members`, `onto_project_invites`, and `onto_project_logs` are enabled for RLS in `20260320000000_project_sharing_membership.sql`.
   - `onto_comments` tables are enabled for RLS in `20260328000000_add_onto_comments.sql`.
   - No `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` statements appear in migrations for `onto_projects` or other core ontology tables, even though policies are defined for them. Verify the live DB uses RLS for those tables.

2. Access helpers reflect the stored procedure updates.
   - `current_actor_has_project_access` includes service-role bypass and public read (`is_public = true`).
   - `current_actor_is_project_member` checks owner or active membership only (no public read, no access tiers).

3. Project log visibility is membership-based (not public).
   - Original policies in `20260320000000_project_sharing_membership.sql` used `current_actor_has_project_access`.
   - `20260320000002_project_sharing_access_fixes.sql` switched log and member select policies to `current_actor_is_project_member`.
   - Result: public projects remain readable, but logs require membership.

4. Invite access uses security-definer RPCs with validation.
   - `get_project_invite_preview`, `list_pending_project_invites`, `accept_project_invite`,
     `accept_project_invite_by_id`, and `decline_project_invite` all enforce email matching
     and expiry checks.
   - The `onto_project_invites` table itself remains admin-only via RLS.

5. `onto_assignments` and `onto_permissions` are not enforced by RLS.
   - These tables exist for future fine-grained access, but they are not wired into RLS or helper
     functions. Assuming they grant access will lead to auth drift.

6. `log_project_change` is not in the database.
   - Migration `20260320000000_project_sharing_membership.sql` defines `log_project_change`,
     but the function does not exist in the DB and is listed as deprecated in
     `packages/shared-types/src/functions/index.md`.
   - Treat this RPC as removed and align documentation accordingly.

## Code references

- `supabase/migrations/20250601000001_ontology_system.sql:61` - `onto_actors` table definition.
- `supabase/migrations/20250601000001_ontology_system.sql:417` - `onto_assignments` and `onto_permissions` tables.
- `supabase/migrations/20260320000000_project_sharing_membership.sql:11` - `onto_project_members` and `onto_project_invites` tables.
- `supabase/migrations/20260320000000_project_sharing_membership.sql:72` - `onto_project_logs` actor attribution column.
- `supabase/migrations/20260320000000_project_sharing_membership.sql:278` - RLS enablement for members/invites/logs.
- `supabase/migrations/20260320000000_project_sharing_membership.sql:660` - RLS policies for logs/members/invites.
- `supabase/migrations/20260320000002_project_sharing_access_fixes.sql:10` - Updated access helper.
- `supabase/migrations/20260320000002_project_sharing_access_fixes.sql:392` - RLS adjustments for logs and members.
- `supabase/migrations/20260328000000_add_onto_comments.sql:273` - RLS enablement for comments tables.
- `packages/shared-types/src/functions/current_actor_has_project_access.sql:4` - Access helper with public read and service role.
- `packages/shared-types/src/functions/current_actor_is_project_member.sql:4` - Membership-only helper.
- `packages/shared-types/src/functions/ensure_actor_for_user.sql:4` - Actor creation for authenticated users.
- `packages/shared-types/src/functions/get_project_invite_preview.sql:4` - Invite preview RPC.
- `packages/shared-types/src/functions/list_pending_project_invites.sql:4` - Pending invite listing RPC.
- `packages/shared-types/src/functions/accept_project_invite.sql:4` - Accept invite via token hash.
- `packages/shared-types/src/functions/accept_project_invite_by_id.sql:4` - Accept invite via invite id.
- `packages/shared-types/src/functions/decline_project_invite.sql:4` - Decline invite RPC.
- `packages/shared-types/src/functions/index.md:176` - `log_project_change` marked deprecated.

## Architecture insights

- Actor identity is the linchpin of RLS access. If `ensure_actor_for_user` is not invoked for a session,
  `current_actor_id()` will return null and all RLS checks will fail.
- Membership is authoritative for log visibility, even when public read access is allowed elsewhere.
- Security-definer RPCs are critical for invite flows because direct RLS access to `onto_project_invites`
  is intentionally restricted to admins.

## Related research

- `docs/architecture/AUTHENTICATION_AND_PERMISSIONS.md` - Consolidated auth/permissions design doc.

## Follow-up Research 2026-01-13T17:15:45Z

- Verified that `log_project_change` does not exist in the database; adjusted drift note to treat the RPC as removed.
