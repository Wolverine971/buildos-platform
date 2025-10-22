---
title: 'Calendar Integration System Research'
date: 2025-10-08
type: research
tags: [calendar, google-calendar, architecture, database, api]
status: complete
---

# Calendar Integration System Research

## Executive Summary

BuildOS has a comprehensive Google Calendar integration system that provides:

- Two-way sync between tasks and calendar events
- AI-powered calendar analysis to detect project patterns
- Per-project Google Calendar creation
- Webhook-based real-time updates
- Recurring event support with full RRULE handling

---

## 1. How Calendar Events are Fetched for Users

### Primary Method: CalendarService.getCalendarEvents()

**Location:** `/apps/web/src/lib/services/calendar-service.ts`

```typescript
async getCalendarEvents(
  userId: string,
  params: GetCalendarEventsParams = {}
): Promise<GetCalendarEventsResponse>
```

### Parameters (GetCalendarEventsParams):

```typescript
{
  calendarId?: string;        // Default: 'primary'
  timeMin?: string;          // ISO 8601, default: now
  timeMax?: string;          // ISO 8601, default: 7 days from now
  maxResults?: number;       // Default: 50
  q?: string;                // Search query
  timeZone?: string;         // Timezone for the query
}
```

### How It Works:

1. Gets authenticated OAuth client for user via `GoogleOAuthService`
2. Calls Google Calendar API's `events.list()` endpoint
3. Requests single events (`singleEvents: true`)
4. Orders by start time (`orderBy: 'startTime'`)
5. Returns complete event data with **ALL fields preserved**

### API Endpoints That Use This:

- `POST /api/calendar` - Main calendar operations proxy
- `POST /api/calendar/analyze` - Calendar analysis (for pattern detection)
- `GET /api/projects/[id]/calendar` - Project-specific calendar events

---

## 2. Database Schema for Calendar Events

### Core Tables

#### **task_calendar_events** (Primary sync table)

Links BuildOS tasks to Google Calendar events.

```sql
task_calendar_events:
  id: UUID (PK)
  task_id: UUID → tasks.id
  user_id: UUID → auth.users(id)

  -- Google Calendar identifiers
  calendar_id: TEXT              -- Google Calendar ID (e.g., 'primary' or custom calendar ID)
  calendar_event_id: TEXT        -- Google event ID
  event_link: TEXT               -- HTML link to event in Google Calendar

  -- Event data snapshot
  event_title: TEXT
  event_start: TIMESTAMP WITH TIME ZONE
  event_end: TIMESTAMP WITH TIME ZONE

  -- Recurring events support
  is_master_event: BOOLEAN       -- True if this is the master event with RRULE
  recurrence_rule: TEXT          -- RRULE string (e.g., 'RRULE:FREQ=WEEKLY')
  is_exception: BOOLEAN          -- True if modified instance of recurring event
  exception_type: TEXT           -- 'modified' | 'cancelled' | null
  recurrence_master_id: TEXT     -- Points to master event ID for exceptions
  recurrence_instance_date: TEXT -- Specific instance date for exceptions
  original_start_time: TEXT      -- Original start time before modification

  -- Update scope tracking
  series_update_scope: TEXT      -- 'single' | 'all' | 'future' | null

  -- Sync tracking
  sync_status: TEXT              -- 'synced' | 'failed' | 'pending' | 'deleted'
  sync_source: TEXT              -- 'app' | 'google' | 'system'
  sync_error: TEXT
  sync_version: INTEGER          -- Incremented on each update
  last_synced_at: TIMESTAMP

  -- Project calendar relationship
  project_calendar_id: UUID → project_calendars.id

  created_at: TIMESTAMP
  updated_at: TIMESTAMP
```

**Key Indexes:**

```sql
idx_task_calendar_events_task_id (task_id)
idx_task_calendar_events_user_id (user_id)
idx_task_calendar_events_calendar_event_id (calendar_event_id)
idx_task_calendar_events_sync_status (sync_status) WHERE sync_status != 'synced'
```

#### **project_calendars** (Per-project calendars)

Allows each project to have its own Google Calendar.

```sql
project_calendars:
  id: UUID (PK)
  project_id: UUID → projects.id
  user_id: UUID → auth.users(id)

  -- Google Calendar info
  calendar_id: TEXT              -- Google Calendar ID
  calendar_name: TEXT
  color_id: TEXT                 -- Google Calendar color (1-24)
  hex_color: TEXT                -- Hex color code

  -- Settings
  sync_enabled: BOOLEAN          -- Enable/disable sync for this calendar
  is_primary: BOOLEAN            -- Is this the user's primary calendar
  visibility: TEXT               -- 'public' | 'private' | 'default'

  -- Sync status
  sync_status: TEXT              -- 'active' | 'paused' | 'error'
  sync_error: TEXT
  last_synced_at: TIMESTAMP

  created_at: TIMESTAMP
  updated_at: TIMESTAMP
```

#### **calendar_analyses** (AI analysis runs)

Tracks calendar analysis sessions that detect project patterns.

```sql
calendar_analyses:
  id: UUID (PK)
  user_id: UUID → auth.users(id)

  -- Analysis metadata
  status: TEXT                   -- 'processing' | 'completed' | 'failed' | 'cancelled'
  started_at: TIMESTAMP
  completed_at: TIMESTAMP

  -- Date range analyzed
  date_range_start: DATE
  date_range_end: DATE
  calendars_analyzed: TEXT[]     -- Array of calendar IDs
  events_analyzed: INTEGER
  events_excluded: INTEGER       -- Filtered out events

  -- Results
  projects_suggested: INTEGER
  projects_created: INTEGER
  tasks_created: INTEGER
  confidence_average: FLOAT      -- Average confidence of suggestions

  -- Processing metadata
  ai_model: TEXT                 -- LLM model used
  ai_model_version: TEXT
  processing_time_ms: INTEGER
  total_tokens_used: INTEGER
  error_message: TEXT

  -- User feedback
  user_feedback: TEXT
  user_rating: INTEGER (1-5)

  created_at: TIMESTAMP
  updated_at: TIMESTAMP
```

#### **calendar_project_suggestions** (AI-detected projects)

Stores AI-generated project suggestions from calendar patterns.

```sql
calendar_project_suggestions:
  id: UUID (PK)
  analysis_id: UUID → calendar_analyses.id
  user_id: UUID → auth.users(id)

  -- Suggestion details
  suggested_name: TEXT
  suggested_description: TEXT
  suggested_context: TEXT         -- Rich markdown context
  confidence_score: FLOAT (0-1)   -- AI confidence level

  -- Related events
  calendar_event_ids: TEXT[]      -- Google Calendar event IDs
  calendar_ids: TEXT[]            -- Source calendar IDs
  event_count: INTEGER

  -- Event patterns detected (JSONB)
  event_patterns: JSONB
  /* Example:
  {
    "recurring": true,
    "frequency": "weekly",
    "meeting_series": ["Weekly Product Sync"],
    "common_attendees": ["john@company.com"],
    "project_indicators": ["sprint", "milestone"],
    "date_range": {
      "start": "2025-01-01",
      "end": "2025-03-31"
    }
  }
  */

  -- AI reasoning
  ai_reasoning: TEXT              -- Why AI suggested this project
  detected_keywords: TEXT[]
  suggested_priority: TEXT        -- 'low' | 'medium' | 'high' | 'urgent'

  -- Suggested tasks (JSONB)
  suggested_tasks: JSONB
  /* Example:
  [
    {
      "title": "Sprint Planning",
      "description": "Plan next sprint tasks",
      "event_id": "google_event_123",
      "date": "2025-02-01"
    }
  ]
  */

  -- User modifications
  user_modified_name: TEXT
  user_modified_description: TEXT
  user_modified_context: TEXT

  -- User action
  status: TEXT                    -- 'pending' | 'accepted' | 'rejected' | 'modified' | 'deferred'
  status_changed_at: TIMESTAMP
  rejection_reason: TEXT

  -- Result (if accepted)
  created_project_id: UUID → projects.id
  tasks_created_count: INTEGER

  created_at: TIMESTAMP
  updated_at: TIMESTAMP
```

#### **calendar_analysis_events** (Event snapshots)

Preserves event state at time of analysis.

```sql
calendar_analysis_events:
  id: UUID (PK)
  analysis_id: UUID → calendar_analyses.id
  suggestion_id: UUID → calendar_project_suggestions.id

  -- Event identifiers
  calendar_id: TEXT
  calendar_event_id: TEXT

  -- Event snapshot (at analysis time)
  event_title: TEXT
  event_description: TEXT
  event_start: TIMESTAMP
  event_end: TIMESTAMP
  event_location: TEXT

  -- Event metadata
  is_recurring: BOOLEAN
  recurrence_pattern: TEXT
  is_organizer: BOOLEAN
  attendee_count: INTEGER
  attendee_emails: TEXT[]

  -- Inclusion tracking
  included_in_analysis: BOOLEAN
  exclusion_reason: TEXT          -- e.g., 'declined', 'personal', 'all-hands'

  created_at: TIMESTAMP

  UNIQUE(analysis_id, calendar_event_id)
```

#### **calendar_analysis_preferences** (User settings)

Per-user preferences for calendar analysis.

```sql
calendar_analysis_preferences:
  id: UUID (PK)
  user_id: UUID → auth.users(id)

  -- Analysis preferences
  auto_analyze_on_connect: BOOLEAN      -- Default: false
  analysis_frequency: TEXT              -- 'manual' | 'weekly' | 'monthly'
  last_auto_analysis_at: TIMESTAMP

  -- Filtering preferences
  exclude_declined_events: BOOLEAN      -- Default: true
  exclude_tentative_events: BOOLEAN     -- Default: false
  exclude_all_day_events: BOOLEAN       -- Default: false
  exclude_personal_events: BOOLEAN      -- Default: true
  minimum_attendees: INTEGER            -- Default: 0

  -- Suggestion preferences
  minimum_confidence_to_show: FLOAT     -- Default: 0.6 (60%)
  auto_accept_confidence: FLOAT         -- Default: 0.9 (90%)
  create_tasks_from_events: BOOLEAN     -- Default: true

  -- Calendar filtering
  included_calendar_ids: TEXT[]         -- null means all
  excluded_calendar_ids: TEXT[]

  created_at: TIMESTAMP
  updated_at: TIMESTAMP

  UNIQUE(user_id)
```

#### **calendar_webhook_channels** (Real-time sync)

Manages Google Calendar webhook subscriptions.

```sql
calendar_webhook_channels:
  id: UUID (PK)
  user_id: UUID → auth.users(id)

  -- Google webhook info
  channel_id: TEXT                -- Unique channel ID
  resource_id: TEXT               -- Google resource ID
  calendar_id: TEXT               -- Calendar being watched
  expiration: INTEGER             -- Unix timestamp (7 days max)

  -- Sync token for incremental updates
  sync_token: TEXT

  -- Security
  webhook_token: TEXT             -- Verification token

  created_at: TIMESTAMP
  updated_at: TIMESTAMP
```

#### **user_calendar_tokens** (OAuth credentials)

Stores Google OAuth tokens for calendar access.

```sql
user_calendar_tokens:
  id: UUID (PK)
  user_id: UUID → auth.users(id)

  -- OAuth tokens
  access_token: TEXT              -- Encrypted
  refresh_token: TEXT             -- Encrypted
  token_type: TEXT                -- Usually 'Bearer'
  expiry_date: INTEGER            -- Unix timestamp
  scope: TEXT                     -- OAuth scopes granted

  -- Google account info
  google_user_id: TEXT
  google_email: TEXT

  created_at: TIMESTAMP
  updated_at: TIMESTAMP
```

---

## 3. API Endpoints for Calendar Data

### Core Calendar Endpoints

#### **POST /api/calendar** - Execute Calendar Operations

Main proxy endpoint for CalendarService methods.

**Location:** `/apps/web/src/routes/api/calendar/+server.ts`

**Request:**

```typescript
{
  method: string;    // CalendarService method name
  params?: any;      // Method-specific parameters
}
```

**Supported Methods:**

- `hasValidConnection` - Check if calendar is connected
- `getCalendarEvents` - Fetch calendar events
- `findAvailableSlots` - Find free time slots
- `scheduleTask` - Schedule a task to calendar
- `updateCalendarEvent` - Update existing event
- `deleteCalendarEvent` - Delete calendar event
- `bulkDeleteCalendarEvents` - Delete multiple events
- `bulkScheduleTasks` - Schedule multiple tasks
- `bulkUpdateCalendarEvents` - Update multiple events
- `disconnectCalendar` - Disconnect user's calendar

**Example - Get Calendar Events:**

```typescript
POST /api/calendar
{
  "method": "getCalendarEvents",
  "params": {
    "calendarId": "primary",
    "timeMin": "2025-10-08T00:00:00Z",
    "timeMax": "2025-10-15T00:00:00Z",
    "maxResults": 50
  }
}
```

#### **POST /api/calendar/analyze** - Analyze Calendar

AI-powered calendar analysis to detect project patterns.

**Location:** `/apps/web/src/routes/api/calendar/analyze/+server.ts`

**Request:**

```typescript
{
  daysBack?: number;         // Default: 30, Range: 0-365
  daysForward?: number;      // Default: 60, Range: 0-365
  calendarsToAnalyze?: string[];
}
```

**Response:**

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

**Process Flow:**

1. Validates date ranges (0-365 days)
2. Checks calendar connection
3. Fetches events from Google Calendar
4. Applies user preferences (filtering)
5. Runs AI analysis to detect patterns
6. Generates project suggestions
7. Returns suggestions sorted by confidence

#### **GET /api/calendar/analyze** - Get Analysis History

Retrieve past analysis results.

**Query Params:**

- `analysisId` (optional) - Get specific analysis

**Response (without analysisId):**

```typescript
{
  success: true,
  data: {
    history: CalendarAnalysis[];
    calendarProjects: CalendarProject[];
  }
}
```

#### **POST /api/calendar/analyze/suggestions** - Handle Suggestion

Accept or reject a calendar analysis suggestion.

**Request:**

```typescript
{
  suggestionId: string;
  action: 'accept' | 'reject' | 'defer';
  modifications?: any;     // Optional modifications when accepting
  reason?: string;         // Optional reason for rejection
}
```

**Response (if accepted):**

```typescript
{
  success: true,
  data: {
    project: Project;      // Newly created project
  },
  message: "Suggestion accepted successfully"
}
```

#### **GET /api/projects/[id]/calendar** - Get Project Calendar

Get calendar details for a specific project.

**Location:** `/apps/web/src/routes/api/projects/[id]/calendar/+server.ts`

**Response:**

```typescript
{
  success: true,
  data: {
    id: string;
    project_id: string;
    calendar_id: string;    // Google Calendar ID
    calendar_name: string;
    sync_enabled: boolean;
    color_id: string;
    last_synced_at: string;
  }
}
```

#### **POST /api/projects/[id]/calendar** - Create Project Calendar

Creates a new Google Calendar for the project.

**Request:**

```typescript
{
  name: string;
  description?: string;
  colorId?: string;
  timeZone?: string;
}
```

**Background Process:**
After calendar creation, automatically:

1. Migrates existing task events to new calendar
2. Deletes events from old calendars
3. Creates events in new project calendar
4. Updates `task_calendar_events` records
5. Sets `calendar_sync_enabled = true` on project

---

## 4. Calendar Data Structure and Fields

### CalendarEvent Interface (Full Structure)

**Location:** `/apps/web/src/lib/services/calendar-service.ts:86-148`

```typescript
interface CalendarEvent {
	// Google Calendar core fields
	kind: 'calendar#event';
	etag: string;
	id: string;
	status: 'confirmed' | 'tentative' | 'cancelled';
	htmlLink: string;

	// Timestamps
	created: string; // ISO timestamp
	updated: string; // ISO timestamp

	// Event details
	summary: string; // Event title
	description?: string; // Event description/notes
	location?: string; // Event location
	colorId?: string; // Event color (1-11)

	// Creator & Organizer
	creator: {
		email: string;
		displayName?: string;
		self?: boolean;
	};
	organizer: {
		email: string;
		displayName?: string;
		self?: boolean;
	};

	// Start/End times
	start: {
		dateTime?: string; // ISO timestamp for timed events
		date?: string; // YYYY-MM-DD for all-day events
		timeZone?: string;
	};
	end: {
		dateTime?: string;
		date?: string;
		timeZone?: string;
	};

	// Recurring events
	recurringEventId?: string; // ID of master event (if this is an instance)
	originalStartTime?: {
		// Original time (if modified instance)
		dateTime?: string;
		date?: string;
		timeZone?: string;
	};
	recurrence?: string[]; // Array of RRULE strings

	// Attendees
	attendees?: {
		email: string;
		displayName?: string;
		organizer?: boolean;
		self?: boolean;
		responseStatus: 'accepted' | 'declined' | 'tentative' | 'needsAction';
		comment?: string;
		additionalGuests?: number;
	}[];

	// Reminders
	reminders?: {
		useDefault: boolean;
		overrides?: {
			method: 'email' | 'popup';
			minutes: number;
		}[];
	};

	// Metadata
	iCalUID: string;
	sequence: number;
	eventType?: 'default' | 'outOfOffice' | 'focusTime' | string;
	transparency?: 'opaque' | 'transparent';
	visibility?: 'default' | 'public' | 'private' | 'confidential';

	// Video conferencing
	hangoutLink?: string; // Google Meet link
	conferenceData?: any; // Full conference info
}
```

### GetCalendarEventsResponse

```typescript
interface GetCalendarEventsResponse {
	event_count: number;
	time_range: {
		start: string; // ISO 8601
		end: string; // ISO 8601
		timeZone?: string;
	};
	events: CalendarEvent[]; // ALL event data preserved
}
```

### Key Fields for BuildOS Integration

**Essential Fields:**

- `id` - Google Calendar event ID (stored in `task_calendar_events.calendar_event_id`)
- `summary` - Event title (becomes task title)
- `description` - Event description (can include BuildOS task link)
- `start.dateTime` / `start.date` - Start time (stored in `event_start`)
- `end.dateTime` / `end.date` - End time (stored in `event_end`)
- `htmlLink` - Link to event in Google Calendar (stored in `event_link`)

**Recurring Event Fields:**

- `recurrence` - Array of RRULE strings (stored in `recurrence_rule`)
- `recurringEventId` - Master event ID (stored in `recurrence_master_id`)
- `originalStartTime` - Original time if modified (stored in `original_start_time`)

**Collaboration Fields:**

- `attendees` - Array of attendees with emails and response status
- `organizer` - Event organizer info
- `location` - Meeting location or room

**Meeting/Conference Fields:**

- `hangoutLink` - Google Meet link (if enabled)
- `conferenceData` - Full video conferencing details

---

## 5. Timezone Handling for Calendar Events

### Timezone Strategy

BuildOS supports **two timezone modes** for calendar operations:

#### **1. User's Local Timezone (Recommended)**

When `timeZone` parameter is provided:

```typescript
// Example: User in America/New_York
const params = {
  task_id: 'abc-123',
  start_time: '2025-10-08T14:00:00Z',  // UTC time
  timeZone: 'America/New_York'          // User's timezone
};

// Result in Google Calendar:
{
  dateTime: '2025-10-08T10:00:00',      // Local time (10 AM EST)
  timeZone: 'America/New_York'
}
```

**Implementation:**

```typescript
// In CalendarService.formatDateTimeForCalendar()
private formatDateTimeForCalendar(dateTimeString: string, timeZone?: string) {
  if (timeZone) {
    const date = new Date(dateTimeString);
    const zonedDate = toZonedTime(date, timeZone);
    const localDateTime = format(zonedDate, "yyyy-MM-dd'T'HH:mm:ss");

    return {
      dateTime: localDateTime,    // Local datetime
      timeZone: timeZone          // Timezone identifier
    };
  }
  // ... fallback to UTC
}
```

#### **2. UTC (Fallback)**

When no `timeZone` is provided:

```typescript
const params = {
	task_id: 'abc-123',
	start_time: '2025-10-08T14:00:00Z'
	// No timeZone provided
};

// Result in Google Calendar:
{
	dateTime: '2025-10-08T14:00:00.000Z'; // UTC time
}
```

### Timezone Flow Through System

**1. Task Creation/Update:**

```
User Input → BuildOS Task (with timezone) → CalendarService
            → Google Calendar (in user's timezone)
```

**2. Event Fetching:**

```
Google Calendar → CalendarService.getCalendarEvents(timeZone?)
                → Returns events in requested timezone
```

**3. Database Storage:**
All timestamps in database stored as **TIMESTAMP WITH TIME ZONE** (PostgreSQL):

- Automatically converted to UTC for storage
- Converted to user's timezone on retrieval
- Ensures consistent time handling across users

### User Calendar Preferences

**Table: user_calendar_preferences**

```sql
user_calendar_preferences:
  timezone: TEXT                 -- User's default timezone (e.g., 'America/New_York')
  work_start_time: TEXT          -- e.g., '09:00'
  work_end_time: TEXT            -- e.g., '17:00'
  working_days: INTEGER[]        -- e.g., [1,2,3,4,5] for Mon-Fri
  default_task_duration_minutes: INTEGER
```

**Usage:**

```typescript
// Fetch user's timezone preference
const { data: prefs } = await supabase
	.from('user_calendar_preferences')
	.select('timezone')
	.eq('user_id', userId)
	.single();

const userTimeZone = prefs?.timezone || 'America/New_York';

// Use in calendar operations
await calendarService.scheduleTask(userId, {
	task_id: taskId,
	start_time: startTime,
	timeZone: userTimeZone // Apply user's timezone
});
```

### Timezone Conversion Examples

**Example 1: Scheduling Task**

```typescript
// User in Tokyo schedules task for 2 PM local time
const scheduleParams = {
  task_id: 'task-123',
  start_time: '2025-10-08T14:00:00+09:00',  // 2 PM JST
  duration_minutes: 60,
  timeZone: 'Asia/Tokyo'
};

// In Google Calendar:
{
  summary: 'Task Title',
  start: {
    dateTime: '2025-10-08T14:00:00',
    timeZone: 'Asia/Tokyo'
  },
  end: {
    dateTime: '2025-10-08T15:00:00',
    timeZone: 'Asia/Tokyo'
  }
}

// In database (task_calendar_events):
{
  event_start: '2025-10-08T05:00:00Z',    // Stored as UTC
  event_end: '2025-10-08T06:00:00Z'       // Stored as UTC
}
```

**Example 2: Fetching Events**

```typescript
// User in London fetches events
const eventsResponse = await calendarService.getCalendarEvents(userId, {
  timeMin: '2025-10-08T00:00:00Z',
  timeMax: '2025-10-09T00:00:00Z',
  timeZone: 'Europe/London'
});

// Events returned with timezone context
{
  event_count: 5,
  time_range: {
    start: '2025-10-08T00:00:00Z',
    end: '2025-10-09T00:00:00Z',
    timeZone: 'Europe/London'
  },
  events: [...]
}
```

### All-Day Events

All-day events use **date-only** format:

```typescript
// All-day event
{
  start: {
    date: '2025-10-08'    // No time, just date
  },
  end: {
    date: '2025-10-09'    // Exclusive end date
  }
}
```

**Handling in BuildOS:**

```typescript
// Detecting all-day events
const isAllDay = event.start.date && !event.start.dateTime;

// User preference to exclude all-day events
if (preferences.exclude_all_day_events && isAllDay) {
	// Skip this event in analysis
}
```

---

## 6. How the System Links Calendar Events to Other Entities

### Entity Relationship Map

```
User
 ├── user_calendar_tokens (OAuth credentials)
 ├── user_calendar_preferences (timezone, work hours)
 ├── calendar_analysis_preferences (analysis settings)
 │
 ├── Projects
 │    ├── project_calendars (Google Calendar for project)
 │    └── Tasks
 │         └── task_calendar_events (Link to Google Calendar event)
 │
 └── Calendar Analyses
      ├── calendar_project_suggestions (AI-detected projects)
      └── calendar_analysis_events (Event snapshots)
```

### Link 1: Tasks ↔ Calendar Events

**Primary Link Table: `task_calendar_events`**

```typescript
// Creating the link when scheduling a task
await supabase.from('task_calendar_events').insert({
	task_id: task.id,
	user_id: userId,
	calendar_event_id: googleEvent.id,
	calendar_id: 'primary',
	event_title: task.title,
	event_start: task.start_date,
	event_end: calculateEndTime(task.start_date, task.duration_minutes),
	sync_status: 'synced',
	sync_source: 'app'
});
```

**Querying task's calendar events:**

```sql
-- Get all calendar events for a task
SELECT * FROM task_calendar_events
WHERE task_id = 'task-uuid'
ORDER BY event_start DESC;

-- Get task from calendar event ID
SELECT t.*, tce.*
FROM tasks t
JOIN task_calendar_events tce ON t.id = tce.task_id
WHERE tce.calendar_event_id = 'google-event-id';
```

### Link 2: Projects ↔ Google Calendars

**Link Table: `project_calendars`**

```typescript
// Creating project calendar link
await supabase.from('project_calendars').insert({
	project_id: project.id,
	user_id: userId,
	calendar_id: googleCalendarId, // Google Calendar ID
	calendar_name: `${project.name} Calendar`,
	sync_enabled: true,
	color_id: '7' // Google Calendar color
});
```

**Querying project's calendar:**

```sql
-- Get Google Calendar for project
SELECT * FROM project_calendars
WHERE project_id = 'project-uuid'
AND user_id = 'user-uuid';

-- Get all tasks in project calendar
SELECT t.*, tce.*
FROM tasks t
JOIN task_calendar_events tce ON t.id = tce.task_id
JOIN project_calendars pc ON tce.project_calendar_id = pc.id
WHERE pc.project_id = 'project-uuid';
```

### Link 3: Calendar Events ↔ Project Suggestions

**Link Table: `calendar_project_suggestions`**

```typescript
// Creating suggestion from calendar events
await supabase.from('calendar_project_suggestions').insert({
	analysis_id: analysis.id,
	user_id: userId,
	suggested_name: 'Q1 Marketing Campaign',
	calendar_event_ids: ['event-1', 'event-2', 'event-3'], // Array of event IDs
	event_count: 3,
	confidence_score: 0.85,
	ai_reasoning: 'Detected recurring marketing meetings...'
});
```

**Querying events that led to suggestion:**

```sql
-- Get all events for a suggestion
SELECT cae.*
FROM calendar_analysis_events cae
WHERE cae.suggestion_id = 'suggestion-uuid'
ORDER BY cae.event_start;

-- Get suggestions from specific events
SELECT cps.*
FROM calendar_project_suggestions cps
WHERE 'google-event-id' = ANY(cps.calendar_event_ids);
```

### Link 4: Projects ↔ Calendar Analysis

**Source Tracking in Projects Table:**

```sql
projects:
  source: TEXT                    -- 'buildos' | 'calendar_analysis' | 'calendar_sync'
  source_metadata: JSONB
  /* Example for calendar_analysis source:
  {
    "analysis_id": "uuid",
    "suggestion_id": "uuid",
    "event_ids": ["event-1", "event-2"],
    "confidence": 0.85,
    "event_count": 5
  }
  */
```

**Creating project from suggestion:**

```typescript
// When user accepts a suggestion
const project = await supabase
	.from('projects')
	.insert({
		user_id: userId,
		name: suggestion.suggested_name,
		description: suggestion.suggested_description,
		context: suggestion.suggested_context,
		source: 'calendar_analysis',
		source_metadata: {
			analysis_id: suggestion.analysis_id,
			suggestion_id: suggestion.id,
			event_ids: suggestion.calendar_event_ids,
			confidence: suggestion.confidence_score,
			event_count: suggestion.event_count
		}
	})
	.select()
	.single();

// Update suggestion with created project
await supabase
	.from('calendar_project_suggestions')
	.update({
		status: 'accepted',
		created_project_id: project.id
	})
	.eq('id', suggestion.id);
```

### Link 5: Tasks ↔ Calendar Events (Source)

**Source Tracking in Tasks Table:**

```sql
tasks:
  source: TEXT                    -- 'buildos' | 'calendar_event' | 'ai_generated'
  source_calendar_event_id: TEXT  -- Google Calendar event ID if from calendar
```

**Creating task from calendar event:**

```typescript
// From calendar analysis
const task = await supabase
	.from('tasks')
	.insert({
		user_id: userId,
		project_id: project.id,
		title: calendarEvent.summary,
		description: calendarEvent.description,
		start_date: calendarEvent.start.dateTime,
		source: 'calendar_event',
		source_calendar_event_id: calendarEvent.id
	})
	.select()
	.single();
```

### Recursive Links: Recurring Events

**Master Event → Instance Exceptions**

```sql
-- Master event
task_calendar_events:
  calendar_event_id: 'master-event-123'
  is_master_event: TRUE
  recurrence_rule: 'RRULE:FREQ=WEEKLY'

-- Modified instance (exception)
task_calendar_events:
  calendar_event_id: 'master-event-123_20251008T140000Z'
  is_exception: TRUE
  recurrence_master_id: 'master-event-123'
  recurrence_instance_date: '2025-10-08T14:00:00Z'
  exception_type: 'modified'
```

**Querying recurring event family:**

```sql
-- Get master event and all exceptions
SELECT * FROM task_calendar_events
WHERE calendar_event_id = 'master-event-123'
   OR recurrence_master_id = 'master-event-123'
ORDER BY
  CASE WHEN is_master_event THEN 0 ELSE 1 END,
  recurrence_instance_date;
```

### Cross-Entity Queries

**Example 1: Get all calendar info for a project**

```sql
SELECT
  p.name as project_name,
  pc.calendar_id,
  pc.calendar_name,
  COUNT(DISTINCT t.id) as task_count,
  COUNT(DISTINCT tce.id) as calendar_event_count,
  pc.last_synced_at
FROM projects p
LEFT JOIN project_calendars pc ON p.id = pc.project_id
LEFT JOIN tasks t ON p.id = t.project_id
LEFT JOIN task_calendar_events tce ON t.id = tce.task_id
WHERE p.id = 'project-uuid'
GROUP BY p.id, pc.id;
```

**Example 2: Find projects created from calendar analysis**

```sql
SELECT
  p.*,
  cps.suggested_name,
  cps.confidence_score,
  cps.event_count,
  ca.completed_at as analysis_date
FROM projects p
JOIN calendar_project_suggestions cps ON p.id = cps.created_project_id
JOIN calendar_analyses ca ON cps.analysis_id = ca.id
WHERE p.source = 'calendar_analysis'
ORDER BY ca.completed_at DESC;
```

**Example 3: Trace event through entire system**

```sql
-- Given a Google Calendar event ID, find everything related
WITH event_trace AS (
  -- Task-calendar link
  SELECT
    'task_calendar_event' as entity_type,
    tce.id as entity_id,
    tce.task_id,
    t.project_id,
    tce.calendar_event_id
  FROM task_calendar_events tce
  JOIN tasks t ON tce.task_id = t.id
  WHERE tce.calendar_event_id = 'google-event-id'

  UNION ALL

  -- Suggestions containing this event
  SELECT
    'suggestion' as entity_type,
    cps.id as entity_id,
    NULL as task_id,
    cps.created_project_id as project_id,
    NULL as calendar_event_id
  FROM calendar_project_suggestions cps
  WHERE 'google-event-id' = ANY(cps.calendar_event_ids)

  UNION ALL

  -- Analysis events
  SELECT
    'analysis_event' as entity_type,
    cae.id as entity_id,
    NULL as task_id,
    NULL as project_id,
    cae.calendar_event_id
  FROM calendar_analysis_events cae
  WHERE cae.calendar_event_id = 'google-event-id'
)
SELECT * FROM event_trace;
```

---

## 7. Key Service Files

### CalendarService (`/apps/web/src/lib/services/calendar-service.ts`)

Main service for Google Calendar operations.

**Key Methods:**

- `getCalendarEvents()` - Fetch events from Google Calendar
- `scheduleTask()` - Create calendar event for task
- `updateCalendarEvent()` - Update existing event
- `deleteCalendarEvent()` - Delete event
- `findAvailableSlots()` - Find free time slots
- `bulkScheduleTasks()` - Batch schedule multiple tasks
- `createProjectCalendar()` - Create new Google Calendar

### CalendarAnalysisService (`/apps/web/src/lib/services/calendar-analysis.service.ts`)

AI-powered calendar analysis.

**Key Methods:**

- `analyzeCalendar()` - Run AI analysis on calendar events
- `acceptSuggestion()` - Accept project suggestion
- `rejectSuggestion()` - Reject suggestion
- `getAnalysisHistory()` - Get past analyses
- `getPreferences()` - Get user analysis preferences

### ProjectCalendarService (`/apps/web/src/lib/services/project-calendar.service.ts`)

Project-specific calendar management.

**Key Methods:**

- `getProjectCalendar()` - Get calendar for project
- `createProjectCalendar()` - Create Google Calendar for project
- `updateProjectCalendar()` - Update calendar settings
- `deleteProjectCalendar()` - Remove project calendar

### CalendarWebhookService (`/apps/web/src/lib/services/calendar-webhook-service.ts`)

Manages real-time calendar updates via webhooks.

**Key Methods:**

- `registerWebhook()` - Subscribe to calendar changes
- `processWebhook()` - Handle webhook notifications
- `renewWebhook()` - Renew expiring webhook
- `unregisterWebhook()` - Unsubscribe from updates

### GoogleOAuthService (`/apps/web/src/lib/services/google-oauth-service.ts`)

OAuth authentication for Google Calendar.

**Key Methods:**

- `getAuthenticatedClient()` - Get OAuth client for user
- `hasValidConnection()` - Check if tokens are valid
- `refreshTokens()` - Refresh expired access token
- `disconnectCalendar()` - Revoke calendar access

---

## 8. How to Fetch Calendar Events for a User

### Method 1: Direct Service Call (Server-side)

```typescript
import { CalendarService } from '$lib/services/calendar-service';
import type { SupabaseClient } from '@supabase/supabase-js';

// In a +page.server.ts or API route
export const load = async ({ locals: { supabase, safeGetSession } }) => {
	const { session } = await safeGetSession();
	if (!session?.user?.id) return { events: [] };

	const calendarService = new CalendarService(supabase);

	// Fetch events for the next 7 days
	const response = await calendarService.getCalendarEvents(session.user.id, {
		timeMin: new Date().toISOString(),
		timeMax: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
		maxResults: 50,
		calendarId: 'primary'
	});

	return {
		events: response.events,
		eventCount: response.event_count,
		timeRange: response.time_range
	};
};
```

### Method 2: API Endpoint Call (Client-side)

```typescript
// In a Svelte component
async function fetchCalendarEvents() {
	const response = await fetch('/api/calendar', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			method: 'getCalendarEvents',
			params: {
				timeMin: new Date().toISOString(),
				timeMax: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
				maxResults: 50
			}
		})
	});

	const result = await response.json();
	if (result.success) {
		return result.data; // GetCalendarEventsResponse
	}
}
```

### Method 3: Project-Specific Events

```typescript
// Fetch events for a specific project's calendar
const projectId = 'abc-123';

const response = await fetch(`/api/projects/${projectId}/calendar`);
const result = await response.json();

if (result.success) {
	const projectCalendar = result.data; // { calendar_id, calendar_name, ... }

	// Now fetch events for this calendar
	const eventsResponse = await fetch('/api/calendar', {
		method: 'POST',
		body: JSON.stringify({
			method: 'getCalendarEvents',
			params: {
				calendarId: projectCalendar.calendar_id,
				timeMin: new Date().toISOString(),
				timeMax: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
			}
		})
	});
}
```

### Method 4: Get Events for Specific Tasks

```typescript
// Query task_calendar_events to get calendar event IDs
const { data: taskEvents } = await supabase
	.from('task_calendar_events')
	.select('*, tasks(title, description)')
	.eq('user_id', userId)
	.eq('sync_status', 'synced')
	.order('event_start', { ascending: true });

// taskEvents now contains all calendar-linked tasks with event details
```

---

## 9. Complete Data Flow Examples

### Flow 1: Creating Task with Calendar Event

```
1. User creates task in BuildOS
   └─> POST /api/projects/[id]/tasks
       {
         title: "Team Meeting",
         start_date: "2025-10-08T14:00:00Z",
         duration_minutes: 60,
         project_id: "project-123"
       }

2. Server creates task in database
   └─> INSERT INTO tasks (...)

3. Server schedules to calendar (if calendar connected)
   └─> CalendarService.scheduleTask(userId, {
         task_id: task.id,
         start_time: task.start_date,
         duration_minutes: 60,
         calendar_id: projectCalendar?.calendar_id || 'primary'
       })

4. Google Calendar API creates event
   └─> calendar.events.insert({
         calendarId: 'primary',
         requestBody: {
           summary: 'Team Meeting',
           start: { dateTime: '2025-10-08T14:00:00Z' },
           end: { dateTime: '2025-10-08T15:00:00Z' },
           description: 'View Task: https://build-os.com/projects/project-123/tasks/task-456'
         }
       })

5. Link created in database
   └─> INSERT INTO task_calendar_events (
         task_id: 'task-456',
         calendar_event_id: 'google-event-789',
         event_start: '2025-10-08T14:00:00Z',
         sync_status: 'synced',
         sync_source: 'app'
       )

6. Response to user
   └─> { task: {...}, calendarEvent: {...} }
```

### Flow 2: Calendar Analysis Detecting Project

```
1. User triggers calendar analysis
   └─> POST /api/calendar/analyze
       {
         daysBack: 30,
         daysForward: 60
       }

2. Fetch user's calendar events
   └─> CalendarService.getCalendarEvents(userId, {
         timeMin: '2025-09-08T00:00:00Z',
         timeMax: '2025-12-08T00:00:00Z'
       })
       └─> Returns 45 events

3. Apply user preferences filtering
   └─> Filter out:
       - Declined events (3)
       - All-day events (if preference set)
       - Personal events (heuristic based)
       - Events with < minimum_attendees
       └─> 35 events remaining

4. Create analysis record
   └─> INSERT INTO calendar_analyses (
         user_id, status: 'processing',
         events_analyzed: 35,
         events_excluded: 10
       )

5. Run AI analysis on events
   └─> AI detects patterns:
       - 8 recurring "Sprint Planning" events
       - Common attendees: john@, jane@
       - Keywords: "Q1", "launch", "milestone"
       └─> Suggests project: "Q1 Product Launch"

6. Create suggestion record
   └─> INSERT INTO calendar_project_suggestions (
         analysis_id,
         suggested_name: 'Q1 Product Launch',
         confidence_score: 0.85,
         calendar_event_ids: ['event-1', 'event-2', ...],
         event_count: 8,
         ai_reasoning: 'Detected recurring sprint planning...'
       )

7. Create event snapshots
   └─> For each event in suggestion:
       INSERT INTO calendar_analysis_events (
         analysis_id,
         suggestion_id,
         calendar_event_id,
         event_title,
         event_start,
         ...
       )

8. Update analysis as completed
   └─> UPDATE calendar_analyses SET
         status: 'completed',
         projects_suggested: 1,
         completed_at: NOW()

9. Return suggestions to user
   └─> {
         analysisId: 'analysis-uuid',
         suggestions: [
           {
             id: 'suggestion-uuid',
             name: 'Q1 Product Launch',
             confidence: 0.85,
             eventCount: 8,
             ...
           }
         ]
       }
```

### Flow 3: Accepting Calendar Suggestion

```
1. User accepts suggestion
   └─> POST /api/calendar/analyze/suggestions
       {
         suggestionId: 'suggestion-uuid',
         action: 'accept',
         modifications: {
           name: 'Q1 Product Launch - Marketing Focus'
         }
       }

2. Create project from suggestion
   └─> INSERT INTO projects (
         name: 'Q1 Product Launch - Marketing Focus',
         description: suggestion.suggested_description,
         context: suggestion.suggested_context,
         source: 'calendar_analysis',
         source_metadata: {
           analysis_id: 'analysis-uuid',
           suggestion_id: 'suggestion-uuid',
           event_ids: ['event-1', 'event-2', ...],
           confidence: 0.85
         }
       )

3. Create tasks from calendar events
   └─> For each suggested_task in suggestion:
       INSERT INTO tasks (
         project_id: project.id,
         title: task.title,
         description: task.description,
         start_date: task.date,
         source: 'calendar_event',
         source_calendar_event_id: task.event_id
       )

4. Link tasks to calendar events
   └─> For each created task:
       INSERT INTO task_calendar_events (
         task_id: task.id,
         calendar_event_id: task.source_calendar_event_id,
         sync_status: 'synced',
         sync_source: 'google'  // Came from Google
       )

5. Update suggestion status
   └─> UPDATE calendar_project_suggestions SET
         status: 'accepted',
         created_project_id: project.id,
         tasks_created_count: 5,
         status_changed_at: NOW()

6. Update analysis stats
   └─> UPDATE calendar_analyses SET
         projects_created: projects_created + 1,
         tasks_created: tasks_created + 5

7. Return created project
   └─> { success: true, data: { project: {...} } }
```

### Flow 4: Webhook Update from Google Calendar

```
1. User updates event in Google Calendar
   └─> Changes "Team Meeting" time from 2 PM → 3 PM

2. Google sends webhook notification
   └─> POST /webhooks/calendar-events
       Headers:
         X-Goog-Channel-ID: 'channel-123'
         X-Goog-Resource-State: 'update'

3. Verify webhook authenticity
   └─> Check channel_id in calendar_webhook_channels table
       └─> Valid, proceed

4. Fetch updated event from Google
   └─> calendar.events.get({
         calendarId: 'primary',
         eventId: 'google-event-789'
       })
       └─> Returns updated event with new time

5. Find linked task
   └─> SELECT * FROM task_calendar_events
       WHERE calendar_event_id = 'google-event-789'
       └─> Found task-456

6. Check sync_source to avoid loop
   └─> IF sync_source = 'app' AND updated_at recent:
         Skip (this is our own change echoing back)
       ELSE:
         Process update

7. Update task in database
   └─> UPDATE tasks SET
         start_date: '2025-10-08T15:00:00Z'  -- New time
       WHERE id = 'task-456'

8. Update sync record
   └─> UPDATE task_calendar_events SET
         event_start: '2025-10-08T15:00:00Z',
         sync_status: 'synced',
         sync_source: 'google',
         sync_version: sync_version + 1,
         last_synced_at: NOW()
       WHERE id = 'tce-uuid'

9. Notify user (via real-time subscription)
   └─> Task updated from calendar
```

---

## 10. Recommendations for Daily Brief Integration

Based on this research, here's how to fetch calendar events for daily brief generation:

### Recommended Approach

```typescript
// In worker app's daily brief generator
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

async function getUpcomingEventsForBrief(
	userId: string,
	briefDate: Date
): Promise<CalendarEvent[]> {
	const supabase = createClient<Database>(
		process.env.SUPABASE_URL,
		process.env.SUPABASE_SERVICE_KEY
	);

	// 1. Check if user has calendar connected
	const { data: calendarToken } = await supabase
		.from('user_calendar_tokens')
		.select('*')
		.eq('user_id', userId)
		.single();

	if (!calendarToken) {
		return []; // No calendar connected
	}

	// 2. Get user's timezone preference
	const { data: prefs } = await supabase
		.from('user_calendar_preferences')
		.select('timezone')
		.eq('user_id', userId)
		.single();

	const userTimeZone = prefs?.timezone || 'America/New_York';

	// 3. Calculate time range for brief
	const startOfDay = new Date(briefDate);
	startOfDay.setHours(0, 0, 0, 0);

	const endOfDay = new Date(briefDate);
	endOfDay.setHours(23, 59, 59, 999);

	// 4. Fetch events from Google Calendar
	const calendarService = new CalendarService(supabase);

	try {
		const response = await calendarService.getCalendarEvents(userId, {
			timeMin: startOfDay.toISOString(),
			timeMax: endOfDay.toISOString(),
			maxResults: 100,
			timeZone: userTimeZone,
			// Optionally filter to specific calendars
			calendarId: 'primary' // Or get from user preferences
		});

		// 5. Filter events (optional)
		const filteredEvents = response.events.filter((event) => {
			// Exclude declined events
			if (event.status === 'cancelled') return false;

			// Check if user declined
			const userAttendee = event.attendees?.find(
				(a) => a.email === calendarToken.google_email
			);
			if (userAttendee?.responseStatus === 'declined') return false;

			// Exclude all-day events (optional)
			if (event.start.date && !event.start.dateTime) return false;

			return true;
		});

		return filteredEvents;
	} catch (error) {
		console.error('Failed to fetch calendar events:', error);
		return [];
	}
}

// 6. Use in daily brief generation
async function generateDailyBrief(userId: string, briefDate: Date) {
	const events = await getUpcomingEventsForBrief(userId, briefDate);

	// Format events for LLM prompt
	const eventsContext = events.map((event) => ({
		time: event.start.dateTime || event.start.date,
		title: event.summary,
		location: event.location,
		attendees: event.attendees?.map((a) => a.email),
		meetingLink: event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri
	}));

	// Include in daily brief prompt
	const prompt = `
    Generate a daily brief for ${briefDate.toDateString()}.

    Calendar Events Today:
    ${JSON.stringify(eventsContext, null, 2)}

    Tasks Due Today:
    [... tasks ...]

    ...
  `;

	// ... rest of brief generation
}
```

### Alternative: Use Cached Task-Calendar Links

For better performance, use existing `task_calendar_events` links:

```typescript
async function getScheduledTasksForBrief(
	userId: string,
	briefDate: Date
): Promise<Array<{ task: Task; event: CalendarEvent }>> {
	const supabase = createClient(/* ... */);

	const startOfDay = new Date(briefDate);
	startOfDay.setHours(0, 0, 0, 0);

	const endOfDay = new Date(briefDate);
	endOfDay.setHours(23, 59, 59, 999);

	// Query tasks with calendar events
	const { data: taskEvents } = await supabase
		.from('task_calendar_events')
		.select(
			`
      *,
      tasks (
        id,
        title,
        description,
        priority,
        status,
        project:projects(name, slug)
      )
    `
		)
		.eq('user_id', userId)
		.eq('sync_status', 'synced')
		.gte('event_start', startOfDay.toISOString())
		.lte('event_start', endOfDay.toISOString())
		.order('event_start', { ascending: true });

	return (
		taskEvents?.map((te) => ({
			task: te.tasks,
			event: {
				id: te.calendar_event_id,
				title: te.event_title,
				start: te.event_start,
				end: te.event_end,
				link: te.event_link
			}
		})) || []
	);
}
```

---

## Key Takeaways

1. **Calendar events are fetched** via `CalendarService.getCalendarEvents()` which calls Google Calendar API
2. **Database has comprehensive schema** with `task_calendar_events` as the primary link table
3. **API endpoints** provide both direct service access and HTTP endpoints for calendar operations
4. **Full event data** is preserved including description, location, attendees, meeting links, recurrence
5. **Timezone handling** supports both user-specific timezones and UTC, with preferences stored per user
6. **Entity linking** is robust with tables linking tasks↔events, projects↔calendars, events↔suggestions
7. **AI analysis** can detect project patterns from calendar events and create BuildOS projects
8. **Real-time sync** via webhooks keeps BuildOS and Google Calendar in sync
9. **Recurring events** are fully supported with RRULE handling and instance exceptions

---

## File Locations Summary

**Core Services:**

- `/apps/web/src/lib/services/calendar-service.ts` - Main calendar operations
- `/apps/web/src/lib/services/calendar-analysis.service.ts` - AI analysis
- `/apps/web/src/lib/services/project-calendar.service.ts` - Project calendars
- `/apps/web/src/lib/services/google-oauth-service.ts` - OAuth authentication

**API Endpoints:**

- `/apps/web/src/routes/api/calendar/+server.ts` - Calendar operations
- `/apps/web/src/routes/api/calendar/analyze/+server.ts` - Calendar analysis
- `/apps/web/src/routes/api/projects/[id]/calendar/+server.ts` - Project calendars

**Database:**

- `/apps/web/supabase/migrations/20250129_calendar_intelligence_integration.sql` - Schema
- `/packages/shared-types/src/database.schema.ts` - TypeScript types

**Documentation:**

- `/apps/web/docs/features/calendar-integration/README.md` - Feature overview
- `/apps/web/docs/technical/architecture/CALENDAR_SERVICE_FLOW.md` - Architecture
- `/apps/web/docs/technical/api/endpoints/calendar.md` - API documentation
