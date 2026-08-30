# Libri Worker Phase 3B.2: Least-Privilege Access Boundary

Date: 2026-08-30
Status: implemented and verified locally; production role and migration pending

## Outcome

This slice replaces the proposed broad service-role queue consumer with a dedicated PostgreSQL
login and an RLS-enforced direct connection. The tracked migration does not create a global role,
does not add `SECURITY DEFINER` code, and does not weaken the Libri migration-scope guard.

The separately provisioned `libri_worker` login is constrained to three connections and has no
superuser, database-creation, role-creation, inheritance, replication, bypass-RLS, or role-membership
capability. Password creation and rotation remain deployment-secret operations rather than migration
content.

## Database boundary

The role can:

- read only `id` and `created_by` from `libri.libraries`;
- read research runs and steps;
- update only the explicit run/step lifecycle, fencing, telemetry, result, and error columns; and
- select, insert, and update only queue rows whose enum type is one of the four `libri_*` families.

It cannot insert or delete research domain rows, alter immutable step payload/routing columns,
delete queue jobs, retag a queue job, access other Libri catalog tables, or see/mutate non-Libri
BuildOS queue rows. The existing browser and service-role policies are unchanged.

## Verification

The unmodified migration-scope guard accepts the migration through operation-specific allowlists for
`public.queue_jobs`. All 22 disposable PostgreSQL contracts pass. The new contract proves role
attributes and memberships, exact policies, column grants, denied cross-domain operations, RLS queue
isolation, and use of `idx_queue_jobs_pending_claim_priority` by the enum-array claim predicate.

## Activation remains blocked

`LIBRI_WORKER_ENABLED` must remain `false`. Before activation, the next slice must:

1. deploy and verify this role and access migration without changing the non-Libri fingerprint;
2. switch the Railway health probe from the Supabase service key to the capped direct credential;
3. implement transactional enqueue, claim, heartbeat, complete, retry, cancel, and stale-lease
   recovery over this restricted connection; and
4. pass the synthetic `libri_maintenance` lifecycle canary, including stale-token rejection and
   proof that a non-Libri queue row is unchanged.
