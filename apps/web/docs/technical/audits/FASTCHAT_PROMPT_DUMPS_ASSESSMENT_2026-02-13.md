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
