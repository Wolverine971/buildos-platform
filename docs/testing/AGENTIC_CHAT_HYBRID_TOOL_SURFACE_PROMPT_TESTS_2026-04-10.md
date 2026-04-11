<!-- docs/testing/AGENTIC_CHAT_HYBRID_TOOL_SURFACE_PROMPT_TESTS_2026-04-10.md -->

# Agentic Chat Hybrid Tool Surface Prompt Tests

Date: 2026-04-10  
Scope: Manual prompt acceptance tests for the BuildOS agentic chat hybrid tool surface.

## Purpose

Use this document to verify that the OpenClaw-style hybrid surface is working end to end:

- Context-specific direct tools are preloaded.
- `skill_load`, `tool_search`, and `tool_schema` remain available for progressive disclosure.
- Normal work executes through direct tools such as `create_onto_task`, not through a generic `execute_op`.
- The UI, admin timeline, audit export, and prompt dumps clearly show which tool and canonical operation were used.

## Current Dump Check

Recent local prompt dumps under `apps/web/.prompt-dumps/` show the expected tool surface.

| Dump                                    | Context          | Preloaded tools                                                                                                                                       | Actual execution                                                                  |
| --------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `fastchat-2026-04-10T20-06-01-530Z.txt` | `project_create` | `skill_load`, `tool_search`, `tool_schema`, `create_onto_project`, `create_onto_goal`, `create_onto_plan`, `create_onto_task`, `create_onto_document` | `create_onto_project => ok`                                                       |
| `fastchat-2026-04-10T20-07-13-267Z.txt` | `project`        | Discovery tools plus 16 direct project tools                                                                                                          | `update_onto_task`, four `create_onto_task`, two `create_onto_document`, all `ok` |
| `fastchat-2026-04-10T20-11-05-300Z.txt` | `project`        | Discovery tools plus direct project tools                                                                                                             | `create_onto_document`, `update_onto_task`, both `ok`                             |
| `fastchat-2026-04-10T20-16-14-709Z.txt` | `project`        | Discovery tools plus direct project tools                                                                                                             | `create_onto_document`, `update_onto_task`, both `ok`                             |
| `fastchat-2026-04-10T20-16-58-221Z.txt` | `project`        | Discovery tools plus direct project tools                                                                                                             | No tool calls; chat-only follow-up                                                |

Observed status:

- Direct tools are being admitted into the model-facing tool list.
- The agent is using direct tools for project creation, task updates, task creation, and document creation.
- The prompt says to call direct tools after `tool_schema` and not route normal work through a generic executor.
- Older dumps only showed direct tool names in the runtime execution footer. New dumps should include canonical operation labels where the tool registry can resolve them, for example `create_onto_document (onto.document.create) => ok`.

## Observability Regression Checks

Run these checks on every manual prompt scenario.

| Surface                    | Expected evidence                                                                                     | Failure signal                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Prompt dump header         | `Tools (...)` includes `skill_load`, `tool_search`, `tool_schema`, plus context-specific direct tools | Only discovery tools are present, or normal context tools are missing                      |
| Prompt dump header         | No model-facing `execute_op` in the tool list                                                         | `execute_op` appears as a normal callable tool                                             |
| Prompt dump runtime footer | Actual executions list direct tool names and canonical ops when known                                 | Footer only shows vague gateway/meta execution                                             |
| Turn events                | `tool_name` is populated for direct tools                                                             | Direct tools disappear from turn event payloads                                            |
| Turn events                | `canonical_op` is populated for direct tools such as `onto.document.create`                           | `canonical_op` is null for direct-tool calls                                               |
| `chat_tool_executions`     | `tool_name` and `gateway_op` both identify the call                                                   | `gateway_op` is null for registry-backed direct tools                                      |
| Admin session timeline     | Title reads like `Tool Execution: create_onto_document (onto.document.create)`                        | Timeline only shows `Tool Execution: create_onto_document` or `Tool Execution: execute_op` |
| Chat UI                    | User sees clean tool activity, not raw JSON/function-call chatter                                     | Raw schema/protocol leaks into the visible answer                                          |

## Manual Test Setup

Use:

- `AGENTIC_CHAT_TOOL_GATEWAY=true`
- prompt dumps enabled
- a clean test project when testing writes
- admin chat session detail page open after each run

Record for every test:

- exact prompt
- context type
- visible UI tool trace
- latest prompt dump filename
- admin timeline tool execution title
- final answer quality
- created or updated entity IDs

## Pass Criteria

A prompt passes when:

- the correct context-specific direct tools are visible in the prompt dump,
- the agent calls the smallest sufficient direct tool set,
- mutations include concrete required arguments,
- ambiguous mutations ask one concise clarification instead of guessing,
- discovery tools are used only when the direct tool is missing or the schema is uncertain,
- `execute_op` is not exposed or used as the normal terminal action,
- UI and admin surfaces show both `tool_name` and canonical operation.

## Prompt Test Matrix

### P0. Tool Surface Smoke Tests

| ID   | Context          | Prompt                                                                                                                                                                                  | Expected tools available                           | Expected tool calls                                                                                           | UI/dump pass check                                                                         |
| ---- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| P0.1 | `project_create` | `Create a project called Podcast Launch. The goal is to publish the first 3 episodes by June 15. Add tasks to define the show format, book the first 3 guests, and record the trailer.` | Discovery tools plus project creation direct tools | `create_onto_project`; optional direct create tools only if the project tool does not create nested structure | Dump has `create_onto_project`; timeline shows `create_onto_project (onto.project.create)` |
| P0.2 | `project`        | `What tools can you use in this project?`                                                                                                                                               | Discovery tools plus project direct tools          | Ideally none, unless the app intentionally answers from tool metadata                                         | Answer should summarize available tool families without leaking raw schemas                |
| P0.3 | `project`        | `Find the right tool for moving a document in the tree, but do not move anything yet.`                                                                                                  | Discovery tools plus project direct tools          | `tool_search` or `tool_schema`; no write tool                                                                 | No `move_document_in_tree` execution; final answer names the direct tool                   |

### P1. Project Creation

| ID   | Context                        | Prompt                                                                                                                                                                                                        | Expected tool path                                                                                | Must not happen                                          |
| ---- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| P1.1 | `project_create`               | `Create a project called Customer Research Sprint. The outcome is 12 customer interviews by May 15. Add tasks for recruiting interviewees, drafting the script, scheduling calls, and synthesizing findings.` | Load `project_creation` skill if needed, then `create_onto_project` with concrete project payload | Creating a vague project without the requested structure |
| P1.2 | `project_create`               | `Help me start a new project.`                                                                                                                                                                                | No write yet; ask one concise clarification                                                       | Creating `Untitled Project` or making up goals           |
| P1.3 | `project_create`               | `Create a project to learn Spanish.`                                                                                                                                                                          | Minimal `create_onto_project`, likely project plus one goal                                       | Overbuilding plans, milestones, risks, and documents     |
| P1.4 | `project` follow-up after P1.1 | `Add a task to send the interview invite email.`                                                                                                                                                              | `create_onto_task` scoped to the newly created project                                            | Asking for the project ID again                          |

### P2. Project Overview And Scope

| ID   | Context   | Prompt                                                | Expected tool path                                         | Must not happen                                 |
| ---- | --------- | ----------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| P2.1 | `global`  | `What is happening across my projects?`               | `get_workspace_overview`                                   | Project-by-project list churn before overview   |
| P2.2 | `global`  | `What's going on with 9takes?`                        | Resolve project if needed, then `get_project_overview`     | Wrong project or public-only project leakage    |
| P2.3 | `project` | `What is blocked right now?`                          | `get_project_overview` or project-scoped list/search tools | Losing project scope and doing global discovery |
| P2.4 | `project` | `What changed since the last time we worked on this?` | Project overview first; optional task/doc reads if needed  | Generic answer with no BuildOS data             |

### P3. Document Creation And Brainstorming

| ID   | Context   | Prompt                                                                             | Expected tool path                                                         | Must not happen                                             |
| ---- | --------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| P3.1 | `project` | `Create a document called Launch Brief with a short outline for this project.`     | Optional `skill_load(document_workspace)`, then `create_onto_document`     | Missing `project_id`, title, or description                 |
| P3.2 | `project` | `Brainstorm a launch brief outline with me, but do not create the document yet.`   | No write; maybe no tool call if enough context is already loaded           | Creating a document despite the "do not create" instruction |
| P3.3 | `project` | `Create a research doc for the prophecy idea and mark the prophecy task complete.` | `create_onto_document` plus `update_onto_task` after exact task resolution | Updating a task without a task ID                           |
| P3.4 | `project` | `Move the Launch Brief under the Research folder.`                                 | `get_document_tree`, then `move_document_in_tree` with exact IDs           | Repeated invalid move attempts                              |

### P4. Task Creation And Updates

| ID   | Context   | Prompt                                                                           | Expected tool path                                       | Must not happen                        |
| ---- | --------- | -------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------- |
| P4.1 | `project` | `Create tasks for drafting the landing page, reviewing copy, and publishing it.` | `create_onto_task` once per concrete task                | Creating vague duplicate task spam     |
| P4.2 | `project` | `Mark the landing page draft task complete.`                                     | Search/list if ID is unknown, then `update_onto_task`    | Updating the wrong task silently       |
| P4.3 | `project` | `Change the due date for the review copy task to next Friday.`                   | Resolve task ID, then `update_onto_task`                 | Mutation without exact task ID         |
| P4.4 | `project` | `Turn this messy note into tasks: [paste a paragraph with 5 possible actions].`  | Load task skill if needed, create only well-formed tasks | One task per sentence without judgment |

### P5. Calendar Events

| ID   | Context   | Prompt                                                       | Expected tool path                                                             | Must not happen                                                     |
| ---- | --------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| P5.1 | `global`  | `What is on my calendar tomorrow?`                           | `list_calendar_events` with bounded time range                                 | Unbounded calendar listing                                          |
| P5.2 | `project` | `Create a project review next Friday at 2pm for 45 minutes.` | `create_calendar_event`; optionally `get_project_calendar` first               | Creating an event without project association when one is available |
| P5.3 | `project` | `Move the project review to Monday morning.`                 | List/search candidate events, then `update_calendar_event` with exact event ID | Updating an ambiguous event without confirmation                    |
| P5.4 | `project` | `Connect this project to the right calendar.`                | `get_project_calendar`, then `set_project_calendar` only after clear choice    | Guessing the calendar                                               |

### P6. Plans, Goals, And Structure

| ID   | Context   | Prompt                                                                                                      | Expected tool path                                                      | Must not happen                                             |
| ---- | --------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| P6.1 | `project` | `Create a plan called Launch Week with tasks for final QA, announcement email, and post-launch monitoring.` | `create_onto_plan`, then `create_onto_task` with `plan_id` if available | Tasks created unattached when plan relation is clear        |
| P6.2 | `project` | `Add a goal to get 100 beta signups by May 30.`                                                             | `create_onto_goal`                                                      | Treating the goal as a task                                 |
| P6.3 | `project` | `Update the Launch Week plan to focus on retention instead of acquisition.`                                 | Resolve plan if needed, then `update_onto_plan`                         | Creating a duplicate plan instead of updating               |
| P6.4 | `project` | `Reorganize this project so the tasks are grouped under the right plans.`                                   | Skill first, inspect graph/tree/list data, then limited direct updates  | Large graph rewrite without explaining the intended changes |

### P7. Progressive Disclosure And Long-Tail Tools

| ID   | Context   | Prompt                                                    | Expected tool path                                                                 | Must not happen                                       |
| ---- | --------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------- |
| P7.1 | `project` | `I need to audit this project's health.`                  | `skill_load(workflow.audit)` and overview/read tools before final answer           | Only generic overview when deeper audit was requested |
| P7.2 | `project` | `Forecast what is likely to slip.`                        | `skill_load(workflow.forecast)` plus project overview and task/plan signals        | Unsupported speculation without data                  |
| P7.3 | `global`  | `Find contacts related to Acme and summarize who I know.` | `skill_load` or `tool_search` for people/contact tools, then direct contact search | Exposing sensitive contact data unnecessarily         |
| P7.4 | `project` | `What tool should I use to link two ontology entities?`   | `tool_search` or `tool_schema` for `onto.edge.link`                                | Calling the link tool before the user asks to link    |

### P8. Repair And Safety Loops

| ID   | Context   | Prompt                               | Expected behavior                                                         | Failure signal                          |
| ---- | --------- | ------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------- |
| P8.1 | `project` | `Mark that thing done.`              | Ask a concise clarification or use immediate prior context if unambiguous | Random task update                      |
| P8.2 | `project` | `Create a task.`                     | Ask for task title or infer only if prior text clearly supplies it        | `create_onto_task` with no title        |
| P8.3 | `project` | `Create a document, title it later.` | Ask for title or explain the minimum fields needed                        | `create_onto_document` with empty title |
| P8.4 | `project` | `Move the doc into the folder.`      | Ask which doc/folder unless recent context identifies both                | Repeated missing-ID repair loops        |

## Suggested Manual Run Order

1. Run P1.1 to create a fresh project.
2. Run P1.4 in the new project context to confirm context shift.
3. Run P4.1 and P4.2 to confirm task create/update.
4. Run P3.1, P3.2, and P3.4 to confirm document write, no-write brainstorm, and tree movement.
5. Run P5.2 and P5.3 if calendar integration is connected.
6. Run P6.1 and P6.3 to confirm plan create/update.
7. Run P7.1 or P7.2 to confirm skill-first progressive disclosure.
8. Run P8.1 through P8.4 to stress repair behavior.

## Expected Admin Timeline Examples

Direct tool rows should look like:

```text
Tool Execution: create_onto_project (onto.project.create)
Tool Execution: create_onto_task (onto.task.create)
Tool Execution: update_onto_task (onto.task.update)
Tool Execution: create_onto_document (onto.document.create)
Tool Execution: create_calendar_event (cal.event.create)
Tool Execution: create_onto_plan (onto.plan.create)
```

Legacy compatibility rows may still appear for old persisted sessions or non-gateway paths, but new normal gateway-mode executions should prefer direct tool names.

## Known Follow-Up Work

- Add an automated replay harness that sends this matrix through the local chat runtime and asserts tool traces.
- Promote prompt dump assertions into golden tests for representative context types.
- Add a UI-level test for tool trace rendering after the admin session page is stable enough for component/e2e coverage.
- Remove remaining legacy `tool_exec`/`execute_op` compatibility tests once old traces and fallback paths are retired.
