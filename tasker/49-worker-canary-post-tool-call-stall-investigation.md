<!-- tasker/49-worker-canary-post-tool-call-stall-investigation.md -->

# 49 — Investigate the worker canary stall between tool call and tool completion

**Created:** 2026-08-06  
**Status:** Ready for owner deployment — failure window proven; bounded fix and regression verified locally; production canary pending  
**Mission:** Establish, with worker-log and provider-side evidence, exactly why production turn `670b3163-2c1a-407d-9a84-980b88d42f32` made no durable progress for 6m55s after emitting a correct `get_project_overview` tool call, then land the smallest fix that lets the Phase 3 read canary complete. Do not change the configured model as a first move; the "reasoning-heavy model burned its budget" hypothesis is **disproved as stated** (see below).

## Why this work exists

The Phase 3 production read canary (2026-08-05, attempt 7) got through every control-plane layer that previously blocked it — atomic admission, chat-queue claim, cohort, prompt snapshot — and then stalled. The stalled-turn sweeper finalized it honestly (`status='failed'`, `finished_reason='worker_interrupted'`, `failure_code='stale_context'`, `recovered_from_stall=true`). The investigation proves the tool-side read/ledger failure window, while the missing historical boundary log prevents a narrower subcall claim. The gate cannot close until one newly deployed canary completes. Full campaign evidence: `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_15_ADMISSION_CAPACITY_OVERLAP_PLAN_2026-08-05.md`.

## Established facts (durable records + code reading, 2026-08-06 ~00:30Z)

Timeline for turn `670b3163-2c1a-407d-9a84-980b88d42f32` (session `26fe15dc-…`, generation 1), all from `chat_turn_events`, `chat_turn_stream_state`, and the `agentic_chat_worker_lifecycle_observations` view:

| Time (Z)            | Fact                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| 23:53:27.06         | Turn created and claimed within ~6 ms; intent resolved; prepared-prompt cache miss                    |
| 23:53:34.99         | Planning cue emitted                                                                                  |
| 23:53:35.31         | Prompt snapshot created                                                                               |
| 23:53:35.54         | Public `tool_call` event: `get_project_overview`, correct project id, provider call id `call_402bfe…` |
| 23:53:35 → 00:00:30 | **No durable progress of any kind**                                                                   |
| 00:00:30.42         | Sweeper terminal `done` (failed / worker_interrupted / stale_context / recovered_from_stall)          |

Hard constraints these facts impose:

1. **Round 1 completed correctly.** The `read_tool` step in `readOnlyProvider.ts` is only yielded after the provider stream finishes with `finish_reason=tool_calls`, exactly one allowlisted accumulated call, and no mixed text. The model did its job.
2. **The synthesis round never produced anything.** `chat_turn_stream_state.assistant_text = ""`, `last_text_batch_id = null` — zero text deltas were ever durably flushed.
3. **The tool never completed.** No `tool_result` public event, no read-tool ledger row, `tool_call_count=0`.
4. **Reasoning deltas cannot explain client-side activity.** `readOnlyProvider.ts` drops `reasoning` events silently in both the read round and synthesis (`continue`); they are never published. The prior working theory ("model streamed reasoning for 7 minutes") is therefore unsupported for anything client-visible, and nothing durable shows reasoning volume either.
5. Configured bounds that did _not_ visibly fire mid-window: provider per-attempt timeout 90s (`DEFAULT_REQUEST_TIMEOUT_MS`, whole-attempt including stream), `max_tokens` 2,000, up to 4 provider routes, job `workerTimeoutMs` 360s, `stalledTimeoutMs` 420s.
6. The stall window sits between the yielded `read_tool` step and ledger persistence. `keepLeaseForSynthesis=true` means the provider lease was held across this window.
7. Before the repair, `apps/worker/src/workers/agentic-chat/readOnlyTool.ts` performed the ontology read between two cooperative `throwIfAborted(input.signal)` checks with **no deadline on the network call itself**; `toolExecution.ts` persisted via `persist_agentic_chat_read_tool_execution` RPC, likewise without an own deadline.

## Original client observation

During the stall, the client chat drawer's "actions" counter grew continuously (observed 23 → 79 → 729) while the worker published nothing durable. The audit below establishes what the counter counts and rules out the committed durable/reconcile path as its source. It remains a client observation to capture with build/version evidence if it recurs, not evidence of provider streaming and not a reason to change the client in this repair.

## Investigation result — 2026-08-06

### Provider and worker evidence

- The exact OpenRouter generation record for `gen-1785974010-eHr9rIeEW7s26yDAzSeJ` shows one successful streamed request, actual model `deepseek/deepseek-v4-flash-20260423`, provider `StreamLake`, `finish_reason=tool_calls`, `cancelled=false`, and about 4.3 seconds of generation time. The native response contained 21 reasoning tokens, not a multi-minute reasoning stream. No second request exists in `llm_usage_logs` for the turn. **H-C and H-D are disproved.**
- Exact Railway filters for the turn id, correlation id `fc890a20-a94a-460d-94e5-92561d6f97d2`, queue job id, and provider tool-call id returned only the queue processor's start line at `2026-08-05T23:53:32.549991885Z`. The active deployment was `e61cb974-7a2c-4c4b-a32f-008c39b7ba3d` at commit `408e2a45…`. There is no retained tool-boundary or worker-timeout log for the historical turn. That observability gap means the exact read subquery versus the immediately following ledger RPC cannot be recovered honestly from logs.
- Durable order plus provider evidence still names the failed region precisely: the executor committed `tool_call`, then entered `readTool.execute`, and never committed a read-tool ledger row. Ledger persistence is ordered after the ontology read and before `tool_result` publication and synthesis. The historical stall therefore occurred in the **tool-side read/ledger network window**, before synthesis.

### Abort and ordering trace

1. The queue's 360-second worker timeout aborts `job.signal`; the executor combines that with cancellation and publisher-overload signals.
2. The executor already races both the read-tool promise and ledger-persistence promise against the combined signal. The executor coroutine therefore does not remain pinned forever after the queue abort, although a network request that ignores the signal may continue underneath it. The original “abort fires into the void and pins the coroutine forever” wording was inaccurate.
3. Before this repair, neither tool-side operation had a local deadline. The ontology gateway did not receive an `AbortSignal`, its Supabase queries did not attach one, and the ledger RPC did not attach one. A request could therefore consume the entire job budget and leave terminal recovery to the queue timeout/sweeper.

### Client counter audit

- `ThinkingBlock.svelte` displays the count of `block.activities` entries. The worker UI adapter deduplicates durable semantic events by `event_id`, the SSE tool-call path deduplicates by provider tool-call id, and the realtime coordinator is single-flight (roughly 2-second changed / 5-second unchanged polling) and stops on terminal state.
- The session has only two historical `chat_tool_executions`; the failed canary has none. Its durable stream contains six events. The observed 23 → 79 → 729 count cannot be produced by the committed durable worker event path, reconcile appender, or session tool history found in this audit, and it is not evidence of provider streaming. No speculative client change is included. Reproduction with client build/version capture is deferred to `tasker/50` if the symptom recurs.

## Implemented repair

- Added a 30-second local deadline around `get_project_overview` execution and the read-tool ledger RPC. The previous successful overview in the same session completed in 539 ms, so this allows more than 55× its observed latency while staying far below the 360-second job budget.
- The deadline composes with the parent job/cancellation signal. The worker gateway carries the child signal into `ToolExecutionContext`; every Supabase request in the project-status path (actor resolution, project summaries including legacy fallback, status fan-out, and Start Here) attaches it with `.abortSignal(...)`. The ledger RPC attaches the same deadline signal.
- Read and ledger deadline errors are typed `transient_infra`, preserving bounded durable retry/recovery rather than misclassifying a network stall as a permanent model or prompt failure.
- Regression coverage deliberately hangs the read gateway and ledger promises. Both abort at the configured deadline; the executor integration proves a hung read produces executor-written/reconciled terminal truth within the configured test budget.
- The executor now emits redacted structured Railway boundary logs with `event=agentic_chat_execution_boundary` around `read_op`, `ledger_persist`, and `tool_result_publish`, plus `synthesis:started`. Records include turn/queue/generation/provider-call identity, state, duration, and typed failure metadata, but never tool arguments, results, or user content. Logging is best-effort and cannot fail or delay execution.

Local verification:

- `pnpm --filter @buildos/worker exec vitest run tests/agenticChatReadOnlyTool.test.ts tests/agenticChatToolExecution.test.ts tests/agenticChatFixtureTurnExecutor.test.ts` — 3 files / 43 tests passed.
- `pnpm --filter @buildos/worker test:run` — 93 files / 765 tests passed; one opt-in workflow file/test skipped.
- `pnpm --filter @buildos/worker check` and `pnpm --filter @buildos/worker build` — passed (pre-existing lint warnings only).
- `pnpm --filter @buildos/shared-agent-ops test:run` — 12 files / 60 tests passed.
- `pnpm --filter @buildos/worker typecheck` — passed.
- `pnpm --filter @buildos/shared-agent-ops typecheck` — passed.

## Hypotheses, ranked

- **H-A (confirmed failure class; exact subcall unavailable):** an unbounded tool-side Supabase request consumed the job window. The retained evidence localizes it to the ontology read or immediately following ledger RPC; missing boundary logs prevent a narrower historical claim.
- **H-B (disproved as originally stated):** the queue timeout does reach the executor. The real gap was the lack of a shorter tool deadline and lack of signal propagation into the Supabase requests.
- **H-C (disproved):** there was no synthesis provider request.
- **H-D (disproved):** the only provider request completed normally with `tool_calls` in seconds.

## Discriminating evidence to collect (in order)

1. Deploy this bounded repair without widening the cohort or changing the model.
2. Run exactly one new controlled read canary and retain the turn id.
3. Require terminal completion and run `pnpm verify:agentic-chat-read-canary -- --turn-id <uuid>`.
4. If it fails, use the new typed failure (`read_tool_timeout` or `tool_execution_persist_timeout`) plus durable order to identify which half of the window timed out; deeper lifecycle boundary logging remains `tasker/50` work.

## Owner deployment handoff

No migration, model change, prompt change, routing expansion, or cohort expansion is required. The deploy must include both the worker changes and the `@buildos/shared-agent-ops` source changes so the worker receives the propagated abort signal.

1. Deploy the repair while `AGENTIC_CHAT_WORKER_ROUTING_ENABLED` remains exact `false`; wait for the worker deployment to be healthy.
2. Confirm the worker's `AGENTIC_CHAT_INTERNAL_USER_IDS` remains exactly the single canonical canary user.
3. Change only routing to exact `true`, then submit one controlled read request in the established project session. Do not send a second request on failure.
4. Retain the new canonical `turn_run_id` and run:

    ```bash
    pnpm verify:agentic-chat-read-canary -- --turn-id <turn_run_id>
    ```

5. A pass requires one `worker_realtime` turn, durable read-tool ledger and `tool_result`, synthesis text, and a completed terminal event. Record the deployment revision, turn id, verifier output, and relevant worker log boundary in this task and the Slice 15 evidence record.
6. On any failure, return routing to exact `false`, retain the failed turn id, and use `read_tool_timeout` versus `tool_execution_persist_timeout` if present to localize the failing half of the window.

For Railway diagnosis, filter by the new turn id or `agentic_chat_execution_boundary`. The last boundary gives the exact region:

- `read_op:started` without a finish → ontology read.
- `read_op:finished` then `ledger_persist:started` without a finish → ledger RPC.
- `ledger_persist:finished` then `tool_result_publish:started` without a finish → durable/public result publication.
- `tool_result_publish:finished` then `synthesis:started` → synthesis/provider path.

## Exit gate

- [x] The failed region is named with durable, Railway, and provider evidence; the missing historical subcall boundary is explicitly recorded rather than inferred.
- [x] The smallest region-complete fix is implemented with hung-call regressions: a bounded deadline and actual AbortSignal wiring on every network call in the read/ledger window.
- [ ] One production read canary completes end-to-end and passes `pnpm verify:agentic-chat-read-canary -- --turn-id <uuid>`.
- [x] Findings are recorded here and in the Slice 15 evidence doc; deeper non-blocking hardening remains in `tasker/50`.
