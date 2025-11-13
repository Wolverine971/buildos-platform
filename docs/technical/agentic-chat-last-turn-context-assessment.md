# Agentic Chat – Last Turn Context & Compression Audit

## Flow recap

- Entry point `apps/web/src/routes/api/agent/stream/+server.ts:420-520` parses the request, stores the latest user message, decides whether to trust the client-provided `lastTurnContext`, and otherwise calls `generateLastTurnContext()` (lines 220-301) against whatever portion of the chat history was loaded.
- The assembled context is passed into `AgentChatOrchestrator` which simply re-emits any `lastTurnContext` it was handed back to the UI via SSE (`apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts:136-168`).
- The Svelte client stores whatever `last_turn_context` event it sees and blindly re-sends that payload on the _next_ POST (`apps/web/src/lib/components/agent/AgentChatModal.svelte:382-396` and `476-482`).
- Context assembly for the planner (`apps/web/src/lib/services/agent-context-service.ts:545-599`) prepends the supplied last-turn summary as a synthetic system message and then either forwards the full history or truncates it when token estimates exceed the budget.

## Findings

### 1. Last-turn context freezes after it is first generated

- The API only regenerates `lastTurnContext` when the incoming request omits it (`apps/web/src/routes/api/agent/stream/+server.ts:430-456`). Once the UI has _any_ non-null value, the regeneration branch is skipped forever.
- The UI never clears its cached value between turns (`apps/web/src/lib/components/agent/AgentChatModal.svelte:389-396` & `476-482`), so starting on turn 3 every request carries a stale summary (the one produced before turn 2). The orchestrator happily replays the stale object back to the UI, which keeps overwriting its local state with the same data—no opportunity to advance the context.
- Net effect: downstream services (strategy analysis, planner prompt, tool heuristics) keep seeing the very first summary while the real conversation diverges. Any entities/tool IDs recorded after turn 1 are invisible to the planner, defeating the entire continuity mechanism.

### 2. Conversation “compression” is a hard truncation, not a strategic summary

- Despite injecting `ChatCompressionService` into `AgentContextService`, `processConversationHistory()` never invokes it; when tokens exceed the planner budget it simply slices the last 10 messages (`apps/web/src/lib/services/agent-context-service.ts:571-588`).
- The more sophisticated `compressConversationForPlanner()` helper that would delegate to the compression service exists (`apps/web/src/lib/services/agent-context-service.ts:1050-1108`) but is unused anywhere in the codebase. This means entity/tool context outside the last 10 turns is silently dropped with no summary message, contradicting the “strategically and thoughtfully summarize” requirement.
- Because last-turn context is already stale (finding #1), this truncation removes the only remaining reference to the latest assistant response whenever the history spills over the token cap.

### 3. Context shifts do not refresh the last-turn snapshot

- Tool results can emit a `context_shift` payload, and the API updates the session plus emits an SSE event (`apps/web/src/routes/api/agent/stream/+server.ts:488-520`), but no new `lastTurnContext` is generated at that point.
- The UI handles the visual state change (`apps/web/src/lib/components/agent/AgentChatModal.svelte:626-652`) yet leaves `lastTurnContext` untouched, so the object it keeps sending references the prior scope even though the session context/entity has flipped.
- On the next request the server trusts the stale client-supplied context (see finding #1), so planner prompts still contain the old summary/entities. Any entity IDs emitted by the context-shifting tool call are never captured in the next turn’s context, which defeats the goal of remembering the newly created project/task.

## Recommendations

1. **Regenerate last-turn context every turn server-side.** Ignore the client-provided blob (or treat it as a hint) and always call `generateLastTurnContext()` against the latest persisted history before invoking the orchestrator. Additionally, recompute once more after persisting the assistant/tool messages and push the fresh snapshot back to the UI via SSE so the client can display it without blocking the next request.
2. **Wire up real compression.** Replace the `history.slice(-10)` block in `processConversationHistory()` with a call to `compressConversationForPlanner()` (and ensure that helper uses `ChatCompressionService.smartCompress` so tool calls + entity mentions survive). Send the resulting summary chunk as a clearly labeled system message so the planner understands what was condensed.
3. **Reset or overwrite `lastTurnContext` on the client when the server promises to recompute.** E.g., set it to `null` when dispatching a message so the API does not skip regeneration, or better yet stop sending it from the client entirely once the server unconditionally derives it.
4. **Update context after shift events.** When a tool result includes `context_shift`, immediately synthesize a new `LastTurnContext` that references the new entity (`project_id`, etc.) and emit it as part of the SSE stream. This keeps the UI and planner prompts aligned with the new scope even before the next user turn begins.
5. **Add regression tests.** Instrument `AgentContextService.processConversationHistory()` and an end-to-end chat flow test to assert that: (a) compression yields a summary message instead of simple truncation, and (b) each turn’s SSE stream delivers an updated `last_turn_context` whose entity IDs reflect the latest tool calls/context shifts.

Addressing the above will restore a natural flow: the planner will always see the most recent summary, compressed history will remain intelligible, and context shifts will propagate instantly to both client and backend prompts.
