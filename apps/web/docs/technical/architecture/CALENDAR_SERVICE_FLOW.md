<!-- apps/web/docs/technical/architecture/CALENDAR_SERVICE_FLOW.md -->

# Calendar Service Typed Documentation

## Overview

The Calendar Service Typed (`calendar-service.ts`) is a typed service layer that provides direct Google Calendar API integration without MCP tool-calling functionality. It handles all calendar operations including task scheduling, event updates, and recurring event management with full TypeScript type safety.

## Architecture

```
Application Layer → CalendarService → Google Calendar API
                           ↓
                    Database Updates
                    (task_calendar_events)
```

## Key Differences from Original Calendar Service

### Original (MCP-based)

```typescript
// Used executeToolCall with string parameters
await executeToolCall('schedule_task', {
	task_id: taskId,
	start_time: startTime
});
```

### New (Typed)

```typescript
// Direct method calls with typed interfaces
await calendarService.scheduleTask(userId, {
	task_id: taskId,
	start_time: startTime,
	duration_minutes: 60
});
```

## Core Interfaces

### ScheduleTaskParams

```typescript
interface ScheduleTaskParams {
	task_id: string;
	start_time: string;
	duration_minutes: number;
	description?: string;
	timeZone?: string;
	recurrence_pattern?: Database['public']['Enums']['recurrence_pattern_type'];
	recurrence_ends?: string;
}
```

### UpdateCalendarEventParams

```typescript
interface UpdateCalendarEventParams {
	event_id: string;
	calendar_id?: string;
	start_time?: string;
	end_time?: string;
	summary?: string;
	description?: string;
	timeZone?: string;
	recurrence?: string[];
	update_scope?: 'single' | 'all' | 'future';
	instance_date?: string;
}
```

### DeleteCalendarEventParams

```typescript
interface DeleteCalendarEventParams {
	event_id: string;
	calendar_id?: string;
}
```

## Method Implementation Details

### 1. scheduleTask

Schedules a task in Google Calendar and stores the event reference.

```typescript
async scheduleTask(userId: string, params: ScheduleTaskParams)
```

**Process Flow:**

1. Get OAuth credentials for user
2. Build event object with proper formatting
3. Add RRULE if task is recurring
4. Create event in Google Calendar
5. Store reference in `task_calendar_events` table
6. Return success with event details

**Recurring Event Handling:**

- Converts `recurrence_pattern` enum to RRULE format
- Uses `recurrencePatternBuilder` service
- Stores RRULE in `recurrence_rule` column

**Database Operations:**

```sql
INSERT INTO task_calendar_events (
  task_id,
  user_id,
  calendar_event_id,
  calendar_id,
  event_title,
  event_start,
  event_end,
  sync_status,
  sync_source,
  is_master_event,
  recurrence_rule
)
```

### 2. updateCalendarEvent

Updates an existing calendar event with support for recurring event scopes.

```typescript
async updateCalendarEvent(userId: string, params: UpdateCalendarEventParams)
```

**Update Scopes:**

#### Single Instance (`update_scope: 'single'`)

- Updates only one occurrence of a recurring event
- Creates an exception in Google Calendar
- Requires `instance_date` parameter
- Event ID format: `{masterEventId}_{instanceDateTime}`

```typescript
if (update_scope === 'single' && instance_date) {
	const instanceId = `${event_id}_${formatInstanceId(instance_date)}`;
	// Updates specific instance only
}
```

#### All Instances (`update_scope: 'all'`)

- Updates entire recurring series
- Modifies the master event
- Changes apply to all future occurrences
- Past exceptions may be preserved

#### Future Instances (`update_scope: 'future'`)

- Not directly supported by Google Calendar API
- Implemented by ending current series and creating new one
- Requires special handling in application layer

**Database Updates:**

```sql
UPDATE task_calendar_events
SET
  event_title = ?,
  event_start = ?,
  event_end = ?,
  sync_version = sync_version + 1,
  sync_source = 'app',
  series_update_scope = ?,
  updated_at = NOW()
WHERE calendar_event_id = ?
```

### 3. deleteCalendarEvent

Removes an event from Google Calendar and marks as deleted.

```typescript
async deleteCalendarEvent(userId: string, params: DeleteCalendarEventParams)
```

**Process:**

1. Delete from Google Calendar
2. Update database record
3. Set `sync_status = 'deleted'`
4. Preserve record for sync tracking

**Error Handling:**

- 404 errors are non-fatal (event already deleted)
- Still marks as deleted in database
- Returns success for idempotency

### 4. getCalendarEvent

Retrieves event details from Google Calendar.

```typescript
async getCalendarEvent(userId: string, eventId: string, calendarId?: string)
```

**Returns:**

- Event details including recurrence rules
- Start/end times
- Attendees and status
- Used for sync verification

## Recurring Events Architecture

### Database Schema

```sql
task_calendar_events:
  - calendar_event_id: string (Google event ID)
  - recurrence_rule: string (RRULE format)
  - is_master_event: boolean
  - is_exception: boolean
  - exception_type: 'modified' | 'cancelled' | null
  - recurrence_instance_date: string (for exceptions)
  - recurrence_master_id: string (links to master)
  - series_update_scope: 'single' | 'all' | 'future' | null
```

### RRULE Generation

```typescript
// Pattern types from database enum
type RecurrencePattern =
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly';

// Converts to RFC 5545 RRULE
buildRRule(config: RecurrenceConfig): string
  'daily' → 'RRULE:FREQ=DAILY'
  'weekdays' → 'RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR'
  'weekly' → 'RRULE:FREQ=WEEKLY'
  'biweekly' → 'RRULE:FREQ=WEEKLY;INTERVAL=2'
  'monthly' → 'RRULE:FREQ=MONTHLY'
  'quarterly' → 'RRULE:FREQ=MONTHLY;INTERVAL=3'
  'yearly' → 'RRULE:FREQ=YEARLY'
```

### Master Event vs Instances

**Master Event:**

- Single event in Google Calendar with RRULE
- `is_master_event = true` in database
- Contains the recurrence pattern
- Virtual instances generated by Google

**Modified Instances (Exceptions):**

- Created when single instance is modified
- Separate event ID format: `{master_id}_{instance_date}`
- `is_exception = true` in database
- Linked via `recurrence_master_id`

**Cancelled Instances:**

- Marked with `exception_type = 'cancelled'`
- Event deleted from Google Calendar
- Record preserved for tracking

## Sync Source Tracking

### Purpose

Prevents infinite sync loops between Build OS and Google Calendar.

### Implementation

```typescript
// When Build OS makes changes
sync_source: 'app';

// When changes come from Google webhook
sync_source: 'google';

// When system processes
sync_source: 'system';
```

### Usage in Webhook Processing

```typescript
// Skip our own changes echoing back
if (event.sync_source === 'app' && event.updated_at > Date.now() - SYNC_WINDOW) {
	// Skip processing
}
```

## Error Handling

### Rate Limiting

- Exponential backoff implemented
- Max 5 retries with increasing delays
- Handles 429 and 403 quota errors

```typescript
async executeWithBackoff<T>(
  fn: () => Promise<T>,
  retryCount = 0
): Promise<T>
```

### Authentication Errors

- 401 errors trigger re-authentication flow
- OAuth tokens refreshed automatically
- Falls back to user re-authorization

### Network Errors

- Transient failures retried
- Persistent failures logged
- Operations marked as failed in database

## Integration Points

### API Endpoints Using CalendarService

1. **Task Scheduling**
    - `/api/projects/[id]/tasks` - Create tasks with calendar events
    - `/api/projects/[id]/tasks/[taskId]` - Update task scheduling

2. **Recurring Tasks**
    - `/api/tasks/[id]/recurrence` - Manage recurring patterns
    - Handles single/all/future update scopes

3. **Phase Scheduling**
    - `/api/projects/[id]/phases/[phaseId]/schedule` - Schedule phase tasks
    - Batch operations for multiple tasks

4. **Calendar Operations**
    - `/api/calendar/process` - Process calendar operations
    - `/api/calendar/remove-task` - Remove calendar events

### Direct Service Usage

Endpoints now use CalendarService directly instead of HTTP calls:

```typescript
// OLD: HTTP call to another endpoint
await fetch('/api/calendar/process', {
  method: 'POST',
  body: JSON.stringify({
    operation: 'schedule_task',
    data: { ... }
  })
});

// NEW: Direct service call
const calendarService = new CalendarService(supabase);
await calendarService.scheduleTask(userId, { ... });
```

## Best Practices

### DO:

- ✅ Always specify sync_source when updating events
- ✅ Use proper update_scope for recurring events
- ✅ Handle 404 errors gracefully (idempotent deletes)
- ✅ Include instance_date for single occurrence updates
- ✅ Use typed parameters for all methods
- ✅ Let service handle all database operations

### DON'T:

- ❌ Make duplicate database updates outside service
- ❌ Call /api/calendar/process from server-side code
- ❌ Ignore rate limiting (use exponential backoff)
- ❌ Modify sync_version manually
- ❌ Delete task_calendar_events records (mark as deleted)

## Performance Optimizations

### Batch Operations

```typescript
// Process multiple events in single transaction
async processBatchUpdates(events: UpdateEvent[]) {
  const updates = events.map(e => this.updateCalendarEvent(userId, e));
  return Promise.all(updates);
}
```

### Caching

- OAuth clients cached per user
- Calendar API client reused
- Sync tokens stored for incremental sync

### Async Processing

- UI updates optimistically
- Calendar operations in background
- Status updates via real-time subscriptions

## Migration from Original Service

### Step 1: Update Imports

```typescript
// OLD
import { CalendarService } from '$lib/services/calendar-service';

// NEW
import { CalendarService } from '$lib/services/calendar-service';
```

### Step 2: Replace Tool Calls

```typescript
// OLD
await executeToolCall('schedule_task', params);

// NEW
const calendarService = new CalendarService(supabase);
await calendarService.scheduleTask(userId, params);
```

### Step 3: Add Type Safety

```typescript
// Add proper types to parameters
import type { Database } from '$lib/database.types';

const recurrencePattern: Database['public']['Enums']['recurrence_pattern_type'] = 'weekly';
```

## Monitoring & Debugging

### Key Log Points

```typescript
console.log('[CAL_SERVICE] Scheduling task:', { taskId, startTime });
console.log('[CAL_SERVICE] Event created:', { eventId, calendarId });
console.log('[CAL_SERVICE] Update scope:', { scope, instanceDate });
console.log('[CAL_SERVICE] Sync source:', { source, eventId });
```

### Database Queries for Debugging

```sql
-- Check sync status
SELECT
  calendar_event_id,
  sync_status,
  sync_source,
  sync_version,
  updated_at
FROM task_calendar_events
WHERE task_id = ?
ORDER BY updated_at DESC;

-- Find exceptions
SELECT *
FROM task_calendar_events
WHERE is_exception = true
  AND recurrence_master_id = ?;

-- Check update history
SELECT
  series_update_scope,
  sync_source,
  updated_at
FROM task_calendar_events
WHERE calendar_event_id = ?
ORDER BY sync_version DESC;
```

## Common Issues & Solutions

### Issue: Recurring event updates not applying

**Solution:** Ensure `update_scope` is specified and `instance_date` provided for single updates

### Issue: Sync loops occurring

**Solution:** Verify `sync_source` is set to 'app' for all service operations

### Issue: Database column mismatch

**Solution:** Use `recurrence_rule` not `recurrence_pattern` in task_calendar_events

### Issue: Single instance update fails

**Solution:** Check instance_date format and ensure master event exists

### Issue: Rate limit errors

**Solution:** Exponential backoff is automatic, check quota usage in Google Console

## Testing

### Unit Tests

```typescript
describe('CalendarService', () => {
	it('should schedule task with recurrence', async () => {
		const result = await service.scheduleTask(userId, {
			task_id: 'test-123',
			start_time: '2025-01-30T10:00:00Z',
			duration_minutes: 60,
			recurrence_pattern: 'weekly',
			recurrence_ends: '2025-12-31'
		});

		expect(result.success).toBe(true);
		expect(result.event_id).toBeDefined();
	});
});
```

### Integration Tests

- Test with real Google Calendar API (requires OAuth)
- Verify webhook sync doesn't create loops
- Check recurring event exception handling
- Validate update scope behavior

## Future Enhancements

1. **Attendee Management**
    - Add support for inviting attendees
    - Handle RSVP responses
    - Meeting room booking

2. **Advanced Recurrence**
    - Support for complex RRULE patterns
    - Custom recurrence rules
    - Holiday exclusions

3. **Conflict Detection**
    - Check for scheduling conflicts
    - Suggest alternative times
    - Automatic rescheduling

4. **Bulk Operations**
    - Batch schedule multiple tasks
    - Bulk update recurring series
    - Mass deletion with undo

5. **Analytics**
    - Track scheduling patterns
    - Calendar utilization metrics
    - Sync performance monitoring
