# Agentic Chat Assessment — 2025-11-18

<!-- todo check  -->

## Scope

- Manual review of the agentic chat UI (`apps/web/src/lib/components/agent/AgentChatModal.svelte`) and the refactored backend streaming flow (`apps/web/src/routes/api/agent/stream/+server.ts` plus dependent services).
- Goal: surface regressions introduced by the recent architecture refactor before shipping broadly.

## High-Risk Findings

1. **Context selection clears itself immediately**
    - Location: `apps/web/src/lib/components/agent/AgentChatModal.svelte:450` and `apps/web/src/lib/components/agent/AgentChatModal.svelte:472`.
    - `handleContextSelect` assigns the new context but then calls `resetConversation()`, which wipes `selectedContextType`, `selectedEntityId`, and the label. Result: the modal snaps back to the focus picker and the user can never start a session.
    - Fix: either reorder the operations (`resetConversation()` first) or stop `resetConversation()` from touching the context fields when we actually want to preserve them.

2. **Planner context-shift events are dropped on the client**
    - Location: `apps/web/src/routes/api/agent/stream/+server.ts:441` emits a `context_shift` message, but `handleSSEMessage` in `apps/web/src/lib/components/agent/AgentChatModal.svelte:657` has no branch for this type.
    - Impact: after project creation flows, the UI never updates to the new project context, so every follow-up message is routed with stale metadata. Users see stale badges and further agent calls miss the new `entity_id`.
    - Fix: add a case that updates `selectedContextType`, `selectedEntityId`, labels, and appends a user-facing activity message.

3. **Tool execution service can’t run any tools**
    - Location: `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts:72-123`.
    - The service expects `toolCall.name` / `toolCall.arguments`, but new calls are created in `createAgentChatOrchestrator()` using the OpenAI-style shape (`toolCall.function.name`, `toolCall.function.arguments`). Validation therefore fails with “Unknown tool: undefined”, and zero tools ever execute on the simple strategy path.
    - Fix: read the function-field variant, propagate the resolved name everywhere, and parse the arguments from the function payload before invoking the executor.

## Recommended Remediation Plan

1. Patch `resetConversation()` so it only deals with message/session state; let callers explicitly clear context when desired.
2. Teach `handleSSEMessage` how to process `context_shift` events (state updates + activity log).
3. Normalize tool call handling inside `ToolExecutionService` (resolve names/args once, reuse throughout) and add regression coverage for a simple research tool call.

All fixes will be implemented immediately after this write-up.
