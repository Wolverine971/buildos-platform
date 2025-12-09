<!-- apps/web/docs/technical/calendar/CALENDAR_EVENT_TRACKING.md -->

# Calendar Event Tracking - Organizer & Attendee Support

**Status**: ✅ Implemented
**Date**: 2025-10-12
**Migration**: `20251012_add_calendar_event_organizer_fields.sql`

## Overview

BuildOS now tracks calendar event ownership (organizer) and attendee information for all task calendar events. This enables:

- **Smart rescheduling decisions** - Don't reschedule events the user doesn't own
- **Attendee notifications** - Notify attendees when events are rescheduled
- **Collaboration support** - Prepare for multi-user task assignments
- **External event integration** - Handle events created outside BuildOS

---

## Database Schema Changes

### New Columns in `task_calendar_events`

| Column                   | Type    | Nullable | Default | Description                             |
| ------------------------ | ------- | -------- | ------- | --------------------------------------- |
| `organizer_email`        | TEXT    | Yes      | NULL    | Email of the event organizer            |
| `organizer_display_name` | TEXT    | Yes      | NULL    | Display name of organizer               |
| `organizer_self`         | BOOLEAN | Yes      | TRUE    | TRUE if authenticated user is organizer |
| `attendees`              | JSONB   | Yes      | `[]`    | Array of attendee objects               |

### Indexes

```sql
-- Fast organizer ownership lookups
CREATE INDEX idx_task_calendar_events_organizer_self
ON task_calendar_events(organizer_self);

-- GIN index for attendee searches
CREATE INDEX idx_task_calendar_events_attendees
ON task_calendar_events USING GIN(attendees);
```

### Attendees JSONB Structure

```json
[
	{
		"email": "attendee@example.com",
		"displayName": "John Doe",
		"organizer": false,
		"self": false,
		"responseStatus": "accepted",
		"comment": "Looking forward to it!",
		"additionalGuests": 0
	}
]
```

**Response Status Values**: `"accepted"` | `"declined"` | `"tentative"` | `"needsAction"`

---

## CalendarService Implementation

### New Type: `CalendarSendUpdatesOption`

```typescript
export type CalendarSendUpdatesOption = 'all' | 'externalOnly' | 'none';
```

Used to control attendee notifications when updating events.

### Updated Interfaces

#### `UpdateCalendarEventParams`

```typescript
export interface UpdateCalendarEventParams {
	event_id: string;
	calendar_id?: string;
	start_time?: string;
	end_time?: string;
	summary?: string;
	description?: string;
	location?: string;
	attendees?: Array<{
		email: string;
		displayName?: string;
		optional?: boolean;
		responseStatus?: string;
	}>;
	timeZone?: string;
	recurrence?: string[] | string | null;
	update_scope?: 'single' | 'all' | 'future';
	instance_date?: string;
	sendUpdates?: CalendarSendUpdatesOption; // NEW
}
```

### Private Helper Methods

The service includes three private helpers for normalizing Google Calendar API responses:

#### 1. `extractOrganizerMetadata(event)`

Extracts organizer information from a Google Calendar event.

```typescript
private extractOrganizerMetadata(event: calendar_v3.Schema$Event | null | undefined): {
  organizer_email: string | null;
  organizer_display_name: string | null;
  organizer_self: boolean | null;
}
```

**Returns**:

- `organizer_email`: Email address of organizer
- `organizer_display_name`: Display name (if available)
- `organizer_self`: TRUE if current user is organizer, NULL if unknown

#### 2. `normalizeAttendees(attendees)`

Normalizes attendee array from Google Calendar API to our storage format.

```typescript
private normalizeAttendees(attendees: calendar_v3.Schema$EventAttendee[] | null | undefined): Array<{
  email: string;
  displayName?: string;
  organizer?: boolean;
  self?: boolean;
  responseStatus: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  comment?: string;
  additionalGuests?: number;
}>
```

**Features**:

- Filters out attendees without email addresses
- Normalizes response status to our enum type
- Handles undefined/null fields gracefully
- Preserves all attendee metadata

#### 3. `normalizeAttendeeResponseStatus(status)`

Maps Google Calendar response status to our type-safe enum.

```typescript
private normalizeAttendeeResponseStatus(
  status: string | null | undefined
): 'accepted' | 'declined' | 'tentative' | 'needsAction'
```

**Fallback**: Returns `'needsAction'` for unknown/invalid values.

---

## Updated Methods

### `scheduleTask()` - Lines 356-383

Now captures organizer and attendees when creating events:

```typescript
const organizerMetadata = this.extractOrganizerMetadata(response.data);
const attendeesForStorage = this.normalizeAttendees(response.data.attendees);

await this.supabase.from('task_calendar_events').upsert({
	user_id: userId,
	task_id: task_id,
	calendar_event_id: response.data.id!,
	// ... existing fields ...
	organizer_email: organizerMetadata.organizer_email,
	organizer_display_name: organizerMetadata.organizer_display_name,
	organizer_self: organizerMetadata.organizer_self,
	attendees: attendeesForStorage
});
```

**Key Points**:

- Organizer metadata extracted from API response
- Attendees normalized and stored as JSONB
- No additional API call required (data already in response)

### `updateCalendarEvent()` - Lines 538-577, 822

Now supports `sendUpdates` parameter and syncs organizer/attendees:

```typescript
// Pass sendUpdates to Google Calendar API
const response = await calendar.events.update({
	calendarId: calendar_id,
	eventId: effectiveEventId,
	requestBody: updatePayload,
	sendUpdates // NEW: 'all' | 'externalOnly' | 'none'
});

// Extract and store metadata
const organizerMetadata = this.extractOrganizerMetadata(response.data);
const attendeesForStorage = this.normalizeAttendees(response.data.attendees);

// Update database record
await this.supabase
	.from('task_calendar_events')
	.update({
		// ... existing fields ...
		organizer_email: organizerMetadata.organizer_email,
		organizer_display_name: organizerMetadata.organizer_display_name,
		organizer_self: organizerMetadata.organizer_self,
		attendees: attendeesForStorage
	})
	.eq('calendar_event_id', event_id);
```

**Features**:

- Updates metadata on every sync
- Supports single instance updates (recurring events)
- Tracks attendee changes over time

---

## Usage Examples

### Check Event Ownership

```typescript
const { data: event } = await supabase
	.from('task_calendar_events')
	.select('organizer_self, organizer_email')
	.eq('id', eventId)
	.single();

if (event.organizer_self === false) {
	console.warn('User does not own this event - cannot reschedule');
	return;
}
```

### Check for Attendees

```typescript
const { data: event } = await supabase
	.from('task_calendar_events')
	.select('attendees')
	.eq('id', eventId)
	.single();

const hasAttendees = event.attendees && event.attendees.length > 0;

if (hasAttendees) {
	// Notify attendees about changes
	await calendarService.updateCalendarEvent(userId, {
		event_id: eventId,
		start_time: newStartTime,
		sendUpdates: 'all' // Notify all attendees
	});
}
```

### Update Event with Attendee Notifications

```typescript
import { CalendarService } from '$lib/services/calendar-service';

const calendarService = new CalendarService(supabase);

await calendarService.updateCalendarEvent(userId, {
	event_id: 'event_123',
	start_time: '2025-10-15T10:00:00Z',
	end_time: '2025-10-15T11:00:00Z',
	sendUpdates: 'all' // Options: 'all' | 'externalOnly' | 'none'
});
```

### Query Events by Ownership

```typescript
// Get only user-owned events
const { data: ownedEvents } = await supabase
	.from('task_calendar_events')
	.select('*')
	.eq('user_id', userId)
	.eq('organizer_self', true);

// Get external events (not owned by user)
const { data: externalEvents } = await supabase
	.from('task_calendar_events')
	.select('*')
	.eq('user_id', userId)
	.eq('organizer_self', false);
```

### Find Events with Specific Attendee

```typescript
// Using JSONB contains operator
const { data: events } = await supabase
	.from('task_calendar_events')
	.select('*')
	.contains('attendees', [{ email: 'john@example.com' }]);
```

### Count Attendees

```typescript
const { data: event } = await supabase
	.from('task_calendar_events')
	.select('attendees')
	.eq('id', eventId)
	.single();

const attendeeCount = event.attendees?.length || 0;
const confirmedCount = event.attendees?.filter((a) => a.responseStatus === 'accepted').length || 0;
```

---

## Google Calendar API: `sendUpdates` Parameter

### Documentation

https://developers.google.com/workspace/calendar/api/v3/reference/events/update

### Values

| Value            | Behavior                                      | Use Case                   |
| ---------------- | --------------------------------------------- | -------------------------- |
| `'all'`          | Send notifications to **all** guests          | Event with attendees       |
| `'externalOnly'` | Send to **non-Google Calendar** guests only   | Mixed attendee list        |
| `'none'`         | **No notifications** (some may still be sent) | Solo user events (default) |

### When to Use

**Use `'all'`**:

- Event has attendees
- User is the organizer
- Time/date/location changed

**Use `'externalOnly'`**:

- Mix of Google and external users
- Want to limit notification noise

**Use `'none'`** (default):

- Single-user events
- Internal system operations
- Bulk operations

### Implementation Pattern

```typescript
// Determine if we should notify attendees
const hasAttendees = event.attendees && event.attendees.length > 0;
const isOrganizer = event.organizer_self !== false;

const sendUpdates: CalendarSendUpdatesOption = hasAttendees && isOrganizer ? 'all' : 'none';

await calendarService.updateCalendarEvent(userId, {
	event_id: eventId,
	start_time: newTime,
	sendUpdates
});
```

---

## Phase Generation Integration

### Smart Rescheduling Logic

When regenerating phases, the system now checks event ownership and attendees:

```typescript
async function updateExistingCalendarEvents(
	tasks: Task[],
	config: PhaseGenerationConfig,
	calendarService: CalendarService
): Promise<void> {
	for (const task of tasks) {
		for (const calEvent of task.task_calendar_events) {
			// Check ownership
			if (calEvent.organizer_self === false) {
				console.warn(
					`Cannot update event ${calEvent.calendar_event_id} - not owned by user`
				);
				continue; // Skip - user doesn't own it
			}

			// Check if recurring with attendees
			if (
				task.task_type === 'recurring' &&
				calEvent.attendees &&
				calEvent.attendees.length > 0
			) {
				console.warn(
					`Cannot update recurring event ${calEvent.calendar_event_id} - has attendees`
				);
				continue; // Skip - too disruptive
			}

			// Safe to update - notify attendees if present
			const hasAttendees = calEvent.attendees && calEvent.attendees.length > 0;

			await calendarService.updateCalendarEvent(config.userId, {
				event_id: calEvent.calendar_event_id,
				calendar_id: calEvent.calendar_id,
				start_time: task.start_date!,
				end_time: calculateEndTime(task),
				sendUpdates: hasAttendees ? 'all' : 'none'
			});
		}
	}
}
```

### Decision Tree

```
Task needs rescheduling
├─ Has calendar event?
│  ├─ No → Create new event
│  └─ Yes
│     ├─ organizer_self === false? → SKIP (cannot update)
│     ├─ Recurring + has attendees? → SKIP (too disruptive)
│     └─ Else → UPDATE
│        ├─ Has attendees? → sendUpdates: 'all'
│        └─ No attendees? → sendUpdates: 'none'
```

---

## Migration Guide

### Running the Migration

```bash
# Apply migration
psql $DATABASE_URL -f supabase/migrations/20251012_add_calendar_event_organizer_fields.sql
```

### Post-Migration Data Backfill

**Option 1: Let new syncs populate naturally**

- New events automatically get organizer/attendee data
- Existing events updated on next sync/modification
- **Recommended** for most cases

**Option 2: Manual backfill (advanced)**

```typescript
// Fetch all task_calendar_events without organizer data
const { data: events } = await supabase
	.from('task_calendar_events')
	.select('*')
	.is('organizer_email', null);

const calendarService = new CalendarService(supabase);

// Re-fetch events from Google Calendar to get organizer/attendees
for (const event of events) {
	try {
		const gcalEvent = await calendarService.getCalendarEvents(event.user_id, {
			calendarId: event.calendar_id
		});

		// Extract event and update database
		// (Implementation left as exercise - requires matching by event_id)
	} catch (error) {
		console.error(`Failed to backfill event ${event.id}:`, error);
	}
}
```

**Note**: Backfill not required for normal operation. Data populates incrementally.

---

## Testing

### Unit Tests

Test the helper methods:

```typescript
describe('CalendarService - Organizer/Attendee Tracking', () => {
	it('should extract organizer metadata', () => {
		const event = {
			organizer: {
				email: 'user@example.com',
				displayName: 'User Name',
				self: true
			}
		};

		const result = extractOrganizerMetadata(event);

		expect(result.organizer_email).toBe('user@example.com');
		expect(result.organizer_display_name).toBe('User Name');
		expect(result.organizer_self).toBe(true);
	});

	it('should normalize attendees array', () => {
		const attendees = [
			{
				email: 'attendee1@example.com',
				responseStatus: 'accepted'
			},
			{
				email: 'attendee2@example.com',
				responseStatus: 'invalid_status' // Should fallback to needsAction
			}
		];

		const result = normalizeAttendees(attendees);

		expect(result[0].responseStatus).toBe('accepted');
		expect(result[1].responseStatus).toBe('needsAction');
	});
});
```

### Integration Tests

Test full event lifecycle:

```typescript
describe('CalendarService - Full Lifecycle', () => {
	it('should store organizer and attendees when scheduling task', async () => {
		const response = await calendarService.scheduleTask(userId, {
			task_id: 'task_123',
			start_time: '2025-10-15T10:00:00Z',
			duration_minutes: 60
		});

		expect(response.success).toBe(true);

		// Verify database record
		const { data: event } = await supabase
			.from('task_calendar_events')
			.select('organizer_email, organizer_self, attendees')
			.eq('task_id', 'task_123')
			.single();

		expect(event.organizer_email).toBeDefined();
		expect(event.organizer_self).toBe(true); // User created it
		expect(Array.isArray(event.attendees)).toBe(true);
	});

	it('should notify attendees when updating event', async () => {
		// Setup: Create event with attendees
		// ...

		// Update with sendUpdates
		await calendarService.updateCalendarEvent(userId, {
			event_id: 'event_123',
			start_time: '2025-10-16T10:00:00Z',
			sendUpdates: 'all'
		});

		// Verify metadata updated
		const { data: event } = await supabase
			.from('task_calendar_events')
			.select('*')
			.eq('calendar_event_id', 'event_123')
			.single();

		expect(event.organizer_email).toBeDefined();
		expect(event.attendees).toBeDefined();
	});
});
```

---

## Troubleshooting

### Issue: `organizer_self` is always NULL

**Cause**: Event fetched before user authenticated or from shared calendar.

**Solution**: Check OAuth connection. Re-sync event.

```typescript
const isConnected = await calendarService.hasValidConnection(userId);
if (!isConnected) {
	// Reconnect OAuth
	await redirectToGoogleOAuth();
}
```

### Issue: Attendees not appearing

**Cause**: Event has no attendees, or Google Calendar API didn't return them.

**Solution**: Attendees only present if event was created with them. Check Google Calendar UI.

```typescript
// Verify in Google Calendar API directly
const gcalEvent = await calendarService.getCalendarEvents(userId, {
	calendarId: 'primary'
});

console.log(gcalEvent.events[0].attendees); // Check what Google returns
```

### Issue: `sendUpdates` not working

**Cause**: Google Calendar API may ignore parameter for certain event types.

**Solution**: Verify event is multi-attendee and user is organizer.

```typescript
const { data: event } = await supabase
	.from('task_calendar_events')
	.select('organizer_self, attendees')
	.eq('id', eventId)
	.single();

console.log('Can send updates:', event.organizer_self && event.attendees?.length > 0);
```

---

## Performance Considerations

### Indexes

Both new indexes are lightweight:

```sql
-- B-tree index on boolean (very efficient)
CREATE INDEX idx_task_calendar_events_organizer_self
ON task_calendar_events(organizer_self);

-- GIN index on JSONB (efficient for contains queries)
CREATE INDEX idx_task_calendar_events_attendees
ON task_calendar_events USING GIN(attendees);
```

**Impact**: Minimal. Indexes add ~5KB per 1000 records.

### JSONB Storage

Attendees stored as JSONB for:

- **Flexibility**: No schema changes for new fields
- **Query power**: Can search within attendee objects
- **Compression**: PostgreSQL compresses JSONB efficiently

**Typical size**: 100-500 bytes per event (depends on attendee count).

### API Call Overhead

No additional API calls required:

- Organizer/attendees already in `events.insert` response
- Organizer/attendees already in `events.update` response
- No performance impact

---

## Future Enhancements

### Multi-User Collaboration

With organizer/attendees tracked, we can support:

- Assigning tasks to multiple users
- Shared calendar events
- Team task scheduling
- RSVP tracking

### Meeting Analytics

Query patterns like:

- "Which tasks have declined attendees?"
- "How many meetings am I organizing vs attending?"
- "Who are my most common collaborators?"

### Smart Conflict Resolution

- Don't reschedule events where user is an attendee (not organizer)
- Suggest alternative times based on all attendees' availability
- Warn about scheduling conflicts with multi-attendee events

---

## Related Documentation

- **Specification**: `/thoughts/shared/research/2025-10-12_22-51-12_phase-generation-procedural-redesign-spec.md`
- **Migration**: `/supabase/migrations/20251012_add_calendar_event_organizer_fields.sql`
- **Calendar Service**: `/apps/web/src/lib/services/calendar-service.ts`
- **Database Types**: `/packages/shared-types/src/database.types.ts`
- **Phase Generation**: `/apps/web/src/lib/services/phase-generation/`

---

## Changelog

### 2025-10-12 - Initial Implementation

- ✅ Added `organizer_*` columns to `task_calendar_events`
- ✅ Added `attendees` JSONB column
- ✅ Implemented helper methods in `CalendarService`
- ✅ Added `sendUpdates` parameter support
- ✅ Updated TypeScript types
- ✅ Created indexes for performance
- ✅ Documentation complete

---

**Questions?** See the specification document or ask in #engineering-calendar channel.
