<!-- docs/plans/AGENTIC_CHAT_LIGHTWEIGHT_HARNESS_CONTINUATION_HANDOFF.md -->

# Agentic Chat Lightweight Harness Continuation Handoff

Status: **Superseded by the 2026-04-16 lite prompt consolidation.** The FastChat v2 builder and its routing have been removed; `lite_seed_v1` is now the only live prompt path. This handoff remains for historical context. New work should start from the consolidation spec: [docs/specs/agentic-chat-lite-prompt-consolidation-2026-04-16.md](../specs/agentic-chat-lite-prompt-consolidation-2026-04-16.md).
Date: 2026-04-15
Owner: BuildOS Agentic Chat

## Purpose

Give another agent enough context to review the work completed so far for
`AGENTIC_CHAT_LIGHTWEIGHT_HARNESS_PLAN.md`, verify that it is sane, and continue
with the next implementation slice.

This handoff is intentionally implementation-oriented. The next agent should
start by reviewing the current plan and code, then continue without replacing
the working FastChat v2 path.

## Source Of Truth

Primary plan:

```text
docs/plans/AGENTIC_CHAT_LIGHTWEIGHT_HARNESS_PLAN.md
```

Related docs:

```text
docs/specs/agentic-chat-core-elements.md
docs/specs/agentic-chat-core-elements-part-2-context.md
docs/specs/agentic-chat-seed-context-static-dynamic.md
docs/reports/agentic-chat-initial-seed-context-gap-analysis-2026-04-14.md
docs/plans/AGENTIC_CHAT_CURRENT_PATH_CLEANUP_PROMPT.md
docs/plans/AGENTIC_CHAT_TOOL_SURFACE_OPTIMIZATION_HANDOFF.md
```

## Current Baseline

The cleanup pass made this the canonical path:

```text
UI chat -> /api/agent/v2/stream
UI prewarm -> /api/agent/v2/prewarm
UI cancel -> /api/agent/v2/stream/cancel
LLM provider -> OpenRouterV2Service
Tool mode -> gateway/direct tool surface
Tool prompt text -> compact tool summary, with schemas supplied as model tools
Prompt builder -> agentic-chat-v2/master-prompt-builder.ts
Context loader -> agentic-chat-v2/context-loader.ts
Tool selector -> agentic-chat-v2/tool-selector.ts
Stream loop -> agentic-chat-v2/stream-orchestrator/index.ts
```

Do not reintroduce:

- `OPENROUTER_V2_ENABLED`
- `AGENTIC_CHAT_TOOL_GATEWAY`
- `FASTCHAT_COMPACT_TOOL_PROMPT`
- legacy `/api/agent/stream`
- gateway-disabled or compact-tool-prompt-disabled prompt branches
- old generic gateway names such as `tool_help`, `tool_exec`, `buildos_call`,
  or `execute_op`

## Work Completed So Far

### 1. Phase 1 lite prompt renderer

Implemented a pure prompt harness namespace:

```text
apps/web/src/lib/services/agentic-chat-lite/
  index.ts
  prompt/
    build-lite-prompt.ts
    build-lite-prompt.test.ts
    index.ts
    phase-frame.ts
    types.ts
```

Implemented:

- `buildLitePromptEnvelope(input)`
- `LITE_PROMPT_VARIANT = "lite_seed_v1"`
- inspectable `sections`
- `contextInventory`
- `toolsSummary`
- section char/token estimates
- observability-only `buildLitePhaseFrame(input)`

The live v2 runtime does not use this yet. That is intentional.

### 2. Prompt observability cleanup

Prompt dumps now make provider tool schemas explicit:

- current request tool count
- total provider tool-definition chars/tokens
- per-tool char/token estimates
- context/profile size matrix for canonical gateway surfaces

Relevant files:

```text
apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/prompt-dump-debug.ts
apps/web/src/lib/services/agentic-chat-v2/tool-surface-size-report.ts
apps/web/scripts/report-agentic-tool-surface-sizes.ts
apps/web/package.json
```

Run:

```bash
pnpm --filter @buildos/web run report:agentic-tools
```

### 3. Context description cleanup

The prompt no longer emits low-signal wording like:

```text
Context type: project.
```

It now describes the useful working location/scope directly.

Relevant file:

```text
apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts
```

### 4. Phase 2 prompt preview harness

Implemented a backend admin preview path:

```text
apps/web/src/lib/services/agentic-chat-lite/preview/
apps/web/src/routes/api/admin/chat/lite-prompt-preview/
```

Implemented:

- `buildLitePromptPreview(input)`
- admin-only `POST /api/admin/chat/lite-prompt-preview`
- lite prompt output with `sections`, `context_inventory`, `tools_summary`,
  `cost_breakdown`, and `tool_surface_report`
- optional current v2 prompt/cost output via `include_current_v2`

Guardrails verified:

- does not call an LLM
- does not create a chat session
- does not mutate data
- rejects unauthenticated and non-admin requests

Note from review:

- The lean gateway surface intentionally does not preload Libri direct tools.
  The v2 prompt test now expects Libri skill metadata without
  `resolve_libri_resource` or `query_libri_library` in the preloaded tool list.

### 5. Phase 3 snapshot shadow comparison harness

Implemented a snapshot-backed shadow comparison path:

```text
apps/web/src/lib/services/agentic-chat-lite/shadow/
apps/web/src/routes/api/admin/chat/lite-shadow-comparison/
```

Implemented:

- `buildLiteShadowComparison({ promptSnapshot })`
- `formatLiteShadowComparisonReport(comparison)`
- admin-only `POST /api/admin/chat/lite-shadow-comparison`

Endpoint input:

```ts
{
	prompt_snapshot_id?: string | null;
	turn_run_id?: string | null;
	include_report?: boolean;
}
```

Output includes:

- `prompt_variant = "lite_seed_v1"`
- stored v2 snapshot metadata
- reconstructed context scope
- v2 and lite cost breakdowns
- v2 and lite provider tool surface reports
- prompt/provider-payload deltas
- tool names kept, added, and removed
- context keys kept, added, and missing
- gaps, including missing `context_payload`

Still intentionally out of scope:

- parsing local `.prompt-dumps` files directly
- running lite by default or for non-admin users

### 6. Phase 4 runtime prompt variant

Implemented the guarded runtime selector inside the existing v2 stream path:

```text
apps/web/src/routes/api/agent/v2/stream/+server.ts
apps/web/src/lib/services/agentic-chat-v2/prompt-variant.ts
apps/web/src/lib/services/agentic-chat-v2/prompt-observability.ts
apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/prompt-dump-debug.ts
supabase/migrations/20260429000001_add_chat_prompt_snapshot_prompt_variant.sql
```

Implemented:

- request-level `prompt_variant`
- default `fastchat_prompt_v1` behavior for untagged requests
- `lite_seed_v1` validation through `normalizeFastChatPromptVariantRequest`
- dev/admin gate for `lite_seed_v1`
- same session/history/context/tool/runtime stream pipeline for both variants
- `buildLitePromptEnvelope` only when the lite variant is selected
- `prompt_variant` persistence on `chat_prompt_snapshots`
- lite section metadata, context inventory, tools summary, prompt cost, and
  tool surface report metadata in `prompt_sections`
- lite section breakdowns in local prompt dumps

Still intentionally out of scope:

- normal-user access to `lite_seed_v1`
- changing the default v2 prompt
- frontend selector or query-param override
- parallel `/api/agent/lite/stream` route

### 7. Phase 6 dev/admin UI switch and eval capture

Implemented dev/admin prompt variant selection and admin/eval visibility:

```text
apps/web/src/lib/components/agent/AgentChatModal.svelte
apps/web/src/lib/components/agent/agent-chat-session.ts
apps/web/src/routes/admin/chat/sessions/+page.svelte
apps/web/src/routes/api/admin/chat/sessions/[id]/session-detail-payload.ts
apps/web/src/lib/services/admin/chat-session-audit-export.ts
apps/web/src/lib/services/agentic-chat-v2/prompt-eval-runner.ts
```

Implemented:

- dev/admin-only `Prompt variant` selector in the chat modal
- normal-user payloads stay untagged and therefore default to `fastchat_prompt_v1`
- `lite_seed_v1` is sent on every turn while the selector is set to lite
- selector stays sticky across sends and conversation resets until changed
- user message metadata records `prompt_variant` for the selected lite turn
- admin session detail prompt snapshots show the prompt variant
- session audit markdown includes prompt variant on each turn
- prompt eval targets include `prompt_snapshot.prompt_variant`
- updated the admin sessions header slot to the Svelte 5 snippet pattern while
  touching that page, clearing the local filtered diagnostic

Still intentionally out of scope:

- normal-user access to `lite_seed_v1`
- persisted prompt variant state across browser reloads or saved sessions
- a parallel `/api/agent/lite/stream` route

### 8. Phase 7 paired eval comparison plumbing

Implemented recorded-evidence comparison support:

```text
apps/web/src/lib/services/agentic-chat-v2/prompt-eval-comparison.ts
apps/web/src/lib/services/agentic-chat-v2/prompt-eval-comparison.test.ts
apps/web/src/lib/services/agentic-chat-v2/prompt-eval-runner.ts
apps/web/src/lib/services/admin/chat-session-audit-export.ts
```

Implemented:

- pure v2-vs-lite scenario grouping by `scenario_slug`
- variant normalization from `prompt_variant`, with fallback to
  `snapshot_version` for older v2 snapshots
- newest-eval selection when a scenario/variant has repeated eval runs
- per-scenario status, missing-evidence, failure, prompt-token, tool-round,
  tool-call, LLM-pass, validation-failure, and failed-assertion comparison
- short decision-note formatter that calls out missing and failed scenario
  counts
- runner helper to convert loaded eval targets into comparison evidence
- session audit markdown `Prompt Variant Comparison` section when eval evidence
  exists

Still intentionally out of scope:

- running live paired turns without an admin/dev operator
- changing the default runtime prompt variant
- turning the comparison verdict into an automated rollout decision

### 9. Phase 8 prompt dump audit and lite context signal pass

Reviewed recent Last Ember prompt dumps, especially:

```text
apps/web/.prompt-dumps/fastchat-2026-04-15T03-52-13-303Z.txt
apps/web/.prompt-dumps/fastchat-2026-04-15T03-40-33-684Z.txt
apps/web/.prompt-dumps/fastchat-2026-04-15T03-45-44-301Z.txt
apps/web/.prompt-dumps/fastchat-2026-04-15T03-49-32-443Z.txt
```

Findings:

- The dump filename/header still says `FASTCHAT V2 PROMPT DUMP` because the lite
  prompt runs through `/api/agent/v2/stream`; use the `Prompt variant` line to
  distinguish `fastchat_prompt_v1` from `lite_seed_v1`.
- The prior lite prompt had useful raw context but weak model-visible summaries:
  focus mostly repeated IDs, timeline counted dated rows instead of explaining
  project status, and inventory exposed top-level keys/object keys that did not
  help the model answer.
- `LITE SECTION BREAKDOWN` and `LITE METADATA` were dump-only diagnostics, but
  the old labels made that boundary easy to misread.

Implemented:

```text
apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts
apps/web/src/lib/services/agentic-chat-lite/prompt/types.ts
apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/prompt-dump-debug.ts
```

Changes:

- lite focus now surfaces the project description, state, primary goal, active
  plan, current next step, and focused entity instead of just context labels
- lite timeline now renders project status, overdue/due-soon work, next
  scheduled work, upcoming dated work, and recent changed entities
- product surface and live stream turn IDs are no longer presented as project
  facts in the model-visible lite prompt
- context inventory was renamed/reframed as `Loaded Data and Retrieval
Boundaries`, with counts, empty loaded sets, source, and fetch rules instead
  of top-level key/object-key lists
- prompt dumps now include `END SYSTEM PROMPT (MODEL INPUT ABOVE)` and label lite
  diagnostics as `DUMP-ONLY ... (NOT SENT TO MODEL)`

Still intentionally out of scope:

- changing FastChat v2 default behavior
- loading full document bodies by default
- adding a separate `/api/agent/lite/stream` route
- replacing the raw context payload with a semantic compression layer

## Current Test Status

Focused verification has passed:

```bash
pnpm --filter @buildos/web test -- src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator/prompt-dump-debug.test.ts
NODE_OPTIONS='--max-old-space-size=8192' pnpm --filter @buildos/web exec svelte-check --output machine | rg "build-lite-prompt|agentic-chat-lite/prompt/types|prompt-dump-debug"
pnpm --filter @buildos/web test -- src/lib/services/agentic-chat-v2/prompt-eval-comparison.test.ts src/lib/services/agentic-chat-v2/prompt-eval-runner.test.ts src/lib/services/admin/chat-session-audit-export.test.ts
pnpm --filter @buildos/web test -- src/lib/components/agent/agent-chat-session.test.ts src/lib/components/agent/agent-chat-formatters.test.ts src/routes/admin/chat/sessions/page.test.ts 'src/routes/api/admin/chat/sessions/[id]/session-detail-payload.test.ts' src/lib/services/admin/chat-session-audit-export.test.ts src/lib/services/agentic-chat-v2/prompt-eval-comparison.test.ts src/lib/services/agentic-chat-v2/prompt-eval-runner.test.ts src/routes/api/agent/v2/stream/server.test.ts src/lib/services/agentic-chat-v2/prompt-variant.test.ts src/lib/services/agentic-chat-v2/prompt-observability.test.ts src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.test.ts src/lib/services/agentic-chat-lite/shadow/compare-lite-shadow.test.ts src/routes/api/admin/chat/lite-shadow-comparison/server.test.ts
pnpm --filter @buildos/web run report:agentic-tools
```

Filtered type/a11y check against new lite/preview/shadow/runtime/UI files produced
no matching diagnostics. The command exits with `1` because `rg` finds no
diagnostic matches; the only output was the existing Browserslist freshness
warning.

```bash
NODE_OPTIONS='--max-old-space-size=8192' pnpm --filter @buildos/web exec svelte-check --output machine | rg "AgentChatModal|AgentChatHeader|agent-chat-session|admin/chat/sessions|session-detail-payload|chat-session-audit-export|prompt-eval-runner|prompt-evaluator|prompt_variant|prompt-variant"
```

Known caveat:

```text
pnpm --filter @buildos/web check
```

is not currently clean in the broader app. It reports unrelated existing
diagnostics outside the lite harness work. Do not treat that as introduced by
the harness without checking exact file ownership.

## Important Constraints

- Do not copy the v2 stream endpoint to create lite.
- Do not change live chat behavior by default.
- Do not add a hidden semantic pre-turn router before testing the first-class
  context navigation tool.
- Do not create a new tool execution framework.
- Do not remove FastChat v2 prompt until evals show lite matches or beats it.
- Keep request-level `prompt_variant` as the first runtime selector.
- If a server gate is needed, make it an availability/admin gate, not a new
  permanent runtime fork.
- Keep skill metadata high-level in seed prompts; load full skill files on
  demand.

### 10. Strategic context zoom tool

Status: implemented on 2026-04-15.

Decision:

- Use a first-class `change_chat_context` tool instead of a hidden
  `turnProfile` builder for the next harness slice.
- Treat zooming as durable state movement, not a transient per-turn guess.
- Let the model choose the shift strategically, with tool/schema guidance that
  makes the rules explicit.

Target behavior:

- zoom out to global/workspace when the user asks for all projects, workspace
  status, cross-project priorities, or an explicit zoom-out
- zoom into a project when the latest request is primarily about one
  identifiable project and project tools should be loaded for the rest of the
  turn
- switch project context when the user is clearly moving focus to another
  resolved project
- do not shift for ambiguous project names, one-off comparisons, or brief side
  mentions

Implementation scope:

- add `change_chat_context` as a preloaded global/project direct tool
- return existing `context_shift` payloads so the UI/session metadata path stays
  visible
- allow global context shifts without `entity_id`
- return `materialized_tools` so the stream loop can load the target context
  direct-tool profile mid-turn
- update lite operating strategy so context shifts are sticky and deliberate

Verification:

- `pnpm --filter @buildos/web test -- src/lib/services/agentic-chat-v2/tool-selector.test.ts src/lib/services/agentic-chat/tools/core/executors/utility-executor.overview.test.ts src/routes/api/agent/v2/stream/server.test.ts src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.test.ts src/lib/components/agent/agent-chat-session.test.ts`
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @buildos/web exec svelte-check --output machine`
  still fails on existing repo-wide diagnostics, but no diagnostics match files
  touched by the context zoom slice.

## Recommended Review Checklist

Before continuing, review:

```text
docs/plans/AGENTIC_CHAT_LIGHTWEIGHT_HARNESS_PLAN.md
apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts
apps/web/src/lib/services/agentic-chat-lite/prompt/types.ts
apps/web/src/lib/services/agentic-chat-lite/prompt/phase-frame.ts
apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.test.ts
apps/web/src/lib/services/agentic-chat-v2/tool-surface-size-report.ts
apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/prompt-dump-debug.ts
```

Questions to answer in review:

1. Does `buildLitePromptEnvelope` make the full section order obvious?
2. Are the 5W1H concepts represented without forcing artificial sections?
3. Are `where` and `when` useful enough for global, project, and focused entity
   contexts?
4. Is the lite renderer still pure and side-effect free?
5. Are dynamic slots clear enough for prompt preview/debug surfaces?
6. Is the current context inventory too verbose or too generic?
7. Does phase-frame output capture enough lifecycle state without becoming
   model-visible by default?
8. Are the tests specific enough to protect the intended shape?

## Recommended Next Slice

Evaluate the first-class context zoom tool before designing any hidden
per-turn router.

Goal:

```text
prove that context changes can be explicit, sticky, visible, and low-churn
without a separate pre-turn classifier
```

Suggested implementation shape:

```text
apps/web/src/lib/services/agentic-chat-v2/prompt-eval-runner.ts
apps/web/src/lib/services/agentic-chat-v2/prompt-eval-scenarios.ts
apps/web/src/routes/admin/chat/sessions/
apps/web/src/routes/api/agent/v2/stream/+server.ts
apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts
```

Implementation guidance:

- Add eval/prompt-dump scenarios where the user starts global, mentions one
  project, then follows up with project-specific work.
- Compare whether `change_chat_context` fires early enough and whether the
  target context tools materialize without generic discovery churn.
- Add scenarios for ambiguous project names and multi-project comparison to
  verify the model does not bounce contexts.
- Only revisit a hidden `turnProfile` builder if the tool-based approach cannot
  reliably shift at the right time or produces too many wasted tool rounds.

## Acceptance For Next Slice

- global-to-project turns use `change_chat_context` before project-specific work
- project read tools are available after the context shift in the same turn
- ambiguous project references return candidates instead of shifting context
- evals assert lower tool-search churn on project follow-up turns
- explicit context shifts remain visible through existing `context_shift` events

## Suggested Tests For Next Slice

Add focused tests around context navigation:

```text
change_chat_context emits global context_shift without entity_id
change_chat_context emits project context_shift only after resolved project match
context_change materialized_tools load target context direct tools
project continuation eval avoids redundant tool_search calls
```

## Verification Commands

Run:

```bash
pnpm --filter @buildos/web test -- src/lib/services/agentic-chat-v2/prompt-eval-comparison.test.ts src/lib/services/agentic-chat-v2/prompt-eval-runner.test.ts src/lib/services/agentic-chat-v2/prompt-evaluator.test.ts src/lib/services/admin/chat-session-audit-export.test.ts src/routes/api/admin/chat/evals/run/server.test.ts src/routes/admin/chat/sessions/page.test.ts
pnpm --filter @buildos/web run report:agentic-tools
```

## Later Slices

After paired eval evidence exists:

1. Decide whether lite should continue, be revised, or be abandoned.
2. If lite continues, refine the prompt or tool-surface assumptions from the
   observed failures.
3. Only after extraction/parameterization, consider `/api/agent/lite/stream`.

## Success Standard

The work is ready to continue only if:

- current v2 chat stays default and unchanged
- lite prompt can be inspected before live runtime use
- prompt size and tool behavior are measurable
- any simplification decision has evidence from prompt dumps, snapshots, evals, or
  targeted tests
