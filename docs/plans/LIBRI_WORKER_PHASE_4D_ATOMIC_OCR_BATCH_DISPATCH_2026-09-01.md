# Libri Worker Phase 4D: Atomic OCR Batch Dispatch

Date: 2026-09-01
Status: production migration and disabled worker release deployed and verified; complete

## Decision

The dedicated Railway process may translate one exact, explicitly confirmed OCR admission into the
shared BuildOS queue. Dispatch remains a separate, one-shot startup action from queue consumption.
Hosted dispatch requires all of the following:

- `LIBRI_WORKER_ADMISSION_DISPATCH_ENABLED=true`;
- `LIBRI_WORKER_ENABLED=false`;
- activation mode `disabled`;
- one exact admission UUID; and
- an expiry one to thirty minutes ahead.

The default is false. Recurring polling, admission discovery, queue consumption, OCR provider calls,
successor enqueue, and recursive research remain absent.

## Atomicity and idempotency

The startup path first runs the live restricted-role capability probe. The dispatcher then opens one
transaction, locks the admission's owning run, reloads the admission after that lock, locks all
ordered manifest steps, and revalidates the immutable batch contract and SHA-256. It creates the
exact `libri_ingest` rows with the standard active-job dedup key, links each research step, and
compare-and-set marks the admission `enqueued` last. Any error rolls back every queue, step, and
admission write.

Concurrent exact dispatches serialize on the owning run. One creates the queue rows; the other reads
the committed `enqueued` state and returns the durable queue receipt. An `enqueued` replay verifies
every queue row against the admission, run, step, manifest hash, position, and payload version before
reporting success.

## Least-privilege boundary

Migration `20260901054000_libri_ocr_batch_dispatcher_access.sql` gives `libri_worker` only:

- RLS-filtered SELECT on admitted OCR manifest and admission rows;
- column-limited admission UPDATE for `status`, `enqueued_at`, and `updated_at`; and
- execution of an invoker trigger that permits only `confirmed -> enqueued` while freezing identity,
  confirmation, manifest, and creation fields.

The existing worker role continues to hold the already-reviewed narrow queue and research-step
authority. It cannot insert or delete admissions, change a manifest hash, mutate Libri images during
dispatch, view the non-Libri BuildOS queue control row, or use a service-role credential. The new
foreign-key index also covers `confirmed_by` without widening access.

## Verification receipt

- Worker production TypeScript check: passed.
- Focused production-source ESLint and Prettier: passed.
- Dispatcher, database, and service unit suites: 57/57 passed.
- Disposable restricted-role PostgreSQL dispatch contract: passed, including two concurrent exact
  dispatches, exact replay, two linked queue rows, and an unchanged BuildOS control row.
- Migration ledger: 414 files valid.
- Libri migration scope: 16 migrations valid; 26/26 guard tests passed.
- Disposable PostgreSQL contracts: 32/32 passed.
- Full worker test-type validation remains red only on the repository's existing unrelated baseline;
  the new Libri test files add no reported diagnostics.

## Production procedure

1. Confirm zero active Libri queue jobs and capture the BuildOS control and queue-contract hashes.
2. Apply only migration `20260901054000` from an isolated linked Supabase work directory.
3. Recheck grants, policies, trigger, index, hashes, counts, and Supabase advisors.
4. Deploy the worker code with both dispatch and queue consumption false.
5. Create no production admission merely to exercise the dispatcher. A dispatch-only canary is
   allowed only when a real user-reviewed manifest already exists; it must pin one admission and
   leave queue consumption false.
6. Activate one exact OCR consumer only as a later, separately reviewed action with a provider key,
   broker token, concurrency one, exact step UUID, and short expiry.

## Production migration receipt

At `2026-09-01T05:53Z`, an isolated linked dry run listed only migration `20260901054000`; that
single migration was applied successfully to Supabase project `iwifjtlebphefldmwbkh`.

- The migration ledger contains `20260901054000`.
- The new partial foreign-key index, three worker RLS policies, transition trigger, invoker function,
  fixed search path, and column-limited grants are present.
- `libri_worker` can select admitted manifests/admissions and update admission status, but cannot
  insert/delete admissions or update the manifest hash.
- Manifest rows, admission rows, and active Libri queue jobs remain zero.
- The shared queue catalog fingerprint remains exactly
  `4145aa1a1ccdc7e0994247ffeac2cc42` before and after apply.
- Railway remained disabled with concurrency two, no canary target or expiry, no provider key, no
  Supabase service key, and the restricted database URL present.

The Supabase advisor no longer reports `confirmed_by` as an unindexed foreign key and no longer
reports `ocr_batch_admissions` as RLS-without-policy. It reports the brand-new index as unused,
which is expected before the first admission. Existing unrelated Libri notices remain tracked
separately.

## Disabled Railway release

Commit `216d1cab6` deployed successfully as Railway deployment
`bc79f776-00d7-42c3-a932-4f660c339924`. Its instance is running, and the startup log contains no
probe or health failure. The post-deploy environment receipt still has queue consumption false,
admission dispatch unset/false, activation mode disabled, no canary admission, no provider key, and
no Supabase service-role key.

Phase 5's final hardened successor release `10d47f59-c5e6-43ce-bb4d-5b35472f0950` at commit
`837fdfe17` preserves that disabled posture and adds the mandatory pre-dispatch role probe.

## Phase boundary

Phase 4 ends when the access migration and disabled worker release are live and their production
invariants pass. An optional dispatch-only canary is evidence, not an exit requirement when no real
admission exists.

Phase 5 should add read-only reconciliation and operator recovery for confirmed-but-not-enqueued,
enqueued-with-incomplete-receipt, and active-queue mismatches. It must not introduce polling,
automatic retries after paid exposure, recursive discovery, or a broad queue sweeper.
