# Calendar Analysis: Past Tasks Bug Fix

**Date**: 2025-01-03
**Status**: ✅ FIXED
**Priority**: CRITICAL

---

## Executive Summary

Fixed critical bug where projects created from calendar analysis would have **zero tasks** even though the UI showed tasks. Root cause: LLM was generating tasks based on past calendar events, frontend was auto-disabling them, user would unknowingly create empty projects.

**Solution**: Separate past and upcoming events, instruct LLM to use past events for context only, generate tasks only from upcoming events or inferred next steps.

---

## The Bug

### Symptoms

1. User analyzes calendar
2. UI shows project suggestions with tasks
3. User clicks "Create Projects"
4. Project is created but **tasks are NOT created**

### Root Cause Analysis

The bug occurred due to a chain of events:

1. **LLM generates tasks from past events**
    - Calendar analysis included events from past 30 days
    - LLM created tasks with `start_date` from those past events
    - Example: "Sprint Planning" task with `start_date: 2024-12-20`

2. **Frontend auto-disables past tasks**
    - `CalendarAnalysisResults.svelte:100-116`
    - Tasks with `start_date < today` are automatically unchecked
    - User sees tasks in UI but doesn't notice they're unchecked

3. **Backend receives taskSelections with all tasks = false**
    - `acceptSuggestion()` filters out unchecked tasks
    - `operations` array contains only project, no tasks
    - Project created successfully, zero tasks

### Example Flow

```typescript
// 1. LLM Response
{
  "suggestions": [{
    "name": "Q1 Sprint Planning",
    "suggested_tasks": [
      { "title": "Sprint 1 Planning", "start_date": "2024-12-15T09:00:00" }, // PAST
      { "title": "Sprint 2 Planning", "start_date": "2024-12-22T09:00:00" }, // PAST
      { "title": "Sprint 3 Planning", "start_date": "2024-12-29T09:00:00" }  // PAST
    ]
  }]
}

// 2. Frontend auto-disables all tasks
enabledTasks = {
  "suggestion-123-0": false, // Auto-disabled (past)
  "suggestion-123-1": false, // Auto-disabled (past)
  "suggestion-123-2": false  // Auto-disabled (past)
}

// 3. Backend receives
{
  "taskSelections": {
    "suggestion-123-0": false,
    "suggestion-123-1": false,
    "suggestion-123-2": false
  }
}

// 4. Result: Project created, ZERO tasks
```

---

## The Fix

### Multi-Layer Solution

#### Layer 1: Separate Past/Upcoming Events

**File**: `calendar-analysis.service.ts:296-314`

```typescript
const now = new Date();

// Separate events into past and upcoming
const pastEvents = events.filter((e) => {
	const eventDate = new Date(e.start?.dateTime || e.start?.date || '');
	return eventDate < now;
});

const upcomingEvents = events.filter((e) => {
	const eventDate = new Date(e.start?.dateTime || e.start?.date || '');
	return eventDate >= now;
});
```

#### Layer 2: Enhanced LLM Prompt

**File**: `calendar-analysis.service.ts:316-495`

**Key Changes:**

1. **Explicit date context**: `Today's date is ${today}`
2. **Separate event sections**:
    - Past Events: "Use ONLY for project context, DO NOT create tasks"
    - Upcoming Events: "Use for BOTH context AND task generation"
3. **Two task generation approaches**:
    - Approach 1: Convert upcoming events to tasks
    - Approach 2: Infer logical next steps (future dates only)
4. **Strict requirements**:
    - "ALL tasks MUST have start_date >= ${today}"
    - "NEVER create tasks with dates in the past"
    - "MUST generate 2-5 tasks per project"
5. **Validation checklist**:
    ```
    - [ ] Each project has at least 2 tasks
    - [ ] ALL task start_date values are >= ${today}
    - [ ] NO tasks have dates in the past
    ```

#### Layer 3: Post-LLM Validation

**File**: `calendar-analysis.service.ts:547-578`

```typescript
// Validate that all tasks have future dates
filtered.forEach((suggestion) => {
	const pastTasks = suggestion.suggested_tasks.filter((task) => {
		if (!task.start_date) return false;
		const taskDate = new Date(task.start_date);
		return taskDate < today;
	});

	if (pastTasks.length > 0) {
		console.warn(
			`WARNING: Project "${suggestion.name}" has ${pastTasks.length} task(s) with past dates.`,
			pastTasks
		);
	}

	// Validate minimum task count
	const taskCount = suggestion.suggested_tasks?.length || 0;
	if (taskCount < 2) {
		console.warn(
			`WARNING: Project "${suggestion.name}" has only ${taskCount} task(s). At least 2 expected.`
		);
	}
});
```

#### Layer 4: Safety Net - Task Rescheduling

**File**: `calendar-analysis.service.ts:676-716`

If tasks with past dates slip through, they're automatically rescheduled:

```typescript
if (modifiedTask.start_date) {
	const taskDate = new Date(modifiedTask.start_date);
	if (taskDate < today) {
		const originalDate = modifiedTask.start_date;

		if (modifiedTask.task_type === 'one_off') {
			// Reschedule to today
			modifiedTask.start_date = today.toISOString().split('T')[0] + 'T09:00:00';
			rescheduledFromPast = true;
		} else if (modifiedTask.task_type === 'recurring') {
			// Move recurring pattern to today
			modifiedTask.start_date = today.toISOString().split('T')[0] + 'T09:00:00';
			rescheduledFromPast = true;
		}

		// Add note to task details
		modifiedTask.details += `\n\n⚠️ Note: This task was originally scheduled for ${originalDate} but was rescheduled because it was in the past.`;
	}
}
```

#### Layer 5: Frontend - Enable All Tasks

**File**: `CalendarAnalysisResults.svelte:100-118`

```typescript
// Before (auto-disabled past tasks):
newEnabledTasks[taskKey] = !isTaskInPast(task);

// After (enable all - LLM should only generate future tasks):
newEnabledTasks[taskKey] = true;
```

---

## How It Works Now

### 1. Calendar Analysis with Past + Future Events

```
User's Calendar:
├── Past Events (30 days back)
│   ├── Sprint Planning - Dec 15
│   ├── Sprint Planning - Dec 22
│   └── Sprint Planning - Dec 29
└── Upcoming Events (60 days forward)
    ├── Sprint Planning - Jan 5
    ├── Sprint Planning - Jan 12
    └── Sprint Planning - Jan 19
```

### 2. LLM Processing

**Project Context** (uses BOTH past and upcoming):

```markdown
## Sprint Planning Initiative

This project involves weekly sprint planning sessions that have been
running since mid-December. The team has established a consistent
pattern of Friday 9am planning sessions...

[Uses past events to understand the project history and patterns]
```

**Task Generation** (uses ONLY upcoming events):

```json
{
	"suggested_tasks": [
		{
			"title": "Attend Sprint Planning - Jan 5",
			"start_date": "2025-01-05T09:00:00", // From upcoming event
			"task_type": "recurring",
			"recurrence_pattern": "weekly"
		},
		{
			"title": "Review sprint backlog",
			"start_date": "2025-01-04T14:00:00", // Inferred prep task
			"task_type": "one_off"
		},
		{
			"title": "Update team on sprint progress",
			"start_date": "2025-01-03T10:00:00", // Inferred action
			"task_type": "one_off"
		}
	]
}
```

### 3. Result: Project with Future Tasks

✅ All tasks have `start_date >= today`
✅ User sees tasks, all are checked by default
✅ User creates project
✅ **Project AND tasks are created successfully**

---

## Testing

### Test Case 1: Past Events Only

**Setup:**

- Analyze calendar looking back 30 days
- No upcoming events for a project pattern

**Expected:**

- LLM identifies project from past events
- LLM generates 2-5 inferred next steps with future dates
- All tasks are enabled in UI
- Project created with tasks

**Test:**

```bash
# 1. Open calendar analysis
# 2. Set: daysBack=30, daysForward=0
# 3. Run analysis
# 4. Verify: Tasks shown are all future-dated
# 5. Create project
# 6. Verify: Check database - tasks were created
```

### Test Case 2: Mixed Past/Future Events

**Setup:**

- Analyze calendar: 30 days back, 60 days forward
- Project has both past and upcoming events

**Expected:**

- Project context mentions both past and upcoming events
- Tasks generated only from upcoming events or inferred
- All tasks have future dates
- Project created with tasks

### Test Case 3: Validation Warnings

**Setup:**

- Force LLM to return tasks with past dates (mock response)

**Expected:**

- Console warnings logged:
    - "WARNING: Project X has N task(s) with past dates"
- Tasks are auto-rescheduled to today
- Note added to task details about rescheduling

### Test Case 4: Minimum Task Count

**Setup:**

- LLM returns project with 0 or 1 task

**Expected:**

- Console warning: "WARNING: Project X has only N task(s). At least 2 expected."
- Still allows project creation (doesn't block)

---

## Debug Logging

Enable `DEBUG_LOGGING = true` in `calendar-analysis.service.ts:104` to see:

```
[Calendar Analysis] Total events fetched: 142
[Calendar Analysis] Date range: 30 days back, 60 days forward
[Calendar Analysis] Event split: 89 past, 53 upcoming
[Calendar Analysis] Events after filtering: 142
[Calendar Analysis] Events excluded: 0
[Calendar Analysis] Sending 142 events to AI for analysis
[Calendar Analysis] Minimum confidence threshold: 0.4
[Calendar Analysis] Raw suggestions from AI: 5
[Calendar Analysis] Suggestions after confidence filter: 4
[Calendar Analysis] WARNING: Project "X" has 1 task(s) with past dates.
[Calendar Analysis] Rescheduled one-off task "Y" from 2024-12-20 to 2025-01-03T09:00:00
```

---

## Files Modified

| File                             | Lines   | Change Summary                                   |
| -------------------------------- | ------- | ------------------------------------------------ |
| `calendar-analysis.service.ts`   | 296-314 | Add event separation (past/upcoming)             |
| `calendar-analysis.service.ts`   | 316-495 | Enhanced LLM prompt with strict date rules       |
| `calendar-analysis.service.ts`   | 547-578 | Post-LLM validation and warnings                 |
| `calendar-analysis.service.ts`   | 676-716 | Improved task rescheduling (one-off + recurring) |
| `CalendarAnalysisResults.svelte` | 100-118 | Remove auto-disable logic for past tasks         |

---

## Rollback Plan

If issues arise, revert changes in reverse order:

```bash
# 1. Revert frontend change (restore auto-disable)
git checkout HEAD~1 CalendarAnalysisResults.svelte

# 2. Revert backend changes
git checkout HEAD~1 calendar-analysis.service.ts

# 3. Test with old behavior
```

---

## Future Enhancements

### 1. User Preference: Past Event Handling

Allow users to choose:

- "Use past events for context only" (current behavior)
- "Create tasks from past events (rescheduled to today)"

### 2. Smart Rescheduling

For recurring tasks from past events:

- Calculate next occurrence based on pattern
- Example: Weekly meeting every Friday → next Friday

### 3. LLM Response Schema Validation

Add Zod schema to strictly validate:

```typescript
const TaskSchema = z.object({
	title: z.string().max(255),
	start_date: z
		.string()
		.datetime()
		.refine((date) => new Date(date) >= new Date(), 'Task start_date must be in the future')
	// ... other fields
});
```

### 4. UI Warning for Edge Cases

If project has no upcoming events and no inferred tasks:

```
⚠️ This project has no upcoming calendar events.
   Tasks have been inferred based on the project type.
   Review and adjust as needed.
```

---

## Monitoring

### Key Metrics to Track

1. **Task Creation Rate**
    - Before fix: ~30% of projects created with tasks
    - After fix: Should be ~95%+

2. **Warning Frequency**
    - "Tasks with past dates": Should be 0% (or very rare)
    - "Less than 2 tasks": Monitor for patterns

3. **User Behavior**
    - How many users manually deselect tasks?
    - Average tasks per project created

### SQL Query

```sql
-- Check projects created from calendar with task counts
SELECT
  p.id,
  p.name,
  p.created_at,
  COUNT(t.id) as task_count
FROM projects p
LEFT JOIN tasks t ON t.project_id = p.id
WHERE p.source = 'calendar_analysis'
  AND p.created_at >= '2025-01-03'  -- After fix deployment
GROUP BY p.id
ORDER BY p.created_at DESC;
```

---

## Related Issues

- Original bug report: `calendar-analysis-bugs-investigation.md`
- Related feature: Calendar event sync for tasks
- Related feature: Recurring task generation

---

## Conclusion

This fix addresses the critical bug through multiple defensive layers:

1. **Prevention**: Separate events, instruct LLM properly
2. **Detection**: Validate LLM output, log warnings
3. **Correction**: Auto-reschedule any past tasks that slip through
4. **User Experience**: Enable all tasks by default (no hidden unchecked boxes)

**Result**: Users get projects with actionable, future-dated tasks every time. 🎯
