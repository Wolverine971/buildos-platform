<!-- apps/web/docs/features/agentic-chat/AGENTIC_CHAT_V2_UI_SPEC.md -->

# Agentic Chat V2 UI Spec

**Status:** Draft (Design)
**Owner:** BuildOS
**Date:** 2026-02-05
**Scope:** UI updates to support Agentic Chat V2 while reusing `AgentChatModal`.

---

## 1. Goals

- Reuse existing `AgentChatModal` layout and interaction model.
- Display **human-readable operations** (no raw IDs).
- Keep UI in sync with backend via `entity_patch` events.
- Avoid loading document content by default; only show what the agent explicitly loads.

---

## 2. Non-Goals

- Building a new chat UI from scratch.
- Rendering a full document tree (not used yet).
- Exposing raw tool call payloads to users.

---

## 3. Primary UI Surfaces

### 3.1 AgentChatModal (Reuse)

Keep the modal shell, message list, input box, and streaming text as-is.
Enhancements are in **event rendering** and **data sync**.

### 3.2 Operation Feed (New, Inline)

Display lightweight “activity chips” inside the message stream:

- “Reading document: Competitor Scan”
- “Searching tasks: onboarding”
- “Created task: Draft landing page”

Show as inline chips or small status rows between messages.

---

## 4. Event Handling + Rendering

### 4.1 Event Types

UI must handle:

- `text_delta` (stream assistant text)
- `operation` (new, human-readable tool activity)
- `entity_patch` (state mutations)
- `tool_result` (optional, for debugging only)
- `error`, `done`

### 4.2 Operation Event Display

Render `operation` events with:

- **action verb** (list/search/read/create/update/delete)
- **entity type**
- **entity name**
- **status** indicator (start/success/error)

Fallbacks:

- If `entity_name` missing → show “Working…” then update once resolved.
- Never show raw IDs to the user.

### 4.3 Entity Patch Sync

`entity_patch` updates should:

- update local caches (tasks/docs/etc.)
- refresh in-memory context previews
- avoid re-rendering the full UI tree unless necessary

Chat text is **not** authoritative for state; patches are.

---

## 5. Data Sync Rules

- **No doc tree fetch** by default.
- Use doc_structure only as context metadata.
- Only fetch document content when the agent explicitly loads it.

If a document is fetched:

- optionally show a short “Document loaded” chip
- do not auto-render the full document in chat

---

## 6. Agent State (Optional UI)

If agent state events are exposed later:

- show a minimal “Agent State” panel or inline notes
- items marked as provisional until promoted

This is optional for V2.1 and can be deferred. By default, agent state is
**internal only** and not rendered to the user.

---

## 7. Visual Style Notes

- Keep the current modal aesthetic.
- Operation chips should be subtle (small, low-contrast).
- Use icons only if they already exist in the system.

---

## 8. Implementation Notes for Claude (UI)

- Reuse `AgentChatModal.svelte` and its existing stream handling.
- Add a small renderer for `operation` events (chip list or inline rows).
- Ensure `entity_patch` updates flow into the same store used by list views.
- Do not introduce new global state unless needed.
