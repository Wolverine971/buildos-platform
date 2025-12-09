<!-- apps/web/docs/technical/api/endpoints/calendar.md -->

# Calendar API Endpoints

This document provides comprehensive documentation for all Calendar API endpoints in the BuildOS platform.

## Overview

The Calendar API contains **9 endpoints** for Google Calendar integration, calendar analysis, project calendar management, and webhook operations. All user-facing endpoints require authentication.

**Base Path:** `/api/calendar`

---

## Endpoints

### 1. `POST /api/calendar` - Execute Calendar Operations

**Purpose:** Direct proxy endpoint for CalendarService methods - routes various calendar operations through a single endpoint

**File:** `/apps/web/src/routes/api/calendar/+server.ts`

**Authentication:** Required

#### Request Body

```typescript
{
  method: string;  // Name of CalendarService method to invoke
  params?: any;    // Parameters for that method
}
```

#### Supported Methods

| Method                     | Purpose                        | Parameters                  | Response Type                 |
| -------------------------- | ------------------------------ | --------------------------- | ----------------------------- |
| `hasValidConnection`       | Check if calendar is connected | none                        | `boolean`                     |
| `getCalendarEvents`        | Fetch calendar events          | `GetCalendarEventsParams`   | `CalendarEvent[]`             |
| `findAvailableSlots`       | Find free time slots           | `FindAvailableSlotsParams`  | `AvailableSlot[]`             |
| `scheduleTask`             | Schedule a task to calendar    | `ScheduleTaskParams`        | `ScheduleTaskResponse`        |
| `updateCalendarEvent`      | Update existing event          | `UpdateCalendarEventParams` | `UpdateCalendarEventResponse` |
| `deleteCalendarEvent`      | Delete calendar event          | `DeleteCalendarEventParams` | `DeleteCalendarEventResponse` |
| `bulkDeleteCalendarEvents` | Delete multiple events         | `{ events, options }`       | `BulkDeleteResponse`          |
| `bulkScheduleTasks`        | Schedule multiple tasks        | `{ tasks, options }`        | `BulkScheduleResponse`        |
| `bulkUpdateCalendarEvents` | Update multiple events         | `{ updates, options }`      | `BulkUpdateResponse`          |
| `disconnectCalendar`       | Disconnect user's calendar     | none                        | `{ disconnected: true }`      |

#### Request Parameter Types

**GetCalendarEventsParams:**

```typescript
{
  calendarId?: string;
  timeMin?: string;        // ISO 8601
  timeMax?: string;        // ISO 8601
  maxResults?: number;
  q?: string;              // Search query
  timeZone?: string;
}
```

**FindAvailableSlotsParams:**

```typescript
{
  timeMin: string;         // ISO 8601
  timeMax: string;         // ISO 8601
  duration_minutes?: number;
  calendarId?: string;
  preferred_hours?: number[];
  timeZone?: string;
}
```

**ScheduleTaskParams:**

```typescript
{
  task_id: string;
  start_time: string;      // ISO 8601
  duration_minutes?: number;
  calendar_id?: string;
  description?: string;
  color_id?: string;
  timeZone?: string;
  recurrence_pattern?: 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
  recurrence_ends?: string; // ISO 8601
}
```

**UpdateCalendarEventParams:**

```typescript
{
  event_id: string;
  calendar_id?: string;
  start_time?: string;     // ISO 8601
  end_time?: string;       // ISO 8601
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
  instance_date?: string;  // For single instance updates
}
```

**DeleteCalendarEventParams:**

```typescript
{
  event_id: string;
  calendar_id?: string;
  send_notifications?: boolean;
}
```

#### Response Structure

```typescript
{
  success: true,
  data: any  // Method-specific response
}
```

#### Error Responses

**Connection Required (403):**

```typescript
{
  success: false,
  error: "Calendar not connected",
  requiresAuth: true
}
```

**Rate Limit (429):**

```typescript
{
  success: false,
  error: "Calendar API limit reached. Please try again in a few minutes."
}
```

**Generic Error (500):**

```typescript
{
  success: false,
  error: "Calendar operation failed"
}
```

---

### 2. `GET /api/calendar` - Check Connection Status

**Purpose:** Check calendar connection status

**File:** `/apps/web/src/routes/api/calendar/+server.ts`

**Authentication:** Required

#### Response

```typescript
{
  success: boolean;
  connected: boolean;
  userId: string;
  error?: string;
}
```

---

### 3. `POST /api/calendar/analyze` - Analyze Calendar

**Purpose:** Analyze user's calendar and extract project suggestions using AI

**File:** `/apps/web/src/routes/api/calendar/analyze/+server.ts`

**Authentication:** Required

#### Request Body

```typescript
{
  daysBack?: number;        // Default: 30, Range: 0-365
  daysForward?: number;     // Default: 60, Range: 0-365
  calendarsToAnalyze?: string[];
}
```

#### Validation

- `daysBack`: Must be between 0 and 365
- `daysForward`: Must be between 0 and 365
- Calendar connection required

#### Response

```typescript
{
  success: true,
  data: {
    analysisId: string;
    suggestions: CalendarProjectSuggestion[];
    eventsAnalyzed: number;
  }
}
```

#### Error Responses

- `401 Unauthorized` - No valid session
- `400 Bad Request` - No calendar connected
- `422 Validation Error` - Invalid date ranges
- `500 Internal Error` - Analysis failed

---

### 4. `GET /api/calendar/analyze` - Get Analysis History

**Purpose:** Retrieve calendar analysis history and results

**File:** `/apps/web/src/routes/api/calendar/analyze/+server.ts`

**Authentication:** Required

#### Query Parameters

| Parameter    | Type   | Required | Description                 |
| ------------ | ------ | -------- | --------------------------- |
| `analysisId` | string | No       | Get specific analysis by ID |

#### Response (Without analysisId)

```typescript
{
  success: true,
  data: {
    history: CalendarAnalysis[];
    calendarProjects: CalendarProject[];
  }
}
```

#### Response (With analysisId)

```typescript
{
  success: true,
  data: {
    analysis: CalendarAnalysis;
  }
}
```

---

### 5. `GET /api/calendar/analyze/preferences` - Get Analysis Preferences

**Purpose:** Get user's calendar analysis preferences

**File:** `/apps/web/src/routes/api/calendar/analyze/preferences/+server.ts`

**Authentication:** Required

#### Response

```typescript
{
  success: true,
  data: {
    preferences: {
      user_id: string;
      auto_analyze_on_connect: boolean;
      analysis_frequency: 'manual' | 'weekly' | 'monthly';
      exclude_declined_events: boolean;
      exclude_tentative_events: boolean;
      exclude_all_day_events: boolean;
      exclude_personal_events: boolean;
      minimum_attendees: number;
      minimum_confidence_to_show: number;  // 0-1
      auto_accept_confidence: number;      // 0-1
      create_tasks_from_events: boolean;
    }
  }
}
```

#### Default Preferences

```typescript
{
  auto_analyze_on_connect: false,
  analysis_frequency: 'manual',
  exclude_declined_events: true,
  exclude_tentative_events: false,
  exclude_all_day_events: false,
  exclude_personal_events: true,
  minimum_attendees: 0,
  minimum_confidence_to_show: 0.6,
  auto_accept_confidence: 0.9,
  create_tasks_from_events: true
}
```

---

### 6. `POST /api/calendar/analyze/preferences` - Update Preferences

**Purpose:** Update user's calendar analysis preferences

**File:** `/apps/web/src/routes/api/calendar/analyze/preferences/+server.ts`

**Authentication:** Required

#### Request Body

Accepts partial updates of any preference fields.

#### Validation

| Field                        | Validation    | Error Message                             |
| ---------------------------- | ------------- | ----------------------------------------- |
| `minimum_confidence_to_show` | Number, 0-1   | "must be a number between 0 and 1"        |
| `auto_accept_confidence`     | Number, 0-1   | "must be a number between 0 and 1"        |
| `analysis_frequency`         | Enum          | "must be one of: manual, weekly, monthly" |
| `minimum_attendees`          | Number, 0-100 | "must be a number between 0 and 100"      |

#### Response

```typescript
{
  success: true,
  message: "Preferences updated successfully"
}
```

---

### 7. `POST /api/calendar/analyze/suggestions` - Handle Suggestion

**Purpose:** Accept or reject a single calendar analysis suggestion

**File:** `/apps/web/src/routes/api/calendar/analyze/suggestions/+server.ts`

**Authentication:** Required

#### Request Body

```typescript
{
  suggestionId: string;    // Required
  action: 'accept' | 'reject' | 'defer';  // Required
  modifications?: any;     // Optional modifications when accepting
  reason?: string;         // Optional reason for rejection
}
```

#### Response

```typescript
{
  success: true,
  data: {
    project?: Project;  // Returned if action === 'accept'
  },
  message: "Suggestion accepted/rejected successfully"
}
```

---

### 8. `PATCH /api/calendar/analyze/suggestions` - Batch Handle Suggestions

**Purpose:** Accept or reject multiple suggestions at once

**File:** `/apps/web/src/routes/api/calendar/analyze/suggestions/+server.ts`

**Authentication:** Required

#### Request Body

```typescript
{
	suggestions: Array<{
		suggestionId: string;
		action: 'accept' | 'reject';
		modifications?: any;
		reason?: string;
	}>;
}
```

#### Response

```typescript
{
  success: true,
  data: {
    results: Array<{
      suggestionId: string;
      action: string;
      success: boolean;
      project?: Project;
      error?: string;
    }>
  },
  message: "Processed X suggestion(s) successfully, Y failed"
}
```

#### Processing Logic

- Processes each suggestion sequentially
- Continues processing even if individual suggestions fail
- Returns summary with success/failure counts

---

### 9. `POST /api/calendar/process` - Process Calendar Operations

**Purpose:** Alternative proxy endpoint with additional project calendar methods

**File:** `/apps/web/src/routes/api/calendar/process/+server.ts`

**Authentication:** Required

#### Request Body

```typescript
{
  method: string;
  params?: any;
}
```

#### Supported Methods

**Standard Calendar Methods:**

- `hasValidConnection`
- `disconnectCalendar`
- `getCalendarEvents`
- `findAvailableSlots`
- `scheduleTask`
- `updateCalendarEvent`
- `deleteCalendarEvent`
- `getUpcomingTasks`
- `bulkDeleteCalendarEvents`
- `bulkScheduleTasks`
- `bulkUpdateCalendarEvents`

**Project Calendar Methods:**

- `createProjectCalendar`: Create Google Calendar for project
- `updateCalendarProperties`: Update calendar settings
- `deleteProjectCalendar`: Delete project's calendar
- `listUserCalendars`: List all user calendars
- `shareCalendar`: Share calendar with others
- `unshareCalendar`: Remove calendar sharing

#### Response

```typescript
{
  success: true,
  data: any  // Method-specific response
}
```

#### Error Handling

More sophisticated than `/api/calendar`:

**Reconnection Required (403):**

```typescript
{
  error: "Calendar not connected. Please reconnect your calendar.",
  code: "FORBIDDEN"
}
```

**Rate Limiting (429):**

```typescript
{
  error: "Calendar API limit reached. Please try again in a few minutes.",
  code: "RATE_LIMITED"
}
```

**Not Found (404):**

```typescript
{
  error: "Calendar resource not found",
  code: "NOT_FOUND"
}
```

**Internal Error (500):**

```typescript
{
  error: "Calendar operation failed",
  code: "INTERNAL_ERROR"
}
```

---

### 10. `GET /api/calendar/projects` - List Project Calendars

**Purpose:** List all project calendars for the authenticated user

**File:** `/apps/web/src/routes/api/calendar/projects/+server.ts`

**Authentication:** Required

#### Response

```typescript
{
  success: true,
  data: ProjectCalendar[]
}
```

#### ProjectCalendar Type

```typescript
{
  id: string;
  project_id: string;
  user_id: string;
  calendar_id: string;      // Google Calendar ID
  sync_enabled: boolean;
  color_id?: string;
  created_at: string;
  updated_at: string;
}
```

---

### 11. `POST /api/calendar/remove-task` - Remove Task from Calendar

**Purpose:** Remove a task from Google Calendar

**File:** `/apps/web/src/routes/api/calendar/remove-task/+server.ts`

**Authentication:** Required

#### Request Body

```typescript
{
  event_id: string;         // Required
  calendar_id?: string;     // Optional, defaults to 'primary'
}
```

#### Response (Success)

```typescript
{
  success: true,
  data: {
    message: "Task removed from calendar successfully"
  },
  message: "Task removed from calendar successfully"
}
```

#### Response (Error)

```typescript
{
  error: "Failed to remove calendar event",
  code: "INTERNAL_ERROR",
  status: 500
}
```

#### Processing

1. Calls `CalendarService.deleteCalendarEvent()` with:
    - `event_id`
    - `calendar_id` (defaults to 'primary')
    - `send_notifications: false`

---

### 12. `GET /api/calendar/retry-failed` - Retry Failed Syncs (Cron)

**Purpose:** Cron job endpoint to retry failed calendar sync operations

**File:** `/apps/web/src/routes/api/calendar/retry-failed/+server.ts`

**Authentication:** None (intended for Vercel Cron)

**Note:** Should be protected by Vercel Cron secret in production

#### Query Logic

Finds tasks with failed calendar sync:

```sql
SELECT *
FROM task_calendar_events
WHERE sync_status = 'failed'
  AND last_synced_at >= NOW() - INTERVAL '24 hours'
LIMIT 50
```

#### Processing Strategy

1. **Group by user**: Events grouped by `user_id` for bulk processing
2. **Skip completed tasks**: Ignores tasks with `status = 'done'`
3. **Bulk update**: Uses `bulkUpdateCalendarEvents()` with batch size of 10
4. **Update database**: Updates sync status based on results

#### Response

```typescript
{
	message: string;
	processed: number; // Total events processed
	retried: number; // Successfully retried
	stillFailed: number; // Still failed after retry
	userResults: Array<{
		userId: string;
		updated: number;
		failed: number;
		error?: string;
	}>;
}
```

#### Database Updates

**Success:**

```typescript
{
  sync_status: 'synced',
  sync_error: null,
  last_synced_at: new Date().toISOString()
}
```

**Failure:**

```typescript
{
  sync_error: string,
  last_synced_at: new Date().toISOString()
}
```

#### Batch Processing

- Uses `batchSize: 10` to avoid rate limits
- Processes max 50 events per run

---

### 13. `POST /api/calendar/webhook` - Register Webhook

**Purpose:** Register a Google Calendar webhook for real-time updates

**File:** `/apps/web/src/routes/api/calendar/webhook/+server.ts`

**Authentication:** Required

#### Request Body

No request body required. Webhook URL is constructed from request URL.

#### Webhook URL Construction

```typescript
const webhookUrl = `${protocol}//${host}/webhooks/calendar-events`;
```

Example: `https://buildos.com/webhooks/calendar-events`

#### Response (Success)

```typescript
{
  success: true,
  message: "Webhook registered successfully"
}
```

#### Response (Error)

```typescript
{
  error: string,
  status: 500
}
```

#### Processing Logic

1. Extracts protocol and host from request URL
2. Constructs webhook callback URL
3. Calls `CalendarWebhookService.registerWebhook()`
4. Returns success or error response

---

### 14. `DELETE /api/calendar/webhook` - Unregister Webhook

**Purpose:** Unregister calendar webhook

**File:** `/apps/web/src/routes/api/calendar/webhook/+server.ts`

**Authentication:** Required

#### Response

```typescript
{
  success: true,
  message: "Webhook unregistered"
}
```

#### Processing

1. Calls `CalendarWebhookService.unregisterWebhook()`
2. Returns success response

---

## Common Types

### CalendarEvent

```typescript
interface CalendarEvent {
	id: string;
	summary: string;
	description?: string;
	start: {
		dateTime: string;
		timeZone: string;
	};
	end: {
		dateTime: string;
		timeZone: string;
	};
	attendees?: Array<{
		email: string;
		displayName?: string;
		responseStatus: string;
	}>;
	recurrence?: string[];
	colorId?: string;
}
```

### WebhookChannel

```typescript
interface WebhookChannel {
	id: string;
	user_id: string;
	channel_id: string; // Unique channel ID
	resource_id: string; // Google resource ID
	calendar_id: string; // Calendar being watched
	expiration: number; // Unix timestamp (7 days)
	sync_token: string | null;
	webhook_token: string; // Security token
}
```

**Expiration:** 7 days from registration
**Default Calendar ID:** 'primary'

---

## Authentication

All user-facing endpoints use Supabase session authentication:

```typescript
const { user } = await safeGetSession();
if (!user) {
	return ApiResponse.unauthorized();
}
```

---

## Error Handling

### Common Error Responses

| Scenario               | Status | Code            | Response                     |
| ---------------------- | ------ | --------------- | ---------------------------- |
| Not authenticated      | 401    | UNAUTHORIZED    | `ApiResponse.unauthorized()` |
| Calendar not connected | 403    | FORBIDDEN       | Connection required message  |
| Resource not found     | 404    | NOT_FOUND       | Resource not found message   |
| Rate limited           | 429    | RATE_LIMITED    | Retry message with timing    |
| Invalid input          | 400    | INVALID_REQUEST | Validation error details     |
| Internal error         | 500    | INTERNAL_ERROR  | Generic error message        |

### Error Logging

Most endpoints use `ErrorLoggerService` for error tracking:

```typescript
const errorLogger = ErrorLoggerService.getInstance(supabase);
errorLogger.logError(error, {
  operation: 'operation_name',
  endpoint: 'endpoint_path',
  metadata: { ... }
});
```

---

## Service Dependencies

### CalendarService

Core service for Google Calendar operations. Used by all calendar endpoints.

**Key Methods:**

- `hasValidConnection()`
- `getCalendarEvents()`
- `scheduleTask()`
- `updateCalendarEvent()`
- `deleteCalendarEvent()`
- `bulkScheduleTasks()`
- `bulkDeleteCalendarEvents()`
- `bulkUpdateCalendarEvents()`

### CalendarAnalysisService

AI-powered calendar analysis.

**Used by:**

- `/api/calendar/analyze`
- `/api/calendar/analyze/preferences`
- `/api/calendar/analyze/suggestions`

### ProjectCalendarService

Project-specific calendar management.

**Used by:**

- `/api/calendar/projects`

### CalendarWebhookService

Google Calendar webhook management.

**Used by:**

- `/api/calendar/webhook`

### ErrorLoggerService

Centralized error logging.

**Used by:**

- `/api/calendar/analyze`
- `/api/calendar/analyze/preferences`
- `/api/calendar/analyze/suggestions`

---

## Database Tables

### task_calendar_events

Tracks task-to-calendar-event mappings:

```typescript
{
  id: string;
  task_id: string;
  calendar_event_id: string;
  calendar_id: string;
  sync_status: 'synced' | 'failed' | 'pending';
  sync_error?: string;
  last_synced_at: string;
}
```

### calendar_analyses

Stores calendar analysis runs:

```typescript
{
  id: string;
  user_id: string;
  date_range_start: string;
  date_range_end: string;
  calendars_analyzed: string[];
  status: string;
  created_at: string;
}
```

### calendar_project_suggestions

AI-generated project suggestions:

```typescript
{
  id: string;
  analysis_id: string;
  name: string;
  confidence: number;        // 0-1
  event_ids: string[];
  status: 'pending' | 'accepted' | 'rejected';
}
```

### calendar_analysis_preferences

User preferences for calendar analysis:

```typescript
{
	user_id: string;
	auto_analyze_on_connect: boolean;
	analysis_frequency: 'manual' | 'weekly' | 'monthly';
	exclude_declined_events: boolean;
	minimum_confidence_to_show: number;
	auto_accept_confidence: number;
}
```

### project_calendars

Maps projects to Google Calendars:

```typescript
{
	id: string;
	project_id: string;
	user_id: string;
	calendar_id: string; // Google Calendar ID
	sync_enabled: boolean;
}
```

---

## Rate Limiting and Quotas

### Google Calendar API Limits

The endpoints handle Google Calendar API rate limits:

**Error Detection:**

```typescript
if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
	return json(
		{
			success: false,
			error: 'Calendar API limit reached. Please try again in a few minutes.'
		},
		{ status: 429 }
	);
}
```

**Retry Strategy:**

- Max 50 events per cron run
- Batch size of 10 for bulk updates
- 24-hour window for failed events

---

## Caching Strategy

None of the calendar endpoints currently implement caching, likely because:

1. Calendar data changes frequently
2. Real-time accuracy is important
3. User-specific data shouldn't be cached publicly

The `ApiResponse` helper does support caching via `cacheConfig` parameter, but it's not used in calendar endpoints.

---

## Usage Examples

### Check Calendar Connection

```typescript
const response = await fetch('/api/calendar');
const { connected, userId } = await response.json();
```

### Schedule a Task

```typescript
const response = await fetch('/api/calendar', {
	method: 'POST',
	body: JSON.stringify({
		method: 'scheduleTask',
		params: {
			task_id: 'uuid',
			start_time: '2025-10-06T09:00:00Z',
			duration_minutes: 60,
			description: 'Task details'
		}
	})
});
```

### Run Calendar Analysis

```typescript
const response = await fetch('/api/calendar/analyze', {
	method: 'POST',
	body: JSON.stringify({
		daysBack: 30,
		daysForward: 60
	})
});
const { analysisId, suggestions } = await response.json();
```

### Accept a Suggestion

```typescript
const response = await fetch('/api/calendar/analyze/suggestions', {
	method: 'POST',
	body: JSON.stringify({
		suggestionId: 'uuid',
		action: 'accept',
		modifications: {
			name: 'Updated Project Name'
		}
	})
});
```

### Bulk Schedule Tasks

```typescript
const response = await fetch('/api/calendar/process', {
	method: 'POST',
	body: JSON.stringify({
		method: 'bulkScheduleTasks',
		params: {
			tasks: [
				{ task_id: 'uuid1', start_time: '2025-10-06T09:00:00Z' },
				{ task_id: 'uuid2', start_time: '2025-10-06T10:00:00Z' }
			],
			options: { batchSize: 10 }
		}
	})
});
```

---

## Related Documentation

- **Calendar Service:** `/apps/web/src/lib/services/calendar-service.ts`
- **Calendar Analysis Service:** `/apps/web/src/lib/services/calendar-analysis-service.ts`
- **Project Calendar Service:** `/apps/web/src/lib/services/project-calendar-service.ts`
- **Webhook Service:** `/apps/web/src/lib/services/calendar-webhook-service.ts`
- **Error Logger:** `/apps/web/src/lib/services/error-logger-service.ts`
