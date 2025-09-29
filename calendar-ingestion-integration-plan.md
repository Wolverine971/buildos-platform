# Calendar Intelligence Integration - Planning Document

I want to ingest a user's calendar data and suggest projects based off what is on their calendar.

## Overview

Add intelligent calendar analysis to BuildOS that suggests projects from calendar events, maintaining clear distinction between BuildOS-native and calendar-synced entities.

## Core Principles

1. **Source Tracking**: Always know if a project/task originated from BuildOS or calendar
2. **Permission Transparency**: Users see what they can/can't modify based on calendar permissions
3. **Simple Analysis**: No complex rules - just smart LLM detection of project-worthy patterns
4. **Bidirectional Sync**: Where possible, maintain sync between calendar and BuildOS

---

## Database Schema Updates

### 1. Update Existing Tables

```sql
-- Add source tracking to projects table
ALTER TABLE projects ADD COLUMN source TEXT DEFAULT 'buildos';
-- Values: 'buildos', 'calendar_sync', 'calendar_suggested'

ALTER TABLE projects ADD COLUMN source_metadata JSONB;
-- For calendar projects: { calendar_ids: [], event_count: 5, organizer_email: "" }

-- Add source tracking to tasks table
ALTER TABLE tasks ADD COLUMN source TEXT DEFAULT 'buildos';
-- Values: 'buildos', 'calendar_event', 'ai_generated'

ALTER TABLE tasks ADD COLUMN source_calendar_event_id TEXT;
ALTER TABLE tasks ADD COLUMN source_calendar_id TEXT;
ALTER TABLE tasks ADD COLUMN sync_enabled BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN sync_permissions JSONB;
-- Permissions: { can_modify: true, is_organizer: true, attendee_status: 'accepted' }
```

### 2. New Tables for Calendar Intelligence

```sql
-- Track the relationship between calendar events and BuildOS entities
CREATE TABLE calendar_event_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,

    -- Calendar identifiers
    calendar_id TEXT NOT NULL,
    calendar_event_id TEXT NOT NULL,
    calendar_name TEXT,

    -- Event ownership/permissions
    is_organizer BOOLEAN DEFAULT false,
    can_modify BOOLEAN DEFAULT false,
    attendee_status TEXT, -- 'accepted', 'tentative', 'declined', 'needsAction'
    attendee_count INTEGER,

    -- Event data snapshot (for analysis even if event changes)
    event_title TEXT,
    event_description TEXT,
    event_start TIMESTAMP,
    event_end TIMESTAMP,
    event_location TEXT,
    is_recurring BOOLEAN DEFAULT false,
    recurrence_pattern TEXT,

    -- BuildOS mappings
    task_id UUID REFERENCES tasks(id),
    project_id UUID REFERENCES projects(id),

    -- Sync status
    last_synced_at TIMESTAMP,
    sync_status TEXT DEFAULT 'active', -- 'active', 'paused', 'error', 'deleted'
    sync_error TEXT,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(calendar_event_id, user_id)
);

-- Track project suggestions from calendar analysis
CREATE TABLE calendar_project_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,

    -- Suggestion details
    suggested_project_name TEXT NOT NULL,
    suggested_project_description TEXT,
    confidence_score FLOAT, -- 0-1

    -- Related calendar events
    calendar_event_ids TEXT[], -- Array of event IDs included in this suggestion
    event_count INTEGER,
    date_range_start TIMESTAMP,
    date_range_end TIMESTAMP,

    -- LLM reasoning
    ai_reasoning TEXT,
    detected_patterns JSONB,
    /* Example patterns:
    {
        "meeting_series": ["Weekly Product Sync", "Design Review"],
        "common_attendees": ["john@company.com", "jane@company.com"],
        "project_indicators": ["sprint", "milestone", "launch"]
    }
    */

    -- User action
    status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'rejected', 'modified'
    accepted_at TIMESTAMP,
    rejected_at TIMESTAMP,
    rejection_reason TEXT,

    -- If accepted
    created_project_id UUID REFERENCES projects(id),

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Implementation Plan

### Phase 1: Calendar Analysis & Project Detection

#### 1.1 Calendar Ingestion Service

```typescript
interface CalendarIngestionService {
  async ingestUserCalendars(userId: string): Promise<AnalysisResult> {
    // 1. Fetch all calendars
    const calendars = await this.getGoogleCalendars(userId);

    // 2. Fetch events from each calendar (last 30 days + next 60 days)
    const allEvents = [];
    for (const calendar of calendars) {
      const events = await this.fetchCalendarEvents(calendar.id, {
        timeMin: dayjs().subtract(30, 'days').toISOString(),
        timeMax: dayjs().add(60, 'days').toISOString(),
      });

      // 3. Store event mappings with permission data
      for (const event of events) {
        await this.storeEventMapping({
          user_id: userId,
          calendar_id: calendar.id,
          calendar_name: calendar.summary,
          calendar_event_id: event.id,
          is_organizer: event.organizer?.self || false,
          can_modify: event.guestsCanModify || event.organizer?.self,
          attendee_status: event.attendees?.find(a => a.self)?.responseStatus,
          attendee_count: event.attendees?.length || 0,
          event_title: event.summary,
          event_description: event.description,
          event_start: event.start.dateTime,
          event_end: event.end.dateTime,
          is_recurring: !!event.recurrence,
        });
      }

      allEvents.push(...events);
    }

    // 4. Send to LLM for analysis
    return await this.analyzeEventsForProjects(userId, allEvents);
  }
}
```

#### 1.2 LLM Analysis Prompt

```typescript
const analyzeEventsForProjects = async (events: CalendarEvent[]) => {
  const prompt = `
    Analyze these calendar events and identify potential projects.
    
    Look for:
    - Recurring meetings with similar titles/attendees (likely ongoing projects)
    - Clusters of related events (project kickoffs, reviews, milestones)
    - Events with project-indicating keywords (sprint, launch, milestone, review, planning)
    - Series of events with increasing dates (project timeline)
    
    For each potential project, identify:
    1. Project name (inferred from event patterns)
    2. Which events belong to this project
    3. Confidence score (0-1)
    4. Why these events suggest a project
    5. Suggested start/end dates
    6. Key participants (from attendees)
    
    Ignore:
    - One-off personal events (lunch, coffee, dentist)
    - All-hands or company-wide meetings
    - Events the user declined
    
    Events: ${JSON.stringify(events)}
    
    Return as JSON array of project suggestions.
  `;

  return await llm.createCompletion(prompt);
};
```

### Phase 2: User Approval Flow

#### 2.1 Suggestion Interface

```typescript
interface ProjectSuggestion {
  id: string;
  projectName: string;
  description: string;
  confidence: number;
  events: Array<{
    id: string;
    title: string;
    date: string;
    isOrganizer: boolean;
    canModify: boolean;
  }>;
  reasoning: string;
}

// API endpoint
POST /api/calendar/suggestions
Response: ProjectSuggestion[]

// User accepts suggestion
POST /api/calendar/suggestions/:id/accept
Body: {
  projectName?: string, // Allow user to modify name
  includeEvents: string[], // Allow user to exclude some events
}
```

#### 2.2 Project & Task Creation

```typescript
async function createProjectFromSuggestion(
  suggestionId: string,
  userId: string,
  modifications?: any,
) {
  const suggestion = await getSuggestion(suggestionId);

  // 1. Create project with source tracking
  const project = await db.projects.create({
    name: modifications?.projectName || suggestion.projectName,
    description: suggestion.description,
    user_id: userId,
    source: "calendar_sync",
    source_metadata: {
      suggestion_id: suggestionId,
      calendar_ids: [...new Set(suggestion.events.map((e) => e.calendarId))],
      event_count: suggestion.events.length,
    },
  });

  // 2. Create tasks from events
  for (const event of suggestion.events) {
    const task = await db.tasks.create({
      title: event.title,
      description: event.description,
      project_id: project.id,
      user_id: userId,
      start_date: event.start,
      source: "calendar_event",
      source_calendar_event_id: event.id,
      source_calendar_id: event.calendarId,
      sync_enabled: event.canModify, // Only sync if we can modify
      sync_permissions: {
        can_modify: event.canModify,
        is_organizer: event.isOrganizer,
        attendee_status: event.attendeeStatus,
      },
    });

    // 3. Update mapping table
    await db.calendar_event_mapping.update({
      where: { calendar_event_id: event.id },
      data: {
        task_id: task.id,
        project_id: project.id,
        sync_status: "active",
      },
    });
  }

  // 4. Set up webhook for ongoing sync
  await setupCalendarWebhook(userId, project.id);

  return project;
}
```

### Phase 3: Ongoing Synchronization

#### 3.1 Webhook Handler

```typescript
async function handleCalendarWebhook(notification: CalendarNotification) {
  const { userId, calendarId, eventId, changeType } = notification;

  // Find existing mapping
  const mapping = await db.calendar_event_mapping.findFirst({
    where: {
      calendar_event_id: eventId,
      user_id: userId,
    },
  });

  if (!mapping) {
    // New event - check if it belongs to a synced project
    await checkNewEventForExistingProject(notification);
    return;
  }

  switch (changeType) {
    case "updated":
      await syncEventToTask(mapping);
      break;
    case "deleted":
      await handleEventDeletion(mapping);
      break;
    case "created":
      await handleNewEvent(notification);
      break;
  }
}

async function syncEventToTask(mapping: EventMapping) {
  const event = await getGoogleCalendarEvent(mapping.calendar_event_id);

  // Only sync if permissions allow
  if (!mapping.sync_permissions?.can_modify) {
    console.log("Read-only event, skipping sync");
    return;
  }

  await db.tasks.update({
    where: { id: mapping.task_id },
    data: {
      title: event.summary,
      description: event.description,
      start_date: event.start.dateTime,
      updated_at: new Date(),
    },
  });

  await db.calendar_event_mapping.update({
    where: { id: mapping.id },
    data: { last_synced_at: new Date() },
  });
}
```

#### 3.2 Bi-directional Sync (BuildOS → Calendar)

```typescript
async function syncTaskToCalendar(taskId: string) {
  const task = await db.tasks.findUnique({
    where: { id: taskId },
    include: { calendar_mapping: true },
  });

  // Only sync if:
  // 1. Task is linked to a calendar event
  // 2. User has modification permissions
  // 3. Sync is enabled

  if (task.source !== "calendar_event" || !task.sync_enabled) {
    return; // This is a BuildOS-native task, don't sync
  }

  if (!task.sync_permissions?.can_modify) {
    throw new Error("Cannot modify read-only calendar event");
  }

  const calendar = await getGoogleCalendarAPI(task.user_id);
  await calendar.events.patch({
    calendarId: task.source_calendar_id,
    eventId: task.source_calendar_event_id,
    resource: {
      summary: task.title,
      description: task.description,
      start: { dateTime: task.start_date },
      // ... other fields
    },
  });
}
```

---

## UI/UX Components

### Visual Distinction System

```tsx
// Task component showing source
function TaskCard({ task }) {
  return (
    <div className="task-card">
      <div className="task-header">
        <h3>{task.title}</h3>
        {task.source === "calendar_event" && (
          <Badge icon={<CalendarIcon />} variant="sync">
            Calendar Synced
            {!task.sync_permissions?.can_modify && (
              <LockIcon className="ml-1" size={12} />
            )}
          </Badge>
        )}
        {task.source === "buildos" && <Badge variant="native">BuildOS</Badge>}
      </div>

      {task.source === "calendar_event" &&
        !task.sync_permissions?.can_modify && (
          <Alert variant="info" size="sm">
            This task is read-only as you're not the calendar event organizer
          </Alert>
        )}
    </div>
  );
}

// Project header showing source
function ProjectHeader({ project }) {
  return (
    <div className="project-header">
      <h1>{project.name}</h1>
      {project.source === "calendar_sync" && (
        <div className="sync-info">
          <CalendarSyncIcon />
          <span>
            Synced from {project.source_metadata?.calendar_ids?.length}{" "}
            calendar(s)
          </span>
          <span className="text-muted">
            {project.source_metadata?.event_count} events linked
          </span>
        </div>
      )}
    </div>
  );
}
```

---

## Technical Considerations

### 1. Rate Limiting

- Google Calendar API: 1,000,000 queries/day, 50 requests/second
- Implement exponential backoff for webhook retries
- Cache calendar data for 5 minutes minimum

### 2. Data Privacy

- Only store necessary event data
- Respect calendar ACLs
- Allow users to disconnect calendar sync anytime

### 3. Conflict Resolution

- BuildOS changes take precedence for native tasks
- Calendar changes take precedence for synced tasks
- Log all conflicts for user review

### 4. Performance

- Process calendar analysis in background queue
- Paginate large event lists
- Index calendar_event_id for fast lookups

---

## Success Metrics

1. **Adoption Rate**: % of users who accept at least one project suggestion
2. **Sync Reliability**: % of successful sync operations
3. **User Engagement**: Increase in project creation after calendar integration
4. **Time Saved**: Reduction in manual project/task creation time

---

## MVP Scope (2-3 weeks)

1. ✅ Calendar ingestion and event storage
2. ✅ LLM analysis for project suggestions
3. ✅ Basic project/task creation from suggestions
4. ✅ One-way sync (Calendar → BuildOS)
5. ✅ Visual distinction for synced vs native items

## Future Enhancements

1. Bi-directional sync for owned events
2. Recurring event handling
3. Multi-calendar project detection
4. Team calendar support (when collaborators added)
5. Smart rescheduling based on calendar conflicts
