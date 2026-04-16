<!-- docs/reports/agentic-chat-fastchat-vs-lite-fantasy-novel-flow-audit-2026-04-15.md -->

# Agentic Chat Fastchat vs Lite Flow Audit

Date: 2026-04-15
Updated: 2026-04-16

Scope: audit of agentic chat sessions for the same fantasy-novel project creation and follow-up workflow. The original comparison covered one full standard fastchat run and one full lite run. This update adds two 2026-04-16 lite reruns: the three-turn 74a4 rerun and the four-turn ac79 confirmation-flow run. It also notes one earlier one-turn fastchat repair pilot for context.

## Primary Sources

- Fastchat session audit: [chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-09e3ca0b-8163-47-2026-04-15.md](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-09e3ca0b-8163-47-2026-04-15.md)
- Lite session audit: [chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-5e74e634-0992-49-2026-04-15.md](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-5e74e634-0992-49-2026-04-15.md)
- Lite rerun session audit: [chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-74a4f0ef-9607-4e-2026-04-16.md](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-74a4f0ef-9607-4e-2026-04-16.md)
- Lite confirmation-flow session audit: [chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-ac79da05-7120-4b-2026-04-16.md](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-ac79da05-7120-4b-2026-04-16.md)
- Earlier one-turn repair pilot: [chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-3f288e0f-a385-43-2026-04-15.md](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-3f288e0f-a385-43-2026-04-15.md)
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

The lite flow remains the better direction for the product, and the 2026-04-16 rerun improves the headline reliability and efficiency metrics. It completed the same three-turn workflow with 0 tool failures, 19 tool calls, 106,280 tokens, and `$0.0302656` cost. Compared with the original full fastchat run, that is about 25.9% fewer tokens and 42.1% lower cost. Compared with the 2026-04-15 lite run, it is about 10.5% fewer tokens, 11.3% lower cost, and five fewer tool calls.

The rerun also confirms that the original lite P0 failure mode is addressable. It did not repeat the bad `update_onto_document` append call with `merge_instructions` but no `content`, and there was no hidden failed write to disclose.

However, the rerun is not a clean graduation signal. The main reliability risk shifted from failed writes to successful bad writes. On the magic-system turn, the rerun successfully updated the project context document but persisted internal tool-call markup into document content: `<parameter name="update_strategy">replace`. That is worse than a visible tool failure in one important sense: the runtime considered the write successful, the assistant reported success, and the durable document was polluted.

The rerun also improved task handling on the Chapter 2 turn by creating a separate continuity-fix task in addition to the Chapter 2 revision task and Chapter 3 draft task. But it did not mention that continuity task in the final Turn 2 response. On the research-notes turn, it created the right dedicated research document and updated the context document, but it did not update the magic-system task despite claiming "Task Progress" had advanced.

Net: lite is still ahead on architecture, cost, and initial project modeling. The April 16 rerun is better than the April 15 lite run on failed-tool behavior and cost. It is worse than it looks on write integrity because it introduced a successful document corruption case. Before wider rollout, the sanitizer/validator for internal tool markup needs to be promoted from a P1 cleanup to a release-blocking write-integrity fix.

A second April 16 lite run, `ac79da05`, adds a useful variation: the assistant paused after the Chapter 2 progress message and waited for the user to say "Yeah, let's save all this." That made the flow four turns instead of three. It produced the best Chapter 2 persistence artifact by creating a dedicated "Chapter 2 Progress & Revisions" document, but it was more expensive than the other lite full runs and repeated the same release-blocking markup-artifact bug in a task description.

Late-pass implementation notes and next-test expectations are recorded in
[Post-Fix Update: 2026-04-16 Late Pass](#post-fix-update-2026-04-16-late-pass)
and [Expected Next Testing Round](#expected-next-testing-round).

## Which File Was Which

| File                                                                                                                       |       Prompt variant | Outcome                                                                                      |  Tokens |          Cost |          Errors |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------: | -------------------------------------------------------------------------------------------- | ------: | ------------: | --------------: |
| [3f288e0f audit](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-3f288e0f-a385-43-2026-04-15.md) | `fastchat_prompt_v1` | One-turn pilot. First create failed on invalid `type_key`, then repaired and succeeded       |  21,834 |  `$0.0060579` |  1 tool failure |
| [09e3ca0b audit](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-09e3ca0b-8163-47-2026-04-15.md) | `fastchat_prompt_v1` | Full flow. No tool failures, but missed the primary project goal                             | 143,388 |  `$0.0522584` | 0 tool failures |
| [5e74e634 audit](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-5e74e634-0992-49-2026-04-15.md) |       `lite_seed_v1` | Full flow. Better project structure, but one hidden failed document update                   | 118,687 | `$0.03410443` |  1 tool failure |
| [74a4f0ef audit](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-74a4f0ef-9607-4e-2026-04-16.md) |       `lite_seed_v1` | Full rerun. No failed tools and cheapest run, but persisted tool markup in document content  | 106,280 |  `$0.0302656` | 0 tool failures |
| [ac79da05 audit](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-ac79da05-7120-4b-2026-04-16.md) |       `lite_seed_v1` | Four-turn confirmation flow. Best Chapter 2 doc capture, but persisted tool markup in a task | 123,727 | `$0.04469285` | 0 tool failures |

The April 15 lite run reduced tokens by about 17.2% and cost by about 34.8% versus the full fastchat run, despite taking a failed-tool path and making more tool calls.

The April 16 lite rerun improved that further: about 25.9% fewer tokens and 42.1% lower cost than full fastchat, and about 10.5% fewer tokens and 11.3% lower cost than the April 15 lite run. The earlier 3f288e0f run is useful as a repair-policy datapoint, but it is only one turn and should not be compared directly to the three-turn totals.

The ac79da05 run is also not a clean apples-to-apples cost comparison because it includes an extra user confirmation turn. It still cost less than the full fastchat run, but it was materially more expensive than the three-turn April 16 lite rerun.

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

| Dimension                   | Fastchat full run                                       | Lite Apr 15 run                                                       | Lite Apr 16 rerun                                                                | Assessment                                                                   |
| --------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Initial project shape       | Created project, 7 tasks, 1 document, 0 goals           | Created project, 1 goal, 7 tasks, 1 document, goal-task relationships | Created project, 1 goal, 7 tasks, 1 document, goal-task relationships            | Lite remained better                                                         |
| Goal extraction             | Missed obvious outcome goal                             | Created "Write and complete the fantasy novel 'The Last Ember'"       | Created "Write the fantasy novel 'The Last Ember'"                               | Lite remained better                                                         |
| Initial task descriptions   | Mostly task titles only on project create               | Better descriptions on initial tasks                                  | Initial tasks were title-only; context document captured details                 | Apr 16 regressed versus Apr 15 lite on task-detail richness                  |
| Chapter 2 progress handling | Created two tasks, did not update existing outline task | Updated outline task and created two linked tasks                     | Updated outline task, created three tasks including continuity fix               | Apr 16 was best for task coverage                                            |
| Turn 2 final response       | Mostly accurate, but missed outline progress            | Omitted failed document write                                         | Omitted the newly created continuity-fix task                                    | Apr 16 improved failure behavior but still missed a completed write in prose |
| Document progress logging   | Did not attempt a progress document update              | Attempted append but failed                                           | Did not create/update progress doc on Turn 2; later replaced context doc content | Apr 16 avoided failed append but still needs a clean progress-capture policy |
| Magic system notes          | Created separate research document and nested it        | Appended to context document                                          | Created separate research document and updated context doc                       | Apr 16 chose the best artifact shape, but missed nesting and task updates    |
| Magic-system task updates   | Updated three relevant tasks                            | Updated three relevant tasks                                          | Did not update the magic-system task, despite implying task progress             | Apr 16 regressed here                                                        |
| Successful write quality    | One task description polluted with tool markup          | No known successful write pollution                                   | Project context doc polluted with tool markup                                    | Write sanitization is now release-blocking                                   |
| Tool-call success           | No tool failures                                        | One failed document update                                            | No tool failures                                                                 | Apr 16 was best on raw failure count                                         |
| Error disclosure            | No errors to disclose                                   | Failed document write was hidden                                      | No failed writes, but successful bad write was not detected                      | Runtime needs failed-write and bad-write integrity checks                    |
| Token efficiency            | 143,388 tokens                                          | 118,687 tokens                                                        | 106,280 tokens                                                                   | Apr 16 was cheapest                                                          |
| Tool discovery overhead     | Heavy skill/schema/tool-search use                      | Still significant discovery use                                       | Lower total calls, but still loaded examples and fetched unused document schema  | Project write/document surfaces still need tuning                            |

The ac79 confirmation-flow run is excluded from this three-column comparison table because it added an extra user confirmation turn. Compared with the three-turn 74a4 rerun, ac79 improved Chapter 2 document capture but regressed cost and repeated the internal-markup persistence bug in a task description.

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

## April 16 Lite Rerun Reassessment

The 2026-04-16 rerun used `lite_seed_v1` and is the most important new datapoint because it repeated the full three-turn fantasy-novel flow after the initial audit. It is not directly comparable to the earlier 3f288e0f one-turn pilot, but it is directly comparable to the 09e3ca0b fastchat full run and the 5e74e634 lite full run.

### Rerun Verdict

The April 16 lite rerun was better performance on raw runtime metrics and on the original failed-write P0, but it was not better end-to-end quality. It avoided the no-content document append failure, reduced cost, and created a stronger Chapter 2 task set. It also introduced a successful data-quality failure by persisting internal tool-call markup into the project context document.

The most accurate rating is: better than the April 15 lite run for cost and failed-tool reliability; worse than it appears for trust because the bad document write succeeded instead of failing; still not ready for broad rollout until successful write payloads are sanitized.

### Turn 1: Project Creation Rerun

The rerun created project `7a04594e-8ebc-4a71-a188-816a696cd25c` with 1 goal, 7 tasks, 1 document, and 9 edges. That matches the desired project skeleton and repeats the strongest behavior from the April 15 lite run. It captured all seven user bullets as tasks and linked them under the goal.

Differences from the April 15 lite run:

- Good: no create failure, valid project type key, correct goal-task graph.
- Good: the context document captured the main plot, Aethermoor, antagonist, prophecy, and core development areas.
- Regression: the initial task entities were title-only in the raw result; the April 15 lite audit had better initial task descriptions.
- Minor response issue: the assistant's prose summary listed only five of the seven task areas and omitted the main character backstory and antagonist profile bullets, even though they were persisted.

### Turn 2: Chapter 2 Progress Rerun

The rerun handled task state better than fastchat and better than the April 15 lite run. It updated "Outline first three chapters" to `in_progress` and created three follow-up tasks:

- "Revise Chapter 2: strengthen Elena-Master Thorne dialogue, fix pacing, add forge sensory details"
- "Fix continuity error: Elena's age inconsistency (Ch1: 16, Ch2: 17)"
- "Outline and draft Chapter 3: Elena's first magical forging, introduce Shadow King's herald, foreshadow prophecy"

This is the best task coverage of the three full runs. The continuity issue deserved its own task, and the rerun did that.

The weaknesses:

- It fetched `tool_schema(onto.document.create)` but did not create a progress document in that turn.
- It did not persist a clean Chapter 2 progress log at Turn 2 time, although the later Turn 3 context-doc replacement included Chapter 2 progress.
- The final response omitted the newly created continuity-fix task, so the user-facing summary was incomplete.
- It still loaded `task_management` with examples for a fairly common project follow-up, so skill-load token cost remains higher than needed.

### Turn 3: Magic System Research Notes Rerun

The rerun made the better high-level document decision: it created a dedicated "Magic System Research Notes" document instead of only appending to the context document. This aligns with the original audit's document-placement recommendation for substantial named research notes.

However, the detailed execution had three important problems:

- The new document was not nested under the context document. There was no `get_document_tree` or `move_document_in_tree` call.
- The project context document update persisted malformed content containing `<parameter name="update_strategy">replace`.
- The assistant claimed "Task Progress" for "Create magic system based on metal and fire", but no `update_onto_task` call advanced that task. The final task list still showed that task as `todo`.

The document update issue is the most serious. The write succeeded, so the runtime did not have an error to disclose. The result is a durable bad write, not a failed write. This expands the reliability requirement: the system must not only disclose failed writes; it must reject obvious internal tool-call artifacts before persistence.

## April 16 ac79 Lite Confirmation-Flow Reassessment

The ac79da05 run is another `lite_seed_v1` session, but it differs from the other full runs because the assistant did not immediately persist the Chapter 2 progress update. It first summarized the user's progress and asked whether to save or structure it. The user then replied, "Yeah, let's save all this." That makes it a useful datapoint for a confirmation-first interaction pattern, but it is a four-turn flow and should not be compared directly to the three-turn token totals.

### ac79 Verdict

This run was better than the 74a4 rerun at Chapter 2 document capture and better than the April 15 lite run at avoiding failed writes. It was worse than 74a4 on cost and still failed the same release-blocking successful-write quality check.

The core finding: confirmation helped the Chapter 2 persistence workflow, but did not solve write hygiene. The magic-system turn still wrote `<parameter name="update_strategy">replace` into a task description.

### Turn 1: Project Creation

ac79 created the expected project skeleton: 1 goal, 7 tasks, 1 document, and 9 edges. It used a reasonable goal, "Complete first draft of 'The Last Ember'", and a valid `project.creative.novel` type.

The same response-summary issue appeared again: the final prose listed only five task areas and omitted the main character backstory and antagonist profiles even though the create payload persisted all seven tasks.

### Turn 2 and Turn 3: Chapter 2 Progress

The assistant's first Chapter 2 response did not write anything. It summarized the progress and asked whether to save it. This was conservative and avoided accidental writes, but the prose had two quality issues: it omitted the forge sensory-details issue and rendered the age-continuity line awkwardly as `17 in Ch2)—which is canon?`.

After the user confirmed, the assistant saved the work well:

- Updated "Outline first three chapters" to `in_progress` with the Chapter 2 and Chapter 3 details.
- Created "Revise Chapter 2" with dialogue, pacing, sensory detail, and age-continuity notes.
- Created "Draft Chapter 3" with the forging attempt, herald, and prophecy plan.
- Created a dedicated "Chapter 2 Progress & Revisions" document.

This is the best Chapter 2 document capture among the full runs. The main tradeoff is cost and interaction length: it required an extra user turn, loaded the full `task_management` skill, and used several discovery searches before writing.

### Turn 4: Magic System Research Notes

The magic-system turn was mixed:

- Good: created a dedicated "Magic System Research Notes" document with the right research content.
- Good: found the existing "Create magic system based on metal and fire" task and attempted to enrich it.
- Bad: the document type again persisted as `document.default` even though the assistant claimed `document.knowledge.research`.
- Bad: the assistant said the document was "Linked to the main goal", but no actual link/edge operation is visible.
- Bad: the task description update persisted internal tool-call markup: `<parameter name="update_strategy">replace`.
- Missing: no `get_document_tree` / `move_document_in_tree` call placed the research doc in a deliberate hierarchy.

This confirms the prior audit's strongest conclusion: raw "0 tool failures" is not enough. Successful writes still need payload hygiene checks.

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

### April 16 Lite Rerun Tool Call Evaluation

| Turn | Tool/action                                      | Verdict       | Notes                                                                                                                                                                               |
| ---: | ------------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | `create_onto_project`                            | Proper        | Correct tool and strong project skeleton: 1 goal, 7 tasks, 1 document, 9 edges. All seven user bullets became tasks and were related to the goal.                                   |
|    1 | Initial task details                             | Mostly proper | Task titles preserved the user bullets, but the raw task rows were description-null. The context document carried supporting details instead.                                       |
|    1 | Final response                                   | Mostly proper | Accurately reported the project and goal, but omitted two persisted task areas in the prose summary: backstory and antagonist profiles.                                             |
|    2 | `skill_load(task_management, include_examples)`  | Mostly proper | Useful for a task-heavy follow-up, but examples were likely more context than needed for this routine task creation/update turn.                                                    |
|    2 | `list_onto_tasks` and `list_onto_documents`      | Proper        | Correct reads before mutating existing task state and considering document capture.                                                                                                 |
|    2 | `get_project_overview`                           | Mostly proper | Helpful orientation, but partly redundant after listing tasks/documents in this small project.                                                                                      |
|    2 | `tool_schema(onto.task.create/update)`           | Proper        | Reasonable before first task writes in this project follow-up.                                                                                                                      |
|    2 | `tool_schema(onto.document.create)`              | Mostly proper | The model fetched the schema but did not create a document in the turn. This is wasted discovery unless the model is explicitly deciding not to persist progress yet.               |
|    2 | `create_onto_task` for Chapter 2 revision        | Proper        | Correct durable follow-up task with useful description and goal link.                                                                                                               |
|    2 | `create_onto_task` for age continuity fix        | Proper        | Best handling among the full runs. The continuity issue was separate from Chapter 2 revision work and deserved its own task.                                                        |
|    2 | `create_onto_task` for Chapter 3 draft           | Proper        | Correct follow-up task with useful description and goal link.                                                                                                                       |
|    2 | `update_onto_task` for outline progress          | Proper        | Correctly moved the existing outline task to `in_progress`.                                                                                                                         |
|    2 | Final response after successful writes           | Mostly proper | It reported the outline update, revision task, and Chapter 3 task, but omitted the successfully created age-continuity task.                                                        |
|    3 | `tool_search` for document writes                | Mostly proper | It found the needed document write surface. This still points to a project-document surface gap for common "research notes" turns.                                                  |
|    3 | `list_onto_documents` and `list_onto_tasks`      | Proper        | Correct reads before deciding document placement and identifying related tasks.                                                                                                     |
|    3 | `skill_load(document_workspace)`                 | Proper        | Document creation/update was stateful enough to justify compact skill guidance.                                                                                                     |
|    3 | `create_onto_document`                           | Proper        | Correctly created a dedicated research document for substantial named notes. The requested `document.knowledge.research` type still persisted as `document.default`, same P3 issue. |
|    3 | No `get_document_tree` / `move_document_in_tree` | Missing       | The document was not nested under the context document, unlike the fastchat full run.                                                                                               |
|    3 | `update_onto_document` for project context       | Improper      | The write succeeded but persisted internal tool-call markup into content: `<parameter name="update_strategy">replace`.                                                              |
|    3 | No `update_onto_task` for magic-system task      | Missing       | The final response implied task progress, but no task update occurred; the relevant task remained `todo` in the subsequent list.                                                    |
|    3 | Final response                                   | Improper      | It accurately reported the new document and context-doc update, but overstated task progress and did not detect the polluted context document write.                                |

### April 16 ac79 Lite Tool Call Evaluation

| Turn | Tool/action                                   | Verdict         | Notes                                                                                                                                                 |
| ---: | --------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | `create_onto_project`                         | Proper          | Correct project skeleton: 1 goal, 7 tasks, 1 document, 9 edges. Goal and project type were reasonable.                                                |
|    1 | Final response                                | Mostly proper   | It omitted two persisted task areas from the prose summary: backstory and antagonist profiles.                                                        |
|    2 | No write tools                                | Acceptable      | The assistant chose to ask before saving Chapter 2 progress. This is conservative but made the scenario a four-turn flow.                             |
|    2 | Progress summary prose                        | Mostly proper   | Captured the gist, but omitted forge sensory details and garbled the age-continuity line.                                                             |
|    3 | `skill_load(task_management, format: full)`   | Mostly proper   | The workflow involved several task writes, but full skill load was expensive.                                                                         |
|    3 | `list_onto_tasks` / `list_onto_documents`     | Proper          | Correct reads before selecting existing task and document context.                                                                                    |
|    3 | Four `tool_search` calls                      | Mostly proper   | Found needed write tools, but this is too much discovery for common task/document capture.                                                            |
|    3 | `update_onto_task` for outline                | Proper          | Correctly moved "Outline first three chapters" to `in_progress` and added Chapter 2/3 details.                                                        |
|    3 | `create_onto_task` for Chapter 2 revision     | Proper          | Good task with all revision issues plus age-continuity fix. Less granular than 74a4's separate age task, but defensible.                              |
|    3 | `create_onto_task` for Chapter 3 draft        | Proper          | Correct follow-up task with concise description.                                                                                                      |
|    3 | `create_onto_document` for Chapter 2 progress | Proper          | Best Chapter 2 persistence artifact across the runs. Result type still came back `document.default` despite requested context/project type.           |
|    4 | `tool_search` x2 + `search_project`           | Mostly proper   | Correctly found document creation and the magic-system task, but again shows the need for a project document/write surface.                           |
|    4 | `create_onto_document` for magic notes        | Proper          | Correct dedicated research document with clean content. Result persisted `document.default` while final answer claimed `document.knowledge.research`. |
|    4 | `update_onto_task` for magic-system task      | Improper        | Correct target, but persisted `<parameter name="update_strategy">replace` into the task description.                                                  |
|    4 | No document placement/link operation          | Missing         | The assistant said the new doc was linked to the main goal, but no graph/document link or doc-tree placement call is visible.                         |
|    4 | Final response                                | Mostly improper | It accurately reported the document creation, but overclaimed type and linking and did not notice the polluted task update.                           |

## Specific Findings

### P0: Successful Writes Can Persist Internal Tool Markup

Status after 2026-04-16 late pass: the durable-text validator and executor
backstop now reject this class before persistence, and repair replay redacts
the rejected string before the next model pass. The next test should verify
that the model either avoids the artifact entirely or retries cleanly after a
validation failure.

The April 16 lite rerun exposed a higher-confidence version of the markup-artifact problem. The model emitted a document update where `update_strategy` leaked into the `content` string instead of becoming a structured argument:

```text
<parameter name="update_strategy">replace
```

That string was persisted inside the "Project Plot Summary" document. The tool returned success, the session reported 0 tool failures, and the final response told the user the context document had been updated. This is a write-integrity failure, not an error-disclosure failure.

This should be treated as release-blocking for two reasons:

- The runtime cannot rely on tool failure handling when the bad payload is accepted and saved.
- The same artifact class already appeared in the original fastchat run and the ac79 lite confirmation-flow run, where task description text included parameter markup.

The ac79 run increases confidence that this is not isolated to one prompt variant or one write target. Across the observed sessions, the artifact persisted into both document content and task descriptions while the affected tool calls reported success.

Recommendation:

- Keep markup-artifact validation as a P0 release gate.
- Reject string fields containing obvious internal tool syntax before ontology writes persist.
- Apply the check to task titles/descriptions, document content/body markdown, project descriptions, goal descriptions, and any other user-visible durable text.
- Add tests for both `update_onto_task` and `update_onto_document` containing `<parameter name=`, `<tool_call`, `</parameter>`, and malformed JSON tail fragments.
- The final response repair layer should treat rejected markup writes like failed writes: disclose what did not persist unless a retry succeeds.

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

April 16 reassessment: the 74a4 and ac79 reruns did not repeat this exact no-content append failure. Both had 0 failed tools. This suggests the P0 fix direction is correct, but it does not close the broader write-integrity gap because both reruns still persisted malformed durable text.

Post-fix note: prompt language now states document append/merge writes require
non-empty content, and the repair/runtime validation tests cover this path. The
next replay should still explicitly inspect for append/merge calls that include
only `merge_instructions`.

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

April 16 reassessment: the reruns had no failed writes to disclose. The remaining trust gap is adjacent but different: final-answer integrity also needs to catch overclaims after successful writes, such as claiming task progress when no task update occurred, claiming a document type that was normalized to `document.default`, or saying a document was linked when no link or placement operation ran.

Post-fix note: both prompts now distinguish intent-only pre-tool lead-ins from
post-tool outcome claims. This should reduce premature success language, but
ledger-rendered final prose is still open and should remain part of the next
test's acceptance checks.

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

Because these are not preloaded in basic project context, the full runs had to use repeated `tool_search` and `tool_schema` calls. That increased tokens and created more opportunities for mistakes.

Recommendation:

- Add a project follow-up/write profile or deterministic routing heuristic.
- For turns containing progress, finished, update, add, capture, notes, research, revise, draft, todo, or done, preload `project_write`.
- For turns containing document, notes, research notes, organize, tree, move, append, or create doc, preload a limited document-write surface.
- Keep the full `project_document` surface for document-heavy requests, not every project turn.

### P0/P1: Tool Parameter Markup Also Polluted Fastchat Task Data

In the fastchat magic-system turn, one `update_onto_task` call stored this artifact inside the task description:

```text
"
<parameter name="update_strategy">replace
```

The tool succeeded, so this is a data-quality failure rather than a runtime failure. It likely came from malformed model output where a parameter tag leaked into a string instead of becoming a structured argument.

April 16 reassessment: this is no longer a fastchat-only issue. The 74a4 lite rerun stored the same class of artifact inside document content, and the ac79 lite confirmation-flow run stored it inside a task description. That makes the sanitizer/validator release-blocking for both prompt variants and both task/document writes.

Recommendation:

- Add validation/sanitization for obvious tool-call markup artifacts in string fields before persistence.
- Consider rejecting ontology write string fields that contain `<parameter name=...>` or similar internal tool syntax.
- Add prompt/tool-call tests that assert parameter syntax cannot be stored in user data.

### P1: Trace Summaries Are Misleading

The persisted `fastchat_tool_trace_summary` only shows the first handful of operations. In the original full runs, later successful writes are omitted from the compact summary.

Examples:

- Fastchat Turn 3 summary shows skill loads, searches, doc list, tree get, but omits the later document create, task updates, and tree move in the short summary.
- Lite Turn 3 summary omits later task updates and document append in the short summary.
- Fastchat Turn 2 summary includes `onto.task.update:ok`, but that entry was only a `tool_schema` call for `onto.task.update`, not an actual `update_onto_task` execution.
- April 16 lite Turn 2 summary collapses three task creates into `onto.task.create:ok`, which is compact but not enough to audit whether the final prose mentioned all created tasks.
- ac79 Turn 3 summary stops after skill/load, list, and discovery calls; it omits the later outline update, two task creates, and Chapter 2 document create.

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

April 16 reassessment: the lite rerun improved the artifact choice by creating a dedicated "Magic System Research Notes" document. It still missed document placement because it did not call `get_document_tree` or `move_document_in_tree`, and it updated the context document with polluted content. The product rule should therefore cover both artifact choice and placement/write hygiene.

Recommendation:

- Add a document-placement rule:
    - Short progress snippets can append to a context/progress document.
    - Substantial named research notes should create a dedicated document.
    - If the user says "research notes", "worldbuilding notes", "bible", "spec", "outline", or gives multiple sections, prefer `create_onto_document`.
    - If a document is created, place it in the doc tree with `move_document_in_tree`.

### P2: Skill Loads Are Too Heavy

Fastchat loaded full `document_workspace` and `task_management` playbooks in Turn 3. Lite loaded `task_management` with examples in Turn 2. These were not wrong, but they contributed to large prompt/token footprints.

April 16 reassessment: the rerun was cheaper overall, but it still loaded `task_management` with examples for a routine task follow-up and loaded `document_workspace` for research-note capture. The document skill load was defensible; the task-management examples look unnecessary.

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

The April 16 lite reruns repeated this mismatch. The 74a4 rerun requested `type_key: "document.knowledge.research"` when creating "Magic System Research Notes", and the result persisted `type_key: "document.default"`. The ac79 run did the same for "Magic System Research Notes" and also requested `document.context.project` for "Chapter 2 Progress & Revisions", which persisted as `document.default`.

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
- The April 16 lite rerun repeated the markup problem in a more dangerous place: the project context document content.
- The April 16 lite rerun had no failed tool calls, so raw failure count alone would incorrectly mark it as clean.
- The April 16 lite rerun created the separate magic-system research document that the April 15 lite run should have created.
- The April 16 lite rerun did not move that research document into the document tree, so fastchat still had the stronger complete document-workspace behavior.
- The April 16 lite rerun created a separate age-continuity task, which was better task decomposition than both earlier full runs.
- The April 16 lite Turn 2 final answer omitted that age-continuity task even though the write succeeded.
- The April 16 lite Turn 3 final answer implied task progress for the magic-system task, but the task remained `todo`.
- The ac79 lite confirmation-flow run produced the best Chapter 2 progress artifact by creating a dedicated "Chapter 2 Progress & Revisions" document after user confirmation.
- The ac79 confirmation step improved persistence quality for Chapter 2, but it added a fourth turn and raised cost above both three-turn lite full runs.
- The ac79 magic-system turn repeated the markup-pollution bug in a task description despite 0 failed tools.
- The ac79 final answer overclaimed the created document's type and said it was linked to the main goal even though the result persisted `document.default` and no link or placement operation was visible.
- The ac79 Turn 3 trace summary omitted the later successful writes, making the best Chapter 2 persistence work hard to see from the compact trace alone.
- Fastchat's Turn 3 final answer may overstate "cross-linked" because no actual semantic link call is visible.
- The full runs overused discovery because project context only preloads basic read tools.
- The full runs would benefit from a project write surface for normal follow-up project updates.
- The lite prompt's bounded context index helped it know the project goal and recent tasks.
- Lite's bounded context omitted some tasks from the visible top entity refs even though counts showed 9 tasks. It compensated with `list_onto_tasks`.
- The 2-minute context cache was not an issue in this trace because cache age was 0 seconds.
- The prompt eval sections were empty in the full audits, which means this scenario is not yet captured as a formal regression case.
- The lite harness is doing what the plan intended: same runtime, smaller prompt, dynamic seed context, and dynamic tool surface. The remaining problems are around tool contracts, failure disclosure, and surface routing.
- Fastchat has stronger explicit behavioral guardrails, but the prompt is heavier and still failed the initial goal instruction.
- Lite has a cleaner prompt shape, but the safety/error section should inherit the strongest fastchat rules.
- Tool-call correctness should be judged separately from final user prose. Several calls were operationally successful but semantically incomplete, and at least one final response was too optimistic.

## Recommended Fix Plan

2026-04-16 priority adjustment: keep the original P0 fixes for invalid document append and failed-write disclosure, but promote markup-artifact rejection ahead of rollout. The April 16 reruns prove that a session can show 0 tool failures while still corrupting durable document content or task descriptions.

### 1. Fix Document Update Validation

Status: largely addressed for the observed failure mode. Keep this in the next
test as a regression check.

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

Status: prompt-side language improved; full ledger-rendered enforcement is
still open.

Target files:

- [build-lite-prompt.ts](../../apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts)
- [stream endpoint](../../apps/web/src/routes/api/agent/v2/stream/+server.ts)
- [stream orchestrator](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/README.md) and implementation files under the same directory

Changes:

- Add prompt rules to disclose failed writes.
- Add runtime failure summary injection before final answer.
- If safe, allow a repair pass; if not repaired, final text must include partial success/failure.
- Test a failed document append and assert the response says the document was not updated.

### 3. Reject Tool Markup Artifacts Before Persistence

Status: addressed at the durable-text validation/executor boundary and in
repair replay redaction. Keep as a release-blocking replay assertion.

Target files:

- [tool-execution-service.ts](../../apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts)
- [ontology-write-executor.ts](../../apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts)
- document/task write validation helpers under [apps/web/src/lib/services/agentic-chat](../../apps/web/src/lib/services/agentic-chat)

Changes:

- Reject or sanitize string fields containing obvious internal tool syntax:
    - `<parameter name=`
    - `<tool_call`
    - `</parameter>`
    - other known tool-call artifacts
- Apply the check to task descriptions, document content/body markdown, project descriptions, goal descriptions, and other durable user-visible strings.
- Add tests around task/document descriptions and document content.
- Treat rejected markup writes as failed writes for final-response disclosure and retry handling.

### 4. Add A Project Write Surface

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

### 5. Backport Lite's Better Project Create Behavior

Target files:

- [master-prompt-builder.ts](../../apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts)
- prompt eval files under [apps/web/src/lib/services/agentic-chat-v2](../../apps/web/src/lib/services/agentic-chat-v2)

Changes:

- Add an eval for the exact "The Last Ember" seed.
- Assert 1 goal, 7 tasks, 1 context document.
- Assert tasks are linked under the goal.
- Assert no extra plans/milestones are invented.

### 6. Add Document Placement Guidance

Status: prompt guidance added for Lite and FastChat V2. The next replay should
verify whether the model actually follows it by creating and moving substantial
research notes into the document tree.

Target files:

- [build-lite-prompt.ts](../../apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts)
- [master-prompt-builder.ts](../../apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts)
- [document_workspace skill](../../apps/web/src/lib/services/agentic-chat/tools/skills/definitions/document_workspace/SKILL.md)

Changes:

- Short progress update: append to progress/context doc if one exists.
- Substantial named research notes: create a dedicated document.
- Use `get_document_tree` and `move_document_in_tree` when placing the doc.
- Avoid saying "linked" unless a link/edge was actually created.

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
- Durable text fields reject internal tool-call artifacts before persistence.
- Final answers mention every successful write that materially matters and do not claim task progress without a task write.
- Final answers do not claim a document type, tree placement, or graph link unless the successful tool result confirms it.
- Research notes become either a dedicated document or an explicitly accepted append, based on the chosen product rule.
- Dedicated research notes are placed in the document tree when the product rule says they should be organized under a context doc or research area.
- Token and cost deltas are recorded by prompt variant.

## Suggested Acceptance Criteria Before Wider Lite Rollout

- `lite_seed_v1` passes the fantasy-novel replay scenario without hidden failures.
- No `update_onto_document` append/merge call can execute without content. _(Covered by current tests; verify in replay.)_
- Empty `props: {}` no longer counts as an update field. _(Covered by current tests; verify in replay.)_
- Failed write results are surfaced in final assistant responses. _(Prompt language improved; ledger-enforced final prose still open.)_
- Tool-call markup artifacts cannot persist in task descriptions or document content. _(Validator/executor guard landed; verify in replay.)_
- Successful-write summaries are checked against the actual write set, so created tasks are not omitted and task progress is not claimed without an update.
- Document type and linking claims are checked against actual create/link/move results before the final response. _(Still needs ledger-grounded final-answer enforcement.)_
- Project create eval confirms one primary goal for outcome-style projects.
- Project follow-up turns do not require more than one discovery pass for common task/document writes.
- Trace summaries include all writes and all failures.
- Lite remains lower cost than fastchat on the same replay set.

## Historical Bottom Line

Lite should become the foundation, but not until write integrity is fixed at both failure and success boundaries. The April 16 reruns strengthen the case for lite on project-shape quality and show that the previous hidden failed document append is avoidable. They also weaken any argument that raw tool success is enough, because one successful document update polluted durable content and one successful task update polluted a task description with internal parameter markup.

The ac79 run adds nuance: a confirmation-first turn can improve capture quality for ambiguous progress updates, but it is not a replacement for validator and response-integrity fixes. The highest priority is not prompt polish. It is making the tool layer impossible to misuse in the observed ways: reject no-op append/merge calls, reject internal tool syntax before persistence, and force final responses to match the actual write set. After that, the next most important work is project-write surface routing and document-placement guidance.

## Post-Fix Update: 2026-04-16 Late Pass

This audit remains the historical baseline for the fantasy-novel flow. After
the write-integrity cleanup pass, several of the release-blocking issues above
now have code-level fixes and should be retested rather than treated as still
unaddressed.

Changes landed:

- `update_strategy` / `merge_instructions` are now document-only model-facing
  controls. They were removed from task, project, goal, and plan update tool
  schemas and from non-document executor merge logic.
- Invalid durable text replay is now redacted before the next model repair pass.
  If a tool call fails because a durable field contains internal tool syntax,
  the next model input receives a redacted placeholder instead of the bad
  string.
- FastChat V2 and Lite prompt paths now include temporal "bookend" guidance:
  pre-tool lead-ins are intent-only, and success/outcome claims wait until tool
  results are available.
- Document append/merge language in both prompts is now explicitly
  document-scoped, not a generic instruction for every update tool.
- Focused regression coverage was added for document-only strategy exposure,
  non-document direct updates, repair replay redaction, nested `props` redaction,
  and prompt bookend text.

Verification from the cleanup pass:

- Focused tests passed: 8 files, 50 tests.
- `git diff --check` passed on touched files.
- Full `pnpm run check` still fails on unrelated pre-existing repo-wide
  Svelte/type issues; no remaining failure was attributed to the write-integrity
  cleanup.

## Expected Next Testing Round

The next fantasy-novel replay should answer whether the new schema and repair
guardrails changed model behavior in practice.

Expected improvements:

- The model should no longer emit `update_strategy` on task, goal, project, or
  plan update calls because those schemas no longer expose that parameter.
- If the model still leaks internal tool syntax into a durable text field, the
  write should be blocked before persistence.
- The repair pass should not echo the rejected durable string back to the model.
  It should contain a validation fact and a redacted placeholder.
- Pre-tool text should read as "I will do X" rather than "I did X."
- Document append/merge calls should include non-empty document content, not
  only `merge_instructions`.

Things that may still fail and should be measured:

- Final answers can still overclaim if the model says a task advanced, a
  document was linked, or a document type persisted when the tool ledger does
  not support that claim. Ledger-rendered final prose remains open.
- The assistant may still omit successful writes from the final summary.
- The model may still overuse discovery/tool-schema calls for common
  project-document workflows.
- Dedicated research notes may still be created without tree placement unless
  the model calls `move_document_in_tree`.

Recommended acceptance checks for the next replay:

- No durable task/document/project/goal/plan field contains `<parameter`,
  `<tool_call`, `<function_call`, or `<arguments`.
- Any rejected durable write is either retried successfully or disclosed as not
  persisted.
- Task updates use direct replacement semantics and no document merge controls.
- Final response claims are checked against actual successful writes,
  especially task progress, document type, tree placement, and link/cross-link
  language.
- Token and tool-call counts are recorded so the cleanup can be evaluated
  against the prior lite reruns, not only qualitatively.
