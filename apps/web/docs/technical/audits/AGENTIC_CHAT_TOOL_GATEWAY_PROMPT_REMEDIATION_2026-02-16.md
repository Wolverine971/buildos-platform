# Agentic Chat Tool Gateway Prompt Remediation (2026-02-16)

## Scope
Remediate prompt/instruction gaps for `AGENTIC_CHAT_TOOL_GATEWAY=true` so the LLM reliably uses:
- `tool_help`
- `tool_exec`
- canonical gateway ops (`onto.*`, `cal.*`, `util.*`)

This document tracks issue-by-issue progress and verification.

## Status Legend
- `[ ]` Not started
- `[-]` In progress
- `[x]` Completed

## Issues & Progress

### 1) Legacy op names in gateway prompts (invalid `tool_exec.op`)
- Status: `[x]`
- Problem:
  - Prompt text instructed legacy names like `get_document_tree` / `move_document_in_tree` / `reorganize_onto_project_graph` in gateway mode.
  - Those are tool names, not canonical gateway ops.
- Planned fix:
  - Update gateway prompt guidance to canonical ops (`onto.document.tree.get`, `onto.document.tree.move`, `onto.project.graph.reorganize`).
  - Add migration-safe op aliases for common bare legacy names.
- Completed:
  - Updated gateway prompt text to canonical op names in:
    - `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts`
    - `apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts`
    - `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`
  - Added bare legacy alias normalization in:
    - `apps/web/src/lib/services/agentic-chat/tools/registry/gateway-op-aliases.ts`
  - Added regression test:
    - `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.gateway.test.ts`

### 2) Event model contradiction (ontology entity vs calendar namespace)
- Status: `[x]`
- Problem:
  - Prompt said events are ontology entities while also instructing `cal.event.*`.
- Planned fix:
  - Clarify data model text: events are handled via calendar ops (`cal.event.*`), not ontology entity CRUD.
- Completed:
  - Updated data model wording in:
    - `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts`
  - Reinforced namespace wording in gateway blocks:
    - `apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts`
    - `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`

### 3) Missing canonical CRUD family instruction
- Status: `[x]`
- Problem:
  - Prompt lacked an explicit canonical op family statement for ontology entities.
- Planned fix:
  - Add explicit pattern:
    - `onto.<entity>.create|list|get|update|delete|search`
  - Enumerate supported entities.
- Completed:
  - Added canonical op family + entity list in:
    - `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts`
    - `apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts`
    - `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`

### 4) Missing schema-depth instruction for complex writes
- Status: `[x]`
- Problem:
  - Prompt did not tell model when to request full schemas.
- Planned fix:
  - Add guidance to call:
    - `tool_help("<exact op>", { format: "full", include_schemas: true })`
    - before complex/first-time writes in a turn.
- Completed:
  - Added schema-depth guidance in:
    - `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts`
    - `apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts`
    - `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`
    - `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts` (repair instruction)

### 5) Discovery churn from root-first pattern
- Status: `[x]`
- Problem:
  - Prompt defaulted to `tool_help("root")` pattern, increasing unnecessary discovery loops.
- Planned fix:
  - Prefer targeted help paths first (e.g., `onto.document`, `onto.task`).
  - Use `root` only when namespace is unknown.
- Completed:
  - Replaced root-first wording with targeted discovery in:
    - `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts`
    - `apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts`
    - `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`
    - `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts` (repair instruction)

### 6) Legacy prompt stack conflicts with gateway mode
- Status: `[x]`
- Problem:
  - Legacy prompt text (`PromptGenerationService` stack) contains non-gateway naming and write-confirmation guidance that can conflict with gateway behavior.
- Planned fix:
  - Align gateway sections in `PromptGenerationService`.
  - Remove/neutralize conflicting legacy raw-tool naming where feasible.
  - Keep language user-facing while internal gateway behavior stays precise.
- Completed:
  - Gateway block aligned in:
    - `apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts`
  - Legacy prompt wording de-conflicted (write confirmation and raw tool-name references):
    - `apps/web/src/lib/services/agentic-chat/prompts/config/planner-prompts.ts`
  - Project workspace guidance updated to canonical document-tree move op:
    - `apps/web/src/lib/services/agentic-chat/prompts/config/context-prompts.ts`

## File Plan
- `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts`
- `apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts`
- `apps/web/src/lib/services/agentic-chat/prompts/config/planner-prompts.ts`
- `apps/web/src/lib/services/agentic-chat/prompts/config/context-prompts.ts`
- `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts`
- `apps/web/src/lib/services/agentic-chat/tools/registry/gateway-op-aliases.ts`
- Tests:
  - `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts`
  - `apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.test.ts`
  - `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.gateway.test.ts`

## Verification Plan
- Targeted tests:
  - gateway prompt tests
  - gateway execution alias tests
  - stream orchestrator tests (repair-instruction wording still coherent)
- Targeted grep for stale guidance:
  - legacy op names in gateway prompt blocks
  - root-first-only discovery wording
  - ontology event wording conflicts

## Change Log
- 2026-02-16: Created remediation tracker and issue checklist.
- 2026-02-16: Implemented all six remediation items across gateway prompt builders, legacy prompt stack, gateway alias normalization, and stream repair instructions.
- 2026-02-16: Added/updated tests and passed targeted suite:
  - `master-prompt-builder.test.ts`
  - `prompt-generation-service.test.ts`
  - `tool-execution-service.gateway.test.ts`
  - `stream-orchestrator.test.ts`
