<!-- apps/web/docs/features/agentic-chat/AGENTIC_CHAT_V2_BACKEND_FAST_SPEC.md -->

# Agentic Chat V2 Backend — Fast Stream Spec

**Status:** Draft (Design)  
**Owner:** BuildOS  
**Date:** 2026-02-06  
**Scope:** A minimal, high-speed streaming backend for Agentic Chat V2. This replaces the
current heavy orchestration path with a lean streaming pipeline and a new prompt stack.

This spec is intentionally scoped to a **fast, lightweight chat MVP**. It preserves the
core SSE contract and session persistence while deferring planner/executor/tooling until
Phase 2.

---

## 1. Goals

1. **Speed-first TTFT**: open the SSE stream immediately and stream text as soon as the
   LLM responds.
2. **Minimal DB work**: only load the last N messages and avoid heavy context assembly.
3. **New prompts only**: do not reuse existing planner/executor prompts.
4. **Clean separation**: small services with single responsibilities (session, prompt, stream).
5. **Stable event contract**: align with V2 event types while staying compatible with UI.

---

## 2. Non-Goals

- Planner/executor orchestration (Phase 2).
- Tool selection + tool execution (Phase 2).
- Full context packs and doc-structure expansion (Phase 2).
- Agent state reconciliation and summarizer (Phase 2).

---

## 3. New Endpoint

**POST** `/api/agent/v2/stream`

**Request body (MVP):**

```
{
  message: string,
  session_id?: string,
  context_type?: "global" | "project" | "entity" | "calendar" | "general" | "project_create" | ...,
  entity_id?: string,
  projectFocus?: { ... }, // optional, stored in session metadata
  stream_run_id?: string | number,
  voice_note_group_id?: string
}
```

**Response:** SSE stream with event objects (see Section 6).

---

## 4. Service Layout (MVP)

### 4.1 PromptBuilder (new)

- **Responsibility:** build a _fresh_ system prompt for V2.
- **Inputs:** context_type, entity_id (optional), feature flags.
- **Output:** single system prompt string.
- **Rule:** do not import or reuse any legacy prompt files.

### 4.2 SessionService (new)

- **Responsibility:** resolve or create a `chat_sessions` row, load recent messages,
  persist user + assistant messages, and update session stats.
- **Minimal DB ops:**
    - `chat_sessions` lookup/insert
    - `chat_messages` load (limit N)
    - `chat_messages` insert (user + assistant)
    - optional `voice_note_groups` link

### 4.3 StreamOrchestrator (new)

- **Responsibility:** build model inputs, stream LLM output, and emit SSE events.
- **Inputs:** user message, session, history, prompt.
- **Output:** `text_delta` events + final `done`.
- **Rule:** stream always; never block on persistence.

---

## 5. Fast Path Flow (MVP)

1. **Auth** user (no actor resolution required).
2. **Open SSE** immediately and emit:
    - `agent_state: thinking`
3. **Resolve session** (create if missing) and emit:
    - `session` event (authoritative session object)
4. **Load last N messages** (default 8–12).
5. **Persist user message** in the background.
6. **Stream LLM** with new prompt:
    - emit `text_delta` events
7. **Persist assistant message** and update session stats.
8. **Emit done** (always).

---

## 6. SSE Event Contract (MVP)

### 6.1 Required events

```
session
agent_state
text_delta
error
done
```

### 6.2 Optional (Phase 2)

```
operation
entity_patch
context_usage
last_turn_context
plan_created / step_* / executor_*
```

### 6.3 Example stream

```
{ type: "agent_state", state: "thinking", details: "BuildOS is processing..." }
{ type: "session", session: { id: "...", context_type: "global", ... } }
{ type: "text_delta", content: "Here is a fast answer..." }
{ type: "done", usage: { total_tokens: 512 } }
```

---

## 7. Prompt Design (MVP)

**Base rules:**

- Be fast, direct, and concise.
- Ask a single clarifying question when required.
- Do not invent data or claim to have taken actions.
- Use markdown only when helpful.

**Scope addendum:**

- **global:** general BuildOS assistant.
- **project/entity:** indicate you need specific doc/task context if required.

---

## 8. Performance Decisions

- **Model selection:** `TextProfile = "speed"` (SmartLLM).
- **History window:** last 8–12 messages only.
- **No tool execution** in MVP (reduces latency).
- **Async persistence** to avoid blocking TTFT.
- **No heavy ontology loads** on the fast path.

---

## 9. Migration Plan

1. Add `/api/agent/v2/stream` and wire UI to use it by default.
2. Keep `/api/agent/stream` intact for fallback.
3. Incrementally add:
    - context packs (doc_structure, project summary)
    - operation + entity_patch events
    - planner + executor loop

---

## 10. Phase 2 Add-ons (Planned)

- ContextPack builder (doc-first).
- Tool selection + CRUD tool execution.
- Operation events + entity_patch events.
- Agent State + summarizer reconciliation.
- Backpressure and event coalescing.
