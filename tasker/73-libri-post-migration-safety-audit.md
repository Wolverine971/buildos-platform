<!-- tasker/73-libri-post-migration-safety-audit.md -->

# 73 — Libri post-migration BuildOS safety audit

**Created 2026-08-29. Status: queued — activate immediately after Libri application and worker
cutover; Convex retirement is blocked until this tracker passes.**

## Kernel

Prove with production evidence that moving Libri into the shared BuildOS Supabase project did not
change or degrade BuildOS, that the imported library is complete, and that the dedicated Railway
worker is bounded and recoverable. This is the user's explicit shared-failure-domain backstop.

The per-migration guard is separate and runs before cutover through
`check:libri-migrations`, the disposable SQL contracts, and the BuildOS CI pipeline. This tracker is
the final after-cutover audit.

## Activation receipt

Do not start the audit without recording:

- BuildOS release commit and Railway deployment IDs;
- every applied Libri migration version;
- the final Convex database and storage export manifest;
- the Supabase import/reconciliation report;
- the pre-cutover BuildOS latency, connection, lock, queue-age, and error baseline;
- the start and planned end of the 7–14 day rollback window.

## Required audit

### Data and cutover

- [ ] No production code path imports, initializes, or calls Convex.
- [ ] Every canonical Convex table reconciles to the signed target row-count manifest.
- [ ] Storage object counts and checksums reconcile; representative downloads open correctly.
- [ ] No orphaned foreign keys or unresolved migration ID mappings remain.
- [ ] Historical failed, pending, `needs_review`, and `insufficient_evidence` work was not
      unintentionally reactivated.
- [ ] The final Convex database/storage export and checksums are stored outside the live app
      database.

### BuildOS isolation

- [ ] The normalized non-Libri schema fingerprint matches the approved pre-cutover fingerprint,
      except for the signed queue/storage allowlist.
- [ ] All Libri tables have the intended grants, forced RLS, policies, and indexed access paths.
- [ ] The hosted Data API exposes `libri`, denies `anon`, and passes authenticated allow/deny
      smoke tests without exposing the service credential.
- [ ] The full BuildOS test and production-canary battery passes against the migrated database.
- [ ] BuildOS p95 latency, database connection use, lock waits, queue age, and error rate show no
      material regression through the observation window.
- [ ] No BuildOS domain table has a foreign key dependency on the `libri` schema.

### Worker safety

- [ ] The dedicated Railway Libri service registers only `libri_*` processors.
- [ ] The Libri process uses the approved least-privilege database role/RPC boundary rather than the
      general unrestricted worker service credential, or an explicitly time-boxed exception is
      signed and tracked.
- [ ] Concurrency, priority, per-run time/source/step/model-cost budgets, and shutdown drain match
      the approved configuration.
- [ ] Duplicate delivery does not duplicate domain writes.
- [ ] Lease expiry, retry/backoff, cancellation, killed-worker recovery, and dead-letter behavior
      pass in production-like tests.
- [ ] Cron or scheduled triggers enqueue bounded work and do not perform research inline.
- [ ] Worker queue age, failure rate, connection use, and model cost stay within the agreed limits.
- [ ] Global Libri runnable-backlog and enqueue-rate caps prevent an unbounded queue flood.
- [ ] Atomic finalize/outbox recovery and generation fencing prevent lost successors and late stale
      writes across killed-worker tests.

## Sign-off artifact

Publish a dated report containing:

- commit, migration, and deployment versions;
- data and storage reconciliation totals;
- before/after BuildOS performance and schema evidence;
- queue and worker recovery evidence;
- Supabase advisor results;
- named exceptions, owners, and deadlines;
- a final `pass`, `conditional pass`, or `fail` decision.

Only `pass`, after the rollback window has elapsed without unresolved discrepancies, authorizes
Convex retirement. A conditional pass keeps Convex read-only and this tracker open.

## Exit condition

Delete this tracker only after the signed audit reports `pass`, Convex is retired, the final export
is retained, and any lasting operational guidance has moved to durable Libri/BuildOS runbooks.
