---
date: 2026-01-03T12:38:25-0600
researcher: Codex
git_commit: f7587250c2109070d8cf48cb5c7a287529755900
branch: main
repository: buildos-platform
topic: 'Agentic chat flow audit (frontend to /api/agent/stream)'
tags: [research, agentic-chat, streaming, tools, prompts, performance]
status: complete
last_updated: 2026-01-03
last_updated_by: Codex
---

# Research: Agentic chat flow audit (frontend to /api/agent/stream)

**Date**: 2026-01-03T12:38:25-0600
**Researcher**: Codex
**Git Commit**: f7587250c2109070d8cf48cb5c7a287529755900

## Research Question

Where are the bugs, mismatches, and performance risks across the AgentChatModal -> SSE -> agentic chat services -> tools/prompts flow, and how can the system be made more responsive and user friendly?

## Summary

- The frontend currently blocks "send while streaming" despite comments implying it should cancel and replace the active run, which hurts responsiveness.
- Streaming UX and tool feedback are inconsistent: auto-scroll does not follow streaming content, and newer ontology tools lack display/toast coverage.
- Backend/prompt alignment issues exist (write confirmation is only a prompt rule, not enforced), plus a few persistence and telemetry gaps.

## Detailed Findings

- High: Users cannot send a new message while streaming because `sendMessage` returns early when `isStreaming` is true, so the intended "supersede and send" flow never executes. This contradicts inline comments and blocks quick course correction. `apps/web/src/lib/components/agent/AgentChatModal.svelte:1834`
- Medium: Auto-scroll only triggers when message count changes, not when streaming text grows. If the user has not scrolled, the latest tokens can stream below the viewport. Consider a throttled scroll update during streaming when `userHasScrolled` is false. `apps/web/src/lib/components/agent/AgentChatModal.svelte:1162`
- Medium: Braindump "system" notes are created with `role: 'assistant'`, so they are treated as assistant messages and fed back into conversation history. If they are intended as system context, the role should be `system` or excluded from history. `apps/web/src/lib/components/agent/AgentChatModal.svelte:523` `apps/web/src/lib/components/agent/AgentChatModal.svelte:971`
- Medium: The UI handles an `executor_instructions` event that the refactored agentic chat flow never emits. Only the legacy planner service uses this event, so the UI path is dead and may confuse future maintainers. `apps/web/src/lib/components/agent/AgentChatModal.svelte:2169` `apps/web/src/lib/services/agent-planner-service.ts:1922`
- Medium: Tool UX coverage is incomplete. Formatter/toast maps omit newer ontology write tools like outputs, milestones, risks, decisions, and requirements, so those operations fall back to generic labels with no success/failure toast. `apps/web/src/lib/components/agent/AgentChatModal.svelte:1267` `apps/web/src/lib/components/agent/AgentChatModal.svelte:1629` `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts:872`
- Medium: User messages are persisted before ontology context loads. If ontology loading fails (e.g., access denied), the request returns an error but the user message remains stored without an assistant response, which can skew analytics and session continuity. `apps/web/src/routes/api/agent/stream/+server.ts:203`
- Low: Interrupted sessions store `partial_tokens` as character length rather than a token estimate, which can mislead metrics. Consider renaming the field or computing approximate tokens. `apps/web/src/routes/api/agent/stream/services/stream-handler.ts:747`
- High: The planner prompt mandates user confirmation before write operations, but the execution layer has no confirmation gate. Any model-issued write tool call is executed immediately, risking unintended data changes. `apps/web/src/lib/services/agentic-chat/prompts/config/planner-prompts.ts:106` `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts:96`
- Medium: Tool selection runs an extra LLM call (StrategyAnalyzer) on every turn before streaming begins, adding latency. Consider caching, heuristics for short/simple queries, or skipping the LLM selection when context is unchanged. `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts:170` `apps/web/src/lib/services/agentic-chat/analysis/tool-selection-service.ts:173`
- Medium: Rate limiting for `/api/agent/stream` is explicitly disabled, which opens the door to costly bursts or multi-tab abuse. Consider enabling with lenient thresholds or concurrency caps. `apps/web/src/routes/api/agent/stream/constants.ts:14`
- Low: High-frequency console logging in hot paths (context building and tool execution) can add noise and slight overhead in production. Consider gating behind `dev` or a structured logger with level control. `apps/web/src/lib/services/agent-context-service.ts:126` `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts:142`
- Medium: Streaming text updates rewrite the entire message array on each chunk, which is O(n) per chunk and can get expensive with long histories. Consider tracking the index of the current assistant message or batching updates per animation frame. `apps/web/src/lib/components/agent/AgentChatModal.svelte:2594`

## Architecture Insights

- Frontend flow: `AgentChatModal` builds `conversation_history`, sends `/api/agent/stream`, consumes SSE events (`text`, `tool_call`, `plan_*`, `agent_state`, etc.), and updates the UI + thinking blocks accordingly. `apps/web/src/lib/components/agent/AgentChatModal.svelte:1828`
- Backend flow: `/api/agent/stream` authenticates, resolves/creates `chat_sessions`, persists user messages, loads ontology context with caching, then streams via `StreamHandler` and `AgentChatOrchestrator`. `apps/web/src/routes/api/agent/stream/+server.ts:157`
- Orchestration: `AgentChatOrchestrator` builds planner context, runs tool selection, streams LLM output, and executes tools via `ToolExecutionService`, persisting tool results and plans. `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts:130`
- Data persistence: user/assistant/tool messages use `chat_messages`, plans/executions use `agent_*` tables, and tool logs go to `chat_tool_executions`. `apps/web/src/routes/api/agent/stream/services/message-persister.ts:34` `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor-refactored.ts:472`

## Code References

- `apps/web/src/lib/components/agent/AgentChatModal.svelte:1834` - sendMessage exits early when streaming, blocking superseded sends.
- `apps/web/src/lib/components/agent/AgentChatModal.svelte:1162` - auto-scroll only on message count changes.
- `apps/web/src/lib/components/agent/AgentChatModal.svelte:523` - braindump system note uses assistant role.
- `apps/web/src/lib/components/agent/AgentChatModal.svelte:971` - braindump resume note uses assistant role.
- `apps/web/src/lib/components/agent/AgentChatModal.svelte:2169` - executor_instructions UI handler.
- `apps/web/src/lib/services/agent-planner-service.ts:1922` - legacy executor_instructions emission.
- `apps/web/src/lib/components/agent/AgentChatModal.svelte:1267` - tool formatter coverage list.
- `apps/web/src/lib/components/agent/AgentChatModal.svelte:1629` - data mutation toast tool list.
- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts:872` - update_onto_output tool exists but not surfaced in UI.
- `apps/web/src/routes/api/agent/stream/+server.ts:203` - user message persisted before ontology load.
- `apps/web/src/routes/api/agent/stream/services/stream-handler.ts:747` - partial_tokens uses string length.
- `apps/web/src/lib/services/agentic-chat/prompts/config/planner-prompts.ts:106` - prompt requires confirmation for writes.
- `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts:96` - write tool execution is not gated.
- `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts:170` - tool selection invoked every turn.
- `apps/web/src/lib/services/agentic-chat/analysis/tool-selection-service.ts:173` - StrategyAnalyzer LLM call.
- `apps/web/src/routes/api/agent/stream/constants.ts:14` - rate limiting disabled.
- `apps/web/src/lib/services/agent-context-service.ts:126` - high-frequency context logging.
- `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts:142` - tool execution logging.
- `apps/web/src/lib/components/agent/AgentChatModal.svelte:2594` - streaming updates map full message array.

## Related Research

None yet.
