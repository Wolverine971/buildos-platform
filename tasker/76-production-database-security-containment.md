<!-- tasker/76-production-database-security-containment.md -->

# 76 — Production database security containment

**Created:** 2026-08-31

**Status:** Ready — live exposure is confirmed; containment and full privileged-function audit are
required before paid launch

**Priority:** P0 paid-launch blocker

**Type:** Production security, database authorization, and release governance

## Kernel

The live Supabase project currently allows anonymous callers to execute privileged database
functions that bypass normal row-level security. Three functions were verified directly in
production as `SECURITY DEFINER`, executable by `anon` and `authenticated`, and lacking an internal
authorization check:

- `get_subscription_overview()` reads subscriber totals, subscription states, MRR, and ARR;
- `acquire_migration_platform_lock(...)` changes the production migration-platform lock;
- `batch_update_phase_dates(...)` updates project phase dates for caller-supplied identifiers.

The dated 2026-08-31 Supabase security-advisor snapshot also reported 329 warnings, including 96
anonymous-executable and 114 authenticated-executable `SECURITY DEFINER` warnings, 112 mutable
function `search_path` warnings, leaked-password protection disabled, and a Postgres version with
available security updates. Those counts are a triage baseline, not a claim that every warning is
exploitable. Some functions are triggers or contain explicit identity checks. Every privileged
entry point nevertheless needs an explained grant and an authorization proof.

Contain the confirmed exposures, establish an allowlist for every privileged RPC, and make that
contract continuously testable. Do not enable paid billing while anonymous callers can reach
unexplained privileged functions.

## Safety and release rules

- Never repair this lane with a broad historical migration replay or `db push --include-all`.
- Coordinate production DDL with [Tasker 63](63-supabase-migration-ledger-reconciliation.md).
- Do not revoke grants blindly in production. First map each live application caller and prepare a
  focused rollback for unintended authorization failures.
- `SECURITY DEFINER` is allowed only when the function genuinely needs elevated rights, has a fixed
  safe `search_path`, validates the caller and resource scope internally, and exposes the narrowest
  role grant possible.
- Prefer `SECURITY INVOKER` plus RLS for normal user-scoped mutations.
- Treat trigger functions and service-only maintenance functions as non-client-callable unless an
  explicit reviewed contract says otherwise.

## Work packages

### WP-0 — Freeze a reproducible live baseline

- Export the current public-function inventory with owner, arguments, `prosecdef`, `proconfig`, ACL,
  anonymous/authenticated/service-role executability, and full definition hash.
- Export the security-advisor findings and group them by function rather than raw warning count.
- Trace every client and server caller for the privileged functions before changing grants.
- Classify every function as one of: public read, authenticated user-scoped, admin-scoped,
  service-only, trigger-only, obsolete, or unknown.
- Store the reviewed matrix in a durable security review artifact without copying credentials or
  customer data.

### WP-1 — Contain the three confirmed exposures

- Make `get_subscription_overview()` admin/service-only and prove anonymous and ordinary
  authenticated callers cannot retrieve revenue data.
- Make `acquire_migration_platform_lock(...)` service-only and prove no client role can acquire or
  inspect the migration lock.
- Convert `batch_update_phase_dates(...)` to invoker/RLS semantics or add explicit authenticated
  project-membership authorization before any update.
- Add disposable-Postgres privilege and behavior tests for allowed and denied roles.
- Deploy through a focused reviewed migration and record production privilege receipts after
  application.

### WP-2 — Audit and harden every privileged function

- Review all unique functions behind the anonymous/authenticated advisor findings.
- Revoke default `PUBLIC` execution, then grant only the roles required by the caller matrix.
- Add internal caller, tenant, actor, and resource checks wherever elevation remains necessary.
- Pin a safe `search_path` for each definer function and schema-qualify security-sensitive objects.
- Remove or quarantine obsolete privileged functions rather than carrying unexplained grants.
- Add negative tests for cross-user, cross-project, unauthenticated, and ordinary-user admin access.

### WP-3 — RLS and API-exposure review

- Classify every `rls_enabled_no_policy` advisory: intentionally service-only, inaccessible by
  grants, missing a policy, or obsolete.
- Verify that every public-schema table, view, and RPC has intentional Data API exposure.
- Review the upcoming Supabase default-exposure/grant behavior before its 2026-10-30 enforcement
  date and make new-schema behavior explicit in migrations.
- Prioritize billing, agentic-chat, project, document, task, migration, queue, and admin surfaces.

### WP-4 — Platform security settings

- Upgrade the production Postgres version through the supported Supabase process after rehearsal
  and backup verification.
- Enable leaked-password protection and shorten email OTP expiry to the approved account-security
  window.
- Review extensions installed in `public` and move or document them as appropriate.
- Confirm point-in-time recovery/backup state before the database upgrade.

### WP-5 — Live exploit and regression verification

- From an anonymous client, prove all privileged and admin-only RPCs fail closed.
- From two ordinary users, prove cross-tenant reads and writes fail while legitimate same-tenant
  workflows still work.
- Re-run the Supabase security advisor and explain every remaining privileged-function warning.
- Run the core capture, project, task, calendar, brief, billing, and agentic-chat smokes after grant
  changes.
- Inspect API, Auth, and Postgres logs for authorization regressions and retain cleanup evidence.

### WP-6 — Prevent recurrence

- Add CI that fails on newly introduced `SECURITY DEFINER` functions without fixed `search_path`,
  explicit grants, and a privilege test.
- Add a checked-in allowlist or policy manifest for intentionally client-executable functions.
- Run advisor and RPC/grant drift checks after every database migration and on a schedule.
- Document the emergency revoke, rollback, and incident-response path.

## Acceptance criteria

1. Anonymous callers cannot execute the three confirmed functions or obtain their effects.
2. Every remaining client-executable `SECURITY DEFINER` function has an owner, purpose, internal
   authorization proof, fixed `search_path`, explicit role grant, and negative test.
3. Service-only and trigger-only functions are not callable by `PUBLIC`, `anon`, or
   `authenticated`.
4. High-risk RLS/no-policy findings have an explicit disposition and no unintended Data API path.
5. Leaked-password protection and the approved OTP expiry are active; the supported Postgres
   security update is complete.
6. Core same-user production workflows pass after containment, while anonymous, cross-user, and
   ordinary-user admin probes fail closed.
7. The live advisor rerun, privilege inventory, deployment receipt, rollback proof, and log review
   are recorded.
8. A CI/scheduled guard rejects new unexplained privileged-function exposure.

## Non-goals

- Eliminating every performance-advisor warning in this security lane.
- Rewriting sound RLS or privileged functions merely to reduce a warning count.
- Folding migration-ledger reconciliation into this tracker.
- Enabling billing before the separate commercial and payment gates are complete.
