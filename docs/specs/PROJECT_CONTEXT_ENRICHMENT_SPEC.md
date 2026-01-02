<!-- docs/specs/PROJECT_CONTEXT_ENRICHMENT_SPEC.md -->

# Project Context Enrichment for Agentic Chat

## Status

| Attribute | Value                        |
| --------- | ---------------------------- |
| Status    | Draft                        |
| Created   | 2025-12-31                   |
| Author    | AI-assisted                  |
| Scope     | Agentic chat project context |

---

## Overview

Enrich the agentic chat project context with compact, high-signal summaries from the project ontology (goals, risks, decisions, requirements, documents, milestones, plans, outputs, signals, insights, tasks). The output must stay token-efficient, include entity IDs for drill-down, and avoid noisy or redundant data.

---

## Goals

- Surface the most relevant ontology entities for a project without overwhelming context.
- Include IDs so the agent can fetch full details via tools.
- Respect token budgets with caps, truncation, and omission of empty sections.

---

## Scope: Entity Coverage

Include summaries for entities directly connected to the project via `onto_edges`:

- Goals
- Risks
- Decisions
- Requirements
- Documents
- Milestones
- Plans
- Outputs
- Signals
- Insights
- Tasks (recent + upcoming)

---

## Linkage Rules

An entity is included if it is **directly connected** to the project by an `onto_edges` row:

- Match edges where `src_id = projectId` OR `dst_id = projectId`.
- The entity is the **non-project** side of the edge.
- Only include target kinds from the list above.

---

## Formatting Rules

- Every line includes the entity `id`.
- Include `created_at` for all entities that have it (tasks may omit `created_at` in favor of `updated_at`/`start_at`/`due_at`).
- Include `updated_at` only if it exists **and** differs from `created_at`.
- Use a consistent short date format (e.g., `YYYY-MM-DD`).
- Only render a section if it contains at least one entry.
- When a section is capped, add an overflow indicator (`... and N more`).
- Truncate long text fields using the limits below.

### Truncation Lengths (Defaults)

- Decision rationale: 180 chars
- Document description: 180 chars
- Requirement text: 160 chars
- Signal payload (stringified): 160 chars

---

## Caps (Defaults)

- Goals: 5
- Risks: 5
- Decisions: 5
- Requirements: 5
- Documents: 5
- Milestones: 5
- Plans: 5
- Outputs: 5
- Signals: 5
- Insights: 5
- Tasks (Recent Updates): 10
- Tasks (Upcoming): 5

---

## Entity Selection & Ordering

### Goals

- Include name + id + created/updated + target_date (if present).
- Exclude soft-deleted (`deleted_at` not null).
- Order by `updated_at` desc, fallback `created_at` desc.

### Risks

- Include title + id + created/updated.
- Exclude `state_key` in `mitigated`, `closed`.
- Exclude soft-deleted (`deleted_at` not null).
- Order by `created_at` desc.

### Decisions

- Include title + id + decision_at (if present) + created/updated.
- Include truncated `rationale`.
- Exclude soft-deleted (`deleted_at` not null).
- Order by `decision_at` desc, fallback `created_at` desc.

### Requirements

- Include text + id + created/updated.
- Truncate text if long.
- Exclude soft-deleted (`deleted_at` not null).
- Order by `created_at` desc.

### Documents

- Include title + id + description (truncated) + created/updated.
- Exclude soft-deleted (`deleted_at` not null).
- Order by `updated_at` desc, fallback `created_at` desc.

### Milestones

- Include title + id + due_at + created/updated.
- Exclude soft-deleted (`deleted_at` not null).
- Order by `due_at` asc, fallback `created_at` desc.

### Plans

- Include name + id + state_key (if present) + created/updated.
- Exclude soft-deleted if applicable.
- Order by `updated_at` desc, fallback `created_at` desc.

### Outputs

- Include name + id + state_key (if present) + created/updated.
- Exclude soft-deleted if applicable.
- Order by `updated_at` desc, fallback `created_at` desc.

### Signals

- Include channel + id + ts (event time) + created_at.
- Include truncated payload summary if non-empty.
- Order by `ts` desc, fallback `created_at` desc.

### Insights

- Include title + id + created_at.
- Include derived_from_signal_id if present.
- Order by `created_at` desc.

---

## Tasks (Strategic Inclusion)

Two non-overlapping task lists:

### 1) Recent Updates

- `updated_at` within last 7 days.
- Exclude state_key in `done`, `blocked`.
- Exclude soft-deleted (`deleted_at` not null).
- Order by `updated_at` desc.
- Limit: 10.

### 2) Upcoming (Due/Start Soon)

- `due_at` within next 7 days OR `start_at` within next 7 days.
- Exclude state_key in `done`, `blocked`.
- Exclude soft-deleted (`deleted_at` not null).
- Order by earliest `due_at` / `start_at`, then `updated_at` desc.
- Limit: 5.
- Deduplicate against Recent Updates list (by task id).

---

## Output Format (Example)

```
## Project Context Highlights

### Goals
- Goal name [goal-id] (created: 2025-01-10, target: 2025-02-01)

### Risks
- Risk title [risk-id]

### Decisions
- Decision title [decision-id] (decision: 2025-01-08, created: 2025-01-07)
  - Rationale: Truncated rationale text...

### Requirements
- Requirement text... [requirement-id] (created: 2025-01-09)

### Documents
- Document title [document-id] (created: 2025-01-03)
  - Description: Truncated description...

### Milestones
- Milestone title [milestone-id] (due: 2025-02-01)

### Plans
- Plan name [plan-id] (state: active, created: 2025-01-02)

### Outputs
- Output name [output-id] (state: draft, created: 2025-01-04)

### Signals
- activity_feed [signal-id] (ts: 2025-01-12)
  - Payload: Truncated payload...

### Insights
- Insight title [insight-id] (created: 2025-01-11)

### Tasks (Recent Updates)
- Task title [task-id] (updated: 2025-01-12, due: 2025-01-15)

### Tasks (Upcoming)
- Task title [task-id] (start: 2025-01-14, due: 2025-01-16)
```

---

## Data Sources

Tables:

- `onto_goals`
- `onto_risks`
- `onto_decisions`
- `onto_requirements`
- `onto_documents`
- `onto_milestones`
- `onto_plans`
- `onto_outputs`
- `onto_signals`
- `onto_insights`
- `onto_tasks`

Relationships:

- `onto_edges` (project ↔ entity)

---

## Implementation Plan

1. Extend `OntologyContext.metadata` with a `project_highlights` payload.
2. Update `OntologyContextLoader.loadProjectContext`:
    - Fetch `onto_edges` connected to the project.
    - Group entity IDs by kind.
    - Query each table using the IDs; apply filters, caps, and ordering.
3. Add helpers for:
    - Date formatting with omit-duplicate-updated rule.
    - Text truncation.
    - Task list deduplication.
4. Update `formatProjectContext` to render `project_highlights` sections.
5. Ensure empty sections are omitted and overflow indicators appear when capped.

---

## Token Budget Strategy

- Strict caps per section (see Caps).
- Truncate large text fields.
- Skip empty sections.
- Favor short date formats.

---

## Open Questions

- Should other ontology entities be included as highlights (e.g., sources, metrics)?
- Do you want caps or truncation lengths adjusted from the defaults above?
