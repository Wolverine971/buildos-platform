<!-- docs/reports/agentic-chat-fastchat-vs-lite-fantasy-novel-flow-audit-2026-04-15.md -->

# Agentic Chat Fastchat vs Lite Flow Audit

Date: 2026-04-15

Scope: audit of two agentic chat sessions for the same fantasy-novel project creation and follow-up workflow. One run used the standard fastchat prompt path, and the other used the lite prompt path.

## Primary Sources

- Fastchat session audit: [chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-09e3ca0b-8163-47-2026-04-15.md](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-09e3ca0b-8163-47-2026-04-15.md)
- Lite session audit: [chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-5e74e634-0992-49-2026-04-15.md](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-5e74e634-0992-49-2026-04-15.md)
- Current agentic chat feature map: [apps/web/docs/features/agentic-chat/README.md](../../apps/web/docs/features/agentic-chat/README.md)
- Agentic chat operating model: [docs/specs/agentic-chat-operating-model.md](../specs/agentic-chat-operating-model.md)
- Initial seed context gap analysis: [docs/reports/agentic-chat-initial-seed-context-gap-analysis-2026-04-14.md](./agentic-chat-initial-seed-context-gap-analysis-2026-04-14.md)
- Lite harness plan: [docs/plans/AGENTIC_CHAT_LIGHTWEIGHT_HARNESS_PLAN.md](../plans/AGENTIC_CHAT_LIGHTWEIGHT_HARNESS_PLAN.md)
- Lite prompt builder: [apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts](../../apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts)
- Fastchat master prompt builder: [apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts](../../apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts)
- Prompt variant routing: [apps/web/src/lib/services/agentic-chat-v2/prompt-variant.ts](../../apps/web/src/lib/services/agentic-chat-v2/prompt-variant.ts)
- Stream endpoint wiring: [apps/web/src/routes/api/agent/v2/stream/+server.ts](../../apps/web/src/routes/api/agent/v2/stream/+server.ts)
- Gateway tool surface profiles: [apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts](../../apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts)
- Ontology write tool definitions: [apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts](../../apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts)
- Ontology write executor: [apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts](../../apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts)
- Tool execution service: [apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts](../../apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts)
- Stream orchestrator docs: [apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/README.md](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/README.md)

## Executive Summary

The lite flow is the better direction for the product, but it is not ready to graduate broadly without a few reliability fixes.

The lite run produced a better initial project model: it created a primary goal, linked the initial tasks under that goal, added useful descriptions, and did so with materially lower token and cost usage. It also updated the existing "Outline first three chapters" task during the Chapter 2 progress turn, which the fastchat run did not do.

The major lite failure was a bad document update call. It attempted to append progress notes to the project context document with `update_strategy: "append"` and `merge_instructions`, but without any `content`. It also sent `props: {}`, which let validation treat the call as having an update field even though it was semantically empty. The API rejected the call, and the assistant did not tell the user that the document update failed. That is the highest-risk issue because it creates a false sense that project memory was persisted.

Fastchat was more expensive and less consistent, but it handled the final research-notes turn better as a document workflow. It created a dedicated "Magic System Research Notes" document and nested it under the project context document. That is the stronger behavior for substantial named research notes.

## Which File Was Which

| File                                                                                                                       |       Prompt variant | Outcome                                                         |  Tokens |          Cost |          Errors |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------: | --------------------------------------------------------------- | ------: | ------------: | --------------: |
| [09e3ca0b audit](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-09e3ca0b-8163-47-2026-04-15.md) | `fastchat_prompt_v1` | No tool failures, but missed the primary project goal           | 143,388 |  `$0.0522584` | 0 tool failures |
| [5e74e634 audit](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-5e74e634-0992-49-2026-04-15.md) |       `lite_seed_v1` | Better project structure, but one hidden failed document update | 118,687 | `$0.03410443` |  1 tool failure |

Lite reduced tokens by about 17.2% and cost by about 34.8% versus fastchat in this scenario, despite the lite flow taking a failed-tool path and making more tool calls.

## Runtime Context

The current agentic chat path is still the V2 stream endpoint. The modal posts to `/api/agent/v2/stream`; the endpoint handles auth, session lifecycle, context loading, SSE streaming, persistence, and timing metrics. Lite is not a separate runtime. The stream endpoint routes based on `prompt_variant`, and `lite_seed_v1` is gated to dev/admin paths.

That architecture matters for this audit:

- Both flows share the same execution runtime, tool executor, persistence path, and stream loop.
- The main variable is prompt construction plus the selected initial tool surface.
- Therefore the observed differences are primarily prompt/context/tool-surface behavior, not separate product code paths.

Relevant docs:

- [agentic-chat README](../../apps/web/docs/features/agentic-chat/README.md)
- [lite harness plan](../plans/AGENTIC_CHAT_LIGHTWEIGHT_HARNESS_PLAN.md)
- [stream endpoint](../../apps/web/src/routes/api/agent/v2/stream/+server.ts)
- [prompt variant routing](../../apps/web/src/lib/services/agentic-chat-v2/prompt-variant.ts)

## High-Level Comparison

| Dimension                   | Fastchat                                                | Lite                                                                  | Assessment                                              |
| --------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------- |
| Initial project shape       | Created project, 7 tasks, 1 document, 0 goals           | Created project, 1 goal, 7 tasks, 1 document, goal-task relationships | Lite was better                                         |
| Goal extraction             | Missed obvious outcome goal                             | Created "Write and complete the fantasy novel 'The Last Ember'"       | Lite was better                                         |
| Task descriptions           | Mostly task titles only on project create               | Better descriptions on initial tasks                                  | Lite was better                                         |
| Chapter 2 progress handling | Created two tasks, did not update existing outline task | Updated outline task and created two linked tasks                     | Lite was better                                         |
| Document progress logging   | Did not attempt a progress document update              | Attempted append but failed                                           | Fastchat avoided failure; lite intended more but failed |
| Magic system notes          | Created separate research document and nested it        | Appended to context document                                          | Fastchat behavior was better for substantial notes      |
| Tool-call success           | No tool failures                                        | One failed document update                                            | Fastchat was more reliable                              |
| Error disclosure            | No errors to disclose                                   | Failed document write was hidden                                      | Lite failed trust requirement                           |
| Token efficiency            | 143,388 tokens                                          | 118,687 tokens                                                        | Lite was cheaper                                        |
| Tool discovery overhead     | Heavy skill/schema/tool-search use                      | Still significant discovery use                                       | Both need tool-surface tuning                           |

## What Happened By Turn

### Turn 1: Project Creation

User asked to create a first fantasy novel project for "The Last Ember" with a plot summary and seven concrete work items.

Fastchat:

- Called `create_onto_project`.
- Created project `9614d616-285e-4c14-b75f-31b4e6cca862`.
- Created 7 tasks and 1 context document.
- Created 0 goals.
- Sent `relationships: []`.
- Result counts: 7 tasks, 1 document, 8 edges, 0 goals.

Lite:

- Called `create_onto_project`.
- Created project `56bcc3cf-67ae-491f-ace9-6d1c7d4e9bfc`.
- Created 1 primary goal, 7 tasks, 1 context document.
- Added containment relationships from the primary goal to each task.
- Result counts: 1 goal, 7 tasks, 1 document, 9 edges.
- Included `meta.model = "lite_seed_v1"` and `confidence = 0.95`.

Verdict: both used the correct tool, but fastchat used an incomplete payload. Lite used the correct tool and a better payload.

The fastchat miss is notable because [master-prompt-builder.ts](../../apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts) explicitly says that if the user stated an outcome, the project create flow should add one goal. The fastchat model did not follow that instruction.

### Turn 2: Chapter 2 Progress Update

User said Chapter 2 was finished at 4,500 words, named a successful dragon forge scene, listed revision issues, gave Chapter 3 plans, and mentioned an age-continuity fix.

Fastchat:

- Loaded `task_management`.
- Listed tasks.
- Searched project.
- Listed documents.
- Fetched task create/update schemas.
- Created "Revise Chapter 2..." task.
- Created "Draft Chapter 3..." task.
- Did not update "Outline first three chapters" to reflect Chapter 2 progress.
- Did not create or append a progress log.

Lite:

- Loaded `task_management` with examples.
- Listed tasks and documents.
- Searched for task/document write operations.
- Updated "Outline first three chapters" to `in_progress`.
- Created "Revise Chapter 2" linked to the main goal.
- Created "Draft Chapter 3" linked to the main goal.
- Attempted to append to the context document.
- The document append failed because the call had no content.
- The assistant did not mention the failure.

Verdict: lite used better task tools and targets. Fastchat missed an obvious update to the existing outline task. Lite's document update was improper because the tool arguments were invalid and the failure was hidden.

### Turn 3: Magic System Research Notes

User supplied research notes about Japanese sword-making traditions, emotional forging properties, Damascus steel, Celtic smith mythology, medieval weapons, Forge Temples, Smith's Guild hierarchy, the Quenching Ritual, and regional forging techniques across Aethermoor.

Fastchat:

- Loaded `document_workspace` and `task_management`.
- Searched for document create/move/update operations.
- Listed project documents.
- Loaded the document tree.
- Created a dedicated "Magic System Research Notes" document.
- Nested it under "The Last Ember Context Document" with `move_document_in_tree`.
- Updated three relevant tasks to `in_progress`: magic system, medieval blacksmithing, and map Aethermoor.

Lite:

- Listed tasks and documents.
- Searched project for "magic system".
- Searched for document create/update operations.
- Loaded the document tree.
- Loaded full document details for the context document.
- Updated three relevant tasks to `in_progress`.
- Appended the magic-system and worldbuilding notes to the existing context document.

Verdict: both used mostly correct tools. Fastchat made the better document-placement decision for substantial named research notes. Lite made a valid append call this time because it included actual `content`, but the product should decide whether substantial research notes belong in a separate doc by default.

## Tool Call Evaluation

### Scoring Key

- Proper: correct tool, correct target, valid arguments, useful result, and user-facing response matched the result.
- Mostly proper: correct broad action but inefficient, over-discovered, or missing a related update.
- Improper: wrong target, invalid args, failed write, bad persistence, or misleading final answer.
- Missing: a tool should have been used but was not.

### Fastchat Tool Call Evaluation

| Turn | Tool/action                                   | Verdict                   | Notes                                                                                                                                                                              |
| ---: | --------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | `create_onto_project`                         | Mostly proper             | Correct tool. Payload missed the primary goal and goal-task relationships despite prompt guidance.                                                                                 |
|    1 | No `skill_load(project_creation)`             | Acceptable                | Prompt suggested loading the skill, but the direct tool was preloaded and the task was straightforward. The real issue was payload quality, not missing skill load.                |
|    2 | `skill_load(task_management)`                 | Mostly proper             | The workflow involved task creation/update, so skill load was defensible. Full load cost was high.                                                                                 |
|    2 | `list_onto_tasks`                             | Proper                    | Needed to identify existing tasks such as "Outline first three chapters".                                                                                                          |
|    2 | `search_project`                              | Mostly proper             | Useful but somewhat redundant after listing project tasks.                                                                                                                         |
|    2 | `list_onto_documents`                         | Mostly proper             | Reasonable if considering a progress log, but it did not follow through with document work.                                                                                        |
|    2 | `tool_schema(onto.task.create)`               | Proper                    | First task write in this project context; schema lookup was reasonable.                                                                                                            |
|    2 | `tool_schema(onto.task.update)`               | Mostly proper             | It fetched the schema but did not actually call `update_onto_task`; the trace summary makes this look more productive than it was.                                                 |
|    2 | `create_onto_task` for Chapter 2 revision     | Proper                    | Correct persistent follow-up. Title was too long and included the erroneous age in the title, but description clarified the intended fix.                                          |
|    2 | `create_onto_task` for Chapter 3 draft        | Proper                    | Correct persistent follow-up for future drafting work.                                                                                                                             |
|    2 | `update_onto_task` for outline progress       | Missing                   | The existing outline task should have been updated to `in_progress`, as lite did.                                                                                                  |
|    3 | `skill_load(document_workspace)`              | Proper                    | Creating and nesting a document is a document-workspace workflow.                                                                                                                  |
|    3 | `skill_load(task_management)`                 | Mostly proper             | Updating several tasks makes this defensible, but full skill load contributed to heavy token use.                                                                                  |
|    3 | `tool_search` for document create/move/update | Proper in current surface | Needed because project context did not preload document write tools. This should be optimized by the tool surface.                                                                 |
|    3 | `list_onto_documents`                         | Proper                    | Needed to find the context document.                                                                                                                                               |
|    3 | `get_document_tree`                           | Proper                    | Needed before nesting the new research document.                                                                                                                                   |
|    3 | `create_onto_document`                        | Proper                    | Best call for substantial named research notes.                                                                                                                                    |
|    3 | `move_document_in_tree`                       | Proper                    | Correct tool for document hierarchy.                                                                                                                                               |
|    3 | `update_onto_task` x3                         | Mostly proper             | Correct targets, but one task update polluted the description with raw parameter markup: `<parameter name="update_strategy">replace`.                                              |
|    3 | Semantic linking from tasks to document       | Missing/unclear           | The final response used "cross-linked", but the trace shows description references, not a graph edge/link call. If "cross-linked" means semantic edge, this was not actually done. |

### Lite Tool Call Evaluation

| Turn | Tool/action                                                  | Verdict          | Notes                                                                                                                                                  |
| ---: | ------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
|    1 | `create_onto_project`                                        | Proper           | Correct tool and good payload. Created goal, tasks, descriptions, and containment relationships.                                                       |
|    1 | No `skill_load(project_creation)`                            | Acceptable       | The direct tool was preloaded and the payload was strong.                                                                                              |
|    2 | `skill_load(task_management, include_examples: true)`        | Mostly proper    | Defensible, but full examples were expensive.                                                                                                          |
|    2 | `list_onto_tasks`                                            | Proper           | Correctly identified existing tasks and exact IDs.                                                                                                     |
|    2 | `list_onto_documents`                                        | Proper           | Needed to find the context document before document update.                                                                                            |
|    2 | Multiple `tool_search` calls for create/update task/document | Mostly proper    | Correct in current gateway surface, but too many searches for a common project update flow.                                                            |
|    2 | `tool_schema(onto.task.create)`                              | Proper           | Useful before task writes.                                                                                                                             |
|    2 | No `tool_schema(onto.document.update)`                       | Missing          | The model attempted a document update with uncertain args and should have fetched the schema or loaded document guidance first.                        |
|    2 | `update_onto_task` for outline progress                      | Proper           | Correct target and useful state change.                                                                                                                |
|    2 | `create_onto_task` for Chapter 2 revision                    | Proper           | Correct follow-up task and linked to goal.                                                                                                             |
|    2 | `create_onto_task` for Chapter 3 draft                       | Proper           | Correct follow-up task and linked to goal.                                                                                                             |
|    2 | `update_onto_document` progress append                       | Improper         | Correct high-level intent, invalid arguments. Sent `update_strategy`, `merge_instructions`, and `props: {}` but no `content`; write failed.            |
|    2 | Final response after failed document update                  | Improper         | It did not disclose the failed document update. The response avoided saying the doc was updated, but still omitted an important partial-failure state. |
|    3 | `list_onto_tasks`                                            | Proper           | Ensured current task states and IDs.                                                                                                                   |
|    3 | `list_onto_documents`                                        | Proper           | Ensured current document ID.                                                                                                                           |
|    3 | `search_project("magic system")`                             | Mostly proper    | Useful but partially redundant because loaded context already had the magic-system task.                                                               |
|    3 | `tool_search` for document create/update                     | Mostly proper    | Needed under current surface, but the model still chose append rather than separate document.                                                          |
|    3 | `get_document_tree`                                          | Proper           | Valid context before deciding document placement.                                                                                                      |
|    3 | `get_onto_document_details`                                  | Proper           | Important before appending to an existing document.                                                                                                    |
|    3 | `update_onto_task` x3                                        | Proper           | Correctly moved magic system, blacksmithing research, and Aethermoor map tasks to `in_progress`.                                                       |
|    3 | `update_onto_document` with content                          | Proper           | This time the append had valid `content` and succeeded.                                                                                                |
|    3 | `create_onto_document` for research notes                    | Missing/optional | For substantial named research notes, a separate document would likely be better than appending to the context doc.                                    |

## Specific Findings

### P0: Lite Allowed A Bad Document Update Call

The lite run attempted:

```json
{
	"document_id": "3e9432fb-90e1-4404-a480-c73186b1337d",
	"update_strategy": "append",
	"merge_instructions": "Add a new section under 'Progress Updates' ...",
	"props": {}
}
```

There was no `content`. That is not a meaningful append. The API rejected it with "No update fields provided".

The schema in [ontology-write.ts](../../apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts) makes only `document_id` required for `update_onto_document`. That is appropriate for title/state/description edits, but not sufficient for append/merge behavior. The schema describes `merge_instructions` as guidance used with append/merge, but does not enforce content being present.

The executor in [ontology-write-executor.ts](../../apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts) only resolves append/merge behavior when `content` or `body_markdown` exists. `merge_instructions` alone does not produce new content.

The validation in [tool-execution-service.ts](../../apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts) ignores `update_strategy` and `merge_instructions` when checking for update fields, which is good. But it treated `props: {}` as an update field because non-string values count as present. That let the empty update through to the API.

Recommendation:

- Treat empty objects and empty arrays as no-op values during update validation.
- If `update_strategy` is `append` or `merge_llm`, require non-empty `content`, `body_markdown`, `markdown`, `body`, `text`, or `document.content`.
- Add a schema example that shows `content` and `merge_instructions` together.
- Return a model-facing validation error like: `update_onto_document append requires non-empty content`.

### P0: Lite Did Not Surface A Failed Write

The final lite response after Turn 2 did not mention that the document update failed. It only reported the successful task updates/creates and asked whether the user wanted a dedicated "Chapter Progress Log" doc.

That is better than falsely claiming the document update succeeded, but still not good enough. From the user's perspective, they gave project memory and the assistant attempted to persist it. A failed persistence attempt should be disclosed.

Fastchat's master prompt has stronger rules:

- Do not claim actions you did not perform.
- Only say an entity was created, updated, moved, merged, archived, deleted, scheduled, or linked after the write tool succeeded.
- If data is missing or a tool fails, state what happened.

Lite has a shorter safety section. It says not to claim a tool ran unless the runtime supplied a successful result, but it does not explicitly say to disclose failed writes or partial completion.

Recommendation:

- Add the stronger fastchat failure language to [build-lite-prompt.ts](../../apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts).
- More importantly, enforce this in the runtime. If any write tool fails, the final response should include a compact partial-failure block unless a successful retry fixed it.
- Add a test that asserts a failed write is disclosed and not silently omitted.

### P1: Fastchat Missed The Initial Goal

Fastchat created no goal even though the user clearly stated an outcome: starting and developing the fantasy novel "The Last Ember".

The prompt already says that a project creation flow should add one goal when the user states an outcome. The lite run did exactly that. This looks like an instruction salience or eval gap, not a missing product capability.

Recommendation:

- Add this exact fantasy-novel seed to prompt evals.
- Assert the create payload includes exactly one primary goal.
- Assert the seven user-provided bullets become tasks.
- Assert the goal contains or relates to the tasks.
- Consider making the project creation schema/examples emphasize "goal plus concrete task children" more strongly.

### P1: Project Context Tool Surface Is Too Read-Heavy For Follow-Ups

In project context, the preloaded tools are currently the `project_basic` surface:

- `change_chat_context`
- `get_project_overview`
- `get_onto_project_details`
- `search_project`
- `list_onto_tasks`
- `list_onto_documents`

Common follow-up turns in a project are not read-only. Users say things like "I finished this", "add this", "capture these notes", "move this to in progress", or "research notes". Those usually require:

- `create_onto_task`
- `update_onto_task`
- `update_onto_document`
- sometimes `get_onto_document_details`
- sometimes `create_onto_document`
- sometimes `get_document_tree` and `move_document_in_tree`

Because these are not preloaded in basic project context, both flows had to use repeated `tool_search` and `tool_schema` calls. That increased tokens and created more opportunities for mistakes.

Recommendation:

- Add a project follow-up/write profile or deterministic routing heuristic.
- For turns containing progress, finished, update, add, capture, notes, research, revise, draft, todo, or done, preload `project_write`.
- For turns containing document, notes, research notes, organize, tree, move, append, or create doc, preload a limited document-write surface.
- Keep the full `project_document` surface for document-heavy requests, not every project turn.

### P1: Fastchat Polluted A Task Description With Tool Parameter Markup

In the fastchat magic-system turn, one `update_onto_task` call stored this artifact inside the task description:

```text
"
<parameter name="update_strategy">replace
```

The tool succeeded, so this is a data-quality failure rather than a runtime failure. It likely came from malformed model output where a parameter tag leaked into a string instead of becoming a structured argument.

Recommendation:

- Add validation/sanitization for obvious tool-call markup artifacts in string fields before persistence.
- Consider rejecting ontology write string fields that contain `<parameter name=...>` or similar internal tool syntax.
- Add prompt/tool-call tests that assert parameter syntax cannot be stored in user data.

### P1: Trace Summaries Are Misleading

The persisted `fastchat_tool_trace_summary` only shows the first handful of operations. In both runs, later successful writes are omitted from the compact summary.

Examples:

- Fastchat Turn 3 summary shows skill loads, searches, doc list, tree get, but omits the later document create, task updates, and tree move in the short summary.
- Lite Turn 3 summary omits later task updates and document append in the short summary.
- Fastchat Turn 2 summary includes `onto.task.update:ok`, but that entry was only a `tool_schema` call for `onto.task.update`, not an actual `update_onto_task` execution.

This makes audits harder and can make a session look less or more successful than it was.

Recommendation:

- Summaries should include every write operation and every failure.
- Schema lookups should be labeled as schema lookups, not as completed write operations.
- Suggested summary shape:

```text
Tool trace: 12 calls, 8 writes, 1 failure.
Writes: update_task ok x1; create_task ok x2; update_document failed x1.
Reads/discovery: skill_load ok x1; list_tasks ok x1; list_documents ok x1; tool_search ok x4; tool_schema ok x1.
Failures: update_document missing content for append.
```

### P2: Lite's Document Strategy Is Ambiguous

Lite appended substantial research notes to the project context document. This is valid, but not ideal for notes that have a clear title and will likely grow.

Fastchat created a dedicated research document and nested it. That is a better durable workspace shape for the magic-system notes.

Recommendation:

- Add a document-placement rule:
    - Short progress snippets can append to a context/progress document.
    - Substantial named research notes should create a dedicated document.
    - If the user says "research notes", "worldbuilding notes", "bible", "spec", "outline", or gives multiple sections, prefer `create_onto_document`.
    - If a document is created, place it in the doc tree with `move_document_in_tree`.

### P2: Skill Loads Are Too Heavy

Fastchat loaded full `document_workspace` and `task_management` playbooks in Turn 3. Lite loaded `task_management` with examples in Turn 2. These were not wrong, but they contributed to large prompt/token footprints.

Recommendation:

- Default to compact skill loads unless the operation is risky or multi-step enough to need examples.
- Make "include_examples" opt-in and rare.
- Add eval counters for skill-load count, skill-load format, and token impact.

### P2: Lite Prompt Cost Breakdown Is Hard To Compare

Lite prompt snapshots include section metadata, but the legacy prompt cost breakdown buckets still show many fastchat-specific buckets as zero. That makes cross-variant comparison awkward.

Recommendation:

- Add a lite-specific cost breakdown keyed by lite section IDs:
    - `identity_mission`
    - `focus_purpose`
    - `location_loaded_context`
    - `timeline_recent_activity`
    - `operating_strategy`
    - `capabilities_skills_tools`
    - `context_inventory_retrieval`
    - `safety_data_rules`
- Keep the old buckets for backwards compatibility, but do not rely on them for lite analysis.

### P2: Snapshot Version Labels Are Confusing

The lite audit prompt snapshots still include `snapshot_version: "fastchat_prompt_v1"` while `prompt_variant` is `lite_seed_v1`. That is understandable if the snapshot format is shared, but it is confusing during audits.

Recommendation:

- Rename the snapshot schema version to something neutral, or add a separate `snapshot_schema_version`.
- Keep `prompt_variant` as the actual behavioral prompt selection.

### P2: User Timezone Is Not Reflected

The lite prompt used UTC in the timeline frame. The user/environment timezone is America/New_York. For this session it did not break behavior, but relative phrases like "today" are common in project updates and scheduling.

Recommendation:

- Include the user's locale timezone in prompt context when available.
- For any turn with "today", "tomorrow", "yesterday", due dates, or schedule language, ensure the prompt and tools use the user's timezone.

### P3: Document Type Did Not Persist As Requested

Fastchat requested `type_key: "document.knowledge.research"` for the Magic System Research Notes document, but the result came back with `type_key: "document.default"`.

This did not harm the user-facing flow, but it may indicate a type taxonomy mismatch, API coercion, or unsupported document type.

Recommendation:

- Confirm whether `document.knowledge.research` is a valid type.
- If not, update examples and prompt guidance to use supported document types.
- If it should be valid, fix the create endpoint/type normalization.

### P3: "Cross-Linked" Language Is Too Strong Without Edges

Fastchat's final response said the blacksmithing task was "cross-linked" to the new doc. The trace shows task descriptions were updated with prose references, but no semantic edge/link tool was called.

Recommendation:

- Reserve "linked" or "cross-linked" for actual graph/document links.
- Use "referenced in the description" when that is what happened.
- If the product wants actual task-document links, expose or preload the correct direct tool and teach the agent to use it.

## Brain Dump Observations

- Lite's first project create was more semantically faithful to the user's request.
- Fastchat's first project create was valid but under-modeled the project because it had no goal.
- The fastchat response compensated in prose by suggesting a goal, but the graph did not contain that goal.
- Lite included Aethermoor in the project description; fastchat omitted it from the description but included it in a task.
- Lite used `stage: discovery`; fastchat used `stage: planning`. Both are defensible, but "discovery" matched a first-novel setup better.
- Lite added task descriptions. Fastchat mostly encoded details in task titles.
- Lite linked new tasks to the main goal via `goal_id`; fastchat had no goal to link to.
- Lite's Chapter 2 response was better product behavior because it updated existing project state, not just created new tasks.
- Fastchat's Chapter 2 trace summary is misleading because `onto.task.update:ok` was a schema lookup, not a write.
- Lite attempted to capture progress into the context document, which was a good intent.
- Lite's failed progress append was caused by a tool/schema/validation gap and a model planning gap.
- The final lite response after the failed append did not claim the append succeeded, but silence about a failed write still creates user-trust risk.
- Lite later performed a valid append on Turn 3 because it fetched full document details and supplied actual content.
- Fastchat's Turn 3 document behavior was more durable for substantial research notes.
- Lite's Turn 3 append preserved the existing context document structure and added useful sections.
- Lite's Turn 3 final answer offered a dedicated "Magic System Doc" after appending, which suggests the model recognized the document-placement tension too late.
- Fastchat's Turn 3 task updates were useful but one update polluted persisted data with internal parameter markup.
- Fastchat's Turn 3 final answer may overstate "cross-linked" because no actual semantic link call is visible.
- Both flows overused discovery because project context only preloads basic read tools.
- Both flows would benefit from a project write surface for normal follow-up project updates.
- The lite prompt's bounded context index helped it know the project goal and recent tasks.
- Lite's bounded context omitted some tasks from the visible top entity refs even though counts showed 9 tasks. It compensated with `list_onto_tasks`.
- The 2-minute context cache was not an issue in this trace because cache age was 0 seconds.
- The prompt eval sections were empty in both audits, which means this scenario is not yet captured as a formal regression case.
- The lite harness is doing what the plan intended: same runtime, smaller prompt, dynamic seed context, and dynamic tool surface. The remaining problems are around tool contracts, failure disclosure, and surface routing.
- Fastchat has stronger explicit behavioral guardrails, but the prompt is heavier and still failed the initial goal instruction.
- Lite has a cleaner prompt shape, but the safety/error section should inherit the strongest fastchat rules.
- Tool-call correctness should be judged separately from final user prose. Several calls were operationally successful but semantically incomplete, and at least one final response was too optimistic.

## Recommended Fix Plan

### 1. Fix Document Update Validation

Target files:

- [ontology-write.ts](../../apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts)
- [ontology-write-executor.ts](../../apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts)
- [tool-execution-service.ts](../../apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts)

Changes:

- For `update_onto_document`, make append/merge require non-empty content.
- Treat `props: {}` as empty.
- Treat empty arrays as empty.
- Reject no-op updates before API PATCH.
- Add explicit examples for append:

```json
{
	"document_id": "<uuid>",
	"content": "## Progress Updates\n\n- Chapter 2 complete...",
	"update_strategy": "append",
	"merge_instructions": "Append under Progress Updates; preserve existing sections."
}
```

### 2. Enforce Failed-Write Disclosure

Target files:

- [build-lite-prompt.ts](../../apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts)
- [stream endpoint](../../apps/web/src/routes/api/agent/v2/stream/+server.ts)
- [stream orchestrator](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/README.md) and implementation files under the same directory

Changes:

- Add prompt rules to disclose failed writes.
- Add runtime failure summary injection before final answer.
- If safe, allow a repair pass; if not repaired, final text must include partial success/failure.
- Test a failed document append and assert the response says the document was not updated.

### 3. Add A Project Write Surface

Target file:

- [gateway-surface.ts](../../apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts)

Changes:

- Use `project_write` for common project mutation turns.
- Consider a `project_notes` or `project_document_write_light` profile with:
    - `list_onto_documents`
    - `get_onto_document_details`
    - `update_onto_document`
    - `create_onto_document`
    - `get_document_tree`
    - `move_document_in_tree`
- Keep the surface smaller than full document management unless the request clearly needs tree operations.

### 4. Backport Lite's Better Project Create Behavior

Target files:

- [master-prompt-builder.ts](../../apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts)
- prompt eval files under [apps/web/src/lib/services/agentic-chat-v2](../../apps/web/src/lib/services/agentic-chat-v2)

Changes:

- Add an eval for the exact "The Last Ember" seed.
- Assert 1 goal, 7 tasks, 1 context document.
- Assert tasks are linked under the goal.
- Assert no extra plans/milestones are invented.

### 5. Add Document Placement Guidance

Target files:

- [build-lite-prompt.ts](../../apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts)
- [master-prompt-builder.ts](../../apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts)
- [document_workspace skill](../../apps/web/src/lib/services/agentic-chat/tools/skills/definitions/document_workspace/SKILL.md)

Changes:

- Short progress update: append to progress/context doc if one exists.
- Substantial named research notes: create a dedicated document.
- Use `get_document_tree` and `move_document_in_tree` when placing the doc.
- Avoid saying "linked" unless a link/edge was actually created.

### 6. Sanitize Tool Markup Artifacts

Target files:

- [tool-execution-service.ts](../../apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts)
- [ontology-write-executor.ts](../../apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts)

Changes:

- Reject or sanitize string fields containing obvious internal tool syntax:
    - `<parameter name=`
    - `<tool_call`
    - `</parameter>`
    - other known tool-call artifacts
- Add tests around task/document descriptions.

### 7. Improve Tool Trace Summaries

Target files:

- [stream endpoint](../../apps/web/src/routes/api/agent/v2/stream/+server.ts)
- prompt observability files under [apps/web/src/lib/services/agentic-chat-v2](../../apps/web/src/lib/services/agentic-chat-v2)

Changes:

- Include every write and every failure in the summary.
- Separate discovery/schema calls from actual write operations.
- Include counts by kind: reads, writes, discovery, failures.
- Do not truncate away failures.

### 8. Add Formal Replay/Eval Coverage

Target files:

- [prompt-eval-scenarios.ts](../../apps/web/src/lib/services/agentic-chat-v2/prompt-eval-scenarios.ts)
- [prompt-eval-runner.ts](../../apps/web/src/lib/services/agentic-chat-v2/prompt-eval-runner.ts)
- [prompt-replay-runner.ts](../../apps/web/src/lib/services/agentic-chat-v2/prompt-replay-runner.ts)

Eval assertions:

- Initial project has one primary goal.
- Seven user bullets become seven tasks.
- Goal-task relationships exist.
- Chapter 2 progress updates existing outline task.
- Revision and Chapter 3 tasks are created.
- Invalid document append is rejected before API execution.
- If any write fails, final answer discloses it.
- Research notes become either a dedicated document or an explicitly accepted append, based on the chosen product rule.
- Token and cost deltas are recorded by prompt variant.

## Suggested Acceptance Criteria Before Wider Lite Rollout

- `lite_seed_v1` passes the fantasy-novel replay scenario without hidden failures.
- No `update_onto_document` append/merge call can execute without content.
- Empty `props: {}` no longer counts as an update field.
- Failed write results are surfaced in final assistant responses.
- Project create eval confirms one primary goal for outcome-style projects.
- Project follow-up turns do not require more than one discovery pass for common task/document writes.
- Trace summaries include all writes and all failures.
- Lite remains lower cost than fastchat on the same replay set.

## Bottom Line

Lite should become the foundation, but not until the write-contract and failure-disclosure issues are fixed. The lite prompt architecture is cleaner and produced better project structure at lower cost. The fastchat flow still has important behaviors worth preserving: stronger failure-language guardrails and better handling of substantial research notes as dedicated project documents.

The highest priority is not prompt polish. It is making the tool layer impossible to misuse in the observed way, then forcing the assistant to disclose any failed write before the turn completes.
