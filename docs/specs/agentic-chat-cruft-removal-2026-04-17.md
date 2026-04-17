<!-- docs/specs/agentic-chat-cruft-removal-2026-04-17.md -->

# Agentic Chat — Cruft Removal Spec (4.2 Three-Implementation Sprawl)

> Date: 2026-04-17
> Scope: Section 4.2 of `apps/web/docs/features/agentic-chat/AUDIT_2026-04-17_OVERVIEW.md`
> Goal: Enumerate the deprecated surfaces in the chat system, classify what is **safe to remove now** versus **keep for now**, and sequence the deletions so the cleanup can be done in small, verifiable PRs.
> Related: `docs/specs/agentic-chat-lite-prompt-consolidation-2026-04-16.md` (lite prompt consolidation — already landed)

---

## 1. Executive summary

Three service trees coexist today: `agentic-chat/` (v1 — retained for tools/execution only), `agentic-chat-v2/` (v2 — the live route backbone), and `agentic-chat-lite/` (the only prompt path). The audit flagged this as sprawl. On close inspection, most of the "three-tree sprawl" is **not dead code**:

- `agentic-chat/` still houses the entire tool system (definitions, executors, registry, skills, execution service, state reconciliation, shared types). The live route at `/api/agent/v2/stream` imports from it directly. It is live, not legacy.
- `agentic-chat-v2/` is the live orchestration tree — context loader, tool selector, stream orchestrator, session service, observability.
- `agentic-chat-lite/` is the live prompt builder — `buildLitePromptEnvelope` is the sole prompt path.

The **real cruft** lives in four narrow places:

1. **Legacy planner/executor SSE event handlers in the UI** — zero emitters anywhere in the codebase. ~200 LOC of dead branches in `AgentChatModal.svelte`, the entire `PlanVisualization.svelte` (384 LOC), the `/test-plan-viz` dev route, and the dead variants on `AgentSSEMessage` / `ActivityType`.
2. **Thin re-export shims** — `tool-executor.ts` (10 LOC, 1 test-only caller) and `stream-orchestrator.ts` (2 LOC, used by the barrel + one test file).
3. **`prompt_variant` back-compat branch** — the server still validates a request input that no frontend sends. The legacy string `fastchat_prompt_v1` is still referenced for historical snapshot rendering (which is fine), but the **request-side** back-compat is pure dead weight.
4. **Dead modal-local state** — `HIDDEN_THINKING_TOOLS` is an empty Set gated by two dead-code guards.

Everything else under the three service trees is live. The service-tree "sprawl" is a naming issue, not a deletion opportunity.

---

## 2. Current vs deprecated — fact base

### 2.1 Three service trees

| Tree                          | Status                            | Evidence                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services/agentic-chat/`      | **LIVE (tools + execution only)** | `/api/agent/v2/stream/+server.ts:36` imports `ChatToolExecutor` from `tools/core/tool-executor-refactored`. `tools.config.ts`, `gateway-surface.ts`, `tools/registry/*`, `tools/skills/*`, `execution/tool-execution-service.ts`, `state/*`, `shared/*` are all reachable from that executor. 27 files import from `$lib/services/agentic-chat/`. |
| `services/agentic-chat-v2/`   | **LIVE (orchestration)**          | `/api/agent/v2/stream`, `/api/agent/v2/prewarm`, `/api/agent/v2/stream/cancel`, `/api/admin/chat/*`, and the modal (`agent-chat-session.ts`) all import from it. 13 files import from `$lib/services/agentic-chat-v2/`.                                                                                                                           |
| `services/agentic-chat-lite/` | **LIVE (only prompt path)**       | `buildLitePromptEnvelope` is invoked by `/api/agent/v2/stream/+server.ts` and by the admin preview/shadow routes. 13 files import from `$lib/services/agentic-chat-lite/`.                                                                                                                                                                        |

**Conclusion:** All three trees are live. The naming is misleading; the layering is not.

### 2.2 Legacy planner/executor SSE surface

**Events inventoried:** `plan_created`, `plan_ready_for_review`, `plan_review`, `step_start`, `step_complete`, `executor_spawned`, `executor_result`, `entity_patch`.

**Emitters in the live codebase:** **zero.**

- `apps/web/src/routes/api/agent/v2/stream/+server.ts` — no emitters (confirmed via grep).
- `apps/web/src/lib/services/agentic-chat-v2/**` — no emitters.
- `apps/web/src/lib/services/agentic-chat-lite/**` — no emitters.
- `apps/web/src/lib/services/agentic-chat/**` — types only; no emitters.
- `apps/web/src/routes/api/agentic-chat/agent-message/+server.ts` — no emitters.
- Worker: `apps/worker/src/workers/tree-agent/treeAgentWorker.ts:457` emits `tree.plan_created` — **namespaced and routed through the tree-agent pipeline, not the chat SSE stream.** Not related.

**Consumers still in the codebase:**

| File                                                                      | Lines                                                                                                                                                                                                                                                                                                                                                                        | What it does                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/lib/components/agent/AgentChatModal.svelte`                 | 3303–3332 (plan_created), 3333–3367 (plan_ready_for_review), 3369–3378 (step_start), 3380–3391 (executor_spawned), 3392–3414 (plan_review), 3595–3603 (entity_patch), 3655–3668 (executor_result), 3670–3717 (step_complete), 2467–2517 (`updatePlanStepStatus`), 3772–3783 (`addPlanStatusAssistantMessage`), 209 + 669 + 3016 + 3305 + 3334 (`currentPlan` state + resets) | Handles every dead event, updates a plan activity in the thinking block, and appends plan-status assistant messages. All unreachable.                                                                                                                                                |
| `apps/web/src/lib/components/agent/PlanVisualization.svelte`              | 384 LOC                                                                                                                                                                                                                                                                                                                                                                      | Only rendered by `ThinkingBlock.svelte:198` when an activity has `activityType === 'plan_created'`. Since no server emits that event, this is never rendered in prod.                                                                                                                |
| `apps/web/src/lib/components/agent/ThinkingBlock.svelte`                  | 5 (import), 86–111 (icon styles for `plan_created`, `plan_review`, `step_start`, `step_complete`, `executor_spawned`, `executor_result`), 195–204 (conditional `<PlanVisualization>`)                                                                                                                                                                                        | Dead UI branches.                                                                                                                                                                                                                                                                    |
| `apps/web/src/lib/components/agent/agent-chat.types.ts`                   | 7–13                                                                                                                                                                                                                                                                                                                                                                         | Dead variants in `ActivityType`: `plan_created`, `plan_review`, `step_start`, `step_complete`, `executor_spawned`, `executor_result`. `UIMessage.type` lines 46–48 also declare `'plan'`, `'step'`, `'executor'` variants that are never constructed.                                |
| `apps/web/src/lib/services/agentic-chat/shared/types.ts`                  | 395–412                                                                                                                                                                                                                                                                                                                                                                      | Dead variants in the `StreamEvent` union (plan/step/executor/plan_review). `StreamEvent` is defined but not imported by any server emitter.                                                                                                                                          |
| `apps/web/src/lib/services/agentic-chat/config/model-selection-config.ts` | 22, 139, 155                                                                                                                                                                                                                                                                                                                                                                 | `'plan_review'` in the `AgentTask` union + `temperature[plan_review]` + `maxTokens[plan_review]`. The planner/executor workflow this was wired for no longer exists.                                                                                                                 |
| `apps/web/src/lib/types/agent-chat-enhancement.ts`                        | 447–452                                                                                                                                                                                                                                                                                                                                                                      | Dead variants in the enhancement event union.                                                                                                                                                                                                                                        |
| `apps/web/src/routes/test-plan-viz/+page.svelte`                          | entire file                                                                                                                                                                                                                                                                                                                                                                  | Dev-only fixture page that only exists to render `PlanVisualization` with hand-crafted sample plans.                                                                                                                                                                                 |
| `packages/shared-types/src/agent.types.ts`                                | 477–494 (on `AgentSSEMessage`), 989–1014 (`MultiAgentStreamEvent`), `AgentPermission`, `getToolsForAgent`, `TOOL_PERMISSIONS`, `ExecutorTaskDefinition`, `AgentPlan`, `AgentPlanStep`, `AgentPlanMetadata`, `AgentPlanInsert`                                                                                                                                                | Dead variants on the shared SSE union plus the entire `MultiAgentStreamEvent` + planner/executor permission model. Only `AgentSSEMessage` itself is imported by the modal; the planner/executor types are referenced only by the modal's dead branches, the dev test page, and docs. |

### 2.3 Thin re-export shims

| Shim                                                                 | LOC | Direct importers (live)                                                                                                                                                                                                 | Status                                                                                                                   |
| -------------------------------------------------------------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor.ts` | 10  | `apps/web/src/lib/tests/chat/progressive-flow.test.ts` (test only). Also indirectly referenced by `tool-executor.test.ts` and `tool-executor-libri.test.ts` (both sit in the same folder and import `./tool-executor`). | **Shim only.** Production calls go to `tool-executor-refactored.ts` directly (via `/api/agent/v2/stream/+server.ts:36`). |
| `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts`   | 2   | `agentic-chat-v2/index.ts:8` barrel + `stream-orchestrator.test.ts`. No external consumer.                                                                                                                              | **Shim only.** Barrel can be pointed at `./stream-orchestrator/index` directly.                                          |

### 2.4 `prompt_variant` back-compat

**Flow today:**

- Frontend: `agent-chat-session.ts:69` exports `resolveAgentChatPromptVariantForRequest()` which always returns `null`. The modal never sets `prompt_variant` on the outgoing POST body.
- Server: `/api/agent/v2/stream/+server.ts:2226–2235` reads `streamRequest.prompt_variant`, validates it must be `lite_seed_v1` or `fastchat_prompt_v1` (else 400), then hardcodes `promptVariant = LITE_PROMPT_VARIANT` anyway.
- Historical label use (**keep**): `FASTCHAT_PROMPT_VARIANT = 'fastchat_prompt_v1'` is still written into `chat_turn_runs.prompt_snapshot.prompt_variant` when no promptVariant is passed downstream (`prompt-observability.ts:260, 338, 374, 386`). It is also referenced by the admin sessions page (`sessions/+page.svelte:3868`) and audit export (`chat-session-audit-export.ts:262`). These consumers read historical rows and must keep handling the legacy string.

**Conclusion:** The **input** back-compat is dead — nothing sends `prompt_variant`. The **historical snapshot** back-compat is load-bearing and must stay.

### 2.5 Dead modal-local state

- `AgentChatModal.svelte:1674` — `HIDDEN_THINKING_TOOLS = new Set<string>()` (empty, never populated).
- `AgentChatModal.svelte:1685, 3538` — two guards that early-return when `HIDDEN_THINKING_TOOLS.has(toolName)`. Both branches are unreachable.

---

## 3. Removal plan — classified

### 3.1 Safe to remove now (low risk, no behavior change)

Each bullet has zero live emitters/callers and is protected by the grep evidence above.

#### A. Legacy planner/executor UI surface

1. **Delete `apps/web/src/lib/components/agent/PlanVisualization.svelte`** (384 LOC).
2. **Delete `apps/web/src/routes/test-plan-viz/+page.svelte`** — sole importer of `PlanVisualization`.
3. **Strip plan/step/executor branches from `AgentChatModal.svelte`:**
    - `case 'plan_created'`, `case 'plan_ready_for_review'`, `case 'step_start'`, `case 'executor_spawned'`, `case 'plan_review'`, `case 'entity_patch'`, `case 'executor_result'`, `case 'step_complete'` (lines 3303–3414 and 3595–3603 and 3655–3717).
    - `let currentPlan = $state<AgentPlan | null>(null)` (209) and its resets (669, 3016).
    - `function updatePlanStepStatus(...)` (2467–2517).
    - `function addPlanStatusAssistantMessage(...)` (3772–3783).
    - `AgentPlan` import from `@buildos/shared-types`.
    - Block at 2486 inside another function that references `plan_created` — remove.
4. **Strip planner/executor icons from `ThinkingBlock.svelte`:**
    - Lines 86–111 (`plan_created`, `plan_review`, `step_start`, `step_complete`, `executor_spawned`, `executor_result` icon entries).
    - Lines 194–204 (the `{#if activity.activityType === 'plan_created' ... }` branch and the `PlanVisualization` import at line 5).
5. **Trim `agent-chat.types.ts`:**
    - Remove `'plan_created' | 'plan_review' | 'step_start' | 'step_complete' | 'executor_spawned' | 'executor_result'` from `ActivityType` (lines 7–13).
    - Remove `'plan' | 'step' | 'executor'` from `UIMessage.type` (lines 46–48).
6. **Trim `agent-chat-enhancement.ts`:** delete the plan/review variants in the event union (447–452).
7. **Trim `services/agentic-chat/shared/types.ts`:** drop dead variants in `StreamEvent` (395–412). Keep the rest of the file.
8. **Trim `services/agentic-chat/config/model-selection-config.ts`:** drop `'plan_review'` from `AgentTask` (22) and the corresponding entries in `temperature` (139) and `maxTokens` (155).

#### B. Thin shims — collapse

9. **Inline `tool-executor.ts` shim:**
    - Move `tool-executor-refactored.ts` → `tool-executor.ts` (straight rename, delete old 10-LOC shim).
    - Update `/api/agent/v2/stream/+server.ts:36` to import from `'./tool-executor'` (file path becomes the shorter one).
    - The existing `tool-executor.test.ts`, `tool-executor-libri.test.ts`, and `progressive-flow.test.ts` already import `./tool-executor`, so they pick up the rename with zero change.
    - Delete `tool-executor-libri.test.ts` only if consolidating tests; otherwise leave it.
10. **Inline `stream-orchestrator.ts` shim:**
    - Update `agentic-chat-v2/index.ts:8` to `export { streamFastChat } from './stream-orchestrator/index'`.
    - Update `stream-orchestrator.test.ts:4` to `from './stream-orchestrator/index'`.
    - Delete `agentic-chat-v2/stream-orchestrator.ts`.

#### C. `prompt_variant` request-side back-compat

11. **Remove the input validator in `/api/agent/v2/stream/+server.ts` (lines 2224–2235).** Replace with a single `const promptVariant: LitePromptVariant = LITE_PROMPT_VARIANT;`. The server already hardcodes this — the validator only rejects malformed inputs, and no client sends the field.
12. **Remove the dead helpers in `agent-chat-session.ts`:** `resolveAgentChatPromptVariantForRequest`, `AgentChatPromptVariantSelection`, `normalizeAgentChatPromptVariantSelection`, `AGENT_CHAT_DEFAULT_PROMPT_VARIANT` (lines 49–74).
    - Update `agent-chat-session.test.ts` to drop the corresponding cases.
    - Update the corresponding test in `server.test.ts` that asserts the 400-response (`"Unsupported prompt_variant"`) — delete that test since the input is no longer recognized.
13. **Keep** `FASTCHAT_PROMPT_VARIANT` + `FastChatPromptVariant` type in `services/agentic-chat-v2/prompt-variant.ts`. They are used by `prompt-observability.ts`, `prompt-dump-debug.ts`, the admin sessions page, `chat-session-audit-export.ts`, and `prompt-eval-comparison.ts` to render **historical** snapshots. Removing this will break admin rendering of old sessions.
14. **Keep** the current `LITE_PROMPT_VARIANT` export in `agentic-chat-v2/prompt-variant.ts` — it's a re-export used by the server route and several call sites.

#### D. Dead modal-local state

15. **Remove `HIDDEN_THINKING_TOOLS` + its two guards** in `AgentChatModal.svelte:1674, 1685, 3538`. Replace the guard at 1685 by directly returning `{ hidden: false, toolName, args, originalToolName: toolName }`; replace the guard at 3538 by removing the conjunct.

#### E. Shared-types planner/executor types

16. **Drop dead variants from `packages/shared-types/src/agent.types.ts`:**
    - Remove `plan_created | plan_ready_for_review | step_start | step_complete | executor_spawned | executor_result | plan_review | entity_patch` from `AgentSSEMessage` (lines 477–494 and 501).
    - Remove `'executing_plan'` from `agent_state.state` union on line 472 **only if** no other code uses it. ⚠️ Audit: `AgentChatModal.svelte` emits `updateThinkingBlockState('executing_plan', ...)` inside the dead branches — once those branches are gone, the string is unused. Grep once more after step A before deleting.
    - Delete the entire `MultiAgentStreamEvent` union (989–1014), `AgentPermission` + `TOOL_PERMISSIONS` + `getToolsForAgent` (whatever lines), `ExecutorTaskDefinition`, `AgentPlan`, `AgentPlanStep`, `AgentPlanMetadata`, `AgentPlanInsert` — none imported outside the dead modal branches and docs.
    - Regenerate types with `pnpm gen:types` if any DB types changed (unlikely — these are hand-written app types, not DB types).

### 3.2 Keep — do not remove

- **All of `agentic-chat/tools/*`** — live tool system.
- **All of `agentic-chat/execution/*`, `state/*`, `shared/*`** — live execution path.
- **`agentic-chat/agent-to-agent-service.ts`** — referenced by the modal and `/api/agentic-chat/agent-message`. (If the agent-to-agent bridge is found to be dead during the FE audit, revisit.)
- **`agentic-chat/prompts/*`** — not investigated in this pass; defer to the FE/BE deep-dive audits before removing.
- **`FASTCHAT_PROMPT_VARIANT` constant and type** — load-bearing for historical snapshot rendering.
- **`prompt-observability.ts`, `prompt-eval-*`, `prompt-replay-*`** — admin/dev tooling, not hot path but not dead.
- **`stream_run_id` / `client_turn_id` idempotency machinery** — the `cancel-reason-channel` defensive scaffolding in §4.6 of the audit is a separate investigation (future dedup pass).
- **`tool-executor-refactored.ts`** itself — it's the live executor; only the alias needs collapsing.

### 3.3 Out-of-scope for this spec (call out, but do not touch)

These are flagged as sprawl/cruft but fixing them is a larger refactor, not a deletion:

- Decomposition of `AgentChatModal.svelte` (4,532 LOC) → see FE audit brief §5.
- Decomposition of `/api/agent/v2/stream/+server.ts` (4,212 LOC) → see BE audit brief §6.
- Decomposition of `context-loader.ts` (2,955 LOC), `tool-execution-service.ts` (2,307 LOC), `build-lite-prompt.ts` (1,900 LOC).
- `DATA_MUTATION_TOOLS` vs `MUTATION_TRACKED_TOOLS` deduping → audit §4.4.
- `chat_sessions.agent_metadata` write amplification → audit §4.6.

---

## 3A. Naming & directory-layout recommendations

The "three-tree sprawl" is a naming problem. Today's trees advertise **versions** (`-v2`) and **variants** (`-lite`) that no longer exist. The directory tree should advertise **layers** instead. This section is a target end-state + a pragmatic sequencing plan. The directory-level renames are **not done in this PR** (they'd churn 50+ importers); the identifier renames under §3A.3 are split into a follow-up PR once the deletions in §3 land.

### 3A.1 Principle

- **Directory names should describe the layer** (prompt / context / tools / stream / execution / state / observability), not the historical code drop.
- **Legacy prefixes (`fastchat`, `lite`, `-refactored`, `-v2`) are dead weight.** They once meant "not the old version" — that distinction is gone.
- **The string literal `lite_seed_v1` stays** (it's written to `chat_turn_runs.prompt_snapshot.prompt_variant` and read by admin tooling). Only the code-level identifier around it changes.
- **The string literal `fastchat_prompt_v1` stays** for the same reason (historical snapshot rendering).

### 3A.2 Target directory layout (future PR)

```
apps/web/src/lib/services/agent-chat/            ← one tree (was three)
├── prompt/                                      ← from agentic-chat-lite/prompt/
│   ├── build-system-prompt.ts                   ← was build-lite-prompt.ts
│   ├── types.ts
│   └── ...
├── prompt-preview/                              ← from agentic-chat-lite/preview/
├── prompt-shadow/                               ← from agentic-chat-lite/shadow/
├── context/                                     ← from agentic-chat-v2/context-*
│   ├── loader.ts                                ← was context-loader.ts
│   ├── cache.ts                                 ← was context-cache.ts
│   ├── models.ts
│   ├── usage.ts
│   └── entity-resolution.ts
├── session/                                     ← from agentic-chat-v2/session-service + history-composer
│   ├── service.ts
│   └── history.ts
├── stream/                                      ← from agentic-chat-v2/stream-orchestrator/
│   ├── index.ts
│   ├── repair-instructions.ts
│   └── ...
├── tools/                                       ← from agentic-chat/tools/
│   ├── core/
│   ├── definitions/
│   ├── executors/
│   ├── registry/
│   └── skills/
├── execution/                                   ← from agentic-chat/execution/
├── state/                                       ← from agentic-chat/state/
├── observability/                               ← from agentic-chat-v2/prompt-observability + prompt-eval-* + prompt-replay-*
├── cancel-channel.ts                            ← was cancel-reason-channel.ts
├── limits.ts
├── selector.ts                                  ← was tool-selector.ts
└── types.ts
```

This is the end state, not an immediate action. Sequencing in §3A.5.

### 3A.3 Identifier rename map (follow-up PR)

**`FastChat*` → drop "FastChat" (types/functions already live under the agent-chat namespace):**

| Current                                | Proposed                                                           |
| -------------------------------------- | ------------------------------------------------------------------ |
| `streamFastChat`                       | `streamAgentTurn`                                                  |
| `composeFastChatHistory`               | `composeMessageHistory`                                            |
| `selectFastChatTools`                  | `selectAgentTools`                                                 |
| `createFastChatSessionService`         | `createAgentSessionService`                                        |
| `loadFastChatPromptContext`            | `loadAgentPromptContext`                                           |
| `buildFastSystemPrompt`                | (appears unused — verify + delete)                                 |
| `normalizeFastContextType`             | `normalizeContextType`                                             |
| `buildFastContextUsageSnapshot`        | `buildContextUsageSnapshot`                                        |
| `FASTCHAT_LIMITS`                      | `AGENT_TURN_LIMITS`                                                |
| `buildFastChatContextCacheKey`         | `buildContextCacheKey`                                             |
| `isFastChatContextCacheFresh`          | `isContextCacheFresh`                                              |
| `buildFastChatContextCacheEntry`       | `buildContextCacheEntry`                                           |
| `FastChatPromptContextSnapshot`        | `PromptContextSnapshot`                                            |
| `FastChatContextCache`                 | `ContextCache`                                                     |
| `FastChatCancelReason`                 | `AgentCancelReason`                                                |
| `isFastChatCancelReason`               | `isAgentCancelReason`                                              |
| `normalizeFastChatStreamRunId`         | `normalizeStreamRunId`                                             |
| `resolveFastChatStreamRunId`           | `resolveStreamRunId`                                               |
| `isLegacyFastChatStreamRunId`          | `isLegacyStreamRunId`                                              |
| `listFastChatCorrelationIds`           | `listCorrelationIds`                                               |
| `createFastChatCancelHint`             | `createCancelHint`                                                 |
| `mergeFastChatCancelHintIntoMetadata`  | `mergeCancelHintIntoMetadata`                                      |
| `readFastChatCancelReasonFromMetadata` | `readCancelReasonFromMetadata`                                     |
| `recordTransientFastChatCancelHint`    | `recordTransientCancelHint`                                        |
| `consumeTransientFastChatCancelHint`   | `consumeTransientCancelHint`                                       |
| `FastChatHistoryCompositionSettings`   | `HistoryCompositionSettings`                                       |
| `FastChatHistoryCompositionResult`     | `HistoryCompositionResult`                                         |
| `FastChatHistoryMessage`               | `HistoryMessage`                                                   |
| `FastChatDebugContext`                 | `AgentDebugContext`                                                |
| `FastChatToolCallMeta`                 | `ToolCallMeta`                                                     |
| `extractFastChatToolCallMeta`          | `extractToolCallMeta`                                              |
| `FastChatEventWindow`                  | `EventWindow`                                                      |
| `FastChatWorkSignal`                   | `WorkSignal`                                                       |
| `FastChatRecentChange`                 | `RecentChange`                                                     |
| `FastChatProjectSignalSummary`         | `ProjectSignalSummary`                                             |
| `FastChatProjectIntelligence`          | `ProjectIntelligence`                                              |
| `FastChatPromptVariant`                | `PromptVariant` (keep as union over LITE + legacy fastchat string) |
| `estimateFastChatReservation`          | `estimateAgentTurnReservation`                                     |

**`Lite*` / `lite-*` → drop "Lite":**

| Current                                                 | Proposed                                                |
| ------------------------------------------------------- | ------------------------------------------------------- |
| `buildLitePromptEnvelope`                               | `buildSystemPromptEnvelope`                             |
| `build-lite-prompt.ts`                                  | `build-system-prompt.ts`                                |
| `build-lite-prompt-preview.ts`                          | `build-prompt-preview.ts`                               |
| `compare-lite-shadow.ts`                                | `compare-prompt-shadow.ts`                              |
| `LitePromptVariant` type                                | `PromptVariant`                                         |
| `LITE_PROMPT_VARIANT` constant (value `'lite_seed_v1'`) | keep value; rename constant to `CURRENT_PROMPT_VARIANT` |

**Misc:**

| Current                                          | Proposed                                 |
| ------------------------------------------------ | ---------------------------------------- |
| `tool-executor-refactored.ts`                    | `tool-executor.ts` (done in §3.1-B)      |
| `HIDDEN_THINKING_TOOLS`                          | (deleted in §3.1-D)                      |
| `DATA_MUTATION_TOOLS` + `MUTATION_TRACKED_TOOLS` | consolidate (audit §4.4 — separate pass) |

### 3A.4 Directory rename map (future PR)

| Current                                        | Proposed                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| `apps/web/src/lib/services/agentic-chat/`      | `apps/web/src/lib/services/agent-chat/` (merge target)                             |
| `apps/web/src/lib/services/agentic-chat-v2/`   | merge into `agent-chat/` under `context/`, `session/`, `stream/`, `observability/` |
| `apps/web/src/lib/services/agentic-chat-lite/` | merge into `agent-chat/` under `prompt/`, `prompt-preview/`, `prompt-shadow/`      |

### 3A.5 Why this is deferred, not done here

Renaming `FastChat*` alone touches ~30 exported symbols across ~50 importers. Directory moves touch every import path. If we bundle identifier renames with the deletion PRs in §3, the diffs lose focus and reviews get noisy. Cleanup wants small, obvious PRs. The full rename is a follow-up **after** the dead-code deletions in §5 land and the code surface is smaller.

**What is done in this spec's cleanup PRs:**

- Drop the `-refactored` suffix on `tool-executor.ts` (mechanical, already planned).
- Delete `HIDDEN_THINKING_TOOLS`, `resolveAgentChatPromptVariantForRequest`, `normalizeAgentChatPromptVariantSelection`, `AGENT_CHAT_DEFAULT_PROMPT_VARIANT` (cleanup of the dead prompt_variant scaffolding).

**What is deferred to a follow-up PR:**

- Everything in §3A.3 (identifier renames).
- Everything in §3A.4 (directory moves).

---

## 4. Verification & test impact

| Step                                                            | Verification                                                                                                                                                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Planner/executor UI removal                                  | `pnpm --filter=web typecheck` — TS will flag any missed reference. `pnpm --filter=web lint`. Manual smoke: open modal, send one message in each context (`global`, `project`, `daily_brief`), confirm thinking block still renders tool activity. |
| B. Shim collapse (`tool-executor.ts`, `stream-orchestrator.ts`) | Existing tests cover both: `tool-executor.test.ts` (25 KB), `tool-executor-libri.test.ts`, `progressive-flow.test.ts`, `stream-orchestrator.test.ts` (46+ tests). Run `pnpm --filter=web test tool-executor stream-orchestrator`.                 |
| C. `prompt_variant` input removal                               | Drop the 400-response test in `server.test.ts:40–56`. The `prompt_variant: 'lite_seed_v1'` case at line 73 should continue to succeed because the server no longer reads the field.                                                               |
| D. `HIDDEN_THINKING_TOOLS` removal                              | Type check + smoke (modal render).                                                                                                                                                                                                                |
| E. Shared-types cleanup                                         | Build both apps (`pnpm build`). If `@buildos/shared-types` is published, confirm no external consumers — it lives in the monorepo, so scope is in-repo.                                                                                           |

Expected LOC delta (rough): **~950 LOC deleted** (net), with **~30 LOC added** for inlined replacements. Breakdown:

- `AgentChatModal.svelte`: ~-220 LOC
- `PlanVisualization.svelte`: -384 LOC
- `/test-plan-viz/+page.svelte`: ~-190 LOC
- `ThinkingBlock.svelte`: ~-35 LOC
- `agent-chat.types.ts` / `agent-chat-enhancement.ts` / `agent-chat/shared/types.ts` / `model-selection-config.ts`: ~-30 LOC combined
- `shared-types/agent.types.ts`: ~-80 LOC (planner/executor + MultiAgent event union)
- `tool-executor.ts` + `stream-orchestrator.ts` shims: -12 LOC
- `agent-chat-session.ts` variant helpers: ~-30 LOC
- `HIDDEN_THINKING_TOOLS` + guards: ~-8 LOC
- `/api/agent/v2/stream/+server.ts` variant validator: ~-12 LOC

---

## 5. Suggested PR sequencing

Each PR is independently shippable and individually revertable.

1. **PR 1 — Delete legacy planner/executor UI surface.**
    - `AgentChatModal.svelte` branches + helpers, `ThinkingBlock.svelte` icons/branch, `PlanVisualization.svelte`, `/test-plan-viz/+page.svelte`, `agent-chat.types.ts`, `agent-chat-enhancement.ts`, `agentic-chat/shared/types.ts`, `model-selection-config.ts`.
    - Delete `HIDDEN_THINKING_TOOLS` in the same PR (same file, mechanical).
    - Run full `pnpm --filter=web typecheck test lint`, manual smoke in all four contexts.
2. **PR 2 — Collapse `tool-executor.ts` shim.**
    - Rename `tool-executor-refactored.ts` → `tool-executor.ts` (overwriting the shim). Update the one direct-import call site in `/api/agent/v2/stream/+server.ts`.
    - Mechanical; tests already point at `./tool-executor`.
3. **PR 3 — Collapse `stream-orchestrator.ts` shim.**
    - Update barrel + test import; delete root shim.
4. **PR 4 — Remove `prompt_variant` request-side back-compat.**
    - Server validator + FE dead helpers + test updates. Keep `FASTCHAT_PROMPT_VARIANT` constant and all historical-snapshot rendering untouched.
5. **PR 5 — Shared-types cleanup (`packages/shared-types/src/agent.types.ts`).**
    - Only land after PR 1. Drops dead variants on `AgentSSEMessage`, deletes `MultiAgentStreamEvent` / `AgentPermission` / `TOOL_PERMISSIONS` / `ExecutorTaskDefinition` / `AgentPlan*`.
    - Rebuild both apps to confirm no leaks.

Do not bundle these into one PR — each exercises a different surface and should be revertable on its own.

---

## 6. Open questions

1. **Agent-to-agent bridge (`/api/agentic-chat/agent-message` + `agentic-chat/agent-to-agent-service.ts`).** Is this production-live or experimental? If dead, it's the next big cleanup candidate after §5. The audit flags it for the BE deep dive — leave alone until that review.
2. **`agent_state: 'executing_plan'` union member.** Only emitted from the dead planner branches. Confirm after PR 1 lands that no orchestrator path uses it, then drop from the shared type in PR 5.
3. **`agentic-chat/prompts/` directory.** Not walked in this audit; may contain references to the old planner/executor prompts under `apps/web/docs/prompts/agent/planner/` and `apps/web/docs/prompts/agent/executor/`. If those prompt files are only referenced from dead code, they can go in a follow-up PR.
4. **`chat_turn_runs` schema.** If the DB schema has columns tied to planner/executor (e.g., `plan_created_at` in `/api/admin/chat/timing/+server.ts:28`), leave the column and stop writing to it; do not drop DB columns in this cleanup pass.

---

## 7. Grep receipts (for reviewers)

```bash
# Confirm no server emits legacy events
rg "'(plan_created|plan_ready_for_review|plan_review|step_start|step_complete|executor_spawned|executor_result|entity_patch)'" apps/web/src/routes apps/web/src/lib/services/agentic-chat-v2 apps/web/src/lib/services/agentic-chat-lite

# Confirm shim import counts
rg "from ['\"].*tools/core/tool-executor['\"]"            # → 1 test file
rg "from ['\"].*agentic-chat-v2/stream-orchestrator['\"]" # → 0 external files
rg "from ['\"].*tool-executor-refactored['\"]"            # → 1 real caller + shim itself

# Confirm FE does not send prompt_variant
rg "prompt_variant" apps/web/src/lib/components
```

All three greps return the evidence this spec relies on.
