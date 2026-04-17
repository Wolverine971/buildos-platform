<!-- docs/plans/AGENTIC_CHAT_CURRENT_PATH_CLEANUP_PROMPT.md -->

# Agentic Chat Current Path Cleanup Prompt

Status: **Largely completed by the 2026-04-16 lite prompt consolidation.** The FastChat v2 builder, its admin-gating, and the prompt-variant routing have been removed; `lite_seed_v1` is now the only live prompt path. The frontend variant-picker UI was also removed. Remaining cleanup (observability label renames, admin dashboard grouping) is tracked in the consolidation spec's deferred work section: [docs/specs/agentic-chat-lite-prompt-consolidation-2026-04-16.md](../specs/agentic-chat-lite-prompt-consolidation-2026-04-16.md).
Date: 2026-04-14
Owner: BuildOS Agentic Chat

## Purpose

This document kicks off a cleanup effort before the lightweight prompt harness
work begins.

BuildOS agentic chat currently works, but the code still carries old prompt
builders, old endpoint structure, old tool gateway compatibility paths, and
environment-variable branches for flows we no longer intend to support.

The cleanup goal is not to redesign chat. The goal is to make the current
working path the only path, then delete or quarantine everything else.

## Canonical Current Path

Treat this as the path forward:

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

These settings should no longer be runtime choices:

```text
OPENROUTER_V2_ENABLED=true
AGENTIC_CHAT_TOOL_GATEWAY=true
FASTCHAT_COMPACT_TOOL_PROMPT=true
```

Make them true by construction and remove the disabled branches.

## Copy/Paste Prompt For Cleanup Agent

```text
You are working in /Users/djwayne/buildos-platform.

Goal:
Clean up BuildOS agentic chat by making the current production path canonical:
/api/agent/v2/stream, /api/agent/v2/prewarm, OpenRouterV2Service, and the
gateway/direct tool surface. Remove obsolete prompt/runtime branches and old
endpoint/orchestrator code that is no longer used by the product.

Do not build the new lightweight prompt harness yet. Do not redesign the prompt
shape yet. This is a cleanup and hardening pass so the next prompt work happens
on a smaller codebase.

Canonical decisions:
- OpenRouter v2 is always on for agentic chat.
- Tool gateway mode is always on for agentic chat.
- Compact tool prompt mode is always on for agentic chat; do not duplicate full
  tool schemas inside the text prompt when model tool definitions already carry
  them.
- The model-facing v2 tool contract is skill_load, tool_search, tool_schema,
  plus context-specific direct tools from getGatewaySurfaceForContextType.
- The v2 master prompt builder is the only live chat prompt builder.
- The v2 context loader is the only live chat context hydration path.
- The old /api/agent/stream route is not the product chat path.

Required first step:
Inventory imports and runtime callers before deleting anything. Use rg and the
test suite to distinguish dead legacy chat code from shared live tool
infrastructure. Do not delete agentic-chat/tools wholesale; v2 still uses the
tool registry, skills, executors, gateway surface, Libri tools, and shared
types.

Primary cleanup targets:
1. Remove OPENROUTER_V2_ENABLED branching from the v2 stream path and agent
   state reconciliation. Instantiate OpenRouterV2Service directly for agentic
   chat.
2. Remove AGENTIC_CHAT_TOOL_GATEWAY branching. Make gateway/direct tool mode the
   only agentic chat mode.
3. Remove FASTCHAT_COMPACT_TOOL_PROMPT branching by making compact tool prompt
   text the default. Tool schemas should live in model tool definitions, not be
   duplicated in the system prompt.
4. Remove non-gateway tool selection and prompt branches once tests are updated.
5. Retire or delete old /api/agent/stream and /api/agent/prewarm code if no live
   product callers remain. If a session-read capability is still needed, create
   or reuse a v2-specific read path rather than keeping the old stream endpoint
   alive as a hidden dependency.
6. Retire old prompt generation paths that only served the legacy
   AgentChatOrchestrator flow.
7. Keep shared tool infrastructure used by v2:
   agentic-chat/tools/**, ToolExecutionService, gateway-surface,
   tool-search/tool-schema, skill-load, Libri, timing helpers, and shared types.
8. Update tests and docs so they no longer describe gateway=false,
   compact-tool-prompt=false, or OpenRouterV2=false as supported agentic chat
   modes.

Guardrails:
- Do not change user-facing chat behavior intentionally.
- Do not remove persisted observability tables or prompt snapshot support.
- Do not remove compatibility needed only for reading old stored traces unless
  you also update admin/replay code that depends on it.
- Prefer small commits by cleanup category.
- After each category, run focused tests before moving on.

Acceptance criteria:
- /api/agent/v2/stream still handles normal chat turns.
- /api/agent/v2/prewarm still works from AgentChatModal.
- /api/agent/v2/stream/cancel still works.
- The v2 prompt still builds for global, project, project_create, calendar,
  daily_brief, project_audit, and project_forecast contexts.
- Gateway/direct tools are always selected without env flags.
- Tool schemas are not duplicated in the text prompt by default.
- OpenRouterV2Service is always used for agentic chat LLM calls.
- No live product code calls /api/agent/stream or /api/agent/prewarm.
- Tests no longer assert the old gateway-disabled or OpenRouter-disabled flows.
- Docs/env examples no longer instruct operators to choose those old flows.
```

## Cleanup Rationale

Right now, the code is harder to reason about because multiple eras coexist:

- legacy `/api/agent/stream` route
- v2 `/api/agent/v2/stream` route
- old planner/executor orchestration services
- v2 FastChat stream orchestrator
- old prompt generation service
- v2 master prompt builder
- gateway-disabled tool selection
- gateway/direct tool mode
- SmartLLMService fallback branch
- OpenRouterV2Service branch
- compact-vs-full tool prompt branch
- legacy gateway names such as `tool_help`, `tool_exec`, `buildos_call`, and
  `execute_op`

Some of this is still useful shared infrastructure. Some is no longer product
surface area. The cleanup should separate those two categories sharply.

## What To Preserve

Preserve these unless a later audit proves they are unused:

- `apps/web/src/lib/services/agentic-chat-v2/**`
- `apps/web/src/routes/api/agent/v2/**`
- `apps/web/src/lib/services/agentic-chat/tools/**`
- `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`
- `apps/web/src/lib/services/agentic-chat/shared/types.ts`
- `apps/web/src/lib/services/agentic-chat/shared/timing-metrics.ts`
- `apps/web/src/lib/services/agentic-chat/state/agent-state-reconciliation-service.ts`
- `apps/web/src/lib/services/openrouter-v2-service.ts`
- `apps/web/src/lib/services/openrouter-v2/**`
- prompt observability and turn-run persistence
- prompt replay/eval infrastructure
- Libri tool integration and guidance
- skill registry and skill loading

Reason: FastChat v2 still imports these directly or indirectly.

## Likely Cleanup Targets

### 1. Environment Flag Branches

Current examples:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts`
    - `OPENROUTER_V2_ENABLED` chooses between `OpenRouterV2Service` and
      `SmartLLMService`.
- `apps/web/src/lib/services/agentic-chat/state/agent-state-reconciliation-service.ts`
    - same OpenRouter v2 branch for reconciliation.
- `apps/web/src/lib/services/agentic-chat/tools/registry/gateway-config.ts`
    - `AGENTIC_CHAT_TOOL_GATEWAY` gates gateway mode.
    - `FASTCHAT_COMPACT_TOOL_PROMPT` gates whether the prompt duplicates tool
      schemas.
- `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts`
    - prompt shape branches on gateway mode.
- `apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts`
    - tool selection branches on gateway mode.
- legacy `agentic-chat/**` services also branch on gateway mode.

Cleanup direction:

- Replace OpenRouter v2 env checks with direct `new OpenRouterV2Service(...)`.
- Make gateway mode unconditional for v2.
- Make compact tool prompt text unconditional for v2.
- Remove gateway-disabled prompt and tool-selection code.
- Update tests that set `AGENTIC_CHAT_TOOL_GATEWAY=false` or
  `FASTCHAT_COMPACT_TOOL_PROMPT=false`.
- Remove `OPENROUTER_V2_ENABLED`, `AGENTIC_CHAT_TOOL_GATEWAY`, and
  `FASTCHAT_COMPACT_TOOL_PROMPT` from env docs after code no longer reads them.

### 2. Old Stream Endpoint

Current live UI uses:

- `apps/web/src/lib/components/agent/AgentChatModal.svelte`
    - `fetch('/api/agent/v2/stream', ...)`
    - `fetch('/api/agent/v2/stream/cancel', ...)`
- `apps/web/src/lib/components/agent/agent-chat-session.ts`
    - `fetch('/api/agent/v2/prewarm', ...)`

Old route family:

- `apps/web/src/routes/api/agent/stream/+server.ts`
- `apps/web/src/routes/api/agent/stream/services/**`
- `apps/web/src/routes/api/agent/stream/utils/**`
- `apps/web/src/routes/api/agent/prewarm/+server.ts`

Cleanup direction:

- Confirm there are no live product callers.
- If only tests/docs reference old routes, delete or archive route code.
- Move any still-needed generic utilities out of the old route folder before
  deleting it, such as context normalization if v2 still imports it.
- If admin/session reads depend on `GET /api/agent/stream`, replace that with a
  v2/session-specific endpoint or remove the dependency.

### 3. Old Orchestrator And Prompt Stack

Likely legacy stack:

- `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts`
- `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`
- `apps/web/src/lib/services/agentic-chat/synthesis/response-synthesizer.ts`
- `apps/web/src/lib/services/agentic-chat/persistence/agent-persistence-service.ts`
- `apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts`
- `apps/web/src/lib/services/agent-context-service.ts`
- `apps/web/src/lib/services/agent-executor-service.ts`

Cleanup direction:

- Do not delete these blindly.
- First prove they are only reachable from the old `/api/agent/stream` path,
  tests, docs, or internal dead exports.
- Preserve any shared pieces that v2 or non-chat systems still import.
- Delete tests that only validate retired behavior.

### 4. Prompt Builders

Current v2 prompt builder:

- `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts`

Old or partial prompt builder:

- `apps/web/src/lib/services/agentic-chat-v2/prompt-builder.ts`
    - `buildFastSystemPrompt` appears to be superseded.
    - `normalizeFastContextType` is still used by v2.
- `apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts`
    - old planner prompt path.
- `apps/web/src/lib/services/agentic-chat/prompts/config/**`
    - old prompt section catalog.

Cleanup direction:

- Keep `master-prompt-builder.ts` as the only v2 live prompt builder.
- Move `normalizeFastContextType` to a small context utility if needed.
- Delete `buildFastSystemPrompt` if unused.
- Delete old prompt generation files only after old orchestrator removal is
  complete.

### 5. Gateway Tool Contract

Current intended model-facing v2 contract:

```text
skill_load
tool_search
tool_schema
context-specific direct tools
```

Current compatibility/legacy names still appear in code/tests/docs:

```text
tool_help
tool_exec
buildos_call
execute_op
```

Cleanup direction:

- Keep the direct tool surface from `getGatewaySurfaceForContextType`.
- Keep `tool_search` and `tool_schema`.
- Keep `skill_load`.
- Remove old names from model-facing prompt text and tests where possible.
- Keep inbound compatibility only where required for old stored traces, prompt
  replay fixtures, or admin observability.
- If compatibility remains, isolate it behind clearly named legacy helpers so
  it does not leak into the main prompt/runtime path.

Known examples to audit:

- `apps/web/src/lib/services/agentic-chat/tools/registry/tool-help.ts`
    - still teaches `execute_op`.
- `apps/web/src/lib/services/agentic-chat/tools/registry/tool-schema.ts`
    - rewrites legacy examples into direct tool calls.
- `apps/web/src/lib/services/agentic-chat/tools/core/gateway-exec-utils.ts`
    - recognizes `execute_op`, `buildos_call`, and `tool_exec`.
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts`
    - many tests still use `tool_help` and `tool_exec`.

### 6. Environment Documentation

Current local env already sets the first two values, and this cleanup should make
the compact prompt behavior canonical as well:

```text
AGENTIC_CHAT_TOOL_GATEWAY=true
OPENROUTER_V2_ENABLED=true
FASTCHAT_COMPACT_TOOL_PROMPT=true
```

Cleanup direction:

- Remove these as operator choices once code no longer reads them.
- Update `.env.example`.
- Update testing docs that say to set `AGENTIC_CHAT_TOOL_GATEWAY=true`.
- Add a note that gateway/direct mode and OpenRouter v2 are the only supported
  agentic chat runtime.

## Recommended Work Plan

### Phase 1: Inventory And Deletion Map

Deliverable:

- Short markdown report or PR description listing:
    - live v2 files
    - shared tool infrastructure
    - legacy endpoint files
    - old prompt/orchestrator files
    - files to delete now
    - files to keep temporarily

Commands to start with:

```bash
rg -n "/api/agent/stream|/api/agent/prewarm|/api/agent/v2/stream|/api/agent/v2/prewarm" apps/web/src
rg -n "OPENROUTER_V2_ENABLED|AGENTIC_CHAT_TOOL_GATEWAY|FASTCHAT_COMPACT_TOOL_PROMPT|isToolGatewayEnabled|isFastChatCompactToolPromptEnabled" apps/web/src
rg -n "PromptGenerationService|AgentChatOrchestrator|createAgentChatOrchestrator|buildFastSystemPrompt" apps/web/src
rg -n "tool_help|tool_exec|buildos_call|execute_op" apps/web/src/lib/services/agentic-chat apps/web/src/lib/services/agentic-chat-v2
```

### Phase 2: Canonicalize OpenRouter V2

Work:

- Remove `OPENROUTER_V2_ENABLED` checks from agentic chat runtime.
- Instantiate `OpenRouterV2Service` directly in v2 stream and reconciliation.
- Keep `SmartLLMService` only where unrelated systems still need it.

Focused tests:

```bash
pnpm --filter @buildos/web test -- src/lib/services/openrouter-v2-service.test.ts
pnpm --filter @buildos/web test -- src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts
```

### Phase 3: Canonicalize Gateway/Direct Tool Mode

Work:

- Remove gateway-disabled branches from v2 prompt and tool selection.
- Make `selectFastChatTools` always return `getGatewaySurfaceForContextType`.
- Make compact tool prompt text unconditional; avoid rendering full tool JSON in
  the system prompt.
- Simplify prompt builder to always include capability/skill/tool discovery
  guidance.
- Remove tests for `AGENTIC_CHAT_TOOL_GATEWAY=false`.

Focused tests:

```bash
pnpm --filter @buildos/web test -- src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts src/lib/services/agentic-chat-v2/tool-selector.test.ts
pnpm --filter @buildos/web test -- src/lib/services/agentic-chat/tools/core/tool-schema-compat.test.ts src/lib/services/agentic-chat/tools/skills/skill-load.test.ts
```

### Phase 4: Retire Old Endpoint Family

Work:

- Delete or archive `/api/agent/stream` and `/api/agent/prewarm` once callers are
  gone.
- Move any needed generic utilities out of the old route folder.
- Remove old route tests.
- Update error observability tests only if they reference old endpoints.

Focused tests:

```bash
pnpm --filter @buildos/web test -- src/lib/components/agent/agent-chat-session.test.ts
pnpm --filter @buildos/web test -- src/routes/api/agent/v2/prewarm/server.test.ts
```

### Phase 5: Retire Old Prompt/Orchestrator Stack

Work:

- Remove old orchestrator and planner prompt stack if only old endpoint used it.
- Keep shared tools and execution infrastructure.
- Remove stale docs or move historical specs under archive if they are not
  current implementation guidance.

Focused tests:

```bash
pnpm --filter @buildos/web test -- src/lib/services/agentic-chat-v2
pnpm --filter @buildos/web check
```

### Phase 6: Legacy Gateway Name Cleanup

Work:

- Remove `tool_help` / `tool_exec` / `buildos_call` / `execute_op` from
  model-facing examples where the direct tool contract should be used.
- Keep admin/replay compatibility only if needed.
- Update tests to use `skill_load`, `tool_search`, `tool_schema`, and direct
  tool calls.

Focused tests:

```bash
pnpm --filter @buildos/web test -- src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts
pnpm --filter @buildos/web test -- src/lib/services/agentic-chat-v2/prompt-observability.test.ts
```

## Definition Of Done

- There is one product chat stream path: `/api/agent/v2/stream`.
- There is one product prewarm path: `/api/agent/v2/prewarm`.
- There is one product cancel path: `/api/agent/v2/stream/cancel`.
- Agentic chat no longer reads `OPENROUTER_V2_ENABLED`.
- Agentic chat no longer reads `AGENTIC_CHAT_TOOL_GATEWAY`.
- Agentic chat no longer reads `FASTCHAT_COMPACT_TOOL_PROMPT`.
- Gateway/direct tools are the only tool mode.
- Compact tool prompt text is the only tool prompt mode.
- `master-prompt-builder.ts` is the only live v2 prompt builder.
- Old route and orchestrator files are deleted or explicitly marked as retained
  shared infrastructure.
- Tests do not preserve unsupported branches just for historical compatibility.
- `.env.example` and docs no longer present old modes as supported choices.

## Non-Goals

- Do not implement `agentic-chat-lite`.
- Do not rewrite the seed context yet.
- Do not change model selection beyond making OpenRouter v2 canonical.
- Do not remove Libri.
- Do not remove skills.
- Do not remove prompt observability.
- Do not remove eval/replay infrastructure.
- Do not delete tool infrastructure that v2 still imports.

## Risk Notes

The biggest risk is deleting shared tool infrastructure because it lives under
`agentic-chat/` even though FastChat v2 depends on it. Treat the directory name
as historical. Use imports, tests, and runtime references as the source of truth.

The second risk is removing legacy gateway compatibility before admin replay or
stored prompt snapshots have been updated. If old traces still need to parse
`tool_help` or `tool_exec`, isolate compatibility in replay/observability code
instead of keeping it in the model-facing path.

The third risk is keeping the old route because one helper function is still
imported from its folder. Move the helper. Do not keep a full endpoint alive
just to host utility code.
