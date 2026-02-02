<!-- docs/reports/agentic-chat-tool-flow-audit-2026-02-01.md -->

# Agentic Chat Tool Flow Audit (2026-02-01)

## Scope

Investigate repeated tool execution failures for `update_onto_task`, verify upstream context/prompt wiring, identify data/type/format issues, and document fixes to prevent recurrences.

## Incident Summary

- **Observed error (2026-02-01 15:48:00 PT):**
    - Tool: `update_onto_task`
    - Failure: `execution_error` → `No updates provided for ontology task`
    - Arguments: `{ "task_id": ": " }`
- **Impact:** Invalid tool arguments reached the write executor, causing a hard failure instead of a recovery or clarification.

## End-to-End Tool Flow (current)

1. **API entry**
    - `apps/web/src/routes/api/agent/stream/+server.ts`
    - Parses request, normalizes context, forwards into stream handler.

2. **Stream handler / context bootstrap**
    - `apps/web/src/routes/api/agent/stream/services/stream-handler.ts`
    - Generates `lastTurnContext` via `generateLastTurnContext` and passes it to the orchestrator.

3. **Planner context build**
    - `apps/web/src/lib/services/agent-context-service.ts`
    - Calls `PromptGenerationService.buildPlannerSystemPrompt` (planner prompt assembly) and sets `availableTools`.

4. **Tool selection**
    - `apps/web/src/lib/services/agentic-chat/analysis/tool-selection-service.ts`
    - Starts from context-default tools, optionally trims for focus, and selects tools via LLM/heuristics.

5. **LLM tool call generation**
    - `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts`
    - Sends system prompt + conversation history + tool list to LLM; receives tool calls.

6. **Tool arg enrichment (update tools)**
    - `apps/web/src/lib/services/agentic-chat/shared/tool-arg-enrichment.ts`
    - Adds display fields (e.g., `task_title`) when ID is known; does **not** invent IDs.

7. **Tool execution**
    - `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`
    - Validates tool name + args, then dispatches to `ChatToolExecutor`.

8. **Write executor**
    - `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts`
    - Builds `updateData`; throws if no update fields are provided.

## Findings (Root Causes)

### 1) Prompt guidance is missing critical ID discipline

- The consolidated planner prompt (`PLANNER_PROMPTS`) **does not include** strong “never guess IDs” / “update requires ID + field” rules.
- Detailed tool guidance exists in:
    - `apps/web/src/lib/chat/LLM_TOOL_INSTRUCTIONS.md`
    - `apps/web/src/lib/services/chat-context-service.ts`
      …but **neither is wired into** `PromptGenerationService` for the streaming planner flow.
- Result: LLM can call update tools without valid IDs or update fields, as seen with `task_id: ": "`.

### 2) Validation previously allowed empty/invalid update calls

- `ToolExecutionService.validateToolCall` checked only required fields by presence, not UUID validity or non-empty update payloads for update tools.
- Invalid calls reached the executor and threw `No updates provided for ontology task`.

### 3) No repair/clarification path for validation errors

- The orchestrator handles `tool_not_loaded` by expanding tool pool, but has **no equivalent recovery** for invalid arguments (e.g., missing IDs or empty updates).
- This makes LLM mistakes appear as hard errors rather than recoverable prompts.

## Changes Implemented (2026-02-01)

### A) Runtime validation: prevent invalid update calls from executing

- **File:** `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`
- **New behavior:**
    - Trim all `*_id` fields and drop empty strings.
    - For any `update_onto_*` tool:
        - Require a valid UUID for `*_id`.
        - Require at least one actual update field (ignore `update_strategy`, `merge_instructions`, and display-only fields).
- **Impact:** Errors become `validation_error` and fail fast **before** hitting executor.

### B) Prompt updates: explicit ID discipline added

- **Planner prompt:** `apps/web/src/lib/services/agentic-chat/prompts/config/planner-prompts.ts`
    - Added rules to never fabricate IDs and to require an ID + update fields for update tools.
- **Executor prompt:** `apps/web/src/lib/services/agentic-chat/prompts/config/executor-prompts.ts`
    - Added rule to avoid update/delete calls without valid IDs; report missing data instead.

### C) One-shot validation repair flow

- **File:** `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts`
- **New behavior:** On a `validation_error`, inject a system repair instruction and allow a single replan attempt (find IDs, include update fields, or ask for clarification).

## Why the Error Happened (most likely)

- LLM attempted an update without having a real task UUID.
- Prompt did not explicitly warn against placeholder IDs.
- Validation allowed `task_id: ": "` to pass because it was a non-empty string.
- Executor threw when `updateData` was empty.

## Preventing Similar Errors (Recommendations)

### 1) Wire in concise tool-ID guidance for the streaming planner

- Either:
    - Add a compact “ID discipline” section to `PLANNER_PROMPTS` (already done), or
    - Explicitly include select content from `LLM_TOOL_INSTRUCTIONS.md` in `PromptGenerationService`.
- Keep it short to avoid token inflation; the current new bullets should be enough.

### 2) Broaden ID validation beyond update tools

- Consider applying UUID validation to **all** ontology tools that accept `*_id` (read/update/delete/link).
- Option: centralize in `ToolExecutionService` (a generic `validateIdArgs` helper).

### 3) Add a recovery path for invalid args

- In `AgentChatOrchestrator`, add a one-shot repair when `validation_error` indicates:
    - Missing/invalid ID → auto-run list/search or ask a clarifying question.
    - No update fields → ask user what to change.
- This prevents repeated failure loops and reduces error logs.

### 4) Tests

- Add targeted unit tests in `tool-execution-service.test.ts` for:
    - Empty/invalid `*_id` on update tools → `validation_error`.
    - Update tools with no update fields → `validation_error`.

## Verification Checklist

- Trigger a user update request without a task ID and confirm:
    - The tool call is rejected with a `validation_error`.
    - The assistant asks for clarification or lists tasks first.
- Trigger a correct update request and confirm:
    - Tool executes successfully with valid UUID and update field.

## Open Questions

- Should `LLM_TOOL_INSTRUCTIONS.md` be deprecated (unused) or explicitly integrated?
- Do we want to suppress logging for recoverable `validation_error` cases, or keep them for telemetry?
