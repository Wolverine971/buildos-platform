<!-- apps/web/docs/technical/api/endpoints/tasks.md -->

# Tasks API

**Base Path:** `/api/tasks`

The Tasks API provides standalone task management functionality independent of projects, including personal tasks, quick captures, and task-specific operations.

---

## Table of Contents

1. [Personal Tasks](#personal-tasks)
2. [Task Operations](#task-operations)
3. [Task Scheduling](#task-scheduling)
4. [Task Tags & Labels](#task-tags--labels)
5. [Task Comments & Activity](#task-comments--activity)
6. [Task Dependencies](#task-dependencies)

---

## Personal Tasks

### 1. `GET /api/tasks` - List All Tasks

**Purpose:** Retrieve all tasks for the authenticated user across all projects.

**File:** `src/routes/api/tasks/+server.ts`

**Authentication:** Required (session-based)

#### Query Parameters

| Parameter            | Type                                                       | Required | Description                              |
| -------------------- | ---------------------------------------------------------- | -------- | ---------------------------------------- |
| `status`             | `'todo' \| 'in_progress' \| 'completed' \| 'blocked'`      | No       | Filter by status                         |
| `priority`           | `'low' \| 'medium' \| 'high' \| 'urgent'`                  | No       | Filter by priority                       |
| `project_id`         | `string (uuid)`                                            | No       | Filter by project                        |
| `due_before`         | `string (ISO date)`                                        | No       | Tasks due before date                    |
| `due_after`          | `string (ISO date)`                                        | No       | Tasks due after date                     |
| `has_calendar_event` | `boolean`                                                  | No       | Filter tasks with calendar events        |
| `is_recurring`       | `boolean`                                                  | No       | Filter recurring tasks                   |
| `tags`               | `string[]`                                                 | No       | Filter by tags (comma-separated)         |
| `sort_by`            | `'due_date' \| 'priority' \| 'created_at' \| 'updated_at'` | No       | Sort field                               |
| `order`              | `'asc' \| 'desc'`                                          | No       | Sort order (default: 'asc' for due_date) |
| `limit`              | `number`                                                   | No       | Max results (default: 100)               |
| `offset`             | `number`                                                   | No       | Pagination offset                        |

#### Response: `ApiResponse<{ tasks: Task[], total: number }>`

```typescript
{
  success: true,
  data: {
    tasks: [
      {
        id: "uuid",
        title: "Review pull request",
        description: "Review PR #123 for authentication feature",
        status: "todo",
        priority: "high",
        project_id: "uuid",
        project_name: "BuildOS Platform",
        phase_id: "uuid",
        phase_name: "Development",
        user_id: "uuid",
        order: 0,
        estimated_duration: 60,
        actual_duration: null,
        due_date: "2025-01-16T17:00:00Z",
        calendar_event_id: "google-event-id",
        is_recurring: false,
        tags: ["code-review", "urgent"],
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
        completed_at: null,
        deleted_at: null
      }
    ],
    total: 45
  }
}
```

---

### 2. `POST /api/tasks` - Create Personal Task

**Purpose:** Create a standalone task (not tied to a project).

**File:** `src/routes/api/tasks/+server.ts`

**Authentication:** Required (session-based)

#### Request Body

```typescript
{
  title: string;                    // Required, 1-500 chars
  description?: string;             // Optional, max 5000 chars
  priority?: 'low' | 'medium' | 'high' | 'urgent';  // Default: 'medium'
  estimated_duration?: number;      // Minutes
  due_date?: string;                // ISO 8601 date
  tags?: string[];                  // Task tags
  calendar_options?: {
    schedule: boolean;              // Auto-schedule to calendar
    calendar_id?: string;           // Specific calendar
    start_time?: string;            // Preferred start time
  };
}
```

#### Response: `ApiResponse<{ task: Task }>`

```typescript
{
  success: true,
  data: {
    task: {
      id: "uuid",
      title: "Buy groceries",
      description: "Milk, bread, eggs",
      status: "todo",
      priority: "medium",
      project_id: null,  // No project
      phase_id: null,
      user_id: "uuid",
      estimated_duration: 30,
      due_date: "2025-01-16T18:00:00Z",
      tags: ["personal", "errands"],
      created_at: "2025-01-15T10:00:00Z"
    }
  },
  message: "Task created successfully"
}
```

---

### 3. `GET /api/tasks/today` - Today's Tasks

**Purpose:** Get all tasks due today.

**File:** `src/routes/api/tasks/today/+server.ts`

**Authentication:** Required (session-based)

#### Query Parameters

| Parameter         | Type      | Required | Description                           |
| ----------------- | --------- | -------- | ------------------------------------- |
| `include_overdue` | `boolean` | No       | Include overdue tasks (default: true) |

#### Response: `ApiResponse<{ tasks: Task[], overdue_count: number }>`

```typescript
{
  success: true,
  data: {
    tasks: [
      {
        id: "uuid",
        title: "Morning standup",
        due_date: "2025-01-15T10:00:00Z",
        priority: "high",
        status: "todo",
        is_overdue: false
      },
      {
        id: "uuid",
        title: "Submit report",
        due_date: "2025-01-14T17:00:00Z",
        priority: "urgent",
        status: "todo",
        is_overdue: true
      }
    ],
    overdue_count: 1
  }
}
```

---

### 4. `GET /api/tasks/upcoming` - Upcoming Tasks

**Purpose:** Get tasks due in the next N days.

**File:** `src/routes/api/tasks/upcoming/+server.ts`

**Authentication:** Required (session-based)

#### Query Parameters

| Parameter | Type                      | Required | Description                       |
| --------- | ------------------------- | -------- | --------------------------------- |
| `days`    | `number`                  | No       | Number of days ahead (default: 7) |
| `status`  | `'todo' \| 'in_progress'` | No       | Filter by status                  |

#### Response: `ApiResponse<{ tasks: Task[], grouped_by_date: GroupedTasks }>`

```typescript
{
  success: true,
  data: {
    tasks: [...],
    grouped_by_date: {
      "2025-01-16": [
        {
          id: "uuid",
          title: "Review PR",
          due_date: "2025-01-16T17:00:00Z",
          priority: "high"
        }
      ],
      "2025-01-17": [
        {
          id: "uuid",
          title: "Team meeting",
          due_date: "2025-01-17T10:00:00Z",
          priority: "medium"
        }
      ]
    }
  }
}
```

---

## Task Operations

### 5. `GET /api/tasks/[id]` - Get Task Details

**Purpose:** Retrieve detailed information about a specific task.

**File:** `src/routes/api/tasks/[id]/+server.ts`

**Authentication:** Required (session-based, user must own task)

#### Response: `ApiResponse<{ task: TaskDetail }>`

```typescript
{
  success: true,
  data: {
    task: {
      id: "uuid",
      title: "Implement authentication",
      description: "Build OAuth login with Google",
      status: "in_progress",
      priority: "high",

      // Project context
      project: {
        id: "uuid",
        name: "BuildOS Platform"
      },
      phase: {
        id: "uuid",
        name: "Development"
      },

      // Time tracking
      estimated_duration: 240,
      actual_duration: 180,
      time_logs: [
        {
          started_at: "2025-01-15T10:00:00Z",
          ended_at: "2025-01-15T13:00:00Z",
          duration_minutes: 180
        }
      ],

      // Scheduling
      due_date: "2025-01-17T17:00:00Z",
      calendar_event_id: "google-event-id",

      // Dependencies
      dependencies: [
        {
          id: "uuid",
          title: "Design auth flow",
          status: "completed"
        }
      ],
      dependent_tasks: [
        {
          id: "uuid",
          title: "Add 2FA",
          status: "blocked"
        }
      ],

      // Metadata
      tags: ["backend", "security"],
      created_at: "2025-01-15T10:00:00Z",
      updated_at: "2025-01-15T14:30:00Z",
      completed_at: null
    }
  }
}
```

---

### 6. `PATCH /api/tasks/[id]` - Update Task

**Purpose:** Update task details.

**File:** `src/routes/api/tasks/[id]/+server.ts`

**Authentication:** Required (session-based, user must own task)

#### Request Body (All Optional)

```typescript
{
  title?: string;
  description?: string;
  status?: 'todo' | 'in_progress' | 'completed' | 'blocked';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  estimated_duration?: number;
  actual_duration?: number;
  due_date?: string | null;
  tags?: string[];
  project_id?: string | null;  // Move to project or remove from project
  phase_id?: string | null;
}
```

#### Response: `ApiResponse<{ task: Task }>`

---

### 7. `DELETE /api/tasks/[id]` - Delete Task

**Purpose:** Soft delete a task.

**File:** `src/routes/api/tasks/[id]/+server.ts`

**Authentication:** Required (session-based, user must own task)

#### Query Parameters

| Parameter     | Type      | Required | Description                         |
| ------------- | --------- | -------- | ----------------------------------- |
| `hard_delete` | `boolean` | No       | Permanently delete (default: false) |

#### Response: `ApiResponse<{ deleted: true }>`

```typescript
{
  success: true,
  data: { deleted: true },
  message: "Task deleted successfully"
}
```

#### Side Effects

- **Soft delete** (default): Sets `deleted_at` timestamp, can be restored
- **Hard delete**: Permanently removes task, cannot be undone
- Removes calendar event if scheduled
- Updates dependent tasks (may unblock them)

---

### 8. `POST /api/tasks/[id]/complete` - Complete Task

**Purpose:** Mark task as completed.

**File:** `src/routes/api/tasks/[id]/complete/+server.ts`

**Authentication:** Required (session-based, user must own task)

#### Request Body

```typescript
{
  actual_duration?: number;  // Actual time spent (minutes)
  notes?: string;            // Completion notes
}
```

#### Response: `ApiResponse<{ task: Task }>`

```typescript
{
  success: true,
  data: {
    task: {
      id: "uuid",
      title: "Implement authentication",
      status: "completed",
      completed_at: "2025-01-15T15:00:00Z",
      actual_duration: 240
    }
  },
  message: "Task completed!"
}
```

#### Side Effects

- Sets `status = 'completed'`
- Sets `completed_at` timestamp
- Updates `actual_duration` if provided
- May unblock dependent tasks
- Updates project completion statistics
- Triggers analytics event

---

### 9. `POST /api/tasks/[id]/reopen` - Reopen Task

**Purpose:** Reopen a completed task.

**File:** `src/routes/api/tasks/[id]/reopen/+server.ts`

**Authentication:** Required (session-based, user must own task)

#### Response: `ApiResponse<{ task: Task }>`

```typescript
{
  success: true,
  data: {
    task: {
      id: "uuid",
      status: "todo",
      completed_at: null
    }
  },
  message: "Task reopened"
}
```

---

## Task Scheduling

### 10. `POST /api/tasks/[id]/schedule` - Schedule Task

**Purpose:** Schedule task to calendar.

**File:** `src/routes/api/tasks/[id]/schedule/+server.ts`

**Authentication:** Required (session-based, user must own task)

#### Request Body

```typescript
{
  calendar_id: string;       // Google Calendar ID
  start_time: string;        // ISO 8601 datetime
  duration?: number;         // Minutes (uses estimated_duration if not provided)
  recurrence?: {             // For recurring tasks
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;
    end_date?: string;
  };
}
```

#### Response: `ApiResponse<{ task: Task, calendar_event: CalendarEvent }>`

```typescript
{
  success: true,
  data: {
    task: {
      id: "uuid",
      calendar_event_id: "google-event-id",
      due_date: "2025-01-16T14:00:00Z"
    },
    calendar_event: {
      id: "google-event-id",
      summary: "Review pull request",
      start: "2025-01-16T14:00:00Z",
      end: "2025-01-16T15:00:00Z",
      link: "https://calendar.google.com/..."
    }
  },
  message: "Task scheduled successfully"
}
```

---

### 11. `DELETE /api/tasks/[id]/schedule` - Unschedule Task

**Purpose:** Remove task from calendar.

**File:** `src/routes/api/tasks/[id]/schedule/+server.ts`

**Authentication:** Required (session-based, user must own task)

#### Response: `ApiResponse<{ unscheduled: true }>`

```typescript
{
  success: true,
  data: { unscheduled: true },
  message: "Task removed from calendar"
}
```

#### Side Effects

- Removes calendar event
- Clears `calendar_event_id` from task
- Keeps `due_date` if set

---

### 12. `POST /api/tasks/smart-schedule` - Smart Schedule Tasks

**Purpose:** Use AI to optimally schedule multiple tasks.

**File:** `src/routes/api/tasks/smart-schedule/+server.ts`

**Authentication:** Required (session-based)

#### Request Body

```typescript
{
  task_ids: string[];        // Tasks to schedule
  calendar_id: string;       // Target calendar
  start_date?: string;       // Start scheduling from this date
  working_hours?: {
    start: string;           // "09:00"
    end: string;             // "17:00"
    timezone: string;
  };
  preferences?: {
    respect_priorities: boolean;  // Schedule high priority first
    avoid_context_switching: boolean;  // Group similar tasks
    prefer_morning?: boolean;     // Schedule harder tasks in morning
  };
}
```

#### Response: `ApiResponse<{ scheduled_tasks: Task[], calendar_events: CalendarEvent[] }>`

```typescript
{
  success: true,
  data: {
    scheduled_tasks: [
      {
        id: "uuid",
        title: "Implement auth",
        calendar_event_id: "event-1",
        due_date: "2025-01-16T10:00:00Z"
      },
      {
        id: "uuid",
        title: "Write tests",
        calendar_event_id: "event-2",
        due_date: "2025-01-16T14:00:00Z"
      }
    ],
    calendar_events: [...]
  },
  message: "Successfully scheduled 5 tasks"
}
```

#### AI Scheduling Features

- **Priority-based**: High priority tasks scheduled earlier
- **Calendar analysis**: Schedules around existing commitments
- **Energy optimization**: Harder tasks during peak productivity hours
- **Context grouping**: Similar tasks scheduled together
- **Realistic timing**: Considers task estimates and break time

---

## Task Tags & Labels

### 13. `GET /api/tasks/tags` - List All Tags

**Purpose:** Get all tags used by current user.

**File:** `src/routes/api/tasks/tags/+server.ts`

**Authentication:** Required (session-based)

#### Response: `ApiResponse<{ tags: Tag[] }>`

```typescript
{
  success: true,
  data: {
    tags: [
      {
        name: "urgent",
        count: 12,
        color: "#FF0000"
      },
      {
        name: "backend",
        count: 25,
        color: "#0000FF"
      },
      {
        name: "code-review",
        count: 8,
        color: "#00FF00"
      }
    ]
  }
}
```

---

### 14. `POST /api/tasks/[id]/tags` - Add Tags to Task

**Purpose:** Add tags to a task.

**File:** `src/routes/api/tasks/[id]/tags/+server.ts`

**Authentication:** Required (session-based, user must own task)

#### Request Body

```typescript
{
  tags: string[];  // Tags to add
}
```

#### Response: `ApiResponse<{ task: Task }>`

```typescript
{
  success: true,
  data: {
    task: {
      id: "uuid",
      tags: ["urgent", "backend", "security"]
    }
  }
}
```

---

### 15. `DELETE /api/tasks/[id]/tags/[tag]` - Remove Tag

**Purpose:** Remove a tag from task.

**File:** `src/routes/api/tasks/[id]/tags/[tag]/+server.ts`

**Authentication:** Required (session-based, user must own task)

#### Response: `ApiResponse<{ task: Task }>`

---

## Task Comments & Activity

### 16. `GET /api/tasks/[id]/comments` - Get Comments

**Purpose:** Retrieve comments on a task.

**File:** `src/routes/api/tasks/[id]/comments/+server.ts`

**Authentication:** Required (session-based, user must own task)

#### Response: `ApiResponse<{ comments: Comment[] }>`

```typescript
{
  success: true,
  data: {
    comments: [
      {
        id: "uuid",
        task_id: "uuid",
        user_id: "uuid",
        user_name: "John Doe",
        content: "This is blocked by the API design",
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z"
      }
    ]
  }
}
```

---

### 17. `POST /api/tasks/[id]/comments` - Add Comment

**Purpose:** Add a comment to a task.

**File:** `src/routes/api/tasks/[id]/comments/+server.ts`

**Authentication:** Required (session-based, user must own task)

#### Request Body

```typescript
{
	content: string; // Required, max 2000 chars
}
```

#### Response: `ApiResponse<{ comment: Comment }>`

```typescript
{
  success: true,
  data: {
    comment: {
      id: "uuid",
      content: "Started working on this",
      created_at: "2025-01-15T10:00:00Z"
    }
  }
}
```

---

### 18. `GET /api/tasks/[id]/activity` - Get Activity Log

**Purpose:** Get complete activity history for a task.

**File:** `src/routes/api/tasks/[id]/activity/+server.ts`

**Authentication:** Required (session-based, user must own task)

#### Response: `ApiResponse<{ activity: Activity[] }>`

```typescript
{
  success: true,
  data: {
    activity: [
      {
        id: "uuid",
        type: "created",
        description: "Task created",
        user_name: "John Doe",
        timestamp: "2025-01-15T10:00:00Z"
      },
      {
        id: "uuid",
        type: "status_changed",
        description: "Status changed from 'todo' to 'in_progress'",
        user_name: "John Doe",
        metadata: {
          old_value: "todo",
          new_value: "in_progress"
        },
        timestamp: "2025-01-15T11:00:00Z"
      },
      {
        id: "uuid",
        type: "comment_added",
        description: "Comment added",
        user_name: "John Doe",
        timestamp: "2025-01-15T12:00:00Z"
      }
    ]
  }
}
```

---

## Task Dependencies

### 19. `POST /api/tasks/[id]/dependencies` - Add Dependency

**Purpose:** Add a task dependency.

**File:** `src/routes/api/tasks/[id]/dependencies/+server.ts`

**Authentication:** Required (session-based, user must own both tasks)

#### Request Body

```typescript
{
	depends_on_task_id: string; // Task that must be completed first
}
```

#### Response: `ApiResponse<{ task: Task }>`

```typescript
{
  success: true,
  data: {
    task: {
      id: "uuid",
      dependencies: [
        {
          id: "uuid",
          title: "Design auth flow",
          status: "completed"
        }
      ]
    }
  }
}
```

#### Validation

- Circular dependencies not allowed
- Both tasks must belong to same user
- Dependency graph must be acyclic (DAG)

---

### 20. `DELETE /api/tasks/[id]/dependencies/[dependencyId]` - Remove Dependency

**Purpose:** Remove a task dependency.

**File:** `src/routes/api/tasks/[id]/dependencies/[dependencyId]/+server.ts`

**Authentication:** Required (session-based, user must own task)

#### Response: `ApiResponse<{ removed: true }>`

```typescript
{
  success: true,
  data: { removed: true },
  message: "Dependency removed"
}
```

---

### 21. `GET /api/tasks/[id]/blockers` - Get Blocking Tasks

**Purpose:** Get tasks that are blocking this task.

**File:** `src/routes/api/tasks/[id]/blockers/+server.ts`

**Authentication:** Required (session-based, user must own task)

#### Response: `ApiResponse<{ blockers: Task[] }>`

```typescript
{
  success: true,
  data: {
    blockers: [
      {
        id: "uuid",
        title: "Design auth flow",
        status: "in_progress",
        priority: "high",
        due_date: "2025-01-16T17:00:00Z"
      }
    ]
  }
}
```

---

## Common Patterns

### Task Filtering

All list endpoints support advanced filtering:

```typescript
// Get high priority tasks due this week
GET /api/tasks?priority=high&due_after=2025-01-15&due_before=2025-01-21

// Get blocked tasks
GET /api/tasks?status=blocked

// Get tasks with specific tags
GET /api/tasks?tags=urgent,backend
```

### Batch Operations

Use batch endpoints from Projects API for bulk operations on tasks.

---

## Database Schema

See `/api/projects` documentation for complete task schema. Key fields:

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID,           -- Nullable for personal tasks
  phase_id UUID,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'todo',
  priority VARCHAR(20) DEFAULT 'medium',
  estimated_duration INTEGER,
  actual_duration INTEGER,
  due_date TIMESTAMP WITH TIME ZONE,
  calendar_event_id VARCHAR(255),
  tags TEXT[],               -- Array of tags
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_rule TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE
);
```

---

**Last Updated:** 2025-01-15

**Version:** 1.0.0
