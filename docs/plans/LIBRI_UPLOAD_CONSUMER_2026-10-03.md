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
This change is not applied to production yet; exact-commit CI and release remain.

A normal user-facing OCR confirmation/admission flow and sustained worker activation
are still required. This receipt closes the publication ledger's bookkeeping gap; it
does not authorize automatically turning every upload into paid OCR.
