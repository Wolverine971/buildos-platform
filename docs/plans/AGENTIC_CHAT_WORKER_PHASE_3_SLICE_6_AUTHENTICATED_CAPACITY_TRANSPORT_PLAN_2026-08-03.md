<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_3_SLICE_6_AUTHENTICATED_CAPACITY_TRANSPORT_PLAN_2026-08-03.md -->

# Agentic Chat Worker Phase 3 Slice 6 — Authenticated Capacity Transport

**Prepared:** 2026-08-03 EDT
**Status:** Implemented and validated locally. The hosted production worker flag is now true with a validated single-user internal cohort and explicit parity model, but Slices 1–6 remain uncommitted and undeployed. The current deployed worker is healthy on the prior code and does not yet mount this runtime or endpoint. New transport decisions remain legacy-only.
**Authority:** The user explicitly authorized the real activation switch, a double-check, and the next slice. That authorized the production environment-variable update and local capacity-transport implementation. It did not authorize publishing the dirty local worktree, opening worker-mode routing, admitting a live turn, or making a paid provider call.

## Migration status

This slice changes worker/web TypeScript, tests, environment operations, and planning records only. The hosted Agentic Chat database migration chain remains current through exact receipt `20260802037000`; no new database migration is required or applied.

## Activation update

The production Railway target was resolved as `queue-worker` / `production` / `daily-brief-worker`. Redacted preflight confirmed that the provider key, worker bearer token, and drain budget were valid, while the cohort and explicit model were initially absent. Enabling only the boolean would have made the new lifecycle fail startup when deployed.

The environment update therefore set these three values atomically in one Railway deployment:

- `AGENTIC_CHAT_INTERNAL_USER_IDS` to the one canonical Auth UUID resolved for the established internal account;
- `AGENTIC_CHAT_OPENROUTER_MODEL` to `deepseek/deepseek-v4-flash`, the primary model recorded throughout the clean Phase 0 parity artifact; and
- `AGENTIC_CHAT_WORKER_ENABLED=true`.

Post-write verification exposed only booleans and confirmed all required values are present and canonical. No UUID, bearer token, or provider credential was printed. The environment-only redeploy uses the repository's current deployed revision, which predates the local Phase 3 lifecycle. It is an activation prerequisite, not evidence that the new runtime is already live.

## Slice 5 re-audit

The focused worker lifecycle matrix is green after replacing the Slice 5 “no capacity transport” guard with the Slice 6 private-route guard. The review reconfirmed:

- the general queue still never registers `agentic_chat_turn`;
- enabled startup still requires exact-one concurrency, a canonical cohort, credential, model, and a drain at or below 22 seconds;
- health remains composite and crash/graceful cleanup remains bounded; and
- the currently deployed health response has no `agenticChat` field, proving the local lifecycle has not been deployed accidentally.

## Implemented worker boundary

### Private projection

`GET /agentic-chat/capacity` is registered behind the worker's global bearer middleware and repeats the bearer check inside the route boundary. Every response is `private, no-store` with legacy cache prevention.

The route returns HTTP 200 only for the exact four-field evidence shape produced by the running bootstrap:

- observation timestamp;
- oldest ready chat-job age;
- provider availability; and
- publisher health/pending bytes.

Missing, failed, timed-out, disabled, unhealthy, or non-exact evidence becomes one generic HTTP 503 with a bounded retry hint. Credential, cohort, model, queue internals, and database errors cannot enter the response.

### Bounded/coalesced collection

Capacity collection has a 1.5-second HTTP deadline. Production retains the one bootstrap instance and coalesces concurrent probes onto one in-flight collection. If an underlying Supabase request outlives the HTTP deadline, later probes reuse it rather than multiplying database work; completion clears the latch.

## Implemented web boundary

`observeAgenticChatWorkerCapacity()` now performs a server-only fetch using `PUBLIC_RAILWAY_WORKER_URL` and `PRIVATE_RAILWAY_WORKER_TOKEN`.

The client:

- accepts only clean HTTPS worker origins, with HTTP limited to exact local-loopback development hosts;
- rejects credentials, paths, query strings, fragments, surrounding whitespace, and malformed bearer tokens;
- sends bearer auth with `GET`, `Accept: application/json`, `credentials: omit`, `redirect: error`, and `cache: no-store`;
- aborts at a short deadline;
- accepts only JSON media types;
- enforces a 4 KiB body bound against both declared and streamed bytes with fatal UTF-8 decoding; and
- requires exact keys at every evidence level before applying freshness/pressure thresholds.

Configuration, authentication, redirect, HTTP, timeout, stream, UTF-8, parse, or schema failure maps to `missing_evidence` and closes capacity. Valid stale evidence remains distinguishable as `stale_evidence` for the existing decision contract.

## Routing boundary retained

Capacity transport does not select transport. The negotiation route still hardcodes every genuinely new decision to `legacy_sse` / `legacy_internal_v1`; only a previously persisted owned worker turn can reissue its immutable worker decision. The production browser still does not call worker admission. Consequently an `open` capacity decision cannot create new worker traffic in this slice.

## Validation

Validation after implementation:

- focused worker capacity/bootstrap/lifecycle: 4 files / 26 tests passed;
- focused web capacity/preparation: 2 files / 12 tests passed;
- complete worker package: 87 files / 707 tests passed, with one explicit opt-in file/test skipped;
- complete Agentic Chat web/service/PostgreSQL gate: 106 files / 868 tests passed;
- worker typecheck passed;
- complete worker lint exited cleanly with 170 pre-existing warnings and no errors;
- the worker HTTP-module size guard passed with no new violation;
- whole-worktree `svelte-check` passed at 0 errors / 0 warnings;
- touched web capacity lint passed; and
- tracked and staged diff checks plus touched-file formatting passed;
- redacted Railway variable verification passed with the activation flag true and every required prerequisite present; and
- the Railway environment-only redeploy completed successfully, public health returned HTTP 200, authenticated capacity returned the expected HTTP 404, and health had no `agenticChat` field—proving the current deployed revision is healthy and still predates the local Phase 3 mount.

No provider request, paid model call, live worker admission, or worker-mode transport decision was made.

## Exact next slice

Phase 3 Slice 7 should be a deployment-and-internal-routing canary, not a broad rollout:

1. publish only a reviewed, clean scope containing the Phase 3 worker/web files;
2. verify the enabled composite Railway health and authenticated capacity endpoint without admitting a turn;
3. add a separate exact internal-user routing gate that can issue `worker_realtime` only when fresh capacity is open;
4. retain legacy fallback for all other users and every missing/closed capacity result; and
5. run one controlled text-only internal turn, including Stop/reconnect, with cost and durable receipts recorded before expanding the cohort.

Do not deploy the current dirty worktree wholesale, enable tools/attachments, broaden concurrency, or route non-cohort users as part of this slice.
