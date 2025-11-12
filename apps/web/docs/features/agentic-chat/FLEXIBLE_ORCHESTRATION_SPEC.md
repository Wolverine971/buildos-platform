# Flexible Agentic Chat Orchestration Spec

**Status:** Draft  
**Last updated:** 2025-02-14  
**Author:** Codex (agent)

---

## 1. Purpose

The current planner → strategy analyzer → execution split hard-codes two primary strategies (`simple_research` vs `complex_research`) and a project-specific override. This makes the agent brittle, adds latency, and prevents the LLM from flexibly deciding which tools (or plan) to run based on the request context. This document proposes a context-type-driven orchestration loop where the planner LLM runs a single dynamic tool-calling session, and the execution-plan workflow becomes a meta tool the LLM invokes when needed.

---

## 2. Goals & Non-goals

### Goals

- Remove the mandatory `StrategyAnalyzer.analyzeUserIntent()` hop from the live chat path.
- Let the planner LLM call any tool (including “create plan + execute”) inside one streaming session.
- Treat `request.contextType` as the primary indicator of user intent and inject context-specific guardrails directly into the planner system prompt.
- Preserve existing executor + plan infrastructure, but expose it as a callable capability that can either auto-execute or pause for plan review.
- Continue streaming meaningful events (tool usage, plan progress, executor updates) to the UI with updated “Agent is thinking/executing…” messaging.
- Ensure every LLM call is logged through `SmartLLMService` so `llm-usage.service.ts` and `errorLogger.service.ts` capture accurate cost + failure telemetry.

### Non-goals

- Rewriting executor agents or existing tool implementations.
- Changing how planner/executor contexts are assembled (other than adding context-type guidance).
- Replacing SmartLLMService or introducing a different LLM provider.

---

## 3. Current Flow Snapshot (Problems)

1. **Strategy hop:** `AgentChatOrchestrator.streamConversation()` always calls `StrategyAnalyzer` to pick a categorical strategy before any tool runs.
2. **Dual codepaths:** `handleSimpleStrategy` manually chooses tools, while `handleComplexStrategy` delegates to `PlanOrchestrator`. The branches never meet, so improvements must be duplicated.
3. **Project creation override:** Custom logic force-injects template → project creation steps when `contextType === 'project_create'`, adding more bespoke branching.
4. **LLM agency mismatch:** The LLM performs analysis in one call, but downstream execution ignores that reasoning and uses heuristics.
5. **UI coupling:** SSE consumers depend on `analysis`/`strategy_selected` events that no longer make sense once the LLM directly runs the flow (and `ChatInterface.svelte` is no longer present to ingest them).

---

## 4. Proposed Flow

### 4.1 Context-type guidance

Before the streaming session starts, we map the incoming `request.contextType` to intent hints that get merged into the planner system prompt and shared metadata. Example mapping:

| Context type     | Primary intent summary                                     | Required behaviors                                                                              |
| ---------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `project_create` | Capture needs, pick template, instantiate ontology project | Must leave user with a created project (template → create_onto_project → context doc)           |
| `project`        | Operate inside an existing project                         | Default entity scope is the provided `entityId`; avoid destructive actions without confirmation |
| `task`           | Inspect/update tasks                                       | Prefer task-scoped tools, surface blockers                                                      |
| `project_audit`  | Evaluate health of an active project                       | Use audit tools, optionally create plan for deeper analysis                                     |
| `general/global` | Research or high-level assistance                          | Rely on available read tools, only escalate to plan when user intent is multi-step              |

These hints replace the coarse “simple vs complex” flags.

### 4.2 Planner streaming loop

1. Build `PlannerContext` (unchanged) → inject context guidance + meta-tool definitions into `availableTools`.
2. Start a single `SmartLLMService.streamText()` session with:
    - `messages`: conversation history + latest user turn.
    - `tools`: union of actual tools, template/ontology helpers, and the new plan meta tool.
3. Stream events from the LLM:
    - `text` chunks → forward to SSE/clients immediately (`type: 'text'`).
    - `tool_call` events → dispatch via `ToolExecutionService` (real tools) or via bespoke handlers (meta tools).
    - `done` event → emit final `done` SSE with usage.
4. Each tool execution appends assistant/tool messages back into the LLM message array so the model can keep reasoning within the same session.

Pseudo-flow:

```
buildPlannerContext()
messages = [...history, user turn]
tools = availableTools + agent_plan tool

for await (chunk of smartLLM.streamText(messages, tools)):
  if chunk.type === 'text':
    stream {type:'text'}
  if chunk.type === 'tool_call':
    emit {type:'tool_call'}
    const toolResult = await dispatchTool(chunk.tool_call)
    emit {type:'tool_result', result: toolResult}
    messages.push(assistant tool_call, tool result message)
  if chunk.type === 'done':
    emit {type:'done', usage}
```

Operational guardrails for this loop:

- `MAX_TOOL_CALLS_PER_TURN = 8` (configurable) — if we hit the cap, emit an `error` event advising the user to rephrase or wait, and log the incident via `ErrorLoggerService`.
- `MAX_SESSION_DURATION_MS = 90_000` — a watchdog timer aborts runs that drag on and records the timeout in LLM usage logs.
- `SmartLLMService.streamText` must set `profile` based on `contextType` (e.g., `balanced` for general/project, `quality` for `project_audit`, `speed` for `task_update`) and include a descriptive `operationType` such as `planner_stream`.
- Because SmartLLMService already logs usage, the orchestrator just needs to ensure `sessionId`, `userId`, `contextType`, and `operationType` flow through so `llm-usage.service.ts` can attribute costs correctly.
- Every caught exception in this loop should be routed through `errorLogger.service.ts` with tags `{ component: 'AgentChatOrchestrator', stage: 'planner_loop', toolName }`.

### 4.3 Plan meta tool

Add a synthetic tool definition that the LLM can call when it wants a structured, multi-step execution or a draft plan that pauses for review:

```json
{
	"type": "function",
	"function": {
		"name": "agent_create_plan",
		"description": "Generate a BuildOS execution plan for multi-step objectives, optionally executing it or pausing for review.",
		"parameters": {
			"type": "object",
			"properties": {
				"objective": {
					"type": "string",
					"description": "What you want to accomplish end-to-end."
				},
				"execution_mode": {
					"type": "string",
					"enum": ["auto_execute", "draft_only", "agent_review"],
					"description": "Default is auto_execute. Use draft_only to return the plan without running it, or agent_review to have another agent critique the plan before execution."
				},
				"auto_execute": {
					"type": "boolean",
					"description": "Legacy alias for execution_mode === auto_execute; retained for prompt compatibility."
				},
				"requested_outputs": {
					"type": "array",
					"items": { "type": "string" },
					"description": "Specific deliverables the user expects."
				},
				"priority_entities": {
					"type": "array",
					"items": { "type": "string" },
					"description": "IDs or slugs the plan must focus on."
				}
			},
			"required": ["objective"]
		}
	}
}
```

Handler behavior:

1. Translate the call into a `PlanIntent` (objective, contextType, userId, sessionId, entityId, execution_mode, flags).
2. Call `PlanOrchestrator.createPlanFromIntent(intent)` (see Section 5) which internally still uses the existing machinery but now derives guidance from `contextType`.
3. Branch on `execution_mode`:
    - `auto_execute` (default): stream plan events (plan*created, step_start/complete, executor*\*), collect executor & tool results, and summarize the outcome back to the LLM.
    - `draft_only`: emit `plan_ready_for_review` SSE (includes plan + reasoning), leave the plan in `pending_review`, and send the plan payload back to the LLM so it can explain to the user that execution is paused.
    - `agent_review`: run a lightweight reviewer agent (SmartLLMService with `profile: 'quality'`) that critiques/approves. Emit `plan_review` SSE containing verdict + notes. If approved, execute; otherwise send critique back to the LLM for iteration.
4. When `execution_mode` is omitted but legacy `auto_execute: false` is provided, treat it as `draft_only`.
5. Summarize every pathway (status, insights, references) and send it back to the LLM as the tool-result payload.

### 4.4 Streaming & SSE events

Keep emitting:

- `session`, `ontology_loaded`, `last_turn_context`
- `tool_call`, `tool_result`
- `plan_created`, `plan_ready_for_review`, `plan_review`, `step_start`, `step_complete`, `executor_*` (only when the plan tool runs)
- `text`, `done`, `error`

Retire `analysis` and `strategy_selected`. Replace them with a lightweight `agent_state` event so `AgentChatModal.svelte` can surface “Agent is thinking…” vs “Agent is executing…” vs “Awaiting your approval.” Example payload:

```ts
type AgentStateEvent = {
	type: 'agent_state';
	state: 'thinking' | 'executing_plan' | 'waiting_on_user';
	contextType: ChatContextType;
	details?: string;
};
```

### 4.5 Clarifications & fallbacks

We no longer synthesize clarifying questions separately. The LLM simply streams a normal assistant turn asking for clarification. To guard against empty messages, we still do a quick check **before** launching the LLM session:

- If `request.userMessage` is blank, short-circuit with a canned clarifying question (existing behavior).
- If no tools are available, we let the LLM respond but also append a system reminder like “You currently have no tools, focus on guidance.”
- These fallback responses must still route through SmartLLMService so usage/error telemetry stays accurate.

---

## 5. Component Changes

### 5.1 `AgentChatOrchestrator`

- Remove `strategyAnalyzer` dependency and the `handleSimple/Complex/Clarifying/ProjectCreation` helpers.
- Add `runPlannerLoop()` that encapsulates the streaming logic described in §4.2 with guardrails:
    - `MAX_TOOL_CALLS_PER_TURN = 8`.
    - `MAX_SESSION_DURATION_MS = 90s`.
    - Automatic `agent_state` events whenever the loop switches between “thinking”, “executing tool”, “executing_plan”, and “waiting_on_user`.
    - SmartLLMService always receives `profile` + `operationType` metadata so downstream usage logs can bucket costs (e.g., `planner_stream`, `plan_review`).
- Inject the plan meta tool definition into `plannerContext.availableTools` before handing it to the LLM.
- When the plan tool is invoked, call a new helper `executePlanTool()` that wraps `PlanOrchestrator` and `ResponseSynthesizer`, branching on `execution_mode` (auto execute, draft-only, agent-review).
- Persist planner agents exactly as today, but mark their `mode` (new column) as `contextType` and annotate each turn with the execution_mode applied.
- Pipe caught exceptions to `ErrorLoggerService` with metadata describing the failing tool/context.

### 5.2 `PlanOrchestrator`

- Introduce a `PlanIntent` interface:

```ts
interface PlanIntent {
	objective: string;
	contextType: ChatContextType;
	sessionId: string;
	userId: string;
	entityId?: string;
	plannerAgentId: string;
	requestedOutputs?: string[];
	priorityEntities?: string[];
	autoExecute?: boolean;
}
```

- Replace the `(userMessage, strategy, plannerContext, context)` signature with `createPlanFromIntent(intent, plannerContext)`, deriving the previous `strategy` guidance like so:
    - `contextType === 'project_create'` → reuse the current PROJECT_CREATION prompt.
    - Otherwise treat everything as “general research/execution” but still allow hints (e.g., `project_audit` encourages evaluator-style steps).
- Store `contextType` (and optional `intentLabel`) on plan records for observability.
- Add `runPlan(intent, plan, ...)` that returns `{ planSummary, executorResults, usage }` so the plan meta tool can send a clean payload back to the LLM.
- Enforce project creation requirements when `contextType === 'project_create'` by verifying plan steps include template discovery, optional template creation, `create_onto_project`, and context-document publishing (in that order). If missing, inject corrective instructions or fail fast so the LLM can fix the plan.
- Provide helpers for draft + review workflows:
    - `persistDraft(plan)` saves the plan with `status: 'pending_review'` and emits telemetry.
    - `reviewPlan(plan)` spins up a short SmartLLMService call (profile `quality`, operation `plan_review`) that critiques the plan before execution.

### 5.3 `ToolExecutionService`

- Extend `executeTool` to recognize “virtual” tools (like `agent_create_plan`) and route them through injected handlers. Implementation idea: accept an optional map `virtualTools: Record<string, (args) => ToolExecutionResult>` from the orchestrator; real tools fall back to existing logic.
- Ensure tool validation gracefully skips schema checks for virtual tools (handled upstream).
- After each tool call, record timing + success metadata so LLM usage logs can attribute costs to individual tools (especially helpful for tracking plan drafts vs executions).

### 5.4 `ResponseSynthesizer`

- No longer generates the final chat response. Instead, scope it to:
    - Summaries returned from the plan meta tool (e.g., `summarizePlanOutcome()`).
    - Optional summarization utilities the LLM can call via another virtual tool if we want.
- Keep the clarifying helper for the blank-message short circuit.
- Provide helper copy for plan drafts/reviews (e.g., “Here’s the drafted plan for approval…”) so the LLM receives concise, ready-to-stream text.

### 5.5 `StrategyAnalyzer`

- Remove from the orchestrator dependency set.
- Keep the class in the codebase for debugging/offline evaluation, but mark it deprecated and guard usage behind feature flags or tests only.

### 5.6 Shared types & SSE route

- Update `StreamEvent` union (`apps/web/src/lib/services/agentic-chat/shared/types.ts`) to:
    - Remove `analysis` & `strategy_selected`.
    - Add `agent_state`, `plan_ready_for_review`, and `plan_review`.
    - Mark plan-related events as optional (sent only when the plan tool runs).
- Update `/api/agent/stream/+server.ts` to forward the new event types and stop expecting the removed ones.

### 5.7 UI clients (`AgentChatModal.svelte`)

- Replace the strategy/analysis banners with a simple status chip driven by `agent_state` (“Agent is thinking…”, “Agent is executing…”, “Waiting on you…”).
- When `plan_ready_for_review` arrives, present the plan summary inline and prompt the user (via assistant message) to confirm or modify the plan using natural language. Their next utterance (“Looks good, run it” / “Add a milestone first”) flows back through the main chat loop, so we do not render explicit buttons.
- For `plan_review` events, surface the reviewer verdict + notes inline so the user can see why execution proceeded or paused, again encouraging natural-language follow-up.
- Continue displaying tool call notifications as the planner loop emits them.

### 5.8 Persistence & logging

- Add `mode` (context type) column to planner agents and plans for analytics (or derive virtually if schema change is out-of-scope).
- Log each virtual tool invocation (especially the plan tool) with objective/context to audit misuse.
- Ensure `LLMUsageService` captures the `operationType`/`execution_mode` for each LLM call so we can break down auto vs draft vs review costs.
- Route all orchestrator/plan/review failures through `ErrorLoggerService` with structured metadata (contextType, execution_mode, toolName, sessionId).

### 5.9 Cost & guardrail instrumentation

- All SmartLLMService calls (planner stream, plan generation, plan review, executor helpers) must set `profile`, `operationType`, and include the originating `contextType`.
- Keep a per-turn counter for tool calls; when the cap is hit emit a warning event, log telemetry, and end the loop gracefully.
- Emit metrics for plan review outcomes (`approved`, `rejected`, `needs_changes`) to spot overuse of draft mode.

---

## 6. Implementation Plan (phased)

1. **Scaffolding**
    - Add plan intent types, virtual tool plumbing, and the plan meta tool definition (no feature flag—the flexible flow replaces the old one).
    - Update shared types + SSE plumbing so new events compile end-to-end.
2. **PlanOrchestrator upgrade**
    - Implement `createPlanFromIntent` + context-derived guidance.
    - Ensure plan execution returns structured summaries consumable by the LLM.
3. **New orchestrator loop**
    - Build `runPlannerLoop` with SmartLLMService streaming + tool dispatch.
    - Wire plan meta tool handler, `agent_state` events, and guardrails.
    - Remove the old strategy-based flow once the new loop has integration coverage.
4. **API / UI updates**
    - Adjust SSE route + frontend components to remove strategy UI and display agent state.
    - Broaden telemetry + persistence updates.
5. **Cleanup**
    - Remove unused handlers (`handleSimpleStrategy`, etc.) and disable `StrategyAnalyzer` in production once confident.
    - Update docs/tests to reflect the new flow.

---

## 7. Open Questions & Risks

Plan review confirmation happens through natural language (users may continue the conversation with feedback or a simple “run it” confirmation, which the LLM then translates into the appropriate follow-up tool call). Automated testing priorities will be defined during implementation and focus on the most risk-prone flows (project_create + plan review).

---

**Next steps:** Review this spec, confirm open-question resolutions, then start Phase 1 under a feature flag so we can A/B the new orchestration loop without breaking current users.
