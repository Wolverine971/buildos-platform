---
date: 2025-11-20T10:00:00-08:00
researcher: Claude
repository: buildos-platform
topic: 'onto_tasks Date and Scheduling Strategy'
tags: [research, ontology, tasks, scheduling, dates, fsm]
status: complete
---

# Research: onto_tasks Date and Scheduling Strategy

## Executive Summary

Based on comprehensive analysis of the BuildOS ontology system, **onto_tasks only has a `due_at` field** in its database schema - there is **NO `start_at` or `scheduled_at` field**. Task scheduling happens through different mechanisms depending on the context:

1. **Direct task creation**: Pass `due_at` directly when creating tasks
2. **FSM actions**: Use `schedule_rrule` action to create recurring tasks with `due_at` set from RRULE occurrences
3. **Template properties**: Tasks can inherit default properties from templates, but dates are typically instance-specific
4. **Props flexibility**: Start dates or other scheduling metadata can be stored in the `props` JSONB field

## Research Question

How are dates (particularly start dates and scheduled dates) supposed to be handled for onto_tasks? Should they inherit from task templates, be part of FSM strategies, or be set directly?

## Key Findings

### Finding 1: Database Schema - Only `due_at` Exists

**Location**: `supabase/migrations/20250601000001_ontology_system.sql:257-272`

**Implementation Details**:

The onto_tasks table has a minimal date structure:

```sql
create table if not exists onto_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto_projects(id) on delete cascade,
  plan_id uuid references onto_plans(id) on delete set null,
  title text not null,
  state_key text not null default 'todo',
  priority int,
  due_at timestamptz,  -- ONLY date field!
  props jsonb not null default '{}'::jsonb,
  -- ... other fields
);
```

**Key Insights**:
- Only `due_at` exists as a proper column
- No `start_at`, `scheduled_at`, or `start_date` columns
- Any additional date information must go in `props`

### Finding 2: FSM Action - schedule_rrule

**Location**: `apps/web/src/lib/server/fsm/actions/schedule-rrule.ts`

**Implementation Details**:

The `schedule_rrule` FSM action creates recurring tasks with dates:

```typescript
// Building task rows from RRULE occurrences
return occurrences.map((date, index) => {
  const occurrenceISO = date.toISOString();

  return {
    project_id: entity.project_id,
    plan_id: action.plan_id ?? null,
    title: occurrences.length > 1 ? `${baseTitle} (${index + 1})` : baseTitle,
    state_key: stateKey,
    due_at: occurrenceISO,  // Sets due_at from RRULE occurrence
    priority: taskTemplate.priority ?? null,
    props: buildTaskProps(taskTemplate.props, {
      rrule,
      index,
      date: occurrenceISO,
      source_entity_id: entity.id,
      source_type_key: entity.type_key
    }) as Json,
    created_by: actorId
  };
});
```

**Pattern**: FSM actions can schedule tasks by:
1. Setting `due_at` directly from calculated dates
2. Storing recurrence metadata in `props`
3. Creating multiple task instances at once

### Finding 3: spawn_tasks FSM Action

**Location**: `apps/web/src/lib/server/fsm/engine.ts:305-486`

**Implementation Details**:

The `spawn_tasks` action creates tasks but **does NOT set dates**:

```typescript
taskInserts.push({
  project_id: projectId,
  plan_id: validatedPlanId,
  title,
  state_key: 'todo',
  props: propsTemplate,  // Can include date info
  created_by: createdBy
  // Note: NO due_at field!
});
```

**Pattern**: Regular spawn_tasks doesn't handle dates - they would need to be in `props`

### Finding 4: Task Creation Tool

**Location**: `apps/web/src/lib/services/agentic-chat/tools/core/tool-definitions.ts:655-707`

**Implementation Details**:

The `create_onto_task` tool accepts `due_at` directly:

```typescript
parameters: {
  type: 'object',
  properties: {
    // ... other properties
    due_at: {
      type: 'string',
      description: 'Optional due date in ISO format (YYYY-MM-DDTHH:mm:ssZ)'
    },
    props: {
      type: 'object',
      description: 'Additional properties as JSON object'
    }
  }
}
```

### Finding 5: Recurring Task Series

**Location**: `apps/web/docs/features/ontology/RECURRING_SERIES.md`

**Implementation Details**:

The recurring task series feature uses `props` for all scheduling metadata:

```json
{
  "series_id": "6671bfe9-0a45-4bb2-aa7a-2e62ac4db4ad",
  "series": {
    "id": "6671bfe9-0a45-4bb2-aa7a-2e62ac4db4ad",
    "role": "master",
    "timezone": "America/Los_Angeles",
    "rrule": "RRULE:FREQ=WEEKLY;COUNT=8",
    "dtstart": "2025-11-12T09:00:00-08:00",  // Start stored in props!
    "instance_count": 8
  },
  "recurrence": {
    "occurrence_at": "2025-11-26T17:00:00Z",
    "local_occurrence_at": "2025-11-26T09:00:00-08:00"
  }
}
```

## Architectural Patterns Found

### Pattern 1: Minimal Core Schema

- **Where Used**: All onto_tasks operations
- **Purpose**: Keep the core schema simple and flexible
- **Design**: Only `due_at` as a proper column, everything else in `props`

### Pattern 2: Props-Based Extension

- **Where Used**: Recurring tasks, calendar integration, scheduling metadata
- **Purpose**: Allow unlimited flexibility without schema migrations
- **Example**: Start dates, timezones, RRULEs all stored in props

### Pattern 3: FSM-Driven Scheduling

- **Where Used**: Template FSM transitions
- **Purpose**: Automate task creation with scheduling logic
- **Example**: `schedule_rrule` action creates tasks with calculated `due_at` dates

## Recommendations for Task Scheduling

Based on this research, here's the intended approach for handling task dates:

### 1. For Simple Tasks
```typescript
// Direct creation with due_at
{
  title: "Review document",
  due_at: "2025-11-25T17:00:00Z",
  props: {}
}
```

### 2. For Tasks with Start and Due Dates
```typescript
// Use props for additional dates
{
  title: "Sprint planning",
  due_at: "2025-11-30T17:00:00Z",  // Deadline
  props: {
    start_at: "2025-11-25T09:00:00Z",  // When to start
    estimated_hours: 4
  }
}
```

### 3. For Recurring Tasks
```typescript
// Use FSM action or series API
{
  action: "schedule_rrule",
  rrule: "FREQ=WEEKLY;COUNT=8",
  task_template: {
    title: "Weekly review",
    props: {
      facets: { scale: "micro" }
    }
  }
}
```

### 4. For Calendar-Integrated Tasks
```typescript
// Store calendar metadata in props
{
  title: "Client meeting",
  due_at: "2025-11-25T15:00:00Z",
  props: {
    calendar_event_id: "gcal_123",
    start_at: "2025-11-25T14:00:00Z",
    duration_minutes: 60,
    location: "Zoom"
  }
}
```

## Historical Context

From the codebase analysis:

1. **Design Decision**: The ontology system was designed with minimal core fields and maximum flexibility through `props`
2. **No start_at Column**: This appears intentional - tasks track deadlines (`due_at`), not start times
3. **Calendar Integration**: When tasks need time blocks, this is handled through `props` and external calendar systems
4. **Template Inheritance**: Templates provide default `props` but not dates (dates are instance-specific)

## Answer to Original Question

**Q: How should task scheduling work? Template props or FSM strategy?**

**A: Neither and both!**

1. **Not from Templates**: Dates are instance-specific, not template defaults
2. **Sometimes from FSM**: Use `schedule_rrule` action for recurring patterns
3. **Usually Direct**: Pass `due_at` when creating the task
4. **Props for Complexity**: Store `start_at`, `scheduled_at`, or other dates in `props` when needed

The system is intentionally flexible:
- Core schema tracks only deadlines (`due_at`)
- FSM actions can automate scheduling patterns
- Props allow unlimited scheduling metadata
- Templates provide structure but not dates

## File References

Critical files for task scheduling:

- `supabase/migrations/20250601000001_ontology_system.sql` - Core schema definition
- `apps/web/src/lib/server/fsm/actions/schedule-rrule.ts` - Recurring task scheduling
- `apps/web/src/routes/api/onto/tasks/create/+server.ts` - Task creation endpoint
- `apps/web/docs/features/ontology/RECURRING_SERIES.md` - Series documentation
- `apps/web/src/lib/services/agentic-chat/tools/core/tool-definitions.ts` - Agent tools

## Related Research

- `/apps/web/docs/features/ontology/DATA_MODELS.md` - Complete ontology schema
- `/apps/web/docs/features/ontology/README.md` - System overview
- `/thoughts/shared/research/2025-11-07_recurrence-framework-design.md` - Recurring task design