# Agentic Chat Flow Audit — 2025-11-19

## Scope & Method

- Reviewed the new entrypoint at `apps/web/src/routes/api/agent/stream/+server.ts` and the `createAgentChatOrchestrator()` stack to verify behavior promised in the agentic chat specs.
- Cross-referenced `docs/technical/implementation/PROJECT_CONTEXT_SHIFT_IMPLEMENTATION.md` and the refactoring spec to ensure the live code still satisfies the documented contracts (context shifts, persistence, instrumentation, rate limiting).
- Focused on deltas introduced by the orchestrator factory and its analysis/planning/execution services; legacy planner/executor codepaths were only used for comparison.

## Findings

1. **Context shifts never fire in the new architecture (Critical)**
    - The SSE bridge still checks `result?.context_shift` on every `tool_result` event (`apps/web/src/routes/api/agent/stream/+server.ts:446-495`), matching the spec example (`docs/technical/implementation/PROJECT_CONTEXT_SHIFT_IMPLEMENTATION.md:130-166`).
    - `ToolExecutionService` now wraps every tool invocation in a `ToolExecutionResult` whose payload lives under `data` (`apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts:117-134`). When `create_onto_project` returns a context shift it lands at `result.data.context_shift`, so the detection branch never runs.
    - Result: project creation flows stay stuck in `project_create`, sessions/clients never receive a `context_shift` event, and the follow-up system message that records the switch is never inserted.
    - **Fix**: dereference `result.data.context_shift` (and keep backward compatibility for the legacy shape) before emitting the SSE event and updating Supabase.

2. **Token limiter never accrues usage (High)**
    - The API only bumps `totalTokens` when a streamed event contains `usage.total_tokens` (`apps/web/src/routes/api/agent/stream/+server.ts:497-647`), yet none of the orchestrator “done” events include usage.
    - `handleSimpleStrategy`/`handleClarifyingStrategy` emit `{ type: 'done' }` with no usage data (`apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts:205-244,308-317`).
    - The plan path _does_ compute usage inside `PlanOrchestrator` (`apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts:299-307`), but `handleComplexStrategy` discards every plan `done` event (`apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts:269-289`), so the API never sees it.
    - Because `totalTokens` stays zero, `RATE_LIMIT.MAX_TOKENS_PER_MINUTE` is effectively disabled and downstream analytics/metering also miss actual consumption.
    - **Fix**: propagate the `usage` block from the plan orchestrator upstream and extend `SmartLLMService` responses in the simple/clarifying paths so the SSE loop can accumulate real token counts.

3. **Complex strategies emit no tool events, so persistence and context shifts silently fail (High)**
    - Only the simple strategy path emits `tool_call`/`tool_result` events. When plans execute steps that call tools directly, `PlanOrchestrator.executeStep()` just invokes `this.toolExecutor` and returns the data without broadcasting anything (`apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts:561-632`).
    - The SSE bridge builds `toolCalls`/`toolResults` solely from those events (`apps/web/src/routes/api/agent/stream/+server.ts:442-638`), so in every complex run the arrays stay empty: no tool usage is appended to `chat_messages`, and the server never inspects results for contextual metadata.
    - Impact: plan/executor flows cannot trigger context shifts or leave an auditable tool trail, contradicting the telemetry requirements in the refactoring spec.
    - **Fix**: emit `tool_call`/`tool_result` events whenever the plan executor invokes a tool (and surface executor tool calls, if any), or pipe plan tool invocations through `ToolExecutionService` so the existing instrumentation path can capture them.

4. **Executor outputs are not persisted anywhere (Medium)**
    - The API banner advertises “Full database persistence for agents, plans, sessions, messages, executions” (`apps/web/src/routes/api/agent/stream/+server.ts:1-12`), yet executor runs still short-circuit.
    - `AgentExecutorService.persistExecution()` merely logs to the console and never touches `agent_executions`/`agent_chat_sessions` (`apps/web/src/lib/services/agent-executor-service.ts:520-551`). No code path calls `AgentPersistenceService.createChatSession/saveMessage` either.
    - Consequence: there is no durable record of executor tasks, token usage, or tool calls despite the schema being present, so observability dashboards and admin reviews cannot rely on the “agent” tables.
    - **Fix**: implement the persistence hooks promised in the spec (store executor sessions/messages/results via `AgentPersistenceService`) before enabling the orchestrator flag in production.

## Recommended Next Steps

- Patch the SSE bridge to read `result.data.context_shift`, re-run the project creation flow, and confirm the UI receives the `context_shift` event and Supabase rows update.
- Thread usage accounting from every orchestration path through to the rate limiter (propagate `usage` objects and/or instrument `SmartLLMService` responses) and add a regression test for exceeding `MAX_TOKENS_PER_MINUTE`.
- Extend `PlanOrchestrator`/`ExecutorCoordinator` to surface tool events so tool persistence, analytics, and context shifts work in complex jobs; update the docs once the contract matches reality.
- Finish wiring executor persistence to the `agent_*` tables so audits and dashboards can see planner/executor lineage as described in the refactoring spec.
