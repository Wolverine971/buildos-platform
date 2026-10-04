# Exact-upload consumer

Status: implemented behind the disabled worker switch; local qualification only.
The original Libri interface is unchanged. This does not complete the Convex exit.

The dedicated Railway entrypoint now composes the existing restricted database port,
download broker, isolated verifier and publication broker for one explicitly selected
upload. The process never imports the general scheduler or dispatches paid OCR.
The separate publication follow-up record remains pending for a future dispatcher.

## Operation and failure behavior

- Upload consumption is off unless `LIBRI_WORKER_ENABLED=true` and
  `LIBRI_WORKER_ACTIVATION_MODE=upload_canary` are explicitly configured.
- Concurrency must be one, admission dispatch must be disabled, and activation must
  expire within 1–30 minutes. Both wall-clock and monotonic deadlines are enforced.
- Scope requires a library UUID, upload UUID and stable lease-token UUID. Preserve that
  token across process restarts. An ambiguous claim retries at most three times with
  the same token, without creating a new attempt.
- Before claiming and again after taking the lease, a machine-authenticated broker read checks the durable publication
  ledger. A matching committed publication is reported complete. Any unresolved prior
  publication halts the consumer before signing or writing. Inspection returns only a
  small status value, never raw ledger records or object paths.
- One download owns the bytes, verifies them and publishes those exact bytes. A lost
  publication reply may cause one finalize-only reconciliation using the same fence
  and verified metadata. That operation neither signs another capability nor PUTs bytes.
- Unknown outcomes stop further work and report unhealthy/reconciliation-required.
  There is no automatic compensation deletion, failure overwrite, quota release, new
  lease token or OCR dispatch. A restart does not turn uncertainty into a new write.
- Shutdown aborts work and waits for the actual occupied transport/native capacity to
  drain. A 20-second incomplete drain is unhealthy and the process exits nonzero.
- `/health` exposes upload state separately; this mode reports queue consumption off.

## Configuration for a later qualified activation

Retain the existing verified `libri_worker` database URL and CA certificate. Add these
only for the selected, expiring upload; never put a service key into the worker:

| Variable                                  | Value                                                      |
| ----------------------------------------- | ---------------------------------------------------------- |
| `LIBRI_WORKER_PROFILE`                    | `production`                                               |
| `LIBRI_WORKER_ENABLED`                    | `true` only during qualification                           |
| `LIBRI_WORKER_ACTIVATION_MODE`            | `upload_canary`                                            |
| `LIBRI_WORKER_CONCURRENCY`                | `1`                                                        |
| `LIBRI_WORKER_ADMISSION_DISPATCH_ENABLED` | `false`                                                    |
| `LIBRI_WORKER_CANARY_LIBRARY_ID`          | exact approved library UUID                                |
| `LIBRI_WORKER_CANARY_UPLOAD_ID`           | exact upload UUID                                          |
| `LIBRI_WORKER_CANARY_UPLOAD_LEASE_TOKEN`  | stable UUID, reused on restart                             |
| `LIBRI_WORKER_CANARY_EXPIRES_AT`          | UTC ISO timestamp 1–30 minutes ahead                       |
| `LIBRI_UPLOAD_DOWNLOAD_BROKER_URL`        | `https://build-os.com/api/internal/libri/uploads/download` |
| `LIBRI_UPLOAD_PUBLICATION_BROKER_URL`     | `https://build-os.com/api/internal/libri/uploads/publish`  |
| `PRIVATE_LIBRI_ASSET_BROKER_TOKEN`        | existing machine-only broker credential                    |

The publication server must be deployed with the new `inspect` action before activation.
An older server rejects it, so the worker fails closed without performing a claim.
Normal deployment keeps worker, database controls and signing switches disabled.

## Qualification and remaining boundaries

Validation on October 3: 147 worker tests and 40 broker tests passed. The worker source
and test typechecks, targeted source lint and changed-file formatting checks passed.

Focused tests cover the consumer lifecycle, broker request boundaries, publication
reconciliation, disabled profiles, expiry, cancellation, unknown replies and restart
behavior. Disposable PostgreSQL integration exercises real restricted-role claim,
publication, rollback and lost-commit behavior with synthetic Storage responses. No
test uses hosted Storage, provider credentials or a paid model.

Remaining before a usable upload feature: exact-head CI, deployment with activation
off, hosted upload qualification, maintenance/retirement/cleanup service transport,
issued or uncertain upload quota settlement, publication-follow-up dispatch, and
connection to the existing Libri UI. General research, chat/API replacement, final
data reconciliation and Convex retirement remain separate unfinished migration work.

The pending quota migration `20260910170101` was applied separately on October 3 after
its original exact-commit CI and a fresh production-schema rehearsal. Its production
receipt is in Libri's `LIBRI_UPLOAD_QUOTA_SETTLEMENT_2026-09-10.md`.

## Explicit OCR handoff receipt (October 4 follow-up)

Migration `20261004012059_libri_upload_ocr_handoff_receipt.sql` connects a published
upload to the **existing explicitly confirmed OCR dispatcher**. It records the first
admission UUID, step UUID and enqueue timestamp in the same transaction as queue
finalization. It never plans a batch, invents confirmation, starts a provider call,
or changes activation switches. Imported images without an upload publication use
the existing dispatcher unchanged.

The existing admission BEFORE trigger validates the complete immutable manifest and
queue evidence. The new AFTER trigger matches pending published images by library,
book and verified content hash, rechecks the confirmer's editor/owner membership,
and records the receipt. A mismatch rolls back finalization; a lost commit reply
retains both the queue and receipt. Subsequent dispatches do not overwrite the first
receipt. The invoker function grants no new authority to browser, worker or reader
roles. Receipt FKs preserve the existing publication-before-admission account purge
order. Existing dispatched publications without a receipt would fail migration
validation rather than receive invented evidence.

Local PostgreSQL 16 tests cover no automatic work/activation, denied direct authority,
confirmation without dispatch, missing queue evidence, mismatched image hashes,
revoked membership, exact receipts, rollback, replay and purge ordering. The final
production-schema rehearsal includes client role probes and standing archived/project
coverage checks. Read-only hosted preflight found zero publications and zero admissions.
Production release (October 4): PR #36 passed full CI and PostgreSQL 15 safety on
`5a1feb3f92246db59a359f44a5afcb6186d0e646` (run `37167968422`) and merged as
`ebe4960a980b2ff5242d94cd918d8de7ab556097`. A fresh production-schema rehearsal
passed before applying this one file; migration history `20261004012059` is recorded.
The file SHA-256 is `f19ebe75743f1c8e793f5b6ca27564b1a10405b074212e6ac0f88cd47cbd9b3d`.
Read-only verification found all three receipt columns and the enabled trigger, no
client/worker direct function execution, zero publications/admissions, and all 408
images/private objects. Shared-schema fingerprint `7343e7b85fd83c998518322907ba0918`
(17,988 signatures), forced RLS, role boundaries and people policy matched before/after.
All 274 security findings in eight advisor groups were unchanged (observation times excluded).
The first CLI history repair could not find the new file in the original checkout;
linking this isolated worktree and repairing from its exact file succeeded. DDL was not replayed.
Activation remains off.

A normal user-facing OCR confirmation/admission flow and sustained worker activation
are still required. This receipt closes the publication ledger's bookkeeping gap; it
does not authorize automatically turning every upload into paid OCR.
