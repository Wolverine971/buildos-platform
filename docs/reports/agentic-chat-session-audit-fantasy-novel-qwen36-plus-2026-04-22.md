<!-- docs/reports/agentic-chat-session-audit-fantasy-novel-qwen36-plus-2026-04-22.md -->

# Agentic Chat Session Audit - Qwen 3.6 Plus Fantasy Novel Flow

- **Session:** `2e98da58-2904-497a-89cb-669e5940efc6`
- **Date:** 2026-04-22 17:31-17:33 UTC
- **Prompt variant:** `lite_seed_v1`
- **Primary model:** `qwen/qwen3.6-plus-04-02`
- **Source transcript:** `/Users/djwayne/Downloads/chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-2e98da58-2904-49-2026-04-22.md`
- **Prompt dumps checked:**
    - `apps/web/.prompt-dumps/fb-2026-04-22T17-31-03-535Z-lite-turn1.txt`
    - `apps/web/.prompt-dumps/fb-2026-04-22T17-32-02-874Z-lite-turn2.txt`
    - `apps/web/.prompt-dumps/fb-2026-04-22T17-33-16-877Z-lite-turn3.txt`

## Executive Summary

This is the best Qwen 3.6 Plus fantasy-novel run so far on user-visible quality and latency. It fixed the prior turn-1 finalization failure: the assistant persisted a grounded "project created" response instead of only an optimistic lead-in. It also improved turn 3 by creating a dedicated research document and updating the existing magic-system task to `in_progress`.

The run is still not a full product-quality pass. Turn 2 still treated a chapter-progress report mostly as new task creation. It did consolidate the work into 3 good tasks instead of the prior run's 7 atomized tasks, but it did not update the existing "Outline first three chapters" task and did not capture the 4,500-word Chapter 2 milestone in a project progress document.

The export contains 8 LLM calls, all `agentic_chat_v2_stream` on `qwen/qwen3.6-plus-04-02`. There are no `agent_state_reconciliation` calls in the export. That means this run does not prove the new cheaper reconciliation route was exercised; the hidden JSON lane was either not run, not exported, or not present in the tested environment.

## Session Metrics

| Metric                |                                           Value |
| --------------------- | ----------------------------------------------: |
| User turns            |                                               3 |
| Messages              |                                               6 |
| Tool calls            |                                               7 |
| Tool failures         |                                               0 |
| LLM calls             |                                               8 |
| LLM failures          |                                               0 |
| Total tokens          |                                          81,853 |
| Prompt tokens         |                                          77,188 |
| Completion tokens     |                                           4,665 |
| Total cost            |                                   `$0.03418286` |
| Reasoning tokens      |                                           2,027 |
| LLM response-time sum |                                          100.6s |
| OpenRouter cache      | 0 cached tokens; every call reported `no cache` |

### Turn Breakdown

| Turn                 | LLM passes | Tools |     Tokens |              Cost | Reasoning tokens | Response-time sum |
| -------------------- | ---------: | ----: | ---------: | ----------------: | ---------------: | ----------------: |
| 1 - project creation |          3 |     2 |     20,205 |     `$0.00914063` |              681 |             34.9s |
| 2 - chapter progress |          2 |     3 |     24,109 |     `$0.01037205` |              781 |             33.0s |
| 3 - research notes   |          3 |     2 |     37,539 |     `$0.01467018` |              565 |             32.7s |
| **Total**            |      **8** | **7** | **81,853** | **`$0.03418286`** |        **2,027** |        **100.6s** |

## Prompt Dump Read

### Turn 1 Prompt

- Context: `project_create`
- Tools exposed: 4
- LLM passes: 3
- Actual path: `skill_load` -> `create_onto_project` -> final response
- Result: 1 project, 1 goal, 7 tasks, 1 document, 9 edges

The prompt correctly emphasized graph containment, final-response grounding, and pre-tool lead-ins as intent only. Qwen followed this well enough to create the project and produce a grounded final response.

Remaining issue: the final response said there were 7 tasks, but only named 5 of them. It omitted `Develop main character backstory` and `Write character profiles for the antagonist (The Shadow King)` from the visible list.

### Turn 2 Prompt

- Context: project
- Tools exposed: 16
- LLM passes: 2
- Actual path: `create_onto_task` x3 -> final response
- The prompt included the `state_key` task-progress instruction and had both document and task update tools available.

This is the strongest evidence that the progress/state issue is not a tool-surface problem. The model had enough context and enough tools, but still chose create-only behavior.

### Turn 3 Prompt

- Context: project
- Tools exposed: 13
- LLM passes: 3
- Actual path: `create_onto_document` -> `update_onto_task` -> final response

This was the strongest turn. Qwen created the right artifact type and updated the right existing task with `state_key: "in_progress"`. It also avoided a tree-placement claim by adding: `Correction: I did not move or place the document in the tree.`

That correction is truthful, but it is awkward as a user experience. The runtime should ideally produce a clean grounded summary the first time rather than append a visible correction.

## What Happened By Turn

### Turn 1 - Project Creation

Qwen created:

- 1 project: `The Last Ember`
- 1 goal: `Complete The Last Ember fantasy novel`
- 7 initial tasks
- 1 context document
- 9 graph edges

This fixed the biggest failure from the prior Qwen run: the persisted final response was grounded in the successful tool result instead of only saying "I'll create...".

Quality issue: the response said "7 tasks" but only listed 5. The data was correct, but the visible summary was incomplete.

### Turn 2 - Chapter 2 Progress

Qwen created 3 tasks:

- `Revise Chapter 2 - strengthen dialogue, fix pacing, add sensory details`
- `Write Chapter 3 - Elena's first magical forging, Shadow King's herald, prophecy foreshadowing`
- `Resolve continuity issue: Elena's age (16 in Ch1 vs 17 in Ch2)`

This is materially better than the prior Qwen run's 7 separate tasks. It grouped related work correctly and preserved the age inconsistency instead of choosing a canonical age.

But it still missed the core progress behavior:

- no update to the existing `Outline first three chapters` task
- no project progress document append/update
- no task state movement for existing work
- no durable milestone beyond embedding the 4,500-word detail in the new Chapter 2 revision task

This reinforces the deterministic-policy recommendation: the runtime needs to detect a progress obligation and verify that the write set actually satisfies it.

### Turn 3 - Magic-System Research

Qwen created:

- 1 document: `Magic System & World-Building Research`
- Type: `document.knowledge.research`
- 1 task update: `Create magic system based on metal and fire` -> `in_progress`

This is the best behavior seen in the recent Qwen/Kimi comparisons. It created a dedicated research artifact and updated a high-confidence existing task.

Remaining issues:

- It did not update `Research medieval blacksmithing techniques`, even though the user mentioned Damascus steel, sword-making, Goibniu, and medieval weapons.
- It did not update `Map out the kingdom of Aethermoor`, even though the user added Aethermoor regional forging differences.
- It said it "linked the key findings" to the magic task. The tool update did add findings to the task description, but no graph/document link tool ran. The phrase is borderline overclaiming unless "linked" is interpreted informally.
- It did not place the document in the tree; it correctly disclosed that after the fact.

## Comparison To Prior Runs

| Run                        | Model / path                                       | Tools | Failures | LLM calls |  Tokens |          Cost | Quality summary                                                                                               |
| -------------------------- | -------------------------------------------------- | ----: | -------: | --------: | ------: | ------------: | ------------------------------------------------------------------------------------------------------------- |
| 2026-04-22 current         | `qwen/qwen3.6-plus-04-02` stream only in export    |     7 |        0 |         8 |  81,853 | `$0.03418286` | Best Qwen UX so far; turn-1 finalization fixed; turn-3 task update improved; turn-2 progress still incomplete |
| 2026-04-21 Qwen            | `qwen/qwen3.6-plus-04-02` plus JSON reconciliation |     9 |        0 |         7 |  70,113 | `$0.04339337` | Clean writes, dedicated research doc, bad turn-1 finalization, weak progress/state capture                    |
| 2026-04-21 Kimi            | `moonshotai/kimi-k2.6-20260420`                    |     6 |        0 |         8 |  66,084 | `$0.09911207` | Clean output, very expensive, appended research into context doc                                              |
| 2026-04-17 Grok/Qwen       | `x-ai/grok-4.1-fast` plus Qwen reconciliation      |    12 |        3 |         - | 155,661 |     `$0.0519` | Tool failures, scratchpad leakage, repair flow                                                                |
| 2026-04-16 `13fc` baseline | post-fix `lite_seed_v1`                            |    10 |        0 |         - |  78,438 | `$0.02187023` | Best cost baseline; cleaner progress/doc handling                                                             |

Relative to the 2026-04-21 Qwen run:

- 22.2% fewer tool calls
- 16.7% more tokens
- 21.2% lower cost
- 75.4% fewer reasoning tokens
- 58.7% lower LLM response-time sum
- better turn-1 finalization
- better turn-3 existing-task update
- still weak turn-2 progress capture

Relative to Kimi:

- 23.9% more tokens
- 65.5% lower cost
- same LLM call count
- better research artifact routing
- much better latency profile

Relative to the April 16 `13fc` cost baseline:

- 4.4% more tokens
- 56.3% higher cost
- 30.0% fewer tool calls
- better turn-3 task update
- still not as strong on progress capture

## Reconciliation Route Read

This run does not contain any `agent_state_reconciliation` LLM usage rows. If the cheaper route were exercised, I would expect to see an LLM row with:

- `operation_type: "agent_state_reconciliation"`
- `model_requested: "qwen/qwen3.5-flash-02-23"` or equivalent
- JSON/non-streaming usage metadata

None appears in the export. So the cost improvement is real in the captured data, but it should not yet be attributed to the cheaper reconciliation model. It is more precise to say: this run had no exported hidden reconciliation cost.

## Deterministic Behavior Read

The new run supports the earlier deterministic-behavior assessment.

What improved:

- Post-tool finalization was much better on turn 1.
- Turn 3 updated a high-confidence existing task with `state_key: "in_progress"`.
- The final response did not falsely claim document tree placement.

What still needs runtime enforcement:

- Progress capture is still not guaranteed.
- Existing-task updates are still opportunistic; Qwen updated the magic task but not blacksmithing or Aethermoor tasks.
- Final summaries can still be incomplete or slightly overclaimed.

The next product fix should still be the deterministic obligation layer:

1. Detect user progress claims before tool use.
2. Require a progress document update or explicit progress artifact.
3. Resolve high-confidence existing task matches.
4. Verify the tool write set before finalization.

## Recommendation

Keep Qwen 3.6 Plus as the main comparison candidate. This run is a clear quality improvement over the April 21 Qwen run and much cheaper than Kimi.

Do not treat this as complete product reliability yet. The remaining failures are not model selection problems; they are missing deterministic runtime checks around progress capture, existing-task updates, and final-response grounding.
