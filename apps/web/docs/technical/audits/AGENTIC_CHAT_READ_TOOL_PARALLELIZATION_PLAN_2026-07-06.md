<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_READ_TOOL_PARALLELIZATION_PLAN_2026-07-06.md -->

# Agentic Chat Read Tool Parallelization Plan - 2026-07-06

## Target Finding

`[P2] Independent read tools execute sequentially.`

The FastChat v2 orchestrator currently awaits each tool call one by one in `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts:1510`. `ToolExecutionService.batchExecuteTools` already provides bounded concurrency while preserving result order, but the streaming orchestrator does not use a batch path.

Goal: run independent pure-read tools concurrently inside a tool round while preserving write ordering, model message ordering, tool-call limits, callbacks, supervisor observations, and write-ledger semantics.

## Constraints

- Preserve `messages` order exactly as emitted by the model, even if read tools finish out of order.
- Keep all write-like operations sequential and in original relative order.
- Do not let reads cross a write boundary. A write may depend on prior reads, and later reads may need post-write state.
- Do not parallelize calls that can materialize tools or mutate orchestration state in a way later calls in the same round depend on.
- Keep `onToolResult`, `observeSupervisor`, `rememberKnownEntitiesFromToolResult`, and gateway materialization effects ordered by original tool-call order.
- Continue to honor `maxToolCalls`, abort signals, duplicate-write suppression, validation, and repair-result generation.

## Classification

Add a small classifier near the orchestrator execution loop:

- `write`: `isWriteLikeOperation(toolName)` or `TOOL_METADATA[toolName]?.category === 'write'`.
- `orchestration_stateful`: gateway/discovery/materialization tools whose results affect `allowedToolNames`, `tools`, or same-round auto-exec decisions, including `skill_load`, `tool_search`, `tool_schema`, `domain_search`, `domain_load`, `outcome_card_search`, `outcome_card_load`, `resource_search`, `resource_load`, `skill_search`, `skill_reference_load`, and Libri capability-loading gateway tools.
- `pure_read`: known loaded tools with `TOOL_METADATA` category `read` or `search`, excluding stateful gateway/discovery tools and excluding any unknown tool names.

Only `pure_read` calls are eligible for concurrent execution. Unknown category should default to sequential.

## API Shape

Extend `StreamFastChatParams` with an optional batch executor:

```ts
batchToolExecutor?: (
  toolCalls: ChatToolCall[],
  availableTools?: ChatToolDefinition[]
) => Promise<ChatToolResult[]>;
```

Keep `toolExecutor` as the required fallback path. The route should implement `batchToolExecutor` by calling `ToolExecutionService.batchExecuteTools` with a bounded concurrency, then converting each `ToolExecutionResult` back to `ChatToolResult` using the same conversion logic currently used by the single-call wrapper.

Recommended initial concurrency: `3`, matching the existing `batchExecuteTools` default.

## Orchestrator Refactor

1. Extract the current per-call execution block into two helpers inside `streamFastChat`:
    - `prepareToolExecution(pair, executionIndex)` handles tool limit checks, wrong-entity repair, availability/materialization, late validation, duplicate-write checks, and returns either a terminal `FastToolExecution` or an executable call.
    - `recordToolExecution(execution)` performs ordered side effects: push to `toolExecutions`, push to `roundExecutions`, write dedupe memory, supervisor observation, gateway materialization from successful results, known-entity memory, `onToolResult`, and append the compacted tool payload to `messages`.

2. Convert `toolCallsToExecute` into ordered segments:
    - Run `prepareToolExecution` sequentially across the round because it mutates tool availability and enforces call limits.
    - Build contiguous segments of prepared executable calls:
        - `parallel_read_segment`: all calls are `pure_read`, no terminal result, no write-like behavior, batch size > 1, and `params.batchToolExecutor` exists.
        - `sequential_segment`: everything else, including writes, stateful gateway/discovery tools, validation errors, duplicate-write skips, unknown tools, and single reads when no batch hook is present.

3. Execute each segment in order:
    - For a `parallel_read_segment`, call `params.batchToolExecutor(segment.calls, tools)` once.
    - Normalize returned `tool_call_id` values to the original call ids, matching current single-call behavior.
    - Convert batch results into `FastToolExecution[]` in segment input order, not completion order.
    - Then call `recordToolExecution` for each execution in original order.
    - For sequential segments, keep current single-call behavior.

4. Keep write behavior unchanged:
    - `findDuplicateSuccessfulWrite` and `rememberSuccessfulWriteForDedup` remain ordered around each write.
    - Auto-materialized write tools still execute singly.
    - `buildWriteLedgerMessage(toolExecutions)` remains after the round, with no change in output shape.

## Route Wiring

In `apps/web/src/routes/api/agent/v2/stream/+server.ts`:

1. Extract the single-call `ToolExecutionResult -> ChatToolResult` conversion into a local helper.
2. Add `batchToolExecutor` when `toolExecutionService` exists:
    - Patch each call with `patchToolCall`.
    - Reuse the same `serviceContext` shape as the single executor.
    - Call `toolExecutionService.batchExecuteTools(patchedCalls, serviceContext, availableToolsForExecution, 3, { abortSignal: turnAbortController.signal })`.
    - Convert each result back to `ChatToolResult`.
3. Pass both `toolExecutor` and `batchToolExecutor` into `streamFastChat`.

## Observability

Add lightweight logs or observability events for:

- `read_tool_batch_started`: count, tool names, max concurrency.
- `read_tool_batch_completed`: count, duration, success count, failure count.

Do not log full arguments or full results.

## Tests

Add orchestrator unit tests in `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts`:

- Batches two independent loaded read/search tools into one `batchToolExecutor` call.
- Preserves tool result message order when the second read resolves before the first.
- Does not batch across a write: read, write, read should execute as three ordered segments.
- Does not batch `skill_load` followed by newly materialized write validation; current same-round validation behavior must remain unchanged.
- Falls back to sequential `toolExecutor` when `batchToolExecutor` is absent.
- Honors `maxToolCalls` before batching and emits skipped terminal results for over-limit calls.

Add service-level tests only if `batchExecuteTools` needs behavior changes. Existing helper already preserves result order, but it does not explicitly short-circuit on abort before starting later queued calls; avoid changing that unless required.

## Rollout Steps

1. Add the orchestrator batch parameter and tests with no route wiring; verify fallback behavior is unchanged.
2. Implement segmentation and ordered recording in the orchestrator.
3. Wire `batchToolExecutor` in the stream route through `ToolExecutionService.batchExecuteTools`.
4. Add observability events.
5. Run:
    - `pnpm --filter @buildos/web exec vitest run src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts src/lib/services/agentic-chat/execution/tool-execution-service.test.ts src/routes/api/agent/v2/stream/server.test.ts`
    - `pnpm --filter @buildos/web check`

## Risk Notes

- The largest risk is not concurrency itself; it is moving ordered side effects earlier or later. Keep execution concurrent, but keep result recording sequential.
- Do not classify gateway/discovery tools as pure reads even when they are logically read-only, because their results can change tool availability inside the same round.
- The existing `ChatToolExecutor` caches executor instances. The P1 abort fix uses per-call service context signals; route-level batch wiring should keep using `ToolExecutionService` rather than calling `ChatToolExecutor` directly for batches.
