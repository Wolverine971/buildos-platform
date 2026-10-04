# Exact-upload maintenance

Status: implemented, default off; local qualification only. This does not activate
uploads, delete hosted objects, or complete the Convex exit.

The dedicated Libri worker can now maintain one explicitly selected upload through
a machine-authenticated server broker. It receives no service-role credential,
Storage path, signing authority, arbitrary SQL, or paid OCR capability. Existing
database functions own retirement, quota eligibility, cleanup leases and the
27-hour delay. This change adds no migrations or role grants.

## Bounded execution

`upload_maintenance_canary` runs once, with concurrency one, an exact library/upload
UUID, a stable cleanup lease-token UUID, and a 1–30 minute activation expiry.
It cannot run alongside queue consumption or admission dispatch.

1. Retire the upload using the existing idempotent retirement contract. An ineligible
   upload ends the pass without further work.
2. Request unissued pending-slot settlement. Only policy-1 expired reservations with
   no issuance, processing, publication or canonical-image evidence qualify. A
   retained slot does not block eligible cleanup. Daily quota is never released.
3. Read at most four retained target IDs, filtered by both library and upload.
4. For each target, recheck upload ownership and invoke the existing bounded cleanup
   executor. The database independently controls eligibility and the cleanup switch.

At most one delete is attempted per target in a pass. The executor reauthorizes the
lease immediately before deletion, validates the exact delete receipt, independently
observes absence, and records the result under the original fence. An absence
observation never removes the durable target; late-arrival protection remains.
Committed image paths remain protected by SQL.

An unavailable cleanup or unknown network outcome stops the entire pass without an
automatic retry, replacement token, compensating mutation or further target. Inspect
the durable receipt before an explicit rerun. Preserve the configured token across
process restarts; a same-token cleanup replay cannot extend its lease or mint a new
attempt. Later eligible observations require a separately selected maintenance pass.

Request bodies, response bodies, action names and response identities are bounded and
validated. Redirects are rejected. Both broker and worker retain occupied capacity
after timeout until the underlying operation settles; the broker also retains its
nested cleanup executor's occupancy. Shutdown waits up to 20 seconds for actual
transport work and exits nonzero on incomplete drain.

Health reports `uploadMaintenance` separately from the disabled queue. A completed
pass means all requested outcomes are known, including ineligible/deferred work;
it does not claim every retained object is permanently gone. Counters distinguish
retirement, pending-slot release, observed absence, and deferred targets.

## Deployment and later qualification

Deploy the broker before enabling this mode. Its web switch is
`PRIVATE_LIBRI_UPLOAD_MAINTENANCE_ENABLED=true`; absent or any other value keeps it off.
It uses the existing server service credential and machine broker token. The server
accepts only the existing Libri library in the pinned Supabase project.

The worker retains its existing restricted database URL and CA certificate. Configure
only the following for a later explicitly scoped qualification:

| Variable                                  | Value                                                      |
| ----------------------------------------- | ---------------------------------------------------------- |
| `LIBRI_WORKER_PROFILE`                    | `production`                                               |
| `LIBRI_WORKER_ENABLED`                    | `true` only for the selected pass                          |
| `LIBRI_WORKER_ACTIVATION_MODE`            | `upload_maintenance_canary`                                |
| `LIBRI_WORKER_CONCURRENCY`                | `1`                                                        |
| `LIBRI_WORKER_ADMISSION_DISPATCH_ENABLED` | `false`                                                    |
| `LIBRI_WORKER_CANARY_LIBRARY_ID`          | exact library UUID                                         |
| `LIBRI_WORKER_CANARY_UPLOAD_ID`           | exact upload UUID                                          |
| `LIBRI_WORKER_CANARY_UPLOAD_LEASE_TOKEN`  | stable UUID, reused on restart                             |
| `LIBRI_WORKER_CANARY_EXPIRES_AT`          | UTC timestamp 1–30 minutes ahead                           |
| `LIBRI_UPLOAD_MAINTENANCE_BROKER_URL`     | `https://build-os.com/api/internal/libri/uploads/maintain` |
| `PRIVATE_LIBRI_ASSET_BROKER_TOKEN`        | existing machine credential                                |

Keep worker, web broker and database cleanup switches off for ordinary deployment.
No live activation or Storage deletion was performed in this implementation.

## Verification and remaining work

Focused tests cover authentication/default-off behavior, strict scope and target
ownership, bounded receipts, lost replies, expiry, actual capacity after cancellation,
shutdown and queue isolation. Real disposable PostgreSQL tests exercise the complete
consumer/broker retirement and settlement path, plus cleanup through the machine
transport with synthetic Storage. Cases include issued reservations, lost committed
replies, kill switches, stale fences, late objects and lost cleanup completion.

Hosted upload and maintenance qualification, issued/uncertain pending-slot policy,
publication-follow-up dispatch and connection to the existing Libri UI remain ahead.
General research, remaining application/API replacements, final data reconciliation
and Convex retirement are separate unfinished migration work.
