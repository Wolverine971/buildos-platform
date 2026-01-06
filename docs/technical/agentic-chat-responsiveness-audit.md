<!-- docs/technical/agentic-chat-responsiveness-audit.md -->

# Agentic Chat Responsiveness Investigation

This document reviews the end-to-end agentic chat flow with a focus on time-to-first-feedback and time-to-first-token, then recommends concrete changes to make the UI feel faster while preserving quality.

## Decision log (2026-02-05)

- ✅ Open the SSE stream earlier and emit an immediate `agent_state` event (no step-by-step preflight details).
- ✅ Ensure indexing for baseline chat queries; avoid user-visible “auth/session/ontology/context build” progress noise.
- ✅ Parallelize independent context steps.
- ✅ Skip LLM compression on the critical path; use last N messages + `lastTurnContext`, then compress asynchronously for the next turn.
- ✅ Pre-warm linked entities and location context on chat open or focus change.
- ✅ For `project_create`, send an immediate friendly acknowledgment before the clarification analysis; stream questions when ready.
- ✅ Use a speed profile for tool selection + project-create clarification with a quality fallback if confidence is low (commented for easy rollback).
- ❌ Keep planner streaming on the quality profile (no change).
- ⏸️ Observability work is deferred to phase 2.

## 1. UI already shows local "processing," but server feedback is delayed

- The client immediately creates a thinking block and sets the agent state to "thinking" before the network call (`apps/web/src/lib/components/agent/AgentChatModal.svelte:1936`). This should render instant visual feedback even if the server is slow.
- The first server-sent event only arrives after the API handler completes its pre-stream work and returns a streaming Response (`apps/web/src/routes/api/agent/stream/+server.ts:157`).
- **Impact:** users see local "processing" but get no server acknowledgement or content until the backend finishes preflight work. This feels like the system is idle if the request takes multiple seconds.
- **Recommendation:** open the SSE stream earlier and emit a lightweight "status/agent_state" event immediately. This provides server-side confirmation and lets the UI surface live progress beyond the local thinking block. See section 2.

## 2. Pre-stream work blocks time-to-first-byte

- The POST handler does authentication, actor resolution, session lookup/creation, focus resolution, ontology load, and message persistence before the stream is created (`apps/web/src/routes/api/agent/stream/+server.ts:157`).
- The stream is not opened until after these steps, so the client cannot receive any SSE data during the heaviest DB and context operations.
- **Impact:** time-to-first-byte is gated by database and ontology queries, which can dominate perceived latency.
- **Recommendations (updated):**
    - Move stream creation earlier and emit a single lightweight `agent_state` event (no per-step “auth/session/ontology/context” noise).
    - If access checks fail, emit `error` + `done` over the stream and close it instead of returning a non-streaming error response. This keeps the UI consistent and still fast.
    - Persist the user message after the stream starts (still before orchestrator begins), or in the stream task after access checks complete.
    - Ensure baseline DB steps are indexed and fast (focus on session, history, and tool-result queries).

## 3. Planner context build is serial and includes LLM calls

- Planner context building loads linked entities, generates prompts, compresses history, loads location context, and fetches the user profile sequentially (`apps/web/src/lib/services/agent-context-service.ts:121`).
- Compression can invoke the LLM (`apps/web/src/lib/services/chat-compression-service.ts:154`), which blocks before any planner tokens can stream.
- **Impact:** long histories or focus contexts can add multiple seconds before the first token.
- **Recommendations (updated):**
    - Parallelize independent context steps (linked entities, location context, user profile) with `Promise.all`.
    - For responsiveness, skip LLM compression on the critical path and use the last N messages plus `lastTurnContext` for this turn; run compression asynchronously and store the result for the next turn.
    - Pre-warm linked entities and location context when the user opens the chat or changes focus (best-effort; avoid creating empty sessions).

## 4. Tool selection and project-create clarification add extra LLM latency

- Tool selection calls LLM-driven strategy analysis before streaming (`apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts:130` and `apps/web/src/lib/services/agentic-chat/analysis/tool-selection-service.ts:121`).
- Project creation clarification uses an LLM analysis before the planner loop begins (`apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts:1251`).
- **Impact:** first token is delayed even for simple requests.
- **Recommendations (updated):**
    - No fast-path bypass for tool selection (quality prioritized; avoid heuristic-only skips).
    - For `project_create`, emit an immediate friendly acknowledgment and only then run the clarification analysis; stream the questions when ready.
    - Use a speed profile (or a smaller model) for tool selection and clarification, with a fallback to quality if confidence is low.

## 5. Planner streaming uses the quality model by default

- The planner loop uses the enhanced LLM wrapper with `operationType: 'planner_stream'`, which is mapped to the quality profile by default (`apps/web/src/lib/services/agentic-chat/config/model-selection-config.ts:35` and `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts:611`).
- **Impact:** slower time-to-first-token even when a quick response would be acceptable.
- **Recommendations (updated):**
    - No change: planner streaming remains on the quality profile by default.

## 6. Observability is missing for latency milestones

- There is no timing data emitted for preflight steps, context assembly, tool selection, or LLM first-token latency.
- **Impact:** hard to identify which steps dominate latency in production.
- **Recommendations (deferred):**
    - Add server-side timing logs and emit a `telemetry` event with per-step durations (auth, session, ontology, context build, tool selection, first token).
    - On the client, track time-to-first-byte, time-to-first-event, and time-to-first-token for each run and persist to analytics.

## Feasibility of "short responses immediately"

Short responses are feasible, but the implementation approach matters:

- **Low-risk:** send an immediate "processing" or "ack" SSE event as soon as the stream opens (no content, just progress feedback).
- **Medium-risk:** generate a short preface with a speed model, clearly marked as a prelude, then continue with the full response once the planner finishes.
- **Higher-risk:** replace the planner loop with a fast summarizer for the first turn; can reduce quality and increase rework if the summary is wrong.

## Recommended next steps (updated)

1. Validate time-to-first-event and time-to-first-token before/after these changes (local logs ok for now).
2. Monitor tool-selection/clarification accuracy with speed-profile fallback; revert to quality-only if accuracy drops.
3. Phase 2: implement observability and dashboards under `/admin`.
