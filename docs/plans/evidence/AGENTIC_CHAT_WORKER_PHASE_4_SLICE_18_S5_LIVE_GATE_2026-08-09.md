<!-- docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_18_S5_LIVE_GATE_2026-08-09.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-08-09; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Phase 4 Slice 18 S5 — worker live quality gate

**Gate date:** 2026-08-09  
**Result:** PASS  
**Exact revision:** `8f22819fc96e61a8477c3b517d1bf2d8d9f522a7`  
**Exact tree:** `9f4fc242db2cdb0113587315db4c4a6b453fa5f9`

## Defect found and repaired

The first worker-aware battery proved the narrated-read repair and worker-native
attribution, but four provider turns still failed immediately before a durable
tool call. Retained OpenRouter generations for those turns were successful
upstream completions with `finish_reason=tool_calls` across StreamLake and
Baidu. The worker adapter, however, rejected any streamed tool-call delta whose
array contained more than one call or whose index was greater than zero.

That contradicted the ratified P1 contract: provider calls from one round are
executed sequentially in emission order, then every durable result is returned
to the next provider round together. Commit `8f22819fc` replaces the singleton
accumulator with a bounded 40-call indexed accumulator, preserves fragmented
arguments and identity checks, emits each read to the existing executor fence
in index order, and replays the complete ordered result set. The executor test
proves both tool results are durable and public before continuation begins.

## Local gate

- Focused round-bridge/executor proof: 66/66.
- Complete worker suite: 814 passed, one intentional skip.
- Worker typecheck: pass.
- Worker lint/HTTP guard: zero errors; unchanged 175-warning baseline.
- Touched files: Prettier and `git diff --check` clean.
- The user's separately staged `packages/shared-types/src/database.schema.ts`
  was preserved outside the commit.

## Deployment and routing controls

- Railway deployment: `cf6e3753-f4d4-4c22-aa0d-64978a60bc58`.
- CLI deployment message: `8f22819fc ordered parallel worker reads`.
- Image digest:
  `sha256:17c82db5f2122aa91c4629c863163c3765cb3659ed6c6f999effc68f390623c4`.
- Deployment status: `SUCCESS`; fresh queue/runtime start at
  `2026-08-09T03:22:13Z`; worker and Agentic Chat health both green.
- Routing-OFF preflight authenticated and subscribed, then failed before any
  model turn because negotiation returned no worker lease.
- Every paid run used the exact one-user cohort and an EXIT trap that promoted
  the routing-OFF deployment on success, assertion failure, or interruption.
- Final independent check: `build-os.com` is Ready on routing-OFF deployment
  `dpl_3Hh8rutpXhqavnzKQ9fCAS8rXtpa`
  (`build-dhlz7w05q-djwayne35gmailcoms-projects.vercel.app`).

## Diagnostic canary

The formerly deterministic failure, `project-catchup-cold`, passed once before
the full gate:

- turn run: `6a904a83-1b32-4cf1-b749-042930de1fc8`;
- exact worker contract: `worker_realtime/agentic_chat_worker_v1`;
- five successful reads across three true provider rounds;
- 1/1 completed and assertion-passing, zero stream/capture errors;
- cost: `$0.00106525`;
- artifact:
  `/private/tmp/buildos-agentic-worker-parallel-diagnostic-20260809T0323Z.json`;
- SHA-256:
  `245fc083022c5ef9109340b618975555247af0bc8dc11ccfb36987350e40acb2`.

## Authorized read-only quality battery

Configuration was exactly the P1-reachable Phase 0 subset:

- `restraint-noop-and-ambiguity` × three repetitions (six turns);
- `project-catchup-cold` × three repetitions (three turns);
- execution mode `worker_realtime`, retry count zero;
- clean detached evidence checkout at the exact revision above.

Result:

- 9/9 turns completed;
- 9/9 assertions passed;
- 0 stream-error turns;
- 0 capture-error turns;
- all nine retained rows were exact
  `worker_realtime/agentic_chat_worker_v1`;
- 19 successful durable tool executions;
- restraint call/round counts: `1/1`, `0/0`, `2/1`, `0/0`, `2/1`, `0/0`;
- catch-up call/round counts: `4/2`, `5/2`, `5/2`;
- total provider cost: `$0.00643681`;
- Phase 0 comparison: 9/9 completed, 9/9 assertion-passing,
  `$0.01646978`;
- cost delta: `$0.01003297` lower, or 60.9% below Phase 0.

Full artifact:

`/private/tmp/buildos-agentic-worker-p1-readonly-20260809T0326Z.json`

Artifact SHA-256:

`e4b964c2bb3408aae3b79c98215d05d671acad6cc84c8aaae7fd29e72422a1c3`

Turn-run IDs, in artifact order:

1. `2d72b2a4-6f1a-4b8e-b87e-2f9a540daa50`
2. `3fb81287-0b2e-47f1-a941-2d8a7f502c22`
3. `0dd0c277-c8b7-48f8-b988-7548328fc6fa`
4. `29eb0949-63f3-44a9-9c0d-b480898fec67`
5. `9ea5159f-e4c7-4225-b6e2-ddb48e37873e`
6. `c7fdd7e5-b11a-4b86-bfa0-8d8049cbf45f`
7. `1a55e84e-37c4-4de9-994f-c93edaf1ae2f`
8. `0857bcb4-df57-4c99-9ecd-bbc3f6070cf2`
9. `845b3dcb-78a2-4871-9b51-d4dbfe9b7c9a`

## Decision

S5 meets its live exit gate: the full P1-reachable read-only subset equals the
Phase 0 quality baseline and uses materially less provider spend. P1 read-loop
parity is complete. Worker routing remains internal-only and OFF between gates;
the next Phase 4 package is P2 (write/mutation loop parity), which requires its
own effect-reservation and differential boundary before any mutation is routed
to the worker.
