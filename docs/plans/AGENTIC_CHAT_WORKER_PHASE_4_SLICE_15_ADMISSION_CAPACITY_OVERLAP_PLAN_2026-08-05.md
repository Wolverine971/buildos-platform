<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_15_ADMISSION_CAPACITY_OVERLAP_PLAN_2026-08-05.md -->

# Agentic Chat Worker Phase 4 Slice 15 — Admission Capacity Overlap, Bounded Retry, and Observation Logging

**Prepared:** 2026-08-05 EDT
**Status:** Slice 15 deployed; attempt 7 exposed a separate tool-side stall. The bounded Task 49 repair is ready for owner deployment; one new production canary remains required.
**Authority:** The user authorized enabling what Phase 3 needs and completing the production read-canary gate ("lets enable whatever we need for phase 3 and get on track").

## Outcome

Slice 15 fixes the third canary failure. The admission-side capacity observation no longer stacks its 5-second deadline after the multi-second turn preparation inside the route's 10-second Vercel `maxDuration`; it now starts concurrently with preparation and is awaited only when the admission args are assembled. A failed observation (timeout, network, HTTP, parse, or schema) earns exactly one bounded fresh attempt at 2.5 seconds; worker-reported pressure and staleness closures remain authoritative and are never retried. Every observation attempt on both production checks now logs phase, attempt, duration, reason, and availability, closing the observability gap that left two production incidents with no server-side trace.

This slice adds no migration, queue behavior, provider behavior, cache, fallback, tool, mutation, attachment, or concurrency capability. Fail-closed boundaries, pressure gates, freshness/skew validation, and the no-legacy-fallback-after-admission rule are unchanged.

## Production incident proof — canary attempt 3, 2026-08-05T20:56Z

With the Slice 14 five-second budget deployed (revision `35c2ca8b1`, deployment `dpl_5ne3tLH9fxf9samQtr2skbjE1bph`) and routing exact `true` for the one-user cohort, the controlled text-only request was submitted in the established project session `26fe15dc-34a5-48d7-926e-2f70ee4b16b6`. Transport negotiation selected `worker_realtime`, then the admission-side capacity check failed closed with `Worker turn capacity is temporarily unavailable` at 20:56:40Z. A service-role lookup returned zero post-send `chat_turn_runs` rows: no artifact, queue job, stream state, ledger row, effect, or provider call was created. Routing was returned to exact `false` (deployment `build-lk4lrqzw1`, Ready, aliased) without a second request.

Diagnosis evidence:

- 26 authenticated production transport negotiations immediately after the failure all returned `worker_realtime` with end-to-end times of 448–1,394 ms (p50 ≈ 500 ms), proving the Vercel-to-Railway observation path is normally fast and the cohort/routing configuration is correct.
- The queue was empty in the failure window (zero `queue_jobs` rows 20:40–21:05Z), and publisher/provider evidence was healthy in direct probes, eliminating genuine pressure closure.
- The admission route sequence was preparation (multi-second under a 60-step session history) → fresh 5-second-deadline capacity fetch → RPC, all inside `maxDuration: 10`; the reconstructed ~9.5-second server duration matches the observed ~13-second client failure including negotiation.
- The `capacity_exceeded` return path emits no log line, so neither this incident nor the 14:07Z incident retained a server-side reason. Only the deadline stacking and the missing retry are repaired; no evidence contradicted the Slice 14 network-budget analysis.

## Implementation

- `worker-turn-capacity.server.ts` adds `observeAgenticChatWorkerCapacityWithRetry(phase, options)`: one primary attempt (5 s default), one 2.5-second-bounded fresh attempt only when the first decision is `missing_evidence`, and structured info/warn logs per attempt with phase, attempt, duration, reason, and availability. Pressure and staleness decisions return immediately without retry.
- `worker-turn-preparation.server.ts` starts the admission-side observation immediately after input-time validation so its deadline overlaps preparation, and awaits the already-running observation where the RPC args are assembled. The `observeCapacity` dependency-injection contract is unchanged.
- `worker-transport-routing.server.ts` routes the negotiation-side default observation through the same retry wrapper under the `transport_negotiation` phase. Cohort and flag checks still run before any observation, so non-cohort users never trigger a capacity fetch.

## Regression coverage

- New retry-boundary tests: retry-after-failure returns the fresh open decision (exactly two fetches); an authoritative pressure closure never retries (exactly one fetch); two failed observations stay closed with exactly two fetches; fake timers prove the primary attempt aborts at 5,000 ms and the retry attempt at 2,500 ms.
- Focused Slice 15 suites: capacity, preparation, transport-decision, and all `/api/agent/v2` route tests — 8 files / 59 tests passing.
- Complete Agentic Chat web gate: 115 files / 979 tests passing.
- Touched-file ESLint and Prettier: passing. Whole-web `svelte-check`: 0 errors / 0 warnings.
- No database migration is required.

## Production safety state

`AGENTIC_CHAT_WORKER_ROUTING_ENABLED` is exact `false` on the aliased Ready deployment; the one-user cohort value is unchanged and verified byte-identical across the flip/revert cycle. The unauthenticated transport boundary returns 401 with `Cache-Control: private, no-store` and `Vary: Authorization`. Railway health and authenticated capacity return 200 with open evidence.

## Root-cause correction — canary attempt 4, 2026-08-05T21:47Z

With Slice 15 deployed (revision `769e9ee3d`, CI green) and routing exact `true`, a fourth controlled attempt failed closed with the same message and zero durable rows. This disproved the deadline hypothesis as the primary cause and forced the durable diagnosis the earlier incidents skipped: the admission RPC's per-user hard cap (`v_running_count >= 2` in `20260802020000_agentic_chat_worker_atomic_admission.sql`) counts `chat_turn_runs` in `queued`/`running` across **all execution modes**, and the cohort user held exactly **3 stale `legacy_sse` rows stuck in `running`** since 2026-04-15, 2026-04-25, and 2026-06-30 — the sweeper-absent artifacts the Phase 0 preflight explicitly flagged (56 platform-wide then, 57 now). Every worker admission for this user therefore returned `capacity_exceeded` / `max_running` deterministically, at 14:07Z, 20:56Z, and 21:47Z alike, while transport negotiation (which reads worker queue/provider/publisher evidence, not turn rows) kept selecting `worker_realtime`. The Slice 14/15 timeout, overlap, retry, and logging repairs were real hardening but not causal.

Two diagnostic gaps to carry forward: the route maps `max_running` to HTTP 429 and `pressure_closed` to 503, but no incident captured the status code or the RPC's returned `capacity_reason`/counters, which would have discriminated immediately; and the route's `capacity_exceeded` branch still logs nothing — the Slice 15 observation logs cover the web-side check only.

**Data repair (executed 2026-08-05 ~22:05Z):** all 57 stale `legacy_sse` rows in `status='running'` older than one hour (newest 137 hours, oldest 113 days) were marked terminal via service role with the legacy failure shape (`status='failed'`, `finished_reason='error'`, `finished_at`/`updated_at` stamped). A full pre-repair snapshot of every affected row is retained at the operator's scratchpad (`stale_legacy_running_snapshot_2026-08-05.json`). Post-repair verification: zero `queued`/`running` rows for the cohort user and platform-wide. No schema or RPC change was made; the cap itself is untouched.

**Follow-up decisions for the next slice:** (a) whether the admission cap should count only worker-mode turns, since legacy turns consume no worker slot — a hosted RPC revision; and (b) pulling the Phase 5 chat-specific stale-turn sweeper forward so stale legacy rows cannot re-accumulate and silently re-block admission; and (c) logging the RPC `capacity_reason` and counters in the route's `capacity_exceeded` branch.

## Canary attempt 5 — first durable worker turn, 2026-08-05T22:03Z

After the data repair, the controlled request crossed atomic admission for the first time: turn `3e838b9a-249a-415e-84ad-34a05a70a173` exists with `execution_mode='worker_realtime'`, generation 1, a dedicated `agentic_chat_turn` queue job claimed within one poll, and exactly one durable terminal `done` event (`status='failed'`, `failure_code='internal_cohort_rejected'`, zero usage, no assistant message). The admission, queue, claim, event, and terminal paths all behaved exactly as designed; no provider call was made.

The remaining blocker is configuration, not code: the worker's independent defense-in-depth cohort (`AGENTIC_CHAT_INTERNAL_USER_IDS` on Railway) does not contain the canary user's UUID, so `createAgenticChatConsumer` rejected the claim before execution. The Railway variable must be set to the exact cohort UUID and the worker restarted; then routing returns to `true` for one final controlled request. Routing was returned to exact `false` in the interim so cohort chat is not routed into deterministic worker rejection.

## Canary attempts 6–7 — cohort cleared, tool-side network window stalled, 2026-08-05T22:14Z–23:53Z

Attempt 6 (22:14Z) re-proved `internal_cohort_rejected` after a worker restart that did not carry the cohort value. After the user set `AGENTIC_CHAT_INTERNAL_USER_IDS` (worker restart 22:26:29Z) and routing returned to exact `true`, attempt 7 (turn `670b3163-2c1a-407d-9a84-980b88d42f32`, 23:53:27Z) progressed further than any prior attempt: admission, chat-queue claim in one poll, prompt snapshot, planning cue, and a correct `get_project_overview` tool call emitted at 23:53:35.5 — every step second-stamped by the Slice 12 lifecycle projection.

The original conclusion that round 2 streamed reasoning for the rest of the job was wrong. Direct OpenRouter generation evidence for `gen-1785974010-eHr9rIeEW7s26yDAzSeJ` shows the only provider request completed normally in about 4.3 seconds with `finish_reason=tool_calls`, `cancelled=false`, actual model `deepseek/deepseek-v4-flash-20260423`, provider `StreamLake`, and 21 native reasoning tokens. `llm_usage_logs` contains exactly that one successful request for the turn. No synthesis request was made.

Durable order localizes the stall after public `tool_call` and before the read-tool ledger row: the executor awaits the ontology read, then ledger persistence, then publishes `tool_result`, and only then starts synthesis. Exact Railway filters for the turn, correlation id, queue job, and provider tool-call id retained only the queue-start line; there is no historical boundary log that can honestly distinguish the ontology subquery from the immediately following ledger RPC. The proven failure region is therefore the **tool-side read/ledger network window**, not the provider.

The client-side 23 → 79 → 729 “actions” observation is also corrected. The badge counts `block.activities`, but the committed worker adapter deduplicates durable events by `event_id`, the SSE path deduplicates tool calls by provider call id, reconciliation polling is single-flight and terminal-aware, the turn has only six durable events, and it has no ledger row. The observed growth is not provider-stream evidence and was not reproducible from the durable/reconcile paths audited here. No speculative client change was made.

### Local repair and verification — 2026-08-06

The read gateway and the immediately following ledger persistence now each have a 30-second local deadline, compared with 539 ms for the prior successful overview in the same session. Deadline signals compose with the job/cancellation signal and are attached to every Supabase request in the project-status path and to the ledger RPC. Typed `read_tool_timeout` and `tool_execution_persist_timeout` failures recover as `transient_infra`, leaving the existing bounded durable retry/terminal policy authoritative.

Hung-read, hung-ledger, and executor-terminal regressions pass. Focused result: 3 worker files / 43 tests passed. Full results: worker 93 files / 765 tests passed (one opt-in workflow test skipped), shared-agent-ops 12 files / 60 tests passed, and worker check/build plus both package typechecks passed. No model, prompt, routing, cohort, tool scope, mutation, attachment, or concurrency setting changed.

The deploy also adds a best-effort, redacted structured Railway discriminator without changing the public stream. `event=agentic_chat_execution_boundary` records start/finish/failure for `read_op`, `ledger_persist`, and `tool_result_publish`, and records synthesis entry. It includes turn/queue/generation/provider-call identity, duration, and typed error metadata; it excludes tool arguments, results, and user content. A last event of `read_op:started` identifies the ontology read, while `read_op:finished` followed by `ledger_persist:started` identifies ledger persistence. Publication completion followed by `synthesis:started` moves the failure region into the provider path.

The production gate remains open until this repair is deployed and one new controlled read turn completes and passes the explicit-turn Slice 13 verifier. Deeper per-boundary lifecycle projection and provider execution hardening remain in `tasker/50`.

### Owner deployment handoff

Deploy the Task 49 worker and `@buildos/shared-agent-ops` changes together; there is no migration or configuration/model change in the repair. Keep routing exact `false` until the worker deployment is healthy. Then preserve the one-user cohort, change only routing to exact `true`, submit exactly one controlled project-read request, retain its canonical turn id, and run:

```bash
pnpm verify:agentic-chat-read-canary -- --turn-id <turn_run_id>
```

On success, record the deployment revision, turn id, verifier output, and worker log boundary below and close Task 49. On failure, return routing to exact `false` without a second request and retain the turn for diagnosis; filter Railway by the turn id or `agentic_chat_execution_boundary`. The typed timeout and last structured boundary distinguish `read_tool_timeout` from `tool_execution_persist_timeout` when the repaired boundary fires.

**Deployment revision:** pending  
**Canary turn id:** pending  
**Verifier result:** pending  
**Post-canary routing state:** pending

## Exact next gate

1. Push the Task 49 bounded tool-side repair; require GitHub CI to pass and the resulting production deployment (routing exact `false`) to be Ready and aliased.
2. Reconfirm the unauthenticated transport boundary and authenticated worker capacity.
3. Change only routing to exact `true`; keep the cohort at exactly one canonical internal user.
4. Submit one new controlled, text-only request in the established project session and retain its exact `turn_run_id`. Do not reuse any failed attempt as evidence.
5. Require exactly one `worker_realtime` row and a passing explicit-turn Slice 13 verifier; the new observation logs must show the admission-phase capacity outcome. On any failure, return routing to exact `false` without a second request.
6. Do not widen tools, users, provider rounds, mutations, attachments, or concurrency until the durable evidence is reviewed.
