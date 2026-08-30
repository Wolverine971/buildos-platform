# Libri Worker Phase 3B.3: Transaction Lifecycle

Date: 2026-08-30
Status: implementation and disposable-PostgreSQL contract complete; production canary pending

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

## Activation remains blocked

Before queue polling is enabled:

1. deploy this disabled lifecycle image and pass full BuildOS plus Libri CI;
2. run one synthetic `libri_maintenance` production lifecycle canary through the restricted role;
3. prove a non-Libri queue control row and the BuildOS catalog fingerprint are unchanged; and
4. add the permanent shared-database migration safety task/gate requested for future Libri changes.
