<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_EMPTY_SYNTHESIS_REPAIR_PLAN_2026-06-23.md -->

# Agentic Chat Empty Synthesis Repair Plan

Date: 2026-06-23

Status: **Fixes A-D shipped and verified locally (2026-06-23).** The original plan was research/de-risk only; it has since been implemented with focused regression coverage.

## Implementation Status (2026-06-23)

| Fix                                         | State   | Notes                                                                                                                                   |
| ------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **A** - typed search-result materialization | Shipped | Typed entity results now infer/materialize the matching detail tools without broadening the launch surface.                             |
| **B** - wrong-entity-kind repair            | Shipped | The orchestrator now remembers typed IDs from prior reads and repairs known task/document/etc. id mismatches before calling executors.  |
| **C** - retry empty no-tool synthesis       | Shipped | `stream-orchestrator/index.ts` retry guard now treats an empty synthesis pass as retryable (one retry, cap preserved).                  |
| **D** - evidence-aware guard fallback       | Shipped | `empty_after_reads` now preserves bounded read evidence instead of always emitting the generic "gathered context" fallback.             |
| Incident regression coverage                | Shipped | `empty-synthesis-retry.regression.test.ts` drives the real `streamFastChat` loop for empty synthesis retry and wrong-kind task routing. |

### Independent validation (2026-06-23)

The diagnosis was verified line-by-line against the code. The exact incident path was confirmed: a forced no-tool synthesis pass returns `finished_reason=stop` with empty text -> the old retry guard at `index.ts:951` evaluated false (it only fired on `tool_calls` or suppressed tool calls) -> `markToolLimitReached('round')` (`index.ts:982`) -> the `empty_after_reads` finalization-guard fallback (`finalization-guard.ts:97`). The regression test reproduces this precisely.

Refinements to the original plan:

1. **The "4 rounds vs 8 cap" puzzle** is most likely explained by **read-loop-escalation `must_synthesize`** (`index.ts:341-342`) forcing the synthesis pass _independently of_ the round cap - not a tighter cap. This strengthens "do not raise the round cap": the cap was never the trigger, and Fix C is the true linchpin regardless of which detector forces synthesis.
2. **Fix C scope:** the retry now branches its instruction - the original "still requested tools" message for the suppressed-tool case, and a new "produced no visible answer, write the final answer now" message for the empty case. Existing tool-call retry behavior is preserved exactly; the empty case is purely additive.
3. **Fix A is lower-risk than the plan states.** It is not a new mechanism: `utility-executor.ts:720,810` already returns `materialized_tools` from `get_project_overview`/`get_workspace_overview`, consumed by the orchestrator. Fix A just extends a shipping pattern to search results. Bonus evidence: `search_project`'s own result `message` already says "Use get*onto*\*\_details to load full records" - instructing the model to use tools not in its surface, a real contradiction Fix A resolves.
4. **Secondary finding (relevant to Fix D):** building the regression test surfaced that `enforceMutationOutcomeIntegrity` -> `collectUnsupportedDocumentClaims` (`repair-instructions.ts:210`) rewrites read-only synthesis text that mentions documents - it stripped a legitimate "the parent task ... is still todo" sentence from a correct answer. This over-eager document-claim corrector can degrade otherwise-good read syntheses and should be reviewed alongside Fix D's evidence-aware fallback.

Implementation landed in the recommended order: **A -> B -> D**, preserving the previously shipped **C**.

### Additional de-risk pass (2026-06-23)

Follow-up review found two adjacent edge cases and both are now covered:

1. **Empty or partial `materialized_tools` should not block typed inference.** The raw extractor and compacted model payload now merge explicit materialization hints with inferred entity-detail tools. This protects search payloads that carry `materialized_tools: []` or a partial hint set.
2. **Read-only lead-ins after successful reads should not persist.** If a read-only turn gathered evidence but the model's final text is only a short lead-in such as "I'll look that up now," the finalization guard now replaces it with the bounded read-evidence fallback.

---

### Original plan (research / de-risk) follows.

## Incident

Session: `2af546cf-40a2-4db4-bf81-b88952c4a532`

User ask:

> I need to create a user guide suite for all these people. I don't remember what I was doing with this task, so let's see if it's related to a doc. Also, tell me what TPM is.

Persisted assistant reply:

> I gathered the requested context, but the turn ended before a final response was produced.

The turn was marked completed, but the user received only the finalization guard fallback.

Key audit facts:

- One turn, 7 successful read/discovery tool calls, 0 tool failures.
- 5 chat LLM passes plus 1 later `agent_state_reconciliation` LLM call.
- The turn finished with `finished_reason=tool_round_limit`.
- Pass 5 was `forced_no_tool_synthesis=true`, `hasTools=false`, and `finished_reason=stop`.
- The final candidate entering the guard was empty or sanitized to empty.
- The guard emitted the generic `empty_after_reads` text.

The agent did gather enough context to give a useful answer:

- Found task `Create User Guide Suite (ADHD/TPM/Writers/Devs)`, state `todo`.
- Found child task `Create detailed BuildOS guide for people with ADHD`, state `todo`.
- Found `Create detailed BuildOS guides for Writers [MERGED]`, state `done`.
- Found `Create detailed BuildOS guides for Tech Project Managers [MERGED]`, state `done`.
- Tried `get_document_outline` with the parent task id, which returned document `not_found`.
- Listed project documents twice.
- Searched again and still found the same guide-suite task cluster.

The missing user-facing answer should have been roughly:

> I found this as a task cluster, not a document. The parent task is "Create User Guide Suite (ADHD/TPM/Writers/Devs)" and it is still todo. ADHD is a todo child task; Writers and Tech Project Managers are marked done/merged. TPM here means Technical Project Manager.

## Why "there should be more tools" is partly right

The current project launch surface is intentionally lean. In `project_basic`, the direct tools include:

- `search_project`
- `list_onto_tasks`
- `list_onto_documents`
- `get_document_outline`
- `read_document_section`

Source: `apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts:90`.

The direct surface does not include `get_onto_task_details` in `project_basic`, and does not include `get_onto_document_details` except in document/write-document profiles. That was an intentional budget tradeoff. The comment says the full-body document detail tool stays in document profiles, while outline/section reads stay always-on.

The problem is not that every project turn should preload every detail tool. That would increase the launch prompt and conflict with the lean-discovery direction.

The problem is that after `search_project` returns typed results, the next likely detail tools are not automatically materialized. The model has to either guess tool names, search for tools, or continue broad listing. In this incident it guessed wrong by passing a task id to `get_document_outline`.

## Root Causes

### 1. Search results do not materialize typed detail tools

`extractGatewayMaterializedToolNames()` only extracts tools from explicit `materialized_tools`, `tool_search_results`, `tool_schema`, or `op` payloads.

Source: `apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts:269`.

`search_project` returns `results`, but no `materialized_tools`.

Source: `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.ts:606`.

The orchestrator already has the mechanism we need:

```ts
if (gatewayModeActive && result.success) {
	materializeDirectTools(
		extractGatewayMaterializedToolNames(result.result),
		'Discovery loaded additional tools.'
	);
}
```

Source: `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts:1384`.

So the lowest-risk fix is not to broaden `project_basic`. It is to make typed search results carry the same lazy-materialization hint that domain/tool discovery already uses.

### 2. The model confused entity kinds

The first `search_project` result was a task:

`82dfb1b6-e39d-48cb-8c32-d13c3e620daa` -> `type: "task"`.

The later call was:

`get_document_outline({ document_id: "82dfb1b6-e39d-48cb-8c32-d13c3e620daa" })`.

That can never work. The model needed either:

- `get_onto_task_details({ task_id })`
- `list_task_documents({ task_id })`

The system currently lets the wrong-kind detail read burn a round, then gives only a generic document-not-found message.

### 3. Forced no-tool synthesis can stop with no visible answer

In the no-tool synthesis branch, the orchestrator retries once only when the model still requests tools:

Source: `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts:948`.

This incident shows another failure mode:

- tools were withheld,
- the model returned `finished_reason=stop`,
- sanitized visible content was empty,
- no retry happened,
- the finalization guard emitted the generic fallback.

### 4. The finalization guard loses useful read evidence

For read-only tool work, the guard currently returns:

```ts
I gathered the requested context, but the turn ended before a final response was produced.
```

Source: `apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/finalization-guard.ts:97`.

That is better than persisting an empty answer, but it discards the facts already gathered. In this incident, the raw tool trace had enough information to produce a compact, factual fallback.

## Proposed Fix Set

### Fix A - Add typed materialization hints to `search_project` / `search_all_projects`

When search results contain typed entities, return a `materialized_tools` array:

- any `task` result -> `get_onto_task_details`, `list_task_documents`
- any `document` result -> `get_document_outline`, `read_document_section`
- optionally any document result when the document is short or body-specific -> `get_onto_document_details`
- any `goal`, `plan`, `milestone`, `risk` result -> the corresponding `get_onto_*_details` tool

Keep this result-driven, not launch-surface-driven. The tool menu expands only after a search result proves the entity type is relevant.

Why this should work:

- The orchestrator already materializes tools from successful result payloads.
- The `materialized_tools` contract already exists and is used by discovery payloads.
- It avoids adding more tokens to every project turn.
- It removes a full discovery round when the model wants to inspect the top search hit.

Regression proof to add:

1. Unit test `extractGatewayMaterializedToolNames()` with a synthetic search result:
    - input has `{ results: [{ type: "task" }] }`
    - output includes `get_onto_task_details` and `list_task_documents`
2. Stream test:
    - launch surface omits `get_onto_task_details`
    - first pass calls `search_project`
    - search result includes one task
    - second pass tool list includes `get_onto_task_details`
    - model can call `get_onto_task_details` without a `tool_search` round

### Fix B - Add wrong-entity-kind repair before executing detail reads

Build a turn-local entity index from prior read results:

- id -> observed type/kind
- id -> title
- id -> source tool

Before executing detail tools, check whether the argument id matches the expected entity kind:

- `get_document_outline.document_id` expects `document`
- `read_document_section.document_id` expects `document`
- `get_onto_document_details.document_id` expects `document`
- `get_onto_task_details.task_id` expects `task`
- `list_task_documents.task_id` expects `task`

If the model passes a known task id to a document tool, skip the executor and return a synthetic repair result:

```json
{
	"error": "That id is a task, not a document. Use get_onto_task_details or list_task_documents with task_id.",
	"known_entity": {
		"id": "...",
		"type": "task",
		"title": "Create User Guide Suite (ADHD/TPM/Writers/Devs)"
	},
	"materialized_tools": ["get_onto_task_details", "list_task_documents"]
}
```

Why this should work:

- It turns a wasted not-found call into a targeted one-round repair.
- It uses facts already seen in the current turn, so there is no extra database read.
- It keeps the actual executor behavior unchanged for unknown ids.

Regression proof to add:

1. Stream test:
    - first pass search returns task id `T1`
    - second pass calls `get_document_outline({ document_id: T1 })`
    - assert `toolExecutor` is not called for `get_document_outline`
    - assert the model receives a tool result saying `T1` is a task
    - assert `get_onto_task_details` and `list_task_documents` are materialized
2. Follow-up stream test:
    - model then calls `get_onto_task_details({ task_id: T1 })`
    - final answer includes the task title and state

### Fix C - Retry empty no-tool synthesis once SHIPPED 2026-06-23

In the no-tool synthesis branch, treat empty `candidateFinalText` as retryable even when the model returns `stop`.

Current retry condition:

```ts
suppressedNoToolSynthesisToolCallCount > 0 ||
	(llmPassMeta.finishedReason === 'tool_calls' && !candidateFinalText);
```

Safer condition (as shipped - split into two named booleans so the retry instruction can branch):

```ts
const noToolPassStillRequestedTools = suppressedNoToolSynthesisToolCallCount > 0;
const noToolPassProducedNoAnswer = !candidateFinalText;
if (
	(noToolPassStillRequestedTools || noToolPassProducedNoAnswer) &&
	noToolSynthesisRetryCount < 1
) {
	/* retry once */
}
```

This preserves the original tool-call retry behavior exactly (`!candidateFinalText` subsumes the old `finishedReason === 'tool_calls' && !candidateFinalText` term) and adds the empty-`stop` case. Keep the existing one-retry cap.

Use a stronger retry instruction:

> The previous synthesis attempt produced no visible answer. Write the final user-facing answer now from the tool results. Include the concrete entities found and the answer to any direct definition question. Do not call tools.

Why this should work:

- It targets the exact incident mode: `stop` with no usable text.
- It does not permit infinite retries.
- It reuses the existing no-tool synthesis path, so tools remain unavailable.

Regression proof (added - `empty-synthesis-retry.regression.test.ts`):

1. Stream test:
    - drives the real `streamFastChat` loop; a repeated `search_project` read loop forces synthesis
    - first no-tool pass yields `done(stop)` with no text
    - second no-tool pass yields the recovered answer
    - asserts `finishedReason === 'stop'`, two forced-synthesis passes, the answer contains the TPM definition, and no finalization-guard fallback is applied
2. Negative test:
    - every no-tool pass is empty
    - asserts exactly one retry (two forced-synthesis passes), `finishedReason === 'tool_round_limit'`, and the `empty_after_reads` guard still applies

Note: the recovered answer is asserted via stable substrings rather than exact equality - the synthesized text still passes through `enforceMutationOutcomeIntegrity`, which reworded a document/state claim (see Implementation Status note 4).

### Fix D - Make `empty_after_reads` fallback evidence-aware

If final synthesis still fails, the finalization guard should synthesize a deterministic read summary from successful tool executions.

Minimum useful fallback:

- top 3 typed search/list results with title, type, and state when available
- failed detail read notes, such as "document outline was not found for id X"
- no speculative claims

For this incident, the deterministic fallback should include:

- `Create User Guide Suite (ADHD/TPM/Writers/Devs)` - task, todo
- `Create detailed BuildOS guide for people with ADHD` - task, todo
- Writers and Tech Project Managers guide tasks - done/merged
- attempted document outline was not found

It should not try to answer every domain question creatively, but it can preserve concrete tool facts. The direct "TPM" question should still be answered by Fix C's synthesis retry; the deterministic guard should be the last resort.

Why this should work:

- It changes the worst case from "I gathered context" to "here is the context I gathered."
- It is deterministic and bounded.
- It uses the same `toolExecutions` object already passed into `applyFinalizationGuard()`.

Regression proof to add:

1. Unit test for `applyFinalizationGuard()`:
    - read executions include typed task results
    - final/assistant text empty
    - output includes top result titles and state keys
    - output does not claim writes or completions
2. Unit test with large result payload:
    - fallback truncates after bounded item count/length

## What Not To Do First

### Do not just raise the tool round cap

The API default is currently `FASTCHAT_GATEWAY_MAX_TOOL_ROUNDS=8`, with near-limit cap 6.

Source: `apps/web/src/routes/api/agent/v2/stream/+server.ts:229` and `:2998`.

The incident audit recorded 4 rounds, likely from runtime configuration or an older/tighter cap. Raising the cap may reduce frequency, but it does not address:

- wrong entity-kind calls,
- missing next-detail materialization,
- empty synthesis after tools are withheld.

More rounds would likely let the model list more documents, not necessarily answer.

### Do not broaden `project_basic` with all detail tools

Preloading every detail/read tool would probably help this case, but it goes against the existing lean-discovery design and increases every project turn's launch prompt.

Result-driven materialization is the better tradeoff: add tools only after search results prove the entity type.

### Do not consolidate read-loop detectors as part of this fix

Existing audit notes already warn that there are several overlapping force-synthesis systems with different semantics:

- `read-loop-escalation`
- `context-gathering-ledger`
- deterministic supervisor
- repeated read-op detection in the orchestrator

The golden tests intentionally characterize the current behavior. This repair should not move synthesis fire-rounds unless explicitly reviewed.

## Existing Baseline Verification

Ran the narrow existing tests before writing this plan:

```sh
pnpm --filter @buildos/web test -- src/lib/services/agentic-chat-v2/tool-selector.test.ts
pnpm --filter @buildos/web test -- src/lib/services/agentic-chat-v2/read-loop-synthesis.golden.test.ts
pnpm --filter @buildos/web test -- src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts
```

Results:

- `tool-selector.test.ts`: 17 passed
- `read-loop-synthesis.golden.test.ts`: 5 passed
- `stream-orchestrator.test.ts`: 20 passed

This matters because the proposed fix should be additive around typed search-result routing and empty-synthesis recovery. It should not break the existing launch-surface routing or the read-loop fire-round contract.

## Implementation Verification

After implementing fixes A-D, ran:

```sh
pnpm --filter @buildos/web test -- \
  src/lib/services/agentic-chat-v2/tool-selector.test.ts \
  src/lib/services/agentic-chat-v2/stream-orchestrator/tool-payload-compaction.test.ts \
  src/lib/services/agentic-chat-v2/turn-supervisor/finalization-guard.test.ts \
  src/lib/services/agentic-chat-v2/empty-synthesis-retry.regression.test.ts \
  src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts \
  src/lib/services/agentic-chat-v2/read-loop-synthesis.golden.test.ts \
  src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.test.ts

pnpm --filter @buildos/web check
```

Results:

- Focused Vitest suite: 7 files passed, 85 tests passed.
- `svelte-check`: 0 errors, 0 warnings.

## Acceptance Criteria

The fix is ready when these are true:

1. Replayed incident-shaped stream no longer persists `I gathered the requested context...`.
2. A task search result materializes `get_onto_task_details` and `list_task_documents` without `tool_search`.
3. Passing a known task id to a document detail tool returns a targeted repair result, not a generic document `not_found`.
4. Empty forced no-tool synthesis retries once and succeeds when the second pass emits text.
5. If synthesis still fails, the finalization guard emits a bounded read-summary fallback from tool facts.
6. Existing tests listed above still pass.
7. New tests prove this exact session shape:
    - `search_project` finds guide-suite tasks
    - wrong document outline on task id is corrected
    - final answer includes `Create User Guide Suite`, ADHD/Writer/TPM task states, and `TPM = Technical Project Manager`

## Suggested Implementation Order

1. Add search-result materialization helper and tests.
2. Add turn-local entity-kind validation/repair and tests.
3. Add empty no-tool synthesis retry and tests.
4. Add evidence-aware finalization guard fallback and tests.
5. Add one full incident-shaped orchestrator regression test.
6. Run the three baseline test files plus the new regression tests.

This order keeps each change independently testable and avoids changing round-budget behavior until the known failure path is already closed.
