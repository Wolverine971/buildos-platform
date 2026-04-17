<!-- docs/reports/agentic-chat-fastchat-vs-lite-fantasy-novel-flow-audit-2026-04-15.md -->

# Agentic Chat Fastchat vs Lite Flow Audit

Date: 2026-04-15
Updated: 2026-04-16

> **Post-consolidation note (2026-04-16).** The `fastchat_prompt_v1` builder has been removed. `lite_seed_v1` is now the only runtime prompt path. The historical fastchat columns in this audit remain as a baseline for cost, reliability, and write-integrity comparisons; the "variant A vs variant B" framing no longer reflects live behavior. See the consolidation spec: [docs/specs/agentic-chat-lite-prompt-consolidation-2026-04-16.md](../specs/agentic-chat-lite-prompt-consolidation-2026-04-16.md). The `13fc` post-fix lite replay below is the live baseline going forward.

Scope: audit of agentic chat sessions for the same fantasy-novel project creation and follow-up workflow. The original comparison covered one full standard fastchat run and one full lite run. This update adds two 2026-04-16 lite reruns, one four-turn confirmation-flow run, a later post-fix fastchat replay, and a later post-fix lite replay. It also notes one earlier one-turn fastchat repair pilot for context.

## Primary Sources

- Fastchat session audit: [chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-09e3ca0b-8163-47-2026-04-15.md](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-09e3ca0b-8163-47-2026-04-15.md)
- Lite session audit: [chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-5e74e634-0992-49-2026-04-15.md](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-5e74e634-0992-49-2026-04-15.md)
- Lite rerun session audit: [chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-74a4f0ef-9607-4e-2026-04-16.md](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-74a4f0ef-9607-4e-2026-04-16.md)
- Lite confirmation-flow session audit: [chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-ac79da05-7120-4b-2026-04-16.md](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-ac79da05-7120-4b-2026-04-16.md)
- Post-fix fastchat replay audit: [chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-875b3470-7831-48-2026-04-16.md](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-875b3470-7831-48-2026-04-16.md)
- Post-fix lite replay audit: [chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-13fc9ea8-13d7-4a-2026-04-16.md](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-13fc9ea8-13d7-4a-2026-04-16.md)
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

A later post-fix fastchat replay, `875b3470`, is the first real-world check after the late-pass write-integrity cleanup. It is materially better than the original fastchat run: 3 turns, 11 tool calls, 0 failures, 116,001 tokens, and `$0.03860488`. It created the primary goal, avoided internal-markup persistence, used a valid document append with content, and created the magic research document with `document.knowledge.research` preserved. The main remaining failure moved up the stack: final responses still did not match the successful write set. The Chapter 2 response omitted the successful context-document update and did not name either created task; the magic-system response omitted the newly created research document entirely.

A post-fix lite replay, `13fc9ea8`, is now the strongest full run on combined cost and reliability: 3 turns, 10 tool calls, 0 failures, 78,438 tokens, and `$0.02187023`. Compared with `875b3470`, it used 32.4% fewer tokens and cost 43.3% less. It preserved the main project graph, used a valid Chapter 2 append, avoided markup persistence, preserved the research document type, and gave the best Chapter 2 final-response grounding so far. Remaining issues are narrower but still important: the initial response said "7 Tasks" but listed only four, the outline task received description detail but stayed `todo`, the magic-system turn created a clean document but did not update related tasks, and the final "nested under overview" claim depends on the `parent_id` create contract rather than a separate tree verification.

Late-pass implementation notes and the first post-fix replay results are recorded in
[Post-Fix Update: 2026-04-16 Late Pass](#post-fix-update-2026-04-16-late-pass),
[Post-Fix Replay Result: 875b3470](#post-fix-replay-result-875b3470), and
[Post-Fix Replay Result: 13fc9ea8](#post-fix-replay-result-13fc9ea8).

## Which File Was Which

| File                                                                                                                       |       Prompt variant | Outcome                                                                                      |  Tokens |          Cost |          Errors |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------: | -------------------------------------------------------------------------------------------- | ------: | ------------: | --------------: |
| [3f288e0f audit](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-3f288e0f-a385-43-2026-04-15.md) | `fastchat_prompt_v1` | One-turn pilot. First create failed on invalid `type_key`, then repaired and succeeded       |  21,834 |  `$0.0060579` |  1 tool failure |
| [09e3ca0b audit](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-09e3ca0b-8163-47-2026-04-15.md) | `fastchat_prompt_v1` | Full flow. No tool failures, but missed the primary project goal                             | 143,388 |  `$0.0522584` | 0 tool failures |
| [5e74e634 audit](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-5e74e634-0992-49-2026-04-15.md) |       `lite_seed_v1` | Full flow. Better project structure, but one hidden failed document update                   | 118,687 | `$0.03410443` |  1 tool failure |
| [74a4f0ef audit](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-74a4f0ef-9607-4e-2026-04-16.md) |       `lite_seed_v1` | Full rerun. No failed tools and then-cheapest run, but persisted tool markup in document content | 106,280 |  `$0.0302656` | 0 tool failures |
| [ac79da05 audit](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-ac79da05-7120-4b-2026-04-16.md) |       `lite_seed_v1` | Four-turn confirmation flow. Best Chapter 2 doc capture, but persisted tool markup in a task | 123,727 | `$0.04469285` | 0 tool failures |
| [875b3470 audit](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-875b3470-7831-48-2026-04-16.md)  | `fastchat_prompt_v1` | Post-fix replay. No failed tools or markup leak, but final responses omitted key writes      | 116,001 | `$0.03860488` | 0 tool failures |
| [13fc9ea8 audit](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-13fc9ea8-13d7-4a-2026-04-16.md) |       `lite_seed_v1` | Post-fix replay. Cheapest clean full run; best Chapter 2 grounding, weaker magic task coverage |  78,438 | `$0.02187023` | 0 tool failures |

The April 15 lite run reduced tokens by about 17.2% and cost by about 34.8% versus the full fastchat run, despite taking a failed-tool path and making more tool calls.

The April 16 lite rerun improved that further: about 25.9% fewer tokens and 42.1% lower cost than full fastchat, and about 10.5% fewer tokens and 11.3% lower cost than the April 15 lite run. The earlier 3f288e0f run is useful as a repair-policy datapoint, but it is only one turn and should not be compared directly to the three-turn totals.

The ac79da05 run is also not a clean apples-to-apples cost comparison because it includes an extra user confirmation turn. It still cost less than the full fastchat run, but it was materially more expensive than the three-turn April 16 lite rerun.

The 875b3470 post-fix fastchat replay is directly comparable to the three-turn full runs. It is about 19.1% fewer tokens and 26.1% lower cost than the original fastchat run. It is also slightly fewer tokens than the April 15 lite run, but still more expensive than both three-turn lite runs.

The 13fc9ea8 post-fix lite replay is the new cost baseline among full three-turn runs. It is about 45.3% fewer tokens and 58.1% lower cost than the original fastchat run, 26.2% fewer tokens and 27.7% lower cost than the 74a4 lite rerun, and 32.4% fewer tokens and 43.3% lower cost than the post-fix fastchat replay.

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
| Token efficiency            | 143,388 tokens                                          | 118,687 tokens                                                        | 106,280 tokens                                                                   | Apr 16 was cheapest among the historical three-column runs                   |
| Tool discovery overhead     | Heavy skill/schema/tool-search use                      | Still significant discovery use                                       | Lower total calls, but still loaded examples and fetched unused document schema  | Project write/document surfaces still need tuning                            |

The ac79 confirmation-flow run is excluded from this three-column comparison table because it added an extra user confirmation turn. Compared with the three-turn 74a4 rerun, ac79 improved Chapter 2 document capture but regressed cost and repeated the internal-markup persistence bug in a task description.

The 875 post-fix fastchat replay is also excluded from this historical three-column table because it tested a later implementation state. Compared with the original fastchat run, it fixed goal extraction, reduced cost/tool calls, avoided markup pollution, and preserved the requested magic-document type. Compared with the best lite rerun, it was still more expensive and weaker on final prose.

The 13fc post-fix lite replay is also excluded from the historical three-column table for the same reason. It should now be treated as the strongest post-fix lite datapoint: cheaper than every prior full run, clean on the observed P0 write-integrity failures, better than 875 on Chapter 2 final-response grounding, but weaker than 875 on magic-system task updates.

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

## April 16 875 Fastchat Post-Fix Replay Reassessment

The 875b3470 run used `fastchat_prompt_v1`, but it is not the same behavioral baseline as the original 09e3ca0b fastchat run. The prompt and tool guidance had late-pass write-integrity changes, including document-only update strategy language, stronger document placement rules, and stricter intent-before-tool / outcome-after-tool guidance.

### 875 Verdict

This replay is better than the original fastchat run and better than the polluted April 16 lite reruns on write integrity. It created the goal, wrote a valid progress append, created a dedicated magic-system document with the requested research type preserved, and did not persist internal tool markup.

It is not a clean pass. The remaining user-trust issue is final-answer integrity. The assistant performed useful writes, but the final prose omitted material successful writes. That means the next architectural fix should prioritize a write-outcome ledger or deterministic final-response constraints, not more prompt-only wording.

### Turn 1: Project Creation

875 fixed the original fastchat project-shape failure. It created project `0eb834f6-9393-486b-811e-363f71dcfeed` with 1 goal, 7 tasks, 1 context document, and 9 edges. The goal was "Write the fantasy novel 'The Last Ember'", and the seven requested work items became tasks linked under that goal.

This is a meaningful improvement over the original fastchat run, which created 0 goals. The final response also summarized all seven task areas correctly.

### Turn 2: Chapter 2 Progress

The Chapter 2 turn showed several improvements:

- It appended a clean "Writing Progress - 2026-04-16" section to the context document with actual `content`.
- It did not repeat the no-content append failure.
- It did not persist internal tool markup.
- It created "Revise Chapter 2" and "Draft Chapter 3" tasks under the main goal.
- It used compact `task_management` skill output.

The remaining weaknesses are important:

- It did not update "Outline first three chapters" to `in_progress`, even though Chapter 2 was complete and Chapter 3 plans were supplied.
- The final response said "Created two new tasks under the main goal:" but did not name either task.
- The final response omitted the successful context-document update entirely.
- The compact trace summary collapsed two task creates into a single `onto.task.create:ok` entry.

This is a better write path than the original lite failure, but still not a good final user experience.

### Turn 3: Magic System Research Notes

The magic-system turn was the strongest document-write result so far:

- It created a dedicated "Magic System Research Notes" document.
- The requested `document.knowledge.research` type persisted correctly.
- The create call included `parent_id` for the context document.
- It updated the "Create magic system based on metal and fire" and "Research medieval blacksmithing techniques" tasks to `in_progress`.
- It did not leak `<parameter name=...>` or other internal tool syntax into durable text.

Remaining issues:

- The final response omitted the new "Magic System Research Notes" document and only reported the task state changes.
- The trace does not include a separate `get_document_tree` or `move_document_in_tree` call. If `parent_id` on create is the supported placement contract, this is fine; if not, document placement still needs explicit verification.
- The assistant did not update "Map out the kingdom of Aethermoor" despite world-building additions about regional forging techniques across Aethermoor.

The post-fix replay therefore confirms the P0 write-integrity fixes are moving in the right direction, but it also confirms that final-response grounding remains open.

## April 16 13fc Lite Post-Fix Replay Reassessment

The 13fc9ea8 run used `lite_seed_v1` after the same late-pass cleanup period. It is directly comparable to the full three-turn fantasy-novel runs and is the first post-fix lite replay in this audit set.

### 13fc Verdict

This is the best overall full run so far if the product weights cost, raw reliability, and user-facing response accuracy together. It completed the scenario with 10 tool calls, 0 failures, no observed internal-markup persistence, a valid document append, and a clean dedicated magic-system research document. It also gave the best Chapter 2 final answer because it explicitly named the document update, both new tasks, and the existing task it updated.

It is not a full pass. The remaining issues are less catastrophic than the earlier P0 failures but still product-relevant: initial task summary completeness, task-state coverage, related-task coverage on the magic-system turn, mild content overreach around Elena's canonical age, and document-placement confirmation semantics.

### Turn 1: Project Creation

13fc created project `04af5167-e41f-4d10-931b-c257c12767bb` with 1 goal, 7 tasks, 1 context document, and 9 edges. The goal was "Complete first draft of 'The Last Ember'", and the seven requested work items were persisted as tasks under the goal.

This matches or beats every earlier full run on project graph shape. The remaining weakness is only in the final prose: the assistant said "7 Tasks" but listed four task areas, omitting the backstory, magic-system, and antagonist-profile tasks from the visible summary even though they were persisted.

### Turn 2: Chapter 2 Progress

This was the strongest Chapter 2 turn among the three-turn runs:

- It appended progress to "The Last Ember - Project Overview" with non-empty `content`.
- It created "Revise Chapter 2: Strengthen dialogue, pacing, sensory details, and fix continuity".
- It created "Write Chapter 3".
- It updated "Outline first three chapters" with Chapter 3 details.
- The final response reported the document update, named both created tasks, and named the updated outline task.

Remaining issues:

- The outline task stayed `todo`; the update only changed its description.
- The revision task chose "standardize to 17" for Elena's age. The user reported a continuity conflict between 16 and 17 but did not specify which value was canonical, so the agent should record the conflict without deciding canon unless it frames the value as a recommendation.
- The turn still used two `tool_search` calls for ordinary task create/update work. That is better than the earlier discovery-heavy traces, but the project follow-up path still needs a more direct write surface or routing heuristic.

### Turn 3: Magic System Research Notes

The magic-system document write was clean:

- It created "Magic System and World-Building Research Notes".
- The persisted type was `document.knowledge.research`.
- The content captured the emotion-forged-weapons concept, research directions, and Aethermoor world-building additions.
- The create arguments included `parent_id`, `parent`, and `parents` pointing at "The Last Ember - Project Overview".
- The final response accurately reported the created document and persisted type.

Remaining issues:

- No related task was updated. The existing magic-system task stayed untouched, and the blacksmithing/Aethermoor tasks were also plausible updates given the content.
- The final response said the document was nested under the overview. That is probably correct if `parent_id` on `create_onto_document` is the supported placement contract, but the result did not echo parent placement and the trace did not perform a separate tree read/move verification.
- Compared with 875, this run was cheaper and had better final-response grounding, but 875 had better magic-system task progress because it updated the magic-system and blacksmithing tasks.

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

### April 16 875 Fastchat Post-Fix Tool Call Evaluation

| Turn | Tool/action                                      | Verdict         | Notes                                                                                                                                                 |
| ---: | ------------------------------------------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | `create_onto_project`                            | Proper          | Correct project skeleton: 1 goal, 7 tasks, 1 document, 9 edges. This fixes the original fastchat no-goal failure.                                    |
|    1 | Final response                                   | Proper          | Reported the project, goal, all seven task areas, context document, and project scope accurately.                                                     |
|    2 | `update_onto_document` progress append           | Proper          | Correct target and valid append with non-empty `content`. No no-content append failure and no markup artifact.                                       |
|    2 | `skill_load(task_management, short)`             | Proper          | Compact skill load was appropriate for task creation/update guidance.                                                                                 |
|    2 | `list_onto_tasks`                                | Proper          | Needed to identify existing tasks and IDs.                                                                                                           |
|    2 | Two `tool_search` calls for task create/update   | Mostly proper   | Lower discovery overhead than earlier runs, but still points to the project write-surface gap for common follow-up turns.                             |
|    2 | `create_onto_task` for Chapter 2 revision        | Proper          | Correct task with dialogue, pacing, sensory detail, and age-continuity fix.                                                                           |
|    2 | `create_onto_task` for Chapter 3 draft           | Proper          | Correct task with forging attempt, herald, and prophecy details.                                                                                      |
|    2 | No `update_onto_task` for outline progress       | Missing         | "Outline first three chapters" should have moved to `in_progress`, as the best lite runs did.                                                        |
|    2 | Final response                                   | Mostly improper | It said two tasks were created but did not name them, and omitted the successful context-document update.                                             |
|    3 | `create_onto_document` for magic notes           | Proper          | Best document-create result so far: dedicated research doc, clean content, requested `document.knowledge.research` persisted, and `parent_id` passed. |
|    3 | `update_onto_task` for magic-system task         | Proper          | Correctly moved the magic-system task to `in_progress` without description pollution.                                                                 |
|    3 | `update_onto_task` for blacksmithing task        | Proper          | Correctly moved the blacksmithing research task to `in_progress`.                                                                                    |
|    3 | No update for Aethermoor/map task                | Missing/optional | World-building notes included regional forging differences across Aethermoor, so the map/world task was a plausible related update.                 |
|    3 | No explicit tree read/move                       | Unclear         | The create call included `parent_id`; if create supports placement this is fine, but the trace does not independently verify tree placement.          |
|    3 | Final response                                   | Improper        | It omitted the successfully created "Magic System Research Notes" document and reported only task state changes.                                      |

### April 16 13fc Lite Post-Fix Tool Call Evaluation

| Turn | Tool/action                                      | Verdict          | Notes                                                                                                                                                                        |
| ---: | ------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | `create_onto_project`                            | Proper           | Correct project skeleton: 1 goal, 7 tasks, 1 document, 9 edges. All seven user bullets became tasks under the goal.                                                          |
|    1 | Final response                                   | Mostly proper    | It correctly reported the project, goal, document, and "7 Tasks", but listed only four task areas in prose.                                                                  |
|    2 | `update_onto_document` progress append           | Proper           | Correct target and valid append with non-empty `content`. No no-content append failure and no markup artifact.                                                               |
|    2 | Two `tool_search` calls for task create/update   | Mostly proper    | The calls found the needed write tools, but they are still unnecessary overhead for a routine project follow-up.                                                              |
|    2 | `list_onto_tasks`                                | Proper           | Needed to identify the existing outline task and goal-linked project tasks.                                                                                                  |
|    2 | `create_onto_task` for Chapter 2 revision        | Mostly proper    | Correct durable follow-up. Minor content overreach: the description chose "standardize to 17" when the user only reported an age-continuity conflict.                       |
|    2 | `update_onto_task` for outline details           | Mostly proper    | Correct target and useful Chapter 3 detail, but the task remained `todo`; it did not move to `in_progress`.                                                                  |
|    2 | `create_onto_task` for Chapter 3 draft           | Proper           | Correct follow-up task with useful description and goal link.                                                                                                                |
|    2 | Final response                                   | Proper           | Best Chapter 2 grounding so far: it mentioned the document update, named both created tasks, and named the updated outline task without claiming a state change.              |
|    3 | `create_onto_document` for magic/world notes     | Proper           | Clean dedicated document, useful content, requested `document.knowledge.research` persisted, and parent metadata was passed.                                                 |
|    3 | No related task updates                          | Missing/optional | The magic-system, blacksmithing, and Aethermoor/world tasks were plausible updates based on the research content, but no task write occurred.                                |
|    3 | No explicit tree read/move                       | Unclear          | The create call passed `parent_id`, `parent`, and `parents`; if create supports placement this is fine, but the result did not independently confirm parent placement.        |
|    3 | Final response                                   | Mostly proper    | It accurately reported the created document and persisted type. The "nested under Project Overview" claim depends on the create-parent contract rather than a confirmed tree read. |

## Specific Findings

### P0: Successful Writes Can Persist Internal Tool Markup

Status after 2026-04-16 late pass: the durable-text validator and executor
backstop now reject this class before persistence, and repair replay redacts
the rejected string before the next model pass. The next test should verify
that the model either avoids the artifact entirely or retries cleanly after a
validation failure.

875 replay result: the post-fix fastchat replay did not reproduce the markup
artifact. The valid document append, task creates, task updates, and research
document create all persisted clean text. Keep this as a release-blocking
regression check because earlier sessions proved the failure can be silent and
durable.

13fc replay result: the post-fix lite replay also did not reproduce the markup
artifact. The valid document append, task creates/update, and research document
create all persisted clean text. This is the first lite replay in this audit set
that is both cheaper than the earlier lite reruns and clean on observed durable
markup.

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

875 replay result: the Chapter 2 progress turn used the desired shape: non-empty
`content` plus `update_strategy: "append"` and `merge_instructions`. The append
succeeded and preserved existing context-document content.

13fc replay result: the Chapter 2 progress turn also used the desired append
shape with non-empty `content`, succeeded, and did not leak internal markup into
the document body.

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

875 replay result: there were no failed writes to disclose. However, the same
final-response integrity gap appeared in a different form: successful writes
were omitted from the final responses. That means failed-write disclosure should
be treated as one case of a broader write-ledger finalization problem.

### P0/P1: Final Responses Still Do Not Match The Successful Write Set

The 875 post-fix replay proves that prompt bookend guidance is not enough.
After successful writes, the assistant still failed to summarize what actually
happened:

- Turn 2 successfully appended Chapter 2 progress to the context document and
  created two tasks, but the final response only said "Created two new tasks"
  and did not name them or mention the document update.
- Turn 3 successfully created "Magic System Research Notes" and updated two
  tasks, but the final response omitted the new document entirely.

This is not a tool-execution failure. It is a finalization/grounding failure.

Recommendation:

- Add or reuse a per-turn write-outcome ledger.
- Before final answer generation, inject a compact list of material successful
  writes, failed writes, normalized fields, and warnings.
- Add deterministic tests that final prose mentions material successful writes
  and does not claim unsupported updates, links, or document types.

13fc replay result: the post-fix lite path improved this materially but did not
close it. Turn 2 is the best example so far of final prose matching the write
set, but Turn 1 still listed only four of seven tasks in the visible summary and
Turn 3 made a placement claim that depends on the `parent_id` create contract
rather than a confirmed tree result.

### P1: Fastchat Missed The Initial Goal

Fastchat created no goal even though the user clearly stated an outcome: starting and developing the fantasy novel "The Last Ember".

The prompt already says that a project creation flow should add one goal when the user states an outcome. The lite run did exactly that. This looks like an instruction salience or eval gap, not a missing product capability.

Recommendation:

- Add this exact fantasy-novel seed to prompt evals.
- Assert the create payload includes exactly one primary goal.
- Assert the seven user-provided bullets become tasks.
- Assert the goal contains or relates to the tasks.
- Consider making the project creation schema/examples emphasize "goal plus concrete task children" more strongly.

875 replay result: this issue appears fixed for the post-fix fastchat path. The
replay created one primary goal, seven tasks, one context document, and nine
edges.

13fc replay result: the post-fix lite path also created one primary goal, seven
tasks, one context document, and nine edges. The graph shape is no longer the
active issue for this scenario.

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

875 replay result: discovery overhead improved but did not disappear. The full
three-turn replay used 11 tool calls, down from 20 in the original fastchat run,
but the Chapter 2 turn still needed two `tool_search` calls for ordinary task
create/update work.

13fc replay result: total overhead improved again to 10 tool calls, but the
Chapter 2 turn still used two `tool_search` calls for ordinary task create/update
work. That makes the issue a routing/surface design problem, not just a
fastchat-prompt problem.

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
- 875 Turn 2 summary includes the document update and task-create category, but collapses two task creates into one `onto.task.create:ok` entry. 875 Turn 3 summary is better because it lists all three writes.
- 13fc Turn 2 summary includes the document update and task-create category, but again collapses two task creates into one `onto.task.create:ok` entry and omits the final list. 13fc Turn 3 summary is accurate because there was only one write.

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

875 replay result: the post-fix fastchat path produced the strongest research
document create result so far. It created a dedicated research document, the
requested `document.knowledge.research` type persisted, and the call included
`parent_id` for the context document. The remaining question is whether
`parent_id` on create is the supported placement contract or whether tree
placement still needs an explicit read/move operation.

13fc replay result: the post-fix lite path matched the strongest document-create
shape: a dedicated research/world-building document, clean content, persisted
`document.knowledge.research`, and parent metadata passed on create. The same
placement-contract question remains because the trace did not include a separate
tree read/move and the result did not echo parent placement.

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

875 replay result: this improved in the post-fix fastchat path. "Magic System
Research Notes" requested `document.knowledge.research`, and the result
persisted `document.knowledge.research`.

13fc replay result: the post-fix lite path also persisted
`document.knowledge.research` for "Magic System and World-Building Research
Notes". This suggests the earlier mismatch may now be fixed or avoided for the
post-fix write path, but it should remain in replay assertions until type
normalization is understood.

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
- The 875 post-fix fastchat replay fixed the original fastchat no-goal failure: it created one goal, seven tasks, one document, and nine edges.
- The 875 replay did not reproduce the internal-markup persistence bug.
- The 875 replay used a valid document append for Chapter 2 progress with actual content and no hidden failed write.
- The 875 magic-system document persisted as `document.knowledge.research`, unlike the earlier type-normalization failures.
- The 875 final responses still omitted material successful writes: Turn 2 omitted the context-document update and task names, and Turn 3 omitted the created magic-system research document.
- The 875 replay still missed updating the existing "Outline first three chapters" task on the Chapter 2 turn.
- The 875 replay reduced original fastchat cost and tool calls, but it was still more expensive than the three-turn lite reruns.
- Fastchat's Turn 3 final answer may overstate "cross-linked" because no actual semantic link call is visible.
- The 13fc post-fix lite replay is now the cheapest full run: 78,438 tokens and `$0.02187023`.
- The 13fc replay did not reproduce the no-content append, durable-markup, or document-type mismatch failures.
- The 13fc Chapter 2 final response was the best grounded response so far: it mentioned the document append, named both created tasks, and named the updated outline task.
- The 13fc replay still left "Outline first three chapters" in `todo`; it updated the description but not the task state.
- The 13fc revision task decided to standardize Elena's age to 17 even though the user only reported a 16/17 continuity conflict.
- The 13fc magic-system turn created a clean dedicated document but did not update the existing magic-system, blacksmithing, or Aethermoor tasks.
- The 13fc magic-system final answer claimed the document was nested under the project overview. The create arguments passed parent metadata, but the trace did not independently verify tree placement.
- The 13fc run shows that lite can beat post-fix fastchat on cost and final-response grounding while still needing better related-task coverage and write-surface routing.
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

875 replay priority adjustment: the post-fix fastchat replay did not reproduce
the invalid append, document type, or markup-persistence failures. Those should
remain release-blocking regression gates. The highest remaining active gap is
final-response grounding against the actual write set.

13fc replay priority adjustment: the post-fix lite replay is now the best
candidate baseline. It keeps the P0 write-integrity fixes intact while cutting
cost substantially. The active fix list should therefore shift toward
architectural polish that makes the good path reliable: ledger-grounded final
responses, direct project-write routing, task-state/related-task coverage, and
confirmed document placement semantics.

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

### 4. Add A Write Outcome Ledger For Final Responses

Status: still open. The 875 replay showed successful writes being omitted from
final prose even after prompt bookend guidance improved.

13fc update: Turn 2 shows the desired behavior, but Turn 1 task-summary
incompleteness and Turn 3 placement wording still support keeping this open.

Target files:

- [stream endpoint](../../apps/web/src/routes/api/agent/v2/stream/+server.ts)
- [stream orchestrator](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/README.md) and implementation files under the same directory
- prompt observability/finalization files under [apps/web/src/lib/services/agentic-chat-v2](../../apps/web/src/lib/services/agentic-chat-v2)

Changes:

- Track every material write result in a per-turn write outcome ledger.
- Include successful writes, failed writes, validation rejections, normalized
  result fields, and warnings.
- Inject or render this ledger before final answer generation so final prose
  cannot omit material writes or claim unsupported writes.
- Add tests for omitted successful document creates, omitted document updates,
  unsupported task-progress claims, unsupported document type claims, and
  unsupported link/tree-placement language.

### 5. Add A Project Write Surface

Status after 13fc: still open. The post-fix lite replay had the lowest tool
count so far, but still used discovery for ordinary task create/update work.

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

### 6. Backport Lite's Better Project Create Behavior

Status: appears fixed for post-fix fastchat based on the 875 replay, but should
remain in formal replay coverage.

Target files:

- [master-prompt-builder.ts](../../apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts)
- prompt eval files under [apps/web/src/lib/services/agentic-chat-v2](../../apps/web/src/lib/services/agentic-chat-v2)

Changes:

- Add an eval for the exact "The Last Ember" seed.
- Assert 1 goal, 7 tasks, 1 context document.
- Assert tasks are linked under the goal.
- Assert no extra plans/milestones are invented.

### 7. Add Document Placement Guidance

Status: prompt guidance added for Lite and FastChat V2. The next replay should
verify whether the model actually follows it by creating and moving substantial
research notes into the document tree.

13fc update: Lite now creates the right dedicated document and passes parent
metadata on create. The remaining architectural decision is whether that is the
official placement contract or whether the agent should still verify/place with
document-tree tools.

Target files:

- [build-lite-prompt.ts](../../apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts)
- [master-prompt-builder.ts](../../apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts)
- [document_workspace skill](../../apps/web/src/lib/services/agentic-chat/tools/skills/definitions/document_workspace/SKILL.md)

Changes:

- Short progress update: append to progress/context doc if one exists.
- Substantial named research notes: create a dedicated document.
- Use `get_document_tree` and `move_document_in_tree` when placing the doc.
- Avoid saying "linked" unless a link/edge was actually created.

### 8. Improve Tool Trace Summaries

Target files:

- [stream endpoint](../../apps/web/src/routes/api/agent/v2/stream/+server.ts)
- prompt observability files under [apps/web/src/lib/services/agentic-chat-v2](../../apps/web/src/lib/services/agentic-chat-v2)

Changes:

- Include every write and every failure in the summary.
- Separate discovery/schema calls from actual write operations.
- Include counts by kind: reads, writes, discovery, failures.
- Do not truncate away failures.

### 9. Add Formal Replay/Eval Coverage

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
- The post-fix `fastchat_prompt_v1` and `lite_seed_v1` replay set both pass the write-integrity checks.
- No `update_onto_document` append/merge call can execute without content. _(Covered by current tests; verify in replay.)_
- Empty `props: {}` no longer counts as an update field. _(Covered by current tests; verify in replay.)_
- Failed write results are surfaced in final assistant responses. _(Prompt language improved; ledger-enforced final prose still open.)_
- Tool-call markup artifacts cannot persist in task descriptions or document content. _(Validator/executor guard landed; verify in replay.)_
- Successful-write summaries are checked against the actual write set, so created tasks/documents are not omitted and task progress is not claimed without an update. _(Improved in 13fc Turn 2, still open because task summaries and placement claims need ledger grounding.)_
- Document type and linking/placement claims are checked against actual create/link/move results before the final response. _(Document type improved in 875 and 13fc; placement semantics still need explicit confirmation.)_
- Project create eval confirms one primary goal for outcome-style projects.
- Project follow-up turns do not require more than one discovery pass for common task/document writes.
- Trace summaries include all writes and all failures.
- Lite remains lower cost than fastchat on the same replay set.

## Historical Bottom Line

Lite should become the foundation, but not until write integrity is fixed at both failure and success boundaries. The April 16 reruns strengthen the case for lite on project-shape quality and show that the previous hidden failed document append is avoidable. They also weaken any argument that raw tool success is enough, because one successful document update polluted durable content and one successful task update polluted a task description with internal parameter markup.

The ac79 run adds nuance: a confirmation-first turn can improve capture quality for ambiguous progress updates, but it is not a replacement for validator and response-integrity fixes. The highest priority is not prompt polish. It is making the tool layer impossible to misuse in the observed ways: reject no-op append/merge calls, reject internal tool syntax before persistence, and force final responses to match the actual write set. After that, the next most important work is project-write surface routing and document-placement guidance.

The 13fc post-fix lite replay changes the near-term recommendation: lite should remain the preferred direction and is now the best candidate baseline, but the work should not stop at P0 write-integrity gates. The next layer is making the good behavior deterministic: final prose grounded in the actual write ledger, ordinary project writes available without discovery, task-state updates applied when work clearly advances, and document placement claims backed by an explicit contract or tree result.

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

## Post-Fix Replay Result: 875b3470

The 875b3470 replay is the first fantasy-novel run after the late-pass cleanup.
It used `fastchat_prompt_v1`, completed the same three-turn scenario, and
reported 0 tool failures.

Confirmed improvements:

- Project creation now includes the primary goal, seven tasks, one context
  document, and goal-task relationships.
- Chapter 2 progress used a valid document append with non-empty `content`.
- No durable field in the inspected trace contained `<parameter name=...>` or a
  similar internal tool artifact.
- "Magic System Research Notes" persisted as `document.knowledge.research`.
- Tool calls fell from 20 in the original fastchat run to 11, and cost fell from
  `$0.0522584` to `$0.03860488`.

Remaining failures:

- Final responses still omitted material successful writes. Turn 2 omitted the
  context-document update and did not name the two created tasks. Turn 3 omitted
  the created magic-system research document.
- Chapter 2 still did not update the existing "Outline first three chapters"
  task to `in_progress`.
- Turn 2 still needed discovery for ordinary task create/update work.
- Turn 2 trace summary still collapsed multiple task creates into one compact
  category entry.
- Document placement is better but should be verified architecturally: the
  research document create call included `parent_id`, but there was no separate
  tree read/move operation in the trace.

Current bottom line after 875: write-integrity fixes appear to be working for
this replay, but final-answer grounding is now the highest-priority active
failure.

## Post-Fix Replay Result: 13fc9ea8

The 13fc9ea8 replay is the first post-fix lite replay in this audit set. It
used `lite_seed_v1`, completed the same three-turn scenario, and reported 0 tool
failures.

Confirmed improvements:

- It is the cheapest full run so far: 78,438 tokens and `$0.02187023`.
- Project creation included the primary goal, seven tasks, one context document,
  and goal-task relationships.
- Chapter 2 progress used a valid document append with non-empty `content`.
- No durable field in the inspected trace contained `<parameter name=...>` or a
  similar internal tool artifact.
- "Magic System and World-Building Research Notes" persisted as
  `document.knowledge.research`.
- The Chapter 2 final response matched the write set better than any prior full
  run: it mentioned the context-document update, named both created tasks, and
  named the updated outline task.

Remaining failures or gaps:

- The Turn 1 final response said "7 Tasks" but visibly listed only four task
  areas.
- The Chapter 2 outline update added useful details but left the task state as
  `todo`.
- The Chapter 2 revision task chose a canon age of 17 from a user-reported
  16/17 continuity conflict.
- The magic-system turn created a clean document but did not update related
  magic-system, blacksmithing, or Aethermoor/world tasks.
- The magic-system final response said the new document was nested under the
  project overview. The create call passed parent metadata, but the tool result
  did not independently confirm placement and no separate tree read/move ran.
- The Chapter 2 trace summary still collapsed multiple task creates into one
  compact `onto.task.create:ok` entry.

Current bottom line after 13fc: lite is the strongest current candidate on cost,
write integrity, and Chapter 2 user-facing grounding. The remaining work is no
longer mainly "stop bad writes"; it is "make the good write path complete and
architecturally verified."

## Post-Fix Update: 2026-04-16 Second Late Pass

After the 875 and 13fc replays this audit set named final-answer grounding,
task-state coverage, document placement, and discovery overhead on mixed
project turns as the next active gaps. Those items now have code-level fixes
and should be re-tested rather than treated as open.

Changes landed (six items):

1. **Surface routing union.** A new `project_write_document` gateway profile
   unions `project_write` (task writes) and `project_document` (document
   workspace tools). `tool-selector.ts` now routes to that union when the user
   message matches BOTH the mutation regex and the document-write regex, which
   was the root cause of the residual `tool_search` on 875 Turn 2 and 13fc
   Turn 2. Prompt-dump inspection showed both runs landed on `project_document`
   (14 tools, no task writes) even though the turn needed both kinds of writes.
   Relevant files:
    - [gateway-surface.ts](../../apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts)
    - [tool-selector.ts](../../apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts)
    - [tool-selector.test.ts](../../apps/web/src/lib/services/agentic-chat-v2/tool-selector.test.ts)
2. **Write-outcome ledger.** New
   [write-ledger.ts](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/write-ledger.ts)
   builds a structured ledger from cumulative `toolExecutions` after each tool
   round, extracting entity id, title, state_key, type_key, parent_id, and
   update_strategy from args and results. The ledger is injected as a system
   message in
   [stream-orchestrator/index.ts](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts)
   right after tool results are pushed to `messages`, so the model's next
   response (including the final-answer turn) sees an authoritative "what
   actually happened" summary plus explicit final-response rules. New
   [write-ledger.test.ts](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/write-ledger.test.ts)
   covers successes, failures, strategy extraction, move placement, and
   filtering of non-write tools.
3. **Task-state coverage rule.** Both prompts now instruct the model to
   include `state_key` on `update_onto_task` when a task's real-world work
   visibly advanced, not just update the description. Also: record
   user-reported inconsistencies (e.g. "Chapter 1 says 16, Chapter 2 says 17")
   as open questions or fix tasks rather than picking canon. See
   [build-lite-prompt.ts](../../apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts)
   and the new "Task state coverage" subsection in
   [master-prompt-builder.ts](../../apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts).
4. **Document placement contract decided.** `parent_id` on
   `onto.document.create` is NOT the placement contract. The model must now
   call `onto.document.tree.move` after create to actually nest a document,
   and must claim "nested under X" only after the move succeeds. Both prompts
   and the
   [document_workspace SKILL.md](../../apps/web/src/lib/services/agentic-chat/tools/skills/definitions/document_workspace/SKILL.md)
   playbook now teach the two-step create → move flow explicitly, including a
   worked example.
5. **Lite post-tool bookend parity.** Lite safety now has the explicit
   post-tool bookend rule that fastchat already had: "After tool calls
   complete, ground the final user-facing summary in the actual tool results…
   Do not carry optimistic lead-in language into the outcome."
6. **Trace summary completeness.** `buildPersistedToolTraceSummary` in
   [+server.ts](../../apps/web/src/routes/api/agent/v2/stream/+server.ts) no
   longer slices to the first six calls and no longer collapses multiple
   creates into one category entry. It now classifies calls as writes /
   discovery-reads / other, shows success counts as `op xN`, and always
   surfaces every failure in full.

Verification:

- 273 tests pass across the full agentic-chat test suite (47 test files,
  including 7 new write-ledger tests and 1 new union-surface-routing test).
- `pnpm check` reports zero errors in any file touched by this pass.
- Existing repair-replay end-to-end test continues to pass; ledger injection
  does not interfere with the redaction assertions because the ledger formats
  errors as text and never echoes the rejected tool-call args.

## Expected Next Testing Round

The 875 and 13fc replays validated the P0 write-integrity fixes. The second
late pass above then addressed the remaining gaps those replays surfaced:
final-answer grounding, task-state coverage, document placement, and discovery
overhead on mixed project turns. The next fantasy-novel replay is therefore a
validation run for the second late pass — not a polishing run.

Regression checks that must stay true (from the first late pass):

- No durable task/document/project/goal/plan field contains `<parameter`,
  `<tool_call`, `<function_call`, or `<arguments`.
- The model does not emit `update_strategy` on task, goal, project, or plan
  update calls because those schemas no longer expose that parameter.
- The repair pass does not echo the rejected durable string back to the model;
  it sees a validation fact plus a redacted placeholder.
- Document append/merge calls include non-empty `content`, not only
  `merge_instructions`.
- Pre-tool text reads as intent ("I will do X"), not completion.

New expectations the second late pass targets (must begin to hold):

- Mixed Chapter-2-style turns (task writes + document capture) do not require
  `tool_search` for `create_onto_task` / `update_onto_task`. The preloaded tool
  surface should be `project_write_document`.
- Turn 2 final prose names every successful write: document update, each
  created task, and any task state change. 13fc Turn 2 showed this is
  achievable; the write ledger should now make it consistent.
- Turn 3 final prose names the newly created research document and includes its
  persisted type. The 875 Turn 3 omission should not recur.
- When a task's real-world work advanced, the `update_onto_task` call includes
  `state_key`, not only description.
- When the user flags a data inconsistency (for example a 16/17 age
  conflict), the assistant records it as an open question or fix task instead
  of picking canon.
- Dedicated research documents are placed via an explicit
  `move_document_in_tree` call after create. Claims like "nested under Project
  Overview" appear only after that move returns successfully.
- Trace summaries show all writes (with `op xN` counts) and all failures; they
  are not truncated to the first six calls.

Still genuinely open (not yet addressed in code):

- If the ledger alone does not fully eliminate overclaims, a deterministic
  renderer (second constrained pass that fills a template from the ledger)
  may be needed. Hold for next replay data before adding.
- Skill-load heaviness: task_management with `include_examples: true` is still
  loadable, and the prompt does not hard-ban the heavy variant.
- Lite prompt cost breakdown buckets and snapshot version labels remain
  cosmetically confusing during audits; both tracked as P2.

Recommended acceptance checks for the next replay:

- Surface selection on Turn 2 is `project_write_document` when the turn message
  mixes task and document work.
- Final-answer prose matches the write ledger for every turn: no omitted
  successful writes, no unsupported task-progress or placement claims.
- Task state_key updates appear alongside description changes when work
  advanced.
- Any dedicated research document created is followed by a
  `move_document_in_tree` call before the final response claims placement.
- Token and tool-call counts per turn are recorded and compared against 13fc
  (78,438 tokens, 10 tool calls) as the post-fix lite baseline — the comparison
  should be quantitative across prior lite reruns, not only qualitative.
