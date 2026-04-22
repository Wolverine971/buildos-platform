<!-- docs/reports/agentic-chat-session-audit-fantasy-novel-kimi-2026-04-21.md -->

# Agentic Chat Session Audit - Kimi Fantasy Novel Flow

- **Session:** `9267e12d-909d-4e9c-906d-d328884b63e9`
- **User:** DJ Wayne (`djwayne35@gmail.com`)
- **Date:** 2026-04-21 17:45-17:51 UTC
- **Prompt variant:** `lite_seed_v1`
- **Primary model:** `moonshotai/kimi-k2.6-20260420`
- **Source transcript:** `/Users/djwayne/Downloads/chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-9267e12d-909d-4e-2026-04-21.md`
- **Prompt dump checked:** `apps/web/.prompt-dumps/fb-2026-04-21T17-49-44-779Z-lite-turn3.txt`

## Most Recent Prior Analysis Found

The newest saved analysis in `docs/reports` is:

- `docs/reports/agentic-chat-session-audit-fantasy-novel-2026-04-17.md`

That April 17 report is the newest report by filesystem timestamp and filename. It is useful for comparing the new Kimi run against the prior `x-ai/grok-4.1-fast` tool-calling lane plus `qwen/qwen3.6-plus-04-02` JSON/reconciliation lane.

The best direct same-scenario baseline is still the April 16 `13fc9ea8` post-fix lite replay documented inside:

- `docs/reports/agentic-chat-fastchat-vs-lite-fantasy-novel-flow-audit-2026-04-15.md`

That report explicitly named `13fc9ea8` as the strongest post-fix lite baseline: 3 turns, 10 tool calls, 0 failures, 78,438 tokens, and `$0.02187023`.

## Executive Summary

Kimi performed materially better than the April 17 Grok/Qwen run on user-visible cleanliness and tool reliability. There were no tool failures, no scratchpad leaks, no internal tool markup persisted into user data, and no hidden failed write. The model also used a much leaner tool path: 6 tool calls total, all writes, with no `skill_load`, `tool_search`, or `tool_schema` calls.

It is not a better default than the post-fix lite `13fc` baseline. The Kimi run used fewer tokens than `13fc` but cost over 4.5x more. It also regressed on durable artifact choice: it did not save Chapter 2 progress into a document, did not create a dedicated magic-system research document, and did not update related magic/blacksmithing/Aethermoor tasks after the research-notes turn.

The clearest product signal is split:

- **Model/runtime hygiene:** Kimi is a major improvement over Grok for visible output and write cleanliness.
- **Cost:** Kimi is currently too expensive for this lane, especially with Kimi also used for `agent_state_reconciliation`.
- **Agent behavior:** The new direct project-write surface is working; the remaining misses are policy and routing issues, not basic tool-call failures.

## Session Metrics

| Metric           |         Value |
| ---------------- | ------------: |
| User turns       |             3 |
| Messages         |             6 |
| Tool calls       |             6 |
| Tool failures    |             0 |
| LLM calls        |             8 |
| LLM failures     |             0 |
| Total tokens     |        66,084 |
| Total cost       | `$0.09911207` |
| Reasoning tokens |         9,745 |

### Lane Breakdown

| Lane                  | LLM calls |     Tokens |              Cost | Reasoning tokens | Response-time sum |
| --------------------- | --------: | ---------: | ----------------: | ---------------: | ----------------: |
| Tool-calling          |         6 |     53,758 |     `$0.05979682` |            2,271 |            114.3s |
| JSON / reconciliation |         2 |     12,326 |     `$0.03931525` |            7,474 |            277.8s |
| **Total**             |     **8** | **66,084** | **`$0.09911207`** |        **9,745** |        **392.1s** |

The JSON lane is the cost red flag. It consumed only 18.7% of tokens but 39.7% of cost and 76.7% of reasoning tokens. The second reconciliation call took 194s and completed after the visible third assistant response. The exported `agent_state` also appears to reflect Chapter 2 state, not the later magic-system research notes.

## What Happened By Turn

### Turn 1 - Project Creation

The model called `create_onto_project` once and created:

- 1 project: `The Last Ember`
- 1 goal: `Complete initial worldbuilding, character development, and three-chapter outline for The Last Ember`
- 7 tasks, each with useful descriptions
- 1 starter context document
- 9 graph edges

Verdict: strong. This matches the desired project shape and improves on older runs where final prose listed only a subset of tasks. The response named all seven tasks and did not leak scratchpad.

Weakness: cost/latency. The first assistant response took about 53s wall time from user message to saved assistant message, with two Kimi calls plus an 11.2s project-create tool execution.

### Turn 2 - Chapter 2 Progress

The model called four tools:

- `update_onto_task` on `Outline first three chapters`
- `create_onto_task` for `Fix continuity: Elena's age discrepancy between Chapter 1 and Chapter 2`
- `create_onto_task` for `Revise Chapter 2: dialogue, pacing, and sensory details`
- `create_onto_task` for `Draft Chapter 3: magical forging, Shadow King's herald, and prophecy foreshadowing`

Verdict: operationally clean, semantically mixed.

Strong points:

- Separate age-continuity task was the right decomposition.
- It did not choose a canonical age; it correctly asked the user to decide between 16 and 17.
- Final response named all three new tasks and the updated task.
- No failed state update; this confirms the April 17 `update_onto_task` failure was not reproduced.

Problems:

- It marked `Outline first three chapters` as `done`. The user said Chapter 2 was finished and gave Chapter 3 plans, but did not say the three-chapter outline task was complete. `in_progress` would have been safer.
- It did not persist the Chapter 2 progress note into a document. The 4,500-word milestone and dragon forge scene are useful durable project memory. Earlier best runs captured this with a context-document append or a dedicated progress document.

### Turn 3 - Magic-System Research Notes

The model called `update_onto_document` once with a valid append payload:

- `document_id`: `The Last Ember Context Document`
- `update_strategy`: `append`
- non-empty `content`
- `merge_instructions`: append under magic-system notes

Verdict: clean write, weaker artifact strategy.

Strong points:

- No no-content append failure.
- No internal markup persisted.
- Final response accurately said the notes were saved in the project context document.
- The appended content preserved the emotional-forging table and world-building notes.

Problems:

- The user provided substantial "research notes" with multiple sections. The best prior baseline for this scenario creates a dedicated `document.knowledge.research` document for that, optionally placed under the project overview/context document.
- It did not update related tasks: `Create magic system based on metal and fire`, `Research medieval blacksmithing techniques`, and `Map out the kingdom of Aethermoor` were all plausible `in_progress` updates.
- The final prose had a small text quality bug: `thesmithing` was missing a space.

## Comparison To Prior Runs

| Run                              | Model / path                                     | Turns | Tools | Failures |  Tokens |          Cost | Quality summary                                                                  |
| -------------------------------- | ------------------------------------------------ | ----: | ----: | -------: | ------: | ------------: | -------------------------------------------------------------------------------- |
| 2026-04-21 current               | `moonshotai/kimi-k2.6-20260420`, `lite_seed_v1`  |     3 |     6 |        0 |  66,084 | `$0.09911207` | Clean tools/output, very expensive, missed durable research/progress strategy    |
| 2026-04-17 report                | `x-ai/grok-4.1-fast` + `qwen/qwen3.6-plus-04-02` |     5 |    12 |        3 | 155,661 |     `$0.0519` | DB failures, severe scratchpad leak, more turns due repair flow                  |
| 2026-04-16 `13fc` lite baseline  | post-fix `lite_seed_v1`                          |     3 |    10 |        0 |  78,438 | `$0.02187023` | Best prior clean run, cheaper, better magic research doc, some task-state misses |
| 2026-04-16 `875` fastchat replay | post-fix fastchat                                |     3 |    11 |        0 | 116,001 | `$0.03860488` | Better magic task updates/doc type, weaker final-response grounding              |
| 2026-04-16 `74a4` lite rerun     | `lite_seed_v1`                                   |     3 |    19 |        0 | 106,280 |  `$0.0302656` | Lower cost than Kimi, but durable markup pollution                               |

Relative to `13fc`, the Kimi run used 15.8% fewer tokens and 40% fewer tools, but cost 353.2% more. Relative to the April 17 Grok/Qwen run, it used 57.5% fewer tokens and 50% fewer tools, with zero failures and no scratchpad leak, but cost 91.0% more.

## Model Performance Read

### What Kimi Did Better

- Clean visible assistant messages. It did not reproduce the Grok scratchpad leak.
- Clean durable writes. It did not reproduce the `<parameter name=...>` markup pollution observed in earlier fastchat/lite runs.
- Strong direct tool use. The model did not waste calls on discovery, schema fetches, or skill loads.
- Good project creation payload. It created the goal, task descriptions, and goal-task containment relationships.
- Better final-response grounding than many prior runs. It named successful writes in turns 1 and 2 and did not claim nonexistent tool failures or links.

### What Kimi Did Worse

- Cost is currently unacceptable for the lane. The same three-turn scenario cost `$0.09911207`, compared with `$0.02187023` for the prior `13fc` lite baseline.
- The JSON/reconciliation lane is especially inefficient. It produced 7,474 reasoning tokens across two calls and appears stale relative to the final research-notes turn.
- It under-used durable document strategy. Chapter 2 progress was not documented, and magic-system research notes were appended to the context document rather than made into a dedicated research document.
- It under-updated related tasks. The research turn should have advanced at least the magic-system task, and probably blacksmithing and Aethermoor as well.
- It over-updated one task state by marking `Outline first three chapters` as `done` without explicit evidence.

## Prompt And Tool Surface Notes

The turn-3 prompt dump shows a useful runtime change from earlier audits: project context now had direct write tools preloaded:

- `create_onto_task`
- `update_onto_task`
- `create_onto_document`
- `update_onto_document`

This addresses the April 15/16 report's complaint that ordinary project follow-ups were forced through `tool_search` and `tool_schema`. The actual Kimi trace validates the change: no discovery tools were used.

The tradeoff is prompt payload size. Turn 3 still sent 13 provider tools, about 5,134 estimated tool-definition tokens, and a provider payload estimate around 10,442 tokens. This is much better than runtime discovery churn, but it still needs cost monitoring when paired with expensive models.

The prompt dump still used UTC in the timeline frame even though the user locale is America/New_York. It did not break this session, but "today" appeared in the Chapter 2 update and timezone handling remains worth fixing for dated work.

Prompt evals were empty in the export. This fantasy-novel flow should be promoted to a formal replay/eval case.

## Recommended Fixes

### P0 - Do Not Use Kimi For Reconciliation By Default

Move `agent_state_reconciliation` to a cheaper non-reasoning JSON model, cap reasoning tokens, or disable reconciliation for simple write turns. The current Kimi JSON lane accounted for `$0.03931525` of the session cost and completed slowly enough to lag behind the visible conversation.

### P1 - Keep The Direct Project-Write Surface

The new surface is working. It eliminated the repeated `tool_search` / `tool_schema` overhead seen in older reports. Keep it, but continue measuring provider payload cost by context.

### P1 - Tighten Task-State Semantics

Only mark a task `done` when the user explicitly says that work item is complete or the completion is directly entailed. For this scenario, "Finished chapter 2" plus "Chapter 3 plans" should update the outline task to `in_progress`, not `done`.

### P1 - Restore Durable Artifact Policy

Use a predictable policy:

- Progress snippets like "Finished chapter 2 today - 4,500 words" should append to a progress/context document.
- Substantial named research notes should create a dedicated research document.
- Research notes that touch existing tasks should update those tasks to `in_progress`.

### P2 - Add Regression Evals

Add a replay/eval asserting:

- 1 project, 1 goal, 7 initial tasks, 1 context doc, and goal-task relationships are created.
- Chapter 2 progress is saved in a durable document.
- Age discrepancy becomes an open fix task without choosing a canonical age.
- Outline task is not marked `done` unless explicitly completed.
- Magic-system research creates a dedicated research document or follows an explicit append policy.
- Magic/blacksmithing/Aethermoor tasks are advanced when the research notes justify it.
- Final prose mentions material writes and does not claim unsupported links, nesting, types, or task progress.

## Bottom Line

Kimi is a strong reliability improvement over the April 17 Grok/Qwen setup for visible chat quality and write hygiene. It is not a cost improvement, and it is not yet a stronger product-behavior baseline than `13fc`. The best next move is not more prompt wording. Keep the improved direct write surface, move reconciliation off expensive reasoning, and make document/task routing deterministic for progress and research-note turns.
