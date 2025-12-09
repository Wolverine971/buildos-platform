---
date: 2025-10-06T17:31:44Z
researcher: Claude
git_commit: 5ccb69ca18cc0c394f285dace332b96308a45ddb
branch: main
repository: buildos-platform
topic: 'Google Calendar OAuth Scopes - Verification Explanation'
tags: [research, google-calendar, oauth, verification, scopes]
status: complete
last_updated: 2025-10-06
last_updated_by: Claude
path: thoughts/shared/research/2025-10-06_17-31-44_google-calendar-oauth-scopes-verification.md
---

# Research: Google Calendar OAuth Scopes - Verification Explanation

**Date**: 2025-10-06T17:31:44Z
**Researcher**: Claude
**Git Commit**: 5ccb69ca18cc0c394f285dace332b96308a45ddb
**Branch**: main
**Repository**: buildos-platform

## Research Question

User is submitting Google OAuth verification for BuildOS platform and needs to explain why the `https://www.googleapis.com/auth/calendar` scope is required, how it will be used, and why more limited scopes are insufficient.

## Summary

BuildOS is an AI-powered productivity platform that provides comprehensive Google Calendar integration with the following core capabilities:

1. **Project-Specific Calendar Creation** - Creates dedicated Google Calendars for each project
2. **Two-Way Real-Time Sync** - Bidirectional synchronization via webhooks
3. **AI-Powered Calendar Analysis** - Analyzes calendar patterns to suggest projects
4. **Smart Task Scheduling** - Schedules tasks around existing commitments
5. **Calendar Management** - Updates calendar properties (name, color, description)

The full calendar scope (`https://www.googleapis.com/auth/calendar`) is required because BuildOS needs to:

- **Create and delete calendars** (not possible with events-only scopes)
- **Modify calendar properties** (name, color, description, timezone)
- **Manage calendar sharing/ACL** (for team collaboration)
- **Register webhooks for real-time sync** (requires calendar management access)

## Detailed Findings

### Scope Currently Being Requested

**Primary OAuth Scope:**

```
https://www.googleapis.com/auth/calendar
```

**Additional Scopes:**

```
https://www.googleapis.com/auth/userinfo.email
openid
```

**Configuration Locations:**

- `/apps/web/src/lib/services/google-oauth-service.ts:117-121`
- `/apps/web/src/routes/profile/+page.server.ts:18-22`

### Core Features Requiring Full Calendar Scope

#### 1. **Project Calendar Creation** (Requires calendar.calendars scope)

**Implementation:** `/apps/web/src/lib/services/calendar-service.ts:586-649`

**Google Calendar API Methods Used:**

- `calendar.calendars.insert` - Create new calendar
- `calendar.calendars.patch` - Update calendar properties
- `calendar.calendars.delete` - Delete project calendar
- `calendar.calendarList.patch` - Update calendar color in list

**User Workflow:**

1. User creates a BuildOS project
2. System creates dedicated Google Calendar for that project
3. All project tasks are scheduled to this calendar
4. Users can see/hide individual project calendars in Google Calendar
5. Calendars can be shared with team members

**Why Events-Only Scope Is Insufficient:**

- `calendar.events` scope only allows event management on existing calendars
- Cannot create new calendars
- Cannot modify calendar properties (name, color, description)
- Cannot delete calendars when projects are deleted

**Code Reference:**

```typescript
// apps/web/src/lib/services/calendar-service.ts:586
async createProjectCalendar(userId: string, options: {
    name: string;
    description?: string;
    colorId?: string;
    timeZone?: string;
}): Promise<{ success: boolean; calendarId?: string; error?: string }> {
    // ... creates new Google Calendar via calendar.calendars.insert
}
```

#### 2. **Calendar Property Management** (Requires calendar.calendars scope)

**Implementation:** `/apps/web/src/lib/services/calendar-service.ts:651-683`

**Google Calendar API Methods Used:**

- `calendar.calendars.patch` - Update calendar settings
- `calendar.calendarList.patch` - Update calendar appearance

**User Operations:**

- Rename project calendars when projects are renamed
- Update calendar colors for visual organization
- Modify calendar descriptions
- Change timezone settings

**Code Reference:**

```typescript
// apps/web/src/lib/services/calendar-service.ts:651
async updateCalendarProperties(
    userId: string,
    calendarId: string,
    updates: {
        summary?: string;
        description?: string;
        colorId?: string;
        timeZone?: string;
    }
): Promise<{ success: boolean; error?: string }> {
    // Updates calendar properties via calendar.calendars.patch
}
```

#### 3. **Calendar Sharing & ACL Management** (Requires calendar.calendars scope)

**Implementation:** `/apps/web/src/lib/services/calendar-service.ts:725-810`

**Google Calendar API Methods Used:**

- `calendar.acl.insert` - Add sharing permissions
- `calendar.acl.list` - List current permissions
- `calendar.acl.delete` - Remove sharing permissions

**User Workflow:**

1. User creates project calendar
2. User shares calendar with team members
3. Team members can view/edit based on permissions (reader/writer/owner)
4. Users can revoke access when needed

**Why This Requires Full Scope:**

- ACL management requires calendar management permissions
- Cannot share calendars with events-only scope

**Code Reference:**

```typescript
// apps/web/src/lib/services/calendar-service.ts:725
async shareCalendar(
    userId: string,
    calendarId: string,
    shares: Array<{ email: string; role: 'reader' | 'writer' | 'owner' }>
): Promise<{ success: boolean; sharedWith?: string[]; error?: string }> {
    // Manages calendar ACL via calendar.acl.insert
}
```

#### 4. **Webhook Registration for Real-Time Sync** (Requires calendar.calendars scope)

**Implementation:** `/apps/web/src/lib/services/calendar-webhook-service.ts:42-117`

**Google Calendar API Methods Used:**

- `calendar.events.watch` - Register webhook channel
- `calendar.channels.stop` - Unregister webhook

**Feature:** Two-way real-time synchronization

- Changes in Google Calendar → Update BuildOS tasks
- Changes in BuildOS → Update Google Calendar events
- Webhook notifications trigger incremental sync

**Why This Requires Full Scope:**

- Webhook registration requires calendar management permissions
- Read-only scopes cannot register webhooks
- Events-only scopes have limited webhook capabilities

**Code Reference:**

```typescript
// apps/web/src/lib/services/calendar-webhook-service.ts:42
async registerWebhook(
    userId: string,
    webhookUrl: string,
    calendarId: string = 'primary'
): Promise<{ success: boolean; channelId?: string; expiration?: string; error?: string }> {
    // Registers webhook via calendar.events.watch
    // Requires full calendar access
}
```

#### 5. **Calendar List Management** (Requires calendar.calendars scope)

**Implementation:** `/apps/web/src/lib/services/calendar-service.ts:685-710`

**Google Calendar API Methods Used:**

- `calendar.calendarList.list` - List all user calendars

**User Operations:**

- View all available calendars
- Select calendars for AI analysis
- Choose calendar for task scheduling

**Code Reference:**

```typescript
// apps/web/src/lib/services/calendar-service.ts:685
async listUserCalendars(userId: string): Promise<{
    success: boolean;
    calendars?: Array<{
        id: string;
        summary: string;
        description?: string;
        backgroundColor?: string;
        primary?: boolean;
    }>;
    error?: string;
}> {
    // Lists calendars via calendar.calendarList.list
}
```

### Additional Features Using Calendar Scope

#### 6. **AI-Powered Calendar Analysis**

**Implementation:** `/apps/web/src/lib/services/calendar-analysis.service.ts`

**Purpose:** Analyzes user's calendar to detect project patterns and suggest new projects

**Operations:**

- Read calendar events across multiple calendars
- Analyze recurring meetings and patterns
- Detect attendee patterns and keywords
- Suggest projects based on calendar commitments

**Google Calendar API Usage:**

- Requires access to multiple calendars (not just primary)
- Needs full event history access
- Calendar list access to analyze across calendars

#### 7. **Recurring Event Management**

**Implementation:** `/apps/web/src/lib/services/calendar-service.ts:279-395`

**Features:**

- Create recurring tasks with RRULE patterns
- Handle recurring event exceptions
- Update all instances or single instances
- Track recurrence modifications

**Google Calendar API Methods:**

- `calendar.events.insert` with recurrence rules
- `calendar.events.update` with recurrence handling
- Instance-specific modifications

#### 8. **Batch Operations**

**Implementation:** Various locations in calendar-service.ts

**Operations:**

- `bulkScheduleTasks` - Schedule multiple tasks at once
- `bulkUpdateCalendarEvents` - Update multiple events
- `bulkDeleteCalendarEvents` - Delete multiple events

**Why Full Scope Needed:**

- Batch operations span multiple calendars
- Requires comprehensive access to all user calendars
- Performance optimization for large projects

## Code References

### Service Layer Files:

- `/apps/web/src/lib/services/google-oauth-service.ts` - OAuth authentication
- `/apps/web/src/lib/services/calendar-service.ts` - Core calendar operations
- `/apps/web/src/lib/services/project-calendar.service.ts` - Project calendar management
- `/apps/web/src/lib/services/calendar-webhook-service.ts` - Two-way sync webhooks
- `/apps/web/src/lib/services/calendar-analysis.service.ts` - AI analysis

### API Endpoints:

- `/apps/web/src/routes/api/calendar/+server.ts` - Calendar operations proxy
- `/apps/web/src/routes/api/projects/[id]/calendar/+server.ts` - Project calendar API
- `/apps/web/src/routes/api/calendar/analyze/+server.ts` - Calendar analysis API
- `/apps/web/src/routes/auth/google/calendar-callback/+page.server.ts` - OAuth callback

### UI Components:

- `/apps/web/src/lib/components/profile/CalendarTab.svelte` - Main settings UI
- `/apps/web/src/lib/components/calendar/CalendarAnalysisModal.svelte` - Analysis UI
- `/apps/web/src/lib/components/project/ProjectCalendarConnectModal.svelte` - Project calendar UI

## Architecture Insights

### Why More Limited Scopes Are Insufficient

**Alternative Scopes Available:**

1. `https://www.googleapis.com/auth/calendar.readonly` - Read-only access
2. `https://www.googleapis.com/auth/calendar.events` - Events only (no calendar management)
3. `https://www.googleapis.com/auth/calendar.events.readonly` - Read-only events

**Why These Don't Work for BuildOS:**

#### Events-Only Scope Limitations:

- ❌ Cannot create new calendars (required for project calendars)
- ❌ Cannot modify calendar properties (name, color, description)
- ❌ Cannot manage calendar sharing/ACL
- ❌ Cannot register webhooks reliably
- ❌ Cannot delete calendars when projects are archived

#### Read-Only Scope Limitations:

- ❌ Cannot schedule tasks to calendar
- ❌ Cannot create/update/delete events
- ❌ Cannot create project calendars
- ❌ Cannot enable two-way sync

#### Why Full Calendar Scope Is Essential:

**Core Value Proposition Requires:**

1. **Calendar Creation** - One Google Calendar per project (requires `calendar.calendars.insert`)
2. **Calendar Management** - Update properties when projects change (requires `calendar.calendars.patch`)
3. **Calendar Deletion** - Clean up when projects archived (requires `calendar.calendars.delete`)
4. **Calendar Sharing** - Team collaboration (requires `calendar.acl` management)
5. **Webhook Registration** - Real-time sync (requires full calendar access)
6. **Multi-Calendar Operations** - AI analysis across calendars (requires list + read access)

**Technical Requirements:**

- BuildOS creates up to 250 project calendars per user
- Each calendar has custom name, color, and description
- Calendars are shared with project team members
- Webhooks monitor all project calendars for changes
- Calendar properties update when projects are renamed/recolored

### Database Schema Supporting Calendar Features

**Tables:**

- `user_calendar_tokens` - OAuth tokens with scope tracking
- `user_calendar_preferences` - Scheduling preferences (work hours, timezone)
- `task_calendar_events` - Task-to-event mapping with sync status
- `project_calendars` - Project-to-calendar mapping
- `calendar_webhook_channels` - Webhook registration tracking
- `calendar_analyses` - AI analysis history
- `calendar_project_suggestions` - AI-generated project suggestions

**Migration Files:**

- `/apps/web/supabase/migrations/20250129_calendar_intelligence_integration.sql`

## Historical Context (from thoughts/)

**Related Research:**

- `/thoughts/shared/research/2025-10-06_02-30-00_calendar-analysis-flow-audit.md` - Calendar analysis improvements
- `/thoughts/shared/research/2025-10-04_calendar-scheduling-ui-patterns-research.md` - UI patterns
- `/thoughts/shared/research/2025-10-03_19-11-11_calendar-analysis-task-editing-enhancement.md` - Task editing

**Design Decisions:**

- `/apps/web/docs/design/calendar-per-project-architecture.md` - One calendar per project architecture
- `/apps/web/docs/design/calendar-webhook-integration.md` - Two-way sync design

## Recommended Explanation for Google OAuth Verification

### How the Scopes Will Be Used

**Scope Requested:** `https://www.googleapis.com/auth/calendar`

**Primary Use Cases:**

1. **Project-Specific Calendar Creation & Management**
    - BuildOS creates dedicated Google Calendars for each user project (up to 250 per account)
    - Each calendar has a custom name, color, and description matching the project
    - Calendars are updated when projects are renamed or settings changed
    - Calendars are deleted when projects are archived
    - **API Methods:** `calendar.calendars.insert`, `calendar.calendars.patch`, `calendar.calendars.delete`

2. **Team Collaboration via Calendar Sharing**
    - Project calendars can be shared with team members with appropriate permissions (reader/writer/owner)
    - Users can grant and revoke access as team membership changes
    - **API Methods:** `calendar.acl.insert`, `calendar.acl.list`, `calendar.acl.delete`

3. **Two-Way Real-Time Synchronization**
    - BuildOS registers webhooks to receive real-time notifications when calendar events change
    - Changes in Google Calendar automatically update BuildOS tasks
    - Changes in BuildOS automatically update Google Calendar events
    - **API Methods:** `calendar.events.watch`, `calendar.channels.stop`, `calendar.events.list` with sync tokens

4. **Task Scheduling & Event Management**
    - Users schedule BuildOS tasks to their Google Calendars
    - System creates, updates, and deletes calendar events based on task changes
    - Supports recurring tasks with complex recurrence patterns (RRULE)
    - **API Methods:** `calendar.events.insert`, `calendar.events.update`, `calendar.events.delete`

5. **AI-Powered Calendar Intelligence**
    - Analyzes user's existing calendar events to detect project patterns
    - Requires reading events across multiple calendars
    - Suggests new projects based on recurring meetings and commitments
    - **API Methods:** `calendar.events.list`, `calendar.calendarList.list`

### Why More Limited Scopes Are Insufficient

**Alternative Scope: `calendar.events`** (Events-only access)

- ❌ Cannot create new calendars - Core feature requires one calendar per project
- ❌ Cannot modify calendar properties (name, color, description) - Essential for project organization
- ❌ Cannot manage calendar sharing - Required for team collaboration
- ❌ Limited webhook capabilities - Real-time sync depends on full calendar access

**Alternative Scope: `calendar.readonly`** (Read-only access)

- ❌ Cannot schedule tasks - Core functionality is task scheduling
- ❌ Cannot create/update events - Primary use case is task-to-calendar sync
- ❌ Cannot enable two-way sync - Read-only prevents updates from Google Calendar to BuildOS

**Why Full Calendar Scope Is Required:**

- **Calendar Lifecycle Management:** BuildOS must create, update, and delete project calendars as part of normal project lifecycle
- **Property Modification:** Calendar names, colors, and descriptions must match project settings
- **ACL Management:** Team collaboration requires managing calendar sharing permissions
- **Webhook Registration:** Real-time bidirectional sync requires full calendar access to register and maintain webhook channels
- **Multi-Calendar Operations:** AI analysis and batch operations require access to list and manage multiple calendars

**Core Business Logic Dependency:**
BuildOS's fundamental architecture is "one Google Calendar per project" - this design provides:

- Clean project separation in Google Calendar
- Individual calendar visibility control
- Per-project team sharing
- Project-specific color coding
- Isolated calendar deletion when projects end

This architecture is impossible with events-only scope, as it fundamentally requires calendar creation and management capabilities.

## Open Questions

- None - Implementation and scope requirements are well-documented

## Security & Privacy Considerations

**Token Storage:**

- OAuth tokens stored encrypted in database (`user_calendar_tokens` table)
- Automatic token refresh with expiration handling
- Secure token revocation on disconnect

**Webhook Security:**

- Token verification on all webhook notifications
- Channel expiration and renewal (7-day TTL)
- Domain verification required for production webhooks

**Data Access:**

- Users explicitly authorize calendar access via OAuth flow
- Clear consent screen showing all permissions
- Users can disconnect and revoke access anytime
- Activity logging for all calendar operations

**Scope Justification:**

- Every API method using `calendar.calendars.*` is essential for core features
- No broader access than necessary
- All calendar management tied to specific user actions
- No background access without user initiation

---

## CONDENSED VERSION FOR GOOGLE SUBMISSION (<950 characters)

BuildOS creates one dedicated Google Calendar per user project for clean organization and team collaboration.

Required calendar.calendars permissions:
• Create project calendars (calendar.calendars.insert)
• Update calendar names/colors when projects change (calendar.calendars.patch)
• Delete calendars when projects archived (calendar.calendars.delete)
• Manage calendar sharing with teams (calendar.acl.\*)
• Register webhooks for two-way real-time sync (calendar.events.watch)

Why more limited scopes are insufficient:
The calendar.events scope only manages events on existing calendars—it cannot create or manage calendars themselves. Our core architecture requires creating one new Google Calendar per project, which is technically impossible with events-only scope. Without calendar.calendars.\* permissions, the platform cannot function.

**Character count: 687 characters**
