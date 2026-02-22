<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_V2_STREAM_FULL_AUDIT_2026-02-22.md -->

# Agentic Chat V2 Stream — Full Audit

**Date:** 2026-02-22
**Files audited:**

- `apps/web/src/routes/api/agent/v2/stream/+server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts`
- `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts`
- `apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts`
- `apps/web/src/lib/services/agentic-chat-v2/limits.ts`
- `apps/web/src/lib/services/agentic-chat/tools/registry/gateway-config.ts`

---

## Architecture Overview

The V2 stream is a three-layer system:

- **`+server.ts`** — request gate, context loading, SSE wiring, persistence, recovery callbacks
- **`stream-orchestrator.ts`** — the `streamFastChat` loop: multi-round tool use, validation, recovery
- **`master-prompt-builder.ts` / `tool-selector.ts`** — what the model sees and what tools it gets

Two modes exist throughout:

- **Gateway mode** (`AGENTIC_CHAT_TOOL_GATEWAY=1`): only `tool_help` + `tool_exec` exposed. The LLM must discover op names and schemas via `tool_help` before calling `tool_exec`.
- **Direct mode**: explicit per-tool definitions (`list_onto_tasks`, `create_onto_task`, etc.) passed directly to the LLM.

Many bugs only appear in one mode. Several bugs interact and compound.

---

## Validation Status (2026-02-22)

| #   | Finding (original)                              | Validation result              | Notes                                                                                                |
| --- | ----------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 1   | Gateway `project_id` injection failure          | **Not reproducible as stated** | `ToolExecutionService` injects context defaults for gateway ops before execution.                    |
| 2   | Tool history absent + async reconciliation race | **Confirmed (partial)**        | History persistence was text-only; reconciliation was fully async/fire-and-forget.                   |
| 3   | Validation failures burn tool budget            | **Confirmed**                  | Validation-only failures consumed `toolCallsMade`.                                                   |
| 4   | Text streaming stops after round 0              | **Confirmed**                  | Multi-round text buffered and flushed in blocks.                                                     |
| 5   | Single validation retry flag                    | **Confirmed**                  | One later validation failure could terminate loop prematurely.                                       |
| 6   | Autonomous recovery mutates without awareness   | **Confirmed**                  | Synthetic gateway actions bypassed explicit model/user intent.                                       |
| 7   | Mid-loop system message sprawl                  | **Confirmed (design risk)**    | Multiple independent repair system messages were injected in-tool loop.                              |
| 8   | Context cache stale after context shift         | **Confirmed (hardening)**      | Cache key relied on request context; no shift-aware cache bypass hint existed.                       |
| 9   | `conversationHistory` empty in serviceContext   | **Confirmed**                  | Tool execution context always received `conversationHistory: []`.                                    |
| 10  | Calendar intent overly broad (`time`/`date`)    | **Confirmed**                  | Triggered calendar tooling for generic language.                                                     |
| 11  | Reconciliation snapshots lost tool linkage      | **Confirmed (hardening)**      | Snapshot format lacked explicit `tool_call_id`/tool message linkage for current turn reconciliation. |

---

## Critical Bugs

### 1. Project ID injection does not work in gateway mode (not reproduced in current code)

**File:** `+server.ts:1998–2031`

In **non-gateway mode**, the tool executor applies `patchToolCall` which injects `project_id` into tool args when the LLM omits it:

```typescript
: toolExecutorInstance
    ? (toolCall) => toolExecutorInstance.execute(patchToolCall(toolCall))
```

In **gateway mode**, `patchToolCall` is NOT applied to the actual execution:

```typescript
toolExecutionService
    ? async (toolCall) => {
        const result = await toolExecutionService.executeTool(
            toolCall,  // ← raw, unpatched
            serviceContext, ...
        );
```

Meanwhile `onToolCall` always applies `patchToolCall` before emitting to the SSE stream:

```typescript
onToolCall: async (toolCall) => {
    const patchedCall = patchToolCall(toolCall);
    emitToolCall(agentStream, patchedCall, ...);  // UI sees patched
```

**Result:** The UI shows the correct patched tool call (with `project_id`) but the backend executes the unpatched one. When the LLM forgets to include `project_id` in `tool_exec.args`, the operation fails with "Missing required parameter: project_id" — even though the frontend showed the call as valid.

The `serviceContext` passed to `executeTool` contains `contextScope.projectId`, but this only helps if `ToolExecutionService` internally propagates it into the tool args. Whether it does is not guaranteed.

The same gap exists in `sharedToolExecutor` (`+server.ts:1791–1832`): it builds a `ChatToolCall` and passes it to `toolExecutorInstance.execute(call)` without `patchToolCall`, so the injection bypass exists at multiple levels in gateway mode.

**Validation update:** current `ToolExecutionService` gateway path applies context defaults (including `project_id`) during op normalization before execution, so this specific failure mode is not reproduced on current code.

---

### 2. Tool history is completely absent between turns

**File:** `+server.ts:2177–2183`

The only data persisted to the database after each turn is:

```typescript
sessionService.persistMessage({
	sessionId: session.id,
	userId,
	role: 'assistant',
	content: assistantText.trim(), // ← final text only
	usage
});
```

Tool calls, tool results, and intermediate assistant text from within the tool loop are all discarded. The LLM in the next turn sees only user/assistant text pairs. It has no visibility into:

- What it searched or queried
- Which IDs it discovered
- What mutations it performed
- What tool results it received

**Mitigation:** `agent_state` via `AgentStateReconciliationService` is supposed to accumulate entity references across turns. But that reconciliation is **fully async and not awaited**:

```typescript
void (async () => {
    const reconciliation = new AgentStateReconciliationService(...);
    // ... async reconciliation
    if (updated) {
        await updateAgentMetadata(...);  // ← not awaited by caller
    }
})().catch(...);
```

If the user sends a follow-up message before reconciliation completes (which is common in fast back-and-forth), the next turn uses stale agent state. The model then re-queries data it already fetched, asks for IDs it already knows, and loses confidence about what it actually changed.

---

### 3. Validation failures consume the tool call budget

**File:** `stream-orchestrator.ts:582–586`

```typescript
for (const toolCall of pendingToolCalls) {
    toolCallsMade += 1;  // ← incremented even for validation failures
    if (toolCallsMade > maxToolCalls) {
        markToolLimitReached('call');
```

`toolCallsMade` increments for every tool call that fails validation — before any execution attempt. If the model emits 5 tool calls with malformed args, that counts as 5 against the 40-call budget. On a retry attempt, the model starts with 5 already consumed.

With large batches and repeated validation failures this depletes the budget through failed validation rounds, with zero useful work accomplished. The model then hits the call limit and gets a "safety limit" termination message.

---

## Significant Design Issues

### 4. Text streaming stops during tool rounds

**File:** `stream-orchestrator.ts:450–455`

```typescript
if (event.type === 'text' && event.content) {
	assistantBuffer += event.content;
	if (toolRounds === 0) {
		// ← only round 0 streams live
		assistantText += event.content;
		await onDelta(event.content);
	}
}
```

After round 0, all LLM text goes into `assistantBuffer` and only flushes when a pass completes with no pending tool calls:

```typescript
if (toolRounds > 0 && assistantBuffer && pendingToolCalls.length === 0) {
	assistantText += assistantBuffer;
	await onDelta(assistantBuffer); // ← bulk dump, not stream
}
```

Intermediate responses like "I found 3 tasks, now I'll update them..." appear as a sudden block rather than a live stream. For multi-tool tasks, the UI appears frozen during tool rounds. The `RESPONSE_PATTERN` instruction in the system prompt tells the model to always write text before tool calls — this text streams in round 0, then the behavior changes silently from the user's perspective.

---

### 5. Single validation retry flag causes premature termination

**File:** `stream-orchestrator.ts:621–630`

```typescript
if (!validationRetryUsed) {
    validationRetryUsed = true;
    messages.push({ role: 'system', content: buildToolValidationRepairInstruction(...) });
    continue;  // give model one more chance
}
break;  // second failure → terminate entire session
```

`validationRetryUsed` is a session-global flag set once and never reset. After one validation failure and repair attempt, **any subsequent validation failure immediately terminates the tool loop**. If the model correctly handles the repair but later slightly misformats a completely different tool call, the agent exits rather than issuing another targeted repair.

---

### 6. Autonomous recovery actions bypass LLM awareness

**File:** `stream-orchestrator.ts:306–421`

`attemptDocOrganizationRecovery` issues synthetic tool calls directly — no LLM decision involved:

```typescript
for (let index = 0; index < unlinkedDocIds.length; index += 1) {
	const documentId = unlinkedDocIds[index];
	await executeSyntheticGatewayExec('onto.document.tree.move', {
		project_id: candidateProjectId,
		document_id: documentId,
		new_position: rootCount + index
	});
}
```

This fires when repeated `document_id` missing errors are detected. It silently reorganizes documents without:

- User confirmation
- LLM awareness of the change
- Rollback capability

The LLM continues its work after this with a changed document tree it was never told about. The synthetic calls also alter the `toolCallsMade` counter, consuming budget for autonomous actions.

`attemptRootHelpListingRecovery` similarly fires `onto.project.list` and `onto.task.list` automatically when the model loops on `tool_help("root")`.

---

### 7. Mid-conversation system message injection confuses the model

**File:** `stream-orchestrator.ts:719–784`

Multiple `role: 'system'` messages are pushed mid-conversation during tool loops:

- `buildReadLoopRepairInstruction` — when the model repeats the same reads
- `buildRootHelpLoopRepairInstruction` — after 2+ `tool_help("root")` calls
- `buildGatewayRequiredFieldRepairInstruction` — after 2+ missing-field failures
- `buildToolValidationRepairInstruction` — after any validation failure

These arrive after the model has formed a plan. Some models don't handle mid-conversation system messages predictably. The repair instructions can conflict with the original system prompt instructions and with each other, resulting in the model becoming inconsistent or ignoring one set of instructions.

---

### 8. Context cache not invalidated after context shifts

**File:** `+server.ts:1755–1921`

The cache key is built from the **request** parameters, not the effective parameters:

```typescript
const cacheKey = buildContextCacheKey({ contextType, entityId, projectFocus });
```

When a `context_shift` mid-turn changes `effectiveContextType` / `effectiveEntityId`, the session cache is not invalidated. If the frontend doesn't update its next request's context parameters from the `context_shift` SSE event, the next request uses cached data from the old context for up to 2 minutes.

Even when the frontend does update correctly, there's a brief window between the context shift and cache expiry where stale context data can be used.

---

### 9. `conversationHistory` is always empty in `serviceContext`

**File:** `+server.ts:2009`

```typescript
const serviceContext: ServiceContext = {
	sessionId: session.id,
	userId,
	contextType: effectiveContextType,
	entityId: effectiveEntityId ?? undefined,
	conversationHistory: [], // ← always empty
	contextScope
};
```

Any tool implementation that uses `context.conversationHistory` to make smarter decisions always sees an empty array. This is separate from the history sent to the LLM — this is the context available to the server-side tool executor itself.

---

## Minor Issues

### 10. Calendar intent patterns are too broad

**File:** `tool-selector.ts:55–57`

```typescript
(/\btime\b/i, /\bdate\b/i);
```

These patterns match nearly any project management conversation. "It will take time to complete" or "the date we discussed" will enable all calendar tools regardless of intent, inflating tool count and wasting context window tokens.

---

### 11. History messages lose `tool_call_id` linkage in reconciliation input

**File:** `+server.ts:2232–2238`

```typescript
const summarizerMessages: AgentStateMessageSnapshot[] = [
    ...history.map((item) => ({
        role: item.role,
        content: item.content  // ← tool_call_id stripped
    })),
```

Tool result messages from `historyForModel` are flattened to `role` + `content`, losing the `tool_call_id` linkage. If `AgentStateReconciliationService` needs this linkage to associate results with calls, it can't reconstruct the relationship.

---

## Root Cause: Why Agents Don't Understand Tools

The fundamental problem is an architecture where **the LLM loses all tool context between turns**, combined with **async state reconciliation that frequently loses the race against the next user request**.

The model starts each turn near-blind about what it did in prior turns, relying on three weak signals:

1. Compressed `agent_state` JSON — often stale due to the async reconciliation race
2. `lastTurnContinuityHint` text — only one turn back, no tool call details
3. Context data snapshot — may be 2 minutes stale

When the model can't see what it accomplished, it re-explores. Repeated `tool_help("root")` calls trigger the root-loop recovery, which injects conflicting repair instructions, which further destabilizes the model's plan. The gateway loop is especially fragile here because the model must:

1. Learn the `onto.*` op namespace through discovery
2. Maintain op names correctly across calls
3. Include correct UUIDs from prior turns (which it can't see)
4. Handle repair system messages that arrive mid-plan
5. All without any cross-turn tool memory

---

## Priority Fix Order

| Priority | Issue                                                                 | Primary files                                                               | Status  |
| -------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------- |
| 1        | Fix tool-budget accounting + validation retry semantics (#3, #5)      | `stream-orchestrator.ts`                                                    | ✅ Done |
| 2        | Gate autonomous recovery mutations/actions (#6)                       | `stream-orchestrator.ts`, `+server.ts`                                      | ✅ Done |
| 3        | Improve cross-turn memory reliability (#2)                            | `+server.ts`, `session-service.ts`                                          | ✅ Done |
| 4        | Populate `conversationHistory` in tool service context (#9)           | `+server.ts`                                                                | ✅ Done |
| 5        | Restore live text streaming across tool rounds (#4)                   | `stream-orchestrator.ts`                                                    | ✅ Done |
| 6        | Consolidate repair instruction injection (#7)                         | `stream-orchestrator.ts`                                                    | ✅ Done |
| 7        | Narrow calendar intent triggering (#10)                               | `tool-selector.ts`, `tool-selector.test.ts`                                 | ✅ Done |
| 8        | Hardening: shift-aware cache bypass + richer reconciliation snapshots | `+server.ts`, `agent-state-reconciliation-service.ts`, `session-service.ts` | ✅ Done |

### Remediation Notes

- Autonomous recovery is now **feature-gated** via `FASTCHAT_ENABLE_AUTONOMOUS_RECOVERY` (default off).
- Assistant message persistence now stores compact tool trace metadata for next-turn continuity.
- Reconciliation now includes current-turn tool message snapshots with `tool_call_id` linkage and uses bounded wait before stream completion.
