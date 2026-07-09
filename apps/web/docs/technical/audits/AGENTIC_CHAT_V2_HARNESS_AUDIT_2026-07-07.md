<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_V2_HARNESS_AUDIT_2026-07-07.md -->

# Agentic Chat V2 — Harness Audit

**Date:** 2026-07-07
**Scope:** `apps/web/src/routes/api/agent/v2/stream/+server.ts` and its subsystems — the stream orchestrator (`agentic-chat-v2/stream-orchestrator/`), tool selection + gateway surfaces, domain sensing + skills, context/prompt caching, and the turn supervisor.
**Method:** Full read of the entry point (4,815 lines) and orchestrator loop (1,770 lines) plus supporting modules, cross-referenced against **14 days of live production telemetry** (58 turns, 215 chat LLM calls, 848 turn events) pulled from `chat_turn_runs`, `timing_metrics`, `chat_turn_events`, and `llm_usage_logs`.

---

## TL;DR

This is a **genuinely sophisticated, well-engineered harness** — arguably over-engineered for the model it runs on. The orchestration spine (length-continuation recovery, read-loop escalation, repetition fingerprinting, gateway required-field repair, write-outcome ledger, duplicate-write dedup, deterministic turn supervisor, incremental crash-recovery persistence) is more careful than most production agent loops. The refactor into `stream-orchestrator/` focused modules is clean and well-tested (423 service tests passing).

The problems are not in the harness logic — they're in **latency** and a few **robustness gaps**:

1. **Time-to-first-_token_ is the real UX weakness: p50 9.0s, p95 26s.** Harness overhead is negligible (context build p50 2ms, tool selection ~1ms). ~100% of latency is the LLM (`deepseek-v4-flash`, `balanced` profile, 15k median prompt tokens). The harness is fast; the model is slow.
2. **A single LLM stream error kills the whole turn — no per-pass retry.** This was the highest-value robustness fix and is now fixed as of 2026-07-08.
3. **Prewarm hit rate is only 28%** — the prepared-prompt optimization is mostly not landing (40% never triggered, 28% "stale_harness" rejection). The first `missing_key` race mitigation is now in place as of 2026-07-08, and stale-harness diagnostics were added on 2026-07-09 while keeping strict rejection semantics.
4. **No SSE heartbeat frames** on a path where p95 turn duration is 79s and max is 192s. This is now fixed as of 2026-07-08.
5. **No per-pass LLM timeout** was leaving individual provider calls bounded only by the 285s turn timeout. This is now fixed as of 2026-07-08.
6. Several smaller items remain: production follow-up on residual prewarm misses and synthesis-quality affordances. The finalization guard no-evidence telemetry gap is now fixed as of 2026-07-08, the skill recommendation list is capped, and the dead duplicate-code finding was rechecked against the current tree and is no longer present.

Verdict on the three questions asked:

- **Speed:** first byte is instant (6ms), first _token_ is slow (9s p50) — and that's the model, not the harness.
- **Capability:** high. Edge-case and error tolerance is strong; the un-retried LLM stream error and unbounded per-pass LLM call gaps called out in this audit were fixed on 2026-07-08.
- **Overall quality:** the skills and tool calls make sense; the architecture is sound. The first robustness wins — stream-error retry, SSE heartbeat keepalive, per-pass LLM timeout, prewarm send-race mitigation, and stale-harness diagnostics — are now in place; the remaining biggest wins are latency (model/prewarm/prompt size) and synthesis-quality instrumentation.

### Implementation update — 2026-07-08

Finding #1 is fixed in `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/llm-pass-runner.ts`. Each LLM pass now gets a bounded retry envelope (`2` total attempts) for retryable stream failures: 5xx responses, 408/409/425/429 responses, rate limits, timeouts, network/socket drops, provider-side aborts, and streams that end without a `done` event. User cancellations remain non-retryable because retry eligibility still checks `signal.aborted` before inspecting error text.

Guardrails added with the fix:

- The retry loop is capped at `MAX_LLM_STREAM_ATTEMPTS = 2`, so it cannot spin indefinitely.
- Retry sleep uses jittered backoff and is abortable; if the user cancels during backoff, the pass throws `Request aborted`.
- Per-attempt text/reasoning/tool-call capture is reset before retrying, so the successful retry result does not replay stale failed-attempt state into the orchestrator.
- Successful recovered passes record `attempts`, `streamRetryCount`, and `lastStreamRetryError` in `LLMStreamPassMetadata` for production telemetry.
- Non-transient request/auth/context errors are not retried.

Verification:

- `pnpm --dir apps/web exec vitest run src/lib/services/agentic-chat-v2/stream-orchestrator/llm-pass-runner.test.ts`
- `pnpm --dir apps/web exec vitest run src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts`
- `pnpm --dir apps/web run check`

Prioritized fix #2 is fixed in `apps/web/src/lib/utils/sse-response.ts` and enabled for the live v2 agent stream in `apps/web/src/routes/api/agent/v2/stream/+server.ts`. `SSEResponse.createChatStream` now accepts an optional heartbeat interval and the agentic chat endpoint emits invisible SSE comment frames (`: ping\n\n`) every `12s` for the duration of the turn.

Guardrails added with the fix:

- Heartbeat frames are SSE comments, not `data:` messages, so they do not enter the app-level event stream or consume event sequence IDs.
- The heartbeat timer is stopped from the chat stream `close()` path, including early deny/error exits and the normal `finally` close path.
- Heartbeat write failures stop the heartbeat loop without converting the turn into a semantic model/tool error; the next app-level send still handles detached-stream reconciliation through the existing `sendTimedMessage` path.
- The frontend stream parser already ignores comment lines; regression coverage now verifies that `: ping` blocks are ignored while adjacent `data:` events still reach the stream callbacks.

Verification:

- `pnpm --dir apps/web exec vitest run src/lib/utils/sse-response.test.ts src/lib/utils/sse-processor.test.ts`
- `pnpm --dir apps/web exec vitest run src/routes/api/agent/v2/stream/server.test.ts`
- `pnpm --dir apps/web exec vitest run src/lib/components/agent/agent-chat-stream-controller.svelte.test.ts`
- `pnpm --dir apps/web run check`

Prioritized fix #4 is fixed in `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/llm-pass-runner.ts`. Each LLM pass attempt now gets a default `60s` abort signal composed with the original turn signal. The timeout is per attempt, not per whole turn, so one hung provider pass fails fast and can be recovered by the existing bounded retry envelope.

Guardrails added with the fix:

- User cancellation is still non-retryable because retry eligibility checks the original turn signal (`params.signal?.aborted`), not the per-pass timeout signal.
- A timeout error is normalized to `LLM stream pass timed out after 60000ms`, making recovered attempts queryable through `lastStreamRetryError`.
- The timeout signal is disposed after each attempt, so successful passes do not retain timers or parent abort listeners.
- The review verified that OpenRouter/direct stream setup receives the composed signal. If the provider stream aborts after headers and returns without a `done` frame, the pass runner treats that as timeout-driven missing completion and retries.

Verification:

- `pnpm --dir apps/web exec vitest run src/lib/services/agentic-chat-v2/stream-orchestrator/llm-pass-runner.test.ts`
- `pnpm --dir apps/web exec vitest run src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts`
- `pnpm --dir apps/web run check`

Prioritized fix #5 has an initial mitigation in `apps/web/src/lib/components/agent/agent-chat-prewarm.svelte.ts` and `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts`. The client now gives an already-started, same-key prepared-prompt prewarm a bounded `250ms` handoff window before sending the stream request. This targets the `missing_key` class where the user sends just before `/api/agent/v2/prewarm` returns, without turning every send into a blocking prewarm build.

Guardrails added with the fix:

- The stream path waits only when a fresh prepared prompt is absent and a matching in-flight prewarm already exists; it does not start a new prewarm from `sendMessage`.
- The wait is capped at `250ms`; if the prompt is not ready, the stream falls back to the existing session/bootstrap path and still sends normally.
- The prewarm effect cleanup defers aborting only while the same-key send handoff is actively waiting. If the wait times out, cleanup aborts the held request; if the prewarm finishes in time, the prepared prompt is adopted and sent as the nonce-protected `preparedPromptKey`.
- Existing strict `stale_harness` fingerprint checks were intentionally preserved. Accepting a stale prompt could pair cached system text with changed tool definitions.
- Server-side prewarm already prepares all plausible project surfaces (`project_basic`, `project_write`, `project_document`, `project_write_document`); regression coverage now asserts that invariant.

Verification:

- `pnpm --dir apps/web exec vitest run src/lib/components/agent/agent-chat-prewarm.svelte.test.ts`
- `pnpm --dir apps/web exec vitest run src/lib/components/agent/agent-chat-stream-controller.svelte.test.ts`
- `pnpm --dir apps/web exec vitest run src/routes/api/agent/v2/prewarm/server.test.ts`
- `pnpm --dir apps/web exec vitest run src/lib/services/agentic-chat-v2/prepared-prompt-cache.test.ts src/lib/services/agentic-chat-v2/prepared-prompt-consumer.test.ts`
- `pnpm --dir apps/web run check`

Follow-up telemetry for prioritized fix #5 was added on 2026-07-09 in `apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-cache.ts`, `apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-consumer.ts`, `apps/web/src/lib/services/agentic-chat-v2/turn-observability-writer.ts`, and `apps/web/src/routes/api/agent/v2/stream/+server.ts`. Stale prepared prompts are still rejected strictly, but misses now carry compact diagnostics: prepared vs. actual harness hash, tool-name hash, tool-definition hash, surface profile, surface availability, and prompt/surface age. The stream route also records a durable `prepared_prompt_cache_checked` turn event and attaches `prepared_prompt_miss_diagnostics` to timing/prompt-snapshot metadata, so production analysis can separate real surface drift from tool-definition churn before any tolerance policy changes.

Bug-check notes from the 2026-07-09 review:

- `prepared_prompt_cache_checked` is emitted for both absent prepared-prompt keys (`missing_key`) and presented keys that miss, so the original "never triggered" class remains measurable after the client handoff mitigation.
- The new diagnostics persist hashes, tool names, surface profile, and age metadata only; cached system-prompt text and full tool definitions are not copied into turn events or timing metadata.
- `isPreparedPromptSurfaceCurrent` still resolves to strict harness-hash equality. The telemetry path adds explanation for rejects, not a fallback path that can accept stale prompts.

Verification:

- `pnpm --dir apps/web exec vitest run src/lib/services/agentic-chat-v2/prepared-prompt-consumer.test.ts src/lib/services/agentic-chat-v2/prepared-prompt-cache.test.ts src/lib/services/agentic-chat-v2/turn-observability-writer.test.ts src/routes/api/agent/v2/stream/server.test.ts`
- `pnpm --dir apps/web run check`

Prioritized fix #7 is fixed in `apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/finalization-guard.ts` and `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/finalization-runner.ts`. When the guard reaches the generic no-evidence read fallback (`"turn ended before a final response was produced"`), it now carries `finishedReason: 'synthesis_empty'`, and terminal finalization adopts that reason when the turn would otherwise finish as `stop`.

Guardrails added with the fix:

- Evidence-bearing read fallbacks still keep the normal `stop` finished reason; only the generic no-evidence fallback is tagged.
- Existing non-success reasons such as `tool_round_limit`, `tool_call_limit`, `cancelled`, `supervisor_question`, and `length` keep precedence.
- The guard-applied event and assistant metadata now include `guard_finished_reason`, making the fallback queryable from both turn-run and message-level telemetry without confusing it for a non-adopted tool-limit reason.

Verification:

- `pnpm --dir apps/web exec vitest run src/lib/services/agentic-chat-v2/turn-supervisor/finalization-guard.test.ts`
- `pnpm --dir apps/web exec vitest run src/lib/services/agentic-chat-v2/stream-orchestrator/finalization-runner.test.ts`
- `pnpm --dir apps/web exec vitest run src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts`
- `pnpm --dir apps/web exec vitest run src/routes/api/agent/v2/stream/server.test.ts`
- `pnpm --dir apps/web exec vitest run src/lib/services/agentic-chat-v2/empty-synthesis-retry.regression.test.ts`
- `pnpm --dir apps/web run check`

Prioritized fix #8 is fixed in `apps/web/src/lib/services/agentic-chat/tools/domains/domain-sensing.ts`. The skill-load gate now receives a ranked candidate set capped at `3` skills, led by the `default_skill_id` from the highest-confidence outcome card; lower-priority recommendations stay in the raw `recommended_skill_ids` field for telemetry and catalog analysis.

Guardrails added with the fix:

- The raw domain-sensing result is not truncated, so `domain_sensing_applied.recommended_skill_ids` still captures the full recommendation list.
- `getSkillGateCandidateSkillIds` is now the single gate-facing ranking policy used by the stream route and repair path.
- `getSkillGateCandidateSkillLoadFormats` only emits formats for the capped gate candidates, preventing format telemetry from re-expanding the noisy list.
- The Active Domain Signals prompt now shows the ranked max-3 gate candidates explicitly and trims the general recommendation preview.

Verification:

- `pnpm --dir apps/web exec vitest run src/lib/services/agentic-chat/tools/domains/domain-sensing.test.ts`
- `pnpm --dir apps/web exec vitest run src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.test.ts`
- `pnpm --dir apps/web exec vitest run src/routes/api/agent/v2/stream/server.test.ts`
- `pnpm --dir apps/web exec vitest run src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.test.ts`

Prioritized fix #9 is fixed in `apps/web/src/routes/api/agent/v2/stream/+server.ts`. Tool execution ontology context now narrows to the focused entity neighborhood whenever the turn has an explicit project focus or a later context-shift focus. Project-wide turns still receive the full project snapshot.

Guardrails added with the fix:

- Focused tool execution keeps project scope metadata plus the focused entity and linked-neighbor entities, while omitting unrelated top-level project collections.
- Dynamic context shifts that focus a task/document/goal/etc. now drive subsequent tool-execution focus without treating the focused entity id as a `project_id`.
- Document-focused tool execution preserves document-tree metadata for document ID resolution; non-document focused turns omit the full tree.
- Project-wide turns retain the previous full-context behavior.

Verification:

- `pnpm --dir apps/web exec vitest run src/routes/api/agent/v2/stream/server.test.ts`
- `pnpm --dir apps/web run check`

Prioritized fix #10 is implemented behind deterministic A/B controls in `apps/web/src/lib/services/agentic-chat-v2/model-tiering.ts`, `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts`, and `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/llm-pass-runner.ts`. When `FASTCHAT_INITIAL_PLAN_MODEL_TIERING` is enabled, only the first tool-capable route/plan pass can receive the fast model candidate list; follow-up, forced-synthesis, write-intent, and no-tool answer passes stay on the existing balanced route.

Guardrails added with the fix:

- The default mode is `off`; rollout can use `control`, `fast_initial_plan`, or deterministic `ab` mode through `FASTCHAT_INITIAL_PLAN_MODEL_TIERING`.
- A/B assignment is stable per turn via `clientTurnId`, `streamRunId`, `turnRunId`, or session id, so retries and telemetry stay comparable.
- Fast routing is explicit-model based, not profile-only; this avoids the existing tool-calling lane behavior where profile changes are secondary to the default tool route.
- Per-pass metadata and `llm_pass_completed` turn events now include `pass_role`, `requested_profile`, `requested_models`, and `model_tiering_variant`.
- Later synthesis quality is preserved by keeping non-initial passes on `balanced`.

Verification:

- `pnpm --dir apps/web exec vitest run src/lib/services/agentic-chat-v2/model-tiering.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator/llm-pass-runner.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts`
- `pnpm --dir packages/smart-llm test -- --runInBand`
- `pnpm --dir packages/smart-llm typecheck`
- `pnpm --dir apps/web run check`

---

## Production telemetry (last 14 days)

### Latency

| Metric                                  | p50       | p75    | p90    | p95        | max     |
| --------------------------------------- | --------- | ------ | ------ | ---------- | ------- |
| Time to first **event** (`agent_state`) | 6 ms      | 12 ms  | 23 ms  | 36 ms      | 341 ms  |
| Time to first **response token**        | **9.0 s** | 16.1 s | 24.2 s | **26.3 s** | 191.6 s |
| Turn duration (total)                   | 29.6 s    | 41.9 s | 52.2 s | 78.8 s     | 192.3 s |
| Context build                           | 2 ms      | 228 ms | 329 ms | 458 ms     | 556 ms  |
| Tool selection                          | 1 ms      | 1 ms   | 2 ms   | 2 ms       | 4 ms    |

**Read:** The harness gets a frame to the client in 6ms (the "thinking" state). But the first _substantive_ token takes 9s at median because the model reasons/calls tools before emitting visible text. Context assembly and tool selection are effectively free. **The latency budget is spent entirely inside the model.**

### LLM (chat model, `agentic_chat_v2_stream`)

- Model: `deepseek/deepseek-v4-flash-20260423`, `balanced` profile
- Prompt tokens: p50 **15,305**, p95 26,389, max 37,978
- Completion tokens: p50 434, p95 2,151
- Response time: p50 9.2s, p95 70s, **max 1,544,918 ms (≈25 min)** — a hung provider call
- Reported failures: 0 (but see stream-error handling below — failures surface as turn errors, not logged LLM failures)

### Turn shape & health

- Status: 53 completed, 4 running (in-flight at query time), 1 cancelled
- Finish reason: `stop` 49, `tool_round_limit` 4, `superseded` 1
- Tool rounds: p50 1, p95 5, max 9 · Tool calls: p50 1, p95 10, max 13 · LLM passes: p50 3, p95 7, max 10
- Validation failures: 9 total across 3 turns
- **Finalization guard applied: 5 turns** — reasons: `empty_after_reads` ×4, `lead_in_after_reads` ×1
- **Prewarm hit rate: 16/58 (28%)** — miss reasons: `missing_key` 23, `stale_harness` 16, null 19
- Cache source: session_cache 19, fresh_load 18, prepared_prompt 16, request_prewarm 2
- `first_lane`: unknown 34, overview 18, skill_first 2 · skill loaded on only 4 turns

### Worst turns (by duration)

192s (9 rounds/9 calls, project), 98s (3/6), 79s (`tool_round_limit`, 4/10, global), 76s (5/13, calendar), 55s (6/6, global). The long tail is multi-round tool turns — each round is a full LLM round-trip at ~9s.

---

## How the loop actually works

`streamFastChat` (`stream-orchestrator/index.ts`) runs a `while(true)` loop; one iteration = one LLM streaming pass.

1. Build a per-pass system message with the live tool-round budget, then `runLlmStreamPass` streams text/reasoning/tool-call/done events. Early assistant lead-in text is emitted as soon as a complete sentence is buffered (`tryEmitEarlyAssistantLeadIn`).
2. **Length recovery (D8):** if the pass ended on `finish_reason: length`, ask the model to continue (bounded by `MAX_LENGTH_CONTINUATIONS=2`), carrying partial text forward so the final answer is whole.
3. **No-tool synthesis pass:** if the supervisor forced a synthesis-only pass, finalize from loaded evidence (with one empty/tool-requesting retry).
4. **No pending tool calls:** run finalization — may inject a one-shot repair round for `project_create` / `gateway_mutation` / `skill_gate` no-execution, else finalize.
5. **Pending tool calls:** validate (`validateToolCalls`), then execute. **Consecutive pure-read calls batch** through `batchToolExecutor` (concurrency 3); everything else dispatches serially via `executeToolCallPair`, which handles on-miss materialization, wrong-entity-kind repair, and duplicate-write skips.
6. **After each round:** append a write-outcome ledger, run read-loop accounting + escalation, repetition fingerprinting (consecutive + windowed), gateway required-field-failure repair, and optional autonomous doc-organization recovery. Near the round budget, force a synthesis pass.
7. **Terminal finalization** applies `applyFinalizationGuard`, which — when the model produced no usable final text after doing tool work — reconstructs an answer from the read evidence (workspace overview / evidence items), or as a last resort emits "I gathered context but the turn ended."

The entry point (`+server.ts`) wraps this with: request validation, access checks, session/turn-run admission (single-running-turn guard), context resolution (prepared-prompt → session-cache → fresh-load), domain sensing, prompt-snapshot capture, incremental + end-of-turn tool-execution persistence, supervisor checkpoint/resume, a cancel watcher polling `chat_sessions.agent_metadata`, and a bounded observability flush before stream close.

---

## Findings (ranked by severity)

### P1 — A single LLM stream error kills the entire turn with no retry

**`stream-orchestrator/llm-pass-runner.ts:172-174`** (and `:180-186`)

```ts
} else if (event.type === 'error') {
    throw new Error(event.error || 'LLM stream error');
}
...
if (!llmDoneReceived) {
    throw new Error(params.signal?.aborted ? 'Request aborted' : 'LLM stream ended without a completion event');
}
```

A transient provider error (503, rate limit, mid-stream socket drop) on **any** pass throws out of the whole `while` loop, is classified as a real error (correctly, per O8), and the turn ends with `status: failed` → the user sees "An error occurred while streaming." There is no per-pass retry/backoff. On a 3–7 pass turn (p50 3, p95 7), the probability that at least one pass hits a transient error compounds with pass count.
**Failure scenario:** User asks a multi-step question. Passes 1–4 succeed (reads), pass 5 (synthesis) gets a provider 503. Entire turn fails; all the tool work is discarded from the user's view even though it was persisted. **Fix:** wrap the pass in a bounded retry (2 attempts, jittered backoff) for transient/5xx/stream-drop errors that are _not_ user cancellations, before propagating. `smart-llm` may already retry the initial connect — verify it also covers mid-stream drops; it does not cover the "stream ended without done" case here.

**Status:** Fixed 2026-07-08. The implemented retry envelope lives in `runLlmStreamPass` and preserves O8 cancellation semantics by requiring `signal.aborted !== true` before retrying.

### P1 — Time-to-first-token is 9s p50; it's the model + prompt size, not the harness

**Telemetry + `llm-pass-runner.ts:95` (`profile: 'balanced'`), `+server.ts` context (15k median prompt tokens).**
The harness adds ~single-digit-ms of overhead. The 9s p50 / 26s p95 to first token is `deepseek-v4-flash` reasoning over a 15k-token prompt before emitting visible text. **Levers, in order of expected impact:**

1. **Emit a visible lead-in earlier / force a status token.** The model often reasons silently for seconds. `tryEmitEarlyAssistantLeadIn` only fires once a _complete sentence_ is buffered; on tool-first turns nothing visible streams until after the first tool round. Consider a cheap "planning…" affordance tied to the first tool_call, not just sentence-completion.
2. **Shrink the prompt.** 15k median prompt tokens is large. The full project ontology snapshot is re-sent on every tool execution (see P3). Tool schemas add ~2.7k–5.2k tokens per surface (below).
3. **Model choice for first-token latency.** `balanced` optimizes cost/quality; a faster-first-token model for the _first_ pass (route/plan) vs. the synthesis pass is worth A/B testing. The two-budget design already separates orchestration from UI — model tiering per pass is a natural extension.

### P2 — Prewarm hit rate is 28%; "stale_harness" surface drift wastes the optimization

**`prepared-prompt-consumer.ts:86-96`; telemetry: `stale_harness` 16, `missing_key` 23.**
When prewarm _is_ triggered, ~28% of the time the prepared prompt is rejected because its tool-surface/context signature no longer matches the actual turn (`isPreparedPromptSurfaceCurrent` fails). This happens because the surface profile is routed from the **user message** (`resolveFastChatSurfaceProfileForTurn` keyword-matches "draft/update/save" → `project_write`/`project_document`), but prewarm runs before the message is known, so it prewarms the default surface and the real turn picks a different one. And 40% of turns send no `preparedPromptKey` at all.
**Impact:** context build is already ~2ms on a session-cache hit, so the wall-clock savings are modest — but the prompt-snapshot + system-prompt assembly is skipped on a true hit. **Fix options:** (a) prewarm _all_ plausible surfaces for the context, not just the default; (b) make the surface-signature check tolerant of the discovery-tool subset (writes materialize on-demand anyway, so a launch-surface match should suffice); (c) instrument _why_ `missing_key` is 40% — is the client not calling `/v2/prewarm` on focus, or racing the send?

**Status:** Partially mitigated 2026-07-08; telemetry follow-up added 2026-07-09. The current server implementation was rechecked and already prepares all plausible project surfaces for project/ontology contexts, so user-message routing to `project_write`, `project_document`, or `project_write_document` should not by itself cause a surface miss. The client now waits up to `250ms` for an already in-flight same-key prepared prompt before sending, which directly targets the send-before-prewarm-response `missing_key` race. The `stale_harness` fingerprint remains strict by design, and residual staleness now emits hash-level diagnostics before any signature relaxation is considered.

### P2 — No SSE heartbeat frames on a path with 79s p95 / 192s max turns

**`sse-response.ts:101,125` sets `Connection: keep-alive` but emits no periodic `:` comment/ping.**
The only mid-turn keepalive is the supervisor's `emit_status` (`agent_state: thinking`), which fires at 12s+ **and only while a long tool/LLM op is running**. Between the initial `thinking` frame (6ms) and the first real token (9s p50, 26s p95), and during quiet stretches of long turns, no bytes flow. A corporate proxy or browser with a short idle-read timeout can drop the connection; the turn keeps running server-side (detached) but the user sees a dead stream.
**Fix:** emit a `: ping\n\n` SSE comment every ~10–15s from the stream wrapper for the duration of the turn. Cheap, invisible to the client parser, eliminates idle-timeout drops.

**Status:** Fixed 2026-07-08. The live v2 stream now enables a `12s` heartbeat through `SSEResponse.createChatStream({ heartbeatIntervalMs: 12_000 })`, and frontend/parser tests verify heartbeat comments are ignored as transport keepalives.

### P2 — Finalization guard still masks non-answers as "completed" (5/58 turns)

**`turn-supervisor/finalization-guard.ts:133-149`; `finalization-runner.ts:310-329`.**
The guard is genuinely good — when the model does reads and emits no synthesis, it reconstructs a real answer from the evidence (`buildReadEvidenceFallbackText` / `buildWorkspaceOverviewFallbackText`). But its **fallback of the fallback** is: `"I gathered the requested context, but the turn ended before a final response was produced."` — persisted with `status: completed`, `finished_reason: stop`. That is a non-answer presented as success. Production shows this firing on `empty_after_reads` 4× and `lead_in_after_reads` 1× in 14 days. The rate is low (mitigations are working), but each occurrence is a user-visible quality failure that reports as a clean completion.
**Recommendation:** when the guard reaches the generic "turn ended before a response" branch (no evidence extracted), tag the turn with a distinct `finished_reason` (e.g. `synthesis_empty`) rather than `stop`, so it's queryable and doesn't inflate the success rate. Consider one more targeted synthesis retry before that branch specifically for the no-evidence case.

**Status:** Fixed 2026-07-08. Generic no-evidence read fallbacks now finish with `finished_reason = synthesis_empty`; evidence-based fallback summaries still finish as `stop`, and limit/cancel/supervisor/length reasons keep precedence.

### P3 — Full project snapshot re-sent to every tool execution; entity context never narrows

**`+server.ts:3326-3352` (`buildServiceContextForToolExecution`) → `buildToolExecutionOntologyContext`.**
`promptContext` is loaded once and never re-narrowed during the turn. Each tool execution rebuilds `ontologyContext` from the **full original** project snapshot (all goals/milestones/plans/tasks/documents). This was flagged in the 2026-07-01 backend audit as "entity context never narrows" and is still open. It's correct (tools always see full context) but contributes to the 15k median prompt and does redundant work each round. This is a token-cost and latency issue, not a correctness bug. **Fix:** once a turn focuses on an entity (context shift or a focused read), narrow the ontology context passed to subsequent tool executions to that entity's neighborhood.

### P3 — Domain sensing is deterministic keyword matching; recall-limited by design

**`domains/domain-sensing.ts` (`searchDomains`/`searchOutcomeCards`, `MIN_DOMAIN_CONFIDENCE=0.45`, `SKILL_GATE_MIN_CONFIDENCE=0.55`).**
Sensing is alias/keyword text-matching — fast (~1ms) and deterministic, but recall is bounded by hand-maintained alias lists. The known cold-email recall gap is a symptom, not a one-off. This is a reasonable trade for speed, but the maintenance burden grows with each domain. Not a bug — a scaling characteristic. **Consider:** a cheap embedding fallback _only_ when keyword sensing returns nothing, gated so it never adds latency to the common (matched) path.

### P3 — Skill recommendation lists are long and noisy for a weak model

**Telemetry: `domain_sensing_applied` payloads show up to 10 recommended skills per turn** (e.g. a short-form-video + cold-email message surfaced 10 skill ids). The gate binds _whether_ to load a skill, not _which_ — leaving a `deepseek-v4-flash`-class model to pick from a 10-item list. That's a lot of choice for a model that already only loaded a skill on 4/58 turns.
**Recommendation:** cap the surfaced list to top-3 by confidence for the gate, and lead with the single `default_skill_id` of the highest-confidence outcome card. The full list can stay in telemetry.

**Status:** Fixed 2026-07-08. The gate-facing candidate helper now returns at most three ranked skills, always leading with the highest-confidence outcome card's default skill when present. The raw recommendation list remains available for telemetry, while the prompt and gate format payload use the compact candidate set.

### P4 — Dead duplicate code block

**`+server.ts:2986-2993` and `:2995-3003`** are byte-identical (`if (!litePromptEnvelope && systemPrompt && turnDomainSensing) { litePromptEnvelope = buildLitePromptEnvelope({… domainSensingResult: null}) }`). After the first block runs, `litePromptEnvelope` is truthy so the second's `!litePromptEnvelope` guard is false; if the first didn't run, the identical guard keeps the second from running too. **The second block is unreachable.** Also both pass `domainSensingResult: null` even though the domain overlay is applied separately right after (`applyActiveDomainSignalsOverlay`). Harmless but should be deleted.

**Status:** Rechecked 2026-07-08 against the current tree. The duplicate block is no longer present; the current file has one rebuild block for the prepared-prompt/domain-overlay case. No code change is needed for this item.

### P4 — No per-pass LLM timeout; one hung provider call eats the turn budget

**`llm-pass-runner.ts` — only the turn-level `signal` (285s abort) bounds a pass.**
The `llm_usage_logs` max response_time of ~25 min indicates at least one provider call that hung far past any reasonable bound. The turn-level `FASTCHAT_DETACHED_TURN_MAX_DURATION_MS=285s` abort will eventually fire and abort the stream, but 285s is a long time to hold a slot. A per-pass timeout (e.g. `AbortSignal.timeout(60s)` composed with the turn signal) would fail fast and — combined with the P1 retry — recover instead of hanging.

**Status:** Fixed 2026-07-08. `runLlmStreamPass` composes a default `60s` per-attempt abort signal with the original turn signal and passes it into `llm.streamText`. Timeout-triggered aborts are retryable transient stream failures; user-triggered turn aborts remain non-retryable.

---

## What's done well

- **Loop robustness is excellent.** Length-continuation, no-tool-synthesis with empty-retry, read-loop escalation, repetition fingerprinting (consecutive + windowed), gateway required-field repair, write-outcome ledger for grounding, and duplicate-write dedup are all careful, tested, and address real failure modes. The `empty-synthesis-retry` and `read-loop-synthesis` regression tests guard the exact "searched a lot, never answered" class.
- **Cancellation correctness (O8).** Cancellation is keyed strictly on `signal.aborted`, never on error-message substrings — so provider timeouts and socket drops surface as real errors instead of being silently swallowed as "user cancelled." This is a subtle and correct call.
- **Crash-recovery persistence (D4).** Writes are persisted incrementally as each tool completes (with `null` message_id), then reconciled to the assistant message at end-of-turn by `(turn_run_id, sequence_index)` — a mid-turn lambda kill still leaves a durable record of applied writes.
- **Single-running-turn admission + stale-turn reclaim.** Prevents duplicate concurrent turns per session and reclaims genuinely stale ones after the detached-turn window.
- **Observability is thorough.** `chat_turn_runs`, `timing_metrics`, `chat_prompt_snapshots`, `chat_turn_events`, per-pass LLM metadata, tool traces, skill-gate telemetry. This audit was _possible_ precisely because the instrumentation is dense. The first-byte 6ms and stage timings are all measured.
- **The refactor is clean.** `stream-orchestrator/` splits orchestration / validation / repair / finalization / classification into focused, independently-tested modules (423 service tests passing) without rewriting the state machine.
- **Lean discovery + on-demand materialization.** Only discovery tools mount at launch; write tools materialize on first need and auto-execute in the same round, with the round cap (12, near-limit 9) raised specifically to pay for the materialize round-trip.

---

## Prioritized fix list

| #   | Fix                                                                                                                                                                   | Effort | Impact                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------- |
| 1   | **Retry LLM stream errors** (bounded, transient-only, non-cancellation) in `llm-pass-runner` — fixed 2026-07-08                                                       | S      | High — kills the #1 turn-failure mode           |
| 2   | **Add SSE `:ping` heartbeat** (~12s) for the turn duration — fixed 2026-07-08                                                                                         | S      | High — eliminates idle-timeout stream drops     |
| 3   | **Delete dead block** `+server.ts:2995-3003` — rechecked 2026-07-08; duplicate block is no longer present                                                             | XS     | Low (hygiene)                                   |
| 4   | **Per-pass LLM timeout** (~60s) composed with the turn signal — fixed 2026-07-08                                                                                      | S      | Medium — fail-fast + recover with #1            |
| 5   | **Investigate `missing_key` 40% + `stale_harness` 28%** in prewarm; same-key send-race mitigation shipped 2026-07-08 and stale-harness diagnostics shipped 2026-07-09 | M      | Medium — recover the prewarm win                |
| 6   | **First-token affordance**: emit a visible planning cue on first tool_call, not only on sentence-completion                                                           | S      | Medium — perceived latency                      |
| 7   | **Tag no-evidence finalization** with a distinct `finished_reason` (not `stop`) — fixed 2026-07-08                                                                    | XS     | Medium — stop masking non-answers as success    |
| 8   | **Cap skill-gate surfaced list to top-3 + lead with `default_skill_id`** — fixed 2026-07-08                                                                           | S      | Medium — better skill selection on a weak model |
| 9   | **Narrow ontology context** after a turn focuses on an entity — fixed 2026-07-08                                                                                      | M      | Medium — prompt-size / latency                  |
| 10  | **Per-pass model tiering** (fast first-token model for route/plan pass) — deterministic A/B implemented 2026-07-08                                                    | M      | Medium — first-token latency                    |

**Next:** Continue #5 from production telemetry: confirm whether `missing_key` drops after the client handoff, then inspect `prepared_prompt_cache_checked` events for remaining `stale_harness` rows by surface profile, prompt/surface age, and prepared-vs-actual harness/tool hashes before changing any signature tolerance.

---

## Answers to the three questions

1. **Speed / responsiveness.** The harness itself is fast: first frame in 6ms, context build 2ms, tool selection ~1ms. The _perceived_ speed is limited by the model — 9s to first token (p50), 30s median total turn. The fixes are model-side (tiering, prompt shrink) and UX-side (earlier affordance, heartbeat), not harness-logic-side.
2. **Capability / smartness / error tolerance.** High. Edge-case handling (length truncation, empty synthesis, read loops, repetition, validation failures, cancellation, crash recovery) is more thorough than typical. The biggest robustness holes called out in this audit — un-retried LLM stream errors, missing SSE heartbeat, and no per-pass LLM timeout — are now fixed.
3. **Overall quality — do the skills and tool calls make sense?** Yes. Tools are cleanly organized into gateway surfaces with sensible keyword routing and lean on-demand discovery; validation + repair give the model good self-correction signal (only 9 validation failures in 14 days). Skills are keyword-triggered with a soft one-nudge gate — the main improvement is trimming the recommendation list so a weak model chooses better. The architecture is sound; the remaining wins are latency, prompt-size reduction, and clearer synthesis-quality telemetry.
