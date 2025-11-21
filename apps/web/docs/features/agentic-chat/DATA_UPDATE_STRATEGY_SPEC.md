# Data Update Strategy — Agentic Chat

- **Problem**: Update tools overwrite existing content (e.g., ontology documents) when the planner sends partial text. Subsequent research saves wipe prior content because the tool layer only PATCHes the provided fields.
- **Goal**: Let the planner specify an update strategy (`replace`, `append`, `merge_llm`) so the executor can safely combine new content with existing data. Offload text merging to a small LLM helper when requested.
- **Scope (v1)**: Ontology document updates in agentic chat. Keep backwards compatibility (default `replace`). Extendable to other ontology entities later.

## Requirements

- **Explicit strategies**: Tool args carry `update_strategy` + optional `merge_instructions`.
- **Safe defaults**: If absent, behave exactly like today (`replace`).
- **LLM assist**: `merge_llm` uses a lightweight SmartLLMService call with a guardrail prompt.
- **No silent clears**: If `body_markdown` is missing/undefined, do not alter content.
- **Append ergonomics**: If no existing content, `append` behaves like `replace`.
- **Observability**: Tag the LLM helper with `operationType` for usage logging.

## Proposed Design

### Tool schema

- Add optional fields to `update_onto_document`:
    - `update_strategy`: enum `['replace', 'append', 'merge_llm']` (default `replace`).
    - `merge_instructions`: string (guidance for merge).
- Planner prompt hint: it can pick the strategy instead of building diffs.

### Executor flow (update_onto_document)

1. Read `update_strategy` (default `replace`).
2. If `body_markdown` is provided:
    - `replace`: use provided content.
    - `append`: fetch existing doc, append with double newline; if none, just use new.
    - `merge_llm`: fetch existing doc, call SmartLLMService helper to produce merged markdown using existing + new + `merge_instructions`; fallback to append if helper fails/unavailable.
3. PATCH final `body_markdown` to `/api/onto/documents/[id]` (same endpoint).

### SmartLLMService helper

- New method: compose updated text given existing/new content + strategy metadata.
- Uses balanced text profile, low max tokens (~1500-2000), temperature ~0.4.
- Prompt enforces: preserve structure, keep existing unless explicitly replaced, return only markdown.
- Returns the merged markdown string (usage logged via `operationType: 'agentic_chat_content_merge'`).

### UI / planner display

- Tool formatter can stay unchanged; optional: include strategy in activity metadata for future UI surfacing.

### Backwards compatibility & failure modes

- No strategy provided → `replace`.
- Missing LLM helper or LLM error → fallback to append with a console warn.
- Empty `body_markdown` still allowed (explicit clear).

## Out of scope (v1)

- Extending strategies to tasks/plans/goals (future).
- Server-side endpoint changes (kept client-side for speed).
- Rich diff visualization in UI.

## Acceptance criteria

- Tool calls can include `update_strategy`/`merge_instructions` without breaking existing calls.
- Append operations no longer wipe existing document text.
- `merge_llm` produces merged markdown and does not remove unrelated existing sections.
- Usage logs show the merge helper under `agentic_chat_content_merge`.
- Existing behaviors remain unchanged when strategy is omitted.
