# Libri Worker Phase 3B.2: Least-Privilege Access Boundary

Date: 2026-08-30
Status: production database boundary and disabled Railway credential cutover deployed and verified

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

## Production deployment receipt

The deployment gate completed on 2026-08-30 in GitHub Actions run `33329102098`: the complete
BuildOS verification job passed in 28m01s and the PostgreSQL 15 Libri migration-safety job passed in
59s. The receipt-isolated Supabase dry run contained the 155 exact hosted receipts plus only
`20260830181834_libri_worker_access_boundary.sql`; the reviewed source and staged file both had
SHA-256 `fd1dcd646b4ad2faa964ce57237a2668d44d263b5b0585762643cc5c6794c704`.

The out-of-band `libri_worker` role was first provisioned without a password and verified as a
three-connection `LOGIN` with no superuser, database-creation, role-creation, inheritance,
replication, bypass-RLS, or membership capability. It owned no schemas, relations, or routines and
had no direct table grants or policies before the tracked migration ran. Three consecutive
pre-apply non-Libri catalog fingerprints were identical at 9,677 signatures / MD5
`32b91a3d95e59c49d3197303509f1912`; the immediate post-apply fingerprint was exactly the same.

The hosted postcheck proved the exact eight reviewed policies and column grants, denial of unrelated
Libri catalog access, zero Libri queue jobs, and empty research run/step tables. Core BuildOS counts
remained readable at 2,243 queue jobs (zero active), 64 projects, 650 tasks, 570 ontology documents,
and 1,967 chat sessions. A post-apply isolated dry run reported the remote database up to date.

The password was then randomly generated and validated through the session pooler using the project
root CA with strict certificate verification. The real restricted login passed its live capability
probe, saw zero queue rows under RLS, and received SQLSTATE `42501` when reading `public.projects`.
The root certificate expires in 2031 and has SHA-256 fingerprint
`CE:0E:FC:EA:51:5B:10:4C:22:2E:F0:F1:06:1D:73:32:39:6D:BD:78:05:64:27:CD:70:77:9B:FD:31:03:A9:6C`.
Both verified secrets were staged in Railway without an immediate deploy while
`LIBRI_WORKER_ENABLED=false`.

The health runtime cutover shipped in commit `3a21a52c3` and passed Railway's configured `/health`
check as deployment `e847fc37-b752-49f7-ad36-491eb3457011`. The obsolete
`PRIVATE_SUPABASE_SERVICE_KEY` and `PUBLIC_SUPABASE_URL` variables were then deleted from the Libri
service. Deployment `2da34dc5-d1ff-408a-ba82-1a48c20277fc`, from gate-repair commit `319a3627e`,
rebuilt and passed health checks with only `LIBRI_DATABASE_URL` and `LIBRI_DATABASE_CA_CERT` as its
database credentials. The service remains in the production profile with
`LIBRI_WORKER_ENABLED=false`.

The Supabase security advisor reports 329 warnings and zero Libri warnings. The performance advisor
reports 739 warnings; 62 new `multiple_permissive_policies` entries name `libri_worker` on unrelated
tables because PostgreSQL implicitly includes every role in `PUBLIC`. The worker has no privileges
on those tables, the policies already existed, and the new login does not change the plans or policy
sets used by BuildOS roles. These are advisor fan-out entries, not new executable access paths.

## Activation remains blocked

`LIBRI_WORKER_ENABLED` must remain `false`. The production role, access migration, strict-TLS
credential, restricted health deployment, legacy-key removal, and non-Libri fingerprint proof are
complete. Before activation, the next slice must:

1. implement and deploy transactional enqueue, claim, heartbeat, complete, retry, cancel, and
   stale-lease recovery over this restricted connection; and
2. pass the synthetic `libri_maintenance` lifecycle canary, including stale-token rejection and
   proof that a non-Libri queue row is unchanged.
