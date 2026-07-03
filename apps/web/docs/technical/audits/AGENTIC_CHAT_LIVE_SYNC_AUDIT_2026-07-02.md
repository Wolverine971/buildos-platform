<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_LIVE_SYNC_AUDIT_2026-07-02.md -->

# Agentic Chat Live Sync Audit - 2026-07-02

**Trigger:** live Agentic Chat modal did not show created/updated changes until history was opened.

**Scope:** backend-to-frontend data propagation for the Agentic Chat modal: v2 stream route, tool execution services, SSE handler, thinking-block metadata, live timeline derivation, restored session hydration, activity tabs, and step/support exports.

**Status:** research document only. No application code was changed in this pass.

**Method:** traced each suspected contract from producer to consumer:

1. backend tool execution and v2 stream SSE payload
2. stream handler and modal thinking-block state
3. live timeline derivation from in-memory messages
4. persisted session API and restored timeline
5. user-facing consumers: tabs, thinking block, exports
6. tests and existing audit docs to verify coverage and prior intent

Every finding below is marked:

- **CONFIRMED** - current code path demonstrates the issue.
- **CONTRACT GAP** - the protocol supports a field/event, but current production producers appear dormant or incomplete.
- **DOWNGRADED** - initial assessment was too broad after checking current producers/consumers.
- **NON-FINDING** - type drift or legacy support exists, but no active emitting path was found.

---

## Executive summary

The original live Changes-tab bug sits in a broader pattern:

- **History is built from `chat_tool_executions` rows and server-built `timelineItems`.**
- **Live modal tabs are built from in-memory `messages`, especially thinking-block activities.**
- Any field that is persisted into `chat_tool_executions` but not copied into thinking-block activity metadata can appear in history/exports later while being absent or less informative during the active stream.

The highest-confidence remaining fix is to make live tool activity metadata look more like the persisted `TimelineToolExecutionRow` shape. The system already has the rendering logic for richer fields; the live path just does not populate enough of them.

The highest-risk assumption from the first assessment was `stream_events`: the lower layers preserve the contract, and the route currently drops it, but I found no current executor producing `_stream_events`. That makes it a real contract gap, not a likely explanation for the user-visible Changes-tab issue.

---

## Data-flow map

### Live stream path

1. `ChatToolExecutor.execute()` dispatches the underlying tool and can extract `_stream_events` plus token metadata.
    - `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor.ts:227-247`
    - `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor.ts:580-601`
2. `ToolExecutionService.executeTool()` converts service execution into a `ToolExecutionResult`.
    - `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts:545-556`
3. The v2 stream route maps that result back into a `ChatToolResult`.
    - `apps/web/src/routes/api/agent/v2/stream/+server.ts:3287-3315`
4. The stream route emits `{ type: 'tool_result', result: payload }`.
    - `apps/web/src/routes/api/agent/v2/stream/+server.ts:1114-1133`
5. `createSSEHandler()` handles `tool_result`, updates a thinking-block activity, and records created/mutated entities.
    - `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts:147-159`
    - `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts:390-425`
6. `AgentChatModal.updateActivityStatus()` stores selected result fields into activity metadata.
    - `apps/web/src/lib/components/agent/AgentChatModal.svelte:1518-1595`
7. `timelineItemsFromMessages()` converts live thinking-block activities into `AgentTimelineItem`s.
    - `apps/web/src/lib/components/agent/agent-chat-timeline.ts:904-990`
8. `AgentChatActivityTabs` displays Steps, Tools, and Changes from `agentTimelineItems`.
    - `apps/web/src/lib/components/agent/AgentChatModal.svelte:202-207`
    - `apps/web/src/lib/components/agent/AgentChatActivityTabs.svelte:69-83`

### History path

1. The stream route persists `chat_tool_executions`.
    - `apps/web/src/routes/api/agent/v2/stream/+server.ts:1443-1504`
2. The session API selects richer execution fields including `result_count`, `zero_result`, `tokens_consumed`, `requires_user_action`, and `affected_entities`.
    - `apps/web/src/routes/api/chat/sessions/[id]/+server.ts:464-494`
3. The session API builds timeline items server-side from persisted rows.
    - `apps/web/src/routes/api/chat/sessions/[id]/+server.ts:573-581`
4. The modal hydrates `persistedTimelineItems` from the snapshot and merges them with live items.
    - `apps/web/src/lib/components/agent/agent-chat-session.ts:1070-1073`
    - `apps/web/src/lib/components/agent/AgentChatModal.svelte:1198-1199`

### Important integration detail

The modal does **not** generally refresh session history on normal stream completion. It only schedules a 2s refresh loop for restored active turns.

- `apps/web/src/lib/components/agent/AgentChatModal.svelte:652-660`
- `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts:499-513`

So "history will eventually fix it" is not a sufficient live-chat solution. During the active modal session, `timelineItemsFromMessages()` is the critical path.

---

## Finding L1 - live tool timeline drops persisted telemetry fields

**Status:** CONFIRMED

**Severity:** medium-high for live diagnostics and exports; medium for the visible tab UI.

### What is happening

The backend persists these fields for tool executions:

- `result_count`
- `zero_result`
- `tokens_consumed`
- `requires_user_action`
- `affected_entities`

The persisted timeline builder knows how to use several of them:

- `result_count` and `zero_result` become summary text such as `0 results` or `No results returned`.
- `tokens_consumed` flows into `item.tool.tokensConsumed`.
- `requires_user_action` can turn status into `needs_input`.

References:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts:1479-1494`
- `apps/web/src/routes/api/chat/sessions/[id]/+server.ts:481-488`
- `apps/web/src/lib/components/agent/agent-chat-timeline.ts:512-561`

The live path does not pass most of those fields into `buildToolTimelineItem()`:

- `apps/web/src/lib/components/agent/agent-chat-timeline.ts:937-955`

`AgentChatModal.updateActivityStatus()` currently stores `result`, `response`, `durationMs`, and `tokensConsumed`, but not `resultCount`, `zeroResult`, `requiresUserAction`, `streamEvents`, `toolCategory`, or `helpPath`:

- `apps/web/src/lib/components/agent/AgentChatModal.svelte:1553-1586`

`tokensConsumed` is stored in activity metadata, but `timelineItemsFromMessages()` still does not map it into the temporary `TimelineToolExecutionRow`. That means even this already-captured live field does not reach the timeline item.

### User-visible effect

The visible Tools tab primarily uses `item.title`, `item.summary`, `item.tool.name`, `item.tool.gatewayOp`, and `item.tool.durationMs`.

- `apps/web/src/lib/components/agent/AgentChatActivityTabs.svelte:257-284`

So result-count telemetry improves the visible UI through the summary, not through badges. Step/support exports do use the richer `tool` fields:

- `apps/web/src/lib/components/agent/agent-chat-step-export.ts:428-435`

### Assumption stress test

**Bad assumption:** simply preserving the raw tool result in metadata is enough.

**Verified correction:** the raw response can sit in metadata and still not affect the live tab unless `timelineItemsFromMessages()` maps the metadata into `TimelineToolExecutionRow` fields.

### Fix that should work

Use a shared live tool-result metadata normalizer:

1. In `AgentChatModal.updateActivityStatus()`, copy root-level tool-result fields into activity metadata:
    - `tokensConsumed`
    - `resultCount`
    - `zeroResult`
    - `requiresUserAction`
    - `streamEvents`
    - `toolCategory`
    - `helpPath`
2. In `timelineItemsFromMessages()`, map those metadata fields into the same snake_case row shape that `buildToolTimelineItem()` already expects:
    - `tokens_consumed`
    - `result_count`
    - `zero_result`
    - `requires_user_action`
    - `tool_category`
    - `help_path`
3. Add tests that build live thinking-block messages with these metadata fields and assert the resulting timeline item summary/status/tool fields match persisted rows.

### Why this integrates cleanly

No UI component needs to learn a new shape. `buildToolTimelineItem()` already has the canonical mapping and `AgentTimelineToolSummary` already has the output fields.

- `apps/web/src/lib/components/agent/agent-chat-timeline.ts:55-78`
- `apps/web/src/lib/components/agent/agent-chat.types.ts:65-79`

No DB schema change is needed.

### Risk

Avoid storing enormous `streamEvents` or full raw outputs in visible detail panes by default. Keep the current `redactedJsonPreview()` path for result previews and only expose `streamEvents` deliberately if a current producer appears.

---

## Finding L2 - search telemetry is persisted but not sent on live SSE

**Status:** CONFIRMED

**Severity:** medium. This does not explain missing created-entity changes, but it is the same live-vs-history mismatch class.

### What is happening

Search telemetry was intentionally added after an earlier audit because zero-result searches are a key search-quality signal:

- `apps/web/docs/technical/audits/AGENTIC_CHAT_SEARCH_AUDIT_2026-06-17.md:68-80`

The live persistence path computes it:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts:1458-1480`

The route also computes it for dev-only logging:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts:3468-3480`

But `buildToolResultEventPayload()` just spreads the original `ChatToolResult` and adds `tool_name` / `tool_call_id`.

- `apps/web/src/routes/api/agent/v2/stream/+server.ts:1114-1119`

The `ChatToolResult` returned by the route's `toolExecutor` currently includes `tool_call_id`, `result`, `success`, `error`, `duration_ms`, and `tokens_consumed`, but not `result_count` or `zero_result`.

- `apps/web/src/routes/api/agent/v2/stream/+server.ts:3303-3315`

### Assumption stress test

**Bad assumption:** the frontend can derive result counts from the result blob just as easily.

**Verified correction:** the backend already centralized this derivation in `searchTelemetryColumns()`, and the prior search audit explicitly fixed a dead-path issue by using that helper in both writers. Duplicating derivation in the client would create another split-brain path.

- `apps/web/src/lib/services/agentic-chat/tools/core/search-telemetry.ts:57-66`
- `apps/web/src/lib/services/agentic-chat/tools/core/search-telemetry.test.ts:67-107`

### Fix that should work

Add `result_count` and `zero_result` to the live `tool_result` payload using the same `searchTelemetryColumns()` helper that persistence uses.

Best location: `buildToolResultEventPayload(toolCall, result)`.

Reason: it already has both `toolCall.function.name` and `result.result`, and every emitted `tool_result` goes through it.

Pseudo-shape:

```ts
const searchTelemetry = searchTelemetryColumns({
	toolName: toolCall.function.name,
	success: result.success === true,
	result: result.result
});

return {
	...result,
	...(searchTelemetry.result_count !== null ? searchTelemetry : {}),
	tool_name: toolCall.function.name,
	tool_call_id: result.tool_call_id ?? toolCall.id
};
```

Then L1's metadata and live timeline mapping can carry those values to the visible summary/export.

### Why this integrates cleanly

The helper is already imported into the stream route and already used in the same file. The persisted and live paths would share the same derivation.

### Risk

If `result_count` is always added with `null`, the live payload gets noisier with no value. Prefer adding only when non-null, or preserve null only if tests depend on exact shape.

---

## Finding L3 - `stream_events` are dropped by the stream route, but no current producer was found

**Status:** CONTRACT GAP, DOWNGRADED

**Severity:** low today; medium if future tools rely on nested stream events.

### What is happening

The lower tool executor supports `_stream_events`:

- extracts `_stream_events`: `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor.ts:588-601`
- returns `stream_events`: `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor.ts:241-247`

The shared execution service preserves those events:

- `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts:534-555`

The v2 stream route then converts the service result into a `ChatToolResult` and omits `stream_events`:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts:3303-3315`

### Assumption stress test

**Initial assumption:** this was likely causing missing live UI data.

**Verified correction:** `rg` found no current executor producing `_stream_events`; current matches are only extractors/types.

Current producers found: none.

Current contract holders:

- `packages/shared-types/src/chat.types.ts:301-302`
- `apps/web/src/lib/services/agentic-chat/shared/types.ts:86-92`
- `apps/web/src/lib/services/agentic-chat/tools/core/executors/types.ts:44`

### Fix that should work

Preserve `stream_events` when mapping the service result to `ChatToolResult`:

```ts
...(Array.isArray(result.streamEvents) ? { stream_events: result.streamEvents } : {})
```

Then store it in activity metadata as `streamEvents`.

### Why this may not make the UI better immediately

No active producer was found, and no Agent Chat component currently renders `streamEvents`. A preservation fix would harden the protocol, but it is not enough to improve the current modal unless a producer and consumer are added.

### Recommendation

Do not prioritize this ahead of L1/L2. If implemented, add a regression test proving service `streamEvents` survive into the emitted `tool_result`.

---

## Finding L4 - `done.finished_reason` is emitted but live status handling is too coarse

**Status:** CONFIRMED

**Severity:** medium for cancelled/truncated/waiting-on-user turns.

### What is happening

The backend emits `finished_reason` on `done`:

- standard completion: `apps/web/src/routes/api/agent/v2/stream/+server.ts:4311-4313`
- cancelled completion: `apps/web/src/routes/api/agent/v2/stream/+server.ts:4044-4046`
- early error helper: `apps/web/src/routes/api/agent/v2/stream/+server.ts:2081-2086`

Tests verify the supervisor-question stream includes:

- `agent_state: waiting_on_user`
- `text_delta` with the question
- `done.finished_reason: supervisor_question`

Reference:

- `apps/web/src/routes/api/agent/v2/stream/server.test.ts:856-870`

The frontend handler ignores the `done` payload and finalizes the thinking block as a normal completion:

- `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts:429-439`
- `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts:589-590`

The stream controller also finalizes as completed in `onComplete`:

- `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts:499-513`

### Assumption stress test

**Bad assumption:** passing the `done` event into `handleDone()` and mapping `cancelled` to `thinking.finalize('cancelled')` is enough.

**Verified correction:** that works for `cancelled` and probably `length`, because handler finalization clears `currentThinkingBlockId`, so the stream controller's later completed finalization becomes a no-op.

Supervisor questions need more care:

- `agent_state: waiting_on_user` is handled correctly before `done`.
- But finalizing the block as `completed` can make `ThinkingBlock.svelte` show a generic completed label before it checks `agentState`.
- Current compact-label priority checks `status === 'completed'` before `agentState === 'waiting_on_user'`.

References:

- `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts:518-527`
- `apps/web/src/lib/components/agent/ThinkingBlock.svelte:49-55`

### Fix that should work

Split terminal handling by `finished_reason`:

- `cancelled` / `canceled` / `aborted`: `thinking.finalize('cancelled')`
- `error`: `thinking.finalize('error')`
- `length`: `thinking.finalize('interrupted', 'Response truncated')`
- `supervisor_question`: preserve the waiting-on-user UI state instead of collapsing to generic completed

The supervisor case likely needs one of these broader changes:

1. Add a thinking-block terminal status such as `waiting_on_user`, or
2. Change `ThinkingBlock.svelte` label priority so `agentState === 'waiting_on_user'` wins even when `status === 'completed'`, or
3. Have `handleDone(supervisor_question)` finalize with a note and update ThinkingBlock display logic to prefer that note.

### Why this integrates cleanly

`finalizeThinkingBlock()` already supports `completed`, `interrupted`, `cancelled`, and `error`.

- `apps/web/src/lib/components/agent/AgentChatModal.svelte:1482-1503`
- `apps/web/src/lib/components/agent/agent-chat.types.ts:175-179`

Cancelled/truncated/error fixes are low-risk. Supervisor waiting state needs a UI contract decision.

### Tests to add

- `done.finished_reason = cancelled` finalizes block as `cancelled`.
- `done.finished_reason = length` finalizes block as `interrupted`.
- `agent_state(waiting_on_user)` followed by `done(supervisor_question)` still renders/labels as waiting for user direction.

---

## Finding L5 - restored thinking blocks drop richer tool execution fields

**Status:** CONFIRMED, lower impact than live-path gaps

**Severity:** low-medium.

### What is happening

The session API fetches rich tool execution rows:

- `apps/web/src/routes/api/chat/sessions/[id]/+server.ts:464-494`

But the client restore type narrows `LoadedChatToolExecution` to a smaller subset:

- `apps/web/src/lib/components/agent/agent-chat-session.ts:82-96`

Then restored thinking-block activity metadata keeps only:

- tool name/op/id
- arguments
- result
- error
- status
- duration

Reference:

- `apps/web/src/lib/components/agent/agent-chat-session.ts:841-860`

### Assumption stress test

**Initial assumption:** this might break history tabs.

**Verified correction:** the session snapshot normally includes server-built `timelineItems`, and the modal uses those directly if present:

- `apps/web/src/lib/components/agent/agent-chat-session.ts:1071-1073`
- `apps/web/src/lib/components/agent/AgentChatModal.svelte:1198-1199`

So restored tabs should retain rich persisted timeline data. The narrower restore mostly affects the restored thinking block and fallback cases when `timelineItems` are absent.

### Fix that should work

Expand `LoadedChatToolExecution` and `RestoredToolActivitySource` to carry the same fields used by `TimelineToolExecutionRow`:

- `tool_category`
- `help_path`
- `result_count`
- `zero_result`
- `tokens_consumed`
- `requires_user_action`
- `affected_entities`

Then include those in restored activity metadata so fallback `timelineItemsFromMessages()` has enough information.

### Why this integrates cleanly

This should reuse the same metadata keys proposed in L1. The live and restored fallback paths should become equivalent.

### Risk

Avoid duplicating all server-built timeline logic in restore. The source of truth should remain `buildAgentTimeline()` for loaded sessions; this fix is for restored thinking-block fidelity and fallback safety.

---

## Finding L6 - `requires_user_action` is a schema/type contract, but no current chat producer was found

**Status:** CONTRACT GAP, DOWNGRADED

**Severity:** low today; medium if Libri/gateway tools begin writing it into chat tool results.

### What is happening

The type and DB schema support `requires_user_action`:

- `packages/shared-types/src/chat.types.ts:301`
- `packages/shared-types/src/database.schema.ts:855`
- `apps/web/src/routes/api/chat/sessions/[id]/+server.ts:487`

`buildToolTimelineItem()` can map it to `needs_input`:

- `apps/web/src/lib/components/agent/agent-chat-timeline.ts:529-531`

But current chat writers do not appear to set it:

- `ChatToolExecutor.logToolExecution()` inserts no `requires_user_action`.
    - `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor.ts:681-702`
- v2 stream persistence row type omits it.
    - `apps/web/src/routes/api/agent/v2/stream/+server.ts:1390-1410`

### Assumption stress test

**Initial assumption:** live UI currently marks user-action-needed tool results as completed.

**Verified correction:** that would happen if a current producer sent `requires_user_action`, but I did not find a current producer in the agentic-chat v2 path. Libri has `needs_input` statuses, but the chat tool execution persistence does not currently translate them into `requires_user_action`.

### Fix that should work

Do not treat this as a frontend-only bug. If `needs_input` should matter in chat:

1. Normalize tool-specific `needs_input` / `requires_user_action` into the `ChatToolResult`.
2. Persist `requires_user_action` in both chat tool execution writers.
3. Pass it through live activity metadata and `timelineItemsFromMessages()`.
4. Decide whether `ActivityEntry.status` should gain `needs_input`, or whether timeline status alone is enough.

### Recommendation

Do this only when a concrete tool path needs it. Otherwise L1/L2 give more user-visible value now.

---

## Finding L7 - requirement context-shift support is type drift, not a one-line backend fix

**Status:** CONFIRMED type drift

**Severity:** low unless requirement-focused chat is intended now.

### What is happening

Shared `ContextShiftPayload.entity_type` includes `requirement`:

- `packages/shared-types/src/agent.types.ts:374-388`

The stream route allowlist omits `requirement` and falls back to `project` for unrecognized entity types:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts:1162-1171`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts:1220-1226`

But the frontend also lacks full requirement support:

- `OntologyEntityKind` omits `requirement`.
    - `apps/web/src/lib/components/agent/agent-chat-tool-presenter.ts:30-38`
- Project focus indicator labels/icons omit `requirement`.
    - `apps/web/src/lib/components/agent/ProjectFocusIndicator.svelte:25-46`
- Project focus selector entity list omits `requirement`.
    - `apps/web/src/lib/components/agent/ProjectEntityList.svelte:53-64`

### Assumption stress test

**Bad assumption:** adding `requirement` to `CONTEXT_SHIFT_ENTITY_TYPES` fixes it.

**Verified correction:** that would only stop backend normalization from downgrading the entity type. The UI still would not expose or consistently label requirement focus.

### Fix that should work

Only implement this if requirement-level chat is in scope:

1. Add `requirement` to the stream allowlist.
2. Add `requirement` to frontend entity kind unions.
3. Add focus selector support for requirements.
4. Add indicator icon/label.
5. Verify URL generation and affected-entity extraction for requirement refs.

### Recommendation

Track as product/type cleanup, not as part of the immediate live Changes-tab fix.

---

## Non-findings and downgraded items

### Legacy/template/ontology SSE events

`AgentSSEMessage` still includes `ontology_loaded`, template creation events, and legacy events:

- `packages/shared-types/src/agent.types.ts:461-489`

The active frontend switch ignores unhandled/legacy events:

- `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts:476-599`

But source search found no active v2 stream emitter for `ontology_loaded` or `template_creation_*`. This is type/legacy drift, not a confirmed live data-loss bug.

### Operation events

The frontend supports `operation` events:

- `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts:568-580`

The active v2 stream route does not appear to emit operation events directly in the normal tool path. Tool calls/results are the effective operation stream. No fix recommended unless a current backend emitter is added.

### Session refresh after completion

The modal has a refresh loop for restored active turns, but not a general "refresh after every stream done" path. Relying on the history API to fix live tab state would introduce delay and extra network work, and would not help during active streaming.

---

## Recommended implementation plan

### Wave 1 - live timeline metadata parity

Goal: live Tools/Changes behave like history-built timeline items for fields we already have.

1. Add a small helper to normalize root `tool_result` metadata:
    - `durationMs`
    - `tokensConsumed`
    - `resultCount`
    - `zeroResult`
    - `requiresUserAction`
    - `streamEvents`
2. Store those keys in `AgentChatModal.updateActivityStatus()`.
3. Map them in `timelineItemsFromMessages()` to `TimelineToolExecutionRow`.
4. Add tests in:
    - `agent-chat-sse-handler.test.ts`
    - `agent-chat-timeline.test.ts`

Expected impact:

- live search tools can summarize `0 results` / `N results`
- live exports include tokens/result count/zero-result
- future `requires_user_action` data will not be silently dropped once producers exist

### Wave 2 - emit live search telemetry

Goal: the backend sends the same search telemetry it persists.

1. Add `result_count` and `zero_result` to `buildToolResultEventPayload()`.
2. Use the existing `searchTelemetryColumns()` helper.
3. Do not duplicate search-count derivation in the frontend.
4. Add stream route tests asserting a search tool `tool_result` includes the fields.

Expected impact:

- no more history-only search telemetry
- no additional database dependency for live UI

### Wave 3 - terminal reason handling

Goal: cancelled, truncated, and waiting-on-user turns should not look like generic successful completions.

1. Pass `done` event into `handleDone(event)`.
2. Map `cancelled` to `thinking.finalize('cancelled')`.
3. Map `length` to `thinking.finalize('interrupted', 'Response truncated')`.
4. For `supervisor_question`, preserve waiting-on-user presentation:
    - either add a `waiting_on_user` block status, or
    - make `ThinkingBlock.svelte` prioritize `agentState === 'waiting_on_user'` over `status === 'completed'`.

Expected impact:

- stop/cancel UI becomes honest
- supervisor questions continue to look like "waiting on your direction"
- truncated completions become visible instead of looking complete

### Wave 4 - restored thinking-block parity

Goal: restored/fallback thinking blocks carry the same metadata as live blocks.

1. Expand `LoadedChatToolExecution` and `RestoredToolActivitySource`.
2. Include rich fields in restored activity metadata.
3. Ensure fallback `timelineItemsFromMessages()` produces equivalent timeline items when `timelineItems` are absent.

Expected impact:

- restored thinking block detail improves
- fallback safety improves if server-built `timelineItems` are absent

### Wave 5 - optional contract hardening

Goal: keep dormant contracts from becoming future bugs.

1. Preserve `stream_events` through the v2 route if present.
2. Add a low-level test for stream event propagation.
3. Defer UI rendering until a real producer appears.
4. Treat requirement focus as a separate product-scope cleanup.

---

## Test plan

### Unit tests

`agent-chat-timeline.test.ts`

- live thinking block with `metadata.resultCount = 0` creates a tool item summary of `0 results` or `No results returned`
- live thinking block with `metadata.tokensConsumed = 45` creates `item.tool.tokensConsumed = 45`
- live thinking block with `metadata.zeroResult = true` creates `item.tool.zeroResult = true`
- live thinking block with `metadata.requiresUserAction = true` creates status `needs_input` if the status contract is added

`agent-chat-sse-handler.test.ts`

- `tool_result` with `tokens_consumed`, `result_count`, `zero_result` passes the full payload to `updateActivityStatus`
- `done.finished_reason = cancelled` finalizes cancelled
- `done.finished_reason = length` finalizes interrupted
- `agent_state waiting_on_user` plus `done supervisor_question` preserves waiting state

`apps/web/src/routes/api/agent/v2/stream/server.test.ts`

- search tool result SSE includes `result_count` and `zero_result`
- service result with `streamEvents` includes `stream_events` in SSE if Wave 5 is implemented

### Manual smoke tests

1. Start a chat and trigger a search expected to return zero results.
2. While still in the live modal, open Tools:
    - expect the search tool summary to show zero-result state.
3. Trigger a create/update tool.
4. While still in live modal, open Changes:
    - expect created/updated item count and item card to appear without opening history.
5. Cancel a long-running response.
    - expect thinking block to show stopped/cancelled, not complete.
6. Trigger a supervisor clarification path.
    - expect final state to read as waiting on user, not generic complete.

---

## Priority recommendation

1. **Wave 1 and Wave 2 together** - best chance of removing live/history divergence with minimal surface area.
2. **Wave 3** - important UX honesty fix, but supervisor-question handling needs a small UI contract decision.
3. **Wave 4** - worthwhile cleanup, lower urgency because server-built `timelineItems` already protect normal history restore.
4. **Wave 5** - protocol hardening, not a current user-visible bug based on current producers.

The immediate goal should be: every live tool activity should carry enough metadata that `timelineItemsFromMessages()` can build the same kind of timeline item as `buildAgentTimeline()` builds from `chat_tool_executions`.
