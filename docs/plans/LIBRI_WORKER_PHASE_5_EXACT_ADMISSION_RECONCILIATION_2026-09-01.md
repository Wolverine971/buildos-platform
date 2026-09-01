# Libri Worker Phase 5: Exact Admission Reconciliation

Date: 2026-09-01
Status: production index applied and verified; disabled audit release pending

## Decision

Phase 5 adds an operator-only, read-only audit for one exact OCR admission UUID. It does not list or
discover admissions, poll, enqueue, consume, repair, retry, cancel, or call a provider. This is the
smallest operational layer needed to distinguish a safe pending dispatch from a partial or changed
queue receipt without widening the hosted worker's default behavior.

The audit runs through the same restricted `libri_worker` database connection and first executes the
full role-capability probe. Its database work uses a repeatable-read, read-only transaction, so the
admission, manifest, steps, and shared queue receipts come from one consistent snapshot without row
locks or writes.

## Classifications

- `confirmed_ready`: the bounded run and immutable manifest still match, every step is pending and
  unlinked, the deadline remains open, and no queue receipt exists.
- `confirmed_blocked`: a confirmed admission is expired, cancelled, changed, linked, or already has
  unexpected queue evidence. The audit reports issues but does not repair it.
- `enqueued_consistent`: every durable queue receipt matches the exact admission, run, step,
  manifest hash, batch position, and payload version.
- `enqueued_incomplete`: receipt cardinality or identity differs from the immutable manifest.

The command exits zero for a healthy classification, two for a detected inconsistency, and one for
invalid input, role drift, connectivity, or query failure:

```sh
pnpm --filter @buildos/worker libri:admission-audit -- <admission-uuid>
```

The compiled Railway artifact can run the equivalent
`node apps/worker/dist/scripts/reportLibriOcrAdmission.js <admission-uuid>` as an explicit operator
command. It is not the service start command and is not scheduled.

## Shared contract reuse

Canonical manifest hashing and queue-metadata matching now live in one pure
`ocrAdmissionContract` module shared by dispatch and audit. This prevents the diagnostic from
silently defining a looser notion of consistency than the writer.

## Performance correction

Migration `20260901055654_libri_provider_cost_reservation_step_index.sql` adds a covering
`(library_id, run_id, step_id)` index for the composite provider-cost reservation foreign key. The
Supabase advisor identified that exact missing access path. It is Libri-only, contains no routine or
cross-schema reference, and protects future multi-image step cleanup from scanning the reservation
table. Production currently has one reservation row, so the bounded index build is low risk.

## Verification receipt

- Phase 5 audit plus existing Libri unit suites: 62/62 passed.
- Real restricted-role PostgreSQL contract: passed for `confirmed_ready`, two concurrent exact
  dispatches, exact replay, and `enqueued_consistent`; the non-Libri control row remained unchanged.
- New Phase 5 files and Libri dependencies: isolated strict TypeScript check passed.
- Focused production-source ESLint: passed.
- Migration ledger: 415 files valid.
- Libri migration firewall: 17 migrations valid; 26/26 guard tests passed.
- SQL inventory: 127 files valid, 33 self-contained disposable contracts.
- Disposable PostgreSQL contracts: 33/33 passed.

The full worker typecheck is temporarily red on two unrelated Agentic Chat runtime exports in
concurrently edited files. The isolated Phase 5 compiler proof is green, and no Phase 5 diagnostic
appears in the full output.

## Production procedure

1. Capture zero current admissions/jobs and the shared queue catalog fingerprint.
2. Dry-run and apply only migration `20260901055654`.
3. Verify the index, unchanged queue fingerprint/counts, and advisor resolution.
4. Commit and deploy the audit code with the normal Libri service start command unchanged and all
   dispatch/consumer/provider controls off.
5. Run no production audit canary while no real admission exists; invalid or fabricated data would
   weaken the evidence rather than strengthen it.

## Production index receipt

At `2026-09-01T06:03Z`, the isolated linked dry run listed only migration `20260901055654`; that
single migration was applied successfully to Supabase project `iwifjtlebphefldmwbkh`.

- The migration ledger contains `20260901055654`.
- The exact `(library_id, run_id, step_id)` index is valid and ready.
- Provider-cost reservation rows remain one; manifest rows, admission rows, and active Libri queue
  jobs remain zero.
- The shared queue catalog fingerprint remains exactly
  `4145aa1a1ccdc7e0994247ffeac2cc42`.
- The advisor's missing-foreign-key-index notice is gone. The new index is reported as unused, which
  is expected immediately after creation while there is no batch traffic.

## Phase boundary

Phase 5 is complete when the index and disabled audit artifact are live with the production
invariants intact. No Phase 6 is justified until a real user-reviewed batch exists. The next live
action should be one exact plan/confirm/dispatch audit, followed separately by one exact OCR
consumer canary if a provider credential is deliberately provisioned.
