<!-- apps/web/docs/features/agentic-chat/PROJECT_CREATE_EXECUTION_PLAN.md -->

# Project Creation Flow – Execution Plan

**Status:** Draft (Implementation in progress)  
**Owners:** Agentic Chat + Ontology Platform  
**Last Updated:** November 8, 2025

---

## 1. Goal

Ensure the `project_create` chat context always results in:

1. Selection (or creation) of a suitable ontology template.
2. Creation of a fully populated `onto_projects` record, including starter goals/plans/tasks/requirements.
3. Creation of the canonical context document (`document.project.context`) and linkage via `onto_projects.context_document_id`.
4. Streaming a `context_shift` SSE event so the chat session transitions into the newly created project workspace.

Today, successful plans often stop after synthesizing content without actually instantiating the project, and when projects are created we skip nested entities + context docs. This doc describes the required flow, with references to existing specs.

---

## 2. References

- **Context documents**: `apps/web/docs/features/ontology/README.md:68` explains why every project must have a `document.project.context` row linked through `context_document_id`. Additional taxonomy notes live in `apps/web/docs/features/ontology/TYPE_KEY_TAXONOMY.md:95`.
- **Instantiation scaffolding**: `apps/web/src/lib/services/ontology/instantiation.service.ts` already supports nested creation for goals / plans / tasks / requirements (`createProjectWithEntities`, see lines around 250–330). It also updates `context_document_id` when provided (`instantiation.service.ts:281`).
- **Migration precedent**: `apps/web/src/lib/services/ontology/project-migration.service.ts:278` shows how migrations create the context document first and then update the project’s FK.
- **Agent SSE contract**: `apps/web/src/routes/api/agent/stream/+server.ts` supports sending `context_shift` events that update the chat session after a tool returns context metadata.

---

## 3. Desired Flow (Happy Path)

1. **Strategy selection**
    - `StrategyAnalyzer` forces `project_creation` when `context_type === 'project_create'` and no entity is attached.
    - `PlanOrchestrator` receives strategy + guidance that the first steps _must_ cover template selection (or template creation) followed by `create_onto_project`.

2. **Plan composition**
    - Step 1: `list_onto_templates` (or confirm an existing template from location context).
    - Step 2 (conditional): `request_template_creation` if no suitable template was found.
    - Step 3: `create_onto_project` with full payload:
        ```json
        {
          "project": {
            "name": "...",
            "description": "...",
            "type_key": "project.writer.book",
            "props": {
              "facets": { "context": "...", "scale": "...", "stage": "..." }
            },
            "start_at": "...",
            "end_at": "...",
            "context_document": {
              "type_key": "document.project.context",
              "title": "...",
              "body_markdown": "### Project Narrative ...",
              "props": { "source": "agent_project_creation", "spark_notes": [...] }
            }
          },
          "goals": [...],
          "plans": [...],
          "tasks": [...],
          "requirements": [...]
        }
        ```
        > Context doc schema mirrors what migrations emit today. The Markdown should capture the braindump, key dimensions, and any structured notes.
    - Subsequent steps (optional) may enrich artifacts _only after_ the project exists.

3. **Executor configuration**
    - `ExecutorCoordinator.spawnExecutor` must hand the executor `read_write` tools (already fixed) and include the template inference data inside `context.task` so the executor can call `create_onto_project` deterministically.
    - If a plan step involves nested entity creation after the project exists, ensure `project_id` is injected into tool args before execution (handled in `PlanOrchestrator.buildToolArgs`).

4. **Tool execution + context shift**
    - When `create_onto_project` returns, the tool result must include:
        ```json
        {
          "project_id": "...",
          "counts": { "tasks": 3, "goals": 2, ... },
          "context_shift": {
            "new_context": "project",
            "entity_id": "...",
            "entity_name": "...",
            "entity_type": "project"
          }
        }
        ```
    - The SSE route already propagates `context_shift` events to the client (`apps/web/src/lib/components/agent/AgentChatModal.svelte:548`). We just need to guarantee the tool returns that payload when the project is created.

---

## 4. Implementation Tasks

| Area                        | Tasks                                                                                                                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Planner Strategy**        | Ensure `project_creation` overrides propagate into `PlanOrchestrator` (already partially done).                                                                                                                                               |
| **Plan Generation Prompts** | `PlanOrchestrator.buildPlanSystemPrompt` now includes a “PROJECT CREATION REQUIREMENTS” block—verify it enforces step ordering.                                                                                                               |
| **Executor Tooling**        | Executors must receive `read_write` tools (`executor-coordinator.ts`, `agent-executor-service.ts`) so `create_onto_project` succeeds.                                                                                                         |
| **Instantiation Service**   | Extend `createProjectWithEntities` to accept a `context_document` payload and to return the document ID when present. Make sure nested arrays (`goals`, `plans`, `tasks`, `requirements`) are persisted atomically.                           |
| **Tool Executor**           | `ChatToolExecutor.createOntoProject` should pass through the nested entities and `context_document` field to `/api/onto/projects/instantiate`. After success, attach the `context_shift` block + a human-readable summary to the tool result. |
| **Context Shift Handling**  | `AgentChatModal` already updates UI on `context_shift`; verify we also clear the `project_create` label once the project context arrives.                                                                                                     |
| **Timeout Handling**        | Project creation may take longer due to nested writes. Consider giving executor steps a larger timeout (e.g., 180s) or streaming progress events so the UI doesn’t hit the 120s SSE timeout.                                                  |

---

## 5. Context Document Template

Minimum Markdown structure (adaptable per project type):

```markdown
# ${projectName} Context Document

## Spark / Braindump

${originalBraindump}

## Vision & Success

- Primary goal: ...
- Success looks like: ...

## Key Components

- Characters / Stakeholders: ...
- Magic System / Architecture: ...
- Risks / Constraints: ...

## Initial Plan

- Chapter 1: ...
- Chapter 2: ...
- Chapter 3: ...
```

Store additional structured data inside `props.spark_notes` so downstream surfaces can show TL;DR bullets. If the planner/executor omits a custom context doc, the tool layer now auto-generates one (using the braindump, inferred summary, and starter actions) to ensure every project gets a linked Markdown narrative and `context_document_id`.

---

## 6. Testing Checklist

1. **Unit / Integration**
    - Test `create_onto_project` tool result includes `context_shift` metadata.
    - Verify instantiation service writes nested entities + context doc in one transaction.
    - Ensure executor tool list always contains `create_onto_project`.
2. **End-to-End**
    - Run a `project_create` session with a simple prompt, confirm `context_shift` fires and the chat badge switches to the new project.
    - Inspect Supabase tables: `onto_projects`, `onto_tasks`, `onto_plans`, `onto_goals`, `onto_requirements`, `onto_documents`.
    - Load the new project page (`/projects/[id]`) to ensure context doc surfaces in the UI.
3. **Regression**
    - Existing non-project flows (global/project/task contexts) should remain unaffected. Executors spawned for other plan types must still honour read-only restrictions if configured.

---

## 7. Next Steps

1. Update `ChatToolExecutor.createOntoProject` + `/api/onto/projects/instantiate` to accept the new payload shape (context document + nested entities).
2. Ensure the executor’s final step triggers a `context_shift` SSE event even if the plan had additional narrative steps queued.
3. Increase SSE timeout or stream intermediate “project creation in progress” messages to avoid UI errors for longer creations.
