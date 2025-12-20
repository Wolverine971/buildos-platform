<!-- apps/web/docs/technical/issues/AGENTIC_CHAT_TOOL_PLANNING_AUDIT.md -->

# Agentic Chat Tool + Planning Flow Audit

> **Created**: 2025-12-20
> **Status**: Active - Needs Review
> **Priority**: High (tool call reliability + plan execution correctness)

## Executive Summary

The agentic chat tool and planning flows work end-to-end, but several correctness and reliability gaps remain. The most serious issues are:

1. **Executor tool calls do not feed results back into the LLM loop**, so executors cannot actually use tool outputs.
2. **Planner tool availability does not update after context shifts**, leaving the LLM with stale tool sets and stale context snapshots.
3. **Plan execution bypasses the shared ToolExecutionService**, skipping validation, timeouts, telemetry, and entity extraction.
4. **Mixed plans drop tool-step results when any executor step exists**, producing incomplete plan summaries.

Secondary issues include missing enforcement of project creation step ordering, executor limits not enforced in the main path, and missing context updates inside plan execution.

---

## Issue 1: Executor Tool Loop Drops Tool Outputs

**Status**: Fixed (2025-12-20)

### Affected Files

- `apps/web/src/lib/services/agent-executor-service.ts`

### Symptoms

- Executor tool calls run, but the final executor output does not reflect tool results.
- Plans that rely on executor tool usage return generic or incomplete data.

### Root Cause

`executeWithContext()` consumes tool calls inside a single `smartLLM.streamText()` pass, but **never restarts the LLM with tool results**. OpenRouter-style tool calls end the stream with `finish_reason: tool_calls`, so appended tool messages are never consumed.

### Recommended Fix

- Implement a tool-call loop similar to `AgentChatOrchestrator.runPlannerLoop()`:
    1. Stream LLM output
    2. Collect tool calls
    3. Execute tools
    4. Append tool results
    5. Re-run LLM until no tool calls
- Centralize this loop in a shared helper to avoid drift between planner and executor flows.

---

## Issue 2: Planner Tool Set Does Not Refresh After Context Shift

**Status**: Fixed (2025-12-20)

### Affected Files

- `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts`
- `apps/web/src/lib/services/agent-context-service.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`

### Symptoms

- After `create_onto_project`, the planner stays stuck with `project_create` tools (only `create_onto_project`).
- Subsequent tool calls are missing expected project tools or call tools that are not in the list.

### Root Cause

`runPlannerLoop()` builds `tools` once before the loop and **never re-fetches tools or context** after `context_shift`. The service context is updated, but tool availability and the system/context messages are not refreshed.

### Recommended Fix

- When a context shift is detected, rebuild planner context and tool list:
    - Re-run `contextService.buildPlannerContext()` or
    - Recompute tools with `getToolsForContextType()` and inject an updated context snapshot message
- Treat context shifts as a state transition that rehydrates tools and system prompt guidance.

---

## Issue 3: Plan Steps Bypass ToolExecutionService

**Status**: Fixed (2025-12-20)

### Affected Files

- `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`
- `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`
- `apps/web/src/lib/services/agentic-chat/index.ts`

### Symptoms

- Plan tool calls skip validation and timeouts.
- Tool outputs from plan steps do not include `entitiesAccessed` or other normalization fields.
- Telemetry hooks and retry helpers in `ToolExecutionService` are unused during plan execution.

### Root Cause

`PlanOrchestrator.executeStep()` calls the raw `toolExecutor` function (ChatToolExecutor wrapper) directly. This bypasses `ToolExecutionService` features like schema validation, timeouts, entity extraction, and telemetry.

### Recommended Fix

- Route plan step tool execution through `ToolExecutionService` or
- Wrap `toolExecutor` in a thin adapter that adds validation + timeout + telemetry parity.

---

## Issue 4: Mixed Plans Drop Tool-Step Results in Synthesis

**Status**: Fixed (2025-12-20)

### Affected Files

- `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts`
- `apps/web/src/lib/services/agentic-chat/synthesis/response-synthesizer.ts`

### Symptoms

- Plans with both executor steps and direct tool steps produce summaries that ignore tool-step outputs.

### Root Cause

`executePlan()` collects both `executorResults` and `tool_result` events, but when any executor results exist it passes **only** `executorResults` into `synthesizeComplexResponse()`.

### Recommended Fix

- Merge executor + tool results before synthesis, or
- Update `ResponseSynthesizer` to accept a unified result shape that includes both.

---

## Issue 5: Project Creation Plan Ordering Not Enforced

**Status**: Fixed (2025-12-20)

### Affected Files

- `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`

### Symptoms

- Plans can include `create_onto_project` but still run earlier steps that require a project ID.
- Step execution fails with missing `project_id` even though the plan contains a create step.

### Root Cause

`enforceProjectCreationPlan()` checks only for **presence** of `create_onto_project`. It does not enforce that the step is first or that all project-dependent steps depend on it.

### Recommended Fix

- Enforce `create_onto_project` as step 1, or
- Auto-inject dependencies from project-required steps to the create step.
- Extend `validatePlan()` to flag missing dependencies for project_id-requiring tools.

---

## Issue 6: Executor Limits Not Enforced in Main Path

**Status**: Partially addressed (2025-12-20) - tool call count + total duration enforced; per-call timeout still pending

### Affected Files

- `apps/web/src/lib/services/agent-executor-service.ts`

### Symptoms

- Executor runs have no hard stop on tool count or duration.
- Runaway tool loops can consume time and tokens without safeguards.

### Root Cause

`LIMITS` are only applied in `executeToolChain()`, which is unused in the primary `executeWithContext()` path. `MAX_EXECUTION_TIME_MS` is never enforced.

### Recommended Fix

- Track tool call count and abort when `MAX_TOOL_CALLS` is exceeded.
- Use an AbortController or timeout around `streamText()` and tool execution to enforce `MAX_EXECUTION_TIME_MS`.

---

## Issue 7: Plan Execution Ignores Context Shifts

### Affected Files

- `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`

### Symptoms

- After `create_onto_project`, later plan steps still behave as if context is `project_create`.
- Context-sensitive helpers (e.g., `inferFieldInfoEntityType`) can use the wrong entity type.

### Root Cause

Plan step execution does not inspect tool results for `context_shift` and never updates `ServiceContext` or `contextScope` during plan execution.

### Recommended Fix

- Detect `context_shift` in tool results during plan execution and update `context`.
- Recompute `contextScope.projectId` when a project is created.

---

## Issue 8: Tool Usage Observability Gaps for Plan Steps

### Affected Files

- `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`
- `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`

### Symptoms

- `entities_accessed` is missing for plan tool calls.
- Plan token usage is under-reported because tool results do not include `tokensUsed`.

### Root Cause

Plan tool calls bypass `ToolExecutionService` (which extracts entities) and `ChatToolExecutor` does not surface token usage. `accumulateTokensFromEvents()` therefore never increments.

### Recommended Fix

- Use `ToolExecutionService` for plan tools or
- Extend `ChatToolExecutor` results to include token usage and entity IDs.

---

## Recommended Fix Priority

| Priority | Issue                                  | Effort | Impact                                                    |
| -------- | -------------------------------------- | ------ | --------------------------------------------------------- |
| 1        | Executor tool loop drops tool outputs  | Medium | Breaks executor correctness                               |
| 2        | Planner tools not refreshed on shift   | Medium | Causes missing tools and stale context after tool actions |
| 3        | Plan steps bypass ToolExecutionService | Medium | Skips validation, timeouts, telemetry, entity extraction  |
| 4        | Mixed plans drop tool-step results     | Low    | Plan summaries omit tool outputs                          |
| 5        | Project creation ordering not enforced | Low    | Project_create flow fails with missing project_id         |
| 6        | Executor limits not enforced           | Low    | Runaway tool calls and long executions                    |
| 7        | Plan execution ignores context shifts  | Low    | Context-sensitive steps use stale context                 |
| 8        | Plan tool observability gaps           | Low    | Metrics and entity tracking incomplete                    |

---

## Implementation Checklist

### Phase 1: Tool Loop Reliability

- [ ] Add a shared tool-call loop helper for planner + executor flows.
- [x] Re-run LLM after tool results in executor path.
- [x] Enforce tool call count and execution time limits in executor.

### Phase 2: Planning Correctness

- [x] Route plan tool execution through `ToolExecutionService` or adapter.
- [x] Merge executor + tool results before synthesis.
- [x] Enforce project_create step ordering/dependencies.

### Phase 3: Context + Observability

- [x] Refresh planner tool list and context snapshot after `context_shift`.
- [ ] Update plan execution context on `context_shift` results.
- [ ] Ensure plan tool usage captures `entitiesAccessed` + tokens.

---

## Related Files

- `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts`
- `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`
- `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor-refactored.ts`
- `apps/web/src/lib/services/agent-executor-service.ts`
- `apps/web/src/lib/services/agent-context-service.ts`
- `apps/web/src/lib/services/agentic-chat/config/agentic-chat-limits.ts`
- `apps/web/src/routes/api/agent/stream/services/stream-handler.ts`
