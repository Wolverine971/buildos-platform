---
date: 2025-11-07T00:00:00Z
researcher: Claude
repository: buildos-platform
topic: 'Audit of Unexecuted onto_tasks Table Extension Plans (Recurring Tasks & Additional Fields)'
tags: [research, buildos, onto_tasks, recurring-tasks, migrations, schema-extension]
status: complete
path: thoughts/shared/research/2025-11-07_onto_tasks_extension_plans_audit.md
---

# Research: Unexecuted onto_tasks Extension Plans

## Executive Summary

**No pending or draft migrations for onto_tasks schema extensions were found.** However, the codebase reveals a deliberate architectural decision: recurring tasks are handled via the FSM `schedule_rrule` action, which creates individual task rows in `onto_tasks` with recurrence metadata stored in the `props` jsonb column. The current implementation does NOT require schema migrations and is production-ready. Any previously planned onto_tasks extensions would need to be reconstructed from memory or historical notes.

## Research Question

What plans existed to extend the `onto_tasks` table (recurring tasks, additional fields, etc.) and what unexecuted migration code is present?

## Critical Finding: Current Architecture

### onto_tasks Current Schema
**Location**: `supabase/migrations/20250601000001_ontology_system.sql` (Lines 256-272)

```sql
CREATE TABLE if not exists onto_tasks (
  id uuid PRIMARY KEY default gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES onto_projects(id) ON delete cascade,
  plan_id uuid REFERENCES onto_plans(id) ON delete set null,
  title text NOT NULL,
  state_key text NOT NULL default 'todo',
  priority int,
  due_at timestamptz,
  props jsonb NOT NULL default '{}'::jsonb,

  facet_scale text generated always as (props->'facets'->>'scale') stored,

  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL default now(),
  updated_at timestamptz NOT NULL default now()
);
```

**Indexes** (8 total):
- project_id
- plan_id
- state_key
- due_at
- priority
- props (GIN)
- title (full-text)
- created_at

### Why No Schema Extensions Were Made

**Deliberate Architectural Choice** (from `2025-11-04_ontology-architecture-clarification.md`):

1. **Foreign Keys for Direct Ownership**:
   - `project_id` - Task MUST belong to exactly one project
   - `plan_id` (nullable) - Task MAY belong to one plan

2. **Graph Edges for Semantic Relationships** (NOT columns):
   - Task dependencies: `task-A -[depends_on]-> task-B`
   - Subtasks: `task-A -[has_subtask]-> task-B`
   - Blocking: `task-A -[blocks]-> task-B`

3. **Props Column for Metadata** (NOT schema columns):
   - Flexible storage for dynamic attributes
   - No migrations needed for new metadata types
   - Fully backward compatible

---

## Existing Recurring Task Implementation

### Current System: FSM schedule_rrule Action

**Location**: `apps/web/src/lib/server/fsm/actions/schedule-rrule.ts` (163 lines)

**How It Works**:

1. **Trigger**: FSM state transition with `schedule_rrule` action
2. **Input**: RRULE string (RFC 5545 format)
   ```
   RRULE:FREQ=WEEKLY;COUNT=10
   RRULE:FREQ=DAILY;UNTIL=2025-12-31
   ```
3. **Processing**:
   - Parses RRULE using `rrule` library
   - Generates up to 365 occurrences
   - Creates individual `onto_tasks` rows for each occurrence

4. **Metadata Storage** (in `props`):
   ```json
   {
     "recurrence": {
       "rrule": "RRULE:FREQ=WEEKLY;COUNT=10",
       "index": 0,
       "date": "2025-11-10T09:00:00Z",
       "source_entity_id": "project-uuid",
       "source_type_key": "writer.book"
     }
   }
   ```

5. **Result**:
   - Each occurrence has its own `due_at` timestamp
   - Tasks can be assigned to a specific plan
   - No schema modification needed
   - Fully functional and production-ready

**Code Example**:
```typescript
async function executeScheduleRruleAction(
  action: FSMAction,
  entity: EntityContext,
  ctx: TransitionContext,
  clientParam?: TypedSupabaseClient
): Promise<string>
```

---

## Task Template System

**Location**: `supabase/migrations/20250605000001_add_missing_base_templates.sql`

Eight base templates exist, including:
- `task.base` - Base task template
- `task.quick-action` - Quick task
- `task.deep-work` - Deep work session
- **`task.recurring-task`** - Recurring task template ⭐
- `task.milestone` - Milestone/checkpoint
- `task.coordination` - Team coordination
- `task.research` - Research task
- `task.implementation` - Implementation task

The `task.recurring-task` template exists and can be used to create tasks that follow the recurrence pattern via FSM actions.

---

## Legacy Recurring Task System (Pre-Ontology)

### Historical References Found

1. **Migration Script** (LEGACY):
   - Location: `apps/web/scripts/migrate-recurring-tasks-calendar-standalone.ts`
   - References old schema:
     - `tasks.recurrence_pattern`
     - `tasks.recurrence_ends`
     - `recurring_task_migration_log` table
     - `task_calendar_events` table
   - **Status**: Pre-ontology system, NOT used for `onto_tasks`

2. **Enum Audit Script** (LEGACY):
   - Location: `apps/web/scripts/audit-enum-values.ts`
   - Audits old `tasks` table enum fields
   - References: `recurrence_pattern` in old tasks

3. **Index Check Script** (LEGACY):
   - Location: `apps/web/scripts/check-indexes.sql`
   - References legacy tables: `recurring_task_instances`, `task_calendar_events`

**⚠️ Important**: None of these legacy systems apply to the new `onto_tasks` table.

---

## Planning Documents Analysis

### 1. Latest: Project Template Scaffolding System (Nov 6, 2025)
**File**: `thoughts/shared/research/2025-11-06_project-template-scaffolding-system-analysis.md` (614 lines)

**Key Assessment**:
- Template system is ~85% complete
- **No mention of onto_tasks schema extensions needed**
- Recommends:
  - Add more templates (NOT alter onto_tasks)
  - Improve discovery UX
  - Implement advanced scaffolding (optional)

**Relevant Section**: Discusses how `schedule_rrule` FSM action is the vehicle for recurring task implementation—no schema changes required.

### 2. Ontology Architecture Clarification (Nov 4, 2025)
**File**: `thoughts/shared/research/2025-11-04_ontology-architecture-clarification.md`

**Critical Decision Documented**:
```
❌ WRONG: Add parent_task_id, recurrence_pattern, etc. columns to tasks table
✅ CORRECT: Use graph edges for relationships, props for metadata
```

This explicitly rules out schema extensions for onto_tasks. Instead:
- **Relationships** → Graph edges table (`onto_edges`)
- **Metadata** → Props jsonb column

No plans mentioned for onto_tasks schema extensions.

### 3. Task Data Model Research (Oct 11, 2025)
**File**: `thoughts/shared/research/2025-10-11_17-20-49_task-data-model-and-status-field-research.md`

**Scope**: Old task system, not onto_tasks. Provides context for why the new system uses a different approach.

---

## What Was Likely Planned (Reconstructed)

Based on the codebase state and patterns, if you had planned onto_tasks extensions, they likely involved:

### Potential Extension 1: Explicit Recurrence Columns
```sql
-- HYPOTHETICAL - NOT IMPLEMENTED
ALTER TABLE onto_tasks ADD COLUMN recurrence_pattern text;
ALTER TABLE onto_tasks ADD COLUMN recurrence_ends timestamptz;
ALTER TABLE onto_tasks ADD COLUMN recurrence_index integer;
```

**Why Not Done**: `props` column handles this with full flexibility. No migration needed.

### Potential Extension 2: Task Template FK
```sql
-- HYPOTHETICAL - NOT IMPLEMENTED
ALTER TABLE onto_tasks ADD COLUMN task_template_id uuid REFERENCES task_templates(id);
```

**Why Not Done**: Task template would be referenced via FSM metadata, not foreign key.

### Potential Extension 3: Subtask FK (for quick parent-child)
```sql
-- HYPOTHETICAL - NOT IMPLEMENTED
ALTER TABLE onto_tasks ADD COLUMN parent_task_id uuid REFERENCES onto_tasks(id);
```

**Why Not Done**: Architecture explicitly uses `onto_edges` for relationships (documented in Nov 4 research).

---

## Search Results Summary

### No Unexecuted Migrations Found

**Search Scope**:
- ✅ Migration files in `supabase/migrations/` - All executed
- ✅ Draft/commented SQL - None found
- ✅ TypeScript migration scripts - Only legacy pre-ontology scripts found
- ✅ Thoughts/research documents - No draft extension plans
- ✅ Ideas folder - No proposal documents

### Recurrence References Found

These files reference recurring tasks:

1. **Active** (current system):
   - `apps/web/src/lib/server/fsm/actions/schedule-rrule.ts` - ✅ Implemented & working
   - `apps/web/src/lib/server/fsm/engine.ts` - FSM engine that executes actions

2. **Templates** (available):
   - `task.recurring-task` template in migrations - ✅ Available

3. **Legacy** (pre-ontology, not used):
   - `apps/web/scripts/migrate-recurring-tasks-calendar-standalone.ts`
   - `apps/web/scripts/audit-enum-values.ts`
   - `apps/web/scripts/check-indexes.sql`

---

## Recommendations

### For Extending onto_tasks Functionality

If you want to extend onto_tasks capabilities, follow the established architecture:

#### For More Recurrence Control
- **Don't**: Add `recurrence_pattern`, `recurrence_ends` columns
- **Do**: Expand `props.recurrence` structure
  ```json
  {
    "recurrence": {
      "rrule": "...",
      "index": 0,
      "date": "...",
      "source_entity_id": "...",
      "source_type_key": "...",
      "max_occurrences": 365,
      "generated_from_template": "task.recurring-task"
    }
  }
  ```

#### For Task Relationships (subtasks, dependencies, blocking)
- **Don't**: Add parent_task_id, dependency_id columns
- **Do**: Use `onto_edges` table:
  ```sql
  INSERT INTO onto_edges (source_entity_id, source_type_key, target_entity_id, target_type_key, relation_type_key)
  VALUES ('task-uuid', 'tasks.task', 'parent-task-uuid', 'tasks.task', 'has_subtask');
  ```

#### For Task Properties
- **Don't**: Add new columns for every property
- **Do**: Expand props structure
  ```json
  {
    "facets": {"scale": "..."},
    "recurrence": {...},
    "custom_field": "...",
    "metadata": {...}
  }
  ```

#### For Task Classification
- **Use**: Templates via FSM metadata
- **Store**: Template reference in props or create a linking table if FK is essential

---

## Related Files

### Core Schema
- `supabase/migrations/20250601000001_ontology_system.sql` - onto_tasks creation (line 256)
- `supabase/migrations/20250605000001_add_missing_base_templates.sql` - task templates

### Implementation
- `apps/web/src/lib/server/fsm/actions/schedule-rrule.ts` - Recurring task handler
- `apps/web/src/lib/server/fsm/engine.ts` - FSM execution engine

### Architecture & Decisions
- `thoughts/shared/research/2025-11-04_ontology-architecture-clarification.md` - Design decisions ⭐
- `thoughts/shared/research/2025-11-06_project-template-scaffolding-system-analysis.md` - Latest assessment

### Documentation
- `apps/web/docs/features/ontology/` - Ontology feature docs
- `docs/architecture/diagrams/` - Architecture diagrams

---

## Conclusion

**No draft migrations or unexecuted plans were found in the codebase.** The system has evolved to use a props-based approach with FSM actions rather than schema-level extensions. This provides:

- ✅ Full flexibility for recurring tasks
- ✅ No migration bottlenecks
- ✅ Backward compatibility
- ✅ Supports all standard recurrence patterns (RFC 5545 RRULE)

If you remember specific extension ideas (e.g., new fields, relationships, properties), they can be implemented either through:
1. **Props expansion** (no migration)
2. **New migration** (if schema change is truly needed)
3. **Related tables** (for specific purposes like templates, relationships)

The architecture is documented and intentional—any extensions should follow the existing patterns.
