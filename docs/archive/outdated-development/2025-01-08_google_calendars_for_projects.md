---
date: 2025-01-08T00:25:59-05:00
researcher: Claude
git_commit: 44d7af61963ba9e55483b94e95a3b59e6b2d3181
branch: main
repository: build_os
topic: 'Google Calendars for Projects - Implementation Requirements'
tags: [research, codebase, calendar-integration, google-calendar, projects, database-schema]
status: complete
last_updated: 2025-01-08
last_updated_by: Claude
---

# Research: Google Calendars for Projects - Implementation Requirements

**Date**: 2025-01-08T00:25:59-05:00
**Researcher**: Claude
**Git Commit**: 44d7af61963ba9e55483b94e95a3b59e6b2d3181
**Branch**: main
**Repository**: build_os

## Research Question

Analyze what needs to be done to implement Google Calendars for Projects, where each project is linked to a separate Google Calendar within the user's main calendar. This includes required data model updates, ProjectHeader calendar settings UI, and CalendarService integration.

## Summary

The codebase currently uses a single-calendar model where all tasks sync to the user's primary Google Calendar. To implement per-project calendars requires:

1. **Database schema additions** - New `project_calendars` table to map projects to Google Calendar IDs
2. **CalendarService extensions** - Add calendar CRUD operations (create, update, delete, list)
3. **UI implementation** - Calendar settings in ProjectHeader with color and name configuration
4. **Service layer updates** - Routing tasks to project-specific calendars instead of primary
5. **Webhook enhancements** - Support multiple webhook channels per user (one per calendar)

The existing infrastructure provides a solid foundation with OAuth, webhooks, bulk operations, and error handling already in place. The main gap is calendar management operations which the current service doesn't implement.

## Detailed Findings

### Database Schema Requirements

#### New Table: `project_calendars`

Based on the design document (`docs/design/GOOGLE_CALENDARS_FOR_PROJECTS.md`), a new mapping table is needed:

```sql
CREATE TABLE project_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_id text NOT NULL,          -- Google Calendar ID
  calendar_name text NOT NULL,
  color_id text DEFAULT '7',          -- Google color ID (1-11)
  hex_color text,                     -- For UI display
  sync_enabled boolean DEFAULT true,
  visibility text DEFAULT 'private',  -- 'public' | 'private' | 'shared'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_synced_at timestamptz,
  sync_status text DEFAULT 'active',  -- 'active' | 'paused' | 'error'
  sync_error text,
  UNIQUE(user_id, project_id)
);
```

#### Projects Table Updates

```sql
ALTER TABLE projects
ADD COLUMN calendar_color_id text DEFAULT '7',
ADD COLUMN calendar_sync_enabled boolean DEFAULT true;
```

#### Existing Calendar Tables

- `user_calendar_tokens` - OAuth credentials (ready)
- `task_calendar_events` - Task-to-event mapping (needs `calendar_id` to reference project calendars)
- `calendar_webhook_channels` - Webhook management (needs multi-calendar support)
- `user_calendar_preferences` - User scheduling preferences (ready)

### CalendarService Extensions

The current service (`src/lib/services/calendar-service.ts`) lacks calendar management operations:

#### Missing Google Calendar API Methods

```typescript
// Not implemented in current service:
-calendars.insert() - // Create new calendars
	calendars.patch() - // Update calendar properties
	calendars.delete() - // Delete calendars
	calendars.list() - // List user's calendars
	acl.insert() - // Share calendars
	acl.list() - // List calendar permissions
	acl.delete(); // Revoke calendar access
```

#### Required New Methods

```typescript
class CalendarService {
	// Calendar CRUD operations
	async createProjectCalendar(
		userId: string,
		projectId: string,
		options: {
			name: string;
			description?: string;
			colorId?: string;
			timeZone?: string;
		}
	): Promise<ProjectCalendarResult>;

	async updateCalendarProperties(
		userId: string,
		calendarId: string,
		updates: {
			summary?: string;
			colorId?: string;
		}
	): Promise<UpdateResult>;

	async deleteProjectCalendar(userId: string, calendarId: string): Promise<void>;

	async listUserCalendars(userId: string): Promise<CalendarList>;
}
```

### ProjectHeader UI Implementation

#### Current Structure (`src/lib/components/project/ProjectHeader.svelte`)

- Has "Context" button with Settings icon that opens ProjectEditModal
- Desktop and mobile responsive layouts
- Uses `projectStoreV2` for reactive data

#### Recommended Implementation

1. **Add Calendar Settings Button** in header actions:
    - Desktop: New button with Calendar icon
    - Mobile: Add to dropdown menu

2. **Create ProjectCalendarSettingsModal.svelte**:
    - Calendar connection status
    - Color picker (Google's 11 preset colors)
    - Calendar name customization
    - Sync enable/disable toggle
    - Calendar sharing settings

3. **UI Components Available**:
    - `Modal` system with mobile responsiveness
    - `FormField`, `Button`, `Select` for forms
    - `RadioGroup` for color selection
    - Gradient backgrounds for visual sections

### Service Layer Updates

#### Task Scheduling Flow Changes

**Current Implementation:**

```typescript
// All tasks go to primary calendar
await calendarService.scheduleTask(userId, {
	task_id,
	calendar_id: 'primary' // Hardcoded
});
```

**Required Implementation:**

```typescript
// Route to project-specific calendar
const projectCalendar = await getProjectCalendar(task.project_id);
await calendarService.scheduleTask(userId, {
	task_id,
	calendar_id: projectCalendar?.calendar_id || 'primary'
});
```

#### New ProjectCalendarService

```typescript
class ProjectCalendarService {
	async createProjectCalendar(projectId: string, userId: string): Promise<string>;
	async getProjectCalendar(projectId: string): Promise<ProjectCalendar | null>;
	async updateCalendarSettings(projectId: string, settings: CalendarSettings): Promise<void>;
	async deleteProjectCalendar(projectId: string): Promise<void>;
}
```

### API Endpoints Required

#### New Endpoints Needed

1. **`/api/projects/[id]/calendar/`**
    - POST: Create project calendar
    - GET: Get calendar details
    - PUT: Update calendar settings
    - DELETE: Remove calendar

2. **`/api/projects/[id]/calendar/settings/`**
    - GET/PUT: Manage calendar preferences

3. **`/api/projects/[id]/calendar/share/`**
    - POST: Share with team members
    - DELETE: Revoke access

#### Existing Endpoints to Modify

- `/api/calendar/+server.ts` - Update to accept project calendar IDs
- `/api/calendar/webhook/+server.ts` - Support multiple calendar webhooks
- `/api/projects/[id]/phases/[phaseId]/schedule/+server.ts` - Use project calendar

### Webhook System Enhancements

#### Current State

- One webhook per user for primary calendar
- Single entry in `calendar_webhook_channels` table

#### Required Changes

- Multiple webhooks per user (one per calendar)
- Update webhook registration to handle array of calendar IDs
- Modify webhook handler to route events to correct projects

### Google Calendar Color System

Google provides 11 preset colors (from design doc):

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

## Code References

### Key Files to Modify

- `src/lib/services/calendar-service.ts` - Add calendar management methods
- `src/lib/components/project/ProjectHeader.svelte` - Add calendar settings button
- `src/lib/components/project/ProjectModals.svelte` - Register new calendar modal
- `src/lib/database.types.ts` - Add new table types after migration

### Existing Integration Points

- `src/routes/api/calendar/+server.ts` - Main calendar API proxy
- `src/routes/webhooks/calendar-events/+server.ts` - Webhook handler
- `src/lib/services/task-time-slot-finder.ts` - Intelligent scheduling service
- `src/routes/api/projects/[id]/phases/[phaseId]/schedule/+server.ts` - Phase scheduling

### Database Files

- Create migration: `supabase/migrations/[timestamp]_add_project_calendars.sql`

## Architecture Insights

### Strengths of Current System

1. **Robust Foundation**: OAuth, webhooks, error handling already implemented
2. **Flexible Design**: Methods accept `calendar_id` parameters (not hardcoded everywhere)
3. **Bulk Operations**: Optimized for handling multiple calendar operations
4. **Recurring Tasks**: Full RRULE support ready for project calendars

### Key Challenges

1. **Calendar Management Gap**: No Google Calendar creation/deletion in current service
2. **Webhook Scaling**: Need to manage multiple webhooks per user efficiently
3. **Migration Complexity**: Existing tasks need migration to new calendars
4. **UI Complexity**: Calendar settings add another layer to project configuration

### Design Decisions

- **One Calendar Per Project**: Clean separation and visual organization
- **Google Color Limitation**: Only 11 preset colors available (no custom hex)
- **Backward Compatibility**: Support fallback to primary calendar
- **Opt-in Migration**: Allow gradual adoption of project calendars

## Implementation Plan

### Phase 1: Database & Core Services (Week 1)

1. Create database migrations for `project_calendars` table
2. Implement calendar CRUD operations in CalendarService
3. Create ProjectCalendarService for business logic
4. Add API endpoints for calendar management

### Phase 2: UI Implementation (Week 2)

1. Create ProjectCalendarSettingsModal component
2. Add calendar button to ProjectHeader
3. Implement color picker with Google's 11 colors
4. Add calendar status indicators

### Phase 3: Integration & Migration (Week 3)

1. Update task scheduling to use project calendars
2. Enhance webhook system for multiple calendars
3. Create migration tools for existing projects
4. Add bulk calendar operations

### Phase 4: Testing & Polish (Week 4)

1. Comprehensive testing of calendar sync
2. Error handling and retry mechanisms
3. Performance optimization for bulk operations
4. Documentation and user guides

## Migration Strategy

### Backward Compatibility Approach

1. **Default Behavior**: Continue using primary calendar if no project calendar exists
2. **Opt-in Creation**: New projects get option to create calendar
3. **Gradual Migration**: Existing projects can enable calendars individually
4. **Bulk Tools**: Admin tools to create calendars for all projects

### Data Migration Steps

```sql
-- 1. Add new tables
CREATE TABLE project_calendars ...

-- 2. Update existing tables
ALTER TABLE projects ADD COLUMN calendar_color_id ...

-- 3. Add indexes for performance
CREATE INDEX idx_project_calendars_user_project ON project_calendars(user_id, project_id);
CREATE INDEX idx_project_calendars_calendar_id ON project_calendars(calendar_id);
```

## Open Questions

1. **Calendar Limits**: Google allows 250 calendars per account - need user warning? - no
2. **Deletion Policy**: What happens to calendar when project is deleted? calendar needs to be deleted
3. **Sharing Defaults**: Should project calendars be private or shared by default? private by default
4. **Color Assignment**: Auto-assign colors or require user selection? auto assign colors but user can update
5. **Naming Convention**: Use project name directly or add prefix/suffix? use project name directly
6. **Archive Strategy**: Hide completed project calendars or delete them?

## Related Research

- `docs/design/GOOGLE_CALENDARS_FOR_PROJECTS.md` - Original design specification
- `docs/design/RECURRING_TASKS_DOCUMENTATION.md` - Recurring task calendar integration
- `docs/design/PROJECT_SERVICE_USAGE.md` - Project service patterns

## Recommendations

### High Priority

1. **Implement Calendar CRUD first** - Core functionality blocking everything else
2. **Database schema changes** - Foundation for all features
3. **Basic UI in ProjectHeader** - Minimum viable calendar settings

### Medium Priority

1. **Webhook enhancements** - Can work with manual sync initially
2. **Color themes** - Nice to have but not critical
3. **Sharing features** - Can be added incrementally

### Low Priority

1. **Migration tools** - Only needed after core features work
2. **Bulk operations** - Optimization for power users
3. **Analytics** - Calendar usage metrics

## Conclusion

Implementing Google Calendars for Projects is feasible with the existing infrastructure. The main technical gap is calendar management operations in CalendarService. The architecture supports this enhancement well, with most integration points already accepting dynamic calendar IDs. The implementation can be done incrementally with backward compatibility, allowing gradual adoption without disrupting existing users.
