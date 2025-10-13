---
date: 2025-10-12T22:51:12Z
researcher: Claude (Sonnet 4.5)
git_commit: f5b54469642aba8e58d5f5031e78fc8d5426baf5
branch: main
repository: buildos-platform
topic: "Phase Generation Procedural Redesign - Formal Specification"
tags:
  [
    research,
    specification,
    phase-generation,
    calendar-events,
    database-schema,
    procedural-design,
  ]
status: complete
last_updated: 2025-10-12
last_updated_by: Claude (Sonnet 4.5)
---

# Phase Generation Procedural Redesign - Formal Specification

**Date**: 2025-10-12T22:51:12Z
**Researcher**: Claude (Sonnet 4.5)
**Git Commit**: f5b54469642aba8e58d5f5031e78fc8d5426baf5
**Branch**: main
**Repository**: buildos-platform

## Executive Summary

This specification defines a complete redesign of the BuildOS phase generation process to be more procedural, testable, and maintainable. The redesign introduces:

1. **Procedural Step-by-Step Architecture**: One main function calling separate, independently testable functions
2. **Two-Stage LLM Processing**: Split phase generation and task ordering into distinct LLM calls
3. **Task Ordering System**: New `order` column in `phase_tasks` for explicit task sequencing (parallel tasks share same order)
4. **Enhanced Calendar Event Tracking**: Track event ownership (organizer) and attendees to handle rescheduling constraints
5. **Smart Rescheduling Logic**: Handle edge cases for recurring tasks, external events, and events with attendees

---

## Table of Contents

1. [Goals & Objectives](#goals--objectives)
2. [Current System Analysis](#current-system-analysis)
3. [Database Schema Changes](#database-schema-changes)
4. [High-Level Flow](#high-level-flow)
5. [Detailed Procedural Workflow](#detailed-procedural-workflow)
6. [LLM Call Specifications](#llm-call-specifications)
7. [Calendar Event Handling](#calendar-event-handling)
8. [Edge Cases](#edge-cases)
9. [Parameter Configuration](#parameter-configuration)
10. [Testing Strategy](#testing-strategy)
11. [Implementation Checklist](#implementation-checklist)
12. [Migration Plan](#migration-plan)

---

## Goals & Objectives

### Primary Goals

1. **Procedural & Testable**: Replace complex orchestrator with linear, step-by-step functions that can be unit tested independently
2. **Accurate Task Ordering**: Split LLM calls to improve accuracy - one for phase generation, one for task ordering
3. **Calendar Event Awareness**: Properly track event ownership and attendees to make intelligent rescheduling decisions
4. **Future-Proof Architecture**: Anticipate unbuilt work when generating phases

### Success Criteria

- ✅ Each step is a separate, testable function
- ✅ Task order is explicitly tracked and respects dependencies
- ✅ Calendar events with attendees are handled appropriately
- ✅ System handles regeneration without data loss
- ✅ Code is readable and maintainable (no complex inheritance)

---

## Current System Analysis

### Current Architecture

**File**: `/apps/web/src/lib/services/phase-generation/orchestrator.ts` (747 lines)

**Current Flow**:

1. Load and validate project
2. Update project dates (optional)
3. Check if regeneration
4. Handle historical preservation
5. Select tasks
6. Clear invalid data
7. Get existing assignments
8. Create generation context
9. Execute strategy (strategy pattern with 3 strategies)
10. Return results

**Problems with Current System**:

1. **Strategy Pattern Over-Engineering**:
   - 3 strategies (`phases-only`, `schedule-in-phases`, `calendar-optimized`)
   - Complex inheritance hierarchy
   - Difficult to trace execution flow

2. **Single LLM Call**:
   - One call generates phases AND orders tasks
   - Too much complexity for one LLM prompt
   - Lower accuracy for task ordering

3. **No Explicit Task Order**:
   - No `order` column in `phase_tasks`
   - Tasks sorted by `start_date` in UI
   - No way to express "tasks can run in parallel"

4. **Limited Calendar Event Tracking**:
   - No organizer information stored
   - No attendee information stored
   - Cannot determine if user "owns" the event
   - Cannot check if rescheduling will affect others

5. **Unclear Edge Case Handling**:
   - Recurring tasks with calendar events
   - External calendar events (not created by BuildOS)
   - Events with multiple attendees

---

## Database Schema Changes

### 1. Add `order` Column to `phase_tasks`

**Migration**: Create new migration file in `/supabase/migrations/`

```sql
-- Migration: Add order column to phase_tasks
-- Purpose: Enable explicit task ordering within phases

ALTER TABLE phase_tasks
ADD COLUMN "order" INTEGER DEFAULT 0 NOT NULL;

-- Create index for efficient ordering queries
CREATE INDEX idx_phase_tasks_phase_order
ON phase_tasks(phase_id, "order");

-- Add comment for documentation
COMMENT ON COLUMN phase_tasks."order" IS
'Task execution order within phase. Tasks with same order can be done in parallel. Example: 0, 1, 1, 2, 3, 3, 3 means task 0 first, then tasks 1 and 1 in parallel, then task 2, then tasks 3, 3, 3 in parallel.';
```

**TypeScript Type Update**: `/packages/shared-types/src/database.schema.ts`

```typescript
phase_tasks: {
  assignment_reason: string | null;
  created_at: string;
  id: string;
  phase_id: string;
  suggested_start_date: string | null;
  task_id: string;
  order: number; // NEW: Task execution order
}
```

**Semantic Meaning**:

- `order = 0, 1, 2, 3...` → Sequential execution
- `order = 0, 1, 1, 2...` → Tasks with same order can be done in parallel
- Dependencies should be reflected in order (dependency has lower order)

### 2. Add Organizer Columns to `task_calendar_events`

**Migration**: Create new migration file in `/supabase/migrations/`

```sql
-- Migration: Add organizer and attendees tracking to task_calendar_events
-- Purpose: Enable smart rescheduling based on event ownership and attendees

ALTER TABLE task_calendar_events
ADD COLUMN organizer_email TEXT,
ADD COLUMN organizer_display_name TEXT,
ADD COLUMN organizer_self BOOLEAN DEFAULT TRUE,
ADD COLUMN attendees JSONB DEFAULT '[]'::jsonb;

-- Create indexes for common queries
CREATE INDEX idx_task_calendar_events_organizer_self
ON task_calendar_events(organizer_self);

CREATE INDEX idx_task_calendar_events_attendees
ON task_calendar_events USING GIN(attendees);

-- Add comments for documentation
COMMENT ON COLUMN task_calendar_events.organizer_email IS
'Email of event organizer from Google Calendar';

COMMENT ON COLUMN task_calendar_events.organizer_display_name IS
'Display name of event organizer';

COMMENT ON COLUMN task_calendar_events.organizer_self IS
'TRUE if authenticated user is the organizer (owns the event)';

COMMENT ON COLUMN task_calendar_events.attendees IS
'Array of attendee objects with email, displayName, responseStatus, etc.';
```

**TypeScript Type Update**: `/packages/shared-types/src/database.schema.ts`

```typescript
task_calendar_events: {
  // ... existing fields ...
  organizer_email: string | null;
  organizer_display_name: string | null;
  organizer_self: boolean | null;
  attendees: Array<{
    email: string;
    displayName?: string;
    organizer?: boolean;
    self?: boolean;
    responseStatus: "accepted" | "declined" | "tentative" | "needsAction";
    comment?: string;
    additionalGuests?: number;
  }> | null;
}
```

**Attendees JSONB Structure**:

```json
[
  {
    "email": "attendee@example.com",
    "displayName": "John Doe",
    "organizer": false,
    "self": false,
    "responseStatus": "accepted",
    "additionalGuests": 0
  }
]
```

### 3. Update `CalendarEvent` Type in `calendar-service.ts`

**File**: `/apps/web/src/lib/services/calendar-service.ts`

The `CalendarEvent` interface already includes organizer and attendees (lines 98-134), so no changes needed here. We just need to **start storing** these fields in the database.

---

## High-Level Flow

### Overview

The new phase generation process follows a clear, linear flow:

```
┌─────────────────────────────────────────────────────────────┐
│ PHASE GENERATION MAIN FUNCTION                               │
│                                                              │
│  1. Validate Input                                          │
│  2. Load Project Data                                       │
│  3. Check Regeneration Mode                                 │
│  4. Pre-Planning: Handle Historical Phases                  │
│  5. Pre-Planning: Reset Unfinished Tasks                    │
│  6. LLM Call 1: Generate Phases with Rough Grouping         │
│  7. LLM Call 2: Order Tasks Within Phases                   │
│  8. Persist Phases to Database                              │
│  9. Schedule Tasks (if calendar_optimized)                  │
│ 10. Handle Calendar Events                                  │
│ 11. Return Results                                          │
└─────────────────────────────────────────────────────────────┘
```

### Three Scheduling Methods

1. **`phases_only`**: Generate phases WITHOUT assigning tasks to phases
2. **`schedule_in_phases`**: Generate phases + assign tasks (no specific dates)
3. **`calendar_optimized`**: Generate phases + assign tasks + use TaskTimeSlotFinder for exact scheduling

---

## Detailed Procedural Workflow

### Step 0: Main Function Signature

**File**: `/apps/web/src/lib/services/phase-generation/generate-phases-procedural.ts` (NEW)

```typescript
export async function generatePhasesProcedural(
  config: PhaseGenerationConfig,
  supabase: SupabaseClient,
): Promise<PhaseGenerationResult> {
  // Step 1: Validate input
  const validationResult = await validatePhaseGenerationConfig(config);
  if (!validationResult.valid) {
    throw new Error(`Invalid config: ${validationResult.errors.join(", ")}`);
  }

  // Step 2: Load project data
  const projectData = await loadProjectData(config.projectId, supabase);

  // Step 3: Check regeneration mode
  const isRegeneration = await checkIfRegeneration(config.projectId, supabase);

  // Step 4: Pre-planning - Handle historical phases
  const historicalPhases = isRegeneration
    ? await handleHistoricalPhases(config, projectData, supabase)
    : [];

  // Step 5: Pre-planning - Reset unfinished tasks
  const tasksToSchedule = await resetUnfinishedTasks(
    config,
    projectData,
    isRegeneration,
    supabase,
  );

  // Step 6: LLM Call 1 - Generate phases with rough grouping
  const phasesWithRoughGrouping = await llmCall1_GeneratePhases(
    config,
    projectData,
    tasksToSchedule,
    historicalPhases,
  );

  // Step 7: LLM Call 2 - Order tasks within phases
  const phasesWithOrderedTasks =
    config.schedulingMethod === "phases_only"
      ? phasesWithRoughGrouping // Skip if phases_only
      : await llmCall2_OrderTasks(
          config,
          phasesWithRoughGrouping,
          tasksToSchedule,
        );

  // Step 8: Persist phases to database
  const persistedPhases = await persistPhasesToDatabase(
    phasesWithOrderedTasks,
    config.projectId,
    config.userId,
    supabase,
  );

  // Step 9: Schedule tasks (if calendar_optimized)
  if (config.schedulingMethod === "calendar_optimized") {
    await scheduleTasksWithTimeSlotFinder(persistedPhases, config, supabase);
  }

  // Step 10: Handle calendar events
  await handleCalendarEvents(persistedPhases, config, isRegeneration, supabase);

  // Step 11: Return results
  return {
    success: true,
    phases: persistedPhases,
    historicalPhases,
    tasksScheduled: tasksToSchedule.length,
  };
}
```

---

### Step 1: Validate Input

**Function**: `validatePhaseGenerationConfig(config: PhaseGenerationConfig)`

**Purpose**: Ensure all required parameters are present and valid.

```typescript
async function validatePhaseGenerationConfig(
  config: PhaseGenerationConfig,
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Required fields
  if (!config.projectId) errors.push("projectId is required");
  if (!config.userId) errors.push("userId is required");
  if (!config.schedulingMethod) errors.push("schedulingMethod is required");

  // Validate scheduling method
  const validMethods = [
    "phases_only",
    "schedule_in_phases",
    "calendar_optimized",
  ];
  if (!validMethods.includes(config.schedulingMethod)) {
    errors.push(`Invalid schedulingMethod: ${config.schedulingMethod}`);
  }

  // Date validation
  if (config.projectStartDate && config.projectEndDate) {
    const start = new Date(config.projectStartDate);
    const end = new Date(config.projectEndDate);
    if (start >= end) {
      errors.push("projectStartDate must be before projectEndDate");
    }
  }

  return { valid: errors.length === 0, errors };
}
```

**Tests**: Unit test each validation rule independently.

---

### Step 2: Load Project Data

**Function**: `loadProjectData(projectId: string, supabase: SupabaseClient)`

**Purpose**: Fetch all project-related data in ONE query.

```typescript
async function loadProjectData(
  projectId: string,
  supabase: SupabaseClient,
): Promise<ProjectData> {
  const { data: project, error } = await supabase
    .from("projects")
    .select(
      `
      *,
      tasks (
        *,
        task_calendar_events (
          *
        )
      ),
      phases (
        *,
        phase_tasks (
          *
        )
      )
    `,
    )
    .eq("id", projectId)
    .single();

  if (error || !project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  return {
    project,
    tasks: project.tasks || [],
    existingPhases: project.phases || [],
  };
}
```

**Returns**: All project data in one structured object.

**Tests**: Mock Supabase client, verify query structure.

---

### Step 3: Check Regeneration Mode

**Function**: `checkIfRegeneration(projectId: string, supabase: SupabaseClient)`

**Purpose**: Determine if this is first-time generation or regeneration.

```typescript
async function checkIfRegeneration(
  projectId: string,
  supabase: SupabaseClient,
): Promise<boolean> {
  const { count } = await supabase
    .from("phases")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  return (count || 0) > 0;
}
```

**Returns**: `true` if phases already exist, `false` otherwise.

---

### Step 4: Pre-Planning - Handle Historical Phases

**Function**: `handleHistoricalPhases(config, projectData, supabase)`

**Purpose**: When regenerating phases, preserve completed/current phases and delete future phases.

```typescript
async function handleHistoricalPhases(
  config: PhaseGenerationConfig,
  projectData: ProjectData,
  supabase: SupabaseClient,
): Promise<Phase[]> {
  if (!config.preserveHistoricalPhases) {
    // User wants to wipe everything - delete all phases
    await supabase.from("phases").delete().eq("project_id", config.projectId);
    return [];
  }

  const now = new Date();
  const { existingPhases } = projectData;

  // Categorize phases
  const completedPhases = existingPhases.filter(
    (p) => new Date(p.end_date) < now,
  );
  const currentPhase = existingPhases.find(
    (p) => new Date(p.start_date) <= now && new Date(p.end_date) >= now,
  );
  const futurePhases = existingPhases.filter(
    (p) => new Date(p.start_date) > now,
  );

  // Keep completed phases as-is
  const phasesToKeep = [...completedPhases];

  // If there's a current phase, "cutoff" at current date
  if (currentPhase) {
    await supabase
      .from("phases")
      .update({ end_date: now.toISOString().split("T")[0] })
      .eq("id", currentPhase.id);

    phasesToKeep.push({
      ...currentPhase,
      end_date: now.toISOString().split("T")[0],
    });
  }

  // Delete all future phases
  if (futurePhases.length > 0) {
    await supabase
      .from("phases")
      .delete()
      .in(
        "id",
        futurePhases.map((p) => p.id),
      );
  }

  return phasesToKeep;
}
```

**Logic**:

1. **Completed phases** (end_date < now) → Keep as-is
2. **Current phase** (overlaps with now) → Set end_date to now ("cutoff")
3. **Future phases** (start_date > now) → Delete

**Returns**: Array of preserved historical phases.

**Tests**:

- Test with no existing phases
- Test with only completed phases
- Test with current phase (verify cutoff)
- Test with future phases (verify deletion)

---

### Step 5: Pre-Planning - Reset Unfinished Tasks

**Function**: `resetUnfinishedTasks(config, projectData, isRegeneration, supabase)`

**Purpose**: Move ALL unfinished tasks to backlog. Preserve only completed/deleted tasks from current phase.

```typescript
async function resetUnfinishedTasks(
  config: PhaseGenerationConfig,
  projectData: ProjectData,
  isRegeneration: boolean,
  supabase: SupabaseClient,
): Promise<Task[]> {
  const { tasks } = projectData;

  if (!isRegeneration) {
    // First-time generation - return all tasks that match selected statuses
    return tasks.filter(
      (t) => config.selectedStatuses.includes(t.status) && !t.deleted_at,
    );
  }

  // Regeneration mode - reset ALL unfinished tasks
  const completedOrDeletedStatuses = ["done"];
  const now = new Date();

  // Find tasks in current/future phases that are NOT completed/deleted
  const tasksToReset = tasks.filter((t) => {
    const isCompletedOrDeleted = t.status === "done" || t.deleted_at;

    // Special case: If task has calendar event with attendees AND is recurring
    // → Never reschedule (too disruptive)
    if (t.task_calendar_events && t.task_calendar_events.length > 0) {
      const hasAttendees = t.task_calendar_events.some(
        (e) => e.attendees && e.attendees.length > 0,
      );
      if (hasAttendees && t.task_type === "recurring") {
        return false; // Skip this task - don't reset
      }
    }

    return !isCompletedOrDeleted;
  });

  // Batch operations
  const taskIds = tasksToReset.map((t) => t.id);

  if (taskIds.length > 0) {
    // 1. Remove phase_tasks associations
    await supabase.from("phase_tasks").delete().in("task_id", taskIds);

    // 2. Clear start_date for tasks (they'll be rescheduled)
    await supabase.from("tasks").update({ start_date: null }).in("id", taskIds);
  }

  return tasksToReset;
}
```

**Logic**:

1. **First-time generation**: Return tasks matching `config.selectedStatuses`
2. **Regeneration**:
   - Find all unfinished tasks (not 'done', not deleted)
   - **EXCEPTION**: Skip recurring tasks with attendees (too disruptive to reschedule)
   - Delete `phase_tasks` associations
   - Clear `start_date` on tasks

**Returns**: Array of tasks to be scheduled.

**Tests**:

- Test first-time generation
- Test regeneration with various task statuses
- Test exception for recurring + attendees

---

### Step 6: LLM Call 1 - Generate Phases with Rough Grouping

**Function**: `llmCall1_GeneratePhases(config, projectData, tasksToSchedule, historicalPhases)`

**Purpose**: Generate phases with rough task grouping (which tasks go in which phases).

```typescript
async function llmCall1_GeneratePhases(
  config: PhaseGenerationConfig,
  projectData: ProjectData,
  tasksToSchedule: Task[],
  historicalPhases: Phase[],
): Promise<PhaseWithRoughGrouping[]> {
  const systemPrompt = buildPhaseGenerationSystemPrompt_Call1(config);
  const userPrompt = buildPhaseGenerationUserPrompt_Call1(
    projectData,
    tasksToSchedule,
    historicalPhases,
    config,
  );

  const llmService = new SmartLLMService();
  const response = await llmService.generateStructuredOutput({
    systemPrompt,
    userPrompt,
    schema: {
      type: "object",
      properties: {
        phases: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              start_date: { type: "string" },
              end_date: { type: "string" },
              task_ids: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
  });

  return response.phases;
}
```

**Output Format** (JSON):

```json
{
  "phases": [
    {
      "name": "Phase 1: Foundation",
      "description": "Set up project infrastructure",
      "start_date": "2025-10-15",
      "end_date": "2025-10-22",
      "task_ids": ["task-1", "task-2", "task-3"]
    },
    {
      "name": "Phase 2: Development",
      "description": "Build core features",
      "start_date": "2025-10-23",
      "end_date": "2025-11-05",
      "task_ids": ["task-4", "task-5"]
    }
  ]
}
```

**Key Points**:

- LLM decides which tasks go in which phases
- LLM does NOT order tasks yet (that's Call 2)
- LLM should anticipate future work not yet captured as tasks
- Phases encompass ALL work needed from now to project end

**Tests**:

- Mock LLM response, verify parsing
- Test with various task counts
- Test with historical phases

---

### Step 7: LLM Call 2 - Order Tasks Within Phases

**Function**: `llmCall2_OrderTasks(config, phasesWithRoughGrouping, tasksToSchedule)`

**Purpose**: For each phase, determine the precise order of tasks (including parallel tasks).

```typescript
async function llmCall2_OrderTasks(
  config: PhaseGenerationConfig,
  phasesWithRoughGrouping: PhaseWithRoughGrouping[],
  tasksToSchedule: Task[],
): Promise<PhaseWithOrderedTasks[]> {
  const systemPrompt = buildTaskOrderingSystemPrompt_Call2(config);
  const userPrompt = buildTaskOrderingUserPrompt_Call2(
    phasesWithRoughGrouping,
    tasksToSchedule,
  );

  const llmService = new SmartLLMService();
  const response = await llmService.generateStructuredOutput({
    systemPrompt,
    userPrompt,
    schema: {
      type: "object",
      properties: {
        phases: {
          type: "array",
          items: {
            type: "object",
            properties: {
              phase_id: { type: "number" }, // Index in phasesWithRoughGrouping
              tasks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    task_id: { type: "string" },
                    order: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Merge ordering into phases
  return phasesWithRoughGrouping.map((phase, idx) => {
    const orderedTasks = response.phases[idx].tasks;
    return {
      ...phase,
      tasks: orderedTasks,
    };
  });
}
```

**Output Format** (JSON):

```json
{
  "phases": [
    {
      "phase_id": 0,
      "tasks": [
        { "task_id": "task-1", "order": 0 },
        { "task_id": "task-2", "order": 1 },
        { "task_id": "task-3", "order": 1 }
      ]
    },
    {
      "phase_id": 1,
      "tasks": [
        { "task_id": "task-4", "order": 0 },
        { "task_id": "task-5", "order": 1 }
      ]
    }
  ]
}
```

**Order Semantics**:

- `order: 0, 1, 2, 3` → Sequential
- `order: 0, 1, 1, 2` → Tasks 1 and 1 can be done in parallel
- Dependencies should be reflected (dependency gets lower order number)

**Tests**:

- Mock LLM response, verify merging
- Test with dependencies
- Test parallel task detection

---

### Step 8: Persist Phases to Database

**Function**: `persistPhasesToDatabase(phasesWithOrderedTasks, projectId, userId, supabase)`

**Purpose**: Save phases and phase_tasks to database.

```typescript
async function persistPhasesToDatabase(
  phasesWithOrderedTasks: PhaseWithOrderedTasks[],
  projectId: string,
  userId: string,
  supabase: SupabaseClient,
): Promise<Phase[]> {
  const persistedPhases: Phase[] = [];

  for (let i = 0; i < phasesWithOrderedTasks.length; i++) {
    const phaseData = phasesWithOrderedTasks[i];

    // Insert phase
    const { data: phase, error: phaseError } = await supabase
      .from("phases")
      .insert({
        project_id: projectId,
        user_id: userId,
        name: phaseData.name,
        description: phaseData.description,
        start_date: phaseData.start_date,
        end_date: phaseData.end_date,
        order: i,
        scheduling_method: config.schedulingMethod,
      })
      .select()
      .single();

    if (phaseError || !phase) {
      throw new Error(`Failed to create phase: ${phaseError?.message}`);
    }

    // Insert phase_tasks with order
    if (phaseData.tasks && phaseData.tasks.length > 0) {
      const phaseTasksInserts = phaseData.tasks.map((t) => ({
        phase_id: phase.id,
        task_id: t.task_id,
        order: t.order,
        suggested_start_date: phaseData.start_date, // Phase start as default
        assignment_reason: `Assigned to ${phaseData.name}`,
      }));

      const { error: phasTaskError } = await supabase
        .from("phase_tasks")
        .insert(phaseTasksInserts);

      if (phasTaskError) {
        throw new Error(
          `Failed to create phase_tasks: ${phasTaskError.message}`,
        );
      }
    }

    persistedPhases.push(phase);
  }

  return persistedPhases;
}
```

**Tests**:

- Test insertion with various phase counts
- Test with tasks having different orders
- Test error handling

---

### Step 9: Schedule Tasks (if calendar_optimized)

**Function**: `scheduleTasksWithTimeSlotFinder(persistedPhases, config, supabase)`

**Purpose**: Use `TaskTimeSlotFinder` to find exact date/times for tasks.

```typescript
async function scheduleTasksWithTimeSlotFinder(
  persistedPhases: Phase[],
  config: PhaseGenerationConfig,
  supabase: SupabaseClient,
): Promise<void> {
  const timeSlotFinder = new TaskTimeSlotFinder(supabase);

  for (const phase of persistedPhases) {
    // Get tasks for this phase, ordered by the `order` column
    const { data: phaseTasks } = await supabase
      .from("phase_tasks")
      .select(
        `
        *,
        tasks (*)
      `,
      )
      .eq("phase_id", phase.id)
      .order("order", { ascending: true });

    if (!phaseTasks || phaseTasks.length === 0) continue;

    // Find time slots for each task
    for (const phaseTask of phaseTasks) {
      const task = phaseTask.tasks;

      // Skip if task already has calendar event
      if (task.task_calendar_events && task.task_calendar_events.length > 0) {
        continue;
      }

      const slot = await timeSlotFinder.findNextAvailableSlot({
        userId: config.userId,
        durationMinutes: task.duration_minutes || 60,
        startAfter: new Date(phase.start_date),
        endBefore: new Date(phase.end_date),
      });

      if (slot) {
        // Update task start_date
        await supabase
          .from("tasks")
          .update({ start_date: slot.start })
          .eq("id", task.id);

        // Update phase_tasks suggested_start_date
        await supabase
          .from("phase_tasks")
          .update({ suggested_start_date: slot.start })
          .eq("id", phaseTask.id);
      }
    }
  }
}
```

**Tests**:

- Mock TaskTimeSlotFinder
- Test with various task durations
- Test with phase boundaries

---

### Step 10: Handle Calendar Events

**Function**: `handleCalendarEvents(persistedPhases, config, isRegeneration, supabase)`

**Purpose**: Create, update, or delete calendar events based on configuration.

```typescript
async function handleCalendarEvents(
  persistedPhases: Phase[],
  config: PhaseGenerationConfig,
  isRegeneration: boolean,
  supabase: SupabaseClient,
): Promise<void> {
  const calendarService = new CalendarService(supabase);

  // Get all tasks with start_dates across all phases
  const allTaskIds = persistedPhases.flatMap(
    (p) => p.phase_tasks?.map((pt) => pt.task_id) || [],
  );

  const { data: tasksWithDates } = await supabase
    .from("tasks")
    .select(
      `
      *,
      task_calendar_events (*)
    `,
    )
    .in("id", allTaskIds)
    .not("start_date", "is", null);

  if (!tasksWithDates || tasksWithDates.length === 0) return;

  // Handle based on calendar_handling config
  switch (config.calendar_handling) {
    case "update":
      await updateExistingCalendarEvents(
        tasksWithDates,
        config,
        calendarService,
        supabase,
      );
      break;

    case "clear_and_reschedule":
      await clearAndRescheduleCalendarEvents(
        tasksWithDates,
        config,
        calendarService,
        supabase,
      );
      break;

    case "preserve":
      // Do nothing - keep existing calendar events as-is
      break;

    default:
      await updateExistingCalendarEvents(
        tasksWithDates,
        config,
        calendarService,
        supabase,
      );
  }
}
```

**Detailed Functions**:

#### `updateExistingCalendarEvents`

```typescript
async function updateExistingCalendarEvents(
  tasks: Task[],
  config: PhaseGenerationConfig,
  calendarService: CalendarService,
  supabase: SupabaseClient,
): Promise<void> {
  for (const task of tasks) {
    if (!task.task_calendar_events || task.task_calendar_events.length === 0) {
      // No calendar event exists - create one
      await calendarService.scheduleTask(config.userId, {
        task_id: task.id,
        start_time: task.start_date!,
        duration_minutes: task.duration_minutes || 60,
      });
      continue;
    }

    // Calendar event exists - check if we can update it
    for (const calEvent of task.task_calendar_events) {
      // Check ownership
      if (calEvent.organizer_self === false) {
        // User doesn't own the event - cannot update
        console.warn(
          `Cannot update event ${calEvent.calendar_event_id} - not owned by user`,
        );
        continue;
      }

      // Check if recurring with attendees
      if (
        task.task_type === "recurring" &&
        calEvent.attendees &&
        calEvent.attendees.length > 0
      ) {
        // Too disruptive - don't update
        console.warn(
          `Cannot update recurring event ${calEvent.calendar_event_id} - has attendees`,
        );
        continue;
      }

      // Safe to update
      const hasAttendees = calEvent.attendees && calEvent.attendees.length > 0;

      await calendarService.updateCalendarEvent(config.userId, {
        event_id: calEvent.calendar_event_id,
        calendar_id: calEvent.calendar_id,
        start_time: task.start_date!,
        end_time: new Date(
          new Date(task.start_date!).getTime() +
            (task.duration_minutes || 60) * 60 * 1000,
        ).toISOString(),
        sendUpdates: hasAttendees ? "all" : "none", // NEW: Notify attendees if any
      });
    }
  }
}
```

**Key Logic**:

1. If no calendar event → Create one
2. If event exists:
   - Check `organizer_self` → If false, skip (user doesn't own it)
   - Check recurring + attendees → Skip (too disruptive)
   - Otherwise → Update with `sendUpdates` based on attendees

#### `clearAndRescheduleCalendarEvents`

```typescript
async function clearAndRescheduleCalendarEvents(
  tasks: Task[],
  config: PhaseGenerationConfig,
  calendarService: CalendarService,
  supabase: SupabaseClient,
): Promise<void> {
  // Collect all calendar events to delete
  const eventsToDelete: BulkDeleteEventParams[] = [];

  for (const task of tasks) {
    if (task.task_calendar_events && task.task_calendar_events.length > 0) {
      for (const calEvent of task.task_calendar_events) {
        // Only delete if user owns the event
        if (calEvent.organizer_self !== false) {
          eventsToDelete.push({
            id: calEvent.id,
            calendar_event_id: calEvent.calendar_event_id,
            calendar_id: calEvent.calendar_id,
          });
        }
      }
    }
  }

  // Bulk delete
  if (eventsToDelete.length > 0) {
    await calendarService.bulkDeleteCalendarEvents(
      config.userId,
      eventsToDelete,
      { reason: "phase_regeneration" },
    );
  }

  // Create new events for all tasks with start_dates
  const tasksToSchedule = tasks.filter(
    (t) => t.start_date && t.status !== "done",
  );

  await calendarService.bulkScheduleTasks(
    config.userId,
    tasksToSchedule.map((t) => ({
      task_id: t.id,
      start_time: t.start_date!,
      duration_minutes: t.duration_minutes || 60,
    })),
  );
}
```

**Tests**:

- Test with various calendar_handling modes
- Test with owned vs non-owned events
- Test with recurring + attendees

---

### Step 11: Return Results

**Function**: Return comprehensive results object.

```typescript
return {
  success: true,
  phases: persistedPhases,
  historicalPhases,
  tasksScheduled: tasksToSchedule.length,
  metadata: {
    isRegeneration,
    schedulingMethod: config.schedulingMethod,
    preservedHistoricalPhases: historicalPhases.length,
  },
};
```

---

## LLM Call Specifications

### Call 1: Generate Phases with Rough Grouping

**Purpose**: Create phases and assign tasks to phases (rough grouping).

**System Prompt**:

```
You are an expert project manager specializing in phase-based planning for ADHD minds.

Your task is to generate project phases with rough task grouping.

## Context
- Project: {project.name}
- Description: {project.description}
- Project Context: {project.context}
- Timeline: {project_start_date} to {project_end_date}
- Preserved Historical Phases: {historical_phases_summary}

## Tasks to Schedule
{tasks_summary}

## Instructions

1. **Anticipate Future Work**: Generate phases that encompass ALL work needed to complete the project, even if not all tasks are created yet. Consider the project scope and description.

2. **Create Logical Phases**: Group related work into phases (e.g., "Planning", "Development", "Testing").

3. **Assign Tasks to Phases**: For each task, determine which phase it belongs to. You don't need to order tasks within phases yet (that's the next step).

4. **Phase Timeline**: Set realistic start_date and end_date for each phase.

5. **Historical Continuity**: If historical phases exist, new phases should start after the last historical phase.

## Output Format

Return JSON:
{
  "phases": [
    {
      "name": "Phase Name",
      "description": "What happens in this phase",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "task_ids": ["task-1", "task-2", "task-3"]
    }
  ]
}

## Rules
- ALL tasks MUST be assigned to a phase (no backlog)
- Phases can overlap if workflow requires it
- Each phase should have 3-10 tasks ideally
- Be concise - phase names should be 3-5 words
```

**User Prompt**:

```
Project: {project.name}

{project.description}

Context: {project.context}

Timeline: {project_start_date} to {project_end_date}

{historical_phases_info}

Tasks:
{task_list}

{user_instructions}

Generate phases with rough task grouping.
```

**Expected Output**:

```json
{
  "phases": [
    {
      "name": "Phase 1: Foundation",
      "description": "Set up infrastructure and tooling",
      "start_date": "2025-10-15",
      "end_date": "2025-10-22",
      "task_ids": ["task-1", "task-2", "task-3"]
    }
  ]
}
```

---

### Call 2: Order Tasks Within Phases

**Purpose**: Determine precise order of tasks within each phase.

**System Prompt**:

```
You are an expert at task sequencing and dependency management.

Your task is to determine the precise execution order of tasks within each phase.

## Order Semantics

The `order` field determines task execution sequence:
- **Sequential**: order = 0, 1, 2, 3, 4
- **Parallel**: order = 0, 1, 1, 2 (tasks with order 1 can be done simultaneously)

Tasks with the same order number CAN be done in parallel.

## Rules

1. **Dependencies**: If task B depends on task A, task A must have a lower order number.
2. **Parallelization**: If tasks are independent, give them the same order number.
3. **Priorities**: Higher priority tasks should generally come earlier (lower order).
4. **Logical Flow**: Consider the natural workflow and sequencing.

## Output Format

Return JSON:
{
  "phases": [
    {
      "phase_id": 0,  // Index in phases array from Call 1
      "tasks": [
        { "task_id": "task-1", "order": 0 },
        { "task_id": "task-2", "order": 1 },
        { "task_id": "task-3", "order": 1 }
      ]
    }
  ]
}
```

**User Prompt**:

```
Phases with rough grouping:
{phases_from_call_1}

Full task details (including dependencies and priorities):
{task_details}

Determine the precise order for tasks within each phase.
```

**Expected Output**:

```json
{
  "phases": [
    {
      "phase_id": 0,
      "tasks": [
        { "task_id": "task-1", "order": 0 },
        { "task_id": "task-2", "order": 1 },
        { "task_id": "task-3", "order": 1 }
      ]
    }
  ]
}
```

---

## Calendar Event Handling

### Fetching Organizer and Attendees

**Update**: `CalendarService.getCalendarEvents()` already returns full event data including organizer and attendees (line 445).

**Update**: `CalendarService.scheduleTask()` needs to fetch organizer/attendees after creating event and store in database.

**File**: `/apps/web/src/lib/services/calendar-service.ts`

**Modified `scheduleTask()` method** (lines 657-675):

```typescript
// After creating the event, fetch full event details to get organizer
const fullEvent = await calendar.events.get({
  calendarId: calendar_id,
  eventId: response.data.id!,
});

await this.supabase.from("task_calendar_events").upsert({
  user_id: userId,
  task_id: task_id,
  calendar_event_id: response.data.id!,
  calendar_id: calendar_id,
  event_link: response.data.htmlLink,
  event_start: startDate.toISOString(),
  event_end: endDate.toISOString(),
  event_title: task.title,
  is_master_event: isRecurring,
  recurrence_rule: isRecurring && recurrence.length > 0 ? recurrence[0] : null,
  // NEW: Store organizer info
  organizer_email: fullEvent.data.organizer?.email,
  organizer_display_name: fullEvent.data.organizer?.displayName,
  organizer_self: fullEvent.data.organizer?.self,
  // NEW: Store attendees
  attendees: fullEvent.data.attendees || [],
  last_synced_at: new Date().toISOString(),
  sync_status: "synced",
  sync_source: "app",
  updated_at: new Date().toISOString(),
});
```

### Using `sendUpdates` Parameter

**Google Calendar API Parameter**: `sendUpdates`

**Values**:

- `'all'`: Send notifications to all event guests
- `'externalOnly'`: Send notifications only to non-Google Calendar guests
- `'none'`: Send no notifications (some emails might still be sent)

**When to Use**:

- Use `'all'` when updating events that have attendees
- Use `'none'` when user is the only participant (current default behavior)

**Update**: `CalendarService.updateCalendarEvent()` method

**File**: `/apps/web/src/lib/services/calendar-service.ts` (line 818)

```typescript
// Add sendUpdates parameter
export interface UpdateCalendarEventParams {
  // ... existing fields ...
  sendUpdates?: "all" | "externalOnly" | "none";
}

// In updateCalendarEvent() method
const response = await calendar.events.update({
  calendarId: calendar_id,
  eventId: effectiveEventId,
  requestBody: updatePayload,
  sendUpdates: params.sendUpdates || "none", // NEW: Add sendUpdates
});
```

**Logic for Setting `sendUpdates`**:

```typescript
// In handleCalendarEvents() → updateExistingCalendarEvents()
const hasAttendees = calEvent.attendees && calEvent.attendees.length > 0;
const isOrganizer = calEvent.organizer_self !== false;

await calendarService.updateCalendarEvent(config.userId, {
  event_id: calEvent.calendar_event_id,
  calendar_id: calEvent.calendar_id,
  start_time: task.start_date!,
  end_time: endTime,
  sendUpdates: hasAttendees && isOrganizer ? "all" : "none",
});
```

---

## Edge Cases

### Edge Case 1: Recurring Task with Calendar Event and Attendees

**Scenario**: Task is recurring, has calendar event, and event has attendees.

**Decision**: **NEVER reschedule** (too disruptive).

**Implementation**:

```typescript
// In resetUnfinishedTasks()
if (t.task_calendar_events && t.task_calendar_events.length > 0) {
  const hasAttendees = t.task_calendar_events.some(
    (e) => e.attendees && e.attendees.length > 0,
  );
  if (hasAttendees && t.task_type === "recurring") {
    return false; // Skip this task - don't reset
  }
}
```

**Result**: Task stays in its current phase with existing schedule.

---

### Edge Case 2: External Calendar Event (User Not Organizer)

**Scenario**: Task has calendar event, but user is not the organizer (`organizer_self = false`).

**Decision**: **Cannot reschedule** (user doesn't own the event).

**Implementation**:

```typescript
// In updateExistingCalendarEvents()
if (calEvent.organizer_self === false) {
  console.warn(
    `Cannot update event ${calEvent.calendar_event_id} - not owned by user`,
  );
  continue; // Skip update
}
```

**Result**: Task's `start_date` must match the calendar event's time (cannot be changed).

---

### Edge Case 3: Task with Dependencies

**Scenario**: Task B depends on Task A.

**Decision**: Ensure Task A has lower `order` than Task B.

**Implementation**: LLM Call 2 is responsible for respecting dependencies.

**LLM Prompt Instruction**:

```
If task B depends on task A, task A MUST have a lower order number than task B.
```

**Validation** (optional):

```typescript
function validateTaskOrder(
  phases: PhaseWithOrderedTasks[],
  tasks: Task[],
): void {
  for (const phase of phases) {
    for (const task of phase.tasks) {
      const taskData = tasks.find((t) => t.id === task.task_id);
      if (!taskData || !taskData.dependencies) continue;

      for (const depId of taskData.dependencies) {
        const depTask = phase.tasks.find((t) => t.task_id === depId);
        if (depTask && depTask.order >= task.order) {
          console.warn(
            `Dependency violation: Task ${task.task_id} (order ${task.order}) ` +
              `depends on ${depId} (order ${depTask.order})`,
          );
        }
      }
    }
  }
}
```

---

### Edge Case 4: First-Time Generation vs Regeneration

**Scenario**: Behavior differs based on whether phases already exist.

**Decision**:

- **First-time**: Generate fresh phases and assign all selected tasks
- **Regeneration**: Preserve historical phases, reset unfinished tasks

**Implementation**: `checkIfRegeneration()` determines mode, then `handleHistoricalPhases()` and `resetUnfinishedTasks()` behave accordingly.

---

### Edge Case 5: Task with No start_date After Scheduling

**Scenario**: After phase generation, some tasks might not have `start_date` (e.g., `phases_only` method).

**Decision**: Do NOT create calendar events for tasks without `start_date`.

**Implementation**:

```typescript
// In handleCalendarEvents()
const { data: tasksWithDates } = await supabase
  .from("tasks")
  .select(`*`)
  .in("id", allTaskIds)
  .not("start_date", "is", null); // Only tasks with dates
```

---

## Parameter Configuration

### Updated `PhaseGenerationConfig` Interface

**File**: `/apps/web/src/lib/services/phase-generation/types.ts`

```typescript
export interface PhaseGenerationConfig {
  // Project identification
  projectId: string;
  userId: string;

  // Task selection
  selectedStatuses: TaskStatus[];

  // Scheduling method
  schedulingMethod: "phases_only" | "schedule_in_phases" | "calendar_optimized";

  // Timeline
  projectStartDate?: string;
  projectEndDate?: string;
  projectDatesChanged?: boolean;

  // Historical preservation
  preserveHistoricalPhases: boolean; // Default: true

  // User guidance
  userInstructions?: string;

  // Calendar handling
  calendar_handling?: "update" | "clear_and_reschedule" | "preserve";

  // DEPRECATED - Remove these:
  // - include_recurring_tasks (always include unless edge case)
  // - allow_recurring_reschedule (handle via calendar event logic)
  // - preserve_existing_dates (handled by calendar_handling)
  // - preserve_recurring_events (handled by calendar event logic)
  // - calendar_cleanup_batch_size (internal detail)
}
```

### Scheduling Method Behavior

| Method               | Behavior                                                                     |
| -------------------- | ---------------------------------------------------------------------------- |
| `phases_only`        | Generate phases WITHOUT assigning tasks to phases                            |
| `schedule_in_phases` | Generate phases + assign tasks (no specific dates)                           |
| `calendar_optimized` | Generate phases + assign tasks + use TaskTimeSlotFinder for exact date/times |

---

## Testing Strategy

### Unit Tests

Each procedural function should have unit tests:

1. **`validatePhaseGenerationConfig()`**
   - Test all validation rules
   - Test valid and invalid inputs

2. **`loadProjectData()`**
   - Mock Supabase client
   - Test with various project structures

3. **`checkIfRegeneration()`**
   - Test with no phases
   - Test with existing phases

4. **`handleHistoricalPhases()`**
   - Test with no phases
   - Test with completed phases
   - Test with current phase (verify cutoff)
   - Test with future phases (verify deletion)

5. **`resetUnfinishedTasks()`**
   - Test first-time generation
   - Test regeneration with various statuses
   - Test recurring + attendees edge case

6. **`persistPhasesToDatabase()`**
   - Test phase insertion
   - Test phase_tasks insertion with order

7. **`scheduleTasksWithTimeSlotFinder()`**
   - Mock TaskTimeSlotFinder
   - Test with various task counts

8. **`handleCalendarEvents()`**
   - Test with 'update' mode
   - Test with 'clear_and_reschedule' mode
   - Test with 'preserve' mode
   - Test owned vs non-owned events
   - Test recurring + attendees

### Integration Tests

Test the full `generatePhasesProcedural()` function with:

- Real database (test environment)
- Mock LLM service
- Various configurations

### LLM Tests

Test prompt quality with `pnpm run test:llm`:

- Test Call 1 prompt generates valid phases
- Test Call 2 prompt generates valid ordering
- Test with various project types

---

## Implementation Checklist

### Phase 1: Database Migrations

- [ ] Create migration for `phase_tasks.order` column
- [ ] Create migration for `task_calendar_events.organizer_*` columns
- [ ] Create migration for `task_calendar_events.attendees` column
- [ ] Run migrations in development environment
- [ ] Update TypeScript types in `/packages/shared-types/src/database.schema.ts`

### Phase 2: Calendar Service Updates

- [ ] Update `CalendarService.scheduleTask()` to fetch and store organizer/attendees
- [ ] Update `CalendarService.updateCalendarEvent()` to accept `sendUpdates` parameter
- [ ] Add `sendUpdates` to `UpdateCalendarEventParams` interface
- [ ] Update `CalendarEvent` type if needed (already has fields)
- [ ] Test calendar service changes

### Phase 3: Core Procedural Functions

- [ ] Create `/apps/web/src/lib/services/phase-generation/generate-phases-procedural.ts`
- [ ] Implement `validatePhaseGenerationConfig()`
- [ ] Implement `loadProjectData()`
- [ ] Implement `checkIfRegeneration()`
- [ ] Implement `handleHistoricalPhases()`
- [ ] Implement `resetUnfinishedTasks()`
- [ ] Implement `persistPhasesToDatabase()`
- [ ] Implement `scheduleTasksWithTimeSlotFinder()`
- [ ] Implement `handleCalendarEvents()` with sub-functions
- [ ] Implement main `generatePhasesProcedural()` function

### Phase 4: LLM Prompts

- [ ] Create `buildPhaseGenerationSystemPrompt_Call1()`
- [ ] Create `buildPhaseGenerationUserPrompt_Call1()`
- [ ] Create `buildTaskOrderingSystemPrompt_Call2()`
- [ ] Create `buildTaskOrderingUserPrompt_Call2()`
- [ ] Add to `/apps/web/src/lib/services/promptTemplate.service.ts`

### Phase 5: API Endpoint Integration

- [ ] Update `/apps/web/src/routes/api/projects/[id]/phases/generate/+server.ts`
- [ ] Switch from old orchestrator to new `generatePhasesProcedural()`
- [ ] Update request validation
- [ ] Update response format if needed

### Phase 6: Unit Tests

- [ ] Write tests for each procedural function
- [ ] Write tests for edge cases
- [ ] Write tests for calendar event handling
- [ ] Aim for 80%+ code coverage

### Phase 7: Integration Tests

- [ ] Test full flow with mock LLM
- [ ] Test first-time generation
- [ ] Test regeneration with historical phases
- [ ] Test all three scheduling methods

### Phase 8: LLM Tests

- [ ] Test Call 1 prompt quality
- [ ] Test Call 2 prompt quality
- [ ] Run with `pnpm run test:llm`

### Phase 9: UI Updates (if needed)

- [ ] Verify UI handles new `order` field
- [ ] Update phase display to show task order
- [ ] Test drag-and-drop reordering (if exists)

### Phase 10: Documentation

- [ ] Update `/apps/web/docs/features/phase-generation/README.md`
- [ ] Add architecture diagram for new procedural flow
- [ ] Document edge cases and decision logic
- [ ] Update API documentation

### Phase 11: Deployment

- [ ] Deploy database migrations to staging
- [ ] Deploy code to staging
- [ ] Test in staging environment
- [ ] Deploy to production
- [ ] Monitor for errors

---

## Migration Plan

### Database Migration Order

1. **Add `order` column to `phase_tasks`**
   - Default value: 0
   - Backfill existing records with sequential order

2. **Add organizer/attendees columns to `task_calendar_events`**
   - Nullable columns
   - Backfill: Run script to fetch organizer/attendees from Google Calendar for existing events

### Code Migration Strategy

**Approach**: Gradual rollout with feature flag.

**Steps**:

1. **Add feature flag**: `USE_PROCEDURAL_PHASE_GENERATION`
2. **Deploy both implementations** (old orchestrator + new procedural)
3. **Enable flag for subset of users** (e.g., 10%)
4. **Monitor errors and accuracy**
5. **Gradually increase percentage** (10% → 25% → 50% → 100%)
6. **Remove old orchestrator code** after 100% rollout

**Rollback Plan**: Disable feature flag, revert to old orchestrator.

---

## Related Documentation

- **Current Phase Generation**: `/apps/web/docs/features/phase-generation/` (if exists)
- **Calendar Service Flow**: `/apps/web/docs/technical/architecture/CALENDAR_SERVICE_FLOW.md`
- **Task Time Slot Finder**: `/apps/web/src/lib/services/task-time-slot-finder.ts`
- **Database Schema**: `/packages/shared-types/src/database.schema.ts`
- **API Endpoints**: `/apps/web/docs/technical/api/endpoints/`

---

## Code References

### Key Files for Implementation

| Component                 | File Path                                                                   | Purpose                                 |
| ------------------------- | --------------------------------------------------------------------------- | --------------------------------------- |
| **New Main Function**     | `/apps/web/src/lib/services/phase-generation/generate-phases-procedural.ts` | Main procedural implementation (NEW)    |
| **Current Orchestrator**  | `/apps/web/src/lib/services/phase-generation/orchestrator.ts`               | Current implementation (to be replaced) |
| **Calendar Service**      | `/apps/web/src/lib/services/calendar-service.ts`                            | Calendar event CRUD operations          |
| **Task Time Slot Finder** | `/apps/web/src/lib/services/task-time-slot-finder.ts`                       | Find available time slots               |
| **Prompt Templates**      | `/apps/web/src/lib/services/promptTemplate.service.ts`                      | LLM prompt generation                   |
| **API Endpoint**          | `/apps/web/src/routes/api/projects/[id]/phases/generate/+server.ts`         | HTTP endpoint                           |
| **Database Types**        | `/packages/shared-types/src/database.schema.ts`                             | TypeScript types for DB                 |

### Key Database Tables

- `phases` - Project phases with `order`, `start_date`, `end_date`
- `phase_tasks` - Junction table with **NEW** `order` column
- `tasks` - Tasks with `start_date`, `dependencies`, `task_type`
- `task_calendar_events` - Calendar event tracking with **NEW** `organizer_*` and `attendees` columns

---

## Appendix A: Example Workflow

### Example: Regenerating Phases for Existing Project

**Scenario**: User has a project with 3 phases, currently in Phase 2. User adds 5 new tasks and wants to regenerate phases.

**Initial State**:

- Phase 1: Completed (end_date < now)
- Phase 2: In progress (overlaps with now)
- Phase 3: Future (start_date > now)
- 10 existing tasks (3 done, 2 in-progress, 5 backlog)
- 5 new tasks (all backlog)

**Workflow**:

1. **Validate Input** ✓
2. **Load Project Data** → Fetch project, tasks, phases
3. **Check Regeneration** → `true` (phases exist)
4. **Handle Historical Phases**:
   - Keep Phase 1 as-is (completed)
   - "Cutoff" Phase 2 at current date (set end_date = now)
   - Delete Phase 3 (future)
5. **Reset Unfinished Tasks**:
   - Keep 3 completed tasks in Phase 1/2
   - Move 7 unfinished tasks to backlog (2 in-progress, 5 backlog)
   - Add 5 new tasks
   - Total: 12 tasks to schedule
6. **LLM Call 1** → Generate 3 new phases with rough grouping
7. **LLM Call 2** → Order tasks within each phase
8. **Persist to Database** → Insert 3 new phases with `phase_tasks` (order included)
9. **Schedule Tasks** → (if calendar_optimized) Use TaskTimeSlotFinder
10. **Handle Calendar Events** → Update existing, create new
11. **Return Results** → Success, 3 new phases, 12 tasks scheduled

**Result**:

- Phase 1: Completed (preserved)
- Phase 2: Completed (cutoff at current date, preserved)
- Phase 3: NEW (generated by LLM)
- Phase 4: NEW (generated by LLM)
- Phase 5: NEW (generated by LLM)

---

## Appendix B: LLM Prompt Examples

### Example Call 1 Prompt

**System**:

```
You are an expert project manager specializing in phase-based planning for ADHD minds.

Your task is to generate project phases with rough task grouping.

## Context
- Project: Redesign Company Website
- Description: Complete redesign of company website with new branding
- Project Context: Need to modernize look, improve performance, add blog
- Timeline: 2025-10-15 to 2025-11-30
- Preserved Historical Phases: Phase 1 "Research & Planning" (completed)

## Tasks to Schedule
- Task 1: Create wireframes (backlog, high priority)
- Task 2: Design homepage mockup (backlog, high priority)
- Task 3: Design about page mockup (backlog, medium priority)
- Task 4: Implement homepage (backlog, medium priority)
- Task 5: Implement about page (backlog, medium priority)
- Task 6: Set up CMS (backlog, high priority)
- Task 7: Write blog posts (backlog, low priority)

## Instructions
[... full instructions from LLM Call 1 spec above ...]
```

**User**:

```
Project: Redesign Company Website

Complete redesign of company website with new branding, improved performance, and new blog functionality.

Context: Client wants modern, clean design. Must be mobile-responsive. Blog should support markdown.

Timeline: 2025-10-15 to 2025-11-30

Historical Phases:
- Phase 1: Research & Planning (2025-10-01 to 2025-10-14) [COMPLETED]

Tasks:
1. Create wireframes (high priority, depends on: [])
2. Design homepage mockup (high priority, depends on: [Task 1])
3. Design about page mockup (medium priority, depends on: [Task 1])
4. Implement homepage (medium priority, depends on: [Task 2, Task 6])
5. Implement about page (medium priority, depends on: [Task 3, Task 6])
6. Set up CMS (high priority, depends on: [])
7. Write blog posts (low priority, depends on: [Task 6])

User Instructions: Focus on getting the homepage perfect before moving to other pages.

Generate phases with rough task grouping.
```

**Expected Output**:

```json
{
  "phases": [
    {
      "name": "Phase 2: Design",
      "description": "Create wireframes and mockups for all pages",
      "start_date": "2025-10-15",
      "end_date": "2025-10-25",
      "task_ids": ["task-1", "task-2", "task-3"]
    },
    {
      "name": "Phase 3: Development",
      "description": "Implement pages and set up CMS",
      "start_date": "2025-10-26",
      "end_date": "2025-11-15",
      "task_ids": ["task-6", "task-4", "task-5"]
    },
    {
      "name": "Phase 4: Content & Launch",
      "description": "Write blog posts and prepare for launch",
      "start_date": "2025-11-16",
      "end_date": "2025-11-30",
      "task_ids": ["task-7"]
    }
  ]
}
```

---

### Example Call 2 Prompt

**System**:

```
You are an expert at task sequencing and dependency management.

Your task is to determine the precise execution order of tasks within each phase.

[... full system prompt from LLM Call 2 spec above ...]
```

**User**:

```
Phases with rough grouping:
Phase 0: Design
  - task-1: Create wireframes
  - task-2: Design homepage mockup
  - task-3: Design about page mockup

Phase 1: Development
  - task-6: Set up CMS
  - task-4: Implement homepage
  - task-5: Implement about page

Phase 2: Content & Launch
  - task-7: Write blog posts

Full task details:
- Task 1: Create wireframes (priority: high, depends on: [])
- Task 2: Design homepage mockup (priority: high, depends on: [task-1])
- Task 3: Design about page mockup (priority: medium, depends on: [task-1])
- Task 4: Implement homepage (priority: medium, depends on: [task-2, task-6])
- Task 5: Implement about page (priority: medium, depends on: [task-3, task-6])
- Task 6: Set up CMS (priority: high, depends on: [])
- Task 7: Write blog posts (priority: low, depends on: [task-6])

Determine the precise order for tasks within each phase.
```

**Expected Output**:

```json
{
  "phases": [
    {
      "phase_id": 0,
      "tasks": [
        { "task_id": "task-1", "order": 0 },
        { "task_id": "task-2", "order": 1 },
        { "task_id": "task-3", "order": 1 }
      ]
    },
    {
      "phase_id": 1,
      "tasks": [
        { "task_id": "task-6", "order": 0 },
        { "task_id": "task-4", "order": 1 },
        { "task_id": "task-5", "order": 1 }
      ]
    },
    {
      "phase_id": 2,
      "tasks": [{ "task_id": "task-7", "order": 0 }]
    }
  ]
}
```

**Explanation**:

- Phase 0: Task 1 must come first (order 0). Tasks 2 and 3 both depend on Task 1, so they get order 1 (can be done in parallel).
- Phase 1: Task 6 must come first (order 0). Tasks 4 and 5 both depend on Task 6, so they get order 1 (can be done in parallel).
- Phase 2: Only one task, so order 0.

---

## Appendix C: Google Calendar API Research Summary

### `sendUpdates` Parameter

**Documentation**: https://developers.google.com/workspace/calendar/api/v3/reference/events/update

**Purpose**: Controls whether to send notifications to event guests when updating an event.

**Accepted Values**:

- `'all'`: Send notifications to all event guests
- `'externalOnly'`: Send notifications only to non-Google Calendar guests
- `'none'`: Send no notifications (default; note: some emails might still be sent)

**Usage**: Query parameter in `events.insert`, `events.update`, `events.patch`

**Example**:

```typescript
await calendar.events.update({
  calendarId: "primary",
  eventId: "event123",
  requestBody: {
    summary: "Updated Event Title",
    start: { dateTime: "2025-10-15T10:00:00Z" },
    end: { dateTime: "2025-10-15T11:00:00Z" },
  },
  sendUpdates: "all", // Notify all attendees
});
```

### Organizer Field

**Structure** (from CalendarEvent type, line 103-107):

```typescript
organizer: {
  email: string;            // Email of organizer
  displayName?: string;     // Display name
  self?: boolean;           // TRUE if current user is organizer
}
```

**Usage**: Returned in all event objects from Google Calendar API.

**Determining Ownership**: Check `organizer.self === true` to determine if authenticated user owns the event.

### Attendees Field

**Structure** (from CalendarEvent type, line 126-134):

```typescript
attendees?: {
  email: string;
  displayName?: string;
  organizer?: boolean;           // TRUE for organizer in attendees list
  self?: boolean;                // TRUE if this is the current user
  responseStatus: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  comment?: string;
  additionalGuests?: number;     // Number of guests this attendee brings
}[];
```

**Usage**: Returned in all event objects from Google Calendar API. Empty array if no attendees.

---

## Questions for Future Consideration

1. **Should we add UI for manual task reordering?**
   - Drag-and-drop within phases
   - Would override LLM-generated order

2. **Should we track "why" a task can't be rescheduled?**
   - Add `reschedule_blocked_reason` field to tasks
   - Values: "recurring_with_attendees", "external_event", etc.

3. **Should we notify users when tasks can't be rescheduled?**
   - Toast notification during phase generation
   - List of skipped tasks in results

4. **Should we support partial phase regeneration?**
   - "Regenerate only Phase 3 and beyond"
   - Keep Phase 1 and 2 exactly as-is

5. **Should we add "confidence score" for LLM-generated order?**
   - LLM returns confidence for each order decision
   - Low confidence → suggest manual review

---

## Conclusion

This specification defines a complete redesign of the BuildOS phase generation system with:

1. **Clear procedural architecture** - Each step is a separate, testable function
2. **Two-stage LLM processing** - Better accuracy through focused prompts
3. **Explicit task ordering** - New `order` column supports sequential and parallel execution
4. **Smart calendar handling** - Tracks ownership and attendees to make intelligent rescheduling decisions
5. **Comprehensive edge case handling** - Recurring tasks, external events, attendees

The new system will be more maintainable, testable, and accurate than the current strategy-pattern-based orchestrator.

**Next Steps**: Begin implementation starting with database migrations (Phase 1 of checklist).
