# Project Workspace Ontology Focus Plan

## Objectives & Success Criteria

- Surface pill-style focus options in the project workspace so users can pivot between the whole project and specific ontology entities (`onto_task`, `onto_goal`, `onto_document`, `onto_milestone`, `onto_plan`) without leaving the chat.
- Let each pill open an "existing vs create new" selector that mirrors the current project-selection UX, then persist the choice so every downstream agent call stays scoped correctly.
- Make the focus model pluggable so future entity types can reuse the same hooks across the frontend, `/api/agent/stream`, `AgentContextService`, and the orchestration stack.

## Current Behavior & Identified Gaps

### Frontend (AgentChatModal)

- `apps/web/src/lib/components/agent/AgentChatModal.svelte` only tracks `selectedContextType` + `entityId`; once a project is chosen everything is treated as the same `project` focus.
- There is no UI affordance in the `Project workspace` mode (`apps/web/src/lib/components/chat/ContextSelectionScreen.svelte` around the mode-selection view) to narrow scope or jump into child entities.
- `handleSend()` infers `ontologyEntityType` solely from `contextType` (task vs others) and therefore cannot load goal/plan/document/milestone context.

### Backend & API

- `/api/agent/stream` only understands `context_type`, `entity_id`, and an optional `ontologyEntityType`. We cannot send both the project id and a task/goal/etc. id simultaneously, which we need for scoped conversations.
- `apps/web/src/lib/services/ontology-context-loader.ts` can load projects or a single element but lacks helpers that include "element + parent project" and does not understand milestones.
- Chat sessions persist `context_type` and `entity_id` in `chat_sessions`, but there is no durable place to remember the selected sub-context/focus.

### Agentic Core Services

| Service                                                                                                       | Current responsibility                                                | Gap for modular focus                                                                  |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `AgentChatOrchestrator` (`apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts`)   | Pipes requests through analyzer → planner → execution                 | Only receives `contextType`/`entityId`; no metadata about the active ontology entity   |
| `AgentContextService` (`apps/web/src/lib/services/agent-context-service.ts`)                                  | Builds system prompt + location context (with optional ontology data) | Cannot merge project + child entity context or inject focus-specific instructions      |
| `StrategyAnalyzer` (`apps/web/src/lib/services/agentic-chat/analysis/strategy-analyzer.ts`)                   | Prompts LLM to pick strategy/tool set                                 | Prompt never mentions the active entity, so strategies stay generic                    |
| `PlanOrchestrator` (`apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`)                   | Expands complex strategies into executor steps                        | Uses static tool lists and cannot enforce task-only vs goal-only plans                 |
| `ToolExecutionService` & `ExecutorCoordinator` (`apps/web/src/lib/services/agentic-chat/execution/*`)         | Execute tool calls / spawn executors                                  | Execution metadata lacks scoped entity ids, blocking future routing/auditing           |
| `ResponseSynthesizer` (`apps/web/src/lib/services/agentic-chat/synthesis/response-synthesizer.ts`)            | Builds final assistant text                                           | No way to remind users which entity is in focus or when it switches                    |
| `AgentPersistenceService` (`apps/web/src/lib/services/agentic-chat/persistence/agent-persistence-service.ts`) | Persists agent/plan/session rows                                      | Schemas do not record focus, so analytics/audit trails cannot partition runs by entity |

### Tooling

- `apps/web/src/lib/chat/tool-definitions.ts` defines list/get/create tools for projects, tasks, goals, and plans only. There are no document/milestone-specific tools, nor `get_onto_goal_details` / `get_onto_plan_details`.
- `apps/web/src/lib/chat/tools.config.ts` maps `'task'` contexts to the same project tool set; we cannot fine-tune the available tools per focus.

## Solution Overview

### 1. Focus Model

Introduce a durable `ProjectChatFocus` interface in `apps/web/src/lib/types/agent-chat-enhancement.ts`:

```ts
export interface ProjectChatFocus {
	projectId: string;
	scope: 'project' | 'task' | 'goal' | 'plan' | 'document' | 'milestone';
	mode: 'existing' | 'create';
	entityId?: string; // required when mode === 'existing'
	displayName: string;
	metadata?: Record<string, any>; // hints like type_key, stub description, etc.
}
```

- Store the focus in the frontend state, send it to `/api/agent/stream` as `ontology_focus`, persist it inside `chat_sessions.agent_metadata.focus`, and echo it back via SSE (`focus_changed`) so we can sync across tabs.
- Define a registry (`apps/web/src/lib/chat/project-focus.config.ts`) that describes each pill: label, icon, supported actions (existing vs create), fetchers for populating the selector, default tool recommendations, and backend `ontologyEntityType` mapping. This registry can be imported by both the UI and the agent services.

### 2. UX Outline

- Embed a `ProjectFocusBar` component at the top of the chat body whenever `selectedContextType === 'project'`. It renders pills from the registry, shows the active focus, and exposes a "Change" affordance.
- Clicking a pill opens a `ProjectFocusSelector` drawer with two cards: "Work with existing" (shows a search/list of matching entities scoped to the active project) and "Create something new" (collects minimal seed info—e.g., title/type—that we pass through `ontology_focus.metadata` so the agent knows what to create).
- Default focus is `scope: 'project'`. Switching focus keeps the current conversation but pushes a system activity chip (similar to the activity entries already rendered in `AgentChatModal`) and resets the streaming controller so the next user prompt goes out with the new metadata.
- `ContextSelectionScreen` only needs a small tweak: when a project workspace is selected we can optionally prompt the user to pre-select a focus (pre-populate the chat’s focus so the first message is scoped).

### 3. Backend Contract

- Extend `ChatStreamRequest` / `AgentStreamRequest` (in `packages/shared-types/src/chat.types.ts` and `/api/agent/stream/+server.ts`) with an optional `ontology_focus`.
- `/api/agent/stream` must:
    - Validate that `ontology_focus.projectId` matches the session project.
    - When `scope !== 'project'`, load both the project context and the element context (task/goal/plan/document/milestone) and pass them to `AgentContextService`.
    - Persist the focus in `chat_sessions.agent_metadata` and emit it once via SSE.
    - Provide helpers for existing selectors: add `GET /api/onto/projects/[id]/entities?type=task|goal|plan|document|milestone` returning lightweight rows for the selector UI.

### 4. Agentic Service Extensions

- **AgentContextService**: accept `{ ontologyFocus?: ProjectChatFocus }`, load the project context once, and, when an element is selected, append a second "focus" block to `locationContext` plus metadata (`plannerContext.metadata.focus`). The service should also hint which tools are most relevant for that focus (pulled from the registry).
- **StrategyAnalyzer**: include focus metadata in both the system prompt and the LLM analysis prompt (e.g., “Active focus: Ontology Task ‘Kickoff call’ (ID …). Prefer task-centric tools.”).
- **PlanOrchestrator**: allow injecting focus-aware tool clamps (e.g., only task tools when `scope === 'task'`) and bubble the focus id down to executor tasks so any executor knows which entity it is touching and can auto-update `lastTurnContext`.
- **ToolExecutionService**: attach `focusScope` / `focusEntityId` onto the execution metadata, so audit logs remain scoped.
- **ResponseSynthesizer**: mention the active focus in the opening clause and flag when output spans outside the scope (“I stayed scoped to Task XYZ…”).
- **AgentPersistenceService**: expand `AgentPlanInsert` / `AgentInsert` metadata fields to include `focus_scope` + `focus_entity_id` for analytics.

### 5. Tooling Enhancements

- Add read/write tool definitions for documents and milestones (and any missing detail tools) plus update `tools.config.ts` so each focus module maps to the correct subset:
    - `list_onto_documents`, `get_onto_document_details`, `create_onto_document`.
    - `list_onto_milestones`, `get_onto_milestone_details`, `create_onto_milestone`.
    - `get_onto_goal_details`, `get_onto_plan_details`.
- Update `CONTEXT_TO_TOOL_GROUPS` to allow `contextType: 'project'` + `focusScope` overrides (e.g., `focusOverrides.task = ['list_onto_tasks', 'get_onto_task_details', ...]`).

## Implementation Plan

### Phase 0 – Shared Foundations

1. **Types & registry**
    - Add `ProjectChatFocus`, `ProjectFocusDefinition`, and `FocusEntitySummary` to `apps/web/src/lib/types/agent-chat-enhancement.ts`.
    - Create `apps/web/src/lib/chat/project-focus.config.ts` exporting the pill definitions (label, scope, icon, loader keys, recommended tools).
2. **Shared utility hooks**
    - Provide helper functions (e.g., `deriveOntologyParams(focus)`) consumed by both the UI and `/api/agent/stream`.

### Phase 1 – Frontend UX

1. **ProjectFocusBar component** (`apps/web/src/lib/components/agent/ProjectFocusBar.svelte`)
    - Renders pills, shows active focus, and emits `focusSelected`.
2. **Selector modal/drawer** (`apps/web/src/lib/components/agent/ProjectFocusSelector.svelte`)
    - Two-column layout (existing vs new).
    - Reuse `apps/web/src/lib/components/SearchCombobox.svelte` for the existing list. Data comes from new `/api/onto/projects/[id]/entities` endpoint with type filters.
    - For “create” mode, capture seeds (name/type) and set `focus.mode = 'create'` with metadata so the agent can finish creation.
3. **Integrate into AgentChatModal**
    - When `selectedContextType === 'project'`, render `ProjectFocusBar` below the modal header (before the scrollable chat area).
    - Store focus state (default `scope: 'project'`).
    - Pass focus info into `handleSend()` so `/api/agent/stream` receives it.
    - Update `handleSSEMessage` to react to new `focus_changed` events and to show a small activity message.
    - Reset focus when the user switches to other context types.
4. **ContextSelectionScreen tweaks**
    - After selecting a project workspace, optionally prompt the user to pre-select a focus (pre-populate the chat’s focus so the first message is scoped).

### Phase 2 – API & Persistence

1. **Payload & validation**
    - Extend `ChatStreamRequest` (`packages/shared-types/src/chat.types.ts`) and `AgentStreamRequest` inside `/api/agent/stream/+server.ts` to accept `ontology_focus`.
    - Validate `scope`, `projectId`, and `entityId` (when required).
2. **Entity summary endpoints**
    - Add `/api/onto/projects/[id]/entities/+server.ts` with `type` + `search` query params returning compact rows needed by the selector.
3. **Focus persistence & SSE**
    - Store the focus JSON inside `chat_sessions.agent_metadata.focus`.
    - Emit `{ type: 'focus_changed', focus: ... }` SSE payloads whenever the focus stored on the session differs from the inbound payload.
4. **Last-turn context**
    - Update `generateLastTurnContext` to carry `focus_scope` and `focus_entity_id` so the agent remembers the scope even after tools run.

### Phase 3 – Ontology Loading & Context Service

1. **Ontology loader upgrades** (`apps/web/src/lib/services/ontology-context-loader.ts`)
    - Add `loadProjectElementContext(projectId, elementType, elementId)` and milestone support (table map entry + relationship loader).
    - Return both the project summary and the element data so downstream services don’t need multiple calls.
2. **AgentContextService**
    - Accept an optional `ontologyFocus` parameter.
    - When `scope !== 'project'`, call the new loader to build a combined location context, include a dedicated “Focus” section in the prompt, and set `metadata.focus = focus`.
    - Expose `getContextTools()` overrides based on `focus.scope`.
3. **Tool selection helper**
    - Introduce `getToolsForFocus(contextType, focusScope)` in `apps/web/src/lib/chat/tools.config.ts` to consolidate logic.

### Phase 4 – Agentic Orchestration

1. **AgentChatOrchestrator**
    - Thread `ontologyFocus` through `AgentChatRequest`, `ServiceContext`, and the strategy/plan/tool flows.
    - When focus changes mid-session (e.g., context shift event), emit `focus_changed`.
2. **StrategyAnalyzer**
    - Inject focus info into prompts, ensure the fallback heuristics favor the relevant tool slice.
3. **PlanOrchestrator**
    - Accept `focus` to clamp tool lists, annotate plan metadata, and ensure executor tasks include `focusScope` so specialized executors can be introduced later.
4. **ToolExecutionService & ExecutorCoordinator**
    - Attach focus metadata onto every tool execution record and spawn request.
    - Future-friendly: allow hooking custom executors per focus (e.g., milestone-specific instructions).
5. **ResponseSynthesizer**
    - Read `plannerContext.metadata.focus` to craft focus-aware wrap-ups (“Here’s the latest on Milestone X…”).

### Phase 5 – Tool Definitions & Config

1. **Add missing ontology tools** in `apps/web/src/lib/chat/tool-definitions.ts` and ensure `CHAT_TOOL_DEFINITIONS` exports:
    - `list_onto_documents`, `get_onto_document_details`, `create_onto_document`.
    - `list_onto_milestones`, `get_onto_milestone_details`, `create_onto_milestone`.
    - `get_onto_goal_details`, `get_onto_plan_details`.
    - Update `ENTITY_FIELD_INFO` to describe document/milestone fields.
2. **Update tool grouping** (`apps/web/src/lib/chat/tools.config.ts`)
    - Introduce `focusToolGroups` keyed by `scope`.
    - Ensure `getToolsForContextType` can take a `focusScope` override so the planner/executor only see the relevant subset.
3. **LLM prompt hints**
    - Provide human-readable descriptions per focus (pulled from the registry) to encourage progressive disclosure.

### Phase 6 – QA & Rollout

1. Manual test matrix covering:
    - Switching between project/task/goal/etc. within the same session.
    - Creating a new task/goal flow (focus mode `create`).
    - Verifying SSE focus events keep multiple tabs in sync.
2. Add integration tests for `/api/agent/stream` verifying the ontology loader receives both project + element payloads.
3. Update docs (`apps/web/docs/features/agentic-chat/PROJECT_CONTEXT_RENAME_SPEC.md`) to reference the new focus model and registry.

## Testing & Validation

- **Unit tests** for the registry helpers, ontology loader additions, and `AgentContextService` focusing logic (mocking Supabase).
- **Contract tests** for the new `/api/onto/projects/[id]/entities` endpoint (empty states, search filters).
- **End-to-end smoke** (Playwright or manual) to ensure the pill UI gates input and that focus metadata is persisted across reloads.
- **Logging/telemetry**: add debug logs whenever focus changes to verify adoption before enabling for all users.

## Risks & Open Questions

1. **Creation mode UX**: do we expect the agent to create the entity after the user picks “Create”? Plan assumes yes; confirm whether we should open the existing task/goal modals instead.
2. **Token budget**: stacking both project + element context increases token usage. Monitor `AgentContextService` logs and consider trimming relationship depth for element focus.
3. **Backward compatibility**: existing sessions stored without `focus` should default to `scope: 'project'`. Ensure migrations or runtime defaults cover this.
4. **Milestone tooling**: Supabase migrations added `onto_milestones`, but there are no REST endpoints yet. We may need basic CRUD endpoints to keep the agent empowered.
5. **Executor specialization**: if future focus types require custom executor prompts, extend the registry to specify executor templates (out of scope for the first iteration but worth noting now).
