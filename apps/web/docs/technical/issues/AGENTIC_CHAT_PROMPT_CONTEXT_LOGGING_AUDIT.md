<!-- apps/web/docs/technical/issues/AGENTIC_CHAT_PROMPT_CONTEXT_LOGGING_AUDIT.md -->

# Agentic Chat Audit - Prompts, Contexts, Logging

> Created: 2025-12-31
> Scope: `/apps/web` agentic chat stack (UI -> `/api/agent/stream` -> orchestrator -> tools/LLM)

## Scope Notes

Primary codepaths reviewed:

- Prompt assembly: `apps/web/src/lib/services/agentic-chat/prompts/*`
- Context assembly: `apps/web/src/lib/services/agent-context-service.ts`, `apps/web/src/lib/services/context/*`, `apps/web/src/lib/services/chat-context-service.ts`
- Orchestration: `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts`
- Streaming API: `apps/web/src/routes/api/agent/stream/services/stream-handler.ts`
- Tooling: `apps/web/src/lib/services/agentic-chat/tools/*`
- LLM + logging: `apps/web/src/lib/services/smart-llm-service.ts`, `apps/web/src/lib/services/errorLogger.service.ts`

## Findings

## Remediation Status (2025-12-31)

- ✅ F1 Project creation prompt conflict resolved (project_create now treats intent as confirmation).
- ✅ F2 Ontology terminology conflict resolved (explicit ontology-mode override added).
- ✅ F3 Audit/forecast read-only enforcement added in tool selection.
- ✅ F4 Legacy tool references updated to ontology equivalents in location context.
- ✅ F5 Executor context document field corrected (`context_document.content`).
- ✅ F6 Ontology context duplication removed from planner prompt.
- ✅ F7 Project_create analysis duplication removed (tool selection skips extra analysis).
- ✅ F8 `tool_call_id` preserved in planner context history.
- ✅ F9 Stream-level failures persisted to error logs.
- ✅ F10 Tool execution failures persisted with args + context.
- ✅ F11 Executor failures persisted to error logs.
- ✅ F12 Project creation analysis now logs chat session ID.
- ✅ F13 Response synthesis logs include plan + project metadata.
- ✅ F14 Content merge LLM calls include session + project metadata.
- ✅ F15 Streaming usage logs capture model/provider resolution flags.
- ✅ Additional: normalize task state input in task create/update to prevent enum mismatches.
- ✅ Additional: error log insert retry removes invalid project_id to avoid FK failures.
- ✅ Additional: fix missing chatSessionId extraction in output/document handlers.
- ✅ Additional: agent-message LLM usage logging now includes user + project context.

### Prompt And Context Clarity

#### F1. Project creation prompt conflicts with write-confirmation rule

- Severity: Medium
- Evidence: `apps/web/src/lib/services/agentic-chat/prompts/config/planner-prompts.ts:103`, `apps/web/src/lib/services/agentic-chat/prompts/config/context-prompts.ts:80`
- Impact: The base prompt says "confirm before writes" while project_create says "default assumption is create"; the model may over-confirm or stall when it should proceed.
- Recommendation: Add an explicit override in project_create guidance (or change the base rule to "confirm writes except in project_create where explicit create intent is assumed").

#### F2. Ontology context guidance conflicts with "no internal terminology"

- Severity: Low
- Evidence: `apps/web/src/lib/services/agentic-chat/prompts/config/context-prompts.ts:40`, `apps/web/src/lib/services/agentic-chat/prompts/config/planner-prompts.ts:149`
- Impact: "Ontology mode" suggests internal data-model focus, but base rules forbid internal terminology, which can confuse the model if ontology mode is exposed.
- Recommendation: Either hide "ontology" mode in UI or add a mode-specific override that allows internal terms explicitly.

#### F3. Project audit/forecast contexts still allow write tools

- Severity: Medium
- Evidence: `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts:184`, `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts:234`, `apps/web/src/lib/services/agentic-chat/prompts/config/context-prompts.ts:42`
- Impact: Audit/forecast flows are meant to be read-only analysis, but the default tool pool includes write tools, enabling accidental mutations.
- Recommendation: Enforce read-only tool pools for `project_audit` and `project_forecast`, or add a strict "no writes" prompt rule for those contexts.

#### F4. Legacy tool names in location context (project_create + project)

- Severity: High
- Evidence: `apps/web/src/lib/services/chat-context-service.ts:776`, `apps/web/src/lib/services/chat-context-service.ts:833`
- Impact: Location context instructs using `search_projects`, `list_tasks`, and `get_project_details`, which do not exist in the current tool catalog; this can trigger tool_not_loaded errors and confusion.
- Recommendation: Update to `search_ontology`, `list_onto_tasks`, `get_onto_project_details` (or remove tool references entirely in these legacy context blocks).

#### F5. Executor prompt references wrong context_document field

- Severity: High
- Evidence: `apps/web/src/lib/services/context/executor-context-builder.ts:101`, `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts:521`
- Impact: Executor prompt says `context_document.body_markdown`, but tool schema expects `context_document.content`; this can generate invalid tool calls.
- Recommendation: Align executor prompt to `context_document.content`.

#### F6. Ontology context duplication increases prompt noise

- Severity: Low
- Evidence: `apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts:52`, `apps/web/src/lib/services/agent-context-service.ts:179`
- Impact: Ontology details appear both in the system prompt and again in the location snapshot, inflating tokens and increasing repetition.
- Recommendation: Consolidate ontology context into one location (prefer `locationContext`), and keep the other minimal or remove it.

### Flow And Behavior

#### F7. Project_create analysis is run twice per turn

- Severity: Medium
- Evidence: `apps/web/src/lib/services/agentic-chat/analysis/strategy-analyzer.ts:143`, `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts:261`
- Impact: The LLM runs ProjectCreationAnalyzer during tool selection and then again in `checkProjectCreationClarification`, doubling cost and risking inconsistent questions.
- Recommendation: Reuse the analysis output from strategy/tool selection, or skip tool selection entirely for project_create until after clarification is resolved.

#### F8. Tool history loses tool_call_id in planner context

- Severity: Medium
- Evidence: `apps/web/src/lib/services/agent-context-service.ts:367`
- Impact: Tool messages in history are passed without `tool_call_id`, which can break or confuse tool-call pairing if the server loads history from DB that includes tool results.
- Recommendation: Preserve `tool_call_id` when mapping tool messages, or filter tool messages out consistently.

### Error Logging Gaps

#### F9. Stream-level failures are not persisted to error_logs

- Severity: Medium
- Evidence: `apps/web/src/routes/api/agent/stream/services/stream-handler.ts:402`
- Impact: Streaming failures are only console-logged; they are missing from `error_logs` and cannot be tracked in the admin UI.
- Recommendation: Inject ErrorLoggerService in StreamHandler and log errors with session/user/context metadata.

#### F10. Tool execution errors are not persisted

- Severity: Medium
- Evidence: `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts:188`
- Impact: Tool failures are logged to console only; error_logs loses the primary failure signal for tool reliability.
- Recommendation: Log tool failures (toolName, args, errorType, sessionId) via ErrorLoggerService.

#### F11. Executor failures are not persisted to error_logs

- Severity: Low
- Evidence: `apps/web/src/lib/services/agent-executor-service.ts:178`
- Impact: Executor errors only show in console; debugging failures at scale is harder.
- Recommendation: Log executor failures with planId/stepNumber to error_logs.

### LLM Usage Logging Gaps

#### F12. Project creation analysis lacks session linkage

- Severity: Medium
- Evidence: `apps/web/src/lib/services/agentic-chat/analysis/project-creation-analyzer.ts:440`
- Impact: LLM usage for clarification analysis cannot be tied back to a chat session or project.
- Recommendation: Pass `chatSessionId` (and projectId when available) into `generateText` for `project_creation_analysis`.

#### F13. Response synthesis logs omit plan/entity context

- Severity: Low
- Evidence: `apps/web/src/lib/services/agentic-chat/synthesis/response-synthesizer.ts:326`
- Impact: Usage logs for synthesis cannot be joined to plans or entity context, limiting cost attribution.
- Recommendation: Pass `agentPlanId`, `agentExecutionId`, and `projectId` when available.

#### F14. Content merge LLM calls lack session context

- Severity: Low
- Evidence: `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts:1001`
- Impact: Merge costs are logged without session or project identifiers.
- Recommendation: Thread `chatSessionId` and `projectId` into these LLM calls via executor context.

#### F15. Streaming usage logs cannot confirm actual fallback model

- Severity: Low
- Evidence: `apps/web/src/lib/services/smart-llm-service.ts:2172`
- Impact: `modelUsed` for streaming is assumed to be the requested model, masking OpenRouter fallbacks.
- Recommendation: If available, capture model/provider from stream headers or first chunk metadata, or record a "model_used_unknown" flag when streaming lacks a model field.

## Cleanup Plan (Suggested Order)

1. Fix the `context_document.body_markdown` mismatch and update legacy tool references in `chat-context-service.ts`.
2. Resolve project_create prompt conflict and remove duplicate ProjectCreationAnalyzer call.
3. Enforce read-only tool pools for audit/forecast contexts or add explicit prompt guardrails.
4. Consolidate ontology context and add `tool_call_id` to history mapping.
5. Add error logging hooks in stream handler, tool execution, and executor service.
6. Enrich LLM usage logs with session, plan, and entity metadata; address streaming model fallback ambiguity.
