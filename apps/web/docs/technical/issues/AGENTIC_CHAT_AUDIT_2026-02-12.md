# Agentic Chat V2 End-to-End Audit (2026-02-12)

## Executive Summary

1. The active chat runtime is `POST /api/agent/v2/stream`, which implements a fast streaming loop with direct tool-calling, not the legacy planner/executor orchestration model (`apps/web/src/routes/api/agent/v2/stream/+server.ts:579`, `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts:49`).
2. The frontend still sends and handles several legacy continuity/planning signals that v2 does not consume or emit, creating a split protocol between client expectations and backend behavior (`apps/web/src/lib/components/agent/AgentChatModal.svelte:2695`, `apps/web/src/lib/components/agent/AgentChatModal.svelte:2828`, `apps/web/src/lib/components/agent/AgentChatModal.svelte:2931`).
3. Tool capability is broad in project/global contexts and especially broad in gateway mode, where execution validation uses the full tool registry instead of context-scoped tools (`apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts:94`, `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts:689`, `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts:260`).
4. Session metrics accounting has a correctness risk: v2 manually increments counters after inserts, while shared DB definitions indicate trigger-based increments on message insert (`apps/web/src/lib/services/agentic-chat-v2/session-service.ts:186`, `apps/web/src/routes/api/agent/v2/stream/+server.ts:938`, `packages/shared-types/src/functions/index.md:368`, `packages/shared-types/src/functions/function-defs.md:8505`).
5. V2 context/prompt payloads can become large (full JSON context injected into prompt), while the usage meter uses a fixed 8k heuristic, so context pressure detection is approximate (`apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts:105`, `apps/web/src/lib/services/agentic-chat-v2/context-usage.ts:4`).
6. V2 has no explicit request rate limiting path equivalent to legacy `/api/agent/stream` rate limiter checks (`apps/web/src/routes/api/agent/stream/+server.ts:222`). Inference: no matching guard exists in `apps/web/src/routes/api/agent/v2/stream/+server.ts`.
7. Overall: BuildOS agent is currently strong for direct, tool-backed CRUD/retrieval turns, but weaker for legacy-style plan lifecycle, context-shift semantics, and deterministic continuity.

## End-to-End Flow Map

### 1) Client request and stream handling

1. User message is sent from `AgentChatModal` to `/api/agent/v2/stream` with context/session/focus and extra legacy fields (`apps/web/src/lib/components/agent/AgentChatModal.svelte:2684`).
2. Payload includes `ontologyEntityType` and `lastTurnContext` for continuity (`apps/web/src/lib/components/agent/AgentChatModal.svelte:2695`, `apps/web/src/lib/components/agent/AgentChatModal.svelte:2697`).
3. Client consumes SSE and handles many event types, including legacy planning/context events (`apps/web/src/lib/components/agent/AgentChatModal.svelte:2781`, `apps/web/src/lib/components/agent/AgentChatModal.svelte:2931`, `apps/web/src/lib/components/agent/AgentChatModal.svelte:3190`).

### 2) V2 backend stream path

1. V2 route authenticates and parses request, validates `message`, emits initial `agent_state` (`apps/web/src/routes/api/agent/v2/stream/+server.ts:584`, `apps/web/src/routes/api/agent/v2/stream/+server.ts:598`, `apps/web/src/routes/api/agent/v2/stream/+server.ts:606`).
2. Project access check is only done for project/audit/forecast contexts; RPC failure is fail-open (`apps/web/src/routes/api/agent/v2/stream/+server.ts:627`, `apps/web/src/routes/api/agent/v2/stream/+server.ts:69`, `apps/web/src/routes/api/agent/v2/stream/+server.ts:82`).
3. Session is resolved/updated via fast session service, then recent history loaded with a 10-message window (`apps/web/src/routes/api/agent/v2/stream/+server.ts:649`, `apps/web/src/routes/api/agent/v2/stream/+server.ts:659`).
4. Prompt context is loaded from `load_fastchat_context` (or fallback queries), then full master prompt is built and context usage snapshot emitted (`apps/web/src/routes/api/agent/v2/stream/+server.ts:778`, `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts:500`, `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts:78`, `apps/web/src/routes/api/agent/v2/stream/+server.ts:821`).
5. Tool list is selected by context/message; stream loop runs with tool-call rounds and validation (`apps/web/src/routes/api/agent/v2/stream/+server.ts:680`, `apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts:90`, `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts:157`, `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts:241`).
6. SSE outputs are primarily `text_delta`, `tool_call`, `tool_result`, `context_usage`, `session`, `agent_state`, `error`, `done` (`apps/web/src/routes/api/agent/v2/stream/+server.ts:895`, `apps/web/src/routes/api/agent/v2/stream/+server.ts:888`, `apps/web/src/routes/api/agent/v2/stream/+server.ts:891`, `apps/web/src/routes/api/agent/v2/stream/+server.ts:946`).
7. Route persists user + assistant messages and updates session stats; tool executions are logged by executor into `chat_tool_executions` (`apps/web/src/routes/api/agent/v2/stream/+server.ts:666`, `apps/web/src/routes/api/agent/v2/stream/+server.ts:921`, `apps/web/src/routes/api/agent/v2/stream/+server.ts:938`, `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor-refactored.ts:540`).
8. Agent-state reconciliation runs async post-stream and writes metadata patch (`apps/web/src/routes/api/agent/v2/stream/+server.ts:971`, `apps/web/src/routes/api/agent/v2/stream/+server.ts:987`).

### 3) Adjacent flows

1. Prewarm endpoint still uses legacy prewarm caches (`locationContextCache`, `linkedEntitiesCache`, `docStructureCache`) and legacy project checks (`apps/web/src/routes/api/agent/prewarm/+server.ts:149`, `apps/web/src/routes/api/agent/prewarm/+server.ts:172`, `apps/web/src/routes/api/agent/prewarm/+server.ts:295`).
2. V2 route uses separate `fastchat_context_cache` metadata with 2-minute TTL (`apps/web/src/routes/api/agent/v2/stream/+server.ts:50`, `apps/web/src/routes/api/agent/v2/stream/+server.ts:662`, `apps/web/src/routes/api/agent/v2/stream/+server.ts:790`).
3. Session resume endpoint returns user/assistant-only messages and does not include tool/system history (`apps/web/src/routes/api/chat/sessions/[id]/+server.ts:51`).

## Contract Mismatch Table

| Area | Client/Shared Contract | V2 Runtime Behavior | Impact | Evidence |
|---|---|---|---|---|
| Request continuity fields | Client sends `lastTurnContext` and `ontologyEntityType` | V2 request type omits both; route does not reference either | continuity/context intent passed by client is ignored in v2 | `apps/web/src/lib/components/agent/AgentChatModal.svelte:2695`, `apps/web/src/lib/components/agent/AgentChatModal.svelte:2697`, `apps/web/src/lib/services/agentic-chat-v2/types.ts:12` |
| `stream_run_id` | Included in payload for stale stream correlation | Present in v2 type but unused in route | server-side traceability/cancellation correlation gap | `apps/web/src/lib/components/agent/AgentChatModal.svelte:2698`, `apps/web/src/lib/services/agentic-chat-v2/types.ts:18` |
| SSE event breadth | Shared `AgentSSEMessage` includes `last_turn_context`, `plan_*`, `step_*`, `context_shift`, `focus_*`, `entity_patch` | V2 emits a reduced subset (no `last_turn_context`, no plan lifecycle, no context shift) | UI has handlers for events that never arrive on v2; features appear dormant | `packages/shared-types/src/agent.types.ts:398`, `apps/web/src/routes/api/agent/v2/stream/+server.ts:607`, `apps/web/src/routes/api/agent/v2/stream/+server.ts:895` |
| `agent_state` shape | Shared type requires `contextType` | V2 sends `agent_state` without `contextType` | strict typed consumers can drift from runtime payload | `packages/shared-types/src/agent.types.ts:406`, `apps/web/src/routes/api/agent/v2/stream/+server.ts:607` |
| `tool_batch` mode | Gateway schema exposes `mode: sequential|parallel` | Execution loop is sequential only; mode not used | parallel expectation mismatch; performance potential not realized | `apps/web/src/lib/services/agentic-chat/tools/core/definitions/gateway.ts:105`, `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts:622` |
| `idempotency_key` | Gateway schema advertises idempotency support | Key is forwarded in batch entry but not consumed in execution path | repeated write retries can duplicate changes | `apps/web/src/lib/services/agentic-chat/tools/core/definitions/gateway.ts:61`, `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts:638` |

## Findings By Severity

### Critical

1. **Gateway mode can execute against full registry, not context-scoped tools.**
Impact: tool execution scope expands beyond selected context, weakening contextual safety boundaries.
Evidence: gateway selection returns only gateway tools (`apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts:94`), but `tool_exec` validation/defaulting uses `CHAT_TOOL_DEFINITIONS` directly (`apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts:689`, `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts:699`).
Confidence: High.

2. **Session metrics correctness risk (potential double-counting).**
Impact: `message_count`/`total_tokens_used` can drift, harming analytics, quotas, and operational dashboards.
Evidence: v2 manually increments session stats after inserts (`apps/web/src/routes/api/agent/v2/stream/+server.ts:938`, `apps/web/src/lib/services/agentic-chat-v2/session-service.ts:192`), while shared DB trigger definitions show insert-triggered updates on `chat_messages` (`packages/shared-types/src/functions/index.md:368`, `packages/shared-types/src/functions/function-defs.md:8505`).
Confidence: Medium-High (depends on deployed trigger state).

### High

1. **No explicit v2 rate limiting path equivalent to legacy stream.**
Impact: higher abuse and cost-exhaustion risk.
Evidence: legacy endpoint enforces rate limiter (`apps/web/src/routes/api/agent/stream/+server.ts:222`). Inference: equivalent guard is absent in `apps/web/src/routes/api/agent/v2/stream/+server.ts`.
Confidence: High.

2. **Continuity contract is effectively dropped in v2 path.**
Impact: weaker cross-turn semantic continuity and entity carry-over.
Evidence: client sends `lastTurnContext` (`apps/web/src/lib/components/agent/AgentChatModal.svelte:2697`); v2 request type excludes it (`apps/web/src/lib/services/agentic-chat-v2/types.ts:12`); v2 route does not emit `last_turn_context` (no emission path), while legacy does (`apps/web/src/routes/api/agent/stream/services/stream-handler.ts:445`).
Confidence: High.

3. **Legacy/v2 split protocol leaves planner UI paths dormant on v2.**
Impact: users see reduced behavior relative to UI affordances for plans/executors/context shifts.
Evidence: UI handles plan/context events (`apps/web/src/lib/components/agent/AgentChatModal.svelte:2931`, `apps/web/src/lib/components/agent/AgentChatModal.svelte:3190`); v2 stream sends text/tool subset (`apps/web/src/routes/api/agent/v2/stream/+server.ts:895`, `apps/web/src/routes/api/agent/v2/stream/+server.ts:891`); legacy mapper still supports full plan lifecycle (`apps/web/src/routes/api/agent/stream/utils/event-mapper.ts:74`).
Confidence: High.

4. **Project access precheck is fail-open on RPC error/exception.**
Impact: if access RPC fails, route proceeds; downstream layers must absorb authorization safety.
Evidence: check returns allowed on RPC failure/exception (`apps/web/src/routes/api/agent/v2/stream/+server.ts:69`, `apps/web/src/routes/api/agent/v2/stream/+server.ts:82`).
Confidence: High.

5. **Gateway API surface advertises stronger semantics than implemented (`mode`, `idempotency_key`).**
Impact: clients/agents can over-assume concurrency safety and dedupe guarantees.
Evidence: gateway schema exposes both (`apps/web/src/lib/services/agentic-chat/tools/core/definitions/gateway.ts:61`, `apps/web/src/lib/services/agentic-chat/tools/core/definitions/gateway.ts:105`), but execution path ignores `mode` and idempotency handling (`apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts:622`, `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts:638`).
Confidence: High.

### Medium

1. **Operation SSE path in v2 is implemented but effectively unused.**
Impact: operation-level UI telemetry is sparse compared with intended behavior.
Evidence: `emitContextOperations` exists (`apps/web/src/routes/api/agent/v2/stream/+server.ts:499`) but has no callsite in v2 route.
Confidence: High.

2. **Prompt/context size pressure risk from full JSON embedding + fixed 8k estimator.**
Impact: context can exceed practical model windows unpredictably; budget status may be misleading.
Evidence: full context JSON is injected into prompt (`apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts:105`), while usage estimator uses `chars/4` and fixed 8k budget (`apps/web/src/lib/services/agentic-chat-v2/context-usage.ts:4`, `apps/web/src/lib/services/agentic-chat-v2/context-usage.ts:17`).
Confidence: High.

3. **Global context scope may under-represent shared/project-member visibility.**
Impact: global summaries can miss projects not `created_by` current user.
Evidence: global loading filters by `created_by` in both SQL RPC and fallback loader (`packages/shared-types/src/functions/load_fastchat_context.sql:48`, `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts:532`).
Confidence: Medium.

4. **Prewarm and v2 runtime caches are misaligned.**
Impact: prewarm work may provide limited benefit to v2 stream latency/context quality.
Evidence: prewarm writes legacy caches (`apps/web/src/routes/api/agent/prewarm/+server.ts:295`), while v2 reads/writes `fastchat_context_cache` (`apps/web/src/routes/api/agent/v2/stream/+server.ts:662`, `apps/web/src/routes/api/agent/v2/stream/+server.ts:790`).
Confidence: High.

5. **History fed to v2 omits tool role and is capped at last 10.**
Impact: reduced tool-result memory and shorter conversational grounding.
Evidence: `loadRecentMessages(..., 10)` and role filter user/assistant/system (`apps/web/src/routes/api/agent/v2/stream/+server.ts:659`, `apps/web/src/lib/services/agentic-chat-v2/session-service.ts:147`).
Confidence: High.

6. **`project_audit` and `project_forecast` are label-level modes without specialized tool groups.**
Impact: audit/forecast contexts behave mostly like generic project context.
Evidence: TODO empty groups (`apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts:256`) and context mapping falls back to project groups (`apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts:265`).
Confidence: High.

7. **Debug logging artifact in v2 tool patch path.**
Impact: noisy logs and accidental leakage of function args to console.
Evidence: `console.log(toolCall.function)` in production path (`apps/web/src/routes/api/agent/v2/stream/+server.ts:742`).
Confidence: High.

8. **No direct automated tests found for v2 stream/tool-selector path.**
Impact: regressions likely in protocol/tool scope/metrics behaviors.
Evidence: no matching tests found for `agentic-chat-v2` or `/api/agent/v2/stream` in `apps/web/src` test/spec search.
Confidence: Medium.

### Low

1. **Stale route header comment in v2 stream file.**
Impact: misleading for maintainers.
Evidence: comment says "no tools/planner" (`apps/web/src/routes/api/agent/v2/stream/+server.ts:8`) but route executes tool flow (`apps/web/src/routes/api/agent/v2/stream/+server.ts:841`).
Confidence: High.

2. **`buildFastSystemPrompt` appears unused.**
Impact: dead code/confusion about intended prompt strategy.
Evidence: definition only (`apps/web/src/lib/services/agentic-chat-v2/prompt-builder.ts:25`); no project references found.
Confidence: High.

## BuildOS Capability Matrix (Evidence-Based)

| Capability | Evidence | Preconditions | Confidence | Limiting Factors | Current Reliability Status |
|---|---|---|---|---|---|
| Real-time streaming assistant responses | v2 emits `text_delta`/`done` and closes stream in finally (`apps/web/src/routes/api/agent/v2/stream/+server.ts:895`, `apps/web/src/routes/api/agent/v2/stream/+server.ts:1023`) | valid auth + non-empty message | High | upstream model/network errors | Reliable |
| Tool-calling within a single turn | tool events tracked and executed in loop (`apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts:189`, `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts:281`) | selected tools + executor configured | High | tool schema quality, tool backend failures | Reliable |
| Tool-call validation + repair attempt | validation and one retry instruction (`apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts:241`, `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts:269`, `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts:471`) | model follows repair instruction | Medium-High | only one repair retry | Conditional |
| Ontology read/write operations | project tool groups include CRUD and graph/doc tools (`apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts:202`) | valid IDs, access, RLS compliance | High | context/tool scope mismatches, argument quality | Conditional |
| Calendar operations | calendar tools in groups and gateway registry (`apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts:248`, `apps/web/src/lib/services/agentic-chat/tools/registry/tool-registry.ts:53`) | calendar integration configured | Medium | intent gating heuristics, auth/provider failures | Conditional |
| Web research operations | web tools and intent gating patterns (`apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts:11`, `apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts:24`) | web intent detected or gateway discovery | Medium | keyword misses/false positives | Conditional |
| Gateway discover-and-execute pattern (`tool_help`/`tool_exec`) | gateway definitions and execution path (`apps/web/src/lib/services/agentic-chat/tools/core/definitions/gateway.ts:10`, `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts:593`) | env flag enabled | High | scope broadening, no real idempotency/mode semantics | Conditional |
| Project/focus context loading (including linked entities) | RPC + focused entity loading and linked edges/entities (`apps/web/src/lib/services/agentic-chat-v2/context-loader.ts:500`, `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts:851`) | project ID/focus available | High | payload size, access failures, fallback behavior | Conditional |
| Session resume for user-visible chat | resume API and session event hydration (`apps/web/src/routes/api/chat/sessions/[id]/+server.ts:11`, `apps/web/src/lib/components/agent/AgentChatModal.svelte:2786`) | valid session ID | High | tool/system context not resumed | Limited |
| Last-turn semantic continuity carry-over | shared type + UI path exist, but v2 does not emit/consume | none | High | missing v2 request/response wiring | Not Reliable |
| Planner/executor lifecycle visibility (`plan_created`, `step_*`, executors) | supported in legacy mapper/UI (`apps/web/src/routes/api/agent/stream/utils/event-mapper.ts:74`, `apps/web/src/lib/components/agent/AgentChatModal.svelte:2931`) | must use legacy stream | High | v2 endpoint does not provide these events | Not Reliable on v2 |
| Context-shift driven session mutation during turn | implemented in legacy stream handler (`apps/web/src/routes/api/agent/stream/services/stream-handler.ts:1584`) | legacy orchestration/tool result context shift | High | not present in v2 output contract | Not Reliable on v2 |

## Predictions: What BuildOS Agent Can and Cannot Reliably Do Today

### Capable Now (Predicted)

1. **Direct project CRUD turns with immediate feedback**: likely successful when user intent maps cleanly to existing tools (task/goal/plan/doc create/update/delete), because v2 tool loop validates required args and streams results (`apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts:241`, `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts:202`).
2. **Focused project Q&A using current graph context**: likely strong if `projectFocus` is provided; context loader includes project aggregates and linked entities (`apps/web/src/lib/services/agentic-chat-v2/context-loader.ts:846`, `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts:851`).
3. **Calendar and web-assisted responses for explicit intents**: likely available when regex gates activate or gateway mode is enabled (`apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts:76`, `apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts:82`).
4. **Stable single-turn streaming UX**: likely reliable due explicit `done`/error semantics and stream close in finally (`apps/web/src/routes/api/agent/v2/stream/+server.ts:946`, `apps/web/src/routes/api/agent/v2/stream/+server.ts:1017`, `apps/web/src/routes/api/agent/v2/stream/+server.ts:1023`).

### Not Reliable Now (Predicted)

1. **Legacy-style plan lifecycle UI behaviors on v2** (`plan_created`, step progression, executor events): UI can render them, but v2 does not emit them.
2. **Cross-turn continuity depending on `last_turn_context` semantics**: client sends/handles this, but v2 currently ignores inbound and does not emit outbound continuity event.
3. **Strict context-bounded execution in gateway mode**: discovery/execution can extend to the full registry instead of selected context tool subset.
4. **Accurate session metric accounting under all paths**: risk of drift due overlapping manual/stat-trigger update patterns.
5. **Large-context turns with deterministic budget control**: fixed 8k estimator and full JSON context injection make token pressure behavior approximate.
6. **Operational protection parity with legacy endpoint under abuse**: missing explicit v2 rate limiter path suggests weaker defense.

## Gaps and Remediation Priorities (No Code Changes Applied)

### P0

1. Enforce scope-safe gateway execution: validate `tool_exec` against context-scoped allowed tools, not global definitions.
2. Resolve session metrics ownership: choose one authoritative mechanism (trigger/RPC/manual) and remove duplicate paths.
3. Add v2 rate limiting and abuse controls at route boundary.

### P1

1. Reconcile v2 protocol with client/shared contracts: either emit required legacy continuity/planning events or simplify client/shared types for v2-only contract.
2. Wire true continuity signals for v2 (`last_turn_context` consume/emit) or remove dead continuity fields from client payload.
3. Implement real `tool_batch` mode semantics and idempotency handling.

### P2

1. Align prewarm caches with v2 runtime cache strategy.
2. Add context budget guardrails: prompt truncation/compression policy tied to actual model context.
3. Add specialized tooling/prompt behaviors for `project_audit` and `project_forecast`.

### P3

1. Remove debug leftovers and stale comments.
2. Add targeted automated tests for v2 route, tool selector, and gateway behaviors.

## Residual Risks and Unknowns

1. Deployed database trigger state was inferred from shared function snapshots/docs and not runtime-validated in this audit.
2. Runtime behavior can vary by environment flag `AGENTIC_CHAT_TOOL_GATEWAY` (`apps/web/src/lib/services/agentic-chat/tools/registry/gateway-config.ts:3`).
3. Model/provider behavior in `SmartLLMService` is dynamic; capability predictions assume normal OpenRouter/tool-call semantics (`packages/smart-llm/src/smart-llm-service.ts:1365`).
4. No live traffic replay or production telemetry analysis was run in this audit.

## Appendix: File Reference Index

- `apps/web/src/routes/api/agent/v2/stream/+server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts`
- `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts`
- `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts`
- `apps/web/src/lib/services/agentic-chat-v2/prompt-builder.ts`
- `apps/web/src/lib/services/agentic-chat-v2/session-service.ts`
- `apps/web/src/lib/services/agentic-chat-v2/context-usage.ts`
- `apps/web/src/lib/services/agentic-chat-v2/types.ts`
- `apps/web/src/lib/services/agentic-chat-v2/limits.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor-refactored.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/gateway.ts`
- `apps/web/src/lib/services/agentic-chat/tools/registry/tool-registry.ts`
- `apps/web/src/lib/services/agentic-chat/tools/registry/gateway-config.ts`
- `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`
- `apps/web/src/lib/components/agent/AgentChatModal.svelte`
- `apps/web/src/routes/api/agent/prewarm/+server.ts`
- `apps/web/src/routes/api/agent/stream/+server.ts`
- `apps/web/src/routes/api/agent/stream/services/stream-handler.ts`
- `apps/web/src/routes/api/agent/stream/services/message-persister.ts`
- `apps/web/src/routes/api/agent/stream/services/session-manager.ts`
- `apps/web/src/routes/api/agent/stream/utils/event-mapper.ts`
- `apps/web/src/routes/api/chat/sessions/[id]/+server.ts`
- `packages/shared-types/src/agent.types.ts`
- `packages/shared-types/src/functions/load_fastchat_context.sql`
- `packages/shared-types/src/functions/increment_chat_session_metrics.sql`
- `packages/shared-types/src/functions/function-defs.md`
- `packages/shared-types/src/functions/index.md`
- `packages/smart-llm/src/smart-llm-service.ts`
- `packages/smart-llm/src/model-config.ts`
