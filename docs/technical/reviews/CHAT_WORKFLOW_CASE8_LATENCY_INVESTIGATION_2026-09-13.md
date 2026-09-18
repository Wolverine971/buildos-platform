<!-- docs/technical/reviews/CHAT_WORKFLOW_CASE8_LATENCY_INVESTIGATION_2026-09-13.md -->

# Case 8 latency investigation — 2026-09-13

**Latest result (September 14):** the authorized isolated rerun scored **45/52**
and failed. Case 8 r3 took 34.521s; Cases 9/10/14 also failed content or quality
after V4 fallback. Cases 2/4 and Case 14 time/read limits passed. Startup and final
provenance match. See the [full result and next repairs](CHAT_WORKFLOW_TASK90_GATE_RESULT_2026-09-14.md).

Historical status before that rerun: two repair gates retained, neither accepted. The first scored 52/52 but
exceeded Case 14's read limit. The second scored 44/52 during intermittent persistence
and admission delays; its Case 14 read counts passed. A final bounded review-wording
repair and gateway/intake diagnostics passed focused validation; full gate pending. The
investigation below describes the checkout before this repair; implementation and
validation follow at the end. The interrupted third gate was classified as host sleep
and OpenRouter credit exhaustion. A complete strict gate then ran on September 13
(final section). It scored 52/52 on behavior but was not accepted: two timing misses
driven by provider latency, one false revision request from the reviewer, and a commit
during the run that broke the final provenance check.

## Recommendation

**September 14 follow-up:** the provider and reviewer fixes are implemented with
392 passing focused tests, passing worker source/test types, and passing lint.
The [focused repair receipt](CHAT_WORKFLOW_TASK90_FOCUSED_REPAIRS_2026-09-14.md)
supersedes the pending-implementation recommendations below. DJ initially excluded
a full gate, then authorized the isolated rerun linked above. It failed; historical
evidence remains intact and no end-to-end acceptance is claimed.

Preserve Task 84's accepted-versus-delivered boundary. The next repair should remove
the serial wait for **usage accounting between model passes**, preserve an explicit
usage drain **before billing**, and instrument the remaining persistence waits. Then
reduce the redundant generic progress writes immediately before tool calls. Do not
make all durable acceptance asynchronous or spend extra model calls warming a cache.

Instrumentation alone would make another failure easier to explain; it would not
give Case 8 latency headroom. Conversely, removing the accounting wait alone cannot
promise a pass: subtracting about 4.7 seconds of excess from 34.76 seconds still leaves
approximately 30 seconds, and database delays may move to the next required write.

## Evidence checked

- Retained combined gate: `output/agentic-gate/chat-workflow-82-84-combined-2026-09-13/`.
- All three Case 8 turn artifacts, exact provider requests, and runtime timing logs.
- Read-only queries against the gate's isolated Supabase project
  `daudvqczjqxhpzstlfih`, identified from `.env.agentic-gate.local`.
- Database event/observation timestamps, usage rows, live persistence function
  definitions, and database deadlock statistics.
- Current provider, publisher, executor, accounting, and pending-effects code.

Privacy-safe database evidence is retained in
[`artifacts/chat-workflow-case8-investigation-2026-09-13.json`](../../../artifacts/chat-workflow-case8-investigation-2026-09-13.json).
It includes timestamps and lifecycle metadata, not document bodies or credentials.

## What failed

The original gate outcome is correct: behavior 52/52, all 45 turns passed their
behavior checks, but Case 8 repetition 2 took **34.759 seconds**, exceeding 30 seconds.
The three Case 8 executions have the same four model passes and three tool calls.
Acting calls used Venice; review calls used OpenAI. These providers were consistent
across the repetitions.

| Measurement                                  |    Rep 1 | Rep 2, failed |    Rep 3 |
| -------------------------------------------- | -------: | ------------: | -------: |
| Client total                                 | 22.310 s |      34.759 s | 17.431 s |
| Reviewer request to captured completion      |  4.289 s |       3.572 s |  3.357 s |
| Executor semantic-review envelope            |  4.412 s |       8.388 s |  3.488 s |
| Largest publisher enqueue-to-acceptance wait |  0.332 s |       6.074 s |  0.321 s |
| Reviewer completion to final model request   |  3.235 s |      14.504 s |  2.920 s |
| Final model request                          |  1.323 s |       2.677 s |  1.116 s |

The approximately 4.8 seconds of non-model time in the failed review envelope and
the 6.1-second publication wait are distinct intervals. They should not be confused
with the reviewer's 3.6-second model call or added again to the 14.5-second gap.

### Failed-turn timeline

Turn: `a8a055a2-14f6-48cb-bfd1-b75ed5618006`. Times are UTC on September 13.

| Time                     | Boundary                                             | Evidence                                          |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------- |
| 04:06:08.026             | Reviewer request starts                              | Usage receipt                                     |
| 04:06:11.594–11.598      | Reviewer capture completes; usage observation begins | Prompt capture and usage receipt                  |
| 04:06:12.311             | Usage row's database timestamp                       | `llm_usage_logs.created_at`                       |
| Approximately 04:06:16.4 | Reviewed decision reaches executor                   | Review-envelope duration plus request start       |
| 04:06:19.566             | Detached reviewer-end observation is timestamped     | `agentic_chat_execution_observations.observed_at` |
| 04:06:22.365             | Sequence 8, generic “Working…” event, is timestamped | `chat_turn_events.created_at`                     |
| 04:06:22.509             | Client observes sequence 8                           | Retained client event timing                      |
| 04:06:23.043–23.156      | Approval control tool executes                       | Execution observations                            |
| 04:06:23.589–25.974      | Document tool executes                               | Execution observations                            |
| 04:06:26.102             | Final model request starts                           | Usage receipt                                     |
| 04:06:28.779             | Final model completes                                | Usage receipt                                     |

The document adapter itself took 1.671 seconds; reserve, begin, and reconciliation
were each around 0.15–0.20 seconds. The long stall precedes the document mutation.

## The additional bottleneck: synchronous usage accounting

In `provider/openrouter-client.ts`, the successful provider path does
`await account('success', ...)` before yielding `done`. `account` awaits
`observeUsage`, which awaits the usage database write with a five-second deadline.
`streamBufferedProviderPass` releases the reviewed response only after that `done`.
Thus a slow accounting request delays authorization processing even after the
reviewer's response is complete.

This is intentional in the existing tests:
`awaits usage accounting before exposing the provider terminal event` holds the usage
promise and proves that `done` cannot escape until it resolves. Provider-attempt
observations already use the detached pending-effects registry instead.

The failed turn's roughly 4.8-second post-response interval is consistent with this
accounting wait, including local scheduling. There is no retained client span for
the exact usage-request return, so the full 4.8 seconds cannot be assigned exclusively
to SQL execution. The database's 04:06:12.311 row timestamp is **not** proof that the
HTTP caller received success then.

The bootstrap comment explains why accounting waits exist: terminal billing needs
committed current-turn usage. That requirement does not require every intermediate
model pass to wait for its usage save. It does require care when moving that wait:
both normal finalization and recovery currently evaluate consumption billing
**before** `drainPendingEffects`. Merely enqueueing usage into the existing registry
would introduce a billing race.

## What the database evidence resolves, and what it cannot

The slow publisher event can now be identified: sequence 8 is the generic
`agent_state` / “Working…” emitted immediately before the review control tool.
Its event timestamp is late, rather than being an early event delivered six seconds
later. The detached reviewer-end observation was also timestamped almost eight
seconds after provider completion, through a separate persistence path. This is
evidence of broader persistence/transport/lock delay in that interval; a publisher
retry alone does not explain both paths.

The live semantic and observation RPCs both acquire `FOR UPDATE` locks on the turn
and queue job. Their `clock_timestamp()` calls occur after acquiring those locks.
Consequently, `created_at` and `observed_at` are timestamps inside the transaction,
not transaction commit times, request start times, or HTTP completion times. They
cannot distinguish network delay, connection wait, lock wait, slow SQL, or a retry.

Database statistics reported zero deadlocks since August 25, before this run. A
Postgres-detected deadlock is therefore unsupported by that retained statistics
window; ordinary lock waits remain possible.

`persistence_retry` and `soft_pressure` metrics exist, but the composition root
does not wire `onMetric`. The aggregate `publisherQueueing` includes both queue wait
and persistence. Counters alone are insufficient: per-attempt durations and event
identity are needed to distinguish an idle queue, a slow RPC, and retry backoff.

## Cache and delivery corrections

The final call had **partial** cache reuse (4,324 tokens), not zero cache reuse.
In all three repetitions, the final acting request retains every message from the
preceding acting request as an exact prefix. Tools, model, provider settings,
`session_id`, and `prompt_cache_key` are also unchanged within each pair. There is
no demonstrated application prefix invalidation to repair. Cache residency or
upstream routing could explain the variance, but those mechanisms are not proven
by the captures. The 1.35-second final-call difference is secondary and cannot all
be causally assigned to caching from one observation.

The reported 81 ms delivery median uses
`terminalEventMs - responseHeadersMs - total_request_ms`. Those intervals overlap:
`total_request_ms` starts at database admission, before response headers. The
formula double-subtracts admission-to-headers time and even yields negative tails
in 12 of the 45 turns. It is a residual proxy, not literal delivery latency.

Using client terminal-observation wall time minus database `terminal_committed_at`
instead gives approximately **406 ms median, 677 ms p90, 1,354 ms maximum** for this
run; failed Case 8 is approximately **373 ms**, not 16 ms. These comparisons remain
subject to worker/client/database clock skew, and the terminal timestamp itself is
inside the transaction. A future exact metric should anchor both endpoints to a
documented clock boundary. Delivery is still far too small to explain this failure;
the exact magnitude of the earlier improvement needs the corrected calculation
applied to earlier runs too.

## Concrete repair sequence

1. **Move intermediate usage persistence off the provider completion boundary.**
   Keep synchronous validation, stable usage IDs, exact usage data, error reporting,
   and a tracked, bounded write lifetime. Drain usage before billing evaluation on
   success, cancellation, failure, and recovery, then preserve the terminal fence.
   Test delayed saves, failure, timeout, cancellation, idempotent accounting, and
   billing reading the current turn's committed rows. Avoid an untracked promise or
   a second unbounded telemetry queue. Timeout must not silently claim a successful
   accounting drain.
2. **Instrument that change set.** Wire publisher retry/pressure metrics and emit
   bounded structured spans for enqueue, attempt start/end, durable receipt, retry
   delay, pressure wait, and usage persistence. Include turn/generation, transition
   or sequence, event type, attempt number, RPC/status/SQLSTATE, queue depth, and
   duration; exclude prompts, document contents, credentials, and raw error bodies.
   Preserve these records with the gate evidence. Correct the delivery calculation.
3. **After that change set's gate, reduce redundant progress writes if headroom is
   still insufficient.** `streamMutationBatchReview` and
   `streamApprovedBatchExecution` both emit `buildPlanningStep` immediately before
   the executor emits a durable `tool_call` with its own current activity. Remove
   or consolidate those redundant generic states at the producer, retaining the
   review decision, tool-call boundary, effect ledger, and receipts. Do not make
   `accepted` resolve before persistence. Test stale ownership and failed persistence
   at the next required boundary, plus client progress/reconciliation behavior.
   Eliminating sequence 8 removes one avoidable wait, but does not prove a database
   stall will disappear rather than hit sequence 9.
4. **Validate each executable change set once with the required three-repetition
   `pnpm agentic:gate`.** Use deterministic delayed-write fault tests to establish
   the mechanism first. Keep the original failed scorecard, all four timing ceilings,
   and the 52/52 requirement. A passing rerun alone is not evidence of stable headroom.

If per-attempt traces show persistent shared-row lock waits, investigate the actual
blocking transaction before changing SQL lock strength, fencing, or schema. No such
SQL change is justified by this evidence alone.

## Validation performed

`test-gate run pnpm --filter @buildos/worker exec vitest run
tests/agenticChatOpenRouterClient.test.ts` — **80/80 passed**. This includes the
explicit accounting-wait test and the detached attempt-observation test; it validates
the investigated behavior, not a repair. An earlier filtered invocation failed
because the test-gate command wrapper reparsed the filter; the full file then ran.

Only this report, its metadata artifact, and a follow-up link in the prior review
were added by this investigation. Runtime code and existing uncommitted changes
were left as found. No full gate was run because no executable change set was made.

## Authorized repair — accounting and tracing

The provider client now snapshots and validates usage synchronously, then registers
its persistence promise in the existing bounded per-turn pending-effects registry.
Provider completion no longer waits for the usage HTTP response. Both normal
finalization and recovery join the registry before consumption billing, preserving
the existing terminal and effect-receipt boundaries. The usage write has its own
five-second deadline, independent of turn cancellation, and passes its abort signal
through the usage logger to the actual Supabase request. Stable usage IDs and
upsert behavior are unchanged.

Accounting retains the existing best-effort error policy: an unsuccessful write
does not erase a user's completed work. A settled promise does not mean the write
succeeded. Failure and timeout are explicitly reported through the existing error
reporter and the new structured `failed` / `timed_out` trace outcomes; billing waits
for settlement rather than being allowed to race an in-flight healthy save.

Publisher traces now distinguish queue residence, RPC attempts, retries, accepted
receipts, and pressure waits. Usage spans carry duration and outcome. The records
contain turn/generation and operation identities, event type, attempt, queue depth,
and whitelisted error codes; they omit payload bodies and processing tokens. Trace
sink failures cannot affect execution. Gate output now includes
`latency-analysis.json`, using the corrected terminal-observation estimate and
marking missing trace coverage as unknown rather than zero.

Focused validation:

- Provider client, composition, and bootstrap: **120/120 passed**.
- Turn executor, stream publisher, and pending effects: **131/131 passed**.
- Shared usage logger: **7/7 passed**.
- Worker typecheck passed; worker test type debt remains **0/0**.
- Shared smart-LLM package build passed.
- The report was checked against a temporary copy of all 45 original artifacts:
  approximately **407 ms median, 678 ms p90, 1,355 ms maximum** terminal-observation
  estimate; absent historical retry traces remain unknown.

Fault coverage holds usage persistence open through provider completion and proves
that billing waits on completion, failure, and cancellation. A cancellation/timeout
test proves the independent deadline and transport abort. Publisher fault coverage
records a slow rejected RPC, retry backoff, successful second attempt, and pressure
relief while proving there is no early durable acceptance, even with a throwing
trace sink.

The first gate invocation stopped at setup with sandbox network access unavailable
and ran no product turns. Its record is preserved at
`output/agentic-gate/chat-workflow-case8-accounting-2026-09-13/`. The full network-enabled
run is `output/agentic-gate/chat-workflow-case8-accounting-network-2026-09-13/`.
No executable source changes are being stacked while that run is active.

### First repair gate outcome

The full accounting/tracing gate **failed acceptance**, despite **52/52** behavior,
all 45 turns passing their answer checks, all timing limits passing, and exact
web/worker/checkout provenance. Its sole failure was Case 14 repetition 2: **11
tool calls against the maximum of eight**. This is a retained failure, not a pass.

| Case |              Rep 1 |               Rep 2 |              Rep 3 | Required        |
| ---- | -----------------: | ------------------: | -----------------: | --------------- |
| 2    |           38.811 s |            45.071 s |           48.353 s | <60 s           |
| 4    |           22.317 s |            20.716 s |           19.008 s | <30 s           |
| 8    |           29.210 s |            24.554 s |           28.436 s | <30 s           |
| 14   | 18.908 s / 6 calls | 30.733 s / 11 calls | 23.591 s / 6 calls | <40 s; ≤8 calls |

The new report retained **2,440 trace records**, **zero publisher retries**, and
**zero failed or timed-out usage saves**. Several multi-second waits were single
requests: Case 8 repetition 3 had a **4.066-second tool-result persistence attempt**.
That separates the application's retry delay from request latency, but does not
separate transport, connection, row-lock, and SQL execution time inside a request.
The original historical six-second request remains unclassifiable retroactively.

Live overlap proof: in Case 4 repetition 2, reviewer usage persistence started at
14:54:25.837 UTC and took **2.428 seconds**. The next semantic step was enqueued at
14:54:25.839 and accepted at 14:54:26.393, before accounting finished at
14:54:28.265. This confirms the removed serial dependency independently of whether
a particular stochastic gate run passes. A separate local cancellation probe also
confirmed billing waited for the interrupted request's usage write.

Case 8 repetition 1's remaining approximately 4.9 seconds from provider finish to
terminal-call start included a 1.26-second publisher drain, domain-capture work,
a 767-ms finalizing-event save, and further terminal delivery/accounting work.
Its usage save itself took only 120 ms. The remaining timing is not all accounting
and is not all database execution. Acting passes used Novita in this run, rather
than Venice in the original comparison; end-to-end deltas are not a controlled
estimate of code-only speedup. The corrected terminal-observation estimate was
**416 ms median, 761 ms p90, 2,315 ms maximum**.

### Second repair change set

Case 8's 790-ms worst-case margin was insufficient, so the planned producer change
removes the two generic `Working...` semantic events immediately before review
approval and approved batch execution. Review-start visibility remains. The next
event is the executor's durable `tool_call`, which still must be accepted before
running the tool; effect reservation, mutation receipts, and terminal truth are
unchanged.

The new Case 14 failure was investigated before changing its policy. Its first
six-call batch loaded the marketing document and completed scoped permit, invoice,
payment, revision, and construction searches. The next five calls reopened two
tasks already represented in loaded context and searched related spending,
inspection, and change-order terms. Initial instructions already told the model
to stop; the context-gathering ledger remained `open` because the first batch added
new IDs and its count floor did not narrow until three read rounds.

The ledger now emits its existing **narrowing** signal after multiple distinct
searches explicitly report complete coverage. The continuation reminder asks for
brief status synthesis from loaded facts, scoped unknowns, and completed searches.
It retains tools for a specific missing fact or a dependent content projection;
it does not impose a global eight-call cutoff or infer a request type from fixture
names. Failed, partial, unknown, truncated, duplicate-only, and research coverage
do not trigger this new breadth condition. Existing hard limits and gate scoring
remain unchanged. This is model guidance, not a mathematical guarantee that a
model will obey the eight-call expectation; the full gate remains mandatory.

Focused validation for this change set passed: 259 worker tests, 13 shared-ledger
tests, and 95 web progress/session tests (367 total), plus runtime and worker source
typechecks and the worker test-type baseline (0/0).

### Second repair gate outcome

`output/agentic-gate/chat-workflow-case8-progress-2026-09-13/` ran all 45 turns from
15:18–15:48 UTC with verified web/worker/checkout provenance
(`8a0d3e4824160fa327dbd77fd1510f9de823697170d91859db64a7f4ecafce78`).
It **failed**, scoring **44/52**, with 43/45 behavioral checks passing. Case 10
repetition 2 and Case 13 repetition 1 failed at a required read-tool ownership
checkpoint before their next tool executed; the matching executions lasted the
10-second overhead budget and were classified `unknown`. Do not describe this
as a calendar API failure: the initial calendar reads completed successfully.

| Case |              Rep 1 |              Rep 2 |              Rep 3 | Required        |
| ---- | -----------------: | -----------------: | -----------------: | --------------- |
| 2    |           43.290 s |           49.081 s |           65.466 s | <60 s           |
| 4    |           16.573 s |           21.105 s |           31.512 s | <30 s           |
| 8    |           26.460 s |           98.280 s |           23.680 s | <30 s           |
| 14   | 38.316 s / 4 calls | 47.383 s / 5 calls | 42.075 s / 5 calls | <40 s; ≤8 calls |

The 2,206 persistence traces show **zero publisher retries** and **six timed-out
usage saves**. Distinct failure mechanisms:

- **Case 2:** the reviewer rejected five correct prerequisite creates because the
  requested dependency links were absent, even though the IDs needed for those
  links did not exist yet. The acting model re-proposed identical argument values
  (only JSON key order changed). The wasted repair and second review consumed
  11.316 seconds of model time. No approval was bypassed.
- **Case 4:** 14.669 seconds elapsed before admission; worker admission-to-terminal
  time was 16.315 seconds. Web logs identify a 14.686-second `/turns` request,
  including a 1.136-second user lookup. The existing endpoint timing header was
  not retained, so its preparation-versus-admission split cannot be recovered.
- **Case 8:** the 98-second turn had a 10.366-second single persistence request
  followed by a 26.295-second document read. Its valid review rejection also
  prevented an uncommissioned description change; that review must be preserved.
- **Case 14:** read counts passed in all three repetitions. Repetition 2 spent
  24.131 seconds between provider finish and the terminal call, so the remaining
  latency failure was not caused by an extra five-read exploration batch.

Read-only QA checks found zero recorded deadlocks. The installed PostgREST client
issues a single fetch per request; there is no hidden SDK retry loop on this path.
The largest aggregate SQL execution time for the semantic persistence RPC was
6.613 seconds, below the observed 10.366-second application request; therefore
the request cannot be attributed entirely to that SQL statement. The event's
database timestamp was 15:33:38.666 UTC, versus request start 15:33:28.851 and
receipt 15:33:39.217. This still does not separate ingress, connection acquisition,
lock wait, and transport. Aggregate statistics are not per-request traces.

Fresh read-only QA health/empty-result probes later took 22–195 ms; a separate
response exposed `x-envoy-upstream-service-time: 1228` and an `sb-request-id`.
These measurements show intermittent behavior, not a proven infrastructure cause.
A later database activity snapshot had six idle PostgREST connections and no
blocked client backends; that snapshot cannot rule out earlier contention.

### Third change set and diagnostic boundaries

The review prompt now starts with the executable-stage boundary and removes the
ambiguous claim that nothing is proposed afterwards. A correct prerequisite create
can precede links that need its returned IDs; later calls still receive independent
review. Exact argument checks and rejection of uncommissioned fields remain.

The gate alone preloads a metadata-only HTTP tracer for the isolated QA REST/auth
origin. It records application response-header wait, the gateway's upstream service
duration and attempt count, request ID, and process event-loop utilization. It
does not inspect bodies, query values, credentials, or cookies, and does not change
responses, cancellation, retries, or deadlines. Gateway time is not SQL time. The
[Envoy header definition](https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/router_filter#x-envoy-upstream-service-time)
includes upstream processing and the network between Envoy and that upstream; it
does not isolate database execution or the client-to-gateway path.
The harness also retains existing intake `Server-Timing` headers and request
offsets. All intake remains inside the original total duration. The analyzer can
join a failed turn using its durable event identity even when usage persistence
failed, and missing terminal observations remain unknown.

Focused validation passed: **137 worker tests, 16 harness tests, and four diagnostic
tests**. The first version of the new harness fixture omitted the required transport
envelope `success: true`; correcting the fixture made its timing-boundary test pass.
Five optional standalone reviewer probes were **not run**: automatic approval review
rejected resending retained project data to an external model. Validation continues
through local tests and the authorized full gate using freshly seeded QA fixtures.

### Testing stopped and handed off

The user requested that testing stop and a task be written for another agent.
The third gate was terminated and its remaining worker cleaned up. No further
tests were started. [Task 90’s closeout](CHAT_WORKFLOW_TASK90_CLOSEOUT_2026-09-14.md)
preserves that handoff history, completed checks, source provenance, and failure
identities. Tasks 82/84 remain unaccepted.

`output/agentic-gate/chat-workflow-case8-final-2026-09-13/` retains **35 of 45**
turn records, startup provenance, logs, provider captures, and the latency report.
No scorecard was produced; `gate.json` reports failed with a missing-scorecard
error and finished at **16:35:54.896 UTC**. The original artifacts are preserved.

Cases 2 and 4 passed their retained timing and behavior checks. Case 8 took
22.503 / 1,775.255 / 35.809 seconds, with correct document results. Its second
repetition spans a roughly 29-minute interval in which both web and worker HTTP
requests remained unresolved, with no response status or upstream timing. Host
suspension/connectivity and cancellation require investigation before attributing
that interval to application or database latency. Subsequent queue waits were
12.547 and 15.757 seconds. Case 10 repetitions 1 and 2 retained
`provider_stream_error`; their relationship to the stop window remains unclassified.
Case 14 was not reached. These are partial observations, not a passing gate.

### Partial third gate classified (Task 90, step 1)

This classification used the retained evidence plus host power logs on September 13,
around 23:10 UTC. **No product failure was demonstrated.** Details are in
`output/agentic-gate/chat-workflow-case8-final-2026-09-13/classification-2026-09-13.json`.
Original artifacts are unchanged, and no scorecard was created.

- **Case 8 repetition 2: host sleep.** macOS `pmset` logged `Entering Sleep state due
to 'Idle Sleep'` at 16:04:08 UTC, on battery, 0.7 seconds before the client started
  the turn (16:04:08.732). Dark wakes followed at 16:20:40 (2 s) and 16:30:54 (10 s),
  and full user wake came at 16:32:37. The worker's `claim_pending_jobs` request started
  at 16:04:10.213 and ended without status at 16:33:19.438. A web `/rest/v1/users`
  request that started at 16:04:10.205 returned at the 16:20:40 dark wake. Admission
  was at 16:33:20.086. The 1,775 seconds were suspended host time, not application,
  gateway, or SQL latency.
- **Harness overlap after wake.** Each scenario test has a 450-second Vitest timeout.
  Case 9 repetition 1 (`01436473-fd63-4d1c-9c29-aec56b7d6360`) began intake at
  16:30:58.760, during the second dark wake, while Case 8 repetitions 2 and 3 were
  still unresolved. This fits overdue test timeouts firing on dark wake while the
  timed-out tests' turns kept running. It is not directly proven, because the battery
  log was truncated at shutdown. The worker then ran the same user's backlog one turn
  at a time. First events: Case 9 r1 at 16:33:21.964, Case 8 r2 at 16:33:33.193,
  Case 8 r3 at 16:33:44.945.
- **Case 8 repetition 3: contaminated sample.** Its 15.757-second queue wait was that
  backlog, so the 35.809-second client time does not measure the repair. Repetition 2's
  12.547-second wait sat behind Case 9 r1. Case 9 r1's 153-second and 31-second turns
  are contaminated too, though Case 9 has no ceiling.
- **Case 10 repetitions 1 and 2: OpenRouter credits exhausted.** Both round-2 acting
  calls got HTTP 402 when the stream started, at 16:35:26.713 and 16:35:41.700: "This
  request would exceed your available credits given your current in-flight requests."
  Round-1 calls and calendar reads succeeded. The worker's SIGTERM came after 16:35:53,
  about 27 and 12 seconds later, so the stop did not cause these failures. The account
  now shows 150.00 credits and 150.09 used. The runtime recorded both failures as
  `provider_stream_error` / `unknown` / `permanent`. That correctly marks them failed
  but hides the billing cause, including from users.
- **Case 2: no false prerequisite rejection.** All six Case 2 review passes, like all
  15 review passes in the partial run, called `approve_mutation_batch_review`. Every
  repetition ran acting → review → acting → review → acting with 10 tool calls.
- **Provenance recheck.** The checkout still hashes to Git `c3247622…` and executable
  tree `9c52001b…`, identical to the partial gate's startup. `scripts/agentic/gate.ts`
  was last changed at 15:52:14 UTC, before that gate started.

**Blocker:** the fresh strict gate (step 3) cannot run until OpenRouter credits are
added. The gate env and the root, web, and worker local env files all use the same
key. Product model spend was about $0.26 for the 35 retained turns, roughly
$0.33–0.34 per complete gate before judge calls. Run it on AC power under `caffeinate`:
the September 13 stall began with idle sleep on battery.

Two residuals were not repaired here. First, a 402 credit failure shows up as a
generic stream error. Second, a timed-out scenario test does not cancel its in-flight
turn, so later scenarios can overlap it. The second only distorts diagnosis of a run
that has already failed. Neither changes this change set's acceptance criteria.

### Complete strict gate after credits (Task 90, steps 3–4)

`output/agentic-gate/chat-workflow-82-84-resume-20260913T232548Z/` ran from 23:25:48 to
23:48:37 UTC under `caffeinate`, with no host sleep. Behavior and evidence were complete:
**52/52**, all 45 turns passed their checks, Case 10 passed all three repetitions, and
product model spend was $0.36. It **failed acceptance** on two independent grounds.
The classification is `classification.json` in that directory.

| Case |            Rep 1 |            Rep 2 |            Rep 3 | Required        |
| ---- | ---------------: | ---------------: | ---------------: | --------------- |
| 2    |      **115.7 s** |           46.5 s |           44.3 s | <60 s           |
| 4    |           23.0 s |           28.5 s |       **33.7 s** | <30 s           |
| 8    |           19.0 s |           29.4 s |           22.7 s | <30 s           |
| 14   | 12.9 s / 5 calls | 24.8 s / 5 calls | 24.3 s / 5 calls | <40 s; ≤8 calls |

- **Final provenance mismatch.** At startup, web and worker provenance matched
  `c3247622…` / `9c52001b…`. Commit `199a6ba44` then landed in the shared checkout at
  23:42:25 UTC, during Case 14. It touched 112 files, including this change set's usage
  logger, context-gathering ledger, and gate files. The final check read `199a6ba44…` /
  `81b22349…`. The services do not reload, so the samples reflect the startup tree, but
  strict acceptance cannot pass.
- **Case 2 repetition 1 (115.7 s): three stacked causes.**
    1. Modal served the first acting pass. It opened in 1.0 s, then streamed 1,253 tokens
       at 21.6 tokens/s over 58.1 s.
    2. The reviewer requested a revision whose reason contradicts itself: "high … defined
       as priority 2, but the proposed call uses priority 2?" The five creates were correct.
       This is a new false rejection, distinct from the prerequisite-stage case the third
       change set fixed.
    3. The first repair attempt hit the 10 s response-headers timeout before its fallback
       succeeded.

    Even without the second and third causes, the Modal pass alone breaks the limit.

- **Case 4 repetition 3 (33.7 s): provider throughput.** Both acting passes went to
  Novita, at 38.8 and 23.8 tokens/s (10.3 s and 8.6 s), against its usual 3.1 s median.
  The review approved on the first pass, and non-model time was normal. The V4.1 route's
  `sort: throughput` disables the warm-provider pin, so the two routing choices were
  independent.
- **Near misses.** Case 4 repetition 2 (28.5 s) lost 10 s to a response-headers timeout.
  Case 8 repetition 2 (29.4 s) spent 2.28 s on the required durable `tool_call` acceptance.
  In the same second, four unrelated requests also took 1.0–3.0 s; everything afterwards
  returned in 100–270 ms. The evidence cannot separate shared QA database or gateway
  pressure from lock contention with the cancellation-observation RPC.
- **Stalls.** This gate hit the response-headers timeout four times. Across all retained
  captures, 1,275 successful acting responses opened at p99 3.18 s, p99.9 7.29 s and a
  maximum of 9.76 s. Five took longer than 5 s.

**Demonstrated:** the accounting, progress, and review-wording repairs hold behaviorally.
Behavior scored 52/52, and every repetition of Cases 8 and 14 stayed within its limits,
including Case 14's read-call limit.

**Not demonstrated:** stable latency headroom. Upstream provider throughput and stalls
dominate the remaining misses, plus one new false revision from the reviewer.

No threshold was loosened, and no source was changed during or after this run.

#### Supporting evidence from the complete gate

- **Models and spend.** Acting passes ran on `deepseek/deepseek-v4.1-flash`, with
  `deepseek/deepseek-v4-flash` as the fallback. The reviewer was `openai/gpt-5.6-luna`.
  The quality judge chain is Luna, then `moonshotai/kimi-k3`, then `x-ai/grok-4.6`. No
  GPT-6 Astra call exists on the gate path. DJ's standing instruction for this work is to
  use the cheaper models only. Product model spend was $0.36; judge calls add roughly
  $0.15 per complete gate, based on the earlier complete gate. OpenRouter credits were
  raised to $170 before this run.
- **Which turns hit the response-headers timeout.** Case 2 r1 (repair), Case 4 r2
  (update and follow-up turns), and Case 5 r2. None of these opened a response. The
  timeout can't name a provider when the route uses `sort`.
- **Acting-pass latency by provider** (all retained gates, successful acting, repair,
  and final passes):

    | Provider | Passes | Median |    Max | Median tokens/s |
    | -------- | -----: | -----: | -----: | --------------: |
    | Novita   |  1,175 |  3.1 s | 14.7 s |             140 |
    | Venice   |    124 |  2.4 s | 14.7 s |             142 |
    | GMICloud |     20 |  5.5 s |  8.8 s |             143 |
    | Modal    |      6 |  7.2 s | 58.1 s |              92 |
    | Wafer    |      4 |  4.8 s |  6.0 s |             143 |

    Modal's sample is small. It is still the only provider with a pass slower than 15 s.

- **OpenRouter endpoint snapshot, about 23:55 UTC.** The public endpoints API returned no
  latency or throughput figures for this model. Thirty-minute uptime was: Fireworks
  78.6%, Together 94.5%, Modal 95.1%, Venice 95.9%, DeepInfra 95.5%, Novita and Wafer
  about 100%. This is context for the stalls, not proof of their cause.
- **Delivery.** The terminal-observation estimate over 45 turns was **409 ms median,
  875 ms p90, 2,207 ms max**, from 2,246 persistence traces and 5,628 HTTP traces. The
  largest gateway upstream time was 6,925 ms. Delivery did not cause any miss.
- **Routing options that were evaluated but not built.** OpenRouter supports soft
  `preferred_min_throughput` and `preferred_max_latency` preferences, with percentile
  cutoffs over a rolling five-minute window. Endpoints that miss them move to the end of
  the list; they are not excluded
  ([provider routing](https://openrouter.ai/docs/features/provider-routing)).
  `validateProviderRouting` in `provider/openrouter-client.ts` whitelists routing
  fields, so either preference would need support there. With `sort: throughput`, the
  warm-provider pin never applies (`applyTurnRouteHealth`).
