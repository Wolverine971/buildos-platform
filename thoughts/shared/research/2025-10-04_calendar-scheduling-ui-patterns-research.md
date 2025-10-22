---
title: Calendar, Scheduling, and Task Management UI/UX Patterns Research
date: 2025-10-04
type: research
status: complete
tags: [ui, ux, calendar, scheduling, task-management, modals, components]
related_files:
    - /apps/web/src/lib/components/scheduling/
    - /apps/web/src/lib/components/calendar/
    - /apps/web/src/lib/components/project/PhaseSchedulingModal.svelte
    - /apps/web/src/lib/stores/schedulingStore.ts
---

# Calendar, Scheduling, and Task Management UI/UX Patterns Research

## Overview

This document provides a comprehensive analysis of the UI/UX patterns used for calendar integration, task scheduling, and conflict resolution in BuildOS. This research is valuable for understanding how to build time block management features that align with existing patterns.

## 1. Calendar View Components

### 1.1 CalendarView Component

**File:** `/apps/web/src/lib/components/scheduling/CalendarView.svelte`

**Key Features:**

- **Three View Modes:** Day, Week, Month (lines 21, 96-99)
- **Navigation Controls:** Previous/Next period, Today button (lines 50-90, 204-232)
- **Phase Boundary Constraints:** Navigation limited to phase start/end dates (lines 46-48, 65-73, 192-193)
- **Event Types:**
    - Existing calendar events (gray, lines 114-126)
    - Proposed task schedules (primary blue or amber if conflict, lines 129-151)
    - Highlighted tasks (ring animation, lines 142-148)
- **Mobile-First Design:** Responsive grid layouts, touch-optimized (lines 332-389)

**UI Patterns:**

```svelte
<!-- View Mode Toggle (lines 247-272) -->
<div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
	<Button variant={viewMode === 'day' ? 'primary' : 'ghost'}>Day</Button>
	<Button variant={viewMode === 'week' ? 'primary' : 'ghost'}>Week</Button>
	<Button variant={viewMode === 'month' ? 'primary' : 'ghost'}>Month</Button>
</div>
```

**Event Click Handling:**

- Calendar events open in new tab (htmlLink)
- Proposed tasks trigger scroll-to and highlight in task list
- Dispatch pattern for parent component interaction (lines 101-103)

**Color Coding:**

- Existing events: `bg-gray-200 dark:bg-gray-700`
- Proposed tasks: `bg-primary-100 dark:bg-primary-900/30 border-primary-500`
- Conflicts: `bg-amber-100 dark:bg-amber-900/30 border-amber-400`
- Highlighted: `bg-primary-200 dark:bg-primary-700 ring-2 ring-primary-500`

### 1.2 Time Positioning Algorithm

**Lines:** 158-164

```typescript
function getTimePosition(date: Date): number {
	const hours = date.getHours() + date.getMinutes() / 60;
	const workStart = parseInt(workingHours.work_start_time.split(':')[0]);
	const workEnd = parseInt(workingHours.work_end_time.split(':')[0]);
	const workDuration = workEnd - workStart;
	return ((hours - workStart) / workDuration) * 100;
}
```

This calculates the visual position of events within working hours as a percentage.

## 2. Task Scheduling Interface

### 2.1 TaskScheduleItem Component

**File:** `/apps/web/src/lib/components/scheduling/TaskScheduleItem.svelte`

**Two-State Design Pattern:**

#### Collapsed Mode (View-Only, lines 235-287)

- Clickable card shows task overview
- Visual indicators:
    - Task title and priority badge (lines 247-256)
    - Date and duration (lines 258-269)
    - Conflict warning if present (lines 271-278)
    - Chevron right icon for expansion hint (line 283)
- Hover effect: `hover:bg-gray-100 dark:hover:bg-gray-700`

#### Editing Mode (Expanded, lines 143-233)

**User Input Pattern:**

- **Start DateTime:** `datetime-local` input (lines 156-171)
- **Duration in Minutes:** Number input with constraints (lines 172-193)
    - Min: 15 minutes
    - Max: 480 minutes (8 hours)
    - Step: 15 minutes
- **Calculated End Time:** Auto-calculated display (line 190)

**Validation Rules (lines 92-110):**

```typescript
if (!tempStart || !tempDuration || tempDuration <= 0) {
	editError = 'Start time and duration are required';
}
if (tempDuration > 480) {
	editError = 'Task duration cannot exceed 8 hours';
}
if (tempDuration < 15) {
	editError = 'Task duration must be at least 15 minutes';
}
```

**Action Buttons:**

- Save (green, lines 207-215)
- Cancel (gray, lines 216-219)
- Reset to AI suggestion (if modified, lines 221-231)

### 2.2 User Override Pattern

**Key Insight:** The system preserves AI suggestions while allowing user edits:

```typescript
interface ProposedTaskSchedule {
	proposedStart: Date; // Current schedule (may be user-edited)
	proposedEnd: Date;
	originalStart?: Date; // AI suggestion preserved
	originalEnd?: Date;
	// ... (lines 15-28 in schedulingUtils.ts)
}
```

This enables the "Reset to AI suggestion" feature (lines 123-130).

## 3. Conflict Resolution UI

### 3.1 ScheduleConflictAlert Component

**File:** `/apps/web/src/lib/components/scheduling/ScheduleConflictAlert.svelte`

**Hierarchical Severity System:**

1. **Phase Validation Warning** (orange, lines 61-101)
    - Displayed when phase dates are outside project boundaries
    - Collapsible section with ChevronDown icon

2. **Error Conflicts** (red, lines 104-186)
    - Scheduling conflicts that block proceeding
    - Types: `calendar`, `task`, `phase_boundary`, `project_boundary`
    - Shows count: "Scheduling Conflicts (3)"
    - Each conflict shows:
        - Task name as clickable badge (lines 140-150)
        - Description (lines 152-156)
        - Date and time (lines 158-166)
    - Icons per type (lines 31-41)

3. **Warning Conflicts** (amber, lines 189-270)
    - Non-blocking warnings
    - Same structure as errors but different color

4. **General Warnings** (blue, lines 274-324)
    - Informational messages
    - Single or bulleted list format

**Expandable Sections Pattern:**

```svelte
<button onclick={() => (sectionExpanded = !sectionExpanded)}>
	<AlertTriangle />
	<span>Section Title (count)</span>
	<ChevronDown class="transition-transform {expanded ? 'rotate-180' : ''}" />
</button>
{#if expanded}
	<!-- Content -->
{/if}
```

**Interactive Elements:**

- Clickable task badges navigate to affected task (lines 141-149, 226-234)
- Dismissible alerts (optional, lines 19, 88-95)

### 3.2 Conflict Types and Severity

**File:** `/apps/web/src/lib/utils/schedulingUtils.ts` (lines 30-44)

```typescript
interface ConflictInfo {
	type: 'calendar' | 'task' | 'phase_boundary' | 'project_boundary';
	description: string;
	affectedTaskIds?: string[];
	severity: 'warning' | 'error';
	taskId?: string;
	taskName?: string;
	date?: Date;
}
```

## 4. Phase Scheduling Modal

### 4.1 PhaseSchedulingModal Component

**File:** `/apps/web/src/lib/components/project/PhaseSchedulingModal.svelte`

**Architecture Pattern:** Two-panel layout with responsive design

#### Desktop Layout (lines 329-403)

```
┌──────────────────┬────────────────────────┐
│  Task List       │  Calendar View         │
│  (2fr)           │  (3fr)                 │
│                  │                        │
│  • TaskSchedule  │  Week/Day/Month View   │
│    Items         │                        │
│  • Editable      │  • Existing Events     │
│  • Scrollable    │  • Proposed Schedules  │
│                  │  • Highlighted Tasks   │
└──────────────────┴────────────────────────┘
```

#### Mobile Layout (lines 406-480)

- Collapsible calendar (ChevronDown toggle, lines 409-423)
- Task list always visible below
- Calendar height fixed at 96px when expanded (line 425)

### 4.2 Task Highlighting and Scroll Pattern

**Lines:** 114-141

```typescript
function highlightAndScrollToTask(taskId: string) {
	// Clear existing timeout
	if (highlightTimeout) clearTimeout(highlightTimeout);

	// Set highlighted task
	highlightedTaskId = taskId;

	// Scroll to task
	setTimeout(() => {
		const element = document.getElementById(`task-schedule-item-${taskId}`);
		if (element) {
			element.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}, 100);

	// Clear highlight after 3 seconds
	highlightTimeout = setTimeout(() => {
		highlightedTaskId = null;
	}, 3000);
}
```

**Usage:**

- Triggered when clicking proposed tasks in calendar
- Triggered when clicking conflict warnings
- Smooth scroll with temporary highlight (3s)

### 4.3 Modal State Management Pattern

**Store Integration:** Uses centralized `schedulingStore` (lines 66-78)

```typescript
const unsubscribe = schedulingStore.subscribe((state) => {
	status = state.status;
	error = state.error;
	warnings = state.warnings;
	proposedSchedules = state.proposedSchedules;
	calendarEvents = state.calendarEvents;
	conflicts = state.conflicts;
	viewMode = state.viewMode;
	currentDate = state.currentDate;
	editingTaskId = state.editingTaskId;
	lastLoadedPhaseId = state.lastLoadedPhaseId;
	workingHours = state.workingHours;
});
```

**Lifecycle Management:**

- Initialize on modal open (lines 98-100)
- Reset on destroy (lines 218-221)
- Prevent duplicate loads with `lastLoadedPhaseId` check

## 5. Modal Patterns for Scheduling

### 5.1 Base Modal Component

**File:** `/apps/web/src/lib/components/ui/Modal.svelte`

**Key Features:**

- **Size Options:** `sm`, `md`, `lg`, `xl`, `2xl` (lines 12, 21-26)
- **Accessibility:**
    - Focus trap (lines 55-93)
    - ARIA labels (lines 155-159)
    - Keyboard navigation (Tab cycling, Escape to close)
- **Mobile-First:**
    - Slide-up animation on mobile (lines 208-215)
    - Scale animation on desktop (lines 217-226)
    - Rounded top on mobile, full rounded on desktop (line 153)
    - Max height constraints: `max-h-[90vh] sm:max-h-[85vh]` (line 153)
- **Backdrop Behavior:**
    - Configurable close-on-click (line 14, 35-38)
    - Blur effect: `backdrop-blur-sm` (line 136)
    - Opacity: `bg-opacity-50 dark:bg-opacity-70` (line 136)
- **Persistent Mode:** Prevents accidental closure during saving (line 16)

**Slot Pattern:**

```svelte
<Modal>
	<svelte:fragment slot="header">...</svelte:fragment>
	<!-- Main content (default slot) -->
	<svelte:fragment slot="footer">...</svelte:fragment>
</Modal>
```

### 5.2 ChoiceModal Component

**File:** `/apps/web/src/lib/components/ui/ChoiceModal.svelte`

**Usage Pattern:** For presenting user with multiple options

```typescript
interface Option {
	id: string;
	label: string;
	description?: string;
	icon?: any;
	disabled?: boolean;
}
```

**Visual Design:**

- Options as large clickable cards (lines 48-93)
- Selected state: `border-primary-500 bg-primary-50`
- Unselected: `border-gray-200 hover:border-gray-300`
- Check icon appears on selected (lines 81-84)
- Icon support for visual differentiation (lines 66-73)

**This pattern could be adapted for time block type selection.**

### 5.3 CalendarTaskEditModal

**File:** `/apps/web/src/lib/components/calendar/CalendarTaskEditModal.svelte`

**Dynamic Form Pattern:**

- Field configuration system (lines 30-32)
- Conditional field display (lines 42-52)
- Field grouping with headers (lines 191-203)
- Markdown toggle fields (lines 221-228)
- Datetime/date/number/select/textarea field types

**Validation Pattern:**

```typescript
function handleSave() {
	errors = validateCalendarTask(editedTask);
	if (errors.length > 0) {
		// Show error banner at top (lines 164-186)
		return;
	}
	onSave(editedTask);
}
```

## 6. State Management Patterns

### 6.1 SchedulingStore

**File:** `/apps/web/src/lib/stores/schedulingStore.ts`

**Store Structure:**

```typescript
interface SchedulingState {
	status: 'idle' | 'loading' | 'ready' | 'saving' | 'refreshing' | 'error';
	error: string | null;
	warnings: string[];

	// Data
	phase: PhaseWithTasks | null;
	proposedSchedules: ProposedTaskSchedule[];
	calendarEvents: any[];
	conflicts: ConflictInfo[];

	// User preferences
	workingHours: WorkingHours;
	timeZone: string;

	// UI state
	viewMode: 'day' | 'week' | 'month';
	currentDate: Date;
	editingTaskId: string | null;

	// Tracking
	lastLoadedPhaseId: string | null;
	isDirty: boolean;
}
```

**Key Actions:**

- `initialize(phase, projectId, project)` - Load data (lines 85-216)
- `updateTaskSchedule(taskId, newStart, newEnd)` - Edit schedule (lines 219-269)
- `saveSchedules(projectId)` - Persist to DB (lines 272-324)
- `refreshCalendarEvents()` - Reload calendar (lines 327-353)
- `setViewMode()`, `setCurrentDate()`, `setEditingTask()` - UI updates
- `reset()` - Clean up (lines 369-374)

**Derived Stores:**

```typescript
const totalTasks = derived([store], ($state) => $state.proposedSchedules.length);
const conflictCount = derived(
	[store],
	($state) => $state.proposedSchedules.filter((s) => s.hasConflict).length
);
```

### 6.2 Reactive Validation Pattern

When user edits a schedule (lines 219-269):

```typescript
updateTaskSchedule(taskId: string, newStart: Date, newEnd: Date) {
  update((state) => {
    // 1. Update the specific schedule
    schedule.proposedStart = newStart;
    schedule.proposedEnd = newEnd;

    // 2. Re-validate the edited schedule
    const validation = validateTaskSchedule(
      schedule, state.phase!, undefined, state.calendarEvents
    );
    schedule.hasConflict = !validation.isValid;

    // 3. Re-validate ALL schedules to catch new conflicts
    const conflicts = [];
    schedules.forEach(s => {
      const val = validateTaskSchedule(s, state.phase!, undefined, state.calendarEvents);
      if (!val.isValid) conflicts.push(...val.conflicts);
    });

    return { ...state, proposedSchedules: schedules, conflicts, isDirty: true };
  });
}
```

## 7. User Interaction Flows

### 7.1 Task Schedule Editing Flow

```
1. User clicks TaskScheduleItem (collapsed)
   ↓
2. Component enters editing mode (expanded)
   - Shows datetime-local input
   - Shows duration number input
   - Calculates and displays end time
   ↓
3. User modifies start time or duration
   - Validation runs on each change
   - Error messages appear inline
   ↓
4. User clicks Save
   - Dispatch 'editSave' event
   - Parent updates store: schedulingStore.updateTaskSchedule()
   - Store re-validates all schedules
   - Conflicts updated in real-time
   ↓
5. Component exits editing mode
   - Shows updated schedule in collapsed view
   - Highlights if conflicts detected
```

### 7.2 Calendar Event Interaction Flow

```
1. User clicks event in CalendarView
   ↓
2. Check event type:
   - Existing calendar event → Open in new tab (Google Calendar)
   - Proposed task → Highlight and scroll to task in list
   ↓
3. For proposed tasks:
   - Set highlightedTaskId in store
   - Trigger smooth scroll to TaskScheduleItem
   - Apply ring-2 ring-primary-500 style
   - Auto-clear highlight after 3 seconds
```

### 7.3 Conflict Warning Interaction Flow

```
1. User sees ScheduleConflictAlert with conflicts
   ↓
2. User clicks task badge in conflict description
   - onTaskClick(taskId) dispatched
   ↓
3. Parent calls highlightAndScrollToTask()
   - Scrolls task list to affected task
   - Highlights task for 3 seconds
   ↓
4. User can click task to edit
   - Opens TaskScheduleItem in editing mode
   - User resolves conflict by changing time
```

## 8. Scheduling Intelligence

### 8.1 LLM-Based Scheduling

**File:** `/apps/web/src/routes/api/projects/[id]/phases/[phaseId]/schedule/+server.ts`

**Two-Stage Process:**

**Stage 1: LLM Analysis** (lines 56-141)

- Analyzes task dependencies and relationships
- Considers existing scheduled tasks
- Suggests optimal ordering and time slots
- Provides reasoning for decisions

**Stage 2: Time Slot Validation** (TaskTimeSlotFinder)

- Verifies LLM suggestions against actual availability
- Checks working hours and calendar events
- Handles conflicts by bumping tasks to next available slot
- Respects user calendar preferences

### 8.2 User Calendar Preferences

**Used by TaskTimeSlotFinder** (lines 42-70)

```typescript
interface UserCalendarPreferences {
	timezone: string;
	work_start_time: string; // e.g., "09:00:00"
	work_end_time: string; // e.g., "17:00:00"
	working_days: number[]; // [1,2,3,4,5] = Mon-Fri
	default_task_duration_minutes: number;
	min_task_duration_minutes: number;
	max_task_duration_minutes: number;
	prefer_morning_for_important_tasks: boolean;
}
```

**Default Values if no preferences exist:**

- Timezone: America/New_York
- Work hours: 9:00 - 17:00
- Working days: Mon-Fri
- Default duration: 60 minutes

## 9. Key Design Principles

### 9.1 Progressive Disclosure

- Collapsed task items show essentials
- Click to expand for editing
- Conflicts expandable to see details
- Mobile calendar collapsible to save space

### 9.2 Real-Time Feedback

- Live validation during editing
- Immediate conflict updates
- Visual state changes (colors, rings)
- Calculated end times update as user types

### 9.3 Preservation of Intent

- AI suggestions preserved as `originalStart`/`originalEnd`
- User can always reset to AI suggestion
- Dirty state tracking (`isDirty` flag)

### 9.4 Accessibility First

- ARIA labels on all interactive elements
- Keyboard navigation support
- Focus management in modals
- Screen reader announcements

### 9.5 Mobile-First Responsive Design

- Touch-optimized buttons (larger tap targets)
- Collapsible sections on mobile
- Slide-up modal animations on mobile
- Grid layouts that reflow on small screens

## 10. Color System for Scheduling

### Task States

```css
/* Normal proposed task */
bg-primary-100 dark:bg-primary-900/30 border-primary-500

/* Task with conflict */
bg-amber-100 dark:bg-amber-900/30 border-amber-400

/* Highlighted task (temporary) */
bg-primary-200 dark:bg-primary-700 ring-2 ring-primary-500

/* Existing calendar event */
bg-gray-200 dark:bg-gray-700
```

### Alert Severities

```css
/* Phase validation (orange) */
bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800

/* Error conflicts (red) */
bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800

/* Warning conflicts (amber) */
bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800

/* Info warnings (blue) */
bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800
```

## 11. Recommendations for Time Block UI

Based on this research, here are patterns to consider for time block management:

### 11.1 Modal Structure

- Use `Modal.svelte` base with `size="lg"` or `size="xl"`
- Three-slot pattern: header, content, footer
- Similar to PhaseSchedulingModal but simpler (no calendar view needed)

### 11.2 Time Block Selection

- Adapt `ChoiceModal` pattern for block type selection
- Options with icons (Focus, Break, Meeting, Deep Work, etc.)
- Description text explaining each type

### 11.3 Time Block Editing

- Follow `TaskScheduleItem` editing pattern:
    - Collapsed view shows block overview
    - Click to expand for editing
    - datetime-local for start time
    - duration input in minutes
    - Auto-calculated end time display

### 11.4 Conflict Handling

- Reuse `ScheduleConflictAlert` component structure
- Show conflicts with existing tasks/events
- Allow user to override or auto-adjust

### 11.5 Visual Representation

- Reuse `CalendarView` component if showing weekly view
- Different colors for time block types
- Similar highlight/scroll pattern for interactions

### 11.6 State Management

- Create `timeBlockStore` following `schedulingStore` pattern
- Status states: idle, loading, saving, error
- Track user edits separately from suggestions
- isDirty flag for unsaved changes

## 12. File Reference Summary

### Core Scheduling Components

- `/apps/web/src/lib/components/scheduling/CalendarView.svelte` - Calendar visualization
- `/apps/web/src/lib/components/scheduling/TaskScheduleItem.svelte` - Editable task items
- `/apps/web/src/lib/components/scheduling/ScheduleConflictAlert.svelte` - Conflict display
- `/apps/web/src/lib/components/project/PhaseSchedulingModal.svelte` - Main scheduling modal

### UI Building Blocks

- `/apps/web/src/lib/components/ui/Modal.svelte` - Base modal with accessibility
- `/apps/web/src/lib/components/ui/ChoiceModal.svelte` - Option selection modal
- `/apps/web/src/lib/components/calendar/CalendarTaskEditModal.svelte` - Advanced form modal

### State Management

- `/apps/web/src/lib/stores/schedulingStore.ts` - Centralized scheduling state

### Utilities

- `/apps/web/src/lib/utils/schedulingUtils.ts` - Date formatting, validation, types

### Backend Services

- `/apps/web/src/lib/services/task-time-slot-finder.ts` - Smart slot finding algorithm
- `/apps/web/src/routes/api/projects/[id]/phases/[phaseId]/schedule/+server.ts` - LLM scheduling

## 13. Next Steps for Time Block Implementation

1. **Create TimeBlockModal component**
    - Adapt PhaseSchedulingModal structure
    - Remove calendar panel (simpler single-column layout)
    - Focus on block type selection and time configuration

2. **Build TimeBlockTypeSelector**
    - Use ChoiceModal pattern
    - Define block types (Focus, Break, Meeting, etc.)
    - Each type has icon, color, and default duration

3. **Create TimeBlockItem component**
    - Follow TaskScheduleItem collapsed/expanded pattern
    - Show block type icon and color
    - Editable start time and duration
    - Display calculated end time

4. **Setup timeBlockStore**
    - Mirror schedulingStore structure
    - Handle CRUD operations for time blocks
    - Validate against existing tasks and events
    - Track user overrides

5. **Integrate conflict detection**
    - Reuse ScheduleConflictAlert component
    - Check against scheduled tasks
    - Check against calendar events
    - Allow override or auto-adjust

6. **Add to existing UI**
    - Calendar page entry point
    - Project page quick action
    - Daily brief integration

---

**Research completed:** 2025-10-04
**Files analyzed:** 12 components, 2 stores, 3 utilities
**Total lines reviewed:** ~3000+
