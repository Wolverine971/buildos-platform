<!-- docs/technical/agentic-chat-flow-followup.md -->

# Agentic Chat Flow – Follow-Up Assessment

The earlier fixes brought the last-turn context and compression flows back in line, but a second pass shows a few remaining weak spots that are worth addressing.

## 1. Planner history compression still discards tool detail

- `processConversationHistory()` now calls `ChatCompressionService.compressConversation` when it exceeds the token budget (`apps/web/src/lib/services/agent-context-service.ts:549-639`), but that helper collapses all but the last four messages into a single system summary (`apps/web/src/lib/services/chat-compression-service.ts:126-234`).
- The smarter `smartCompress()` API (`apps/web/src/lib/services/chat-compression-service.ts:278-355`) was built specifically to preserve tool-call transcripts and group older turns by topic, yet it remains unused.
- **Impact:** once the planner history passes ~2.5k tokens the agent loses the detailed tool-call transcripts that were supposed to survive via “strategic compression,” increasing the odds of redundant tool usage or re-asking clarifications.
- **Recommendation:** switch `processConversationHistory()` to prefer `smartCompress()`; only fall back to the coarse `compressConversation()` summary if the smart path fails so we keep structured tool evidence in the context.
- **Status:** ✅ Implemented. `processConversationHistory()` now tries `smartCompress()` first, falls back to the legacy compression service, and only then trims with a clearly labeled summary (`apps/web/src/lib/services/agent-context-service.ts:192-639`).

## 2. Last-turn entity extraction ignores tool results

- `generateLastTurnContext()` only looks at the arguments of the _tool call_ attached to the final assistant message (`apps/web/src/routes/api/agent/stream/+server.ts:220-301`). Many read-only tools (e.g., searches and list operations) surface the interesting IDs in their **results**, not in their arguments.
- The server already stores each tool result as its own `role='tool'` message (`apps/web/src/routes/api/agent/stream/+server.ts:653-727`), but `generateLastTurnContext()` never inspects those payloads (or the cached `toolResults` array), so `entities.task_ids`/`goal_ids` remain empty after read-only operations.
- **Impact:** even after the agent lists or inspects a task, the next turn’s planner prompt still lacks the entity IDs it just discovered, forcing the planner to repeat lookups.
- **Recommendation:** augment `generateLastTurnContext()` to parse the most recent `tool_result` payloads (or the `entitiesAccessed` metadata we already compute in `ToolExecutionService`) so entity IDs gleaned from tool responses are persisted into the last-turn context.
- **Status:** ✅ Implemented. The generator now ingests `tool_result` payloads (including `entities_accessed`) and recursively extracts IDs so read-only research flows populate `project_id`, `task_ids`, etc. (`apps/web/src/routes/api/agent/stream/+server.ts:220-360`).

## 3. Mid-turn context shifts don’t update the planner’s execution context

- When a tool triggers a `context_shift`, the API updates the session row and streams the new context plus a synthetic last-turn snapshot (`apps/web/src/routes/api/agent/stream/+server.ts:520-610`). However, the active `AgentChatOrchestrator` keeps running with the original `contextType`/`lastTurnContext` that were captured at request start (`apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts:106-171`).
- **Impact:** if the planner still has pending steps after the shift (e.g., create project ➝ immediately list its tasks), those steps are executed as if the session were still in the pre-shift context until the next user turn kicks off.
- **Recommendation:** propagate context-shift events back into the orchestrator (e.g., via a callback that refreshes `serviceContext.contextType`/`entityId` and appends the synthesized last-turn context to the planner messages) or, at minimum, short-circuit the current turn so the planner re-runs under the new scope on the following request.
- **Status:** ✅ Implemented. Tool-result context shifts now mutate the orchestrator’s in-flight `serviceContext` (context type, entity ID, and last-turn snapshot), so subsequent planner steps honor the new scope immediately (`apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts:260-360,640-720`).

These updates keep the “short-term memory” meaningful even when compression kicks in, ensure entity IDs survive read-only research flows, and eliminate the lag between a context shift and the planner actually recognizing it.
