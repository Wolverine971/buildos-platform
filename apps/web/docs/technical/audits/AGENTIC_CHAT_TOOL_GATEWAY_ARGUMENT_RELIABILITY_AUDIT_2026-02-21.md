<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_TOOL_GATEWAY_ARGUMENT_RELIABILITY_AUDIT_2026-02-21.md -->

# Agentic Chat Tool Gateway Argument Reliability Audit (2026-02-21)

## Scope

Audit why `AGENTIC_CHAT_TOOL_GATEWAY=true` is still producing invalid/missing tool arguments in FastChat V2 and implement immediate remediations.

Reviewed areas:

- FastChat V2 system prompt construction
- Gateway tool schema/definitions (`tool_help`, `tool_exec`)
- Gateway help payload (`getToolHelp`)
- Runtime validation/repair loop behavior
- Streaming tool-call normalization/parsing
- Runtime prompt/tool-call dumps in `apps/web/.prompt-dumps`

## Evidence Collected

### 1) The model is emitting empty gateway payloads in production sessions

From `apps/web/.prompt-dumps/kimi-tool-calls-2026-02-21.jsonl`:

- `2026-02-21T00:02:33.413Z`: `tool_exec` with `arguments: "{}"`
- `2026-02-21T00:45:06.894Z`: `tool_exec` with `arguments: "{}"`
- `2026-02-21T04:45:33.838Z`: `tool_exec` with `arguments: "{}"`
- `2026-02-21T04:46:26.437Z`: multiple `tool_exec` calls in same turn, all `arguments: "{}"`
- Multiple `tool_help` calls also emitted with `arguments: "{}"` (path omitted)

This directly matches the observed symptom: repeated missing op/args and missing required entity IDs.

### 2) Prompt dumps show repeated tool-loop outcomes

From FastChat dumps:

- `apps/web/.prompt-dumps/fastchat-2026-02-21T04-44-32-130Z.txt`
    - Run summary: `finished_reason=tool_repetition_limit, tool_rounds=3, tool_calls=7`
- `apps/web/.prompt-dumps/fastchat-2026-02-21T04-46-10-753Z.txt`
    - Run summary: `finished_reason=tool_calls, tool_rounds=2, tool_calls=8`

### 3) Existing prompt guidance had rules but lacked concrete, high-salience call contracts

Before remediation, the gateway block had canonical-op guidance and discovery strategy, but it did not strongly enforce:

- explicit tool payload shapes (`tool_help({path})`, `tool_exec({op,args})`)
- hard CRUD ID contract examples
- explicit “never call `tool_exec({})`” examples with concrete valid calls

### 4) `tool_help` output was missing actionable examples

`apps/web/src/lib/services/agentic-chat/tools/registry/tool-help.ts` returned:

- `help.examples = []`
- no `required_args` summary
- no concrete `example_tool_exec` payload template

So even when the model called help, it did not receive practical, ready-to-use call shapes.

### 5) Streaming coercion could collapse malformed tool JSON to `{}`

In `packages/smart-llm/src/smart-llm-service.ts`, `coerceToolCallArguments` could replace malformed tool-call JSON with `"{}"`, which strips any partial signal and often yields generic missing-op/missing-args failures instead of preserving recoverable intent.

## Root Causes

1. **Instruction specificity gap**: rules existed, but CRUD argument contracts were under-specified compared with the model failure mode.
2. **Help payload quality gap**: discovery output was structural, not operational (no concrete examples/templates).
3. **Low-signal repair loop**: validation repair prompt could be stronger for empty-envelope failures.
4. **Parser normalization lossiness**: malformed streamed JSON could be overwritten to `{}`, masking model intent and reducing repair quality.
5. **Root help loop recovery trigger too late**: root-loop fallback was conservative and allowed unnecessary churn before recovery.

## Changes Implemented (This Pass)

### A) Strengthened gateway instruction contract in prompts

Updated:

- `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts`
- `apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts`
- `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`

Added:

- explicit payload contract syntax
- “never call `tool_exec` with `{}` or missing `op/args`”
- CRUD ID contract (`get|update|delete` require exact `<entity>_id`)
- update contract (ID + at least one field)
- concrete examples:
    - `onto.task.update` with `task_id + title`
    - `onto.document.update` with `document_id + content`
- path-selection heuristics by entity type

### B) Upgraded `tool_help` to provide executable guidance

Updated:

- `apps/web/src/lib/services/agentic-chat/tools/registry/tool-help.ts`

Added:

- root-level `command_contract` and `workflow`
- root/directory examples
- op-level `required_args`, `id_args`, `notes`
- generated `example_tool_exec` template per op
- non-empty `examples` payload with minimal valid call
- ID-discovery sequence examples for `onto.<entity>.(get|update|delete)`
- search-op query guidance in notes and examples

### C) Tightened gateway tool JSON schema descriptions

Updated:

- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/gateway.ts`

Added:

- stronger descriptions about required shape/ID contracts
- `minLength: 1` on `tool_exec.op`
- `additionalProperties: false` on gateway parameter objects

### D) Improved runtime validation repair messaging

Updated:

- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts`

Added to repair guidance:

- explicit gateway payload contract reminder
- explicit CRUD/update contracts
- concrete valid call examples
- special handling language for missing `op/args` envelope failures

### E) Earlier root-help loop fallback recovery

Updated:

- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts`

Changed root-help-only recovery trigger from `>= 4` rounds to `>= 2` rounds to reduce wasted loops and force faster list-based grounding.

### F) Improved prompt-dump observability

Updated:

- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts`

Prompt dumps now append actual per-call tool execution summaries (tool/op/success/error), not only pass-level model metadata.

### G) Preserved malformed streamed tool-call args for better recovery

Updated:

- `packages/smart-llm/src/smart-llm-service.ts`

Change:

- for streamed tool-call emission, malformed non-empty JSON is preserved (instead of always collapsing to `{}`), improving downstream validation signal and repair loops.
- request-history normalization still defaults to strict JSON behavior.

## Tests Added/Updated

Updated tests:

- `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts`
- `apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.test.ts`

New tests:

- `apps/web/src/lib/services/agentic-chat/tools/registry/tool-help.test.ts`
- `packages/smart-llm/src/smart-llm-service.test.ts` (malformed streamed tool-call preservation)

Validated suites:

- `apps/web`:
    - `master-prompt-builder.test.ts`
    - `prompt-generation-service.test.ts`
    - `tool-help.test.ts`
    - `stream-orchestrator.test.ts`
    - `tool-execution-service.gateway.test.ts`
- `packages/smart-llm`:
    - `smart-llm-service.test.ts`

All passed.

## Remaining Risks / Next Steps

1. **Model quality contribution**: many failing calls came from `moonshotai/kimi-k2.5` sessions. If failures continue after prompt/help improvements, evaluate model routing policy for gateway turns.
2. **Structured “repair step” injection**: if repeated empty-envelope failures persist, auto-inject a synthetic `tool_help("<likely op>")` bootstrap step could be added.
3. **Runtime metrics**: track post-fix rates for:
    - `tool_exec` calls with missing `op/args`
    - repeated required-field failures
    - root-help loop recoveries
4. **Add golden transcripts**: include regression fixtures from real failing sessions in tests (especially CRUD update/delete flows requiring IDs).

## Follow-Up Incident Remediation (2026-02-21 01:33 AM)

### New failure report

Reported tool failures included:

- `onto.plan.update`: missing `plan_id` + no update fields
- `onto.task.create`: missing `title`
- `onto.edge.link`: missing `src_kind/src_id/dst_kind/dst_id/rel`
- malformed op value:
    - `tool_exec"> <parameter name="op">onto.task.create`

### Additional root causes found

1. **Prompt example mismatch**: some new guidance examples used `task_title` for `onto.task.update` while schema expects `title`.
2. **Alias normalization gap**: gateway execution path did not normalize common field variants often produced by LLMs:
    - `name` vs `title`
    - `plan_name/plan_description` vs `name/description`
    - `from/to/relationship` vs `src_*/dst_*/rel`
3. **Noisy op strings** were not sanitized before registry lookup, causing avoidable `Unknown op` errors.

### Additional fixes applied

- Corrected prompt/help examples from `task_title` to `title` in:
    - `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts`
    - `apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts`
    - `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`
    - `apps/web/src/lib/services/agentic-chat/tools/registry/tool-help.ts`
- Added gateway semantic alias normalization in execution layer:
    - `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`
    - Handles create/update/title/name/description variants and edge-link `from/to/relationship` payloads.
- Added malformed op sanitization before registry dispatch:
    - `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`
    - Extracts valid `onto.*|cal.*|util.*` op tokens from noisy strings when possible.
- Added targeted regression tests:
    - `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.gateway.test.ts`
        - malformed op sanitization
        - create-task name->title alias
        - plan-update alias mapping
        - link-edge from/to/relationship alias mapping

## Final Hardening Pass (2026-02-21)

Additional issues discovered while re-checking prompt dumps and repair paths:

1. A stale repair example still referenced `task_title` in runtime retry instructions.
2. Alias normalization still missed some common nested payload shapes:
    - task creation with `task.name`
    - edge linking with `src.kind/src.id`, `dst.kind/dst.id`, and `relation`
3. Assistant tool-call history normalization could coerce malformed non-empty `function.arguments` to `{}` before the next LLM turn, reducing repair fidelity.
4. `tool_help` defaulting logic could coerce malformed JSON args to `{ path: "root" }`, masking invalid payloads instead of surfacing validation errors.

Additional fixes applied:

- Corrected stale runtime repair example in:
    - `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts`
        - `onto.task.update` example now uses `title` (not `task_title`)
- Expanded semantic alias normalization in:
    - `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`
        - `create_onto_task` / `update_onto_task`: added `task.name -> title`
        - `create_onto_plan` / `update_onto_plan`: added `plan.name -> name`
        - `create_onto_goal` / `update_onto_goal`: added `goal.name -> name`
        - `update_onto_document`: added `document.name -> title`
        - `link_onto_entities`: added `src.*`, `dst.*`, and `relation -> rel`
- Added regression tests in:
    - `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.gateway.test.ts`
        - nested `task.name` alias mapping
        - `src/dst + relation` edge alias mapping
    - `packages/smart-llm/src/smart-llm-service.test.ts`
        - preserve malformed assistant tool-call args when replaying history to model
    - `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts`
        - malformed `tool_help` args are not silently coerced to root defaults
- Updated tool-call replay/normalization in:
    - `packages/smart-llm/src/smart-llm-service.ts`
        - preserve malformed non-empty assistant `tool_calls[].function.arguments` in outbound request history (including Moonshot reasoning-content normalization path)
- Updated tool-help normalization in:
    - `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts`
        - apply `tool_help -> root` default only when args parse cleanly; malformed args now surface as validation failures

## Summary

The primary gaps were not absence of gateway instructions, but lack of concrete, reusable call-shape examples and low-information help output. The remediation now makes the contract explicit in prompts, returns machine-actionable examples in `tool_help`, improves recovery messaging, preserves malformed-stream signals, and improves dump visibility for future debugging.

## Model Routing Remediation (2026-02-22)

### Why tool args were still failing after prompt/schema hardening

Even with improved instructions and arg normalization, model routing still had two reliability issues:

1. **Kimi was still being force-prioritized for any tool-enabled turn** when `routeKimiModelsDirectToMoonshot=true`, regardless of profile ordering.
2. **Tool-capable model selection preserved profile order** instead of a dedicated tool-reliability order. In practice, this could select lower-fidelity models first for tool argument construction.

Production evidence from `apps/web/.prompt-dumps/kimi-tool-calls-2026-02-21.jsonl` remained strongly negative for gateway arg fidelity:

- `tool_exec`: 22 calls total, 12 empty (`{}`), 9 malformed JSON argument payloads
- `tool_help`: 16 calls total, 13 empty (`{}`)

### Changes applied

1. Removed forced Kimi prepend for tool-enabled requests in:
    - `packages/smart-llm/src/smart-llm-service.ts`
2. Re-ranked tool-calling model priority to reliability-first in:
    - `packages/smart-llm/src/model-config.ts`
    - `apps/web/src/lib/services/smart-llm/model-config.ts` (local mirror for parity)
3. Updated `ensureToolCompatibleModels` to always reorder requested tool-capable candidates by `TOOL_CALLING_MODEL_ORDER` (instead of preserving generic profile order) in:
    - `packages/smart-llm/src/model-selection.ts`
    - `apps/web/src/lib/services/smart-llm/model-selection.ts` (local mirror for parity)

New `TOOL_CALLING_MODEL_ORDER` (highest priority first):

1. `openai/gpt-4o-mini`
2. `anthropic/claude-haiku-4.5`
3. `x-ai/grok-4.1-fast`
4. `anthropic/claude-sonnet-4`
5. `openai/gpt-4o`
6. `minimax/minimax-m2.1`
7. `qwen/qwen3-32b`
8. `deepseek/deepseek-chat`
9. `deepseek/deepseek-r1`
10. `z-ai/glm-4.7`
11. `google/gemini-2.5-flash`
12. `moonshotai/kimi-k2.5`
13. `moonshotai/kimi-k2-thinking`

### Test coverage added

Added:

- `packages/smart-llm/src/model-selection.test.ts`
    - verifies tool-capable candidates are reordered by reliability priority
    - verifies fallback to full tool-calling order when requested set is not tool-capable

Updated:

- `packages/smart-llm/src/smart-llm-service.test.ts`
    - verifies tool-enabled routing does **not** auto-force Kimi when Moonshot direct routing is enabled

Validation run:

- `pnpm --filter @buildos/smart-llm test:run -- src/model-selection.test.ts src/smart-llm-service.test.ts`
- `pnpm --filter @buildos/smart-llm typecheck`

Both passed.
