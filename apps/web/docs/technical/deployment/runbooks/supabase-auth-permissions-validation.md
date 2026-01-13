<!-- apps/web/docs/technical/deployment/runbooks/supabase-auth-permissions-validation.md -->

# Supabase auth + permissions validation runbook

Purpose: diagnose auth/RLS issues for shared projects (membership, invites, activity logs).
Severity: medium to high (blocks core project access).
Last Updated: 2026-01-13

## When to use

- Shared project members cannot see a project or its activity logs.
- Invites appear accepted but membership rows are missing.
- Activity logs are empty or return permission errors.

## Inputs you need

- `user_id` (auth.users id)
- `project_id`
- Optional: `invite_id`, `invitee_email`, `token_hash`
- Access to Supabase SQL editor or psql with service role privileges

## Quick triage (read-only)

```sql
-- 1) Actor exists?
SELECT id, user_id, email, created_at
FROM onto_actors
WHERE user_id = '<user_id>';

-- 2) Project ownership?
SELECT id, created_by, is_public, deleted_at
FROM onto_projects
WHERE id = '<project_id>';

-- 3) Membership row?
SELECT id, project_id, actor_id, access, role_key, removed_at
FROM onto_project_members
WHERE project_id = '<project_id>'
  AND actor_id = '<actor_id>'
  AND removed_at IS NULL;

-- 4) Do logs exist?
SELECT id, entity_type, action, created_at
FROM onto_project_logs
WHERE project_id = '<project_id>'
ORDER BY created_at DESC
LIMIT 10;
```

## Validate access helpers (simulate user session)

Run these in SQL editor using a user context. This sets `auth.uid()` for the session.

```sql
-- Simulate authenticated user
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '<user_id>', true);
SELECT auth.uid();

-- Resolve actor and access
SELECT current_actor_id() AS actor_id;
SELECT current_actor_has_project_access('<project_id>', 'read') AS can_read;
SELECT current_actor_has_project_access('<project_id>', 'write') AS can_write;
SELECT current_actor_has_project_access('<project_id>', 'admin') AS can_admin;
SELECT current_actor_is_project_member('<project_id>') AS is_member;

-- RLS-protected reads
SELECT id
FROM onto_projects
WHERE id = '<project_id>';

SELECT id
FROM onto_project_logs
WHERE project_id = '<project_id>'
LIMIT 5;
```

Expected:

- `current_actor_id()` returns a UUID.
- `can_read` true for owners/members or public projects.
- `is_member` true for owners/members (public does not imply member).
- Project logs only return rows if `is_member` is true.

## Check RLS enablement and policies

```sql
-- RLS flags
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN (
  'onto_projects',
  'onto_project_members',
  'onto_project_invites',
  'onto_project_logs',
  'onto_tasks',
  'onto_goals',
  'onto_documents'
);

-- Policies for key tables
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE tablename IN (
  'onto_projects',
  'onto_project_members',
  'onto_project_invites',
  'onto_project_logs'
)
ORDER BY tablename, policyname;
```

If `relrowsecurity` is false on core ontology tables, RLS is not enforced even if policies exist.

## Invite checks (read-only)

```sql
-- Requires service role or owner privileges
SELECT id, project_id, invitee_email, status, expires_at, invited_by_actor_id
FROM onto_project_invites
WHERE project_id = '<project_id>'
  AND lower(invitee_email) = lower('<invitee_email>')
ORDER BY created_at DESC;

-- Preview by token hash (safe; no membership writes)
SELECT *
FROM get_project_invite_preview('<token_hash>');
```

Notes:

- Direct selects on `onto_project_invites` are admin-only via RLS.
- Invitee flows should use RPCs (`list_pending_project_invites`, `accept_project_invite`,
  `accept_project_invite_by_id`, `decline_project_invite`).

## Common failure patterns

- No actor row for user: `current_actor_id()` returns null, all RLS checks fail.
- Membership removed or missing: `is_member` false, logs are invisible.
- Public project: `can_read` true, but logs still require membership.
- Policy drift: policies exist but RLS not enabled on the table.

## Function export reconciliation

Use this when RPC behavior differs between environments or after stored procedure edits.

```sql
-- List public functions and signatures
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname;
```

Compare against:

- `packages/shared-types/src/functions/index.md` (active function list)
- `packages/shared-types/src/functions/*.sql` (source SQL definitions)

If the DB list and repo diverge, update the repo docs and regenerate `packages/shared-types/src/database.types.ts`.

## Escalation checklist

- Capture failing SQL outputs and policy listings.
- Note whether the issue is membership, invite, or RLS enablement.
- Confirm whether the request was made with an RLS-enforced client or service role.
