<!-- tasker/49-worker-canary-post-tool-call-stall-investigation.md -->

# 49 — Investigate the worker canary stall between tool call and tool completion

**Created:** 2026-08-06  
**Status:** ✅ **CLOSED — CANARY 11 PASSED 2026-08-07 00:56–00:57Z.** Turn `9e54c04b-eb21-4ea4-9c8d-37b07ba496ee` completed end-to-end in 83 s with an executor-written terminal (`completed/stop`), and `pnpm verify:agentic-chat-read-canary` returns **PASS** against the full durable-evidence contract. Routing returned to exact `false` afterward. See "Canary 11 result" below.  
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

## Canary 8 result — 2026-08-06 21:29Z (turn `f729f360-3b13-439f-a94c-06f16238b7eb`)

Owner deployment executed per the handoff: taskers 49+50 code deployed (commit `dfb69d844`, worker healthy 20:19:31Z), hosted migration `20260806010000` applied, routing flipped to exact `true`, one controlled read request sent in session `26fe15dc` at 21:29:30Z. **Turn failed; routing returned to exact `false` immediately after (rollback redeploy `build-qbsufm9ku`).** Verifier output retained: 19 assertion failures, `usageEvidence: invalid`, `toolExecutionCount: 0`.

**The Slice 16 observation ledger worked exactly as designed and named the failure in one query:**

| Boundary (private ledger) | Time (Z)    | Detail                                                         |
| ------------------------- | ----------- | -------------------------------------------------------------- |
| provider_attempt_started  | 21:29:32.66 | round=initial, openrouter, deepseek-v4-flash                   |
| provider_attempt_ended    | 21:29:35.75 | success, 3,091 ms, finish=tool_calls, 6,377 tokens, StreamLake |
| tool_execution_started    | 21:29:36.76 | get_project_overview, `call_67360a91…`                         |
| tool_execution_ended      | 21:29:37.56 | **status=failure, error_code=23514, 801 ms**                   |
| (sweeper terminal)        | 21:36:32.91 | failed / worker_interrupted / stale_context — 422 s occupation |

**Root cause (D1):** production carries a pre-migration constraint `chat_tool_executions_tool_category_check` restricting `tool_category` to `('list','detail','action','calendar','ontology','ontology_action','utility','web_research','buildos_docs')`. `readOnlyTool.ts` sent `toolCategory: 'project_read'`, so `persist_agentic_chat_read_tool_execution`'s INSERT raised 23514 in ~800 ms. Every local gate passed because the constraint exists only in prod: it predates `supabase/migrations/`, the disposable fixture's `chat_tool_executions` had no category CHECK, the ledger SQL test passes NULL categories, and the RPC validates category only as trimmed/≤128 chars. The read itself (ontology fetch) succeeded — tasker 49's 30 s deadlines were not the failing element. This also reinterprets attempt 7: identical durable signature (tool_call event, no ledger row, no tool_result, sweeper terminal), so the 2026-08-05 stall was very plausibly this same fast 23514, not a network hang.

**Fix landed locally (uncommitted):** `readOnlyTool.ts` now sends `'utility'` — the category legacy SSE persisted for all 141 historical `get_project_overview` rows; the prod constraint is now mirrored into `supabase/tests/fixtures/agentic_chat_legacy_atomic_admission_base.sql`; worker test expectations updated. Gates: worker 769 passed / 1 intentional skip, worker typecheck clean, web agentic-chat-v2 105 files / 864 tests incl. all disposable PostgreSQL compositions.

**Open defect (D2, moved to tasker/50 W3):** after the ledger throw at 21:29:37.56, the executor never wrote a terminal — the 150 s provider budget produced no executor-written failure and the sweeper cleaned up at 422 s, occupying the single chat slot the whole time. Slice 16's "no failure path exceeds budget + bounded overhead" exit gate is NOT met in production. Candidate mechanisms: provider-generator cleanup hanging between the read-tool throw and the outer catch (not signal-abortable), or `recover()`'s catch swallowing a failed recovery RPC into `recovery_required` with no terminal write. Discriminator: Railway `agentic_chat_execution_boundary` logs for 21:29:37–21:36:33Z — `ledger_persist:failed` should exist; whatever does or does not follow it names the wedge.

## Canary 10 result — 2026-08-06 23:40Z (turn `1422ffc3-afa4-4478-b6d9-8d9439fbeb13`)

Fix commit `715eed577` deployed (worker restart 23:18:11Z); routing flipped true (deployment `build-3wqlxgq6n`); exact canary text sent at 23:40:00Z. (Canary 9 at 23:29Z was consumed by an operator error: the flag-carrying Vercel redeploy had silently not run — `vercel ls` prints to stderr, so the URL capture was empty — and the turn admitted `legacy_sse` and completed normally. Lesson: verify a NEW deployment exists after every flag change before sending.)

**Canary 10 got further than any turn ever:** admission → claim → prompt → provider round 1 (3.5 s, `tool_calls`) → tool execution success (725 ms) → **ledger row persisted with `tool_category='utility'` (canary 8's fix verified live)** → public `tool_result` (seq 6) → synthesis started → 58.5 s clean synthesis (`finish_reason=stop`, 320 completion tokens) → all 1,344 chars durably streamed (sequences 7–117) → `finalizing` lifecycle event persisted (seq 118, 23:41:07.357).

**Then the last step failed and was swallowed.** Supabase edge + Postgres logs (Management API `logs.all`, timestamps exact):

| Time (Z)        | Call                                                      | Result                                                                                   |
| --------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 23:41:07.639    | `finalize_agentic_chat_turn_with_terminal_events`         | **HTTP 400** — Postgres `agentic_chat_terminal_events_finalize_timing_evidence_mismatch` |
| 23:48:11.6–12.0 | sweeper: recover → `finalize_agentic_chat_turn` → recover | 200s — honest `failed/worker_interrupted/stale_context` terminal                         |

**D2a — executor swallow (fix is worker-code, small):** `fixtureTurnExecutor.finalize()`'s `catch { return result('recovery_required') }` (and `recover()`'s identical catch) swallow the RPC error with no logging, no retry-without-timing, no fallback terminal, no queue reconciliation. The turn and its `CHAT_CONCURRENCY=1` slot sat for 420 s until the sweeper. `buildTimingDraft`'s own comment says timing is optional observability that "must never fail the user turn" — but the rejection happens DB-side after a draft was built, and there is no retry with `timingDraft: null`.

**D2b — timing validator contract bug (deterministic for EVERY streamed worker turn):** migration `20260804000120` computes first-response evidence as `min(created_at) FILTER (WHERE event_type = 'text_delta')` over `chat_turn_events`. Worker text batches consume sequence numbers but write to `chat_turn_stream_state` — canary 10 has NO `text_delta` rows in `chat_turn_events` (verified: sequences jump 6 → 118). The DB therefore sees `first_response_at IS NULL` and requires the draft to omit response timings; the tracker truthfully includes them; the validator raises. Decision needed: fix the validator's evidence source (hosted migration) or suppress response timings in the draft (worker code). Timing-optional retry (D2a fix) unblocks the canary either way.

**Also observed in the same window (separate defects, evidence in edge logs):**

- The browser reconciliation loop ran at ~3 calls/second for the full 7-minute window — 1,314 `reconcile_agentic_chat_turn` calls (plus ~1,025 each `ensure_actor_for_user`/`current_actor_has_project_member_access`). The documented cadence is single-flight 2 s/5 s. This is almost certainly the mechanism behind the "actions counter 23→79→729" observation from attempt 7.
- `log_client_error` returned 400 six times at 23:40:58–23:41:05 — Postgres `invalid input syntax for type inet` (client-error logging passes a malformed value into an inet column), so client errors during canaries are being dropped.

**Diagnosis access discovered this session:** Supabase Management API with the CLI keyring token answers both catalog and log questions in seconds — `POST /v1/projects/{ref}/database/query` for read-only SQL; `GET /v1/projects/{ref}/analytics/endpoints/logs.all` with `iso_timestamp_start/end` + BigQuery-style SQL over `edge_logs`/`postgres_logs`. This replaced hours of Railway forensics.

## Canary 11 result — 2026-08-07 00:56Z (turn `9e54c04b-eb21-4ea4-9c8d-37b07ba496ee`) — **PASS**

Deployment: fix commit `6d12e043e` (worker restart 00:37:54Z), hosted migrations `20260806020000` + `20260806021000` applied via the Management API with 8/8 post-apply verifications (validator/flush/claim prosrc, timing column, `agentic_chat_epoch_ms`, `safe_inet` behavior probe) and ledger-recorded; routing flipped on deployment `build-skwklif5h` (verified NEW and Ready before sending — the canary-9 lesson).

End-to-end timeline, all executor-written: admission 00:56:31.87 → provider round 1 success (5.6 s, `tool_calls`) → tool success 792 ms → **ledger row `tool_category='utility'`** → `tool_result` public event → synthesis started 00:56:42 → **`chat_turn_stream_state.first_text_persisted_at` stamped 00:56:46.55 (new evidence working live)** → 1,900+ chars streamed → finalizing → **terminal `completed/stop` at 00:57:54.46, 83 s total, no sweeper involvement**. The persisted timing event carries the complete phase set including `time_to_first_response_ms=14680` and `response_generation_ms=67487` — the timing draft was ACCEPTED by the repaired validator on the first finalize attempt (no strip-retry needed; D2a remains an untriggered safety net). Assistant message linked; queue job cleanly completed; 16/16 lifecycle observations.

Verifier: **PASS** after an instrument-contract update it forced honestly — the script still pinned three pre-repair contracts (`tool_category='project_read'`, 10 lifecycle observations pre-Slice-16, and contiguous public event sequences, which text batches have never satisfied — the same wrong assumption the DB validator had). Updated in `scripts/lib/agentic-chat-read-canary.ts` with the 16-row lifecycle list captured from this turn.

Reconcile behavior during the pass: 43 calls over ~85 s ≈ the documented 2 s changed-cadence, stopping at terminal — no runaway when a turn terminates promptly (the canary-10 3/s runaway correlates with the dangling-turn state; `reason=` instrumentation stays armed). Minor client-render residuals observed and NOT blocking: post-terminal "BuildOS is thinking" banner and a thoughts panel counting ~17 actions with duplicated planning/tool lines.

## Exit gate

- [x] The failed region is named with durable, Railway, and provider evidence; the missing historical subcall boundary is explicitly recorded rather than inferred.
- [x] The smallest region-complete fix is implemented with hung-call regressions: a bounded deadline and actual AbortSignal wiring on every network call in the read/ledger window.
- [x] One production read canary completes end-to-end and passes `pnpm verify:agentic-chat-read-canary -- --turn-id <uuid>`. (**Canary 11, turn `9e54c04b`, PASS.**)
- [x] Findings are recorded here and in the Slice 15 evidence doc; deeper non-blocking hardening remains in `tasker/50`.
