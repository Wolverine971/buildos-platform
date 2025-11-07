# Agent Tool System Spec

Last updated: 2025-05-29  
Owner: Agentic chat tooling

## Objectives

- Give the LLM a richer, organized catalog of tools so it can choose the right calls during strategy analysis.
- Separate raw tool definitions from context-aware configuration to simplify future expansion.
- Provide scoped tool sets per `context_type` (global, project_create, project, project_audit, project_forecast) with a shared base tool layer.
- Retire the `general` context in favor of the clarified `global` context within the agentic chat flow.
- Track completion status for each implementation step directly in this doc.

## Requirements Recap

1. **LLM-aware tool planning** – When selecting a strategy, the LLM must see tool summaries (capabilities + scope) and output the specific tools it wants to invoke next.
2. **Tool taxonomy** – Build base/common tools plus context-specific collections:
    - _Global_: discovery/search across the workspace.
    - _Project create_: grounding in ontology templates and clarifying questions.
    - _Project_: read/write operations on a specific project (tasks, plans, goals, updates).
    - _Project audit / forecast_: reuse the project tool set for now and mark TODOs for deeper coverage.
3. **Separation of concerns** – Keep tool definitions (name/description/schema) in a dedicated module; leave context orchestration and analytics in `tools.config`.
4. **Spec hygiene** – Update this document as milestones finish so teammates can see progress at a glance.

## Planned Tool Taxonomy

| Layer / Context      | Purpose                                                                      | Initial Tool Coverage                                                                |
| -------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Base (shared)**    | Utilities every context needs (schema lookup, relationships, guardrails).    | `get_field_info`, `get_entity_relationships`, lightweight diagnostics (to define).   |
| **Global**           | Workspace-wide discovery, recent project summaries, cross-project search.    | Project/goal/task listing tools, template search, future: semantic search utilities. |
| **Project Create**   | Template discovery + assisting clarifying Q&A for onboarding new projects.   | Template list/detail, project generation helper, ontology schema references.         |
| **Project**          | Focused project operations: fetch/update tasks, plans, goals, project state. | Read/write ontology tools (list/get/create/update/delete) filtered to project scope. |
| **Project Audit**    | Deep-dive review of a project (placeholder = project tool set).              | Same as project (TODO: add audit analytics).                                         |
| **Project Forecast** | Scenario planning (placeholder = project tool set).                          | Same as project (TODO: dedicated forecasting utilities).                             |

## Work Plan & Status

- [x] Split tool definitions into a dedicated module and re-export them for existing consumers.
- [x] Expand the tool catalog (add search utilities if needed) and define context-based groupings with a base layer.
- [x] Update context selection + strategy analysis to use the new taxonomy, including tool summaries for the LLM.
- [x] Remove `general` context handling from the agentic chat flow (treat `global` as the entry point).
- [x] Add TODO coverage for richer project_audit/project_forecast tooling.
- [ ] Document verification results (lint/tests) once the refactor completes.

## Future Enhancements / TODO

- [ ] Introduce dedicated audit/forecast analyzers (e.g., risk scoring, timeline simulations).
- [ ] Add semantic search endpoints for workspace knowledge (notes, briefs, etc.).
- [ ] Expose ontology diff/health diagnostics as standalone tools.
