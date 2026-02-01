<!-- docs/reports/agentic-chat-planning-flow-audit-2026-01-30.md -->

# Agentic Chat Planning Flow Audit (2026-01-30)

This report audits the planning-mode flow in Agentic Chat, focusing on the path where the planner calls the virtual `agent_create_plan` tool and delegates to executor agents. The goal is to surface latency drivers, correctness risks, and concrete opportunities to speed up the flow without changing user-visible behavior.

## Sources (Code + Docs)

- `apps/web/docs/features/agentic-chat/README.md`
- `apps/web/src/routes/api/agent/stream/+server.ts`
- `apps/web/src/routes/api/agent/stream/services/stream-handler.ts`
- `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts`
- `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`
- `apps/web/src/lib/services/agentic-chat/execution/executor-coordinator.ts`
- `apps/web/src/lib/services/agent-executor-service.ts`
- `apps/web/src/lib/services/agentic-chat/persistence/agent-persistence-service.ts`
- `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`
- `apps/web/src/lib/services/agentic-chat/analysis/tool-selection-service.ts`
- `apps/web/src/lib/services/agentic-chat/analysis/strategy-analyzer.ts`
- `apps/web/src/lib/services/agentic-chat/synthesis/response-synthesizer.ts`
- `apps/web/src/lib/services/agent-context-service.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`

## Updates Applied (2026-01-30)

These quick wins were implemented after the initial audit:

- **Gated `agent_create_plan` tool exposure** to strategy/heuristic signals instead of always appending it.
    - Files: `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts`
- **Avoided double LLM synthesis by default**: plan execution now returns a structured summary + step details; optional LLM synthesis can be re-enabled via `AGENTIC_CHAT_ENABLE_PLAN_SYNTHESIS_LLM=true`.
    - Files: `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts`
- **Reduced persistence payloads** by removing `.select().single()` from agent/plan inserts + updates.
    - Files: `apps/web/src/lib/services/agentic-chat/persistence/agent-persistence-service.ts`
- **Decreased plan-generation retries** to a single attempt and disabled JSON parse retries in JSON mode.
    - Files: `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`
- **Inlined plan creation into the plan tool**: `agent_create_plan` can accept a full plan JSON payload and skip plan-generation LLM.
    - Files: `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts`, `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`
- **Trimmed plan-generation tool summaries** with Tier A/B logic to keep critical guardrails while reducing prompt size.
    - Files: `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`

## Current Planning-Mode Flow (Create Plan -> Executors)

High-level sequence for a single `/api/agent/stream` turn:

1. **Stream entry + context assembly**
    - `StreamHandler` resolves session, fetches ontology cache, builds last-turn context, and starts SSE streaming.
    - `AgentChatOrchestrator.streamConversation()` builds planner context via `AgentContextService.buildPlannerContext()` and runs tool selection via `ToolSelectionService.selectTools()` (LLM-driven by default).

2. **Planner LLM stream**
    - `AgentChatOrchestrator.runPlannerLoop()` streams a planner LLM turn with tool definitions (conditionally appends the virtual `agent_create_plan` tool based on strategy/heuristics).
    - If the planner chooses `agent_create_plan`, tool execution transitions into plan creation + execution.

3. **Plan creation (virtual tool)**
    - `handlePlanToolCall()` -> `PlanOrchestrator.createPlanFromIntent()`.
    - If the planner provides `plan.steps` in the tool call, the plan is created directly (no plan-generation LLM).
    - Otherwise, `PlanOrchestrator.generatePlanWithLLM()` calls LLM to emit structured JSON plan steps (single attempt).
    - Plan is persisted to `agent_plans` via `AgentPersistenceService.createPlan()`.

4. **Plan execution**
    - `PlanOrchestrator.executePlan()` marks plan `executing` and executes steps in dependency-aware groups.
    - For each step:
        - Updates step state in `agent_plans.steps` via `updatePlanStep()` (read + optimistic lock + write).
        - If `executorRequired`, `ExecutorCoordinator.spawnExecutor()` creates executor agent records and calls `AgentExecutorService.executeTask()` (LLM + tool loop + persistence).
        - If tools are required, `ToolExecutionService.executeTool()` dispatches to `ChatToolExecutor` (internal/external APIs).

5. **Synthesis + return to planner**
    - After steps finish, the plan tool returns a structured summary + step details.
    - Optional LLM synthesis is disabled by default; it can be re-enabled via `AGENTIC_CHAT_ENABLE_PLAN_SYNTHESIS_LLM=true`.
    - The planner loop runs again to produce final assistant text.

## Latency Hotspots and Flow Risks

### 1) Multi-LLM chain in planning mode (sequential)

**Why it is slow**

- A single planning-mode turn can invoke LLMs in sequence:
    1. Tool selection analysis (StrategyAnalyzer LLM)
    2. Planner streaming LLM (decide to call plan tool)
    3. Plan generation LLM (create structured plan)
    4. Executor LLM(s) (per step requiring executor)
    5. Response synthesis LLM
    6. Planner LLM again (post-tool response)

**Evidence**

- `ToolSelectionService.selectTools()` -> `StrategyAnalyzer.analyzeUserIntent()` (LLM) in `apps/web/src/lib/services/agentic-chat/analysis/*`.
- Planner loop: `AgentChatOrchestrator.runPlannerLoop()` in `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts`.
- Plan generation: `PlanOrchestrator.generatePlanWithLLM()` in `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`.
- Plan synthesis: `ResponseSynthesizer.synthesizeComplexResponse()` in `apps/web/src/lib/services/agentic-chat/synthesis/response-synthesizer.ts`.

**Risk**

- Planning-mode latency stacks quickly because each step is serialized.

### 2) Plan generation prompt size and retries

**Why it is slow**

- `buildPlanSystemPrompt()` includes tool summaries plus required parameters for **all** available tools, which can be large.
- JSON parse failures previously caused a second full LLM call (`PLAN_GENERATION_ATTEMPTS = 2`).

**Evidence**

- `PlanOrchestrator.buildPlanSystemPrompt()` and `generatePlanWithLLM()` in `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`.
- Tool summary generation: `formatToolSummaries()` and tool registry in `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`.

**Risk**

- High prompt token count increases latency and cost. Retry multiplies that cost (retry now removed).

### 3) Heavy step persistence with optimistic locking (parallel bottleneck)

**Why it is slow**

- `updatePlanStep()` reads the whole plan, updates the full JSON `steps` array, and writes back with an `updated_at` optimistic lock.
- When steps run **in parallel**, multiple concurrent updates contend for the same `agent_plans` row, causing retries and exponential backoff.
- Each step is updated at least twice (start + complete), doubling the contention risk.

**Status**

- Fixed: plan-step updates now use the `update_agent_plan_step` RPC (server-side) with a row lock to prevent lost updates and avoid client-side optimistic-lock retries.

**Evidence**

- `PlanOrchestrator.executePlan()` updates steps before and after execution.
- `AgentPersistenceService.updatePlanStep()` now prefers the `update_agent_plan_step` RPC and avoids client-side optimistic locking (`apps/web/src/lib/services/agentic-chat/persistence/agent-persistence-service.ts`).

**Risk**

- Parallel plan execution is undermined by serialized persistence and lock conflicts, causing unpredictable delays.

### 4) Executor persistence overhead on critical path

**Why it is slow**

- Each executor spawns a new agent record, agent session, and message log entries, and optionally an execution record.
- These writes occur synchronously before/after executor LLM execution.

**Evidence**

- `ExecutorCoordinator.spawnExecutor()` -> `AgentPersistenceService.createAgent()` in `apps/web/src/lib/services/agentic-chat/execution/executor-coordinator.ts`.
- `AgentExecutorService.initializeExecutorPersistence()` / `finalizeExecutorPersistence()` in `apps/web/src/lib/services/agent-executor-service.ts`.

**Risk**

- The persistence work adds fixed latency per executor step and scales linearly with plan size.

### 5) Double summarization (synthesis + planner response)

**Status**

- This is now avoided by default; plan execution returns a structured summary instead of a synthesis LLM call.
- Optional synthesis can be re-enabled via `AGENTIC_CHAT_ENABLE_PLAN_SYNTHESIS_LLM=true`.

### 6) Sequential tool execution inside a step

**Why it is slow**

- A step with multiple tools executes them sequentially in `executeStep()`, even if they are independent.

**Evidence**

- `PlanOrchestrator.executeStep()` loops through `step.tools` and awaits each tool in order.

**Risk**

- Long tail latency when plan generator bundles multiple tools into one step.

### 7) Plan tool always present (overuse risk)

**Status**

- Fixed: `agent_create_plan` is now gated by strategy/heuristics before being appended.

## Speed-Up Opportunities (Prioritized)

### Quick wins (low risk, immediate impact)

1. **Gate `agent_create_plan` by strategy or heuristics** ✅ **Done**
    - Implemented in `AgentChatOrchestrator.appendVirtualTools()` using strategy analysis + heuristics.

2. **Trim plan-generation prompt size**
    - Remove verbose tool summaries; include only tool names and required params.
    - Limit tools sent to plan generation to the selected tool subset (already available) and optionally top N tools.
    - Update `PlanOrchestrator.buildPlanSystemPrompt()` and `buildToolRequirementsSummary()`.

3. **Avoid double LLM synthesis** ✅ **Done (default)**
    - Plan execution now returns a structured summary + step details, and the planner produces final text.
    - Optional synthesis can be re-enabled via `AGENTIC_CHAT_ENABLE_PLAN_SYNTHESIS_LLM=true`.

4. **Reduce persistence payloads** ✅ **Done**
    - Removed `.select().single()` on agent/plan inserts + updates to cut response payloads.

5. **Decrease plan-generation retries** ✅ **Done**
    - Reduced `PLAN_GENERATION_ATTEMPTS` to 1 and disabled JSON parse retries in JSON mode.

6. **Trim plan-generation prompt size** ✅ **Done**
    - Tool summary block now uses Tier A/B trimming with guardrails for write/critical tools.

### Medium-term improvements

1. **Fix plan-step update contention** ✅ **Done**
    - `update_agent_plan_step` RPC now locks the plan row and updates a single step server-side, avoiding client-side optimistic-lock retries.
    - Remaining opportunity: consider a dedicated `agent_plan_steps` table to avoid rewriting the full JSON array for each update.

2. **Batch plan step updates**
    - Update all step status changes for a group in one write (per group), not per step.
    - Keep in-memory updates during execution and persist once per group or at the end.

3. **Parallelize tool calls inside a step** ✅ **Done**
    - `executeStep()` now runs tools in parallel when there are no explicit step dependencies (or when `metadata.parallelizeTools === true`).
    - Sequential execution remains the default when `metadata.parallelizeTools === false` or the step has dependencies.

4. **Make executor persistence async or optional**
    - Toggle executor session/message logging based on env flags or debug mode.
    - Defer non-critical writes (messages/executions) to a background job.

### Structural / design-level changes

1. **Inline plan creation into planner tool call** ✅ **Done**
    - `agent_create_plan` now accepts a `plan` payload (steps + optional strategy/reasoning).
    - When provided, the plan is persisted and executed without running the plan-generation LLM call.

2. **Fast-path “plan-only” or “tool-only” execution**
    - For simple tasks, skip plan tool entirely and let the planner call tools directly.
    - For complex tasks, skip the initial planner LLM and go straight to plan generation (if analysis says complex).

3. **Adaptive model selection for planning**
    - Use a smaller/faster model for plan generation when complexity is low.
    - Reserve larger models for high-complexity or high-risk steps.

## Suggested Metrics to Add

- **LLM call timing per phase**: strategy analysis, planner stream, plan generation, executor, synthesis.
- **Plan step persistence latency**: `updatePlanStep()` duration + retry count.
- **Executor persistence time**: time spent in `initializeExecutorPersistence()` and `finalizeExecutorPersistence()`.
- **Prompt size tracking**: token estimates for plan generation prompt.
- **Plan tool usage rate**: % of turns that invoke `agent_create_plan` and whether it was necessary.

## Recommended Next Steps

1. Consider a dedicated `agent_plan_steps` table to avoid rewriting the full JSON array on every step update.
2. Add timing metrics for end-to-end plan latency to validate the impact of the recent changes.
