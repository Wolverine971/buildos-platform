<!-- apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/REFACTOR-STATUS.md -->

# Stream Orchestrator Refactor Status

Updated: 2026-04-11

## Summary

The refactor has moved `streamFastChat` out of the original single-file layout and into a contained `stream-orchestrator/` folder while preserving the public import path.

The main orchestrator implementation in `index.ts` is now `1103` lines, down from the original `3979` lines.

## Improvements Completed

### 1. Containment and Stable Public API

- Created the `stream-orchestrator/` folder as the home for the refactor.
- Kept the existing import surface stable with the shim at `../stream-orchestrator.ts`.
- Added a living plan document in `README.md`.

### 2. Assistant Text Cleanup Extraction

- Moved assistant scratchpad filtering and lead-in sanitization into `assistant-text-sanitization.ts`.
- Reduced noise inside the orchestration loop and made the assistant-text rules easier to inspect in isolation.

### 3. Tool Payload Compaction Extraction

- Moved tool result shaping and payload truncation into `tool-payload-compaction.ts`.
- Isolated model-replay payload formatting from orchestration control flow.

### 4. Tool Argument Handling Extraction

- Moved tool argument parsing, malformed JSON recovery, normalization, anomaly inspection, and replay sanitization into `tool-arguments.ts`.
- Reduced the amount of parsing and normalization logic embedded inside the orchestrator.

### 5. Prompt Dump and Runtime Debug Extraction

- Moved prompt dump creation and runtime metadata append logic into `prompt-dump-debug.ts`.
- Separated debug I/O from the main orchestration path.

### 6. Validation Extraction

- Moved schema-aware tool validation into `tool-validation.ts`.
- Separated argument validation, UUID validation, exact-op discovery guards, and gateway validation context from the main orchestration file.

### 7. Shared Type Cleanup

- Introduced `shared.ts` for shared orchestrator-local types used across helper modules.

### 8. Repair Policy Extraction

- Moved repair-instruction builders, mutation-integrity checks, and repeated guidance text into `repair-instructions.ts`.
- Reduced the amount of behavior-sensitive policy text embedded directly in the main orchestration loop.

### 9. Round Analysis Extraction

- Moved round fingerprinting, repeated-read detection helpers, gateway result analysis, and required-field failure extraction into `round-analysis.ts`.
- Reduced the amount of repetition-analysis and gateway-result inspection logic embedded in `index.ts`.

## Current Folder Structure

- `index.ts`
  Main orchestration loop and remaining policy / recovery logic.
- `assistant-text-sanitization.ts`
  Assistant text cleanup helpers.
- `tool-payload-compaction.ts`
  Tool payload shaping helpers.
- `tool-arguments.ts`
  Tool argument parsing and normalization.
- `tool-validation.ts`
  Tool validation helpers.
- `prompt-dump-debug.ts`
  Prompt dump and runtime debug helpers.
- `repair-instructions.ts`
  Repair-policy builders and mutation-integrity helpers.
- `round-analysis.ts`
  Round fingerprinting, repetition analysis, and gateway result helpers.
- `shared.ts`
  Shared local types.
- `README.md`
  Refactor plan and task list.

## Verification Performed

- Focused orchestrator suite:
  `npm run test -- src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts`
- Current result:
  `38/38` orchestrator tests passing

- Direct helper suites:
  `repair-instructions.test.ts` and `round-analysis.test.ts`
- Current focused refactor result:
  `46/46` tests passing across the orchestrator suite and direct helper suites
- Broader `agentic-chat-v2` service result:
  `112/112` tests passing across `18` test files

- Broader app check:
  `npm run check`
- Result:
  the repo still has many unrelated existing `svelte-check` issues outside this refactor area.

- Refactor-area validation:
  after fixing the extracted-module type issues, the filtered `check` output no longer reported the `stream-orchestrator` refactor files.

- Current broader app check:
  `pnpm --dir apps/web check` still reports existing repo-wide `svelte-check` diagnostics outside the extracted orchestrator modules.

## What I Advise Doing Next

### Next Safe Pass

With repair policy and round analysis extracted, the next safe pass is:

- `gateway-recovery.ts`
  Move document-organization recovery and root-help fallback routines here now that their pure helper dependencies live outside `index.ts`.
- Round-processing helper cleanup
  Consider extracting one or two loop-local execution/validation helpers if that can be done without widening mutable shared state.
- Focused helper tests
  Add a few direct unit tests for `tool-arguments.ts`, `tool-validation.ts`, `tool-payload-compaction.ts`, and now `round-analysis.ts` or `repair-instructions.ts` where it buys confidence.

### Why This Order

- The remaining largest chunk is recovery flow and loop-local state management, not raw policy text.
- The pure helpers are now outside the main file, so the next extraction can focus on recovery routines without dragging their supporting analysis code along.
- Once recovery logic is out, `index.ts` should be much closer to orchestration-only code.

### Recommended Guardrails

- Keep `streamFastChat` as the only public entrypoint.
- Keep running the focused orchestrator suite after each extraction.
- Avoid changing repair wording and retry behavior in the same pass as structural moves.
- After the remaining extractions, add a few small unit test files for:
    - `tool-arguments.ts`
    - `tool-validation.ts`
    - `tool-payload-compaction.ts`
    - `round-analysis.ts`
    - `repair-instructions.ts`

## Current Assessment

The refactor is materially cleaner now: `index.ts` is close to half the size it was at the start of this containment pass, and the biggest remaining concentration is recovery flow. The next step is to separate recovery routines from control flow so `index.ts` becomes a readable state machine rather than a mixed state machine plus recovery engine.
