<!-- docs/technical/reviews/AGENTIC_CHAT_PIPELINE_AUDIT_2026-10-17.md -->

# Agentic Chat Pipeline Audit — 2026-10-17

Fresh, adversarial review of the whole chat path: browser → `POST /api/agent/v2/turns` →
admission RPC → queue → Railway `agentic-chat-worker` → model/tool loop → Supabase Realtime →
browser. Five parallel reviewers (browser, web admission, worker host + delivery, model harness,
tools) plus a lead pass over production data. Read-only: no code changed, no paid calls.

Evidence is file:line against `main` at `fe0c4610f`. Production numbers come from
`chat_turn_runs`, `llm_usage_logs`, `agentic_chat_execution_observations`, and the Railway env,
queried read-only on 2026-10-17. Volume is low (64 turns since the 09-25 model switch), so treat
percentiles as directional.

## Bottom line

- A turn is slow because of **model passes**, not plumbing. About 87% of wall time is LLM time.
  Queue pickup (~0.3 s) and admission (~0.5–0.7 s round trip) are already small.
- The answer **does not stream**. Live preview was built on 09-23 and is still off in production
  (`AGENTIC_CHAT_LIVE_TEXT_PREVIEW` is unset on Railway). Users watch "Thinking…" for the whole
  turn and the answer pops in at the end.
- **Hidden reasoning** is the biggest controllable cost: runaway reasoning ate 23% of all model
  time since 09-25, and continuation passes re-think from scratch on every tool round.
- **Stop does not stop the model call**, a hung write can stall a turn for 2 minutes, and a
  deploy mid-turn strands the user for ~2 minutes and then fails the turn.
- The prepared-prompt hit-rate "drop" (84% → 28%) is mostly **mislabeled script traffic**. Real UI
  follow-ups still hit about 74–79%, and a hit now saves only ~100 ms.

## Where a turn's time goes

Current model era (deepseek/deepseek-v4.1-flash, since 2026-09-25, 64 turns): wall p50 **16 s**,
p90 **59 s**; LLM time p50 13.4 s; 4 LLM calls per turn p50.

| Stage                        | Typical                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ |
| Browser → admission response | 517 ms (prepared hit) / 686 ms (new session), from battery Server-Timing |
| Admitted → worker claim      | p50 318 ms, p90 663 ms                                                   |
| Claim → execution start      | p50 188 ms                                                               |
| Model passes                 | ~87% of wall time                                                        |
| Tools + persistence          | p50 2.5 s, p90 8.7 s per turn (30 d)                                     |
| Last model pass → finished   | p50 256 ms, p90 813 ms                                                   |

LLM time by pass role (30 d): acting 79% (3.1 calls/turn, p50 4.1 s, p90 17.2 s); mutation
review 42 calls in 25 turns (p50 4.7 s); repair 25 calls in 17 turns (p50 4.3 s, p90 19.4 s);
final response 21 calls (p50 3.5 s); research review ~2 s before each web search; Jev tool
selection 344 ms.

Throughput on the current upstream (Together) is ~270 tok/s, about 3.2 s per 1k output tokens,
while uncached prompt tokens cost ~5 ms per 1k. **Output (mostly reasoning) drives latency;
prompt size mostly drives cost.**

## Built but switched off

| Flag                                     | What it does                                                                                                                                               | State                                                                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTIC_CHAT_LIVE_TEXT_PREVIEW`         | Streams a display-only preview of the answer while the pass runs (`stream/live-text-preview.ts`; web side wired at `agent-chat-worker-ui-adapter.ts:257`). | Unset on Railway → default off (`host/config.ts:367`). In all 6 retained turns the first text landed 0.2–0.3 s before the turn finished.        |
| `AGENTIC_CHAT_DIRECT_WRITE_RECEIPT_TEXT` | Closes a simple write turn with ledger receipt text instead of an extra tool-free model pass.                                                              | Off. 8 of 47 recent turns paid that extra pass (p50 2.1 s, p90 4.2 s). Even when on, it only covers single-round writes (`turn-state.ts:1511`). |

Both shipped in `71bdfb068` (09-23) behind a paid validation run that was deferred. The full
`pnpm agentic:prod-battery` was measured at **$0.24** (13 cases × 3, 2026-09-25, DeepSeek V4.1
Flash). Before enabling preview, fix B10 (reconcile-only mode) and check that prose later held back
for a tool call does not flash and disappear.

## Bugs

| #   | Bug                                                                                                                                  | Evidence                                                                                                                                                                                                                                                                                                                                                                              | Impact                                                                                                          | Fix                                                                                                                                                                                                        | Effort |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| B1  | Stop, lease loss, and budget expiry cannot abort the in-flight model request.                                                        | `turn-executor.ts:384` passes `AbortSignal.any([deadlineSignal, speculative])`; `deadlineSignal` comes from `runWithAbortableDeadline`, whose `finally` detaches the parent (`shared/abortable-deadline.ts:26-29`). Every later request inherits that dead signal (`turn-provider.ts:208`). Confirmed by two reviewers + lead trace.                                                  | The pass keeps running (p90 17 s, up to 90 s) and is billed; capacity is freed while the request still runs.    | Add `combined.signal` to the `AbortSignal.any` list. Fake-client test asserting `signal.aborted` after cancel.                                                                                             | S      |
| B2  | A deploy mid-turn strands the user ~2 min, then fails the turn.                                                                      | Queue drains 22 s then aborts without awaiting cleanup (`lib/supabaseQueue.ts:403-425`); shutdown stops observer + publisher (`consumer-runtime.ts:182-184`); `chat-worker.ts:65` exits. Recovery waits for the 90 s lease + 15 s sweep, and `recover_agentic_chat_turn` never retries a started turn. 135 commits touched the worker's watch patterns in 30 d.                       | Any push during a turn = stuck chat, then failure.                                                              | Lean: wait for in-flight `recover` before stopping the publisher. Ambitious: retryable `worker_shutdown` class for started turns with no effects/reservations so they requeue at once.                     | S/M    |
| B3  | Writes have no deadline.                                                                                                             | `mutation-executor.ts` `invokeAdapter` has none (reads get 30 s at `execution-adapter.ts:559`); gateway `updateDocument` passes no signal (`op-execution-gateway.core.ts:978+`). Turn `a5d3e7a2`: one `update_onto_document` hung 125 s, turn ended `uncertain_external_commit` after 3 m 20 s with 4 sibling writes done.                                                            | Rare, severe.                                                                                                   | ~20 s fetch timeout on the worker Supabase client, signal through gateway writes, adapter deadline → `outcome_uncertain`, then read-back to downgrade to `known_failed`.                                   | M      |
| B4  | One large read can fail the whole turn.                                                                                              | Every UI event re-sends the full projection (`turn-run.ts:120`, `turn-run-services.ts:143`), capped by count not bytes (`turn-run.ts:19`). Publisher throws over 512 KB projection / 256 KB event (`stream-publisher.ts:1904-1908`) while reads may return 480 KB (`execution-adapter.ts:113`); `read-tool-runner.ts:424-433` rethrows. Normal turns already reach 20–60% of the cap. | Turn failure on big reads.                                                                                      | Append events server-side, compact tool results in the projection, cap by bytes. (Same work as S7.)                                                                                                        | M      |
| B5  | A resumed turn keeps the chat "busy" up to 10 s after it finishes.                                                                   | `AgentChatModal.svelte:1571` sets `activeRestoredTurnRunId`; `finishWorkerTurn` (`:2852-2875`) never clears it, so `isTurnBusy` and the prewarm block stay on until the backing-off probe (2→4→8→10 s) fires and forces a full reload.                                                                                                                                                | Next send shows "Message queued…" after a visibly finished answer.                                              | Clear the id and stop the probe when worker terminal handling touches that turn; skip the reload.                                                                                                          | S      |
| B6  | Project Review admissions never wake the worker.                                                                                     | `+server.ts` returns `workflowReview` before the wake; `workflow-review-admission.ts` has no wake. Idle poll is 5 s (`consumer.ts:24`).                                                                                                                                                                                                                                               | Review turns start 0–5 s late (~2.5 s average).                                                                 | Wake on `newly_admitted` in that branch, or move the wake into both RPCs.                                                                                                                                  | S      |
| B7  | "Ghost bubble": failures that provably never admitted are reported as "maybe admitted"; a lost first-turn response is never retried. | Preparation errors and SQLSTATE errors map to `WORKER_ADMISSION_UNAVAILABLE` (`worker-admission-responses.ts:70-76`), outside the client's not-admitted set (`agent-chat-stream-controller.svelte.ts:175-191`). Admission fetch has no timeout or retry (`worker-transport-client.ts:55-64`); a first turn has no session to recover by.                                              | Sent bubble that never answers; draft lost.                                                                     | Not-admitted code for prep/SQLSTATE errors; re-POST the identical body on network error/5xx/timeout and adopt `matching_duplicate`; split `idempotency_conflict` out of `WORKER_ADMISSION_CONFLICT` first. | S/M    |
| B8  | Closing the modal during a first-turn admission loses the reply's handle.                                                            | `handleClose` parks only with `currentSession?.id` (`AgentChatModal.svelte:2229-2236`).                                                                                                                                                                                                                                                                                               | Reply only reachable via history; no park card.                                                                 | When `isStartingStream`, wait for admission, then park.                                                                                                                                                    | S      |
| B9  | Permanent reconcile errors retry forever.                                                                                            | `worker-realtime-coordinator.ts:381-388` retries 401/404/409 every 5 s; errors only reach the dev console.                                                                                                                                                                                                                                                                            | "Thinking…" indefinitely.                                                                                       | 404/409 terminal; 401 refresh then retry; after N failures show "Lost connection, reopen chat".                                                                                                            | S      |
| B10 | One failed broadcast degrades the rest of the turn.                                                                                  | `enterReconcileOnly` is never cleared (`stream-publisher.ts`); a failed preview send evicts the channel durable events also use (`supabase-stream-publisher-adapters.ts` publish → `evictChannel`).                                                                                                                                                                                   | Updates only via reconcile hints (≤1 per 2 s) + polling of the full snapshot. Must fix before enabling preview. | Never evict on preview failure; leave reconcile-only after a successful hint.                                                                                                                              | S      |
| B11 | Stop gives no feedback and visible text can vanish.                                                                                  | "Stopping response…" goes to `currentActivity` (`agent-chat-stream-controller.svelte.ts:847`), hidden whenever a thinking block is active (`AgentChatHeader.svelte:443/469`); worker voids the preview on aborted passes (`provider-pass.ts:285-289`).                                                                                                                                | User can't tell Stop worked; reading text disappears.                                                           | `stopRequested` flag → "Stopping…" in the thinking block, disable Stop; freeze shown preview into the bubble with a "Stopped" marker.                                                                      | S      |
| B12 | Semantic search recall collapses once the planner uses the HNSW index.                                                               | `onto_search_semantic` takes global top 400 then filters by project (`20260929150000_chat_reads_exclude_archived.sql:1736-1748`); with the index forced only 190 rows return (`ef_search` 200 < `LIMIT 400`).                                                                                                                                                                         | Latent; hits as the corpus grows.                                                                               | Same migration as S4.                                                                                                                                                                                      | —      |
| B13 | Document body fetch is not fenced to the checked project.                                                                            | Second query in `loadAgentDocumentDetails` lacks `.eq('project_id', ref.project_id)` (`ontology-reads.ts:756`).                                                                                                                                                                                                                                                                       | Narrow race after a move.                                                                                       | Add the fence.                                                                                                                                                                                             | S      |
| B14 | The turn rate limiter protects nothing on Vercel.                                                                                    | In-memory map per function instance (`agentic-chat-turn-rate-limit.ts:80-87`); session-less sends skip the one-active-turn guard (up to 100 queued).                                                                                                                                                                                                                                  | Abuse/cost exposure.                                                                                            | Count the user's turns in the last 60 s inside the admission RPC under its advisory lock.                                                                                                                  | S/M    |
| B15 | A pre-start infrastructure failure retries only after 1–2 min.                                                                       | `recover_agentic_chat_turn` backs off `transient_infra` by `POWER(2, attempts)` minutes + jitter.                                                                                                                                                                                                                                                                                     | Slow recovery.                                                                                                  | Seconds-scale first retry (migration).                                                                                                                                                                     | S      |

## Speed

| #   | Opportunity                                          | Evidence                                                                                                                                                                                                                                                                                                                                                                                        | Estimated gain                                                                      | Fix                                                                                                                                                                                                     | Effort |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| S1  | Turn on live answer streaming.                       | See "Built but switched off".                                                                                                                                                                                                                                                                                                                                                                   | First visible text several seconds earlier on typical turns, 10 s+ on slow ones.    | Fix B10, run the $0.24 battery with the flag on, keep it on.                                                                                                                                            | S      |
| S2  | Cut runaway reasoning while it happens.              | Since 09-25: 9 of 64 turns, **358 s of 1,548 s** LLM time (23%); 5 passes burned 12,000/12,000 tokens on reasoning (33–67 s each) and only then retried with reasoning off. Exhaustion is detected after the pass ends (`output-budget.ts:51-64`); the watchdog only checks bytes/s (`openrouter/watchdog.ts:57-100`). DeepSeek ignores `reasoning.max_tokens` (`openrouter-client.ts:90-104`). | ~20 s per affected turn; p90 59 s → roughly 35–40 s.                                | On watched passes, abort with `output_budget_exhausted` once reasoning passes ~6k tokens with no text/tool output; the existing reasoning-off recovery in `provider-pass.ts` takes over.                | S      |
| S3  | Stop re-thinking from scratch on every continuation. | `openrouter/open-route.ts` `copyMessage` drops reasoning; continuation tool passes average 1,533 reasoning tokens vs 574 on the opening pass; ~4.3k reasoning tokens/turn ≈ 14–16 s.                                                                                                                                                                                                            | Up to ~5 s per turn on average if continuations drop to opening levels. Unverified. | A/B: pass `reasoning_details` back within the turn, vs reasoning off for continuations after read-only rounds. Needs a paid run.                                                                        | M      |
| S4  | Fix `search_project` (~5.1 s every first search).    | `onto_search_semantic` seq-scans all users' embeddings (EXPLAIN: 4,174 rows, 53k buffers; 3.1 s cold vs 80 ms warm) and hits the 5 s budget (`ontology-search.ts:63`), so results fall back to lexical-only. Later searches in the same turn take ~0.5 s.                                                                                                                                       | ~4.5 s per searching turn, plus semantic results actually returned.                 | Migration: filter candidates by accessible project ids first (exact NN over ≤387 rows); workspace search via `hnsw.iterative_scan`; start `embedQuery` in parallel with access checks; budget → ~2.5 s. | S/M    |
| S5  | Reduce reviewer bounces.                             | 16 `request_proposal_revision` vs 21 approvals (43%) in 11 turns; each bounce ≈ 14 s (repair 9.4 s + re-review 5 s). One turn went J-A-R-M-R-M-R-R-M and saved nothing. Causes (replay): write proposals on analysis turns; reviewer rejects correct partial stages despite its own rule (`review/mutation-batch.ts`).                                                                          | ~14 s per avoided bounce.                                                           | Log reviewer finding codes (free); tighten the stage rule; run Jev's `current_turn_write_commission` in shadow, then hold write schemas on turns it scores uncommissioned.                              | S/M    |
| S6  | Skip the closing pass after successful writes.       | `turn-state.ts:1410-1484` forces a tool-free final pass; prose written beside tool calls is dropped (`turn-provider.ts:714`).                                                                                                                                                                                                                                                                   | 2–4 s on ~17% of turns.                                                             | Turn on the receipt flag; extend it to reads-then-write turns by releasing held prose + receipt when every write succeeded.                                                                             | S/M    |
| S7  | Stop serializing and re-sending UI persistence.      | Events persist strictly one at a time (`turn-run-services.ts:103-161`); parallel reads start serially behind them (`read-tool-runner.ts:482`); tool results are persisted before the next model call (`:369`); a per-event delivery-ack RPC takes the same 3 locks. Full projection resent each event: turn `dac81d9d` wrote ~7 MB of JSON. ~60–80 RPCs per turn.                               | ~0.3–0.8 s per tool-using turn; removes B4.                                         | Batch event writes, append projection server-side, compact UI results, drop or make lock-free the ack RPC, per-turn project-access cache (`worker-access-adapter.ts:70`).                               | M      |
| S8  | Make document reads one round, not several.          | `get_onto_document_details` returns a 3.5k preview; `read_document_section` takes one anchor, no offset; doc-heavy turns spend 2–5 acting rounds (~4 s each) on reads.                                                                                                                                                                                                                          | ~4 s on document-heavy turns.                                                       | Return bodies ≤ ~5k inline from the outline; `anchors[]` + `offset` with a 12k budget.                                                                                                                  | S/M    |
| S9  | First-byte stall deadline.                           | Before the first byte only the 90 s attempt deadline applies (`watchdog.ts:81-90`).                                                                                                                                                                                                                                                                                                             | Tail only.                                                                          | 15 s first-progress deadline on watched passes with a retry left.                                                                                                                                       | S      |
| S10 | Trim admission.                                      | Wake awaited ≤150 ms for nothing (`+server.ts:255-258`); transport-decision read is sequential and redundant (`:109-114`); new sessions re-read the session the RPC already holds; miss path waits on the session row before history (`worker-turn-preparation.server.ts:394-462`).                                                                                                             | ~100–250 ms per send.                                                               | Fire-and-forget wake via `runAfterResponse`; parallel or deterministic decision id; return the session from the RPC; start history reads immediately.                                                   | S/M    |
| S11 | Stop prewarming prompts new chats can't use.         | Session-less prewarm builds a ~44 KB prepared row every 90 s that admission can never consume (client skips the key at `agent-chat-stream-controller.svelte.ts:663-670`; RPC rejects it). A hit saves only ~100 ms since the sfo1 move.                                                                                                                                                         | Cost/CPU, small latency.                                                            | Lean: send `prepare_prompt:false` without a session. Ambitious: make the miss path as cheap as a hit (S10), then delete prepared prompts.                                                               | S / L  |
| S12 | Cold function on first send.                         | Modal-open warmup no longer touches the turns function (`agent-chat-session.ts:419-431`).                                                                                                                                                                                                                                                                                                       | Likely a few hundred ms on the first send after idle. Verify in PostHog first.      | Warm `GET /api/agent/v2/turns` on modal open.                                                                                                                                                           | S      |
| S13 | Two reconcile round trips before live events render. | Admission adopts at generation 0; the first generation-1 event forces a reconcile (`worker-realtime-inbox.ts:226-229`).                                                                                                                                                                                                                                                                         | ~150–400 ms on early activity, half of turns.                                       | Seed the cursor from the admission descriptor.                                                                                                                                                          | M      |
| S14 | Keep one upstream per turn.                          | `route-health.ts:84-86` skips provider pinning when `sort: 'throughput'` is set (`host/config.ts:111-115`); 12% of continuations switched upstream (28% vs 74% cached).                                                                                                                                                                                                                         | Small; mostly cost.                                                                 | Pin the provider that served the first pass, if OpenRouter accepts `order` with `sort`.                                                                                                                 | S      |
| S15 | Concurrency headroom before any launch.              | `MAX_AGENTIC_CHAT_CONCURRENCY = 2` per process × 4 replicas = 8 turns service-wide (`concurrency-bounds.ts:13`).                                                                                                                                                                                                                                                                                | None today; the 9th concurrent user waits a full turn.                              | Raise after a load smoke test.                                                                                                                                                                          | S      |
| S16 | Cache-friendly prompt layout.                        | Round-1 cache 9%: Jev changes the tool set per turn and upstreams render tools after the first system message; the per-turn context and minute clock sit before history.                                                                                                                                                                                                                        | Cost, not latency, on Together (~$1.60 per 30 d total today).                       | Static system message first, stable session tool set, history, then one per-turn context message, then the user message.                                                                                | L      |

## Quality and repo-rule violations

- **Q1 — Regex picks the "Rules for This Turn" playbook.** `operational-skill-intent.ts:191-213`
  scores the user message with a lexicon and patterns, which breaks the AGENTS.md no-regex rule. A
  misfire injects write playbooks (a likely contributor to S5). The section also lands mid-prompt
  (`build-lite-prompt.ts:455-466`). Fix: choose it from Jev's structured selection in the worker
  and append it after the user message.
- **Q2 — Keyword task buckets in search ranking.** `ontology-search-ranking.ts:157-321` matches
  words like "late", "planned", "todo" in the query and injects whole task buckets at a fixed 0.72
  score. "late-night ideas" floods overdue tasks. Fix: an explicit enum argument, or remove it.
- **Q3 — The "Output budget" instruction rides on every pass**, including read-only and tool-free
  ones (`open-route.ts:231-235`). Add it only when mutation tools are mounted.
- **Q4 — `entityResolutionHint` is computed and never used**
  (`worker-turn-preparation.server.ts:667-671`).

## Measurement gaps

- **M1 — Hit-rate baseline is polluted.** 21–22 of the 31 "session but no key" misses are the
  scripted book-loop / dogfood harness (`worker-client.ts:185-217` sends a key only under
  `AGENTIC_BATTERY` and hard-codes `projectFocus: null`), logged as `source: 'live_ui'`
  (`worker-turn-preparation.server.ts:973`). Tag harness turns.
- **M2 — Web admission time is never persisted.** It exists only in Server-Timing and the
  consent-gated PostHog event. Write `preparationMs` and `requestReceivedAt` into
  `p_request_payload`.
- **M3 — First-text timing lives only in `chat_turn_stream_state` (7-day retention).** Record the
  first preview/text time durably.
- **M4 — Rejected writes are logged as `evidence_read` with 0 ms** because unknown tools default
  to that class (`read-planning-telemetry.ts:69`). Classify by catalog kind.
- **M5 — Reviewer revision reasons are not retained in prod.** Needed for S5.
- **M6 — No embedding latency span** next to the semantic search RPC.
- **M7 — The browser never says why it sent no prepared key.** Add a client miss reason
  (`expired`, `inflight_timeout`, `first_turn`, …) to the admission event.

## Proposed order

**Lean (free tests only):** B1, B5, B6, B7, B9, B10, B11, B13, S2, S9, S10 (wake), S11 (lean),
Q2, M1, M2, M4. Then the $0.24 battery with both flags on, and keep S1 + S6 on if it passes.

**Ambitious (adds migrations, persistence rework, and paid experiments):** everything in Lean,
plus S4 (search RPC migration), B2 (deploy drain + retryable shutdown), B3 (write deadlines), S7 +
B4 (persistence rework), S5 + Q1 (reviewer and playbook via Jev), S8 (document reads), and the S3
reasoning A/B.

Rough expected effect (estimates, not measured): Lean mostly fixes the tail and the perceived
wait. p90 59 s → about 35–40 s, and answer text appears during the answering pass instead of at
the end. The median moves materially (16 s → about 10–11 s) only if the S3 reasoning experiment
pays off.

## Lean build — status (2026-10-17)

DJ picked Lean first. Built on local `main` by four agents on disjoint files plus a lead review.
Free focused tests only; nothing deployed, no paid runs. The live check (`pnpm
agentic:prod-battery`, ~$0.24 on DeepSeek V4.1 Flash) can only test a deployed commit, so it waits
on DJ's OK to push and to switch the two Railway flags on.

| Item | What shipped                                                                                                                                                                                                                                                                                                                                                                                       | Where                                                                                        |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| B1   | The turn signal (Stop, lease loss, budget) now rides every model request.                                                                                                                                                                                                                                                                                                                          | `turn/turn-executor.ts`                                                                      |
| S2   | Watched passes stop at **9k** streamed reasoning tokens with no text or tool output and hand off to the existing reasoning-off recovery. Not 6k: six passes since 09-25 reasoned 6.2k–11.5k and still answered; every cap-hitter had >10.7k. Attempt `error_class: runaway_reasoning_cutoff`.                                                                                                      | `provider/openrouter/watchdog.ts`, `openrouter-client.ts`, `provider-pass.ts`                |
| S9   | 15 s first-content deadline on watched passes with a retry left.                                                                                                                                                                                                                                                                                                                                   | `provider/openrouter/watchdog.ts`                                                            |
| —    | Recovery status text no longer says "cleanup" on every turn.                                                                                                                                                                                                                                                                                                                                       | `provider/output-budget.ts`                                                                  |
| B10  | Reconcile-only mode ends once a sent hint covers held-back events; preview failures never evict the shared channel (own path, capped, rate-limited reopen).                                                                                                                                                                                                                                        | `stream/stream-publisher.ts`, `stream/supabase-stream-publisher-adapters.ts`                 |
| M4   | Rejected writes and validation-failed calls log as `rejected`, not `evidence_read`.                                                                                                                                                                                                                                                                                                                | `effects/read-planning-telemetry.ts`, `turn/turn-run-services.ts`                            |
| S10  | Admission no longer waits on the queue wake.                                                                                                                                                                                                                                                                                                                                                       | `routes/api/agent/v2/turns/+server.ts`                                                       |
| B6   | Project Review admissions wake the worker.                                                                                                                                                                                                                                                                                                                                                         | `turns/workflow-review-admission.ts`                                                         |
| B7   | New codes: `WORKER_ADMISSION_NOT_ADMITTED` (503, draft restored) for preparation errors and RPC errors that prove rollback; `WORKER_IDEMPOTENCY_CONFLICT` (409). Browser: 30 s timeout + one identical re-POST; `matching_duplicate` adopted. Fixed a hash-lineage bug that made a resend after a prepared race look like a conflict. `history_lineage_mismatch` now gets the one-shot re-prepare. | `turns/*`, `worker-turn-admission.server.ts`, `worker-transport-client.ts`                   |
| M1   | Harness turns send `x-buildos-turn-source: harness` → `source: 'harness'`. Review-turn RPCs still hard-code `live_ui`.                                                                                                                                                                                                                                                                             | `turns/turn-source.ts`, harness `worker-client.ts`                                           |
| M2   | `preparationMs` + `requestReceivedAt` persisted in `p_request_payload`.                                                                                                                                                                                                                                                                                                                            | `turns/+server.ts`                                                                           |
| B5   | Finishing a resumed turn clears the busy flag and stops the probe/reload.                                                                                                                                                                                                                                                                                                                          | `AgentChatModal.svelte`, stream controller                                                   |
| B9   | Reconcile 404/409 end the turn; 401 refreshes once; 5 straight failures show "Lost connection to this reply…" while retries continue (backoff to 60 s).                                                                                                                                                                                                                                            | `worker-realtime-coordinator.ts`, UI adapter                                                 |
| B11  | "Stopping…" shows in the thinking block, Stop disables; shown preview text stays with a "Stopped" label (client-only).                                                                                                                                                                                                                                                                             | stream controller, `ThinkingBlock.svelte`, `AgentComposer.svelte`, `AgentMessageList.svelte` |
| B13  | Document body read fenced to the checked project.                                                                                                                                                                                                                                                                                                                                                  | `packages/agentic-chat-runtime/src/tools/ontology-reads.ts`                                  |
| S11  | Session-less prewarm sends `prepare_prompt: false`; server also skips prepared rows without a session.                                                                                                                                                                                                                                                                                             | `agent-chat-prewarm.svelte.ts`, `prewarm/+server.ts`                                         |
| Q2   | Keyword task buckets removed from search ranking and from `/api/onto/search` routing. A task-only project search for "overdue" now matches titles, not the overdue bucket.                                                                                                                                                                                                                         | `ontology-search-ranking.ts`, `ontology-search.ts`, `api/onto/search/+server.ts`             |

Revised estimate: S2 at 9k saves ~10 s per cap-hitting pass (not ~20 s), so the p90 gain from the
lean set is smaller than the 35–40 s first projected; expect roughly 45–50 s until measured.

Follow-ups found while building (not in Lean):

- `persist_agentic_chat_execution_observation` rejects attempt records carrying
  `progress_window_ms`, `progress_output_bytes`, or `tool_call_truncation`, so every slow-stream
  (and now first-byte stall) attempt record is dropped. Needs a migration; until then count them
  from `llm_usage_logs.error_message`.
- Review-turn admission RPCs hard-code `p_source = 'live_ui'`.
- A resend still pays full preparation before the RPC finds the duplicate.
- Stopped preview text survives only until reload; persisting it needs the worker to save the
  partial pass on cancel.
- Optional `task_buckets` enum argument on `search_project` if bucket search is wanted back.

### Lean — live validation (2026-10-17, commit `184fdb859`)

- Deployed (Vercel + Railway 13:05 ET). `AGENTIC_CHAT_LIVE_TEXT_PREVIEW=true` and
  `AGENTIC_CHAT_DIRECT_WRITE_RECEIPT_TEXT=true` set on Railway (13:08 ET); DJ chose to keep both on.
- `pnpm agentic:prod-battery`: **failed, 50/52** (96.2%), $0.3239 reported ($0.2873 model + $0.0366
  judge; OpenRouter delta $0.351 incl. any concurrent traffic). Evidence:
  `output/agentic-prod-battery/2026-10-17T17-11-47-935Z`. Prior full run (09-25) was 46/52.
    - Case 4 rep 3 over 30 s: one `mutation_review` pass (GPT-6 Luna, Azure) took 24.8 s; acting
      passes ~3 s total. Reviewer latency, not a lean change (S5 territory).
    - Case 14 rep 1 judge 1/5: the judge called the success criteria "invented", but they are in the
      seed (`cedar-house/fixture.ts:34`). Judge false negative. The answer also notes "semantic
      search coverage timed out" — S4.
    - No runaway cutoff, first-byte stall, or recovery fired in any battery turn.
- Live UI check (harness account, build-os.com, one General chat turn, ~$0.01): first answer text
  on screen 3.05 s after send, grew over 12 updates (10 preview frames) to 893 chars, turn done at
  4.55 s. Admission round trip 2.05 s (new session, first send after deploy — possibly cold; S12).

## Ambitious wave 1 — shipped (2026-10-17, commit `67c4e71f8`)

- Migrations applied + recorded: `20261017180000_search_rpcs_project_scope` (first attempt failed in prod
  with `42501 permission denied to set parameter "hnsw.ef_search"` — rehearsal runs as superuser;
  fixed with in-body `set_config`, dry-run with ROLLBACK in prod, then applied),
  `20261017181000_agentic_chat_worker_shutdown_requeue`, `20261017182000_agentic_chat_observation_progress_keys`.
- Railway: `railway.chat.toml` `drainingSeconds = 90` (default was 0: deploys killed running turns
  instantly); `CHAT_DRAIN_TIMEOUT_MS` 22000 → 67000.
- Battery on `67c4e71f8`: **failed, 50/52**, $0.3225 reported (OpenRouter delta $0.334). Evidence:
  `output/agentic-prod-battery/2026-10-17T20-59-39-807Z`.
    - Case 2 rep 2 over 60 s: `mutation_review` hung 45 s on Azure then failed (retry 8.9 s), second
      review failed at 5 s then took 23.9 s on Reka — 83 of 91 s of model time was the reviewer.
    - Case 14 rep 1 judge 1/5 again ("neither is recorded as started or finished" read as a real-world
      claim). Reps 2–3 scored 4–5 in both of today's runs; rep 1 failed both times — watch it.
- Next: first-progress deadline for reviewer passes (S9 covers only acting/repair/final); ship the
  merged-project search/explore refusal (`assertOntologySearchProjectSearchable`, built, uncommitted);
  requeue UX (empty bubble between attempts).

## Wave 2 (2026-10-17): reviewer stalls + requeue UX

- Reviewer passes (`mutation_review`, `contract_review`) with a retry left are now watched: first
  output within 15 s of headers, then ≥100 B/s over 4 s windows. Evidence: OpenRouter generation
  stats for 126 of 136 reviews since 09-25 — first token p50 2.0 s, first-attempt max 8.8 s; 97/102
  healthy reviews stream ≥49 tok/s; the five slow ones were all GPT-6 Luna on Azure on 10-17
  (2.8–22.8 tok/s). The cedar-02 45 s hang was a trickle, not silence. Attempt `error_class`:
  `reviewer_first_progress_stall` / `reviewer_slow_stream`. Not changed: the 5 s headers timeout
  (8 of 13 reviewer failures on 10-17) and the 45 s reviewer attempt timeout.
- Requeued turns (deploy restart): the partial answer clears, the thinking block shows "Picking back
  up after an update…", "Taking longer than usual…" waits 20 s from the restart, and the reloaded
  Timeline keeps only each turn's latest execution generation. Open: the discarded attempt's step
  list stays visible for the 1–6 s gap (needs a hook in `AgentChatModal.svelte`).
- In battery runs, attempt records are deleted with the run's turns; count reviewer stalls from
  `llm_usage_logs.error_message`.

## Wave 3 (2026-10-17): the ambitious list — built, not yet shipped

Five packages, built in parallel and integrated together.

| Package                            | What changed                                                                                                                                                                                                                                                                                                                                                           | Default                                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Save progress (B3/B4/M3/S2)        | One batched, fenced write per queued run of events (`persist_agentic_chat_semantic_event_batch`); events no longer wait on the previous commit; size caps compact oversized payloads instead of failing the turn; delivery-ack RPC dropped; project access passes cached per turn (cleared while a write may run); `first_visible_text_at/_source` recorded            | On once migration `20261017200000` is applied; falls back to per-event writes without it |
| Realtime self-heal (live incident) | The degraded replica's 331 failures were one recursion burst: removing a failed channel fired `CLOSED` back into its own callback. Removed channels' callbacks are now ignored, health counts one failure per attempt, and 60 s of failed subscribes closes the socket once (5-min cooldown) so every owner, including the queue-wake listener, resubscribes           | On                                                                                       |
| Document reads (S7)                | Documents over 6,000 chars return an outline; sections are read by heading within a 12,000-char budget. Tool-surface budgets lowered (worker 55,050 / 72,460, web 61,530 / 76,150)                                                                                                                                                                                     | On                                                                                       |
| Reasoning experiment (S3)          | `AGENTIC_CHAT_CONTINUATION_REASONING=default\|replay\|off_after_reads` (acting client only) + free report `scripts/agentic/continuation-reasoning-report.ts`                                                                                                                                                                                                           | `default` (byte-identical)                                                               |
| Admission (S12/B14/S10)            | `GET /api/agent/v2/turns?warm=1` boots the admission function when chat opens; per-user durable limit of 20 admitted turns per 60 s inside `create_agentic_chat_turn_with_job` (→ 429); worker concurrency cap 2 → 8 (Railway `CHAT_CONCURRENCY` still 2)                                                                                                              | On; the limit needs migration `20261017201000`                                           |
| Reviewer rejections (M5/Q1/S5)     | Each review decision is recorded with its finding codes; a rejection that names no defective call gets one quick second look (~5 s) instead of a full repair + re-review (~14 s); the regex playbook picker is gone (the worker picks the playbook from Jev's write commission, rules after the user message); `AGENTIC_CHAT_HOLD_UNCOMMISSIONED_WRITES` (shadow only) | On; hold flag off                                                                        |

Integration (local, free): worker typecheck + test types 0 errors; worker agentic suite 129 files /
2,067 tests; runtime package 75 / 910; web chat directories 286 / 2,297; web svelte-check 0 errors;
web test types 0 (16 strict-null errors in new tests fixed); script tests 17 / 17; SQL contracts
76 / 76. Merge fixes: the consumer config expectation lacked both new settings; two failure-matrix
anchors pointed at tests renamed in the lean commit; the reliability audit now counts the batch
write's fence.

CI on main had been red since before today: web lint stops at the route-size guard
(`recent-chats/+server.ts`, 426 lines, from `fa99249fb`) and the select guard (`select('*')` in the
wave 1 gateway signal test), so the test step never ran. Both fixed (display rules moved to
`$lib/server/project-recent-chats.ts`).

Migrations rehearsed together (0 security findings; role probe unchanged) and dry-run in prod
inside a transaction with in-transaction assertions, then rolled back; prod function hashes
unchanged afterwards. `20261017201000` is production's live admission function plus the rate-limit
block (diffed against `pg_get_functiondef`); `20261017202000` splices into the live observation
function, keeping 182000's progress keys.

Adversarial review of the reviewer change (deep-reasoner) found no path that executes a call the
reviewer flagged, and approval still binds to the exact batch. Fixed before shipping:

- The second look had no retry of its own, so a reviewer error, stall or bad SHA on it ended the
  turn ("Nothing was saved") where the old ladder sent the first revision to the actor. Now the
  first revision (which passed every pre-S5 check) goes to the actor when the second look fails.
- The second look was blind and leaned toward approval. It now carries the reviewer's own first
  `reason` and `required_correction` (quoted, capped at 600 chars), says a missing prerequisite or
  missing user authorization is a defect in the held call, and is skipped when a finding carries a
  specific defect code (anything but `other`; the 09-26/09-29 omission bounces used `other`).
- The worked example followed every commissioned tool; it now follows the selected family's.

Open after review: turns where Jev does not classify (fallback, timeout, small surfaces) get no
operational playbook (the regex picker used to supply one); watch `turn_rules_playbook`. Craft-skill
preloads still use lexical patterns in `domain-sensing.ts` and the cold-outreach check in
`skill-gate-preload.ts` (pre-existing).

Adversarial review of the save-path rework (deep-reasoner) found the batch SQL, durable-before-
broadcast order, replay, fallback, access cache, ack removal, and deploy order sound, and one
process-killer. Fixed before shipping:

- **P0:** `startSemantic` left `accepted` without a rejection handler; the live read runner stops at
  a rejected `enqueued` (Stop, budget timeout, or a blocked turn while waiting behind soft
  pressure), so the rejection went unhandled and `crashExit(1)` took every turn on the replica.
  Reproduced against the real modules; fixed with a handler; regression test fails without it.
- Self-heal no longer fires on isolated failures: a failure after a gap longer than the window
  starts a new window, and a restart needs at least 3 subscribe failures in it.
- A restart closes the socket before evicting channels (realtime-js then settles each leave at
  once), and reopening a topic waits for that topic's pending removal (bounded by the subscribe
  deadline). Not reproducible with the fake socket; from the SDK source.
- A tool result carrying a ready proposal card keeps the 64 KiB projection entry budget, so a
  browser that reconciles mid-turn renders the whole card (a clipped card vanished or had Apply
  refused as changed).
- After a transient failure, a multi-event batch retries at half size; a commit restores it.

Deploy order: the worker must be live before the web build that moves Rules for This Turn,
or every turn loses its playbooks until the worker catches up. So two commits:

1. `20261017200000` + `20261017202000` applied → push commit A (worker, runtime, migrations,
   scripts, runtime-only web tests) → wait for the Railway deploy.
2. Push commit B (web) → wait for Vercel → apply `20261017201000` (the web must understand
   `rate_limited` first).

### Wave 3 — shipped and validated (2026-10-17 late)

- DJ pushed all wave 3 code as `1ecc01f1c` (web and worker in one push). Migrations
  `20261017200000` + `20261017202000` applied and recorded before the deploys finished;
  `20261017201000` (rate limit) applied after Vercel was live; grants unchanged (postgres,
  service_role). Railway `CHAT_CONCURRENCY` 2 → 4. All replicas healthy on the new commit, Realtime
  0 failures (the degraded replica cleared on redeploy).
- Battery on `1ecc01f1c` (deepseek-v4.1-flash): 50/52, $0.3424, evidence
  `output/agentic-prod-battery/2026-10-18T03-29-15-602Z`. The only failures are case 14 reps 2–3
  (judge 1/5). All three reps wrote nearly the same marketing-brief line; the judge scored "no
  revision after that initial draft is recorded" 4/5, "no later revision recorded" 1/5, and "no
  revision after that" 1/5. Rep 3 is a real (small) overclaim; rep 2 is a judge false negative. Same
  case, same judge noise as both earlier runs today.
- Latency vs the `67c4e71f8` run (waves 2 + 3 together): turn p50 9.6 → 9.2 s, p90 30.1 → 21.0 s,
  max 94.5 → 38.4 s. Write cases: project create 30.9 → 23.3 s, task batch 32.8 → 26.1 s, document
  create 13.8 → 9.0 s.

### S3 continuation-reasoning A/B (2026-10-18, prod, deepseek-v4.1-flash, one full battery per arm)

| Arm               | Score                                                                           | Battery $ | Cost/turn | Continuation reasoning | Turn wall p50 · p90 |
| ----------------- | ------------------------------------------------------------------------------- | --------- | --------- | ---------------------- | ------------------- |
| `default`         | 50/52 (case 14 judge)                                                           | $0.342    | —         | —                      | 9.2 s · 21.0 s      |
| `replay`          | 52/52                                                                           | $0.300    | −19%      | −32%                   | +8% · +12%          |
| `off_after_reads` | 47/52 (case 9 verbatim store failed once — a real behavior miss; case 14 judge) | $0.351    | +2%       | −66%                   | +5% · +5%           |

Evidence: `output/agentic-prod-battery/2026-10-18T03-29-15-602Z` (default),
`…T03-49-01-744Z` (replay; smoke `…T03-47-05-582Z` case 14 3/3), `…T04-05-50-628Z`
(off_after_reads); numbers in `output/agentic-prod-battery/continuation-reasoning-2026-10-18.json`.
Total spend $1.02.

Decision: keep `default` (variable removed from Railway, worker redeployed 00:19). Neither arm made
turns faster, which was the point of S3; `off_after_reads` cost quality for nothing. `replay` is a
modest cost win with a small latency cost — worth a second look only if model spend starts to
matter at volume. Continuation re-thinking is not the remaining speed lever.
