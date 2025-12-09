<!-- apps/web/docs/technical/api/endpoints/projects.md -->

# Projects API

**Base Path:** `/api/projects`

The Projects API provides comprehensive project management functionality, including CRUD operations, phase generation, task management, calendar integration, and AI-powered project synthesis. Projects are the core organizational unit in BuildOS, containing phases and tasks.

---

## Table of Contents

1. [Core Project Operations](#core-project-operations)
2. [Phase Management](#phase-management)
3. [Task Management](#task-management)
4. [Project Calendar Integration](#project-calendar-integration)
5. [Project Synthesis & Analysis](#project-synthesis--analysis)
6. [Project Notes & Context](#project-notes--context)
7. [Project Statistics & Analytics](#project-statistics--analytics)
8. [Database Schema](#database-schema)
9. [Service Layer Dependencies](#service-layer-dependencies)

---

## Core Project Operations

### 1. `GET /api/projects` - List Projects

**Purpose:** Retrieve all projects for the authenticated user with optional filtering.

**File:** `src/routes/api/projects/+server.ts`

**Authentication:** Required (session-based)

#### Query Parameters

| Parameter          | Type                                                  | Required | Description                                |
| ------------------ | ----------------------------------------------------- | -------- | ------------------------------------------ |
| `status`           | `'planning' \| 'active' \| 'completed' \| 'archived'` | No       | Filter by project status                   |
| `include_archived` | `boolean`                                             | No       | Include archived projects (default: false) |
| `sort`             | `'name' \| 'created_at' \| 'updated_at' \| 'status'`  | No       | Sort field (default: 'updated_at')         |
| `order`            | `'asc' \| 'desc'`                                     | No       | Sort order (default: 'desc')               |

#### Response: `ApiResponse<{ projects: Project[] }>`

```typescript
{
  success: true,
  data: {
    projects: [
      {
        id: "uuid",
        name: "Project Name",
        description: "Project description",
        status: "active",
        context: "Rich context from brain dumps",
        user_id: "uuid",
        calendar_id: "google-calendar-id",
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
        deleted_at: null,
        phases: [...],
        tasks: [...],
        _count: {
          phases: 3,
          tasks: 15,
          completedTasks: 8
        }
      }
    ]
  }
}
```

#### Key Features

- **RLS-enforced**: Only returns projects owned by authenticated user
- **Soft delete aware**: Excludes deleted projects unless explicitly requested
- **Eager loading**: Includes phases, tasks, and counts by default
- **Optimized queries**: Uses batch loading to prevent N+1 queries

#### Database Operations

```sql
SELECT p.*,
       COUNT(DISTINCT ph.id) as phase_count,
       COUNT(DISTINCT t.id) as task_count,
       COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_task_count
FROM projects p
LEFT JOIN phases ph ON ph.project_id = p.id AND ph.deleted_at IS NULL
LEFT JOIN tasks t ON t.project_id = p.id AND t.deleted_at IS NULL
WHERE p.user_id = $1
  AND p.deleted_at IS NULL
  AND ($2::text IS NULL OR p.status = $2)
GROUP BY p.id
ORDER BY p.updated_at DESC;
```

---

### 2. `GET /api/projects/[id]` - Get Project Details

**Purpose:** Retrieve detailed information about a specific project.

**File:** `src/routes/api/projects/[id]/+server.ts`

**Authentication:** Required (session-based)

#### URL Parameters

| Parameter | Type            | Required | Description |
| --------- | --------------- | -------- | ----------- |
| `id`      | `string (uuid)` | Yes      | Project ID  |

#### Query Parameters

| Parameter         | Type      | Required | Description                                |
| ----------------- | --------- | -------- | ------------------------------------------ |
| `include_tasks`   | `boolean` | No       | Include all tasks (default: true)          |
| `include_phases`  | `boolean` | No       | Include all phases (default: true)         |
| `include_context` | `boolean` | No       | Include brain dump context (default: true) |

#### Response: `ApiResponse<{ project: Project }>`

```typescript
{
  success: true,
  data: {
    project: {
      id: "uuid",
      name: "Project Name",
      description: "Detailed description",
      status: "active",
      context: "Comprehensive context with history",
      user_id: "uuid",
      calendar_id: "google-calendar-id",
      created_at: "2025-01-15T10:00:00Z",
      updated_at: "2025-01-15T10:00:00Z",
      deleted_at: null,
      phases: [
        {
          id: "uuid",
          name: "Phase 1: Planning",
          description: "Initial planning phase",
          order: 0,
          project_id: "uuid",
          target_date: "2025-01-20T00:00:00Z",
          tasks: [...]
        }
      ],
      tasks: [...],
      brain_dumps: [...],
      statistics: {
        totalTasks: 15,
        completedTasks: 8,
        progress: 0.53,
        estimatedCompletion: "2025-02-01T00:00:00Z"
      }
    }
  }
}
```

#### Error Handling

- `404 Not Found`: Project doesn't exist or user doesn't have access
- `403 Forbidden`: User doesn't own the project (RLS enforcement)

---

### 3. `POST /api/projects` - Create Project

**Purpose:** Create a new project manually (not via brain dump).

**File:** `src/routes/api/projects/+server.ts`

**Authentication:** Required (session-based)

#### Request Body

```typescript
{
  name: string;              // Required, 1-200 chars
  description?: string;      // Optional, max 2000 chars
  status?: 'planning' | 'active' | 'completed';  // Default: 'planning'
  context?: string;          // Optional context/notes
  calendar_id?: string;      // Optional Google Calendar ID
  phases?: {
    name: string;
    description?: string;
    target_date?: string;    // ISO 8601 date
    tasks?: {
      title: string;
      description?: string;
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      estimated_duration?: number;  // minutes
    }[];
  }[];
}
```

#### Response: `ApiResponse<{ project: Project }>`

```typescript
{
  success: true,
  data: {
    project: {
      id: "uuid",
      name: "New Project",
      description: "Description",
      status: "planning",
      context: "",
      user_id: "uuid",
      calendar_id: null,
      created_at: "2025-01-15T10:00:00Z",
      updated_at: "2025-01-15T10:00:00Z",
      deleted_at: null,
      phases: [],
      tasks: []
    }
  },
  message: "Project created successfully"
}
```

#### Validation

- **Name**: Required, 1-200 characters
- **Description**: Max 2000 characters
- **Status**: Must be valid enum value
- **Calendar ID**: Must be valid Google Calendar ID if provided
- **Phases**: If provided, each phase must have valid name and order

#### Database Operations

1. Insert project record with user_id from session
2. If phases provided, batch insert phase records
3. If tasks provided, batch insert task records with phase associations
4. Return complete project with all associations

---

### 4. `PATCH /api/projects/[id]` - Update Project

**Purpose:** Update project details, status, or metadata.

**File:** `src/routes/api/projects/[id]/+server.ts`

**Authentication:** Required (session-based)

#### URL Parameters

| Parameter | Type            | Required | Description |
| --------- | --------------- | -------- | ----------- |
| `id`      | `string (uuid)` | Yes      | Project ID  |

#### Request Body (All Optional)

```typescript
{
  name?: string;             // 1-200 chars
  description?: string;      // Max 2000 chars
  status?: 'planning' | 'active' | 'completed' | 'archived';
  context?: string;          // Update context/notes
  calendar_id?: string | null;  // Update or remove calendar
}
```

#### Response: `ApiResponse<{ project: Project }>`

```typescript
{
  success: true,
  data: {
    project: {
      id: "uuid",
      name: "Updated Name",
      // ... updated fields
      updated_at: "2025-01-15T11:00:00Z"
    }
  },
  message: "Project updated successfully"
}
```

#### Side Effects

- Updates `updated_at` timestamp automatically
- If status changed to 'completed', may trigger completion analytics
- If calendar_id changed, may trigger calendar sync
- Triggers real-time update event to subscribers

#### Error Handling

- `404 Not Found`: Project doesn't exist
- `403 Forbidden`: User doesn't own the project
- `400 Bad Request`: Invalid field values

---

### 5. `DELETE /api/projects/[id]` - Delete Project

**Purpose:** Soft delete a project and all associated data.

**File:** `src/routes/api/projects/[id]/+server.ts`

**Authentication:** Required (session-based)

#### URL Parameters

| Parameter | Type            | Required | Description |
| --------- | --------------- | -------- | ----------- |
| `id`      | `string (uuid)` | Yes      | Project ID  |

#### Query Parameters

| Parameter     | Type      | Required | Description                         |
| ------------- | --------- | -------- | ----------------------------------- |
| `hard_delete` | `boolean` | No       | Permanently delete (default: false) |

#### Response: `ApiResponse<{ deleted: true }>`

```typescript
{
  success: true,
  data: { deleted: true },
  message: "Project deleted successfully"
}
```

#### Side Effects

- **Soft Delete** (default):
    - Sets `deleted_at` timestamp on project
    - Cascades soft delete to all phases and tasks
    - Removes from calendar if `calendar_id` exists
    - Preserves data for potential recovery

- **Hard Delete** (`hard_delete=true`):
    - Permanently removes project record
    - Cascades to phases, tasks, brain_dumps associations
    - Removes all calendar events
    - Cannot be recovered

#### Database Operations

```sql
-- Soft delete
UPDATE projects
SET deleted_at = NOW()
WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL;

UPDATE phases
SET deleted_at = NOW()
WHERE project_id = $1 AND deleted_at IS NULL;

UPDATE tasks
SET deleted_at = NOW()
WHERE project_id = $1 AND deleted_at IS NULL;

-- Hard delete (cascades via foreign keys)
DELETE FROM projects
WHERE id = $1 AND user_id = $2;
```

---

### 6. `POST /api/projects/[id]/restore` - Restore Deleted Project

**Purpose:** Restore a soft-deleted project.

**File:** `src/routes/api/projects/[id]/restore/+server.ts`

**Authentication:** Required (session-based)

#### URL Parameters

| Parameter | Type            | Required | Description |
| --------- | --------------- | -------- | ----------- |
| `id`      | `string (uuid)` | Yes      | Project ID  |

#### Request Body

```typescript
{
  restore_tasks?: boolean;    // Restore all tasks (default: true)
  restore_phases?: boolean;   // Restore all phases (default: true)
}
```

#### Response: `ApiResponse<{ project: Project }>`

```typescript
{
  success: true,
  data: {
    project: {
      id: "uuid",
      name: "Restored Project",
      deleted_at: null,  // Cleared
      // ... other fields
    }
  },
  message: "Project restored successfully"
}
```

#### Database Operations

```sql
UPDATE projects
SET deleted_at = NULL
WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL;

-- If restore_phases = true
UPDATE phases
SET deleted_at = NULL
WHERE project_id = $1 AND deleted_at IS NOT NULL;

-- If restore_tasks = true
UPDATE tasks
SET deleted_at = NULL
WHERE project_id = $1 AND deleted_at IS NOT NULL;
```

---

## Phase Management

### 7. `GET /api/projects/[id]/phases` - List Phases

**Purpose:** Retrieve all phases for a project.

**File:** `src/routes/api/projects/[id]/phases/+server.ts`

**Authentication:** Required (session-based)

#### URL Parameters

| Parameter | Type            | Required | Description |
| --------- | --------------- | -------- | ----------- |
| `id`      | `string (uuid)` | Yes      | Project ID  |

#### Query Parameters

| Parameter       | Type                                       | Required | Description                                 |
| --------------- | ------------------------------------------ | -------- | ------------------------------------------- |
| `include_tasks` | `boolean`                                  | No       | Include tasks in each phase (default: true) |
| `order_by`      | `'order' \| 'target_date' \| 'created_at'` | No       | Sort field (default: 'order')               |

#### Response: `ApiResponse<{ phases: Phase[] }>`

```typescript
{
  success: true,
  data: {
    phases: [
      {
        id: "uuid",
        name: "Phase 1: Planning",
        description: "Initial planning and research",
        order: 0,
        project_id: "uuid",
        target_date: "2025-01-20T00:00:00Z",
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
        deleted_at: null,
        tasks: [
          {
            id: "uuid",
            title: "Research competitors",
            status: "todo",
            // ... task fields
          }
        ],
        _count: {
          tasks: 5,
          completedTasks: 2
        }
      }
    ]
  }
}
```

---

### 8. `POST /api/projects/[id]/phases/generate` - Generate Phases

**Purpose:** Use AI to generate project phases and tasks from project context.

**File:** `src/routes/api/projects/[id]/phases/generate/+server.ts`

**Authentication:** Required (session-based)

#### URL Parameters

| Parameter | Type            | Required | Description |
| --------- | --------------- | -------- | ----------- |
| `id`      | `string (uuid)` | Yes      | Project ID  |

#### Request Body

```typescript
{
  strategy?: 'phases-only' | 'schedule-in-phases' | 'calendar-optimized';  // Default: 'phases-only'
  additional_context?: string;  // Extra context for AI
  options?: {
    max_phases?: number;        // Max number of phases (default: 5)
    include_scheduling?: boolean;  // Schedule to calendar (default: false)
    calendar_id?: string;       // Calendar for scheduling
    start_date?: string;        // ISO date for scheduling start
    working_hours?: {
      start: string;  // "09:00"
      end: string;    // "17:00"
      timezone: string;
    };
  };
}
```

#### Response: `ApiResponse<{ phases: Phase[], tasks: Task[] }>`

```typescript
{
  success: true,
  data: {
    phases: [
      {
        id: "uuid",
        name: "Phase 1: Planning & Research",
        description: "Gather requirements and research solutions",
        order: 0,
        project_id: "uuid",
        target_date: "2025-01-25T00:00:00Z",
        tasks: [...]
      },
      {
        id: "uuid",
        name: "Phase 2: Development",
        description: "Build core features",
        order: 1,
        project_id: "uuid",
        target_date: "2025-02-15T00:00:00Z",
        tasks: [...]
      }
    ],
    tasks: [
      // All generated tasks across all phases
    ]
  },
  message: "Generated 3 phases with 12 tasks"
}
```

#### Generation Strategies

##### 1. `phases-only` (Default)

- Generates logical phases and tasks
- No calendar integration
- No time constraints
- Good for planning-stage projects

##### 2. `schedule-in-phases`

- Generates phases with target dates
- Schedules tasks within phase timeframes
- Requires `calendar_id` and `start_date`
- Considers task dependencies

##### 3. `calendar-optimized`

- Advanced calendar-aware generation
- Analyzes existing calendar commitments
- Schedules around busy times
- Optimizes for productivity patterns
- Requires Google Calendar access

#### AI Processing

1. **Context Analysis**: Reviews project name, description, context, and existing brain dumps
2. **Phase Extraction**: Identifies logical project phases
3. **Task Generation**: Creates specific, actionable tasks for each phase
4. **Dependency Detection**: Identifies task dependencies
5. **Time Estimation**: Estimates duration for each task
6. **Calendar Integration** (if enabled): Schedules tasks on calendar

#### Service Dependencies

- `PhaseGenerationOrchestrator` - Coordinates generation process
- `PhaseGenerationStrategy` - Strategy pattern for different modes
- `CalendarService` - For calendar-optimized scheduling
- `PromptTemplateService` - Manages AI prompts

#### Error Handling

- `400 Bad Request`: Invalid strategy or missing required options
- `402 Payment Required`: User doesn't have AI generation credits
- `429 Too Many Requests`: Rate limit exceeded
- `503 Service Unavailable`: OpenAI API error

---

### 9. `POST /api/projects/[id]/phases/preview` - Preview Phase Generation

**Purpose:** Preview AI-generated phases without saving to database.

**File:** `src/routes/api/projects/[id]/phases/preview/+server.ts`

**Authentication:** Required (session-based)

#### Request Body

Same as `/phases/generate` endpoint.

#### Response: `ApiResponse<{ preview: { phases: Phase[], tasks: Task[] } }>`

```typescript
{
  success: true,
  data: {
    preview: {
      phases: [
        {
          name: "Phase 1: Planning",
          description: "...",
          order: 0,
          target_date: "2025-01-25T00:00:00Z",
          tasks: [
            {
              title: "Define requirements",
              description: "...",
              priority: "high",
              estimated_duration: 120
            }
          ]
        }
      ],
      tasks: [...],  // Flattened task list
      metadata: {
        total_phases: 3,
        total_tasks: 12,
        estimated_project_duration: 2880,  // minutes
        estimated_completion: "2025-02-28T00:00:00Z"
      }
    }
  }
}
```

#### Key Features

- **No database modifications**: Pure preview, no side effects
- **Same AI generation**: Uses same algorithms as actual generation
- **Cost-efficient**: Useful for testing different strategies
- **User feedback**: Allows users to review before committing

---

### 10. `POST /api/projects/[id]/phases/batch` - Batch Phase Operations

**Purpose:** Perform bulk operations on multiple phases.

**File:** `src/routes/api/projects/[id]/phases/batch/+server.ts`

**Authentication:** Required (session-based)

#### Request Body

```typescript
{
  operation: 'create' | 'update' | 'delete' | 'reorder';
  phases: {
    id?: string;  // Required for update/delete
    name?: string;
    description?: string;
    order?: number;
    target_date?: string;
  }[];
}
```

#### Response: `ApiResponse<{ phases: Phase[] }>`

```typescript
{
  success: true,
  data: {
    phases: [...]  // All affected phases
  },
  message: "Batch operation completed successfully"
}
```

#### Supported Operations

##### `create`

- Batch create multiple phases
- Automatically assigns order if not provided
- Validates all phases before inserting

##### `update`

- Update multiple phases at once
- Requires `id` for each phase
- Only updates provided fields

##### `delete`

- Soft delete multiple phases
- Cascades to tasks in those phases
- Requires `id` for each phase

##### `reorder`

- Update order of multiple phases
- Requires `id` and `order` for each phase
- Ensures no duplicate orders

---

## Task Management

### 11. `GET /api/projects/[id]/tasks` - List Tasks

**Purpose:** Retrieve all tasks for a project with filtering and sorting.

**File:** `src/routes/api/projects/[id]/tasks/+server.ts`

**Authentication:** Required (session-based)

#### URL Parameters

| Parameter | Type            | Required | Description |
| --------- | --------------- | -------- | ----------- |
| `id`      | `string (uuid)` | Yes      | Project ID  |

#### Query Parameters

| Parameter            | Type                                                  | Required | Description                               |
| -------------------- | ----------------------------------------------------- | -------- | ----------------------------------------- |
| `phase_id`           | `string (uuid)`                                       | No       | Filter by phase                           |
| `status`             | `'todo' \| 'in_progress' \| 'completed' \| 'blocked'` | No       | Filter by status                          |
| `priority`           | `'low' \| 'medium' \| 'high' \| 'urgent'`             | No       | Filter by priority                        |
| `has_calendar_event` | `boolean`                                             | No       | Filter tasks with/without calendar events |
| `due_before`         | `string (ISO date)`                                   | No       | Tasks due before date                     |
| `due_after`          | `string (ISO date)`                                   | No       | Tasks due after date                      |
| `sort_by`            | `'order' \| 'priority' \| 'due_date' \| 'created_at'` | No       | Sort field                                |
| `order`              | `'asc' \| 'desc'`                                     | No       | Sort order                                |
| `limit`              | `number`                                              | No       | Max results (default: 100)                |
| `offset`             | `number`                                              | No       | Pagination offset                         |

#### Response: `ApiResponse<{ tasks: Task[], total: number }>`

```typescript
{
  success: true,
  data: {
    tasks: [
      {
        id: "uuid",
        title: "Implement login system",
        description: "Build authentication with OAuth",
        status: "in_progress",
        priority: "high",
        project_id: "uuid",
        phase_id: "uuid",
        user_id: "uuid",
        order: 0,
        estimated_duration: 240,  // minutes
        actual_duration: null,
        due_date: "2025-01-20T17:00:00Z",
        calendar_event_id: "google-event-id",
        recurrence_rule: null,
        is_recurring: false,
        parent_task_id: null,
        dependencies: [],
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-16T14:30:00Z",
        completed_at: null,
        deleted_at: null
      }
    ],
    total: 15
  }
}
```

---

### 12. `POST /api/projects/[id]/tasks` - Create Task

**Purpose:** Create a new task in the project.

**File:** `src/routes/api/projects/[id]/tasks/+server.ts`

**Authentication:** Required (session-based)

#### Request Body

```typescript
{
  title: string;                    // Required, 1-500 chars
  description?: string;             // Optional, max 5000 chars
  phase_id?: string;                // Optional phase assignment
  priority?: 'low' | 'medium' | 'high' | 'urgent';  // Default: 'medium'
  estimated_duration?: number;      // Minutes
  due_date?: string;                // ISO 8601 date
  order?: number;                   // Task order in phase
  parent_task_id?: string;          // For subtasks
  dependencies?: string[];          // Array of task IDs
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;
    end_date?: string;
  };
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
      title: "New Task",
      status: "todo",
      // ... other fields
      created_at: "2025-01-15T10:00:00Z"
    }
  },
  message: "Task created successfully"
}
```

#### Side Effects

- If `calendar_options.schedule = true`, creates calendar event
- If `recurrence` provided, creates recurring task pattern
- If `dependencies` provided, validates dependency DAG (no cycles)
- Updates project's `updated_at` timestamp

---

### 13. `PATCH /api/projects/[id]/tasks/[taskId]` - Update Task

**Purpose:** Update task details, status, or metadata.

**File:** `src/routes/api/projects/[id]/tasks/[taskId]/+server.ts`

**Authentication:** Required (session-based)

#### Request Body (All Optional)

```typescript
{
  title?: string;
  description?: string;
  status?: 'todo' | 'in_progress' | 'completed' | 'blocked';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  phase_id?: string;              // Move to different phase
  estimated_duration?: number;
  actual_duration?: number;       // Track actual time spent
  due_date?: string | null;
  order?: number;
  dependencies?: string[];        // Update dependency list
}
```

#### Response: `ApiResponse<{ task: Task }>`

#### Side Effects

- If `status` changed to `completed`:
    - Sets `completed_at` timestamp
    - Updates project completion statistics
    - May trigger calendar event update
    - May unblock dependent tasks

- If `phase_id` changed:
    - Validates new phase belongs to same project
    - Reorders tasks in old and new phases
    - Updates calendar events if scheduled

- If `dependencies` changed:
    - Validates no circular dependencies
    - May block/unblock task based on dependency status

---

### 14. `POST /api/projects/[id]/tasks/batch` - Batch Task Operations

**Purpose:** Perform bulk operations on multiple tasks.

**File:** `src/routes/api/projects/[id]/tasks/batch/+server.ts`

**Authentication:** Required (session-based)

#### Request Body

```typescript
{
  operation: 'create' | 'update' | 'delete' | 'move' | 'complete' | 'schedule';
  tasks: {
    id?: string;                // Required for update/delete/move/complete
    phase_id?: string;          // For create/move
    // ... other fields based on operation
  }[];
  options?: {
    update_calendar?: boolean;  // Sync changes to calendar
    notify?: boolean;           // Send notifications for changes
  };
}
```

#### Response: `ApiResponse<{ tasks: Task[], summary: BatchSummary }>`

```typescript
{
  success: true,
  data: {
    tasks: [...],  // All affected tasks
    summary: {
      total: 10,
      successful: 9,
      failed: 1,
      errors: [
        {
          task_id: "uuid",
          error: "Circular dependency detected"
        }
      ]
    }
  },
  message: "Batch operation completed: 9/10 successful"
}
```

#### Supported Operations

##### `create`

- Batch create multiple tasks
- Validates all before inserting
- Atomic operation (all or nothing)

##### `update`

- Update multiple tasks at once
- Partial updates supported
- Continues on individual failures

##### `delete`

- Soft delete multiple tasks
- Checks dependencies before deleting
- May fail if task is a dependency

##### `move`

- Move tasks to different phase
- Reorders tasks in source and destination
- Updates calendar events if scheduled

##### `complete`

- Mark multiple tasks as completed
- Sets `completed_at` timestamp
- Updates project statistics
- Checks dependencies before allowing completion

##### `schedule`

- Schedule multiple tasks to calendar
- Requires calendar access
- Optimizes scheduling based on availability

---

### 15. `POST /api/projects/[id]/tasks/recurring` - Create Recurring Tasks

**Purpose:** Create a recurring task pattern.

**File:** `src/routes/api/projects/[id]/tasks/recurring/+server.ts`

**Authentication:** Required (session-based)

#### Request Body

```typescript
{
  title: string;
  description?: string;
  phase_id?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  estimated_duration?: number;
  recurrence: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;              // Every N days/weeks/months
    day_of_week?: number;          // 0-6 for weekly (0 = Sunday)
    day_of_month?: number;         // 1-31 for monthly
    start_date: string;            // ISO date
    end_date?: string;             // Optional end date
    max_occurrences?: number;      // Max number of instances
  };
  calendar_options?: {
    schedule: boolean;
    calendar_id?: string;
    time_of_day?: string;          // "14:00"
  };
}
```

#### Response: `ApiResponse<{ parent_task: Task, instances: Task[] }>`

```typescript
{
  success: true,
  data: {
    parent_task: {
      id: "uuid",
      title: "Daily standup",
      is_recurring: true,
      recurrence_rule: "FREQ=DAILY;INTERVAL=1",
      // ... other fields
    },
    instances: [
      {
        id: "uuid",
        parent_task_id: "uuid",  // Links to parent
        due_date: "2025-01-16T14:00:00Z",
        status: "todo"
      },
      {
        id: "uuid",
        parent_task_id: "uuid",
        due_date: "2025-01-17T14:00:00Z",
        status: "todo"
      }
      // ... more instances based on recurrence pattern
    ]
  },
  message: "Created recurring task with 30 instances"
}
```

#### Recurrence Patterns

##### Daily

```typescript
{
  frequency: 'daily',
  interval: 1,           // Every day
  start_date: '2025-01-15',
  end_date: '2025-02-15'
}
// Creates task every day for 31 days
```

##### Weekly

```typescript
{
  frequency: 'weekly',
  interval: 2,           // Every 2 weeks
  day_of_week: 1,        // Monday
  start_date: '2025-01-15',
  max_occurrences: 10
}
// Creates 10 tasks on Mondays, every other week
```

##### Monthly

```typescript
{
  frequency: 'monthly',
  interval: 1,           // Every month
  day_of_month: 15,      // 15th of month
  start_date: '2025-01-15',
  end_date: '2025-12-15'
}
// Creates task on 15th of each month for 12 months
```

#### Side Effects

- Creates parent task with `is_recurring = true`
- Generates instance tasks based on pattern
- If `calendar_options.schedule = true`, creates calendar events for all instances
- Uses RFC 5545 (iCalendar) recurrence format

---

### 16. `GET /api/projects/[id]/tasks/calendar-sync` - Sync Tasks with Calendar

**Purpose:** Synchronize project tasks with Google Calendar.

**File:** `src/routes/api/projects/[id]/tasks/calendar-sync/+server.ts`

**Authentication:** Required (session-based)

#### Query Parameters

| Parameter     | Type                                  | Required | Description                                          |
| ------------- | ------------------------------------- | -------- | ---------------------------------------------------- |
| `calendar_id` | `string`                              | No       | Specific calendar (uses project calendar by default) |
| `sync_mode`   | `'push' \| 'pull' \| 'bidirectional'` | No       | Sync direction (default: 'bidirectional')            |

#### Response: `ApiResponse<{ sync_result: SyncResult }>`

```typescript
{
  success: true,
  data: {
    sync_result: {
      tasks_pushed: 5,      // Tasks synced to calendar
      tasks_pulled: 2,      // Calendar events synced to tasks
      tasks_updated: 3,     // Existing syncs updated
      conflicts: [],        // No conflicts
      summary: "Synced 10 tasks successfully"
    }
  }
}
```

#### Sync Modes

##### `push` (One-way: Tasks → Calendar)

- Creates calendar events for unscheduled tasks
- Updates existing calendar events from task changes
- Does not import calendar events as tasks

##### `pull` (One-way: Calendar → Tasks)

- Creates tasks from calendar events
- Updates task details from calendar changes
- Does not push task changes to calendar

##### `bidirectional` (Default)

- Two-way sync between tasks and calendar
- Resolves conflicts using latest timestamp
- Reports conflicts for manual resolution

#### Conflict Resolution

When both task and calendar event modified:

```typescript
{
	conflicts: [
		{
			task_id: 'uuid',
			calendar_event_id: 'event-id',
			field: 'due_date',
			task_value: '2025-01-20T14:00:00Z',
			calendar_value: '2025-01-21T14:00:00Z',
			resolution: 'calendar_wins', // Based on latest modification
			applied_value: '2025-01-21T14:00:00Z'
		}
	];
}
```

---

## Project Calendar Integration

### 17. `POST /api/projects/[id]/calendar/connect` - Connect Calendar

**Purpose:** Connect a Google Calendar to the project.

**File:** `src/routes/api/projects/[id]/calendar/connect/+server.ts`

**Authentication:** Required (session-based)

#### Request Body

```typescript
{
  calendar_id?: string;  // Optional, creates new calendar if not provided
  calendar_name?: string;  // Name for new calendar (default: project name)
  auto_sync?: boolean;   // Enable automatic sync (default: true)
}
```

#### Response: `ApiResponse<{ project: Project, calendar: Calendar }>`

```typescript
{
  success: true,
  data: {
    project: {
      id: "uuid",
      calendar_id: "new-calendar-id",
      // ... other fields
    },
    calendar: {
      id: "new-calendar-id",
      name: "Project: BuildOS Platform",
      description: "Tasks and events for BuildOS Platform project",
      timezone: "America/New_York"
    }
  },
  message: "Calendar connected successfully"
}
```

#### Operations

1. **If `calendar_id` provided:**
    - Validates user has access to calendar
    - Updates project with `calendar_id`
    - Enables sync webhook

2. **If `calendar_id` not provided:**
    - Creates new Google Calendar
    - Names it based on project name
    - Sets up sync webhook
    - Updates project with new `calendar_id`

#### Side Effects

- Sets up Google Calendar webhook for real-time sync
- Triggers initial sync of existing tasks to calendar
- Enables automatic task-calendar sync for project

---

### 18. `DELETE /api/projects/[id]/calendar/disconnect` - Disconnect Calendar

**Purpose:** Disconnect Google Calendar from project.

**File:** `src/routes/api/projects/[id]/calendar/disconnect/+server.ts`

**Authentication:** Required (session-based)

#### Query Parameters

| Parameter         | Type      | Required | Description                                 |
| ----------------- | --------- | -------- | ------------------------------------------- |
| `remove_events`   | `boolean` | No       | Remove calendar events (default: false)     |
| `delete_calendar` | `boolean` | No       | Delete the calendar itself (default: false) |

#### Response: `ApiResponse<{ disconnected: true }>`

```typescript
{
  success: true,
  data: { disconnected: true },
  message: "Calendar disconnected successfully"
}
```

#### Side Effects

- Removes `calendar_id` from project
- Cancels sync webhook
- If `remove_events = true`, deletes all project events from calendar
- If `delete_calendar = true`, permanently deletes the calendar

---

## Project Synthesis & Analysis

### 19. `POST /api/projects/[id]/synthesize` - Synthesize Project

**Purpose:** Use AI to analyze project context and generate insights.

**File:** `src/routes/api/projects/[id]/synthesize/+server.ts`

**Authentication:** Required (session-based)

#### Request Body

```typescript
{
  analysis_type?: 'full' | 'quick' | 'status_update';  // Default: 'full'
  include_brain_dumps?: boolean;  // Include brain dump context (default: true)
  include_tasks?: boolean;        // Analyze task progress (default: true)
  streaming?: boolean;            // SSE streaming response (default: false)
}
```

#### Response (Non-Streaming): `ApiResponse<{ synthesis: ProjectSynthesis }>`

```typescript
{
  success: true,
  data: {
    synthesis: {
      id: "uuid",
      project_id: "uuid",
      summary: "Comprehensive AI-generated project summary",
      insights: [
        "Project is 53% complete with 8/15 tasks done",
        "Phase 1 completion delayed by 3 days",
        "High-priority tasks concentrated in Phase 2"
      ],
      recommendations: [
        "Consider breaking down 'Implement authentication' task",
        "Schedule blocked tasks after dependencies complete",
        "Review Phase 2 timeline - may need extension"
      ],
      progress_analysis: {
        overall_progress: 0.53,
        phase_progress: {
          "phase-1-id": 0.8,
          "phase-2-id": 0.3,
          "phase-3-id": 0.0
        },
        velocity: 1.2,  // Tasks per day
        estimated_completion: "2025-02-15T00:00:00Z"
      },
      risk_assessment: {
        level: "medium",
        factors: [
          "2 tasks blocked by dependencies",
          "Phase 2 behind schedule"
        ]
      },
      created_at: "2025-01-15T10:00:00Z"
    }
  }
}
```

#### Response (Streaming): SSE Events

```typescript
// Event: progress
{
  type: "progress",
  data: {
    stage: "analyzing_context",
    progress: 0.25
  }
}

// Event: insight
{
  type: "insight",
  data: {
    insight: "Project is 53% complete with 8/15 tasks done"
  }
}

// Event: recommendation
{
  type: "recommendation",
  data: {
    recommendation: "Consider breaking down large tasks"
  }
}

// Event: complete
{
  type: "complete",
  data: {
    synthesis: { /* full synthesis object */ }
  }
}
```

#### Analysis Types

##### `full`

- Comprehensive analysis of project state
- Reviews all brain dumps, tasks, phases
- Generates detailed insights and recommendations
- Takes 30-60 seconds

##### `quick`

- Fast analysis of current progress
- Basic insights and next steps
- Takes 5-10 seconds

##### `status_update`

- Brief status summary
- Progress metrics only
- Takes 2-5 seconds

---

### 20. `GET /api/projects/[id]/synthesis/history` - Get Synthesis History

**Purpose:** Retrieve historical project synthesis records.

**File:** `src/routes/api/projects/[id]/synthesis/history/+server.ts`

**Authentication:** Required (session-based)

#### Query Parameters

| Parameter | Type     | Required | Description               |
| --------- | -------- | -------- | ------------------------- |
| `limit`   | `number` | No       | Max results (default: 10) |
| `offset`  | `number` | No       | Pagination offset         |

#### Response: `ApiResponse<{ syntheses: ProjectSynthesis[], total: number }>`

```typescript
{
  success: true,
  data: {
    syntheses: [
      {
        id: "uuid",
        project_id: "uuid",
        summary: "...",
        insights: [...],
        recommendations: [...],
        created_at: "2025-01-15T10:00:00Z"
      }
    ],
    total: 5
  }
}
```

---

## Project Notes & Context

### 21. `GET /api/projects/[id]/notes` - Get Project Notes

**Purpose:** Retrieve all notes associated with the project.

**File:** `src/routes/api/projects/[id]/notes/+server.ts`

**Authentication:** Required (session-based)

#### Query Parameters

| Parameter | Type                           | Required | Description                        |
| --------- | ------------------------------ | -------- | ---------------------------------- |
| `sort_by` | `'created_at' \| 'updated_at'` | No       | Sort field (default: 'updated_at') |
| `order`   | `'asc' \| 'desc'`              | No       | Sort order (default: 'desc')       |

#### Response: `ApiResponse<{ notes: Note[] }>`

```typescript
{
  success: true,
  data: {
    notes: [
      {
        id: "uuid",
        project_id: "uuid",
        content: "Meeting notes from client call",
        metadata: {
          tags: ["meeting", "client"],
          source: "manual"
        },
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z"
      }
    ]
  }
}
```

---

### 22. `POST /api/projects/[id]/notes` - Create Note

**Purpose:** Add a note to the project.

**File:** `src/routes/api/projects/[id]/notes/+server.ts`

**Authentication:** Required (session-based)

#### Request Body

```typescript
{
  content: string;       // Required, max 10000 chars
  metadata?: {
    tags?: string[];
    source?: string;
    [key: string]: any;
  };
}
```

#### Response: `ApiResponse<{ note: Note }>`

```typescript
{
  success: true,
  data: {
    note: {
      id: "uuid",
      project_id: "uuid",
      content: "Meeting notes",
      metadata: { tags: ["meeting"] },
      created_at: "2025-01-15T10:00:00Z"
    }
  }
}
```

---

### 23. `GET /api/projects/[id]/context` - Get Project Context

**Purpose:** Retrieve comprehensive project context including brain dumps and notes.

**File:** `src/routes/api/projects/[id]/context/+server.ts`

**Authentication:** Required (session-based)

#### Response: `ApiResponse<{ context: ProjectContext }>`

```typescript
{
  success: true,
  data: {
    context: {
      project: {
        id: "uuid",
        name: "Project Name",
        description: "...",
        context: "Rich context field"
      },
      brain_dumps: [
        {
          id: "uuid",
          content: "Original brain dump content",
          created_at: "2025-01-15T10:00:00Z"
        }
      ],
      notes: [...],
      timeline: [
        {
          type: "brain_dump",
          timestamp: "2025-01-15T10:00:00Z",
          content: "Project created from brain dump"
        },
        {
          type: "note",
          timestamp: "2025-01-16T14:00:00Z",
          content: "Added meeting notes"
        }
      ]
    }
  }
}
```

---

## Project Statistics & Analytics

### 24. `GET /api/projects/[id]/statistics` - Get Project Statistics

**Purpose:** Retrieve comprehensive project metrics and analytics.

**File:** `src/routes/api/projects/[id]/statistics/+server.ts`

**Authentication:** Required (session-based)

#### Response: `ApiResponse<{ statistics: ProjectStatistics }>`

```typescript
{
  success: true,
  data: {
    statistics: {
      project_id: "uuid",

      // Task metrics
      total_tasks: 15,
      completed_tasks: 8,
      in_progress_tasks: 4,
      todo_tasks: 3,
      blocked_tasks: 0,

      // Progress metrics
      overall_progress: 0.53,
      phase_progress: {
        "phase-1-id": 0.8,
        "phase-2-id": 0.3,
        "phase-3-id": 0.0
      },

      // Time metrics
      estimated_total_time: 2880,      // minutes
      actual_time_spent: 1200,         // minutes
      remaining_estimated_time: 1680,  // minutes

      // Velocity metrics
      tasks_completed_per_day: 1.2,
      average_task_completion_time: 150,  // minutes

      // Completion estimates
      estimated_completion_date: "2025-02-15T00:00:00Z",
      days_until_completion: 31,
      on_track: true,

      // Priority breakdown
      priority_breakdown: {
        urgent: 2,
        high: 5,
        medium: 6,
        low: 2
      },

      // Calendar integration
      tasks_scheduled: 10,
      tasks_unscheduled: 5,
      calendar_sync_enabled: true,
      last_calendar_sync: "2025-01-15T09:00:00Z",

      // Activity metrics
      last_activity: "2025-01-15T10:00:00Z",
      days_since_last_activity: 0,
      total_brain_dumps: 3,
      total_notes: 5
    }
  }
}
```

---

### 25. `GET /api/projects/[id]/analytics` - Get Project Analytics

**Purpose:** Retrieve time-series analytics and trends.

**File:** `src/routes/api/projects/[id]/analytics/+server.ts`

**Authentication:** Required (session-based)

#### Query Parameters

| Parameter | Type                              | Required | Description                  |
| --------- | --------------------------------- | -------- | ---------------------------- |
| `period`  | `'7d' \| '30d' \| '90d' \| 'all'` | No       | Time period (default: '30d') |
| `metrics` | `string[]`                        | No       | Specific metrics to include  |

#### Response: `ApiResponse<{ analytics: ProjectAnalytics }>`

```typescript
{
  success: true,
  data: {
    analytics: {
      project_id: "uuid",
      period: "30d",

      // Daily completion trend
      completion_trend: [
        {
          date: "2025-01-01",
          tasks_completed: 2,
          cumulative_progress: 0.13
        },
        {
          date: "2025-01-02",
          tasks_completed: 1,
          cumulative_progress: 0.2
        }
        // ... more data points
      ],

      // Velocity trend
      velocity_trend: [
        {
          week: "2025-W01",
          tasks_per_day: 1.4,
          hours_per_day: 3.2
        }
      ],

      // Phase timeline
      phase_timeline: [
        {
          phase_id: "uuid",
          phase_name: "Phase 1",
          start_date: "2025-01-01",
          target_date: "2025-01-15",
          completion_date: "2025-01-14",
          duration_days: 13,
          on_time: true
        }
      ],

      // Burndown data
      burndown: {
        ideal_trend: [15, 13.5, 12, 10.5, 9, 7.5, 6, 4.5, 3, 1.5, 0],
        actual_trend: [15, 14, 12, 11, 9, 7, 7, 5, 3, 2, 1],
        remaining_tasks: 7
      }
    }
  }
}
```

---

### 26. `GET /api/projects/dashboard` - Projects Dashboard

**Purpose:** Get overview of all projects with summary statistics.

**File:** `src/routes/api/projects/dashboard/+server.ts`

**Authentication:** Required (session-based)

#### Response: `ApiResponse<{ dashboard: Dashboard }>`

```typescript
{
  success: true,
  data: {
    dashboard: {
      // Summary statistics
      total_projects: 5,
      active_projects: 3,
      completed_projects: 1,
      archived_projects: 1,

      // Aggregate metrics
      total_tasks: 45,
      completed_tasks: 23,
      overall_progress: 0.51,

      // Active projects with highlights
      active_projects_list: [
        {
          id: "uuid",
          name: "BuildOS Platform",
          progress: 0.53,
          total_tasks: 15,
          completed_tasks: 8,
          next_task: {
            title: "Implement authentication",
            priority: "high",
            due_date: "2025-01-20T00:00:00Z"
          },
          recent_activity: "2025-01-15T10:00:00Z"
        }
      ],

      // Upcoming deadlines
      upcoming_deadlines: [
        {
          project_id: "uuid",
          project_name: "BuildOS Platform",
          task_id: "uuid",
          task_title: "Launch MVP",
          due_date: "2025-01-25T00:00:00Z",
          days_until_due: 10,
          priority: "urgent"
        }
      ],

      // Recent activity
      recent_activity: [
        {
          type: "task_completed",
          project_id: "uuid",
          project_name: "BuildOS Platform",
          description: "Completed 'Design database schema'",
          timestamp: "2025-01-15T10:00:00Z"
        }
      ]
    }
  }
}
```

---

## Database Schema

### Tables

#### `projects`

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'planning',
  context TEXT,  -- Rich context from brain dumps
  calendar_id VARCHAR(255),  -- Google Calendar ID
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT valid_status CHECK (status IN ('planning', 'active', 'completed', 'archived'))
);

CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_status ON projects(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_calendar_id ON projects(calendar_id) WHERE calendar_id IS NOT NULL;
```

#### `phases`

```sql
CREATE TABLE phases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  order INTEGER NOT NULL DEFAULT 0,
  target_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT phases_order_unique UNIQUE (project_id, order)
);

CREATE INDEX idx_phases_project_id ON phases(project_id);
CREATE INDEX idx_phases_order ON phases(project_id, order) WHERE deleted_at IS NULL;
```

#### `tasks`

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES phases(id) ON DELETE SET NULL,
  parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,

  title VARCHAR(500) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'todo',
  priority VARCHAR(20) DEFAULT 'medium',
  order INTEGER DEFAULT 0,

  estimated_duration INTEGER,  -- minutes
  actual_duration INTEGER,     -- minutes

  due_date TIMESTAMP WITH TIME ZONE,
  calendar_event_id VARCHAR(255),

  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_rule TEXT,  -- RFC 5545 format

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT valid_status CHECK (status IN ('todo', 'in_progress', 'completed', 'blocked')),
  CONSTRAINT valid_priority CHECK (priority IN ('low', 'medium', 'high', 'urgent'))
);

CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_phase_id ON tasks(phase_id);
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_status ON tasks(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_due_date ON tasks(due_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_calendar_event_id ON tasks(calendar_event_id) WHERE calendar_event_id IS NOT NULL;
```

#### `task_dependencies`

```sql
CREATE TABLE task_dependencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT no_self_dependency CHECK (task_id != depends_on_task_id),
  CONSTRAINT unique_dependency UNIQUE (task_id, depends_on_task_id)
);

CREATE INDEX idx_task_dependencies_task_id ON task_dependencies(task_id);
CREATE INDEX idx_task_dependencies_depends_on ON task_dependencies(depends_on_task_id);
```

#### `project_synthesis`

```sql
CREATE TABLE project_synthesis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  insights JSONB,
  recommendations JSONB,
  progress_analysis JSONB,
  risk_assessment JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_project_synthesis_project_id ON project_synthesis(project_id);
CREATE INDEX idx_project_synthesis_created_at ON project_synthesis(created_at DESC);
```

#### `project_notes`

```sql
CREATE TABLE project_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_project_notes_project_id ON project_notes(project_id);
CREATE INDEX idx_project_notes_user_id ON project_notes(user_id);
```

---

## Service Layer Dependencies

### Core Services

#### `ProjectService`

**File:** `src/lib/services/project.service.ts`

**Responsibilities:**

- CRUD operations for projects
- Status management
- Calendar integration coordination
- Real-time update publishing

**Key Methods:**

- `getProjects(userId, filters)` - List projects with filtering
- `getProjectById(projectId, userId)` - Get project details
- `createProject(data, userId)` - Create new project
- `updateProject(projectId, data, userId)` - Update project
- `deleteProject(projectId, userId, hardDelete)` - Delete project
- `restoreProject(projectId, userId)` - Restore soft-deleted project

#### `PhaseGenerationOrchestrator`

**File:** `src/lib/services/phase-generation/orchestrator.ts`

**Responsibilities:**

- Coordinates AI-powered phase generation
- Manages different generation strategies
- Handles streaming responses

**Strategies:**

- `PhaseOnlyStrategy` - Basic phase generation
- `ScheduleInPhasesStrategy` - Phase generation with scheduling
- `CalendarOptimizedStrategy` - Calendar-aware generation

#### `TaskService`

**File:** `src/lib/services/task.service.ts`

**Responsibilities:**

- Task CRUD operations
- Batch task operations
- Recurring task management
- Dependency validation

**Key Methods:**

- `getTasks(projectId, filters)` - List tasks with filtering
- `createTask(data, userId)` - Create single task
- `batchCreateTasks(tasks, userId)` - Batch create
- `updateTask(taskId, data, userId)` - Update task
- `validateDependencies(taskId, dependencies)` - Check for cycles

#### `CalendarService`

**File:** `src/lib/services/calendar-service.ts`

**Responsibilities:**

- Google Calendar integration
- Event creation and synchronization
- Webhook management for real-time updates

**Key Methods:**

- `connectCalendar(projectId, calendarId, userId)` - Link calendar
- `disconnectCalendar(projectId, userId, options)` - Unlink calendar
- `syncTasks(projectId, mode)` - Synchronize tasks and events
- `scheduleTask(task, calendar, options)` - Create calendar event

#### `ProjectSynthesisService`

**File:** `src/lib/services/projectSynthesis.service.ts`

**Responsibilities:**

- AI-powered project analysis
- Insight generation
- Progress tracking and recommendations

**Key Methods:**

- `synthesizeProject(projectId, options)` - Generate synthesis
- `getSynthesisHistory(projectId)` - Retrieve past syntheses
- `streamSynthesis(projectId, options)` - SSE streaming synthesis

#### `RealtimeProjectService`

**File:** `src/lib/services/realtimeProject.service.ts`

**Responsibilities:**

- Supabase real-time subscriptions
- Live update coordination
- Change broadcasting

**Key Methods:**

- `subscribeToProject(projectId, callback)` - Subscribe to updates
- `publishUpdate(projectId, changeType, data)` - Broadcast change
- `unsubscribe(subscription)` - Clean up subscription

---

## Common Patterns

### Authentication

All endpoints use session-based authentication:

```typescript
const { session } = await safeGetSession(event);
if (!session?.user) {
	return ApiResponse.unauthorized('Authentication required');
}
const userId = session.user.id;
```

### Error Handling

Standardized error responses:

```typescript
try {
	// ... operation
} catch (error) {
	if (error.code === '23505') {
		return ApiResponse.conflict('Resource already exists');
	}
	return ApiResponse.error('Operation failed', error);
}
```

### RLS Enforcement

Database enforces row-level security:

```sql
-- Projects RLS policy
CREATE POLICY "Users can only access their own projects"
ON projects FOR ALL
USING (user_id = auth.uid());
```

### Soft Deletes

All entities use soft delete pattern:

```sql
WHERE deleted_at IS NULL
```

### Batch Operations

Optimized for bulk operations:

```typescript
// Prevents N+1 queries
const projects = await supabase
	.from('projects')
	.select(
		`
    *,
    phases:phases(*, tasks:tasks(*)),
    _count:tasks(count)
  `
	)
	.eq('user_id', userId)
	.is('deleted_at', null);
```

### Real-time Updates

Publishes changes to subscribers:

```typescript
await realtimeProjectService.publishUpdate(projectId, 'task_completed', {
	task_id: taskId,
	project_id: projectId
});
```

---

## Error Codes

| HTTP Status | Error Type            | Common Causes                           |
| ----------- | --------------------- | --------------------------------------- |
| `400`       | Bad Request           | Invalid input, validation failure       |
| `401`       | Unauthorized          | Missing or invalid session              |
| `403`       | Forbidden             | RLS policy violation, no access         |
| `404`       | Not Found             | Resource doesn't exist                  |
| `409`       | Conflict              | Duplicate resource, circular dependency |
| `422`       | Unprocessable Entity  | Invalid state transition                |
| `429`       | Too Many Requests     | Rate limit exceeded                     |
| `500`       | Internal Server Error | Unexpected server error                 |
| `503`       | Service Unavailable   | OpenAI API down, database unavailable   |

---

## Performance Considerations

### Query Optimization

- Use batch queries to prevent N+1 problems
- Eager load related data with joins
- Use indexes on foreign keys and filter columns

### Calendar Sync

- Webhook-based sync preferred over polling
- Batch calendar operations when possible
- Cache calendar availability data

### AI Generation

- Use streaming for better UX on long operations
- Implement retry logic for API failures
- Cache generation results when appropriate

### Real-time Updates

- Subscribe only to necessary projects
- Debounce rapid updates
- Clean up subscriptions on unmount

---

**Last Updated:** 2025-01-15

**Version:** 1.0.0
