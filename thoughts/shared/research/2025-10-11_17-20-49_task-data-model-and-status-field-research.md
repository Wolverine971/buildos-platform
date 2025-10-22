---
title: Task Data Model and Status Field Research
date: 2025-10-11
timestamp: 17:20:49
author: Claude Code
type: research
status: completed
tags: [database, tasks, schema, status-field, types]
related_files:
    - /packages/shared-types/src/database.types.ts
    - /apps/web/src/lib/types/project.ts
    - /apps/web/src/lib/types/index.ts
---

# Task Data Model and Status Field Research

## Executive Summary

This research documents the complete task data model in BuildOS, including the database schema, TypeScript types, status field values, and calendar-related fields. The task status uses `'done'` (not `'completed'`) as the completion status value.

## Database Schema

### Tasks Table Structure

**Location:** `/packages/shared-types/src/database.types.ts` (Lines 3809-3940)

```typescript
tasks: {
  Row: {
    // Core identification
    id: string;
    user_id: string;
    project_id: string | null;

    // Task content
    title: string;
    description: string | null;
    details: string | null;
    task_steps: string | null;

    // Status and priority
    status: Database["public"]["Enums"]["task_status"];
    priority: Database["public"]["Enums"]["priority_level"];

    // Task type and recurrence
    task_type: Database["public"]["Enums"]["task_type"];
    recurrence_pattern: Database["public"]["Enums"]["recurrence_pattern"] | null;
    recurrence_ends: string | null;
    recurrence_end_source: Database["public"]["Enums"]["recurrence_end_reason"] | null;

    // Scheduling fields
    start_date: string | null;
    duration_minutes: number | null;

    // Completion tracking
    completed_at: string | null;

    // Calendar integration
    source_calendar_event_id: string | null;

    // Task hierarchy
    parent_task_id: string | null;
    dependencies: string[] | null;

    // Soft delete
    deleted_at: string | null;
    outdated: boolean | null;

    // Source tracking
    source: string | null;

    // Timestamps
    created_at: string;
    updated_at: string;
  };
}
```

## Status Field Details

### Valid Status Values

**Source:** `/packages/shared-types/src/database.types.ts` (Line 5825, 6040)

The `task_status` enum has exactly **4 valid values**:

```typescript
task_status: 'backlog' | 'in_progress' | 'done' | 'blocked';
```

**Database Enum Definition:**

```typescript
// Line 5825
task_status: 'backlog' | 'in_progress' | 'done' | 'blocked';

// Line 6040 (array format)
task_status: ['backlog', 'in_progress', 'done', 'blocked'];
```

### Status Usage Patterns

**CRITICAL FINDING:** The system uses `'done'` as the completion status, **NOT** `'completed'`.

#### Code Evidence

From `/apps/web/src/routes/api/projects/[id]/tasks/[taskId]/+server.ts`:

```typescript
// Lines 94-98: Completion timestamp handling
if (newTaskData.status === 'done' && existingTask.status !== 'done') {
	newTaskData.completed_at = new Date().toISOString();
} else if (newTaskData.status !== 'done' && existingTask.status === 'done') {
	newTaskData.completed_at = null;
}

// Lines 213-221: Calendar event removal on completion
if (newTaskData.status === 'done' && existingTask.status !== 'done' && hasCalendarEvents) {
	operations.push({
		type: 'delete_events',
		data: { task_id: taskId, reason: 'Task marked as done' }
	});
	return operations;
}

// Lines 224-229: Re-scheduling when uncompleting
if (
	existingTask.status === 'done' &&
	newTaskData.status !== 'done' &&
	(newTaskData.start_date || existingTask.start_date)
) {
	// ... re-add to calendar logic
}
```

#### Status Field Behavior

| Status        | Description               | completed_at     | Calendar Events | Typical Use                       |
| ------------- | ------------------------- | ---------------- | --------------- | --------------------------------- |
| `backlog`     | Not yet started           | `null`           | None or pending | Tasks not yet scheduled           |
| `in_progress` | Currently being worked on | `null`           | Active          | Tasks user is actively working on |
| `done`        | Completed                 | Set to timestamp | Removed         | Tasks that are finished           |
| `blocked`     | Cannot proceed            | `null`           | May exist       | Tasks waiting on dependencies     |

## Calendar-Related Fields

### Task Scheduling Fields

```typescript
// Direct on tasks table
start_date: string | null; // ISO 8601 timestamp
duration_minutes: number | null; // Task duration
source_calendar_event_id: string | null; // Source calendar event if imported
```

### Task Calendar Events Relationship

**Location:** `/packages/shared-types/src/database.types.ts` (Lines 3689-3769)

Tasks have a **one-to-many** relationship with calendar events through the `task_calendar_events` table:

```typescript
task_calendar_events: {
	Row: {
		id: string;
		task_id: string; // Foreign key to tasks
		user_id: string;

		// Calendar identification
		calendar_id: string;
		project_calendar_id: string | null;
		calendar_event_id: string; // Google Calendar event ID

		// Event details
		event_title: string | null;
		event_start: string | null;
		event_end: string | null;
		event_link: string | null;

		// Recurrence handling
		is_master_event: boolean | null;
		is_exception: boolean | null;
		recurrence_master_id: string | null;
		recurrence_instance_date: string | null;
		recurrence_rule: string | null;
		exception_type: string | null;
		original_start_time: string | null;
		series_update_scope: string | null;

		// Sync status
		sync_status: Database['public']['Enums']['sync_status'];
		sync_error: string | null;
		sync_source: string | null;
		sync_version: number | null;
		last_synced_at: string | null;

		created_at: string | null;
		updated_at: string | null;
	}
}
```

### Sync Status Enum

```typescript
sync_status: 'pending' | 'synced' | 'failed' | 'cancelled';
```

## Phase Relationship

### Tasks and Phases

Tasks relate to phases through a **join table** `phase_tasks`:

**Location:** `/packages/shared-types/src/database.types.ts` (Lines 2475-2497)

```typescript
phase_tasks: {
	Row: {
		id: string;
		phase_id: string; // Foreign key to phases
		task_id: string; // Foreign key to tasks
		assignment_reason: string | null;
		suggested_start_date: string | null;
		created_at: string;
	}
}
```

**Key Point:** Tasks do NOT have a direct `phase_id` column on the tasks table. The relationship is many-to-many through the `phase_tasks` join table.

### Phases Table

**Location:** `/packages/shared-types/src/database.types.ts` (Lines 2522-2577)

```typescript
phases: {
	Row: {
		id: string;
		user_id: string;
		project_id: string;

		name: string;
		description: string | null;
		order: number;

		// Time boundaries
		start_date: string;
		end_date: string;

		scheduling_method: string | null;

		created_at: string;
		updated_at: string;
	}
}
```

## TypeScript Type Definitions

### Application-Level Types

**Location:** `/apps/web/src/lib/types/project.ts`

```typescript
// Base types (Lines 10-14)
export type Project = Database['public']['Tables']['projects']['Row'];
export type Task = Database['public']['Tables']['tasks']['Row'];
export type Note = Database['public']['Tables']['notes']['Row'];
export type CalendarEvent = Database['public']['Tables']['task_calendar_events']['Row'];
export type Phase = Database['public']['Tables']['phases']['Row'];

// Insert types (Lines 20-24)
export type TaskInsert = Database['public']['Tables']['tasks']['Insert'];
export type TaskUpdate = Database['public']['Tables']['tasks']['Update'];

// Utility types (Lines 130-133)
export type TaskStatus = 'backlog' | 'in_progress' | 'done' | 'blocked';
export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskType = 'one_off' | 'recurring';
```

### Priority Level Enum

```typescript
priority_level: 'low' | 'medium' | 'high';
```

### Task Type Enum

```typescript
task_type: 'one_off' | 'recurring';
```

### Recurrence Pattern Enum

```typescript
recurrence_pattern:
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "custom"
  | null
```

### Recurrence End Reason Enum

```typescript
recurrence_end_reason:
  | "indefinite"
  | "project_inherited"
  | "user_specified"
  | null
```

## Key Relationships

### Task Relationships Diagram

```
┌─────────────┐
│   tasks     │
├─────────────┤
│ id          │─┐
│ user_id     │ │
│ project_id  │ │
│ status      │ │
│ start_date  │ │
│ ...         │ │
└─────────────┘ │
                │
                ├──→ ┌──────────────────────┐
                │    │ task_calendar_events │ (1:many)
                │    ├──────────────────────┤
                │    │ task_id (FK)         │
                │    │ calendar_event_id    │
                │    │ sync_status          │
                │    └──────────────────────┘
                │
                └──→ ┌─────────────┐
                     │ phase_tasks │ (many:many)
                     ├─────────────┤
                     │ task_id (FK)│
                     │ phase_id    │
                     └─────────────┘
                              │
                              ↓
                     ┌─────────────┐
                     │   phases    │
                     ├─────────────┤
                     │ id          │
                     │ project_id  │
                     │ start_date  │
                     │ end_date    │
                     └─────────────┘
```

## Task Filters

**Location:** `/apps/web/src/lib/types/index.ts` (Line 30)

```typescript
export type TaskFilter = 'all' | 'active' | 'scheduled' | 'overdue' | 'completed' | 'deleted';
```

**Note:** This is a UI filter type, not a database status. The `'completed'` filter value maps to tasks with `status === 'done'` in the database.

## Usage Examples from Codebase

### Filtering Completed Tasks

```typescript
// From /apps/web/src/routes/api/projects/list/+server.ts (Line 152)
const completedTasks = tasks.filter((t: any) => t.status === 'done');

// From /apps/web/src/routes/api/projects/[id]/details/+server.ts (Line 77)
completedTasks: tasks.filter((t: any) => t.status === 'done').length;
```

### Filtering Active Tasks

```typescript
// From /apps/web/src/routes/api/projects/[id]/stats/+server.ts (Line 102)
const activeTasks = allTasks.filter((t: any) => !t.deleted_at && t.status !== 'done');
```

### Status Transition Logic

```typescript
// Task completion sets timestamp
if (newTaskData.status === 'done' && existingTask.status !== 'done') {
	newTaskData.completed_at = new Date().toISOString();
}

// Uncompleting clears timestamp
if (newTaskData.status !== 'done' && existingTask.status === 'done') {
	newTaskData.completed_at = null;
}
```

## Complete Field Reference

### All Task Fields

| Field                      | Type                  | Nullable | Purpose                           |
| -------------------------- | --------------------- | -------- | --------------------------------- |
| `id`                       | string                | No       | Primary key (UUID)                |
| `user_id`                  | string                | No       | Owner user (FK)                   |
| `project_id`               | string                | Yes      | Parent project (FK)               |
| `title`                    | string                | No       | Task title/name                   |
| `description`              | string                | Yes      | Short description                 |
| `details`                  | string                | Yes      | Detailed information              |
| `task_steps`               | string                | Yes      | Steps to complete                 |
| `status`                   | task_status           | No       | Current status (enum)             |
| `priority`                 | priority_level        | No       | Priority level (enum)             |
| `task_type`                | task_type             | No       | One-off or recurring              |
| `recurrence_pattern`       | recurrence_pattern    | Yes      | How task repeats                  |
| `recurrence_ends`          | string                | Yes      | ISO date when recurrence stops    |
| `recurrence_end_source`    | recurrence_end_reason | Yes      | Why recurrence ends               |
| `start_date`               | string                | Yes      | ISO timestamp for scheduling      |
| `duration_minutes`         | number                | Yes      | Expected duration                 |
| `completed_at`             | string                | Yes      | ISO timestamp of completion       |
| `source_calendar_event_id` | string                | Yes      | Origin calendar event             |
| `parent_task_id`           | string                | Yes      | Parent task for subtasks          |
| `dependencies`             | string[]              | Yes      | Array of task IDs this depends on |
| `deleted_at`               | string                | Yes      | Soft delete timestamp             |
| `outdated`                 | boolean               | Yes      | Marked as outdated                |
| `source`                   | string                | Yes      | Origin source identifier          |
| `created_at`               | string                | No       | Record creation timestamp         |
| `updated_at`               | string                | No       | Last update timestamp             |

## Key Findings Summary

1. **Status Field:** Uses `'done'` for completion, NOT `'completed'`
2. **Valid Statuses:** `backlog`, `in_progress`, `done`, `blocked` (exactly 4 values)
3. **Completion Tracking:** `completed_at` field is automatically set/cleared based on status transitions
4. **Calendar Integration:** Tasks relate to calendar events via `task_calendar_events` join table
5. **Phase Relationship:** Tasks relate to phases via `phase_tasks` many-to-many join table
6. **No Direct phase_id:** Tasks do NOT have a `phase_id` column directly
7. **Scheduling:** `start_date` field stores ISO 8601 timestamp for scheduling
8. **Soft Delete:** Uses `deleted_at` field for soft deletion
9. **Recurrence:** Supports recurring tasks with pattern, end date, and end reason
10. **Task Hierarchy:** Supports parent-child relationships via `parent_task_id`

## File Locations Reference

### Primary Schema Files

- **Database Types:** `/packages/shared-types/src/database.types.ts`
    - Tasks table: Lines 3809-3940
    - task_status enum: Lines 5825, 6040
    - task_calendar_events table: Lines 3689-3769
    - phase_tasks table: Lines 2475-2497
    - phases table: Lines 2522-2577

### Application Types

- **Project Types:** `/apps/web/src/lib/types/project.ts`
    - Task types: Lines 10-30
    - Utility types: Lines 130-133
- **Index Types:** `/apps/web/src/lib/types/index.ts`
    - TaskFilter: Line 30

### Usage Examples

- **Task Updates:** `/apps/web/src/routes/api/projects/[id]/tasks/[taskId]/+server.ts`
- **Project Stats:** `/apps/web/src/routes/api/projects/[id]/stats/+server.ts`
- **Project Details:** `/apps/web/src/routes/api/projects/[id]/details/+server.ts`

## Conclusion

This research provides a comprehensive view of the task data model in BuildOS. The most critical finding is that the completion status is `'done'` (not `'completed'`), which is consistently used throughout the codebase for filtering completed tasks, setting completion timestamps, and managing calendar event synchronization.

The task model is richly featured with support for:

- Flexible status management
- Calendar integration and synchronization
- Recurring task patterns
- Phase-based organization
- Task hierarchies and dependencies
- Soft deletion for data preservation
