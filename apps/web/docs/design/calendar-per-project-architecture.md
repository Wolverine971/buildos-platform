---
title: 'Google Calendar Per-Project Architecture'
description: 'Architecture decision and specification for creating one Google Calendar per project, including data models, implementation flow, and migration strategy'
date_created: '2025-09-15'
date_modified: '2025-10-05'
status: 'active'
category: 'feature-spec'
tags: [calendar, google-calendar, architecture, project-management, data-model]
related_files:
    - apps/web/docs/design/calendar-webhook-integration.md
    - apps/web/docs/features/calendar-integration/README.md
important_files:
    - apps/web/src/lib/services/calendar-service.ts
    - supabase/migrations/*calendar*.sql
---

# Google Calendar Per-Project Architecture

## Architecture Decision: One Calendar Per Project

**Why this approach:**

- **Clean separation**: Each project is visually and functionally isolated
- **Better color control**: Each calendar gets its own default color (no event-level overrides needed)
- **User control**: Users can show/hide entire projects in Google Calendar
- **Scalability**: Google supports up to 250 calendars per account (10 projects is no problem)
- **Sharing**: Individual project calendars can be shared with team members

## New Data Models

```typescript
// Store Google Calendar settings and mappings
project_calendars: {
  id: string;
  project_id: string;
  user_id: string;
  calendar_id: string;  // Google Calendar ID
  calendar_name: string;
  color_id: string;  // Google's color ID (1-11)
  hex_color: string | null;  // Store hex for UI display
  is_primary: boolean;  // false for project calendars
  sync_enabled: boolean;
  visibility: 'public' | 'private' | 'shared';
  created_at: string;
  updated_at: string;
  last_synced_at: string | null;
  sync_status: 'active' | 'paused' | 'error';
  sync_error: string | null;
}

// Track calendar color themes
calendar_themes: {
  id: string;
  user_id: string;
  theme_name: string;
  color_mappings: {
    high_priority: string;  // Google color ID
    medium_priority: string;
    low_priority: string;
    completed: string;
    overdue: string;
    [key: string]: string;  // Extensible
  };
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// Update projects table (add these fields)
projects: {
  // ... existing fields ...
  calendar_color_id: string | null;  // Google color ID (1-11)
  calendar_sync_enabled: boolean;
  calendar_id: string | null;  // Reference to project_calendars
}

// Update task_calendar_events (modify calendar_id usage)
task_calendar_events: {
  // ... existing fields ...
  calendar_id: string;  // Now references project_calendars.calendar_id
  color_override: string | null;  // For task-specific colors
  // ... rest of fields ...
}
```

## Google Calendar Color Mapping

```typescript
const GOOGLE_CALENDAR_COLORS = {
	'1': { name: 'Lavender', hex: '#7986cb' },
	'2': { name: 'Sage', hex: '#33b679' },
	'3': { name: 'Grape', hex: '#8e24aa' },
	'4': { name: 'Flamingo', hex: '#e67c73' },
	'5': { name: 'Banana', hex: '#f6bf26' },
	'6': { name: 'Tangerine', hex: '#f4511e' },
	'7': { name: 'Peacock', hex: '#039be5' },
	'8': { name: 'Graphite', hex: '#616161' },
	'9': { name: 'Blueberry', hex: '#3f51b5' },
	'10': { name: 'Basil', hex: '#0b8043' },
	'11': { name: 'Tomato', hex: '#d50000' }
};
```

## Implementation Flow

### 1. Project Creation Flow

```typescript
async function createProjectWithCalendar(projectData) {
	// 1. Create project in DB
	const project = await createProject(projectData);

	// 2. Create Google Calendar
	const calendar = await googleCalendar.calendars.insert({
		requestBody: {
			summary: `${projectData.name} - Tasks`,
			description: projectData.description,
			timeZone: userTimeZone,
			colorId: projectData.calendar_color_id || '7' // Default peacock
		}
	});

	// 3. Store calendar mapping
	await createProjectCalendar({
		project_id: project.id,
		calendar_id: calendar.id,
		color_id: projectData.calendar_color_id,
		calendar_name: calendar.summary
	});

	// 4. Share calendar if needed
	if (projectData.share_with_team) {
		await shareCalendar(calendar.id, teamMembers);
	}
}
```

### 2. Task Sync Flow

```typescript
async function syncTaskToCalendar(task, project) {
	// Get project's calendar
	const projectCalendar = await getProjectCalendar(project.id);

	// Create/update event in project's calendar
	const event = {
		calendarId: projectCalendar.calendar_id,
		resource: {
			summary: task.title,
			description: task.description,
			start: { dateTime: task.start_date },
			end: { dateTime: calculateEndTime(task) },
			colorId: determineTaskColor(task, project)
			// ... other event properties
		}
	};

	await googleCalendar.events.insert(event);
}
```

## Migration Strategy

1. **Phase 1: Add color support to existing setup**
    - Add color fields to projects table
    - Continue using single calendar but with event-level colors

2. **Phase 2: Opt-in calendar creation**
    - New projects get their own calendars
    - Existing projects can opt-in to separate calendars
    - Maintain backward compatibility

3. **Phase 3: Full migration**
    - Batch create calendars for existing projects
    - Migrate existing events to new calendars
    - Deprecate single-calendar mode

## User Experience Considerations

```typescript
// Settings UI component
interface ProjectCalendarSettings {
	enableSeparateCalendar: boolean;
	calendarColor: string; // Google color ID
	syncTasks: boolean;
	shareWithTeam: boolean;
	autoArchiveCompleted: boolean;
	hideFromMainView: boolean; // User can hide in Google Calendar
}

// Provide bulk operations
interface BulkCalendarOperations {
	createAllProjectCalendars(): Promise<void>;
	updateAllColors(theme: CalendarTheme): Promise<void>;
	pauseAllSync(): Promise<void>;
	deleteUnusedCalendars(): Promise<void>;
}
```

## Benefits of This Approach

1. **Organization**: Projects are clearly separated in Google Calendar
2. **Flexibility**: Users can subscribe to specific project calendars
3. **Performance**: Sync operations are isolated per project
4. **Collaboration**: Team members can subscribe to relevant project calendars only
5. **Color Consistency**: One color per project, automatically applied to all tasks

## Limitations to Document

- Maximum 250 calendars per Google account
- Limited to Google's 11 preset colors
- Calendar creation has API quotas (but generous for normal use)
- Deleted calendars go to trash for 30 days before permanent deletion

## Next Steps

See [Calendar Webhook Integration](./calendar-webhook-integration.md) for implementing two-way sync between Google Calendar and BuildOS.
