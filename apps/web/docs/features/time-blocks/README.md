# Time Play - Implementation Specification

**Status:** Phase 3 (Time Allocation Visualization) In Progress
**Priority:** High
**Owner:** TBD
**Created:** 2025-10-10
**Last Updated:** 2025-10-14

## Table of Contents

- [Overview](#overview)
- [Feature Philosophy](#feature-philosophy)
- [User Requirements](#user-requirements)
- [User Flows](#user-flows)
- [Technical Architecture](#technical-architecture)
- [Database Schema](#database-schema)
- [API Specifications](#api-specifications)
- [UI/UX Design](#uiux-design)
- [Implementation Phases](#implementation-phases)
- [Integration Points](#integration-points)
- [Testing Strategy](#testing-strategy)
- [Open Questions](#open-questions)
- [Related Research](#related-research)

---

## Overview

**Time Play** is a visual time blocking feature that allows users to proactively manage their available time by blocking out calendar slots for focused work. Users can create two types of time blocks:

1. **Project-Specific Blocks**: Reserve time to work on a specific project, with AI-suggested tasks in the event description
2. **Build Blocks**: Generic focused work time with flexibility to work on any project, with AI suggestions for high-priority tasks

### Key Differentiators

Unlike the existing Phase Scheduling feature (which schedules tasks for a specific phase), Time Play is:

- **Gap-centric**: Shows available time first, then allows blocking
- **User-driven**: User chooses when to block time (not AI-driven)
- **Cross-project**: Can see and allocate time across all projects
- **Visual**: Real-time visualization of time allocation per project

---

## Feature Philosophy

### "Intentional Time Allocation"

Time Play embodies the principle that **protecting time is as important as planning tasks**.

#### Core Principles

1. **Proactive Time Management**
    - Users claim their time before it gets filled with reactive tasks
    - Visual representation of "where my time is going"
    - Prevents calendar fragmentation

2. **Flexibility with Structure**
    - Project blocks = commitment to specific work
    - Build blocks = protected time with flexibility
    - Balance between planning and adaptability

3. **AI as Assistant, Not Dictator**
    - AI suggests what to work on during blocks
    - Suggestions appear in event descriptions (not forced)
    - User maintains full control over time allocation

4. **Context-Aware Suggestions**
    - AI considers project priorities, task urgency, and available time
    - Suggestions match the type of block (project-specific vs open)
    - Adapts to user's working patterns

---

## User Requirements

### Functional Requirements

#### FR1: Calendar Visualization

- **FR1.1**: Display user's calendar with clear distinction between occupied and available time
- **FR1.2**: Show time blocks in different colors based on type (project blocks, build blocks, existing events)
- **FR1.3**: Support day, week, and month views
- **FR1.4**: Highlight available time gaps clearly
- **FR1.5**: Display existing Google Calendar events in grey alongside time blocks ✅
- **FR1.6**: Show connection prompt when Google Calendar not connected ✅
- **FR1.7**: Allow users to click on calendar events to view full details ✅

#### FR2: Time Block Creation

- **FR2.1**: Users can create project-specific time blocks by selecting a project and time range
- **FR2.2**: Users can create generic "build blocks" without project assignment
- **FR2.3**: Time blocks sync to Google Calendar with proper titles and descriptions
- **FR2.4**: Calendar event titles for build blocks should be "Build Block"
- **FR2.5**: Event descriptions contain AI-generated task suggestions

#### FR3: AI Task Suggestions

- **FR3.1**: For project blocks, suggest high-priority tasks from that project
- **FR3.2**: For build blocks, suggest high-priority tasks from any project
- **FR3.3**: Suggestions consider task duration, priority, and context
- **FR3.4**: Users can view suggestions in event description after creation

#### FR4: Time Allocation Visualization

- **FR4.1**: Display real-time breakdown of scheduled time per project
- **FR4.2**: Update visualization dynamically as blocks are added/removed/modified
- **FR4.3**: Show total hours allocated per project
- **FR4.4**: Visual legend or chart showing time distribution

#### FR5: Block Management

- **FR5.1**: Users can edit block duration and timing
- **FR5.2**: Users can delete blocks
- **FR5.3**: Users can convert build blocks to project blocks and vice versa
- **FR5.4**: Changes sync to Google Calendar in real-time

### Non-Functional Requirements

#### NFR1: Performance

- Calendar view renders in <1 second
- Time allocation calculations update in <500ms
- AI suggestions generate in <3 seconds

#### NFR2: Usability

- Intuitive drag-and-drop or click-to-block interaction
- Mobile-responsive design
- Clear visual hierarchy

#### NFR3: Reliability

- Calendar sync operates without data loss
- Graceful degradation if Google Calendar is unavailable
- Conflict detection and warnings

---

## User Flows

### Flow 1: Create Project-Specific Block

```
1. User navigates to /time-play page
2. System displays calendar with available time gaps highlighted
3. User selects a time gap (click or drag)
4. System shows "Create Time Block" modal
5. User selects "Project Block" option
6. User chooses project from dropdown
7. User confirms time range
8. System:
   a. Creates calendar event with title "[Project Name] - Work Session"
   b. Generates AI task suggestions for that project
   c. Adds suggestions to event description
   d. Syncs to Google Calendar
   e. Updates time allocation visualization
9. Success confirmation shown
```

### Flow 2: Create Build Block

```
1. User navigates to /time-play page
2. System displays calendar with available gaps
3. User selects a time gap
4. System shows "Create Time Block" modal
5. User selects "Build Block" option
6. User confirms time range
7. System:
   a. Creates calendar event with title "Build Block"
   b. Generates AI task suggestions from all projects
   c. Adds suggestions to event description with project context
   d. Syncs to Google Calendar
   e. Updates time allocation visualization (as "Flexible Time")
8. Success confirmation shown
```

### Flow 3: View Time Allocation

```
1. User navigates to /time-play page
2. System displays:
   a. Calendar view with all blocks
   b. Time allocation sidebar/panel showing:
      - Total scheduled hours this week
      - Hours per project (with percentages)
      - Hours in build blocks (flexible time)
      - Visual chart (pie chart or bar chart)
3. User can filter by date range (this week, next week, this month)
4. Visualization updates dynamically as user adds/modifies blocks
```

### Flow 4: Modify Existing Block

```
1. User clicks on existing block in calendar
2. System shows block details modal
3. User can:
   a. Change duration (drag or input)
   b. Change time (drag or input)
   c. Switch between project block and build block
   d. View current AI suggestions
   e. Regenerate AI suggestions
   f. Delete block
4. System validates changes (conflict detection)
5. System updates calendar event and syncs to Google Calendar
6. Time allocation visualization updates
```

---

## Technical Architecture

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Time Play Page                           │
│  /src/routes/time-play/+page.svelte                         │
│                                                              │
│  ┌────────────────────┐  ┌──────────────────────────────┐  │
│  │  Calendar View     │  │  Time Allocation Panel       │  │
│  │  Component         │  │  (Legend/Visualization)      │  │
│  │                    │  │                              │  │
│  │  - Day/Week/Month  │  │  - Hours per project         │  │
│  │  - Available gaps  │  │  - Pie/Bar chart             │  │
│  │  - Time blocks     │  │  - Total hours               │  │
│  │  - Existing events │  │  - Build block hours         │  │
│  └────────────────────┘  └──────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Block Creation Modal                                 │  │
│  │  - Project selector                                   │  │
│  │  - Build block option                                 │  │
│  │  - Time range picker                                  │  │
│  │  - Preview AI suggestions                             │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ├─── Read: timePlayStore.ts
                              │         (Svelte 5 runes)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              API Layer - /api/time-play/                     │
│                                                              │
│  ├─ POST /create        - Create time block                 │
│  ├─ PUT /update/:id     - Update time block                 │
│  ├─ DELETE /delete/:id  - Delete time block                 │
│  ├─ GET /blocks         - Get all time blocks for user      │
│  ├─ GET /allocation     - Get time allocation breakdown     │
│  └─ POST /suggestions   - Generate AI task suggestions      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Service Layer                                   │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  TimeBlockService                                   │    │
│  │  /src/lib/services/time-block.service.ts           │    │
│  │                                                      │    │
│  │  - createTimeBlock()                                │    │
│  │  - updateTimeBlock()                                │    │
│  │  - deleteTimeBlock()                                │    │
│  │  - getTimeBlocks()                                  │    │
│  │  - calculateTimeAllocation()                        │    │
│  │  - syncToGoogleCalendar()                           │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  TimeBlockSuggestionService                         │    │
│  │  /src/lib/services/time-block-suggestion.service.ts│    │
│  │                                                      │    │
│  │  - generateProjectSuggestions()                     │    │
│  │  - generateBuildBlockSuggestions()                  │    │
│  │  - formatSuggestionForDescription()                 │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Existing Services (Reuse)                          │    │
│  │                                                      │    │
│  │  - CalendarService.findAvailableSlots()            │    │
│  │  - CalendarService.scheduleTask()                  │    │
│  │  - CalendarService.updateCalendarEvent()           │    │
│  │  - CalendarService.deleteCalendarEvent()           │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Database Layer                                  │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  New Table: time_blocks                             │    │
│  │                                                      │    │
│  │  - id                                                │    │
│  │  - user_id                                           │    │
│  │  - block_type ('project' | 'build')                 │    │
│  │  - project_id (nullable)                            │    │
│  │  - start_time                                        │    │
│  │  - end_time                                          │    │
│  │  - duration_minutes                                  │    │
│  │  - calendar_event_id                                │    │
│  │  - ai_suggestions (JSONB)                           │    │
│  │  - created_at                                        │    │
│  │  - updated_at                                        │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Existing Tables (Reuse)                            │    │
│  │                                                      │    │
│  │  - projects                                          │    │
│  │  - tasks                                             │    │
│  │  - task_calendar_events                             │    │
│  │  - user_calendar_preferences                        │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              External Integrations                           │
│                                                              │
│  ├─ Google Calendar API (event creation, update, delete)    │
│  ├─ OpenAI API (task suggestion generation)                 │
│  └─ Supabase (database, auth)                               │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

#### 1. Time Play Page

**Path:** `/src/routes/time-play/+page.svelte`

**Responsibilities:**

- Main entry point for Time Play feature
- Orchestrates calendar view and time allocation panel
- Handles user interactions for block creation

**State Management:**

- Uses `timePlayStore.ts` (Svelte 5 runes)
- Subscribes to block updates and allocation changes

#### 2. Time Block Service

**Path:** `/src/lib/services/time-block.service.ts`

**Core Methods:**

```typescript
class TimeBlockService {
	// Create a new time block
	async createTimeBlock(params: CreateTimeBlockParams): Promise<TimeBlock>;

	// Update existing time block
	async updateTimeBlock(id: string, params: UpdateTimeBlockParams): Promise<TimeBlock>;

	// Delete time block
	async deleteTimeBlock(id: string): Promise<void>;

	// Get time blocks for date range
	async getTimeBlocks(userId: string, startDate: Date, endDate: Date): Promise<TimeBlock[]>;

	// Calculate time allocation breakdown
	async calculateTimeAllocation(
		userId: string,
		startDate: Date,
		endDate: Date
	): Promise<TimeAllocation>;

	// Sync time block to Google Calendar
	async syncToGoogleCalendar(timeBlock: TimeBlock): Promise<string>; // Returns calendar event ID
}
```

#### 3. Time Block Suggestion Service

**Path:** `/src/lib/services/time-block-suggestion.service.ts`

**Core Methods:**

```typescript
class TimeBlockSuggestionService {
	// Generate task suggestions for project block
	async generateProjectSuggestions(params: {
		projectId: string;
		duration_minutes: number;
		startTime: Date;
	}): Promise<TaskSuggestion[]>;

	// Generate task suggestions for build block (cross-project)
	async generateBuildBlockSuggestions(params: {
		userId: string;
		duration_minutes: number;
		startTime: Date;
	}): Promise<TaskSuggestion[]>;

	// Format suggestions for calendar event description
	formatSuggestionForDescription(suggestions: TaskSuggestion[]): string;
}
```

#### 4. Time Play Store

**Path:** `/src/lib/stores/timePlayStore.ts`

**State (Svelte 5 Runes):**

```typescript
interface TimePlayState {
	blocks: TimeBlock[];
	allocation: TimeAllocation | null;
	selectedDateRange: { start: Date; end: Date };
	viewMode: 'day' | 'week' | 'month';
	isCreatingBlock: boolean;
	selectedBlock: TimeBlock | null;
	availableGaps: AvailableSlot[];
}

// Svelte 5 implementation
let blocks = $state<TimeBlock[]>([]);
let allocation = $state<TimeAllocation | null>(null);
let selectedDateRange = $state({ start: new Date(), end: addDays(new Date(), 7) });
let viewMode = $state<'day' | 'week' | 'month'>('week');
let isCreatingBlock = $state(false);
let selectedBlock = $state<TimeBlock | null>(null);
let availableGaps = $state<AvailableSlot[]>([]);

// Derived state
let totalScheduledHours = $derived(
	blocks.reduce((sum, block) => sum + block.duration_minutes / 60, 0)
);
```

---

## Database Schema

### New Table: `time_blocks`

```sql
CREATE TABLE time_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Block configuration
  block_type TEXT NOT NULL CHECK (block_type IN ('project', 'build')),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Timing
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',

  -- Calendar sync
  calendar_event_id TEXT, -- Google Calendar event ID
  calendar_event_link TEXT,
  sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed', 'deleted')),
  last_synced_at TIMESTAMPTZ,

  -- AI suggestions (stored as JSONB for flexibility)
  ai_suggestions JSONB DEFAULT '[]'::jsonb,
  suggestions_generated_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_duration CHECK (duration_minutes > 0),
  CONSTRAINT valid_time_range CHECK (end_time > start_time),
  CONSTRAINT project_required_for_project_blocks CHECK (
    (block_type = 'project' AND project_id IS NOT NULL) OR
    (block_type = 'build' AND project_id IS NULL)
  )
);

-- Indexes for performance
CREATE INDEX idx_time_blocks_user_id ON time_blocks(user_id);
CREATE INDEX idx_time_blocks_user_time_range ON time_blocks(user_id, start_time, end_time);
CREATE INDEX idx_time_blocks_project_id ON time_blocks(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_time_blocks_calendar_event ON time_blocks(calendar_event_id) WHERE calendar_event_id IS NOT NULL;

-- RLS policies
ALTER TABLE time_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own time blocks"
  ON time_blocks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own time blocks"
  ON time_blocks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own time blocks"
  ON time_blocks FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own time blocks"
  ON time_blocks FOR DELETE
  USING (auth.uid() = user_id);

-- Updated timestamp trigger
CREATE TRIGGER update_time_blocks_updated_at
  BEFORE UPDATE ON time_blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### TypeScript Types

```typescript
// /packages/shared-types/src/time-block.types.ts

export type TimeBlockType = 'project' | 'build';

export type TimeBlockSyncStatus = 'pending' | 'synced' | 'failed' | 'deleted';

export interface TaskSuggestion {
	task_id: string;
	task_title: string;
	task_description?: string;
	project_id?: string;
	project_name?: string;
	estimated_duration_minutes: number;
	priority: 'low' | 'medium' | 'high';
	rationale: string; // AI explanation for why this task fits
}

export interface TimeBlock {
	id: string;
	user_id: string;
	block_type: TimeBlockType;
	project_id: string | null;
	start_time: string; // ISO timestamp
	end_time: string; // ISO timestamp
	duration_minutes: number;
	timezone: string;
	calendar_event_id: string | null;
	calendar_event_link: string | null;
	sync_status: TimeBlockSyncStatus;
	last_synced_at: string | null;
	ai_suggestions: TaskSuggestion[];
	suggestions_generated_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface CreateTimeBlockParams {
	block_type: TimeBlockType;
	project_id?: string; // Required if block_type is 'project'
	start_time: Date;
	end_time: Date;
	timezone?: string;
}

export interface UpdateTimeBlockParams {
	block_type?: TimeBlockType;
	project_id?: string | null;
	start_time?: Date;
	end_time?: Date;
	timezone?: string;
}

export interface TimeAllocation {
	total_hours: number;
	build_block_hours: number;
	project_allocations: ProjectAllocation[];
	date_range: {
		start: string;
		end: string;
	};
}

export interface ProjectAllocation {
	project_id: string;
	project_name: string;
	project_color?: string;
	hours: number;
	percentage: number;
	block_count: number;
}
```

---

## API Specifications

### POST /api/time-play/create

**Purpose:** Create a new time block

**Request Body:**

```typescript
{
  block_type: 'project' | 'build',
  project_id?: string, // Required if block_type is 'project'
  start_time: string, // ISO timestamp
  end_time: string, // ISO timestamp
  timezone?: string
}
```

**Response:** `201 Created`

```typescript
{
  success: true,
  data: {
    time_block: TimeBlock,
    calendar_event_link: string
  }
}
```

**Error Responses:**

- `400 Bad Request` - Invalid parameters or validation error
- `401 Unauthorized` - Not authenticated
- `409 Conflict` - Time block conflicts with existing event
- `500 Internal Server Error` - Server error

**Implementation:**

1. Validate request parameters
2. Check for conflicts with existing calendar events
3. Generate AI task suggestions based on block type
4. Create time block record in database
5. Create Google Calendar event with:
    - Title: "[Project Name] - Work Session" or "Build Block"
    - Description: Formatted AI suggestions
6. Return created time block with calendar link

---

### PUT /api/time-play/update/:id

**Purpose:** Update an existing time block

**Request Body:**

```typescript
{
  block_type?: 'project' | 'build',
  project_id?: string | null,
  start_time?: string,
  end_time?: string,
  timezone?: string,
  regenerate_suggestions?: boolean // If true, regenerate AI suggestions
}
```

**Response:** `200 OK`

```typescript
{
  success: true,
  data: {
    time_block: TimeBlock
  }
}
```

**Implementation:**

1. Validate time block exists and user owns it
2. Validate new parameters
3. Check for conflicts if time changed
4. Update time block in database
5. Update Google Calendar event
6. Regenerate suggestions if requested or block type changed
7. Return updated time block

---

### DELETE /api/time-play/delete/:id

**Purpose:** Delete a time block

**Response:** `200 OK`

```typescript
{
  success: true,
  message: 'Time block deleted successfully'
}
```

**Implementation:**

1. Validate time block exists and user owns it
2. Delete Google Calendar event
3. Soft delete time block (set sync_status to 'deleted')
4. Return success

---

### GET /api/time-play/blocks

**Purpose:** Get all time blocks for a date range

**Query Parameters:**

- `start_date` (required): ISO date string
- `end_date` (required): ISO date string

**Response:** `200 OK`

```typescript
{
  success: true,
  data: {
    blocks: TimeBlock[]
  }
}
```

---

### GET /api/time-play/allocation

**Purpose:** Get time allocation breakdown for a date range

**Query Parameters:**

- `start_date` (required): ISO date string
- `end_date` (required): ISO date string

**Response:** `200 OK`

```typescript
{
  success: true,
  data: {
    allocation: TimeAllocation
  }
}
```

**Implementation:**

1. Fetch all time blocks in date range
2. Calculate total hours
3. Group by project and calculate project allocations
4. Calculate build block hours (non-project blocks)
5. Calculate percentages
6. Return formatted allocation data

---

### POST /api/time-play/suggestions

**Purpose:** Generate AI task suggestions (can be called standalone)

**Request Body:**

```typescript
{
  block_type: 'project' | 'build',
  project_id?: string,
  duration_minutes: number,
  start_time: string // ISO timestamp for context
}
```

**Response:** `200 OK`

```typescript
{
  success: true,
  data: {
    suggestions: TaskSuggestion[]
  }
}
```

**Implementation:**

1. Fetch relevant tasks based on block type
2. Filter tasks by:
    - Priority (high first)
    - Estimated duration (fits within block)
    - Status (backlog or in_progress)
    - Project (if project block)
3. Call LLM to select and rank top 3-5 suggestions
4. Format with rationale
5. Return suggestions

---

### GET /api/calendar/events

**Purpose:** Fetch Google Calendar events for display alongside time blocks

**Query Parameters:**

- `timeMin` (optional): ISO timestamp - start of date range
- `timeMax` (optional): ISO timestamp - end of date range
- `calendarId` (optional): Calendar ID (defaults to 'primary')
- `maxResults` (optional): Maximum number of events to return

**Response:** `200 OK`

```typescript
{
  event_count: number,
  time_range: {
    start: string,
    end: string,
    timeZone?: string
  },
  events: CalendarEvent[]
}
```

**CalendarEvent Type:**

```typescript
interface CalendarEvent {
	id: string;
	summary: string;
	description?: string;
	location?: string;
	start: {
		dateTime?: string;
		date?: string;
		timeZone?: string;
	};
	end: {
		dateTime?: string;
		date?: string;
		timeZone?: string;
	};
	attendees?: Array<{
		email: string;
		displayName?: string;
		responseStatus: 'accepted' | 'declined' | 'tentative' | 'needsAction';
	}>;
	hangoutLink?: string;
	htmlLink: string;
	recurringEventId?: string;
	status: 'confirmed' | 'tentative' | 'cancelled';
}
```

**Error Responses:**

- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Calendar not connected
- `500 Internal Server Error` - Server error

**Implementation:**

1. Verify user authentication
2. Check calendar connection via `CalendarService.hasValidConnection()`
3. Call `CalendarService.getCalendarEvents()` with parameters
4. Return full event data including description, location, attendees
5. Handle disconnection gracefully

**Usage Example:**

```typescript
// Fetch events for current week
const response = await fetch(
	`/api/calendar/events?timeMin=2025-10-14T00:00:00Z&timeMax=2025-10-21T00:00:00Z`
);
const { events } = await response.json();
```

---

## UI/UX Design

### Page Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Header: Time Play                                [Settings ⚙️]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────┐  ┌───────────────────────────┐   │
│  │                           │  │  Time Allocation          │   │
│  │   Calendar View           │  │                           │   │
│  │                           │  │  📊 This Week             │   │
│  │   [Day|Week|Month]        │  │                           │   │
│  │                           │  │  ⏱️ Total: 24 hours       │   │
│  │   ┌─────────────────┐    │  │                           │   │
│  │   │ 9am             │    │  │  Projects:                │   │
│  │   │ [Available Gap] │◄───┼──┼─ 🔵 Website: 8h (33%)    │   │
│  │   │                 │    │  │  🟢 Marketing: 6h (25%)   │   │
│  │   ├─────────────────┤    │  │  🟡 Product: 4h (17%)     │   │
│  │   │ 11am            │    │  │                           │   │
│  │   │ [Meeting]       │    │  │  🎯 Build Blocks: 6h (25%)│   │
│  │   │ Occupied        │    │  │                           │   │
│  │   ├─────────────────┤    │  │  [Visual Chart]           │   │
│  │   │ 12pm            │    │  │  ████████████░░░░░░       │   │
│  │   │ [Website Block] │    │  │                           │   │
│  │   │ Project Work    │    │  │  Date Range:              │   │
│  │   ├─────────────────┤    │  │  [This Week ▼]            │   │
│  │   │ 2pm             │    │  │                           │   │
│  │   │ [Build Block]   │    │  │  [Export Calendar PDF]    │   │
│  │   │ Flexible        │    │  │                           │   │
│  │   └─────────────────┘    │  └───────────────────────────┘   │
│  │                           │                                   │
│  │   [+ Block Time]          │                                   │
│  └──────────────────────────┘                                   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### 1. TimePlayCalendar.svelte

**Props:**

```typescript
{
  blocks: TimeBlock[]
  calendarEvents: CalendarEvent[]
  viewMode: 'day' | 'week' | 'month'
  selectedDate: Date
  onBlockCreate: (startTime: Date, endTime: Date) => void
  onBlockClick: (block: TimeBlock) => void
}
```

**Features:**

- Click or drag to select available time gap
- Visual distinction between:
    - Available gaps (light gray background)
    - Existing calendar events (gray)
    - Project blocks (project color)
    - Build blocks (purple/brand color)
- Responsive: Stack calendar and allocation panel on mobile

#### 2. TimeAllocationPanel.svelte

**Props:**

```typescript
{
  allocation: TimeAllocation
  dateRange: { start: Date; end: Date }
  onDateRangeChange: (range: { start: Date; end: Date }) => void
}
```

**Features:**

- Real-time updates when blocks change
- Visual chart (pie chart or stacked bar chart)
- Project color coding
- Percentage calculations
- Export to PDF/image option

#### 3. TimeBlockCreateModal.svelte

**Props:**

```typescript
{
  isOpen: boolean
  initialStartTime: Date
  initialEndTime: Date
  onClose: () => void
  onCreate: (params: CreateTimeBlockParams) => void
}
```

**UI Flow:**

```
1. Show selected time range (editable)
2. Block type selector:
   - [ ] Project Block - Work on a specific project
   - [ ] Build Block - Flexible focused time

3. If "Project Block" selected:
   - Project dropdown (required)
   - Preview AI suggestions (loading indicator)

4. If "Build Block" selected:
   - Preview AI suggestions from all projects

5. Action buttons:
   - [Cancel] [Create Block]
```

#### 4. TimeBlockDetailModal.svelte

**Props:**

```typescript
{
  isOpen: boolean
  block: TimeBlock
  onClose: () => void
  onUpdate: (params: UpdateTimeBlockParams) => void
  onDelete: () => void
}
```

**UI:**

```
┌──────────────────────────────────────┐
│  Time Block Details             [×]  │
├──────────────────────────────────────┤
│                                      │
│  📅 Monday, Oct 10, 2025             │
│  🕐 2:00 PM - 4:00 PM (2 hours)      │
│                                      │
│  Type: [Project Block ▼]             │
│  Project: [Website Redesign ▼]       │
│                                      │
│  💡 AI Suggested Tasks:              │
│  ┌────────────────────────────────┐ │
│  │ 1. Update homepage layout      │ │
│  │    Duration: 1.5h | Priority: H│ │
│  │    Rationale: High impact...   │ │
│  │                                │ │
│  │ 2. Fix mobile responsive bugs  │ │
│  │    Duration: 1h | Priority: H  │ │
│  │    Rationale: Blocks launch... │ │
│  └────────────────────────────────┘ │
│                                      │
│  [🔗 Open in Google Calendar]        │
│  [🔄 Regenerate Suggestions]         │
│                                      │
│  ┌─────────────────────────────────┐│
│  │ [Delete Block] [Save Changes]   ││
│  └─────────────────────────────────┘│
└──────────────────────────────────────┘
```

### Visual Design Tokens

**Colors:**

- Available gaps: `bg-gray-100` with dashed border
- Project blocks: Use project color (from `projects.color` field)
- Build blocks: `bg-purple-500` or brand purple
- Existing events: `bg-gray-300`
- Conflicts: `bg-red-100` with red border

**Interaction States:**

- Hover on gap: Highlight with `bg-blue-50`
- Selected gap: `bg-blue-100` with solid border
- Dragging: Show ghost outline

---

## Implementation Phases

### Phase 1: MVP Foundation (1-2 weeks)

**Status:** ✅ Completed (2025-10-13)

**Goal:** Basic time blocking with project blocks only

**Tasks:**

1. Database setup
    - Create `time_blocks` table migration
    - Add RLS policies
    - Create indexes

2. API endpoints
    - `POST /api/time-play/create` (project blocks only)
    - `GET /api/time-play/blocks`
    - `DELETE /api/time-play/delete/:id`

3. Services
    - `TimeBlockService` with core methods
    - Integration with existing `CalendarService`

4. UI components
    - Basic `/time-play` page route
    - `TimePlayCalendar.svelte` (week view only)
    - `TimeBlockCreateModal.svelte` (project blocks only)
    - Simple list view of allocations (no chart yet)

5. Google Calendar sync
    - Create calendar events with project name
    - Basic event description (no AI suggestions yet)

**Success Criteria:**

- User can create project-specific time blocks
- Blocks sync to Google Calendar
- User can view and delete blocks
- Basic time allocation list displayed

---

### Phase 2: AI Suggestions & Build Blocks (1 week)

**Status:** ✅ Completed (2025-10-14)

**Goal:** Add AI task suggestions and build block support

**Tasks:**

1. AI suggestion service
    - Create `TimeBlockSuggestionService`
    - Implement LLM prompt for task suggestion
    - Format suggestions for calendar description

2. Build blocks
    - Update API to support `block_type: 'build'`
    - Update UI modal with block type selector
    - Cross-project task suggestions

3. Enhanced calendar events
    - Add AI suggestions to event descriptions
    - Format suggestions with task links

4. UI updates
    - Show suggestion preview in create modal
    - Add "Regenerate suggestions" button
    - Display suggestions in detail modal

**Success Criteria:**

- User can create build blocks
- AI generates relevant task suggestions
- Suggestions appear in Google Calendar event descriptions
- User can regenerate suggestions

---

### Phase 3: Time Allocation Visualization (1 week)

**Status:** 🚧 In progress — core analytics + visualization shipped; export tooling outstanding

**Goal:** Visual breakdown of time allocation

**Tasks:**

1. Time allocation calculation
    - Implement `calculateTimeAllocation()` method
    - Group by project with hours and percentages
    - Calculate build block hours

2. Visualization component
    - `TimeAllocationPanel.svelte`
    - Pie chart or stacked bar chart (use Chart.js or similar)
    - Real-time updates on block changes

3. Date range filtering
    - Date range picker
    - Preset ranges (this week, next week, this month)
    - Update allocation on range change

4. Export functionality _(pending)_
    - Export allocation report as PDF or image

**Success Criteria:**

- Visual chart displays time allocation
- Updates dynamically when blocks change
- User can filter by date range
- Export works correctly _(pending)_

---

### Phase 3.5: Google Calendar Integration (1 day)

**Status:** ✅ Completed (2025-10-14)

**Goal:** Display user's existing Google Calendar events alongside time blocks

**Tasks:**

1. ✅ Calendar connection detection
    - Check if user has Google Calendar connected via `CalendarService.hasValidConnection()`
    - Pass connection status to Time Play page

2. ✅ Connection prompt UI
    - Display prominent card when calendar not connected
    - Link to profile settings to connect calendar
    - Only show when `isCalendarConnected === false`

3. ✅ Fetch calendar events
    - Create `/api/calendar/events` endpoint using existing `CalendarService.getCalendarEvents()`
    - Fetch events for visible date range (day/week/month)
    - Auto-refresh when date range changes

4. ✅ Display calendar events on calendar
    - Render existing Google Calendar events in grey (`bg-slate-200/80`)
    - Position events based on start/end times
    - Show below time blocks (z-index: calendar events 8, time blocks 10)
    - Display event title and start time

5. ✅ Event detail modal
    - Create `CalendarEventDetailModal.svelte` component
    - Show full event details:
        - Title, date/time, description
        - Location, attendees with response status
        - Google Meet link (if present)
        - Recurring event indicator
    - Link to view/edit in Google Calendar

6. ✅ Make calendar events clickable
    - Click handler to open detail modal
    - Pass event data to modal

**Implementation Details:**

```typescript
// Server-side connection check
// /src/routes/time-play/+page.server.ts
const calendarService = new CalendarService(supabase);
const isCalendarConnected = await calendarService.hasValidConnection(user.id);

// API endpoint for fetching events
// /src/routes/api/calendar/events/+server.ts
export const GET: RequestHandler = async ({ url, locals }) => {
	const timeMin = url.searchParams.get('timeMin');
	const timeMax = url.searchParams.get('timeMax');
	const result = await calendarService.getCalendarEvents(user.id, {
		timeMin,
		timeMax
	});
	return json(result);
};

// Calendar component fetches events
// /src/lib/components/time-play/TimePlayCalendar.svelte
async function fetchCalendarEvents() {
	if (!isCalendarConnected) return;

	const response = await fetch(`/api/calendar/events?timeMin=${timeMin}&timeMax=${timeMax}`);
	const data = await response.json();
	calendarEvents = data.events || [];
}

// Auto-fetch when date range changes
$effect(() => {
	if (days.length > 0) {
		fetchCalendarEvents();
	}
});
```

**UI Components:**

- **Connection Card**: Amber warning card with "Connect Calendar" CTA
- **Calendar Events**: Grey event blocks with hover states
- **Event Detail Modal**: Full-screen modal with event details and Google Calendar link

**Success Criteria:**

- ✅ Connection status accurately detected
- ✅ Connection prompt appears when calendar not connected
- ✅ Google Calendar events fetched for visible date range
- ✅ Events displayed in grey alongside time blocks
- ✅ Events properly positioned by time
- ✅ Click event opens detail modal with full information
- ✅ Link to Google Calendar opens correct event
- ✅ Events auto-refresh when navigating calendar dates

---

### Phase 4: Advanced Features & Polish (1-2 weeks)

**Goal:** Enhanced UX and additional features

**Tasks:**

1. Drag-and-drop block creation
    - Click-and-drag on calendar to create block
    - Visual feedback during drag

2. Block editing
    - Drag to resize block duration
    - Drag to move block time
    - Real-time conflict detection

3. Multi-view support
    - Day view
    - Month view
    - View mode persistence

4. Mobile optimization
    - Responsive calendar layout
    - Touch-friendly interactions
    - Bottom sheet modals on mobile

5. Conflict resolution
    - Smart conflict warnings
    - Suggest alternative times
    - Override option for intentional overlaps

6. Keyboard shortcuts
    - `N` - Create new block
    - `←` `→` - Navigate days/weeks
    - `D` `W` `M` - Switch views

**Success Criteria:**

- Smooth drag-and-drop interactions
- All view modes working
- Mobile experience polished
- Keyboard navigation functional

---

## Integration Points

### 1. Existing Calendar Service

**Leverage:**

- `CalendarService.findAvailableSlots()` - Find available time gaps
- `CalendarService.scheduleTask()` - Create calendar events (adapt for time blocks)
- `CalendarService.updateCalendarEvent()` - Update block times
- `CalendarService.deleteCalendarEvent()` - Remove blocks from calendar

**Integration:**

```typescript
// In TimeBlockService
async syncToGoogleCalendar(timeBlock: TimeBlock) {
  const eventTitle = timeBlock.block_type === 'project'
    ? `${timeBlock.project_name} - Work Session`
    : 'Build Block'

  const suggestions = await this.suggestionService.generateSuggestions(timeBlock)
  const description = this.suggestionService.formatSuggestionForDescription(suggestions)

  const calendarEventId = await this.calendarService.scheduleTask({
    title: eventTitle,
    description: description,
    start: timeBlock.start_time,
    end: timeBlock.end_time,
    // ... other params
  })

  return calendarEventId
}
```

### 2. Projects & Tasks

**Data Flow:**

- Fetch projects for project selector dropdown
- Fetch tasks for AI suggestion generation
- Use task priority, duration, and status for filtering

**Queries:**

```typescript
// Get user's active projects for dropdown
const projects = await supabase
	.from('projects')
	.select('id, name, color, status')
	.eq('user_id', userId)
	.in('status', ['active', 'planning'])
	.order('name');

// Get high-priority tasks for suggestions
const tasks = await supabase
	.from('tasks')
	.select('*, project:projects(name, color)')
	.eq('user_id', userId)
	.in('status', ['backlog', 'in_progress'])
	.order('priority', { ascending: false })
	.limit(20);
```

### 3. LLM Integration (OpenAI)

**Prompt Template for Project Block Suggestions:**

```
You are a productivity assistant helping a user decide what to work on during a focused work block.

Context:
- Work block duration: {{duration_minutes}} minutes
- Block start time: {{start_time}} ({{day_of_week}}, {{time_of_day}})
- Project: {{project_name}}
- Project description: {{project_description}}

Available tasks from this project:
{{tasks_json}}

Instructions:
1. Select 3-5 tasks that would fit well in this time block
2. Consider:
   - Task duration vs block duration (should fit with some buffer)
   - Task priority (prefer high priority)
   - Task dependencies (prefer tasks that are unblocked)
   - Time of day appropriateness
3. For each task, provide a brief rationale (1-2 sentences) explaining why it's a good fit

Output JSON format:
{
  "suggestions": [
    {
      "task_id": "uuid",
      "rationale": "This task is high priority and fits perfectly in the 2-hour block..."
    }
  ]
}
```

**Prompt Template for Build Block Suggestions:**

```
You are a productivity assistant helping a user decide what to work on during a flexible "build block" - protected time for focused work on any project.

Context:
- Work block duration: {{duration_minutes}} minutes
- Block start time: {{start_time}} ({{day_of_week}}, {{time_of_day}})

User's active projects and their high-priority tasks:
{{projects_and_tasks_json}}

Instructions:
1. Select 3-5 tasks from ANY project that would make the best use of this time block
2. Prioritize:
   - High-impact tasks
   - Tasks that fit the time block duration
   - Tasks appropriate for the time of day (e.g., creative work in morning, admin in afternoon)
   - Tasks that are currently unblocked
3. For each task, provide rationale including which project it's from

Output JSON format:
{
  "suggestions": [
    {
      "task_id": "uuid",
      "project_id": "uuid",
      "rationale": "This high-impact marketing task is perfect for your morning energy..."
    }
  ]
}
```

### 4. Real-Time Updates

**Webhook Integration:**

- Subscribe to Google Calendar webhook events
- Update time blocks when events are modified externally
- Sync status updates

**Supabase Realtime:**

- Subscribe to `time_blocks` table changes
- Update UI when blocks are created/updated/deleted by user (e.g., from mobile)

---

## Testing Strategy

### Unit Tests

**Services:**

```typescript
// time-block.service.test.ts
describe('TimeBlockService', () => {
	describe('createTimeBlock', () => {
		it('should create project block with valid params');
		it('should create build block without project_id');
		it('should throw error if project_id missing for project block');
		it('should generate AI suggestions');
		it('should sync to Google Calendar');
		it('should detect time conflicts');
	});

	describe('calculateTimeAllocation', () => {
		it('should calculate total hours correctly');
		it('should group by project');
		it('should calculate percentages');
		it('should separate build block hours');
	});
});

// time-block-suggestion.service.test.ts
describe('TimeBlockSuggestionService', () => {
	describe('generateProjectSuggestions', () => {
		it('should fetch tasks from specified project only');
		it('should filter by duration fit');
		it('should prioritize high-priority tasks');
		it('should call LLM with correct prompt');
		it('should return formatted suggestions');
	});

	describe('generateBuildBlockSuggestions', () => {
		it('should fetch tasks from all active projects');
		it('should return cross-project suggestions');
	});
});
```

### Integration Tests

**API Endpoints:**

```typescript
// /api/time-play/create.test.ts
describe('POST /api/time-play/create', () => {
	it('should create project block and return 201');
	it('should create build block and return 201');
	it('should return 400 for invalid params');
	it('should return 401 for unauthenticated user');
	it('should return 409 for conflicting times');
	it('should sync to Google Calendar');
});

// /api/time-play/allocation.test.ts
describe('GET /api/time-play/allocation', () => {
	it('should return correct allocation breakdown');
	it('should filter by date range');
	it('should handle empty blocks');
});
```

### E2E Tests (Playwright)

**User Flows:**

```typescript
// time-play.e2e.test.ts
test.describe('Time Play Feature', () => {
	test('user can create project block', async ({ page }) => {
		await page.goto('/time-play');
		await page.click('[data-testid="available-gap-9am"]');
		await page.click('[data-testid="project-block-option"]');
		await page.selectOption('[data-testid="project-selector"]', 'project-1');
		await page.click('[data-testid="create-block-button"]');

		await expect(page.locator('[data-testid="time-block-9am"]')).toBeVisible();
		await expect(page.locator('[data-testid="allocation-project-1"]')).toContainText('2 hours');
	});

	test('user can create build block', async ({ page }) => {
		// ... test build block creation
	});

	test('allocation updates dynamically', async ({ page }) => {
		// ... test real-time allocation updates
	});

	test('user can edit block time', async ({ page }) => {
		// ... test block editing
	});

	test('user can delete block', async ({ page }) => {
		// ... test block deletion
	});
});
```

### LLM Prompt Tests

**Suggestion Quality:**

```typescript
// time-block-suggestions.llm.test.ts
describe('LLM Task Suggestions', () => {
	it('should return valid JSON format', async () => {
		const suggestions = await suggestionService.generateProjectSuggestions({
			projectId: 'test-project',
			duration_minutes: 120,
			startTime: new Date()
		});

		expect(suggestions).toHaveLength(3);
		expect(suggestions[0]).toHaveProperty('task_id');
		expect(suggestions[0]).toHaveProperty('rationale');
	});

	it('should prioritize high-priority tasks');
	it('should respect duration constraints');
	it('should provide meaningful rationale');
});
```

### Manual Testing Checklist

- [ ] Create project block and verify Google Calendar event
- [ ] Create build block and verify cross-project suggestions
- [ ] Verify AI suggestions are relevant and well-formatted
- [ ] Test time allocation visualization accuracy
- [ ] Test date range filtering
- [ ] Test block editing (time, type, project)
- [ ] Test block deletion and calendar sync
- [ ] Test conflict detection
- [ ] Test mobile responsive layout
- [ ] Test keyboard shortcuts
- [ ] Test error handling (API failures, calendar disconnected)
- [ ] Test with multiple projects and many blocks
- [ ] Verify RLS policies prevent unauthorized access

---

## Open Questions

### 1. Time Block Duration Constraints

**Question:** Should there be minimum/maximum duration for time blocks?

**Options:**

- A) No constraints (user can block 15 minutes or 8 hours)
- B) Minimum 30 minutes, maximum 4 hours
- C) Configurable in user preferences

**Recommendation:** Option B - Minimum 30 minutes (aligns with existing slot increment), maximum 4 hours (encourages breaks)

---

### 2. Recurring Time Blocks

**Question:** Should users be able to create recurring time blocks (e.g., "Every Monday 9-11am: Marketing work")?

**Options:**

- A) Not in MVP, add later
- B) Add in Phase 2
- C) Add in Phase 4

**Recommendation:** Option A - Skip for MVP, evaluate based on user feedback

---

### 3. Task Assignment from Suggestions

**Question:** Should users be able to directly assign suggested tasks to the time block?

**Options:**

- A) Suggestions are read-only in calendar description
- B) Clicking a suggestion marks it as "assigned to block" (new task field)
- C) Clicking a suggestion auto-schedules the task with `start_date`

**Recommendation:** Option A for MVP, Option C for Phase 3

---

### 4. Calendar Event Naming

**Question:** For project blocks, should the calendar event title include the project name or be generic?

**Options:**

- A) "[Project Name] - Work Session" (current spec)
- B) "Build Block: [Project Name]"
- C) User-configurable template

**Recommendation:** Option A - Clear and professional

---

### 5. Multi-Project Blocks

**Question:** Should a single time block support multiple projects?

**Options:**

- A) No, one project per block (current spec)
- B) Yes, allow selecting multiple projects (suggestions from all)

**Recommendation:** Option A for simplicity. Build blocks already support cross-project flexibility.

---

### 6. Conflict Handling

**Question:** What happens if user creates a time block that overlaps with an existing calendar event?

**Options:**

- A) Hard block - prevent creation, show error
- B) Soft warning - allow creation with warning message
- C) Smart suggestion - offer nearest available slots

**Recommendation:** Option B for flexibility + Option C for UX

---

### 7. Suggestion Refresh Strategy

**Question:** When should AI suggestions be regenerated?

**Options:**

- A) Only on manual "Regenerate" button click
- B) Auto-regenerate when block time/duration changes
- C) Auto-regenerate daily at midnight for upcoming blocks

**Recommendation:** Option A for MVP (explicit control), Option B for Phase 3 (auto-refresh on changes)

---

### 8. Time Allocation Export

**Question:** What export formats should be supported?

**Options:**

- A) PDF report only
- B) PDF + CSV (for data analysis)
- C) PDF + CSV + iCal (calendar file)

**Recommendation:** Option B - PDF for visual sharing, CSV for analysis

---

### 9. Build Block Limit

**Question:** Should there be a limit on how many build blocks can exist in a week?

**Options:**

- A) No limit
- B) Soft recommendation (e.g., "You have 10 build blocks - consider adding more structure")
- C) Hard limit (e.g., max 5 build blocks per week)

**Recommendation:** Option A - Trust user to self-regulate

---

### 10. Integration with Daily Briefs

**Question:** Should time blocks be included in the daily brief email?

**Options:**

- A) No integration
- B) Show "Today's time blocks" section in brief
- C) AI uses time blocks to inform task prioritization in brief

**Recommendation:** Option C for Phase 4 - Creates powerful feedback loop

---

## Related Research

### Existing Research Documents

1. **Timeblock Feature Idea** (Oct 5, 2025)
    - Path: `/thoughts/shared/research/2025-10-05_00-00-00_timeblock-feature-idea.md`
    - Focus: Philosophy of "Guided Flexibility", behavioral design principles
    - Key concepts: Flow-based productivity, context-aware AI scheduling

2. **Timeblock Scheduling Feature Research** (Oct 4, 2025)
    - Path: `/thoughts/shared/research/2025-10-04_04-30-00_timeblock-scheduling-feature-research.md`
    - Focus: Comprehensive technical analysis (1,812 lines)
    - Includes: Architecture, database schema, LLM prompts, implementation phases

### Key Differences from Research

**Research Vision:**

- AI-driven: System suggests blocks → User accepts/modifies
- Emphasis on energy tracking and time-of-day optimization
- Automatic gap-filling based on project priorities

**Time Play Implementation (This Spec):**

- User-driven: User claims time → System suggests tasks
- Focus on manual control and visual allocation
- Flexibility between project commitment and open build blocks

**Why the Shift:**
User feedback indicated desire for more control over calendar blocking, with AI playing a supportive (not prescriptive) role.

### Related Features

1. **Phase Scheduling**
    - Path: `/apps/web/docs/features/phase-scheduling/` (if exists)
    - Relationship: Time Play is complementary - Phase Scheduling is task-first, Time Play is time-first

2. **Calendar Integration**
    - Path: `/apps/web/docs/features/calendar-integration/README.md`
    - Relationship: Time Play builds on top of calendar sync infrastructure

3. **Daily Briefs** (Worker Service)
    - Path: `/apps/worker/docs/features/daily-briefs/README.md`
    - Relationship: Future integration - Time blocks could inform brief content

---

## Success Metrics

### Adoption Metrics

- **Time Block Creation Rate**: Average blocks created per active user per week
- **Block Type Distribution**: Ratio of project blocks to build blocks
- **Calendar Sync Success Rate**: % of blocks successfully synced to Google Calendar

### Engagement Metrics

- **Active Users**: % of users who create at least 1 time block per week
- **Retention**: % of users who continue using Time Play after 1 month
- **Time Allocation View Usage**: % of users who view allocation panel

### Effectiveness Metrics

- **Task Completion from Suggestions**: % of suggested tasks that get completed
- **Time Utilization**: Average % of available time blocked out by active users
- **User Satisfaction**: NPS score specifically for Time Play feature

### Technical Metrics

- **API Response Time**: P95 latency for time block creation (<500ms target)
- **AI Suggestion Quality**: % of suggestions rated as "helpful" by users
- **Sync Error Rate**: % of calendar sync failures (<1% target)

---

## Appendix

### A. Example Calendar Event Descriptions

**Project Block Example:**

```
🎯 Work Session: Website Redesign

💡 Suggested Tasks for this block:

1. ✏️ Update homepage layout
   Duration: 1.5 hours | Priority: High
   Why: High-impact visual refresh needed for launch
   Link: https://app.buildos.com/projects/abc/tasks/123

2. 🐛 Fix mobile responsive bugs
   Duration: 1 hour | Priority: High
   Why: Blocking launch, affects user experience
   Link: https://app.buildos.com/projects/abc/tasks/124

3. 🎨 Design new color palette
   Duration: 45 minutes | Priority: Medium
   Why: Fits creative focus time, enhances brand
   Link: https://app.buildos.com/projects/abc/tasks/125

---
Created by BuildOS Time Play
```

**Build Block Example:**

```
🏗️ Build Block - Flexible Focused Time

💡 Suggested Tasks (from your top priorities):

1. ✏️ Write blog post outline - Marketing Project
   Duration: 1 hour | Priority: High
   Why: High ROI content piece, fits creative morning energy
   Link: https://app.buildos.com/projects/xyz/tasks/456

2. 📊 Review Q4 metrics - Analytics Project
   Duration: 45 minutes | Priority: High
   Why: Time-sensitive, requires focus
   Link: https://app.buildos.com/projects/def/tasks/789

3. 🐛 Refactor authentication module - Product Project
   Duration: 2 hours | Priority: Medium
   Why: Technical debt reduction, deep work appropriate
   Link: https://app.buildos.com/projects/ghi/tasks/101

---
Created by BuildOS Time Play
```

### B. Database Migration File

```sql
-- Migration: 2025-10-10_create_time_blocks_table.sql

-- Create time_blocks table
CREATE TABLE time_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL CHECK (block_type IN ('project', 'build')),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  calendar_event_id TEXT,
  calendar_event_link TEXT,
  sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed', 'deleted')),
  last_synced_at TIMESTAMPTZ,
  ai_suggestions JSONB DEFAULT '[]'::jsonb,
  suggestions_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_duration CHECK (duration_minutes > 0),
  CONSTRAINT valid_time_range CHECK (end_time > start_time),
  CONSTRAINT project_required_for_project_blocks CHECK (
    (block_type = 'project' AND project_id IS NOT NULL) OR
    (block_type = 'build' AND project_id IS NULL)
  )
);

-- Indexes
CREATE INDEX idx_time_blocks_user_id ON time_blocks(user_id);
CREATE INDEX idx_time_blocks_user_time_range ON time_blocks(user_id, start_time, end_time);
CREATE INDEX idx_time_blocks_project_id ON time_blocks(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_time_blocks_calendar_event ON time_blocks(calendar_event_id) WHERE calendar_event_id IS NOT NULL;

-- RLS policies
ALTER TABLE time_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own time blocks"
  ON time_blocks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own time blocks"
  ON time_blocks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own time blocks"
  ON time_blocks FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own time blocks"
  ON time_blocks FOR DELETE
  USING (auth.uid() = user_id);

-- Updated timestamp trigger
CREATE TRIGGER update_time_blocks_updated_at
  BEFORE UPDATE ON time_blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Rollback script
-- DROP TRIGGER IF EXISTS update_time_blocks_updated_at ON time_blocks;
-- DROP TABLE IF EXISTS time_blocks CASCADE;
```

### C. Future Enhancements (Post-MVP)

1. **Smart Scheduling Assistant**
    - AI proactively suggests optimal times to block based on patterns
    - "You usually block Friday afternoons for deep work - want me to add that?"

2. **Team Coordination**
    - Share build blocks with team members
    - Coordinate focused work time across teams
    - "Join build block" feature

3. **Energy Tracking Integration**
    - Track actual productivity during different block types
    - Learn optimal times for creative vs analytical work
    - Adaptive suggestions based on energy patterns

4. **Pomodoro Integration**
    - Break time blocks into Pomodoro sessions
    - Timer integration
    - Break reminders

5. **Advanced Analytics**
    - Weekly/monthly time allocation reports
    - Project time forecasting
    - Burndown charts for project hours

6. **Mobile App**
    - Native iOS/Android apps
    - Quick block creation from mobile
    - Notifications for upcoming blocks

7. **Integrations**
    - Slack: Block notifications and status updates
    - Notion: Sync blocks to Notion calendar
    - Linear: Link blocks to Linear cycles/sprints

---

## Changelog

| Date       | Author                | Changes                                                    |
| ---------- | --------------------- | ---------------------------------------------------------- |
| 2025-10-14 | Claude (AI Assistant) | Added Phase 3.5: Google Calendar Integration documentation |
| 2025-10-10 | Claude (AI Assistant) | Initial specification created                              |

---

**Next Steps:**

1. Review and approve specification
2. Create implementation tickets for Phase 1
3. Assign development resources
4. Set timeline and milestones
5. Begin development

**Questions or feedback?** Contact the product team or comment on this spec.
