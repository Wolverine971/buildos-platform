# LLM Tool Instructions for BuildOS Chat

## Core Principle

Use existing API endpoints for all mutations. Never directly manipulate the database for create/update/delete operations.

## Task-Calendar Management

### Before Scheduling Any Task

**ALWAYS** check for existing calendar events first:

```javascript
// Option 1: Quick check
check_task_has_calendar_event({
	task_id: 'task-uuid'
});

// Option 2: Detailed check
get_task_calendar_events({
	task_id: 'task-uuid',
	include_deleted: false
});
```

### Smart Scheduling Pattern

**ALWAYS** use `update_or_schedule_task` for existing tasks:

```javascript
// Correct - Smart scheduling
update_or_schedule_task({
	project_id: 'project-uuid',
	task_id: 'task-uuid',
	start_time: '2024-01-15T14:00:00Z',
	duration_minutes: 60
});

// Wrong - Direct scheduling (may create duplicates)
schedule_task({
	task_id: 'task-uuid',
	start_time: '2024-01-15T14:00:00Z'
});
```

### Common Scenarios

#### 1. User: "Schedule my task for tomorrow at 2pm"

```javascript
// Step 1: Check existing events
const check = check_task_has_calendar_event({ task_id });

// Step 2: Smart update/create
update_or_schedule_task({
	project_id,
	task_id,
	start_time: '2024-01-15T14:00:00Z',
	duration_minutes: 60
});

// Step 3: Confirm
("I've scheduled your task for tomorrow at 2pm");
```

#### 2. User: "Reschedule this task to next week"

```javascript
// Step 1: Get current events
const events = get_task_calendar_events({ task_id });

// Step 2: Update (handles existing events automatically)
update_or_schedule_task({
	project_id,
	task_id,
	start_time: '2024-01-22T14:00:00Z'
});

// Step 3: Confirm
("I've rescheduled your task from [old_date] to next week");
```

#### 3. User: "Make this a weekly recurring task"

```javascript
// The API handles deletion of old events and creation of series
update_or_schedule_task({
	project_id,
	task_id,
	start_time: '2024-01-15T14:00:00Z',
	recurrence_pattern: 'weekly',
	recurrence_ends: '2024-03-15' // Optional end date
});
```

#### 4. User: "Remove this task from my calendar but keep the task"

```javascript
// Update task without calendar flag
update_task({
	task_id,
	updates: {
		start_date: null // This triggers calendar event deletion
	}
});
```

## Critical Rules

### 1. Task Updates with Dates

When updating a task's `start_date`, the API automatically handles calendar sync:

```javascript
// Correct - API handles calendar automatically
update_task({
	task_id,
	updates: {
		start_date: '2024-01-15T14:00:00Z',
		duration_minutes: 90
	}
});
// The API adds addTaskToCalendar: true internally when start_date changes
```

### 2. Force Recreate

Only use `force_recreate: true` when user explicitly requests:

```javascript
// User: "Delete the old event and create a fresh one"
update_or_schedule_task({
	project_id,
	task_id,
	start_time: '2024-01-15T14:00:00Z',
	force_recreate: true // Only when explicitly requested
});
```

### 3. Error Handling

Always inform users of calendar issues:

```javascript
// If calendar disconnected
if (error.code === 'GOOGLE_AUTH_EXPIRED') {
	return 'Your Google Calendar needs to be reconnected. Please go to Settings > Calendar Integration to reconnect.';
}

// If sync failed
if (result.sync_status === 'error') {
	return 'The task was updated but calendar sync failed. You can retry from the task details page.';
}
```

## Progressive Disclosure Pattern

### Step 1: List/Search (Abbreviated)

Use for initial queries:

```javascript
list_tasks({
	status: ['in_progress', 'backlog'],
	has_date: true,
	limit: 10
});
// Returns: Abbreviated task summaries
```

### Step 2: Get Details (Complete)

Use only when user needs full information:

```javascript
get_task_details({
	task_id: 'uuid',
	include_subtasks: true,
	include_project_context: true
});
// Returns: Complete task with all relationships
```

## Tool Categories & Usage

### List Tools (Low Token Cost)

- `list_tasks` - Abbreviated task list
- `search_projects` - Project summaries
- `search_notes` - Note previews
- `search_brain_dumps` - Brain dump summaries
- `get_calendar_events` - Event list

### Detail Tools (Higher Token Cost)

- `get_task_details` - Complete task data
- `get_project_details` - Full project context
- `get_note_details` - Complete note content
- `get_brain_dump_details` - Full brain dump

### Action Tools (API Mutations)

- `create_task` - Via `/api/projects/[id]/tasks`
- `update_task` - Via `/api/projects/[id]/tasks/[taskId]`
- `create_note` - Via `/api/notes`
- `update_project_context` - Via `/api/projects/[id]`

### Calendar Tools

- `get_task_calendar_events` - Check task's calendar links
- `check_task_has_calendar_event` - Quick existence check
- `update_or_schedule_task` - Smart scheduling
- `find_available_slots` - Find free time
- `update_calendar_event` - Modify existing event
- `delete_calendar_event` - Remove event

## Response Patterns

### Successful Scheduling

```
✓ I've scheduled your task "Review documentation" for tomorrow at 2pm (90 minutes).
  The calendar event has been created and linked to your task.
```

### Rescheduling

```
✓ I've rescheduled "Team meeting" from Tuesday to Thursday at 3pm.
  The calendar event has been updated automatically.
```

### Calendar Not Connected

```
⚠️ Your task has been updated, but I couldn't add it to your calendar.
   Please connect your Google Calendar in Settings to enable calendar sync.
```

### Sync Failed

```
⚠️ The task was updated but calendar sync failed.
   You can retry the sync from the task details page or try again later.
```

## Performance Tips

### Parallel Operations

When operations are independent, run in parallel:

```javascript
// Good - Parallel execution
Promise.all([
	list_tasks({ status: ['in_progress'] }),
	get_calendar_events({ timeMin: today }),
	search_notes({ query: 'meeting' })
]);

// Bad - Sequential (slower)
await list_tasks({ status: ['in_progress'] });
await get_calendar_events({ timeMin: today });
await search_notes({ query: 'meeting' });
```

### Minimize Detail Calls

Only fetch full details when necessary:

```javascript
// Good - Progressive disclosure
const tasks = await list_tasks({ limit: 10 });
// Only get details for specific task user asks about
if (userAsksAboutTask) {
	const details = await get_task_details({ task_id });
}

// Bad - Fetching all details upfront
const tasks = await list_tasks({ limit: 10 });
for (const task of tasks) {
	await get_task_details({ task_id: task.id }); // Unnecessary
}
```

## Common Mistakes to Avoid

### ❌ Direct Calendar Scheduling for Existing Tasks

```javascript
// Wrong
schedule_task({ task_id, start_time });

// Right
update_or_schedule_task({ project_id, task_id, start_time });
```

### ❌ Not Checking for Existing Events

```javascript
// Wrong
update_or_schedule_task({ ... }); // Without checking first

// Right
const check = await check_task_has_calendar_event({ task_id });
if (check.has_event) {
  // Inform user task is already scheduled
}
await update_or_schedule_task({ ... });
```

### ❌ Using Direct DB for Mutations

```javascript
// Wrong
supabase.from('tasks').update({ ... });

// Right
await updateTaskViaAPI({ ... });  // Uses API endpoint
```

### ❌ Fetching Full Details for Lists

```javascript
// Wrong
const projects = await Promise.all(projectIds.map((id) => get_project_details({ project_id: id })));

// Right
const projects = await search_projects({ limit: 20 });
```

## Remember

1. **API First**: Always use API endpoints for mutations
2. **Check First**: Always check for existing calendar events
3. **Smart Tools**: Use `update_or_schedule_task` for existing tasks
4. **Progressive**: Start with lists, fetch details only when needed
5. **Inform Users**: Always communicate calendar sync status
6. **Handle Errors**: Gracefully handle calendar disconnection
7. **Be Efficient**: Run independent operations in parallel
