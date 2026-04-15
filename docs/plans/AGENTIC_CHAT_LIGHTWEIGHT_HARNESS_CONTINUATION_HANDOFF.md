<!-- docs/plans/AGENTIC_CHAT_LIGHTWEIGHT_HARNESS_CONTINUATION_HANDOFF.md -->

# Agentic Chat Lightweight Harness Continuation Handoff

Status: Ready for review and continuation
Date: 2026-04-14
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

## Current Test Status

Focused verification has passed:

```bash
pnpm --filter @buildos/web test -- src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts src/lib/services/agentic-chat-v2/prompt-observability.test.ts src/lib/services/agentic-chat-v2/tool-surface-size-report.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.test.ts
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
- Do not add a semantic pre-turn router for the first runtime slice.
- Do not create a new tool execution framework.
- Do not remove FastChat v2 prompt until evals show lite matches or beats it.
- Keep request-level `prompt_variant` as the first runtime selector.
- If a server gate is needed, make it an availability/admin gate, not a new
  permanent runtime fork.
- Keep skill metadata high-level in seed prompts; load full skill files on
  demand.

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

Build Phase 2: prompt preview harness.

Goal:

```text
dev/admin can inspect the lite prompt before it is used live
```

Suggested implementation shape:

```text
apps/web/src/routes/api/admin/agentic-chat/lite-prompt-preview/+server.ts
```

or use the existing admin chat namespace if there is a better local convention.

Endpoint input:

```ts
{
	context_type: ChatContextType;
	entity_id?: string | null;
	project_focus?: {
		projectId?: string;
		projectName?: string | null;
		focusEntityType?: string | null;
		focusEntityId?: string | null;
		focusEntityName?: string | null;
	} | null;
	sample_message?: string;
	include_current_v2?: boolean;
}
```

Endpoint output:

```ts
{
	prompt_variant: "lite_seed_v1";
	lite: {
		system_prompt: string;
		sections: LitePromptSection[];
		context_inventory: LitePromptContextInventory;
		tools_summary: LitePromptToolsSummary;
		cost_breakdown: unknown;
		tool_surface_report: ToolSurfaceSizeReport;
	};
	current_v2?: {
		system_prompt: string;
		cost_breakdown: unknown;
	};
}
```

Implementation guidance:

- Reuse `loadFastChatPromptContext`.
- Reuse `selectFastChatTools`.
- Reuse `buildLitePromptEnvelope`.
- Reuse `buildMasterPrompt` only when `include_current_v2` is true.
- Reuse `buildPromptCostBreakdown`.
- Reuse `buildToolSurfaceSizeReport`.
- Require admin/dev access. Do not expose this to normal users.
- Do not call an LLM.
- Do not mutate data.
- Do not create a new chat session.

## Acceptance For Next Slice

- Can render lite prompt for:
    - global context
    - project context
    - project focused entity context
- Can optionally return current v2 prompt beside lite prompt.
- Output includes section metadata and tool surface size report.
- No live chat behavior changes.
- Focused tests cover auth/shape enough to prevent accidental public exposure.

## Suggested Tests For Next Slice

Add focused tests around the new preview endpoint/service:

```text
global preview returns lite_seed_v1 and sections
project preview includes project id/name and loaded context inventory
focused entity preview includes focus slots
include_current_v2 returns both prompts
non-admin request is rejected
preview does not call streamFastChat or OpenRouterV2Service
```

If endpoint tests are too heavy, first create a server-side service such as:

```text
apps/web/src/lib/services/agentic-chat-lite/preview/build-lite-prompt-preview.ts
```

and test that service directly.

## Verification Commands

Run:

```bash
pnpm --filter @buildos/web test -- src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.test.ts src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts src/lib/services/agentic-chat-v2/prompt-observability.test.ts src/lib/services/agentic-chat-v2/tool-surface-size-report.test.ts
pnpm --filter @buildos/web run report:agentic-tools
```

If the preview endpoint touches context loading:

```bash
pnpm --filter @buildos/web test -- src/lib/services/agentic-chat-v2/context-loader.test.ts src/routes/api/agent/v2/prewarm/server.test.ts
```

## Later Slices

After preview exists:

1. Shadow comparison against prompt snapshots/dumps.
2. Request-level `prompt_variant: "lite_seed_v1"` in the existing v2 endpoint.
3. Persist lite prompt section metadata in prompt snapshots.
4. Add dev/admin UI switch or query-param override.
5. Only after extraction/parameterization, consider `/api/agent/lite/stream`.

## Success Standard

The work is ready to continue only if:

- current v2 chat stays default and unchanged
- lite prompt can be inspected before live runtime use
- prompt size and tool behavior are measurable
- any simplification decision has evidence from prompt dumps, snapshots, evals, or
  targeted tests
