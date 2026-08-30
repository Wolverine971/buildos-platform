# Libri Worker Phase 3B.3: Transaction Lifecycle

Date: 2026-08-30
Status: deployed, production-canary verified, and complete; queue polling remains disabled

## Outcome

This slice implements the durable queue/domain lifecycle over the capped `libri_worker` PostgreSQL
connection. It adds no database migration, role, policy, trigger, scheduler, or activation change.
`LIBRI_WORKER_ENABLED` remains `false`.

The lifecycle owns:

- idempotent enqueue of an existing immutable research step and its Libri-only queue row;
- enum-array pending claims ordered by priority and schedule with `FOR UPDATE SKIP LOCKED`;
- independent queue processing tokens, step lease tokens, and monotonic execution generations;
- bounded heartbeat renewal and stale-token rejection;
- atomic queue/step/run completion with result and usage telemetry;
- retry scheduling with bounded exponential backoff;
- terminal failure and dead-letter accounting;
- durable run cancellation intent followed by an idempotent, lock-safe queue/step sweep; and
- stale-lease retry/dead-letter recovery that honors cancellation before replay.

Malformed or mismatched Libri queue rows are quarantined as failed instead of poisoning every poll.
Every multi-row operation uses one checked-out connection and an explicit transaction; any thrown
write failure rolls the entire operation back.

## Shared-database safety

The claim predicate remains enum typed, so the production pending-claim index is usable. The direct
login's existing RLS and column grants remain the outer boundary: it can see only the four
`libri_*` queue families and cannot delete or retag a queue job. The implementation never imports
the Supabase service client, the general BuildOS queue, scheduler, or any non-Libri processor tree.

Cancellation is two-stage by design. The first short transaction persists `cancel_requested_at`
and the reason. The second transaction sweeps available queue and step rows using skip-locked row
ownership. If another worker temporarily owns a row, repeating cancellation safely finishes the
sweep; new claims and terminal writes observe the durable cancellation fence.

## Verification

- Focused Libri unit/service suites: 26 tests passed.
- Restricted-role disposable PostgreSQL contract: 4 scenarios passed.
- Full worker suite: 161 files / 1,395 tests passed; 3 live-only files / 12 tests skipped.
- Worker source typecheck: passed.
- Worker test type debt: 217/217, exactly at baseline.
- Worker lint and HTTP module guard: passed; one pre-existing explicit-`any` warning remains in the
  concurrent Agentic Chat delegate adapter.
- Diff whitespace check: passed.

The PostgreSQL contract executes the real TypeScript queries as `libri_worker`. It proves
idempotent enqueue, RLS visibility, claim/heartbeat/complete, retry and exhausted dead-letter,
cancellation and stale-worker rejection, stale-lease retry and exhaustion, and an unchanged hidden
non-Libri BuildOS queue control row.

## Production release receipt

Commit `9bf48617119616468f292abf844d14734901aa9b` deployed the lifecycle while preserving the
health-only production profile. Railway deployment `35447a10-cfba-46a7-97f3-9203941f824e`
passed the restricted database `/health` check. The same commit also reached `SUCCESS` on the
existing BuildOS services:

- `agentic-chat-worker`: deployment `37aea6a9-13d5-4c38-8e21-64f4324b6804`;
- `daily-brief-worker`: deployment `b3233bf3-040c-41dd-a4a0-d6abedb129fa`; and
- `libri-worker`: deployment `35447a10-cfba-46a7-97f3-9203941f824e`.

A presence-only environment audit confirmed `LIBRI_WORKER_PROFILE=production`,
`LIBRI_WORKER_ENABLED=false`, the restricted URL and CA present, and both legacy Supabase service
variables absent.

## Production canary receipt

The canary first required zero active Libri queue work, then privileged setup inserted five
one-step `libri_maintenance` runs and one completed `other` queue row as a non-Libri isolation
control. The lifecycle itself ran only through Railway's strict-TLS `libri_worker` credential. It
passed:

- restricted-role attestation and RLS hiding of the non-Libri control;
- idempotent enqueue;
- claim, heartbeat, completion, replay rejection, and stale-token rejection;
- immediate retry, monotonic generation fencing, and exhausted dead letter;
- durable idempotent cancellation and rejection of the cancelled worker's completion; and
- stale-lease retry plus stale-lease exhaustion.

The durable postcheck matched every expected queue, step, and run state. The non-Libri control row
remained byte-for-byte identical at MD5 `a2fd8304e7e5c8955d5c298a53547bae`. A broader non-Libri
catalog signature remained exactly `14,694` entries / MD5
`7bf9f63dedec1a651fe7e76b1630a804` before and after the canary. Cleanup was guarded by exact target
counts and restored production to zero research runs, zero research steps, and zero Libri queue
jobs; the existing library was not modified.

## Permanent shared-database safety gate

The requested BuildOS regression task is a required GitHub Actions job named
`Libri migration safety`. It runs on every push and pull request, cannot pass unless the complete
BuildOS typecheck/lint/test/build/coverage/SQL job passes first, and then executes the Libri static
scope guard plus all self-contained contracts on PostgreSQL 15. The static guard forbids global
DDL, dynamic SQL, `SECURITY DEFINER`, unreviewed destructive changes, and unallowlisted mutations
outside `libri`; the database contracts retain a non-Libri queue control and cross-schema dependency
checks. This is a release gate, not an optional follow-up checklist.

## Next activation boundary

Phase 3B.3 is complete, but the service still has no business processor or queue poll loop and the
production profile intentionally rejects `LIBRI_WORKER_ENABLED=true`. The next implementation slice
must define one bounded `libri_maintenance` processor, add a drain-safe polling loop around this
lifecycle, and prove it with a disabled deployment plus an exact one-job activation canary before
any recurring research flow is admitted.
