<!-- apps/web/docs/technical/audits/FASTCHAT_PROMPT_DUMPS_ASSESSMENT_2026-02-13.md -->

# Fastchat Prompt Dumps Assessment (2026-02-13)

## Scope

- Reviewed `apps/web/.prompt-dumps/fastchat-*.txt` (47 dumps, Feb 7 to Feb 12, 2026).
- Deep review focus: newest sequence in session `71444276-933b-4e59-8c4f-05637e01e05f`:
- `apps/web/.prompt-dumps/fastchat-2026-02-12T20-56-20-697Z.txt`
- `apps/web/.prompt-dumps/fastchat-2026-02-12T20-56-54-108Z.txt`
- `apps/web/.prompt-dumps/fastchat-2026-02-12T20-58-24-651Z.txt`
- `apps/web/.prompt-dumps/fastchat-2026-02-12T20-59-01-026Z.txt`
- `apps/web/.prompt-dumps/fastchat-2026-02-12T21-01-02-114Z.txt`

## Executive Summary

The prompt assembly is functional but inefficient. The largest issue is schema overhead: tool definitions dominate each prompt, especially in global mode. The second issue is history quality: streamed assistant fragments and continuity hints create duplication and potential confusion. The newest prompts are more stable than older ones, but they still carry avoidable token cost and instruction pressure that can cause verbose or over-eager behavior.

## Quantitative Findings

### 1) Tool schema dominates the prompt budget

- Across all 47 dumps: average file size `106,861` chars.
- Across all 47 dumps: average tool definition payload `71,794` chars (`67.2%` of prompt dump bytes).
- Global context (latest style): tools average `85.21%` of bytes.
- Newest dump example:
- `apps/web/.prompt-dumps/fastchat-2026-02-12T21-01-02-114Z.txt`: `104,979` bytes total, `84,338` tool chars (`80.34%`).
- In the earliest turn of that same session, tools were `91.23%` of prompt bytes.

### 2) A single tool contributes outsized overhead

- In the latest dump, `create_onto_project` alone is ~`11,846` chars (`desc=5105`, `params=6369`).
- Evidence:
- `apps/web/.prompt-dumps/fastchat-2026-02-12T21-01-02-114Z.txt:754`

### 3) History quality issue: streamed fragments are being persisted

- In the latest file, one assistant entry contains repeated and partially conflicting progress statements (create, done, create again, done again).
- This adds noise and can degrade next-turn reasoning.
- Evidence:
- `apps/web/.prompt-dumps/fastchat-2026-02-12T21-01-02-114Z.txt:229`

### 4) Redundant context layers exist in the same prompt

- Prompt contains full conversation history, plus a continuity summary hint, plus a dedicated current-user-message block.
- Redundant stacking increases cost and can create inconsistent prioritization.
- Evidence:
- `apps/web/.prompt-dumps/fastchat-2026-02-12T21-01-02-114Z.txt:245`
- `apps/web/.prompt-dumps/fastchat-2026-02-12T21-01-02-114Z.txt:254`

### 5) Context packing is uneven between global and project modes

- Project context dumps often include large raw payloads (`doc_structure`, tasks, etc.).
- Example outlier:
- `apps/web/.prompt-dumps/fastchat-2026-02-08T00-17-50-122Z.txt` has `System prompt length: 50507` with large data sections:
- `doc_structure` at `:85`
- `tasks` at `:236`
- Tools still appended at `:1311`

### 6) “System prompt length” appears semantically mislabeled

- Reported `System prompt length` closely tracks `instructions + context + data`, not instructions alone.
- This can mislead prompt-budget debugging and optimization tracking.

## Instruction-Level Observations (Newest Prompts)

- Instruction quality is stronger than earlier versions (clearer structure, explicit doc-tree rules, proactive guidance).
- There is still pressure toward verbosity and over-action:
- “capture ALL details”
- “prefer action over clarification”
- aggressive proactive follow-up behavior
- Combined effect can produce overlong responses and higher mutation risk when user intent is partially specified.

## What Improved Recently

- Prompt instruction version appears stable in the newest runs.
- Tool count reduced from older `56/57` to `51` in latest global dumps.
- Global dumps now avoid giant project data blobs (`data` is small in newest five files).

## Prioritized Optimizations

### P0 (high impact, low-medium effort)

1. Send only relevant tool schemas per turn (intent-routed subset), not all 51 tools.
2. Store only finalized assistant text in history; do not persist raw streamed interim fragments.
3. Keep either full history or continuity hint by default, not both.
4. Add hard budgets per section (`tools`, `history`, `data`) and log overages.

### P1 (high impact, medium effort)

1. Introduce adaptive context packing for project mode.
2. Use compact summaries for large lists (`doc_structure`, `tasks`) unless user asks for details.
3. Split prompt modes (`read-only`, `mutation`, `creation-heavy`) and load tool/context profiles accordingly.
4. Shrink oversized tool descriptions (especially `create_onto_project`) and move long examples to server-side docs/reference memory.

### P2 (quality + maintainability)

1. Add automated prompt QA checks for:

- duplicate assistant chunks in history
- redundant context blocks
- schema-to-content ratio regressions

2. Rename or clarify telemetry fields (`system prompt length` vs total prompt payload length).

## Practical Impact Estimate

- In newest global prompts, reducing tool payload alone can cut prompt size by roughly `80k+` chars per turn.
- Cleaning history duplication and continuity redundancy can further reduce cost and improve reasoning consistency.
- Combined changes should materially lower latency and token spend while improving response reliability.

## Suggested Rollout Order

1. Implement P0 #1 and #2 first (largest immediate gain).
2. Add section budgets and telemetry guardrails.
3. Implement adaptive project context packing.
4. Refine instruction pressure once cost/noise issues are under control.

---

## Reassessment Update (2026-02-13, after prompt-dump cleanup + same-day changes)

### Updated Scope

- Current dump set now contains `7` files (older dumps were deleted):
- `apps/web/.prompt-dumps/fastchat-2026-02-13T04-28-20-298Z.txt`
- `apps/web/.prompt-dumps/fastchat-2026-02-13T04-29-15-176Z.txt`
- `apps/web/.prompt-dumps/fastchat-2026-02-13T13-47-06-802Z.txt`
- `apps/web/.prompt-dumps/fastchat-2026-02-13T19-43-07-932Z.txt`
- `apps/web/.prompt-dumps/fastchat-2026-02-13T19-45-15-393Z.txt`
- `apps/web/.prompt-dumps/fastchat-2026-02-13T19-55-54-949Z.txt`
- `apps/web/.prompt-dumps/fastchat-2026-02-13T19-57-55-954Z.txt`

### Current Quantitative Snapshot

- Across current 7 dumps:
- Average file size: `78,549` bytes (down from `106,861` in previous sample).
- Average tool-definition section: `66,383` chars (`83.7%` of payload).
- Average data section: `2,363` chars (`2.74%` of payload).
- Context split:
- `project` (`6` files): avg `86,416` bytes, tools `85.21%`, and `57` tools loaded each turn.
- `project_create` (`1` file): `31,346` bytes, tools `75.47%`, `6` tools loaded.

### Current Findings

#### 1) Prompt size improved, but mostly from smaller data/history payloads (not tool routing)

- Total prompt size is materially smaller than the prior 47-dump baseline.
- However, tools still dominate bytes in project turns (`~85%`), so core schema overhead remains.
- Evidence:
- `apps/web/.prompt-dumps/fastchat-2026-02-13T19-57-55-954Z.txt:8`
- `apps/web/.prompt-dumps/fastchat-2026-02-13T19-45-15-393Z.txt:8`

#### 2) Tool subset optimization is not in effect for project mode

- All sampled `project` turns load the same `57` tools.
- This conflicts with the earlier trajectory toward tighter per-turn tool subsets.
- Evidence:
- `apps/web/.prompt-dumps/fastchat-2026-02-13T04-29-15-176Z.txt:8`
- `apps/web/.prompt-dumps/fastchat-2026-02-13T13-47-06-802Z.txt:8`
- `apps/web/.prompt-dumps/fastchat-2026-02-13T19-55-54-949Z.txt:8`

#### 3) Continuity-hint redundancy improved

- In the current sample, continuity hints are consistently disabled while history is present.
- This removes the previously observed “history + continuity hint + current message” stacking issue.
- Evidence:
- `apps/web/.prompt-dumps/fastchat-2026-02-13T19-57-55-954Z.txt:15`
- `apps/web/.prompt-dumps/fastchat-2026-02-13T04-29-15-176Z.txt:15`

#### 4) Streamed assistant-fragment persistence is still partially present

- Two files still show concatenated assistant lead-in + final answer persisted into one history entry.
- One newer sample is clean, so this appears intermittent rather than fully resolved.
- Evidence (duplicated lead-in pattern):
- `apps/web/.prompt-dumps/fastchat-2026-02-13T04-29-15-176Z.txt:209`
- `apps/web/.prompt-dumps/fastchat-2026-02-13T04-29-15-176Z.txt:211`
- `apps/web/.prompt-dumps/fastchat-2026-02-13T19-45-15-393Z.txt:193`
- `apps/web/.prompt-dumps/fastchat-2026-02-13T19-45-15-393Z.txt:195`
- Clean sample for contrast:
- `apps/web/.prompt-dumps/fastchat-2026-02-13T19-57-55-954Z.txt:204`

#### 5) “System prompt length” telemetry label is still semantically misleading

- Field still logs full `systemPrompt` payload (instructions + context + data), not instructions-only.
- Example in current dump: reported `11754`, while extracted `instructions + context + data` is `11750` (near-identical, framing overhead only).
- Evidence:
- `apps/web/.prompt-dumps/fastchat-2026-02-13T19-57-55-954Z.txt:17`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts:116`

#### 6) Root-cause signal for duplicated assistant content remains in stream persistence path

- Stream handler appends every streamed text chunk across tool rounds into `state.assistantResponse`.
- That aggregated string is later persisted as a single assistant message.
- This aligns with the duplicated lead-ins seen in history dumps.
- Evidence:
- `apps/web/src/routes/api/agent/stream/services/stream-handler.ts:685`
- `apps/web/src/routes/api/agent/stream/services/stream-handler.ts:393`

### Test/QA State (targeted)

- `pnpm test src/routes/api/onto/shared/markdown-normalization.test.ts` ✅ (4 tests)
- `pnpm test src/lib/services/agentic-chat-v2/history-composer.test.ts src/routes/api/agent/stream/services/stream-handler.test.ts` ✅ (5 tests)
- Gap: existing `stream-handler` test only asserts error/done ordering, not multi-round text persistence behavior.
- Evidence:
- `apps/web/src/routes/api/agent/stream/services/stream-handler.test.ts:65`

### Updated Priority Order

1. P0: persist finalized assistant output per turn (or explicitly segment pre-tool lead-in from post-tool final response) to stop history duplication.
2. P0: enforce intent-routed tool subset in project mode; loading all `57` tools is still the dominant cost driver.
3. P1: add regression test for multi-round tool turns asserting exactly one canonical assistant history message.
4. P1: rename telemetry to clarify `system_prompt_payload_length` vs instruction-only length.
