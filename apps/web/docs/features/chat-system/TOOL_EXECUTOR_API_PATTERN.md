<!-- apps/web/docs/features/chat-system/TOOL_EXECUTOR_API_PATTERN.md -->

# Chat Tool Executor - API Pattern Documentation

## Overview

The Chat Tool Executor has been completely redesigned to use API endpoints instead of direct database access. This architectural change ensures consistency with UI operations, leverages existing business logic, and automatically handles complex side effects like calendar synchronization.

## Architecture

### Key Benefits

1. **Consistency**: Same code path as UI operations
2. **Business Logic**: All validation and rules applied automatically
3. **Side Effects**: Calendar sync, email notifications, etc. handled properly
4. **Maintainability**: Single source of truth for each operation
5. **Type Safety**: Full TypeScript support with shared types

### API-Based Pattern

```typescript
// Old Pattern (Direct DB)
const { data, error } = await supabase.from('tasks').update({ status: 'done' }).eq('id', taskId);

// New Pattern (API Endpoint)
const result = await this.apiRequest(`/api/projects/${projectId}/tasks/${taskId}`, {
	method: 'PATCH',
	body: JSON.stringify({ status: 'done' })
});
```

## Task-Calendar Integration

### New Tools

#### 1. `get_task_calendar_events`

Returns all calendar events linked to a specific task.

```typescript
// Usage
{
  task_id: "uuid-here",
  include_deleted: false  // Optional, defaults to false
}

// Returns
{
  events: [...],  // Array of task_calendar_events
  has_events: true,
  message: "Task has 2 calendar event(s)"
}
```

#### 2. `check_task_has_calendar_event`

Quick check if a task is already scheduled on the calendar.

```typescript
// Usage
{
  task_id: "uuid-here"
}

// Returns
{
  has_event: true,
  event: { ... },  // The calendar event if exists
  message: "Task is scheduled on calendar (2024-01-15T14:00:00Z)"
}
```

#### 3. `update_or_schedule_task`

Smart scheduling that handles both updates and creates based on existing events.

```typescript
// Usage
{
  project_id: "project-uuid",
  task_id: "task-uuid",
  start_time: "2024-01-15T14:00:00Z",
  duration_minutes: 60,
  force_recreate: false,  // Delete old and create new
  recurrence_pattern: "weekly",  // Optional
  recurrence_ends: "2024-03-15",  // Optional
  timeZone: "America/New_York"  // Optional
}

// Returns
{
  task: { ... },  // Updated task with calendar events
  calendar_event: { ... },
  message: "Updated task schedule and calendar event"
}
```

### Critical Parameters

#### `addTaskToCalendar`

When updating a task via the API endpoint with a `start_date`, include `addTaskToCalendar: true` to:

- Create a new calendar event if none exists
- Update existing calendar events
- Handle recurrence changes automatically
- Maintain task_calendar_events relationships

```typescript
// Example: Update task with calendar sync
await this.apiRequest(`/api/projects/${projectId}/tasks/${taskId}`, {
	method: 'PATCH',
	body: JSON.stringify({
		start_date: '2024-01-15T14:00:00Z',
		duration_minutes: 90,
		addTaskToCalendar: true // Critical flag
	})
});
```

## LLM Instructions

Add these instructions to the chat system prompt:

```markdown
### Calendar Event Management for Tasks

When managing calendar events for tasks, follow these guidelines:

1. **Check Before Scheduling**:
    - Always use `get_task_calendar_events` or `check_task_has_calendar_event` before scheduling
    - This prevents duplicate events and orphaned records

2. **Smart Scheduling**:
    - Use `update_or_schedule_task` for existing tasks
    - This automatically handles update vs create logic
    - Pass `force_recreate: true` only if user explicitly wants to start fresh

3. **Updating Tasks with Calendar Events**:
    - When updating a task's start_date, the API automatically handles calendar sync
    - The system will update existing events or create new ones as needed
    - task_calendar_events relationships are managed automatically

4. **Recurring Events**:
    - When changing recurrence patterns, the API automatically recreates events
    - The system preserves event history in the task_calendar_events table
    - Series_update_scope is tracked automatically

5. **Error Recovery**:
    - If calendar operations fail, sync_status is marked as 'error'
    - Users can retry with the retry endpoints
    - Always inform users of calendar sync failures

6. **Example Flows**:

    Scheduling a task:
    1. check_task_has_calendar_event(task_id) → Check existing
    2. update_or_schedule_task(...) → Smart update/create
    3. Confirm success with user

    Rescheduling a task:
    1. get_task_calendar_events(task_id) → See current events
    2. update_or_schedule_task(...) → Updates automatically
    3. Report changes to user

    Converting to recurring:
    1. update_or_schedule_task with recurrence_pattern
    2. System handles deletion of old events and creation of series
    3. Confirm new schedule with user
```

## Project Update Tool

### `update_project`

A flexible tool for updating any project field including basic information, calendar settings, and core dimensions.

```typescript
// Usage Examples

// Update basic fields
{
  project_id: "project-uuid",
  updates: {
    name: "Updated Project Name",
    description: "New description",
    status: "completed",
    end_date: "2024-12-31"
  }
}

// Update context
{
  project_id: "project-uuid",
  updates: {
    context: "Additional project context and background information..."
  }
}

// Update calendar settings
{
  project_id: "project-uuid",
  updates: {
    calendar_sync_enabled: true,
    calendar_color_id: "7"
  }
}

// Update core dimensions (9 dimensions framework)
{
  project_id: "project-uuid",
  updates: {
    core_goals_momentum: "Clear milestone progression defined",
    core_people_bonds: "Team collaboration patterns established",
    core_power_resources: "Budget and resources allocated"
  }
}

// Returns
{
  project: { ... },  // Updated project data
  message: "Updated project \"Project Name\": name, description, status"
}
```

### Updatable Fields

The tool supports updating any of these project fields:

**Basic Information:**

- `name` - Project name
- `description` - Short description
- `executive_summary` - Executive summary
- `context` - Detailed context and background
- `status` - Project status (active, paused, completed, archived)
- `start_date` - Start date (YYYY-MM-DD)
- `end_date` - End date (YYYY-MM-DD)
- `tags` - Array of tags

**Calendar Settings:**

- `calendar_color_id` - Google Calendar color ID
- `calendar_sync_enabled` - Enable/disable calendar sync

**Core Dimensions (9 Dimensions Framework):**

- `core_goals_momentum` - Goals & Momentum
- `core_harmony_integration` - Harmony & Integration
- `core_integrity_ideals` - Integrity & Ideals
- `core_meaning_identity` - Meaning & Identity
- `core_opportunity_freedom` - Opportunity & Freedom
- `core_people_bonds` - People & Bonds
- `core_power_resources` - Power & Resources
- `core_reality_understanding` - Reality & Understanding
- `core_trust_safeguards` - Trust & Safeguards

### Validation

The tool includes comprehensive validation:

- **Empty updates check**: Requires at least one field to update
- **Field whitelist**: Only allows updating valid, non-protected fields
- **Authorization**: Verifies user has access to the project
- **Clear error messages**: Provides helpful feedback for invalid requests

### Example Error Messages

```typescript
// No fields provided
'No fields provided to update. Please specify at least one field.';

// Invalid field
'Invalid field(s): invalid_field. Allowed fields: name, description, ...';

// Project not found
'Project not found or unauthorized';
```

## Edge Cases Handled Automatically

The API endpoints handle these complex scenarios automatically:

### Task Operations

- **Task Completion** → Removes from calendar
- **Date Clearing** → Deletes calendar events
- **Past Dates** → Marks events as deleted
- **Project Boundaries** → Validates dates
- **Phase Assignment** → Auto-assigns based on date

### Calendar Operations

- **Recurring Changes** → Recreates events properly
- **Duplicate Prevention** → Checks existing events
- **Orphan Cleanup** → Maintains relationship integrity
- **Calendar Disconnection** → Graceful degradation
- **Timezone Handling** → Preserves user timezone

### Sync Operations

- **Failed Syncs** → Marks sync_status as 'error'
- **Retry Logic** → Can retry failed operations
- **Partial Success** → Handles mixed results
- **Background Processing** → Non-blocking for bulk operations

## API Endpoints Used

| Operation      | Endpoint                            | Method | Key Parameters                                                  |
| -------------- | ----------------------------------- | ------ | --------------------------------------------------------------- |
| Create Task    | `/api/projects/[id]/tasks`          | POST   | title, description, start_date                                  |
| Update Task    | `/api/projects/[id]/tasks/[taskId]` | PATCH  | Any field + addTaskToCalendar                                   |
| Delete Task    | `/api/projects/[id]/tasks/[taskId]` | DELETE | deletion_scope                                                  |
| Create Note    | `/api/notes`                        | POST   | title, content, project_id                                      |
| Update Note    | `/api/notes/[id]`                   | PATCH  | title, content                                                  |
| Update Project | `/api/projects/[id]`                | PATCH  | Any field: name, description, context, status, dates, tags, etc |

## Type Safety

All tool arguments are fully typed:

```typescript
import type {
	ListTasksArgs,
	CreateTaskArgs,
	UpdateTaskArgs,
	UpdateProjectArgs,
	GetTaskCalendarEventsArgs,
	UpdateOrScheduleTaskArgs
	// ... all other arg types
} from '@buildos/shared-types';
```

### UpdateProjectArgs Type

```typescript
interface UpdateProjectArgs {
	project_id: string;
	updates: {
		name?: string;
		description?: string;
		executive_summary?: string;
		context?: string;
		status?: 'active' | 'paused' | 'completed' | 'archived';
		start_date?: string;
		end_date?: string;
		tags?: string[];
		calendar_color_id?: string;
		calendar_sync_enabled?: boolean;
		core_goals_momentum?: string;
		core_harmony_integration?: string;
		core_integrity_ideals?: string;
		core_meaning_identity?: string;
		core_opportunity_freedom?: string;
		core_people_bonds?: string;
		core_power_resources?: string;
		core_reality_understanding?: string;
		core_trust_safeguards?: string;
	};
}
```

## Error Handling

### Calendar Disconnection

```typescript
if (error.code === 'GOOGLE_AUTH_EXPIRED') {
	return {
		success: false,
		error: 'Calendar connection required. Please reconnect in settings.',
		requires_user_action: true
	};
}
```

### API Failures

```typescript
if (!response.ok) {
	const error = await response.text();
	throw new Error(`API request failed: ${response.statusText} - ${error}`);
}
```

## Performance Considerations

### Parallel Operations

When operations are independent, run them in parallel:

```typescript
// Good - Parallel execution
const [tasks, projects, notes] = await Promise.all([
	this.listTasksAbbreviated(taskArgs),
	this.searchProjectsAbbreviated(projectArgs),
	this.searchNotesAbbreviated(noteArgs)
]);

// Bad - Sequential execution
const tasks = await this.listTasksAbbreviated(taskArgs);
const projects = await this.searchProjectsAbbreviated(projectArgs);
const notes = await this.searchNotesAbbreviated(noteArgs);
```

### Progressive Disclosure

List operations return abbreviated data:

- First 100 chars of descriptions
- Task/note counts instead of full arrays
- Preview fields for long content

Use detail operations only when needed:

```typescript
// Step 1: List (abbreviated)
list_tasks() → Returns summaries

// Step 2: Detail (complete)
get_task_details(task_id) → Returns full data
```

## Testing

### Unit Tests

```typescript
// Test task-calendar integration
it('should update existing calendar event when rescheduling', async () => {
	// Create task with calendar event
	const task = await executor.createTaskViaAPI({
		title: 'Test Task',
		start_date: '2024-01-15T14:00:00Z',
		duration_minutes: 60
	});

	// Check has calendar event
	const check = await executor.checkTaskHasCalendarEvent({
		task_id: task.id
	});
	expect(check.has_event).toBe(true);

	// Reschedule
	const updated = await executor.updateOrScheduleTask({
		project_id: task.project_id,
		task_id: task.id,
		start_time: '2024-01-16T15:00:00Z'
	});

	expect(updated.message).toContain('Updated');
});
```

### Integration Tests

```typescript
// Test full flow
it('should handle task lifecycle with calendar', async () => {
	// Create
	const task = await createTask();

	// Schedule
	await scheduleTask(task.id);

	// Verify event exists
	const events = await getTaskCalendarEvents(task.id);
	expect(events.has_events).toBe(true);

	// Complete task
	await updateTask(task.id, { status: 'done' });

	// Verify event removed
	const eventsAfter = await getTaskCalendarEvents(task.id);
	expect(eventsAfter.events[0].sync_status).toBe('deleted');
});
```

## Migration Notes

### For Existing Code

Replace direct DB calls with API endpoints:

```typescript
// Before
await supabase.from('tasks').insert({ ...taskData });

// After
await this.apiRequest(`/api/projects/${projectId}/tasks`, {
	method: 'POST',
	body: JSON.stringify(taskData)
});
```

### For New Features

Always use API endpoints for mutations:

1. Ensures consistency
2. Applies business logic
3. Handles side effects
4. Maintains type safety

## Monitoring

### Tool Execution Logging

All tool executions are logged:

```typescript
await this.supabase.from('chat_tool_executions').insert({
	tool_name: toolCall.function.name,
	tool_category: category,
	arguments: args,
	result: result,
	execution_time_ms: duration,
	success: success,
	error_message: errorMessage,
	user_id: this.userId
});
```

### Analytics

Track:

- Tool usage frequency
- Execution times
- Error rates
- User patterns

## Future Enhancements

### Planned Improvements

1. **Batch Operations**: Bulk task updates
2. **Optimistic Updates**: Return immediately, sync in background
3. **Smart Caching**: Cache frequently accessed data
4. **Webhook Support**: Real-time updates from calendar
5. **Conflict Resolution**: Handle concurrent edits

### API Extensions

Potential new endpoints:

- `/api/tasks/batch` - Bulk operations
- `/api/calendar/sync` - Force sync
- `/api/calendar/conflicts` - Conflict detection
- `/api/tasks/schedule-multiple` - Bulk scheduling

## Conclusion

The API-based tool executor pattern provides:

- **Consistency** with UI operations
- **Automatic** handling of complex logic
- **Type safety** throughout
- **Better error handling**
- **Simplified maintenance**

This architecture ensures that LLM operations behave exactly like user operations, maintaining data integrity and business logic consistency across the entire application.
