---
date: 2025-11-07T00:00:00Z
researcher: Claude
repository: buildos-platform
topic: 'Flexible Recurrence Framework - Making ANY Task Type Recurring'
tags: [research, buildos, recurring-tasks, architecture, framework-design, fsm]
status: complete
---

# Research: Flexible Recurrence Framework Design

## Executive Summary

**Current Problem**: Recurrence is a task template type (`task.recurring-task`), which limits flexibility. Users should be able to make ANY task type recurring (quick-action, deep-work, milestone, custom types, etc.).

**Proposed Solution**: Implement a **Series Master Pattern** with props-based configuration:
1. Any task created with ANY template can be converted to recurring
2. "Make recurring" is an action available on all task types, not a template
3. Recurrence configuration is stored in `props`, with no schema migration needed
4. Tasks can reference their series parent for bulk operations (update, delete series)
5. Individual instances remain independent (can be completed, moved, deleted separately)

**Benefits**:
- ✅ Flexible: works with any task template
- ✅ No schema migrations needed
- ✅ Backward compatible
- ✅ Series can be edited/updated after creation
- ✅ Individual instances can be managed independently
- ✅ Follows BuildOS props-driven architecture pattern

---

## The Core Problem

### Current Limitations

**Status Quo**:
```
task.quick-action      (fast capture, low overhead)
task.deep-work         (focused work sessions)
task.milestone         (checkpoint tasks)
task.recurring-task    (ONLY for recurring tasks - limited!)
```

**Issues**:
1. Recurrence is a "task type" rather than a "task behavior"
2. Can't make a deep-work task recurring
3. Can't make a quick-action task recurring
4. Requires pre-declaring at task creation whether it will recur
5. Different task types can't share recurrence capability

**User Experience Gap**:
```
User creates task → Uses quick-action template (fast)
User later realizes → "Wait, I need this weekly!"
User has to... → Create new recurring-task? Lose the original?
```

This breaks the paradigm of flexible task management.

---

## Architectural Framework: Series Master Pattern

### Core Concept

```
Task Creation Flow:
  1. User creates task with ANY template (quick-action, deep-work, etc.)
  2. Task lives as a normal, independent task
  3. User clicks "Make Recurring" (available on ANY task)
  4. System transforms it:
     - Marks task as "series master"
     - Adds recurrence config to props
     - Generates instances (child tasks)
     - Instances reference series master via series_id
  5. Result:
     - 1 master task (configurable)
     - N instance tasks (independent once created)
```

### Data Model

**Series Master Task**:
```json
{
  "id": "master-uuid",
  "project_id": "project-uuid",
  "plan_id": "plan-uuid",
  "title": "Weekly Team Sync",
  "type_key": "task.quick-action",  // ANY type, not task.recurring-task
  "state_key": "todo",
  "props": {
    "is_series_master": true,
    "series_id": "series-uuid",     // Self-reference for searching
    "recurrence_config": {
      "rrule": "RRULE:FREQ=WEEKLY;UNTIL=2025-12-31",
      "enabled": true,
      "max_occurrences": 52,
      "timezone": "America/New_York",
      "regenerate_on_update": false  // Update config without changing instances?
    }
  }
}
```

**Instance Task** (child):
```json
{
  "id": "instance-uuid-1",
  "project_id": "project-uuid",
  "plan_id": "plan-uuid",
  "title": "Weekly Team Sync (1)",  // Or just same title
  "type_key": "task.quick-action",  // SAME TYPE as master
  "state_key": "todo",
  "due_at": "2025-11-17T14:00:00Z",
  "props": {
    "is_series_instance": true,
    "series_id": "series-uuid",     // Reference to master
    "series_index": 0,              // Position in series
    "recurrence": {
      "rrule": "RRULE:FREQ=WEEKLY;UNTIL=2025-12-31",
      "index": 0,
      "date": "2025-11-17T14:00:00Z",
      "source_entity_id": "master-uuid",
      "source_type_key": "task.quick-action"
    }
  }
}
```

### Three Modes of Operation

#### Mode 1: Stateless Expansion (Current `schedule_rrule`)
✅ **When**: One-time bulk task creation
✅ **How**: FSM action generates N tasks from RRULE
❌ **Problem**: No master to reference, can't update series

```typescript
// Current: triggered during FSM transition
FSM Action: schedule_rrule
  → Generates N tasks from RRULE
  → Each task has recurrence metadata in props
  → No parent task to reference
```

#### Mode 2: Series Master (Recommended for flexible recurrence)
✅ **When**: User wants to make existing task recurring
✅ **How**: Create master + instances, establish relationship
✅ **Benefit**: Can update series, delete series, reschedule series

```typescript
// New: enables flexible "make recurring" workflow
Action: enable_series_recurrence
  Input: existing task + rrule configuration
  Steps:
    1. Mark task as series master
    2. Generate instance tasks
    3. All tasks reference series_id
  Result: Master + N instances with bidirectional relationship
```

#### Mode 3: Dynamic Recurrence (Future enhancement)
🔮 **When**: Task automatically generates next occurrences
🔮 **How**: On instance completion, generate next occurrence
🔮 **Benefit**: Infinite series, only relevant tasks created

```typescript
// Future: smart recurring tasks
FSM Action: complete_task_in_series
  → Checks if task.props.series_id exists
  → If yes, generates next occurrence automatically
  → User doesn't need 365 tasks in advance
```

---

## Implementation Approaches

### Approach A: Pure Props-Based (Simplest)

**Pros**:
- No schema changes needed
- Maximum flexibility
- Works immediately with current system

**Cons**:
- No database-level relationship validation
- Harder to query "all instances of series X"
- Cascading deletes require application logic

**Props Structure**:
```json
{
  "recurrence_config": {
    "enabled": true,
    "rrule": "RRULE:FREQ=WEEKLY;COUNT=10",
    "series_id": "uuid",
    "is_series_master": true,
    "created_at": "2025-11-07T12:00:00Z"
  }
}
```

**Query Pattern**:
```sql
-- Find all instances of a series
SELECT * FROM onto_tasks
WHERE props->>'series_id' = 'master-uuid'
ORDER BY props->>'series_index'::int
```

**Limitations**:
- No foreign key constraint
- Could create orphaned instances
- Manual cleanup on series deletion needed

---

### Approach B: Separate Recurrence Table (Most Structured)

**Pros**:
- Explicit schema for recurrence
- Foreign key constraints
- Clear data model

**Cons**:
- Requires migration
- More complex queries
- Extra table lookup for every series operation

**Schema**:
```sql
CREATE TABLE onto_task_series (
  id uuid PRIMARY KEY,
  master_task_id uuid NOT NULL REFERENCES onto_tasks(id) ON DELETE CASCADE,
  rrule text NOT NULL,
  enabled boolean DEFAULT true,
  max_occurrences int DEFAULT 365,
  timezone text DEFAULT 'UTC',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE onto_tasks ADD COLUMN series_id uuid REFERENCES onto_task_series(id) ON DELETE SET NULL;
ALTER TABLE onto_tasks ADD COLUMN series_index int; -- Position in series (null if not instance)
```

**Pros & Cons**:
- ✅ Normalized data model
- ✅ Explicit relationships
- ✅ Easy to query all series
- ❌ Requires migration (breaks current approach)
- ❌ More JOINs needed for common queries

---

### Approach C: Hybrid (Recommended) 🎯

**Pros**:
- No schema changes needed initially
- Clean mental model (master + instances)
- Index on props for performance
- Can migrate to Approach B later if needed

**Cons**:
- Props-based, not normalized
- Need to maintain consistency in application logic

**Implementation**:
1. **No schema migration** - use props entirely
2. **Create index on `props` GIN** (already exists):
   ```sql
   CREATE INDEX idx_onto_tasks_series_id
   ON onto_tasks USING GIN (props)
   WHERE props->>'series_id' IS NOT NULL;
   ```
3. **Props structure** (similar to Approach A but more detailed):
   ```json
   {
     "series_master": {
       "id": "series-uuid",
       "enabled": true,
       "rrule": "RRULE:FREQ=WEEKLY;COUNT=10",
       "timezone": "America/New_York",
       "regenerate_on_update": false,
       "created_at": "2025-11-07T12:00:00Z",
       "instances_count": 10,
       "last_generated_at": "2025-11-07T12:05:00Z"
     },
     "series_instance": {
       "series_id": "series-uuid",
       "index": 0,
       "master_task_id": "master-uuid"
     }
   }
   ```

4. **Usage Pattern**:
   ```typescript
   // Master task props
   task.props.series_master = {
     id: generateUUID(),
     rrule: "RRULE:FREQ=WEEKLY;COUNT=10",
     enabled: true,
     ...
   };

   // Instance task props
   task.props.series_instance = {
     series_id: master.props.series_master.id,
     index: 0,
     master_task_id: master.id
   };
   ```

---

## Integration Points

### 1. FSM Integration

**New FSM Action Type**: `enable_series_recurrence`

```typescript
export const FSMActionSchema = z.object({
  type: z.enum([
    'update_facets',
    'spawn_tasks',
    'schedule_rrule',
    'enable_series_recurrence',  // NEW!
    // ... rest
  ]),
  // ... existing fields

  // For enable_series_recurrence:
  rrule: z.string().optional(),
  timezone: z.string().optional(),
  regenerate_on_update: z.boolean().optional()
});
```

**Usage in Template FSM**:
```json
{
  "from": "todo",
  "to": "active",
  "event": "start",
  "actions": [
    {
      "type": "enable_series_recurrence",
      "rrule": "RRULE:FREQ=DAILY",
      "timezone": "UTC"
    }
  ]
}
```

But this is NOT the typical workflow. Instead, see API section below.

### 2. API Integration

**New Endpoint**: `POST /api/onto/tasks/[id]/make-recurring`

```typescript
// Request
{
  "rrule": "RRULE:FREQ=WEEKLY;COUNT=10",
  "timezone": "America/New_York",
  "regenerate_on_update": false
}

// Response
{
  "ok": true,
  "master_task": { /* task details */ },
  "instances_count": 10,
  "instances": [ /* array of created tasks */ ]
}
```

**Implementation**:
1. Load existing task (any type)
2. Validate RRULE string
3. Generate series ID
4. Update task to mark as series master
5. Generate N instance tasks using existing `schedule-rrule.ts` logic
6. Return master + instances

### 3. UI Integration

**Task Detail View** - Add "Make Recurring" button:
```svelte
<TaskActions>
  {#if !task.props.series_master && !task.props.series_instance}
    <button on:click={openRecurrenceDialog}>
      Make Recurring
    </button>
  {:else if task.props.series_master}
    <button on:click={openEditSeriesDialog}>
      Edit Series
    </button>
    <button on:click={deleteSeriesWithConfirm}>
      Delete Series
    </button>
  {/if}
</TaskActions>
```

**Recurrence Dialog**:
```svelte
<Modal>
  <h3>Make Task Recurring</h3>

  <label>
    Frequency:
    <select bind:frequency>
      <option value="FREQ=DAILY">Daily</option>
      <option value="FREQ=WEEKLY">Weekly</option>
      <option value="FREQ=MONTHLY">Monthly</option>
    </select>
  </label>

  <label>
    Count:
    <input type="number" bind:count min="1" max="365" />
  </label>

  <label>
    End Date:
    <input type="date" bind:endDate />
  </label>

  <label>
    Timezone:
    <select bind:timezone>
      <!-- timezone options -->
    </select>
  </label>

  <button on:click={makeRecurring}>Create Series</button>
</Modal>
```

### 4. Query Patterns

**Find all instances of a series**:
```typescript
const { data: instances } = await supabase
  .from('onto_tasks')
  .select('*')
  .eq('props->series_instance->series_id', seriesId)
  .order('props->series_instance->index', { ascending: true });
```

**Find master task of an instance**:
```typescript
const { data: master } = await supabase
  .from('onto_tasks')
  .select('*')
  .eq('id', task.props.series_instance.master_task_id)
  .single();
```

**Find all series masters in a project**:
```typescript
const { data: seriesMasters } = await supabase
  .from('onto_tasks')
  .select('*')
  .eq('project_id', projectId)
  .not('props->series_master', 'is', null);
```

---

## Feature Set

### MVP (Phase 1)

**Scope**: Core recurring task functionality

- ✅ Create task with any template
- ✅ Convert task to recurring via "Make Recurring" button
- ✅ Generate instances from RRULE
- ✅ Complete individual instances independently
- ✅ Delete series (cascades to instances)
- ✅ No schema migration required

**Timeline**: 2-3 days of implementation

### Phase 2 (Post-MVP)

**Scope**: Advanced series management

- ⏳ Edit series (update RRULE, regenerate instances)
- ⏳ Reschedule instance to different date
- ⏳ Skip individual instance in series
- ⏳ Series status summary (X of Y completed)
- ⏳ Bulk actions on series (mark all complete, snooze, etc.)

### Phase 3 (Future Enhancement)

**Scope**: Smart/dynamic recurrence

- 🔮 Auto-generate next occurrence on completion
- 🔮 Smart rescheduling (move incomplete tasks forward)
- 🔮 Series completion criteria (e.g., "complete 4 of 4 for this week")
- 🔮 Recurring task templates (pre-configured series patterns)

---

## Decision Points

### Question 1: Series Master Stays in Task List?

**Option A**: Master task visible in task list (alongside instances)
```
[ ] Weekly Team Sync (MASTER) - series of 10 tasks
  [ ] Weekly Team Sync (1) - 2025-11-17
  [ ] Weekly Team Sync (2) - 2025-11-24
  ...
```

**Option B**: Master task hidden (only show instances)
```
[ ] Weekly Team Sync (1) - 2025-11-17
[ ] Weekly Team Sync (2) - 2025-11-24
...
(Master hidden, only shown in "Series Management" view)
```

**Recommendation**: **Option A** - Keep master visible because:
- User can see recurrence configuration at a glance
- Can edit/delete entire series from master
- Provides clear mental model

### Question 2: Instance Naming

**Option A**: Numbered instances
```
Weekly Team Sync (1)
Weekly Team Sync (2)
Weekly Team Sync (3)
```

**Option B**: Date-based naming
```
Weekly Team Sync - Nov 17
Weekly Team Sync - Nov 24
Weekly Team Sync - Dec 1
```

**Option C**: Same as master (no suffix)
```
Weekly Team Sync
Weekly Team Sync
Weekly Team Sync
```

**Recommendation**: **Option A** - Numbered instances because:
- Clear reference when talking about specific occurrences
- Doesn't break if date changes
- Shows progression visually

### Question 3: Update Behavior

**Option A**: Editing series master updates config only (instances unchanged)
```
Edit master RRULE from Weekly to Bi-weekly
→ Only future instances generated with new frequency
→ Existing instances untouched
```

**Option B**: Editing series master regenerates all instances
```
Edit master RRULE
→ Delete existing instances
→ Generate new instances from new RRULE
→ Re-complete any that were already done
```

**Recommendation**: **Option A** - Config-only updates because:
- Non-destructive (users keep their completed tasks)
- More predictable behavior
- Can add explicit "Regenerate Series" button for power users

### Question 4: Soft Recurrence (Props vs Schema)

**Option A**: Pure props, no schema changes
**Option B**: Add columns to onto_tasks table

**Recommendation**: **Option A - Pure Props** because:
- No migration needed
- Backward compatible with existing tasks
- Props column already supports complex structures
- Can be indexed for performance
- Matches BuildOS architecture pattern (flexible, metadata-driven)

---

## Pseudo-Code Implementation

### Service: Task Recurrence

```typescript
// apps/web/src/lib/services/task-recurrence.service.ts

import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { RRule } from 'rrule';
import type { Database } from '@buildos/shared-types';

type OntoTaskInsert = Database['public']['Tables']['onto_tasks']['Insert'];

interface SeriesConfig {
  rrule: string;
  timezone?: string;
  regenerate_on_update?: boolean;
}

/**
 * Convert existing task to recurring series master
 */
export async function enableTaskRecurrence(
  taskId: string,
  config: SeriesConfig
): Promise<{
  master: any;
  instances: any[];
  seriesId: string;
}> {
  const client = createAdminSupabaseClient();
  const seriesId = crypto.randomUUID();

  // 1. Load task
  const { data: task, error } = await client
    .from('onto_tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (error || !task) throw new Error('Task not found');

  // 2. Update task to mark as series master
  const masterProps = {
    ...(task.props ?? {}),
    series_master: {
      id: seriesId,
      enabled: true,
      rrule: config.rrule,
      timezone: config.timezone ?? 'UTC',
      regenerate_on_update: config.regenerate_on_update ?? false,
      created_at: new Date().toISOString(),
      instances_count: 0
    }
  };

  await client
    .from('onto_tasks')
    .update({ props: masterProps })
    .eq('id', taskId);

  // 3. Generate instances
  const rule = RRule.fromString(config.rrule);
  const occurrences = rule.all((_: Date, index: number) => index < 365);

  const instances = occurrences.map((date, index) => ({
    project_id: task.project_id,
    plan_id: task.plan_id,
    title: `${task.title} (${index + 1})`,
    state_key: 'todo',
    type_key: task.type_key, // SAME type as master!
    due_at: date.toISOString(),
    priority: task.priority,
    props: {
      ...(task.props ?? {}),
      series_instance: {
        series_id: seriesId,
        index,
        master_task_id: taskId
      },
      recurrence: {
        rrule: config.rrule,
        index,
        date: date.toISOString(),
        source_entity_id: taskId,
        source_type_key: task.type_key
      }
    },
    created_by: task.created_by
  })) as OntoTaskInsert[];

  const { data: insertedInstances } = await client
    .from('onto_tasks')
    .insert(instances)
    .select();

  // 4. Update master with instance count
  await client
    .from('onto_tasks')
    .update({
      props: {
        ...masterProps,
        series_master: {
          ...masterProps.series_master,
          instances_count: occurrences.length,
          last_generated_at: new Date().toISOString()
        }
      }
    })
    .eq('id', taskId);

  return {
    master: task,
    instances: insertedInstances || [],
    seriesId
  };
}

/**
 * Delete entire series (master + instances)
 */
export async function deleteTaskSeries(seriesId: string): Promise<{ count: number }> {
  const client = createAdminSupabaseClient();

  // Delete instances
  const { count: instanceCount } = await client
    .from('onto_tasks')
    .delete()
    .eq('props->series_instance->series_id', seriesId);

  // Delete master
  const { count: masterCount } = await client
    .from('onto_tasks')
    .delete()
    .not('props->series_master', 'is', null)
    .eq('props->series_master->id', seriesId);

  return { count: (instanceCount ?? 0) + (masterCount ?? 0) };
}

/**
 * Get all instances of a series
 */
export async function getSeriesInstances(seriesId: string) {
  const client = createAdminSupabaseClient();
  const { data } = await client
    .from('onto_tasks')
    .select('*')
    .eq('props->series_instance->series_id', seriesId)
    .order('props->series_instance->index', { ascending: true });
  return data || [];
}
```

### API Endpoint

```typescript
// apps/web/src/routes/api/onto/tasks/[id]/make-recurring/+server.ts

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { enableTaskRecurrence } from '$lib/services/task-recurrence.service';

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const { rrule, timezone, regenerate_on_update } = body;

    if (!rrule) {
      return ApiResponse.error('RRULE is required', 400);
    }

    const result = await enableTaskRecurrence(params.id, {
      rrule,
      timezone,
      regenerate_on_update
    });

    return ApiResponse.success({
      master: result.master,
      instances: result.instances,
      series_id: result.seriesId,
      instances_count: result.instances.length
    });
  } catch (err) {
    console.error('[make-recurring] Error:', err);
    return ApiResponse.error((err as Error).message, 500);
  }
};
```

---

## Migration Path (If Needed Later)

### Current (Recommended): Props-Based

No changes needed. Works immediately.

### Future: If Schema Normalization Needed

```sql
-- Phase 2 migration (future)
CREATE TABLE onto_task_series (
  id uuid PRIMARY KEY,
  master_task_id uuid NOT NULL REFERENCES onto_tasks(id) ON DELETE CASCADE,
  rrule text NOT NULL,
  timezone text DEFAULT 'UTC',
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid NOT NULL
);

ALTER TABLE onto_tasks
ADD COLUMN series_id uuid REFERENCES onto_task_series(id) ON DELETE SET NULL;

ALTER TABLE onto_tasks
ADD COLUMN series_index int;

-- Migrate existing data from props to schema
INSERT INTO onto_task_series (id, master_task_id, rrule, timezone, created_by)
SELECT
  props->'series_master'->>'id',
  id,
  props->'series_master'->>'rrule',
  props->'series_master'->>'timezone',
  created_by
FROM onto_tasks
WHERE props->'series_master' IS NOT NULL;

UPDATE onto_tasks
SET series_id = (props->'series_master'->>'id')::uuid
WHERE props->'series_master' IS NOT NULL;

UPDATE onto_tasks
SET series_id = (props->'series_instance'->>'series_id')::uuid,
    series_index = (props->'series_instance'->>'index')::int
WHERE props->'series_instance' IS NOT NULL;

-- Then can remove from props or keep for backward compat
```

---

## Summary: Why This Framework is Right

### ✅ Solves the User Problem
- User can make ANY task type recurring, not just `task.recurring-task`
- "Make recurring" is a behavior, not a type
- Flexible and user-intuitive

### ✅ Follows BuildOS Patterns
- Props-driven metadata (no schema changes)
- Entity-based relationships (master + instances)
- FSM-compatible (can add actions if needed)
- Graph edges could be used for advanced relationships later

### ✅ No Schema Migration
- Works immediately with current system
- Backward compatible with existing data
- Can be indexed for performance
- Future-proof (can migrate to schema later if needed)

### ✅ Clean Architecture
- Clear separation: master (configurable) vs. instances (independent)
- Reuses existing RRule/schedule logic
- Minimal new code required
- Well-defined extension points

### ✅ Enables Future Features
- Series management (edit, regenerate, delete)
- Smart recurrence (auto-generate on completion)
- Bulk actions (complete all, snooze series)
- Recurring task templates

---

## Comparison: Old vs New

| Aspect | Current | Proposed |
|--------|---------|----------|
| **Can quick-action be recurring?** | ❌ No | ✅ Yes |
| **Can deep-work be recurring?** | ❌ No | ✅ Yes |
| **Decision timing** | At template selection | Anytime (before/after creation) |
| **Recurrence is...** | A template type | A task behavior |
| **Can edit series after creation?** | ❌ No | ✅ Yes (Phase 2) |
| **Schema changes needed?** | N/A | ❌ No (props-based) |
| **Individual instance management** | Limited | ✅ Full control |
| **Series tracking** | Via props.recurrence | Via props.series_* |

---

## Next Steps

1. **Decide on recommendations**: Review and confirm:
   - Series Master Pattern is right approach
   - Hybrid (props-based) implementation is preferred
   - Instance naming (numbered)
   - Update behavior (config-only)

2. **Design API contract**: Create detailed endpoint specs
   - POST `/api/onto/tasks/[id]/make-recurring`
   - POST `/api/onto/tasks/series/[seriesId]/delete`
   - PATCH `/api/onto/tasks/[id]/update-series-config`

3. **Implement Phase 1**:
   - Add `enable_series_recurrence` action support (optional, for FSM)
   - Service layer: `task-recurrence.service.ts`
   - API endpoint: `make-recurring/+server.ts`
   - UI: Button + Dialog in task detail

4. **Test thoroughly**:
   - Props structure validation
   - Instance generation accuracy
   - Series deletion (cascade)
   - Query patterns

5. **Document**:
   - Update `/apps/web/docs/features/ontology/` with recurring tasks section
   - Add code examples
   - Document limitations and design decisions

