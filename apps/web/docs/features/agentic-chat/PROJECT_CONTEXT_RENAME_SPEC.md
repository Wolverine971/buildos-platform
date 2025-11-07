# Agentic Project Context Rename & Prompt Expansion

## Background

- Agentic chat sessions that start from `apps/web/src/lib/components/agent/AgentChatModal.svelte` treat “selected project” flows as `project_update`. That label leaks into the UI, planner prompts, and SSE context shifts, even though the new `createAgentChatOrchestrator()` architecture (`apps/web/src/lib/services/agentic-chat/index.ts`) now supports open-ended project research, reporting, or updates.
- The current planner context/prompt assembled in `apps/web/src/lib/services/agent-context-service.ts` only has special handling for `project_create`. When users select an existing project, they get the default global instructions plus whatever abbreviated ontology data is loaded. There is no block that tells the planner how to handle project-wide questions, reviews, or edits in a single context.
- `ChatContextType` in `packages/shared-types/src/chat.types.ts` and `AgentChatType` in `packages/shared-types/src/agent.types.ts` still include `project_update`, and the Supabase constraint/migrations allow and persist this string. Tool responses (e.g. `createOntoProject` in `apps/web/src/lib/chat/tool-executor.ts`) emit `context_shift.new_context = 'project_update'`, so downstream UI and session rows keep that label alive.
- Multiple UI touchpoints (navigation shortcuts, context pickers, SSE handlers) special-case `project_update`. Examples include: `ContextSelectionScreen.svelte`, `ProjectModeSelectionView.svelte`, `ChatInterface.svelte`, `Navigation.svelte`, `BrainDumpModal.svelte`, `ChatModal.svelte`, and the context badges/descriptors inside `AgentChatModal.svelte`.

## Goals

1. **Rename the working context to `project`** whenever the user is anchored to a specific project in agentic chat—covering types, persistence, SSE events, tool metadata, and UI.
2. **Broaden the planner prompt for project context** so the LLM understands it can answer questions, summarize, analyze, or update any project-related entities—not just perform literal “updates”.
3. Keep the new orchestrator path (`createAgentChatOrchestrator`) the source of truth; once the doc/spec is approved the implementation should not touch the legacy planner/executor codepaths unless unavoidable.

## Non-Goals

- Changing how project templates or instantiation works (`project_create` remains intact).
- Rewriting tool definitions or executor orchestration beyond parameter auto-fills.
- Altering unrelated chat contexts (`task_update`, `project_audit`, etc.).

## Current Gaps Snapshot

| Area              | File(s)                                                                                                                                               | Issue                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Shared types + DB | `packages/shared-types/src/chat.types.ts`, `packages/shared-types/src/agent.types.ts`, `supabase/migrations/20251028_fix_context_type_constraint.sql` | `project_update` is a first-class value; no aliasing to `project`.                                      |
| Context builders  | `apps/web/src/lib/services/agent-context-service.ts`                                                                                                  | Only `project_create` gets bespoke prompt instructions; fallback text still says “Project Update Mode”. |
| Tool results      | `apps/web/src/lib/chat/tool-executor.ts`                                                                                                              | `createOntoProject` emits `context_shift.new_context = 'project_update'`.                               |
| Streaming API     | `apps/web/src/routes/api/agent/stream/+server.ts`                                                                                                     | Context-shift SSEs, Supabase writes, and ontology loading branches refer to `project_update`.           |
| UI & launchers    | `AgentChatModal`, `ChatInterface`, `ContextSelectionScreen`, `ProjectModeSelectionView`, `Navigation`, `BrainDumpModal`, `ChatModal`                  | Copy and logic assume a dedicated `project_update` mode, exposing that name everywhere.                 |
| Documentation     | `docs/technical/implementation/PROJECT_CONTEXT_SHIFT_*.md`, `apps/web/docs/features/agentic-chat/*`                                                   | Specs and diagrams still describe `project_update`.                                                     |

## Implementation Plan

### 1. Shared Types & Persistence Layer

- **Unify context enums**
    - Update `ChatContextType` in `packages/shared-types/src/chat.types.ts` so `project_update` is removed (or aliased) and `project` is the canonical “selected project” context.
    - Mirror the same change in `AgentChatType` (`packages/shared-types/src/agent.types.ts`), plus any helper maps such as `AGENT_MODES` if present.
    - Adjust union usages downstream (TypeScript errors will flag any lingering `project_update` references).
- **Database migration**
    - Create a Supabase migration that:
        1. Updates existing rows: `UPDATE chat_sessions SET context_type = 'project' WHERE context_type = 'project_update';` (repeat for any other tables storing `context_type`, e.g., `chat_messages`, `chat_context_cache`, `agent_sessions` if applicable).
        2. Alters the check constraint introduced in `20251028_fix_context_type_constraint.sql` to drop `'project_update'`. Keep `'project'` in the allowed set so legacy rows remain valid.
        3. Documents the rename in column comments for auditing.
- **SSE/Type updates**
    - Ensure `apps/web/src/lib/types/agent-chat-enhancement.ts` (the `AgentSSEEvent` definition) and any shared proto definitions accept the new value without referencing the old label.

### 2. Backend Streaming API & Orchestrator Touchpoints

- **Tool executor context shift**
    - In `apps/web/src/lib/chat/tool-executor.ts`, update the `context_shift` payload returned by `createOntoProject` so `new_context: 'project'`.
- **SSE endpoint updates**
    - `apps/web/src/routes/api/agent/stream/+server.ts` should treat `'project'` as the post-instantiation context:
        - `loadOntologyContext` guard currently checks both `'project'` and `'project_update'`; remove the extra branch once migration lands.
        - When relaying tool results with `context_shift`, forward the `'project'` value and tweak the user-facing message copy (e.g., “Switching into your project workspace…” instead of “update mode”).
        - Persist the new context to `chat_sessions` and append the correct system message (`context_type: 'project'`).
- **Orchestrator context object**
    - Confirm `createAgentChatOrchestrator` requests pass through `contextType: 'project'` when a project is selected. The `ServiceContext` helper already fills `project_id` arguments when `context.contextType === 'project'`; no code change should be necessary beyond ensuring the caller sends the renamed value.

### 3. AgentContextService Prompt & Context Builders

- **Display/fallbacks**
    - Update `getContextDisplayName`, `getFallbackContext`, and `resolveDataContextType` inside `apps/web/src/lib/services/agent-context-service.ts` to drop any wording that says “Project Update Mode”. Copy should reference “Project Context”.
- **New prompt block**
    - After the generic planner instructions (and alongside the existing project ontology snippet), inject a dedicated section when `contextType === 'project'` or when ontology context type is `project`. This block needs to cover:
        - The user may ask _any_ question about the project (status, risks, summaries, dependencies).
        - The assistant can read, summarize, or update the project or related entities (tasks, goals, outputs) as needed—emphasize using search/list tools before detail/update tools.
        - Encourage proactive suggestions when gaps or inconsistencies are visible.
        - Remind the agent to call update tools only when the user explicitly asks for a change or when a fix is clearly implied.
    - Example copy to embed (trim/format as-needed):

        ```text
        ## Project Context Operating Guide
        - You are fully scoped to Project **${ontologyContext?.data.name || locationMetadata?.projectName || 'current'}** (ID: ${entityId ?? 'n/a'}).
        - Treat this as the user’s project workspace: they might ask for summaries, health checks, clarifications, or direct updates.
        - Default workflow:
          1. Parse the request and decide if it is informational (answer from context + detail tools) or operational (requires write tools).
          2. Start with list/search/detail tools (`list_project_elements`, `get_project_details`, `get_task_details`, etc.) to ground your answer.
          3. If the user asks to change data (rename project, add tasks, adjust dates), call the relevant update/create tool and describe what changed.
          4. Surface related insights (risks, blockers, next steps) when helpful, even if the user only asked a question.
        - Never assume all data is loaded—announce when more detail is available via tools.
        ```

- **Metadata hints**
    - Ensure `buildSystemPromptMetadata` includes project name/id when context_type is `project`.
    - Keep `getContextTools` behavior the same; the rename should not reduce the available tool set.

### 4. Frontend Context Selection & UX

- **Context pickers**
    - `ContextSelectionScreen.svelte` and `ProjectModeSelectionView.svelte` should offer a “Project workspace” option that emits `contextType: 'project'`. Keep audit/forecast modes separate.
    - Update `projectModeLabels`, `selectMode` typing, button copy, and subtitles.
- **Agent modal state**
    - `AgentChatModal.svelte`: refresh `CONTEXT_DESCRIPTORS`, badge map, and any computed labels to reflect the new wording (e.g., “Project workspace • {{projectName}}”).
    - Update SSE handler to expect `new_context === 'project'` (already works, but remove conditional copy referring to “update”).
- **Chat interface**
    - `ChatInterface.svelte`: adjust the welcome prompt (`getWelcomeMessage`) and the context indicator banner (lines ~60 & ~435) so it describes a general project workspace instead of “update mode.”
    - `AgentModal.svelte`: headers, left-panel helper text, and conditional rendering that currently says “Update Project”.
- **Entry points**
    - `apps/web/src/lib/components/layout/Navigation.svelte`: when auto-launching the agent from a `/projects/[id]` page, set `chatContextType` to `'project'`.
    - `BrainDumpModal.svelte`: when handing control to the agent, call `onOpenAgent?.({ projectId, chatType: 'project' })`.
    - `ChatModal.svelte`: update `CONTEXT_META` badges/descriptions.

### 5. Documentation & Prompts

- Update the specs in `docs/technical/implementation/PROJECT_CONTEXT_SHIFT_SPEC.md` and `PROJECT_CONTEXT_SHIFT_IMPLEMENTATION.md` to describe the new `project` context label and screenshots/snippets if needed.
- Add a short note to `apps/web/docs/features/agentic-chat/BACKEND_ARCHITECTURE_OVERVIEW.md` highlighting that project-focused work now routes through the general `project` context and inherits the enhanced prompt block.

### 6. Testing & Rollout

- **Manual verification**
    1. Start a `project_create` chat, ensure the automatic context shift SSE switches the modal into `project` (badge + descriptor update) and that subsequent planner runs show the new prompt instructions in logs.
    2. Launch the agent from an existing project page via the nav shortcut: check the new welcome message, confirm tool calls automatically receive `project_id`, and ensure general questions (e.g., “How many active tasks?”) work without forcing an update.
    3. Ask the assistant to rename something or add a task while in project context; verify it uses the correct update tools and the summary reflects the broader prompt.
- **Data migration validation**
    - After running the migration, query `chat_sessions` / `chat_messages` to confirm no `project_update` values remain.
    - Re-run any analytics dashboards or jobs that filter by context to ensure they still pick up the renamed value.
- **Regression checks**
    - Confirm other specialized contexts (audit/forecast/task update) still behave correctly and that no UI references throw because of the tighter union.

## Follow-up Decisions

1. **No aliasing.** We will not keep `project_update` as an internal alias—the system should only emit/accept `project`.
2. **Single mode.** All selected-project interactions consolidate under one “Project workspace” mode (no separate update naming in the UI).
3. **Continuity cues.** The planner prompt must surface last-turn context entities prominently (e.g., highlight the last touched task) to reinforce continuity.
