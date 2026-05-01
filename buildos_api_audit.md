<!-- buildos_api_audit.md -->

# BuildOS Agent API — Mini Audit Report

**Date:** April 30, 2026
**Surface tested:** `POST /api/agent-call/buildos` (openclaw caller)
**Scope:** 31 projects, read_write, all 51 allowed_ops
**Test playground:** "The Last Ember" (`ff0d528b-…`)
**Tools probed:** 56 of 56

---

## TL;DR

BuildOS's agent API is largely solid and the **calendar list endpoint is genuinely best-in-class** — it has a clean pagination block, a `warnings` array, and echoes the `queried_range`. The rest of the API should aspire to that shape.

The ontology read endpoints have several real issues that compound: the `total` field is unreliable, the `limit` cap is too low for some entity types, there's no offset/cursor pagination, and a few internals leak through (raw Postgres tsvectors, enum errors). Writes are well-instrumented (`dry_run`, `idempotency_key`, `meta.replayed`) but several response shapes have double-nested or duplicated fields.

Below: bugs, inconsistencies, strengths, and concrete recommendations.

---

## 🔴 Bugs (real issues, fix soon)

### 1. `list_onto_projects.total` is meaningless — it just echoes page size

- `limit: 5` → `total: 5`
- `limit: 30` → `total: 30`
- `limit: 1` → `total: 1`

Compare with `list_onto_tasks`, which correctly returns `total: 412` regardless of limit. Likely a missing `count(*)` query in the project list handler. **Clients can't tell when more results exist.**

### 2. `list_onto_projects` caps at 30 with no offset/cursor — projects beyond it are unreachable via list

This is what we hit at the start. The granted scope had 31 project IDs; the 31st (`Comfort & Nourishment Newsletter Article`) could only be reached by `get_onto_project_details` with the known UUID. Worse: combined with bug #1, the client can't even tell that a 31st project exists.

### 3. `list_onto_tasks` leaks raw Postgres enum errors on bad `state_key`

```json
{
	"code": "INTERNAL",
	"message": "invalid input value for enum task_state: \"bogus_state\"",
	"help_path": "onto.task.list"
}
```

Compare with `create_onto_task`, which correctly returns:

```json
{
	"code": "VALIDATION_ERROR",
	"message": "state_key must be one of: todo, in_progress, blocked, done"
}
```

The list handler is shoving the param straight into a SQL enum cast without validating first. Same fix the create handler already has — apply it to list/search.

### 4. `get_entity_relationships.direction` silently ignores invalid values

Passing `direction: "invalid"` returns the same result as the default. The schema implies an enum (in/out/both) but there's no validation. Either reject unknown values or document the actual accepted set.

### 5. `cal.project.get` returns double-nested null

```json
"result": { "result": null }
```

Should be `"result": null` or `"result": { "calendar": null }`. The wrapper is wrapping itself.

### 6. Document responses double-nest `children`

```json
"children": { "children": [] }
```

Should be `"children": []`.

### 7. `search_vector` (Postgres tsvector) leaks in responses

Visible in document and goal payloads — for example:

```
"search_vector": "'complet':1A 'ember':4A 'fantasi':5A 'last':3A 'novel':6A …"
```

This is internal full-text-search machinery, not API surface. Strip it from the serializer.

### 8. `priority` validation message ignores the documented range

Schema says "Optional priority from 1-5". Validator says `"priority must be a number"`. When I sent `"low"`, I should have been told "priority must be a number from 1 to 5." Small UX win, free.

---

## 🟡 Inconsistencies (paper cuts that compound)

### A. `total` semantics vary by endpoint

| Endpoint               | `total` means                       |
| ---------------------- | ----------------------------------- |
| `list_onto_projects`   | `len(returned)` ❌                  |
| `list_onto_tasks`      | DB total ✅                         |
| `list_onto_documents`  | DB total ✅                         |
| `list_onto_goals`      | DB total ✅                         |
| `list_onto_plans`      | DB total ✅                         |
| `list_onto_milestones` | indeterminate (only 1 row in DB)    |
| `list_onto_risks`      | indeterminate (only 1 row in DB)    |
| `cal.event.list`       | uses richer `pagination` block ✅✨ |

### B. Search response shapes drift

- `search_onto_projects` → top-level key is `projects`, includes `total`
- `search_onto_tasks` / `search_onto_documents` / `search_ontology` → top-level key is `results`, no `total`

Pick one shape (`results` + `total` is ideal) and apply everywhere.

### C. Parameter aliases bloat the schema

`list_calendar_events` accepts **all of these**:

- `timeMin` AND `time_min`
- `timeMax` AND `time_max`
- `query` AND `q`
- `limit` AND `max_results`

Calendar event get/update/delete accept **three** ID params: `onto_event_id`, `event_id`, `external_event_id`. The rules of precedence aren't documented.

`create_onto_document` accepts `content` AND `body_markdown` (no docs on which wins), and `parent_document_id` AND `parent_id`. I sent both `content` and `body_markdown` in dry_run — the API accepted both without warning.

This works today but doubles the surface area of every schema. Pick canonical names and deprecate aliases on a known timeline.

### D. List filter support is uneven

| Entity     | `state_key` filter | `type_key` filter |
| ---------- | ------------------ | ----------------- |
| projects   | ✅                 | ✅                |
| tasks      | ✅                 | ❌                |
| documents  | ✅                 | ✅                |
| goals      | ❌                 | ❌                |
| plans      | ❌                 | ❌                |
| milestones | ✅                 | ❌                |
| risks      | ✅ (+ impact)      | ❌                |

Either every entity should support both, or there should be a documented rationale why goals/plans don't.

### E. State enums vary by entity

- task valid states: `todo, in_progress, blocked, done`
- doc valid states include: `archived` (cleanup test confirmed this works for docs but not tasks)

If `archived` is meant to be a soft-delete pattern, tasks should support it too — otherwise audit/test artifacts have to stay marked `done`, polluting completed-task metrics.

### F. Schema asymmetry between create and update

- `create_onto_milestone` / `create_onto_risk` accept `parent`, `parents`, `connections` for graph attachment at create time
- `create_onto_task` doesn't, even though tasks are linkable
- `update_onto_risk` accepts `owner`, but `create_onto_risk` doesn't
- `update_onto_milestone` doesn't accept the `parent`/`parents` that create does

### G. Duplicated fields in entity payloads

Single goal payload contains:

```json
"description": null,
"target_date": null,
"props": {
  "priority": null,
  "description": null,
  "target_date": null,
  "measurement_criteria": null
}
```

Same data, two locations, risk of drift. Same pattern shows up in:

- Project: `props.facets.scale/stage/context` AND top-level `facet_scale/facet_stage/facet_context`
- Document: `content` (top-level) AND `props.body_markdown` (after a `body_markdown` create)

Pick the canonical location, mirror or computed-property the other if needed for backwards compat.

### H. Undocumented response fields

- `list_task_documents` returns `scratch_pad: null` — not in the documented schema
- `get_document_tree` returns `documents: {}`, `unlinked: []`, `archived: []` even when `include_documents` defaults false

---

## 🟢 What's genuinely good

These are worth flagging because they're patterns the rest of the API should adopt.

1. **Calendar list pagination is exemplary.** This is the reference shape every list endpoint should match:

    ```json
    "pagination": {
      "offset": 0, "limit": 2, "returned": 0,
      "total_available": 0, "has_more": false, "next_offset": null
    }
    ```

    It tells the client everything they need with zero ambiguity.

2. **Calendar list returns `warnings` and `queried_range`.** Surfacing applied defaults ("Applied default event window (7d past, 90d future)") and echoing back what was actually queried is a great debugging affordance. Steal this pattern for ontology reads with implicit defaults.

3. **Idempotency works correctly.** Same `idempotency_key` returned the identical task ID on retry, plus `meta.replayed: true` so the client knows it was a replay. Clean.

4. **`dry_run: true` is implemented uniformly across writes.** Returns the validated payload without persisting. Useful for agent self-checks.

5. **Scope enforcement is clean.** Out-of-scope project IDs return `FORBIDDEN: Project is outside the allowed call scope`. Malformed UUIDs return `VALIDATION_ERROR: project_id must be a valid UUID`. Different codes for different failure modes — exactly right.

6. **Tool discovery is well-thought-out.** `tool_search`, `tool_schema`, and `skill_load` give an agent room to figure things out without bloating the always-loaded tool list.

7. **State transitions auto-populate timestamps.** Setting `state_key: "done"` set `completed_at` to the update time automatically. No manual field juggling.

8. **AI-generated `next_step_short` / `next_step_long` on the project graph** with `[[task:uuid|title]]` link syntax is a really nice context surface.

9. **Edge link/unlink with dry_run** works cleanly and returns the full edge object on creation.

---

## 📋 Recommendations (prioritized)

### P0 — fix this week

1. **Fix `list_onto_projects.total`** to return real count, and bump the cap (or add offset/cursor pagination) so 30+ project users can enumerate.
2. **Validate `state_key` in `list_onto_tasks` (and all list/search endpoints)** before passing to SQL — reuse the create-side validator.
3. **Strip `search_vector`** from all serialized responses.
4. **Fix the `cal.project.get` and document `children` double-nesting bugs.** Both are response-shape errors.

### P1 — fix this month

5. **Adopt the calendar `pagination` block on every list and search endpoint.** Single source of truth, deprecate `total` in favor of `total_available` + `has_more` + `next_offset`.
6. **Pick canonical parameter names** for the calendar aliases (`timeMin` vs `time_min`, etc.) and the document aliases (`content` vs `body_markdown`, `parent_document_id` vs `parent_id`). Document deprecation timeline.
7. **Validate `direction` on `get_entity_relationships`** — reject unknown values.
8. **Make filter support uniform** across list endpoints (at minimum `state_key` and `type_key` everywhere it makes sense).
9. **Clean up duplicated fields** — pick canonical home for `description`, `target_date`, `priority`, `body`, `facets` etc.

### P2 — design polish

10. **Standardize search response shape:** `{ query, results, total, pagination }` for every search.
11. **Add `archived` state to tasks** (or document why tasks can't be soft-deleted while docs can).
12. **Improve validation error messages** to include valid ranges/enums (e.g., `priority must be a number from 1 to 5`).
13. **Bring create/update parity** for `parent`/`parents`/`connections`/`owner` across all entity types where it makes sense.
14. **Document the response shape of every read** — there are silent fields (`scratch_pad`, `unlinked`, `archived`, `warnings`) that aren't in the schema and a client-side type checker would flag.

---

## Test artifacts left in The Last Ember

- 1 task `1b112795-32de-4c7f-a61a-7c713f29f3dc` ("AUDIT idempotent test") — marked `done`
- 1 document `a2c9c3e7-4422-4b45-b038-0b5a242529dc` ("AUDIT DOC: real create") — marked `archived`
- 0 edges (unlinked during cleanup)
- 0 calendar events (only used dry_run)

You may want to delete these from the database directly if you don't want audit clutter in the test project's history.

---

## Process notes

- Total tool calls: ~40, all read or scoped writes against the test project
- One call session, hung up cleanly via `call.hangup`
- No production project data was modified
