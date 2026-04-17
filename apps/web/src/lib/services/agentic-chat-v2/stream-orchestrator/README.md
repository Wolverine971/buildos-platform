<!-- apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/README.md -->

# Stream Orchestrator Refactor Plan

This folder is the containment boundary for the `streamFastChat` refactor.

## Why This Exists

`streamFastChat` is central to agentic chat and had grown into a single file that mixed several distinct concerns:

- LLM streaming and turn orchestration
- tool argument normalization and recovery
- validation and repair-policy generation
- assistant-text sanitization
- tool payload compaction for model replay
- prompt dump and runtime debug output

That makes changes harder to reason about and raises the odds of subtle regressions.

## Goals

- Keep the public `streamFastChat` entrypoint stable while the internals are reorganized.
- Move helper logic into focused modules that can be read and tested independently.
- Preserve current behavior before attempting policy changes or simplifications.
- Make it obvious which logic is orchestration, validation, recovery, or formatting.

## Non-Goals

- No rewrite of the streaming state machine in the first pass.
- No behavior changes to retry, validation, or autonomous recovery policy unless explicitly justified by tests.
- No broad deletion-first cleanup without proving code is unused.

## Target Structure

- `index.ts`
  The main orchestrator implementation.
- `assistant-text-sanitization.ts`
  Scratchpad filtering and lead-in extraction.
- `tool-payload-compaction.ts`
  Tool result shaping before replaying results back to the model.
- `prompt-dump-debug.ts`
  Prompt dump I/O and runtime metadata helpers.
- `tool-arguments.ts`
  Tool argument parsing, recovery, and replay normalization.
- `tool-validation.ts`
  Schema-aware validation and exact-op guardrails.
- `repair-instructions.ts`
  Repair-policy builders and mutation-integrity guidance.
- `round-analysis.ts`
  Repetition detection, round fingerprinting, and gateway result analysis.
- Future helper modules
  Gateway recovery routines and any remaining loop-local policy extraction.

Importers point directly at `./stream-orchestrator/index` via the barrel in `agentic-chat-v2/index.ts`.

## Refactor Phases

### Phase 1: Containment and Pure Helper Extraction

- [x] Create `stream-orchestrator/` folder.
- [x] Preserve the public entrypoint with a thin shim at the old path.
- [x] Add a living plan doc in the folder.
- [x] Extract assistant-text sanitization helpers.
- [x] Extract tool payload compaction helpers.
- [x] Re-run focused orchestrator tests after each safe extraction.

### Phase 2: Debug and Argument Handling

- [x] Extract prompt dump creation and runtime append helpers.
- [x] Extract tool argument parsing, recovery, and normalization.
- [ ] Keep normalization behavior byte-for-byte compatible where possible.

### Phase 3: Validation and Repair Policy

- [x] Extract schema-aware validation helpers.
- [ ] Consolidate duplicated gateway/project-create policy where practical.
- [x] Split repair-instruction builders from validation flow control.

### Phase 4: Main Loop Reduction

- [ ] Reduce `index.ts` to orchestration-only responsibilities.
- [x] Introduce small, named round-processing helpers.
- [ ] Reduce mutable state fan-out where possible.

## Working Rules

- Preserve behavior first, simplify second.
- Prefer extracting pure functions before moving stateful logic.
- Every refactor step should be covered by the existing orchestrator test suite before proceeding.
- If a helper depends on orchestration-local state, do not force the extraction yet.

## Current Verification Baseline

- Focused suite: `npm run test -- src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts`
- Baseline at start of this effort: `35` tests passing.
- Current status after Phase 1 pass: `35/35` tests passing.
- Current status after Phase 2 safe pass: `35/35` tests passing.
- Current status after Phase 3 validation pass: `35/35` tests passing.
- Current status after repair/round-analysis extraction pass: `35/35` tests passing.
- Current baseline freeze status: `38/38` orchestrator tests passing.
- Current focused baseline with direct helper coverage: `46/46` tests passing across `stream-orchestrator.test.ts`, `repair-instructions.test.ts`, and `round-analysis.test.ts`.
- Broader `agentic-chat-v2` service baseline: `112/112` tests passing across `18` test files.
