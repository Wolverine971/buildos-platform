<!-- docs/plans/LIBRI_WORKER_PHASE_3A_DEPLOYMENT_RECEIPT_2026-08-29.md -->
<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-08-29; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Libri Worker Phase 3A Railway Deployment Receipt

Date: 2026-08-29
Environment: Railway production
Project: `queue-worker`

## Result

The isolated Libri bootstrap is deployed and healthy with queue consumption disabled.

| Service               | Deployment                             | Commit                                     | Status    | Entrypoint                              |
| --------------------- | -------------------------------------- | ------------------------------------------ | --------- | --------------------------------------- |
| `libri-worker`        | `ee48a407-0459-4e5f-9548-3f6401b58e08` | `f875aac2cfc36ed6246597aa8cba47c5f70fe884` | `SUCCESS` | `node apps/worker/dist/libri-worker.js` |
| `agentic-chat-worker` | `b65596f9-ddab-4ef8-bd60-02a4670be57c` | `f875aac2cfc36ed6246597aa8cba47c5f70fe884` | `SUCCESS` | `node apps/worker/dist/chat-worker.js`  |
| `daily-brief-worker`  | `40fcc975-81d6-4601-8d41-8152e94c4737` | `f875aac2cfc36ed6246597aa8cba47c5f70fe884` | `SUCCESS` | `node apps/worker/dist/index.js`        |

## Libri service contract

- Service ID: `dd758757-df90-4638-9223-a953eb2fd52c`
- Builder setting: `RAILPACK`
- Build command: worker-only Turbo build
- Health gate: `/health`, 300-second deployment timeout
- Restart policy: on failure, three retries
- Drain window: 30 seconds; process hard-stop budget: 28 seconds
- Replica count: one in `us-east4-eqdc4a`
- Registered future queue types: `libri_ingest`, `libri_research`, `libri_derive`, and
  `libri_maintenance`
- `LIBRI_WORKER_PROFILE=production`
- `LIBRI_WORKER_ENABLED=false`
- `LIBRI_WORKER_CONCURRENCY=2`
- No public domain

The only inherited runtime references are the BuildOS Supabase URL and service key. No secret value
is recorded in this receipt.

## Evidence

The focused Libri suite passed eight tests, including scheduled probe-failure containment. Worker
typecheck and the source lint gate passed. The worker also passed a local production-profile live
probe against hosted Supabase before deployment.

Railway accepted the deployment only after `/health` returned HTTP 200. In this process, `/health`
returns 200 only when the isolated bootstrap is running and its Libri Supabase probe is connected;
it returns 503 for a failed or pending database probe. The production profile rejects startup if
queue consumption is enabled, so the successful hosted process is still non-consuming.

The two existing BuildOS worker services redeployed from the same monorepo commit and both reached
`SUCCESS` with their original entrypoints. This is the immediate shared-failure-domain regression
check for the worker bootstrap change.

## Gates that remain closed

Do not set `LIBRI_WORKER_ENABLED=true` yet. Activation still requires:

1. `libri.research_runs` and `libri.research_steps` with leases and generation fencing;
2. the four `public.queue_type` labels and an enum-typed Libri-only claim path;
3. a least-privilege credential or equally narrow database boundary;
4. synthetic enqueue/claim/heartbeat/complete/retry/cancel/stall recovery; and
5. the full BuildOS schema fingerprint and canary regression gate after those migrations.

Railway's compatibility builder emitted a warning that the current Supabase service reference is
made available to the build as well as runtime. This is another reason the broad service key is a
temporary bootstrap dependency, not an acceptable authorization boundary for an enabled consumer.
