<!-- apps/web/docs/features/ontology/DYNAMIC_TEMPLATE_CREATION_CONTRACT.md -->

# Dynamic Template Creation – Handoff Contract

**Status:** Draft (Implementation in progress)  
**Owners:** Agentic Chat + Ontology Platform  
**Updated:** November 8, 2025

This document translates the escalation plan into an explicit technical contract between the **project-create planner** and the **template-creation workflow**. It focuses on payloads, events, and observability requirements so we can build the feature incrementally without ambiguity.

---

## 1. Event Timeline (Happy Path)

1. **Template discovery attempt**
    - Planner consumes `locationContext` (embedded catalog) and may call `list_onto_templates`.
    - Failure criteria:
        - Zero candidates returned.
        - All candidates rejected (e.g., wrong realm, schema mismatch).

2. **Clarification guard (optional)**
    - If planner cannot propose a realm or deliverable, emit a standard `clarifying_questions` event that explicitly references template creation.
    - Resume discovery after receiving user response.

3. **Escalation**
    - Planner emits `template_creation_request` SSE with the data described below.
    - Request is persisted via the Template Creation Service (TCS) and acknowledged immediately.

4. **Template generation**
    - TCS runs its own multi-step workflow (LLM + validation + CRUD) until a concrete template exists.
    - While running, optional `template_creation_status` events keep the user informed.

5. **Completion**
    - TCS responds with `template_created` SSE payload that includes the new template, schema summary, and recommended starter entities.
    - Planner automatically resumes project creation, now that `type_key` is known, and calls `create_onto_project`.

6. **Context shift**
    - Once the project instantiates successfully, the normal `context_shift` event fires and the session transitions to the new project workspace.

---

## 2. SSE Event Definitions

All events use the existing SSE stream and share the `session_id`.

### `template_creation_request`

```jsonc
{
	"type": "template_creation_request",
	"request": {
		"request_id": "tplreq_123",
		"session_id": "chat_456",
		"user_id": "user_789",
		"braindump": "Build me a storytelling retreat planner...",
		"realm_suggestion": "retreats.personal",
		"template_hints": ["Needs deliverables for venue, agenda, coaching segments"],
		"missing_information": [],
		"source_message_id": "msg_abc",
		"confidence": 0.78,
		"created_at": "2025-11-08T17:00:00Z"
	}
}
```

| Field                 | Description                                                               |
| --------------------- | ------------------------------------------------------------------------- |
| `request_id`          | Stable ID used by both agents for logs.                                   |
| `realm_suggestion`    | Planner’s best guess (slug). Required before escalating.                  |
| `template_hints`      | Structured notes (facets, deliverables, schema ideas).                    |
| `missing_information` | Signals what the planner could not infer—used only if we still escalated. |
| `source_message_id`   | Helps the UI highlight which user entry triggered the request.            |

### `template_creation_status`

```jsonc
{
	"type": "template_creation_status",
	"request_id": "tplreq_123",
	"status": "generating_schema", // queued | generating_schema | validating | persisting | failed
	"message": "Drafting JSON schema for project.retreat.storytelling"
}
```

Used for long-running jobs; entirely optional but provides a better UX when waiting.

### `template_created`

```jsonc
{
  "type": "template_created",
  "request_id": "tplreq_123",
  "template": {
    "id": "tmpl_901",
    "type_key": "project.retreat.storytelling",
    "realm": "retreats.personal",
    "name": "Storytelling Retreat Project",
    "schema_summary": {
      "required_properties": ["story_pillars", "sessions", "venue"],
      "fsm_states": ["ideation", "planning", "execution", "retro"],
      "facet_defaults": {
        "context": "personal",
        "scale": "medium",
        "stage": "discovery"
      }
    },
    "recommended_entities": {
      "goals": [...],
      "tasks": [...],
      "outputs": [...]
    }
  }
}
```

Planner immediately treats this as the selected template and continues the normal `create_onto_project` flow.

### `template_creation_failed`

```jsonc
{
	"type": "template_creation_failed",
	"request_id": "tplreq_123",
	"error": "Realm retreats.personal is blocked for auto-generation",
	"actionable": true
}
```

If `actionable` is `true`, planner should surface the failure to the user and optionally ask for an alternative. If `false`, planner should fall back to human escalation.

---

## 3. Template Creation Service (TCS) API

```
POST /api/agentic/template-creation/requests
```

```jsonc
{
  "request_id": "tplreq_123",
  "session_id": "chat_456",
  "user_id": "user_789",
  "realm": "retreats.personal",
  "braindump": "...",
  "template_hints": [...],
  "conversation_history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "source_context": {
    "location_context": "...",
    "plan_summary": "...",
    "facets_inferred": {
      "context": "personal"
    }
  }
}
```

**Response**

```jsonc
{
	"success": true,
	"status": "queued",
	"request_id": "tplreq_123",
	"estimated_seconds": 25
}
```

The service is responsible for:

1. Running the LLM workflow that generates schema + FSM + metadata.
2. Validating via `TemplateValidationService`.
3. Persisting with `TemplateCrudService`.
4. Emitting SSE callbacks (`template_creation_status` / `template_created`).

---

## 4. Planner Responsibilities

| Step          | Responsibility                                                                                |
| ------------- | --------------------------------------------------------------------------------------------- |
| Detection     | Determine that existing templates are insufficient **and** propose a realm before escalating. |
| Clarification | Ask one targeted question if missing critical info.                                           |
| Packaging     | Send braindump, hints, inferred facets, and rejection reasons.                                |
| Resume        | Upon `template_created`, immediately re-run project inference and call `create_onto_project`. |
| Telemetry     | Record `template_creation_requested` + `template_created` events for analytics.               |

---

## 5. Observability & Storage

- **Table:** `agent_template_creation_requests` (new) to track state machine (`requested → generating → completed | failed`).
- **Metrics:** `template_creation.requests.count`, `template_creation.success.rate`, `template_creation.clarification.count`.
- **Logs:** Include `request_id`, `session_id`, and `realm` in every log entry.
- **Retry Policy:** TCS should retry validation/CRUD failures up to 2 times before emitting `template_creation_failed`.

---

## 6. Incremental Implementation Checklist

1. **Types & SSE**
    - [ ] Extend `StrategyAnalysis` and stream events with template creation metadata.
    - [ ] Update `AgentChatModal` to render new events.
2. **Planner hook**
    - [ ] Detect escalation condition (initial heuristic: zero templates found).
    - [ ] Emit `template_creation_request` event with payload.
3. **Template Creation Service**
    - [ ] Stub API endpoint + DB table.
    - [ ] Integrate with Template CRUD/Validation.
4. **Auto-resume flow**
    - [ ] When `template_created` arrives, call `create_onto_project` using new `type_key`.
5. **Telemetry + Alerts**
    - [ ] Add request/response logging and dashboards.

---

## 7. Open Questions

1. **Realm taxonomy enforcement** – Should TCS create new realms or only use existing ones?
2. **User confirmation** – Do we ever need explicit consent before creating a new template?
3. **Versioning** – Should automatically generated templates start as `draft` and be promoted later, or go straight to `active`?
4. **Human review** – Where do failed or low-confidence creations surface for human follow-up?

These decisions will affect both the API response contract and governance tooling.

---

By codifying the handoff, we can map the next engineering tasks directly to implementation issues (types, SSE, services, persistence) while keeping UX and governance requirements explicit.
