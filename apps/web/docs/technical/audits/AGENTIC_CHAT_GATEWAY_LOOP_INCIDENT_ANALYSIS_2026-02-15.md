<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_GATEWAY_LOOP_INCIDENT_ANALYSIS_2026-02-15.md -->

# Agentic Chat Gateway Loop Incident Analysis (2026-02-15)

## Executive Summary

On February 15, 2026, the `organize unlinked docs` flow repeatedly failed in gateway mode (`AGENTIC_CHAT_TOOL_GATEWAY`), primarily due to:

- read-loop behavior (`tool_help` and `onto.document.tree.get` cycles with no progress),
- repeated write validation failures (`Missing required parameter: document_id`),
- model-level instability in some runs (empty content / retry behavior),
- loop guards that stopped the run but did not complete the user task.

Several mitigations were added across prompting, tool execution, orchestration guards, and observability. The latest state includes a targeted deterministic recovery path for the exact failing intent so the run can complete instead of ending at `tool_repetition_limit`.

## Problem Statement

User prompt:

- `organize unlinked docs`

Observed behavior in the chat UI:

- repeated "Loaded document tree" / "Loading document tree..." operations,
- repeated pre-tool lead-ins ("Got it, I'll fetch the tree..."),
- repeated write attempts with empty args (for delete/move),
- eventual stop via safety/repetition limit instead of successful organization.

Correlated error logs included:

- `tool_batch completed with 4 failed operations`
- `Missing required parameter: document_id`
- failing args shape: `{"op":"onto.document.delete","args":{}}`

## Reproduction Timeline

Primary prompt dumps reviewed:

- `apps/web/.prompt-dumps/fastchat-2026-02-15T19-56-24-900Z.txt`
- `apps/web/.prompt-dumps/fastchat-2026-02-15T20-07-18-308Z.txt`
- `apps/web/.prompt-dumps/fastchat-2026-02-15T20-29-59-720Z.txt`
- `apps/web/.prompt-dumps/fastchat-2026-02-15T21-04-37-317Z.txt`
- `apps/web/.prompt-dumps/fastchat-2026-02-15T21-20-16-182Z.txt`
- `apps/web/.prompt-dumps/fastchat-2026-02-15T21-23-16-687Z.txt`
- `apps/web/.prompt-dumps/fastchat-2026-02-15T21-43-32-703Z.txt` (local test artifact)
- `apps/web/.prompt-dumps/fastchat-2026-02-15T21-43-49-848Z.txt` (local test artifact)

Key progression:

1. Early runs (19:56 and 20:07 UTC) had extremely high prompt size (~7943 tokens) and repeated looping behavior.
2. Mid runs (20:29 and 21:04 UTC) reduced prompt size (~4950 tokens) but still failed on document operations.
3. Later runs (21:20 and 21:23 UTC) included real model metadata; both still ended with `tool_repetition_limit`.
4. Latest local validation run (21:43:49 UTC prompt dump from test harness) shows `finished_reason=stop` instead of repetition limit, due to deterministic recovery logic.

## What We Tried

## 1) Prompt and instruction changes

Changes:

- Added explicit gateway query pattern instructions for gateway mode.
- Added "do not repeat help paths unnecessarily".
- Added "never output scratchpad/self-correction text".
- Ensured gateway instruction blocks are gated by `isToolGatewayEnabled()` and tested for enabled/disabled behavior.

Relevant files:

- `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts`
- `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts`
- `apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts`
- `apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.test.ts`

Result:

- Reduced prompt surface and improved guidance, but did not fully prevent loop behavior in production-like runs.

## 2) Tool execution normalization and failure semantics

Changes:

- Expanded ID alias normalization (`id`, `doc_id`, `documentId`, nested alias patterns) toward required `*_id` fields.
- Kept strict required-field validation and UUID checks.
- Made `tool_batch` fail at top level when any internal op fails, while preserving per-op results.

Relevant file:

- `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`

Result:

- Better error signaling and stronger arg normalization.
- Still insufficient in worst-case loops where model continued issuing malformed write calls.

## 3) Orchestrator loop controls and repair injections

Changes:

- Added repeated round fingerprint detection and `tool_repetition_limit`.
- Added read-loop detection for mutation intents.
- Added required-field failure tracking by `op + field`.
- Injected repair instructions after repeated failures.
- Added compact payload shaping for gateway tool outputs.

Relevant file:

- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts`

Result:

- Limited runaway loops and reduced wasted rounds.
- Did not complete the user task by itself; it mainly failed fast.

## 4) Observability: actual routed model in prompt dumps

Changes:

- Captured actual model/provider/request_id/cache/reasoning/system_fingerprint from runtime stream metadata and headers.
- Appended `LLM ROUTING (ACTUAL)` section to prompt dumps.

Relevant files:

- `packages/smart-llm/src/smart-llm-service.ts`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts`

Result:

- Confirmed failing loops were often on `x-ai/grok-4.1-fast` in reviewed production-like dumps.
- Also captured prior instability examples from logs (including OpenRouter retries and provider switching behavior).

## 5) Deterministic recovery for this intent (latest fix)

Changes:

- Added targeted fallback in `stream-orchestrator` for intent matching "organize unlinked docs".
- When repeated read loops or repeated missing `document_id` failures are detected:
    - fetch `onto.document.tree.get`,
    - derive unlinked document IDs,
    - move each unlinked doc into root with `onto.document.tree.move`,
    - emit a completion summary,
    - end with `finished_reason=stop` instead of `tool_repetition_limit`.

Relevant file:

- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts`

Related tests:

- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts`

Result:

- Unit tests pass for both failure patterns:
    - repeated missing `document_id` write failures,
    - repeated read-only tree-load loops.
- This is the first fix that converts the loop into task completion for this specific intent.

## Current State (As Of 2026-02-15)

What is now true:

- We can identify which model/provider actually handled each pass from prompt dumps.
- Repetition and failure patterns are explicitly detected earlier.
- For the target incident intent (`organize unlinked docs`), there is now a deterministic completion path that does not depend on the model recovering itself.

What remains true:

- The underlying model behavior can still degrade (tool argument compliance is not fully reliable across providers/models).
- The deterministic recovery is currently narrow and intent-specific.
- The flow currently organizes unlinked docs into the tree; it does not automatically handle duplicate deletion decisions.
- Some prompt dumps with `session_1` are local test artifacts and should not be treated as production behavior samples.

## Root Cause Assessment

Most likely composite cause:

1. Gateway mode compressed tool surface but increased dependence on correct multi-step schema reasoning.
2. The model occasionally drifted into repetitive discovery/read loops instead of committing to valid write calls.
3. When it did write, required arg construction for document ops was inconsistent (`document_id` missing).
4. Existing safety limits prioritized stop conditions over deterministic task completion.

This is why prompt-only fixes were not enough.

## Validation Status

Verified:

- `pnpm --dir apps/web exec vitest run src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts`

Not yet fully verified:

- fresh end-to-end manual run in the live `/api/agent/v2/stream` path after the deterministic recovery patch, using real gateway-enabled settings and real model routing.

## Recommended Next Steps

1. Run a live verification with `AGENTIC_CHAT_TOOL_GATEWAY=true` and prompt `organize unlinked docs`.
2. Confirm prompt dump includes `LLM ROUTING (ACTUAL)` and that run ends with `finished_reason=stop`.
3. Add telemetry event when deterministic recovery triggers so we can track fallback frequency by model.
4. Decide whether to generalize deterministic recovery to other high-frequency mutation intents (or keep it narrowly scoped).
