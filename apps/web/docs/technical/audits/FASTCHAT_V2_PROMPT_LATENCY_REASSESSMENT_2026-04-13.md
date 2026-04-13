<!-- apps/web/docs/technical/audits/FASTCHAT_V2_PROMPT_LATENCY_REASSESSMENT_2026-04-13.md -->

# FastChat V2 Prompt Latency Reassessment (2026-04-13)

## Scope

This reassessment covers the current FastChat V2 agentic chat path, not the older `/api/agent/stream` route.

Current path reviewed:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts`
- `apps/web/src/lib/services/agentic-chat-v2/context-usage.ts`
- `apps/web/src/lib/services/agentic-chat-v2/prompt-observability.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts`
- Recent dumps in `apps/web/.prompt-dumps/fastchat-*.txt`, with emphasis on:
    - `fastchat-2026-04-13T18-18-04-356Z.txt`
    - `fastchat-2026-04-13T18-12-29-675Z.txt`
    - `fastchat-2026-04-13T17-32-34-353Z.txt`
    - `fastchat-2026-04-13T16-35-12-499Z.txt`
    - `fastchat-2026-04-12T22-36-08-445Z.txt`

## Executive Summary

The current system is the newer FastChat V2 gateway path. It is materially better than older prompt-dump audits: tool count is now roughly `14` in global context and `19` in project context, not the old `50+` tool surface. However, the prompt is still expensive because the tool definitions are duplicated in two places:

1. As actual tool definitions sent to the model.
2. As a large JSON block inside the text system prompt.

In the latest project dumps, that text-level tools block alone is about `29k-30k` chars, roughly `7.4k-7.6k` estimated tokens. The context payload is another `18k-22k` chars. So even without old all-tools loading, project prompts still frequently land around `15k-16k` estimated system-prompt tokens before history and current user text.

The latest heavy task also revealed a concrete functionality gap: the user asked to remove the project end date, but `update_onto_project` does not expose `start_at` or `end_at`. The model called `update_onto_project` twice with `props: {}`, which succeeded as a no-op instead of clearing the timeline.

## Recent Dump Snapshot

| Dump                  | Context | Tools | System chars | Passes | Reasoning tokens | Tool rounds | Tool calls | Outcome notes                                                                          |
| --------------------- | ------: | ----: | -----------: | -----: | ---------------: | ----------: | ---------: | -------------------------------------------------------------------------------------- |
| `2026-04-13T18-18-04` | project |    19 |       62,811 |      4 |            9,642 |           3 |         17 | Heavy cleanup task. One assignee failure, two no-op project updates, late schema call. |
| `2026-04-13T18-12-29` | project |    19 |       62,811 |      1 |              701 |           0 |          0 | Read-only response from project snapshot.                                              |
| `2026-04-13T17-32-34` | project |    19 |       62,567 |      1 |            1,103 |           0 |          0 | Read-only audit from project snapshot.                                                 |
| `2026-04-13T16-35-12` |  global |    14 |       48,811 |      2 |              752 |           1 |          1 | Used `get_project_overview`; relatively healthy.                                       |
| `2026-04-12T22-36-08` | project |    19 |       64,246 |      3 |            2,030 |           2 |          6 | Calendar delete flow. Needed discovery and skill load before direct deletes.           |

Notes:

- Some nearby dumps have no appended runtime metadata. Treat those as incomplete/cancelled/debug dumps unless corroborated elsewhere.
- The project context system prompt is consistently around `62k-64k` chars in the current newer path.
- First-pass cache status is often `0.7%-1%`, which means the expensive first pass usually pays most of the prompt cost.

## Prompt Section Breakdown

Measured from current dumps by splitting the rendered system prompt into sections.

### Latest heavy project cleanup (`fastchat-2026-04-13T18-18-04-356Z.txt`)

| Section                        |  Chars | Approx tokens |
| ------------------------------ | -----: | ------------: |
| Total system prompt            | 62,811 |        15,703 |
| Instructions                   | 41,992 |        10,498 |
| Context                        | 20,765 |         5,192 |
| Capabilities                   |  1,624 |           406 |
| Skill catalog                  |  1,513 |           379 |
| Tools text block               | 30,367 |         7,592 |
| Execution protocol             |  3,702 |           926 |
| Agent behavior                 |  2,262 |           566 |
| Context payload minus wrappers | 20,201 |         5,051 |

### Calendar delete follow-up (`fastchat-2026-04-12T22-36-08-445Z.txt`)

| Section                        |  Chars | Approx tokens |
| ------------------------------ | -----: | ------------: |
| Total system prompt            | 64,246 |        16,062 |
| Instructions                   | 41,208 |        10,302 |
| Context                        | 22,984 |         5,746 |
| Tools text block               | 29,583 |         7,396 |
| Context payload minus wrappers | 22,420 |         5,605 |

### Global project status (`fastchat-2026-04-13T16-35-12-499Z.txt`)

| Section                        |  Chars | Approx tokens |
| ------------------------------ | -----: | ------------: |
| Total system prompt            | 48,811 |        12,203 |
| Instructions                   | 30,143 |         7,536 |
| Context                        | 18,614 |         4,654 |
| Tools text block               | 18,518 |         4,630 |
| Context payload minus wrappers | 18,380 |         4,595 |

## Prompt Cost Measurement Audit

Current measurement is useful but incomplete.

### What is working

- `buildFastContextUsageSnapshot()` estimates system, history, and user-message tokens and emits `context_usage`.
- `buildPromptSnapshotRow()` stores:
    - `system_prompt`
    - `model_messages`
    - `tool_definitions`
    - `request_payload`
    - `prompt_sections`
    - `system_prompt_chars`
    - `message_chars`
    - `approx_prompt_tokens`
- Runtime LLM metadata captures provider-reported per-pass:
    - `prompt_tokens`
    - `completion_tokens`
    - `total_tokens`
    - `reasoning_tokens`
    - cache status

### What is missing

- `approx_prompt_tokens` only estimates message content: system + history + user. It does not include `tool_definitions`.
- `context_usage` also excludes `tool_definitions`.
- Prompt snapshots know `tool_definitions`, but do not estimate or section their token cost.
- `prompt_sections` stores presence/keys, not size by section.
- The prompt-dump line `System prompt length` is accurate for the built system prompt string, but it is not the full provider prompt payload because provider calls also include tool definitions.
- Section-level costs are only derivable by external parsing today.

### Recommended measurement changes

Add a `prompt_cost_breakdown` object to prompt snapshots and the `prompt_snapshot_created` turn event:

```json
{
	"system_prompt_chars": 62811,
	"system_prompt_est_tokens": 15703,
	"tool_definitions_chars": 30367,
	"tool_definitions_est_tokens": 7592,
	"model_messages_chars": 85000,
	"model_messages_est_tokens": 21250,
	"sections": {
		"instructions": { "chars": 41992, "est_tokens": 10498 },
		"tools_text_block": { "chars": 30367, "est_tokens": 7592 },
		"context": { "chars": 20765, "est_tokens": 5192 },
		"history": { "chars": 0, "est_tokens": 0 },
		"user": { "chars": 144, "est_tokens": 36 }
	}
}
```

Also store provider-reported `prompt_tokens` by pass next to the estimate so we can compare estimate drift.

## Latest Heavy Task Assessment

User request:

> I do have 2 emails for myself DJ Wayne keep them. Lets work on priority 2. Fix the timeline to not have an enddate. Then do the priority 3 items.

### What went well

- The model respected the user correction not to remove/merge the two DJ Wayne emails.
- It performed multiple direct task updates successfully.
- It recovered after the failed assignee update by updating the task without assignee changes.
- It updated the goal and milestone with a future target date.

### What failed or underperformed

1. **Project end date was not actually cleared**

    The current `update_onto_project` schema only supports `name`, `description`, `state_key`, and `props`. It does not support `start_at` or `end_at`.

    The model called:

    ```json
    { "project_id": "f7824d94-0de0-460c-80dd-67bf11f6445a", "props": {} }
    ```

    twice. Because `props` was present, the executor treated this as an update and returned success, but it did not clear the project `end_at`.

2. **No-op writes are allowed**

    `update_onto_project({ props: {} })` should probably be rejected as a no-op. Today it passes the "has update data" check.

3. **Schema inspection happened too late**

    The model called `tool_schema({ op: "onto.project.update" })` after the project update attempts. The instruction says to inspect schema when write arguments are uncertain, but enforcement is prompt-only.

4. **Plan linkage work was only partially possible**

    Priority 3 asked for task-to-plan/goal linkages. `update_onto_task` supports `goal_id` and `supporting_milestone_id`, but not plan linkage. The model updated goal/milestone relationships but did not establish plan links.

5. **Assignee handle resolution failed**

    The model tried `@djwayne35@gmail.com`, but assignee handles resolve against active project members by name/email local-part. The expected local-part style would be closer to `@djwayne35`, not a full email handle.

6. **The run was expensive**

    Four model passes, 17 tool calls, and 9,642 reasoning tokens. Prompt tokens grew from `22,265` to `38,766` across passes as history/tool results accumulated.

## Strategic Improvements

The goal is to improve speed and reliability without breaking the behavior that is currently working. Each item should be behind a flag or proven by replay tests before broad rollout.

### Phase 0: Observability First

1. Add prompt section accounting to snapshots and dumps.
2. Add approximate token counts for `tool_definitions`.
3. Add "provider actual vs local estimate" comparison per LLM pass.
4. Add counters for:
    - no-op tool writes
    - tool schema called after write
    - materialized tool used without schema
    - repeated `tool_search` for already-known operations
    - tool calls that failed then succeeded without the failed field

Risk: low. Mostly telemetry.

### Phase 1: Fix Known Functional Gaps

1. Extend `update_onto_project` schema/executor to support:
    - `start_at?: string | null`
    - `end_at?: string | null`
2. Reject empty project updates:
    - `props: {}` should not count as a meaningful update.
    - Empty description/name/state updates should be rejected too.
3. Add a focused regression test for clearing project `end_at`.
4. Improve assignee-handle guidance:
    - Explicitly say handles use name/email local-part, not full email strings.
    - Optionally normalize `@name@example.com` to `@name` if unambiguous.

Risk: low-medium. Project date updates affect real writes, so use tests and maybe dev-only replay first.

### Phase 2: Remove Text-Level Tool Schema Duplication

Current `master-prompt-builder` includes a large JSON block from `getGatewaySurfaceForContextType(contextType)` inside the text prompt. Those same tools are also sent as actual model tools.

Plan:

1. Add a flag such as `FASTCHAT_COMPACT_TOOL_PROMPT`.
2. Under the flag, replace the full JSON block with a compact list:

    ```text
    Preloaded direct tools:
    - get_project_overview
    - update_onto_task
    - ...

    Discovery tools:
    - skill_load
    - tool_search
    - tool_schema

    Exact callable schemas are provided in the tool definitions. Use tool_schema for newly discovered write ops.
    ```

3. Keep the actual `tools` payload unchanged.
4. Replay recent dumps before enabling:
    - calendar delete flow
    - project cleanup flow
    - global project overview flow
    - project audit read-only flow

Expected gain: remove roughly `4.6k-7.6k` estimated tokens from the text system prompt depending on context.

Risk: medium. The model may rely on text-visible schemas even though tool definitions are available. Must validate with replay.

### Phase 3: Reduce Avoidable Discovery Rounds

1. Add `update_onto_project` to the project gateway direct tool surface once its schema is correct.
2. Consider adding `link_onto_entities` or a dedicated plan-linking tool to project context if priority-3 cleanup requires plan relationships.
3. For calendar/project contexts, consider preloading `delete_calendar_event` only when calendar/event context is present or recent referents include events.
4. Add telemetry to identify high-frequency `tool_search` results that should be preloaded.

Risk: medium. Preloading more write tools can improve speed but increases mutation surface.

### Phase 4: Enforce Write-Schema Safety In Code

Prompt-only guidance did not prevent the late `tool_schema` pattern.

Potential enforcement:

1. If a write tool was materialized by `tool_search` in the same turn and the op was not preloaded, require `tool_schema` before executing it.
2. Exempt preloaded direct tools whose schema is already known to the model.
3. Log and repair instead of executing when the pattern is violated.

Risk: medium-high. This may add an extra round for some writes, so it should follow the compact prompt work.

### Phase 5: Context Packing

Only after the tool duplication is addressed:

1. Add per-section budgets for project context.
2. Keep exact IDs and high-signal fields.
3. Summarize large task/document lists unless the user asks for full detail.
4. Preserve complete data for write targets and recent referents.

Risk: medium. Over-compacting context can break the strong current behavior.

## Validation Plan

Before enabling behavior changes, run:

1. Existing focused tests:
    - `npm run test -- src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts`
    - `npm run test -- src/smart-llm-service.test.ts` in `packages/smart-llm`
2. Add focused tests:
    - prompt section accounting
    - compact tool prompt snapshot
    - clear project `end_at`
    - reject no-op `update_onto_project`
    - schema-required-before-new-write behavior
3. Replay prompt dumps:
    - `fastchat-2026-04-13T18-18-04-356Z.txt`
    - `fastchat-2026-04-12T22-36-08-445Z.txt`
    - `fastchat-2026-04-13T16-35-12-499Z.txt`
4. Compare:
    - time to first text
    - first-pass prompt tokens
    - total prompt tokens
    - reasoning tokens
    - tool rounds
    - tool calls
    - validation/tool failures
    - final action correctness

## Recommended Order

1. Implement prompt section accounting.
2. Fix `update_onto_project` date clearing and no-op writes.
3. Add replay coverage for the latest heavy cleanup flow.
4. Flag compact tool prompt text and test it with unchanged tool payloads.
5. Add targeted direct tools only after schemas are correct.
6. Consider stricter schema-before-write enforcement after latency from prompt size is reduced.

This order preserves current functionality while addressing the most visible failure and the largest remaining prompt-cost source.
