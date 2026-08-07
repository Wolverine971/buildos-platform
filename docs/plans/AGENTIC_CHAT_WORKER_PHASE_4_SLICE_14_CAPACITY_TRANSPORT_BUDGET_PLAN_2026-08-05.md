<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_14_CAPACITY_TRANSPORT_BUDGET_PLAN_2026-08-05.md -->

# Agentic Chat Worker Phase 4 Slice 14 — Capacity Transport Budget

**Prepared:** 2026-08-05 EDT  
**Status:** Superseded later on 2026-08-05. The timeout repair was pushed as `35c2ca8b1`, passed CI, and deployed; canary attempt 3 then failed closed at the admission-side capacity check with zero durable rows because the 5-second observation deadline stacked after multi-second preparation inside the route's 10-second `maxDuration`, and the failure path logged no reason. Routing was returned to exact `false` per the gate. Continue at `AGENTIC_CHAT_WORKER_PHASE_4_SLICE_15_ADMISSION_CAPACITY_OVERLAP_PLAN_2026-08-05.md`.  
**Authority:** The user authorized running the next production gate, repairing failures, double-checking the work, and continuing to the next slice.

## Outcome

Slice 14 fixes the transport-budget defect exposed by the first genuinely worker-selected production request. The worker retains its strict 1.5-second internal evidence-collection ceiling. The web caller now has a separate bounded 5-second end-to-end deadline that includes cross-provider DNS, TLS, proxy transit, worker collection, and response transit.

This slice adds no migration, queue behavior, provider behavior, retry, cache, fallback, tool, mutation, attachment, or concurrency capability.

## Production incident proof

The controlled existing-session request began at `2026-08-05T14:07:08.280Z` after a direct authenticated capacity probe returned healthy/open evidence. Transport negotiation selected `worker_realtime`, but the independent capacity check immediately before atomic admission closed and the UI reported that worker capacity was temporarily unavailable.

The failure was safe:

- a narrow service-role query for the exact session, request text, and post-start timestamp returned zero `chat_turn_runs` rows;
- no input artifact, queue job, stream state, lifecycle projection, tool ledger, mutation effect, assistant message, or provider request was created;
- the browser did not retry through worker or legacy transport; and
- routing was returned to exact `false` before any further canary attempt.

The Vercel worker URL and bearer token were present, canonical, and byte-equal to the local credentials that successfully queried the worker. Five direct probes using the web's exact 1,500 ms deadline all aborted at 1,502–1,503 ms. With a diagnostic 10-second ceiling, the same authenticated endpoint returned healthy evidence in 7,625 ms, 2,505 ms, and 1,659 ms. The equal inner and outer deadlines—not credentials, freshness, pressure, schema, or admission—were the root cause.

## Implementation

`worker-turn-capacity.server.ts` now sets the web transport deadline to 5,000 ms and documents why it must exceed the worker's independent 1,500 ms collection boundary. The existing configurable test-only timeout remains capped at 10 seconds.

The change deliberately preserves:

1. exact HTTPS/local-HTTP URL validation and canonical printable bearer validation;
2. `no-store`, omitted credentials, redirect rejection, bounded response bodies, JSON content-type checks, and exact response schema;
3. the 15-second freshness window and 1-second future-skew allowance;
4. queue, provider, and publisher pressure closure;
5. failure-to-`missing_evidence` behavior for timeout, network, HTTP, parse, and schema errors;
6. independent capacity checks during transport negotiation and immediately before atomic admission; and
7. no automatic retry or legacy fallback after worker admission begins.

## Regression coverage

The capacity boundary test now uses fake timers to prove that a valid response arriving at 4,999 ms remains open and the request signal has not been aborted. Under the prior 1,500 ms default, the same test would fail closed. The existing explicit 5 ms unresponsive-request test continues to prove configurable deadline abort behavior.

Current focused verification:

- worker capacity and admin-session regression files: 2 files / 14 tests passing;
- touched TypeScript ESLint: passing;
- touched-file Prettier: passing after formatting;
- whole web `svelte-check`: 0 errors and 0 warnings;
- tracked diff whitespace validation: passing; and
- no database migration is required.

## Production safety state

`AGENTIC_CHAT_WORKER_ROUTING_ENABLED` is exact `false`; the exact one-user cohort remains present, canonical, and staged. The safety redeploy reused the already reviewed exact source revision and did not package the dirty local worktree. Deployment `dpl_7467BvfiP1pids538fmTszcfFS46` is Ready, aliased to `build-os.com`, and the alias returns HTTP 200.

## Exact next gate

1. Push the reviewed timeout repair and stale admin-session CI assertion; require GitHub CI to pass.
2. Deploy the resulting exact revision with routing still exact `false`; require Vercel Ready and recheck the unauthenticated private/no-store transport boundary.
3. Reconfirm Railway health and authenticated capacity. A cold/slow capacity request may still fail closed; it must never bypass the deadline or pressure gates.
4. Change only routing to exact `true` for the existing one-user cohort and send one new text-only existing-session project-overview request.
5. Require exactly one `worker_realtime` row and a passing explicit-turn Slice 13 verifier. On any failure, return routing to exact `false` without a second request.
6. Do not widen tools, users, provider rounds, mutations, attachments, or concurrency until the durable evidence is reviewed.

This is the natural stopping point before release of the timeout repair. The next capability slice begins only after the production read-canary gate closes.
