---
date: 2025-10-03T21:50:00-07:00
researcher: Claude
topic: "PhaseSchedulingModal UX Redesign"
tags: [design, ui-ux, scheduling, modal, responsive]
status: complete
related_components:
  - PhaseSchedulingModal.svelte
  - ScheduleConflictAlert.svelte
  - TaskScheduleItem.svelte
  - CalendarView.svelte
---

# PhaseSchedulingModal UX Redesign

**Date**: 2025-10-03
**Designer**: Claude
**Component**: `apps/web/src/lib/components/project/PhaseSchedulingModal.svelte`

## Design Goals

Transform the PhaseSchedulingModal into a more usable, desktop-optimized experience while maintaining mobile responsiveness and following BuildOS style guidelines.

### Key Improvements

1. **Desktop Layout**: Two-column layout with tasks list (left) and calendar (right)
2. **Enhanced Conflict Alerts**: Clickable, color-coded warnings that highlight affected tasks
3. **Improved Task Interaction**: Click to expand/edit with simplified date picker
4. **Calendar Integration**: Click calendar events to highlight corresponding tasks
5. **Mobile Responsive**: Graceful stacking on smaller screens

## Current State Analysis

### Current Layout Structure

```
PhaseSchedulingModal
├── Header (with ScheduleConflictAlert)
├── Main Content (vertical stack)
│   ├── CalendarView (full width)
│   └── Task List (scrollable, max-h-48)
└── Footer (actions)
```

### Current Issues

1. **Desktop Layout**: Calendar and tasks compete for vertical space
2. **Conflict Alerts**: Generic warnings without direct task linking
3. **Task Editing**: Two datetime pickers (start + end) - redundant
4. **Visual Hierarchy**: No color differentiation for tasks with warnings
5. **Interaction**: Calendar clicks don't highlight tasks in list

## Proposed Design

### New Layout Structure

#### Desktop (≥1024px)

```
PhaseSchedulingModal (size="2xl" - max-w-7xl)
├── Header
│   └── ScheduleConflictAlert (enhanced)
├── Main Content (horizontal split)
│   ├── Task List Panel (left, 40%)
│   │   ├── Header ("Tasks to Schedule")
│   │   ├── Task Items (expandable, scrollable)
│   │   └── Summary footer
│   └── Calendar Panel (right, 60%)
│       └── CalendarView
└── Footer (actions)
```

#### Mobile (<1024px)

```
PhaseSchedulingModal (size="xl")
├── Header (sticky)
│   └── ScheduleConflictAlert (collapsible)
├── Main Content (vertical stack)
│   ├── Calendar Panel (collapsible)
│   └── Task List Panel (default expanded)
└── Footer (sticky)
```

## Detailed Component Changes

### 1. PhaseSchedulingModal.svelte

#### Layout Changes

```svelte
<!-- Desktop: Two-column layout -->
<div class="hidden lg:grid lg:grid-cols-[2fr_3fr] gap-0 h-full max-h-[70vh]">
  <!-- Left: Task List Panel -->
  <div class="border-r border-gray-200 dark:border-gray-700 flex flex-col">
    <div class="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
      <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
        Tasks to Schedule
      </h3>
      <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
        Click a task to edit its schedule
      </p>
    </div>

    <div id="task-list-panel" class="flex-1 overflow-y-auto p-4">
      <!-- Task items here -->
    </div>

    <div class="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
      <div class="text-xs text-gray-600 dark:text-gray-400">
        {proposedSchedules.length} tasks
        {#if conflictCount > 0}
          • <span class="text-amber-600 dark:text-amber-400">
            {conflictCount} with warnings
          </span>
        {/if}
      </div>
    </div>
  </div>

  <!-- Right: Calendar Panel -->
  <div class="flex flex-col bg-white dark:bg-gray-900">
    <CalendarView
      {viewMode}
      {currentDate}
      events={calendarEvents}
      {proposedSchedules}
      {workingHours}
      loading={false}
      refreshing={status === 'refreshing'}
      phaseStart={phase.start_date}
      phaseEnd={phase.end_date}
      highlightedTaskId={highlightedTaskId}
      on:eventClick={handleCalendarEventClick}
      on:dateChange={handleDateChange}
      on:viewModeChange={handleViewModeChange}
      on:refresh={handleRefresh}
    />
  </div>
</div>

<!-- Mobile: Vertical stack -->
<div class="lg:hidden flex flex-col h-full max-h-[70vh]">
  <!-- Collapsible Calendar -->
  <div class="border-b border-gray-200 dark:border-gray-700">
    <button
      onclick={() => calendarExpanded = !calendarExpanded}
      class="w-full p-4 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50"
    >
      <span class="text-sm font-semibold text-gray-900 dark:text-white">
        Calendar View
      </span>
      <ChevronDown class="w-5 h-5 transition-transform {calendarExpanded ? 'rotate-180' : ''}" />
    </button>

    {#if calendarExpanded}
      <div class="h-96">
        <CalendarView {...calendarProps} />
      </div>
    {/if}
  </div>

  <!-- Task List (always visible on mobile) -->
  <div class="flex-1 overflow-y-auto p-4">
    <!-- Task items -->
  </div>
</div>
```

#### New State Variables

```typescript
let highlightedTaskId: string | null = null;
let calendarExpanded = false; // Mobile calendar toggle
let highlightTimeout: ReturnType<typeof setTimeout> | null = null;
```

#### New Event Handlers

```typescript
/**
 * Handle calendar event clicks - highlight corresponding task in list
 */
function handleCalendarEventClick(event: CustomEvent) {
  const { event: clickedEvent } = event.detail;

  if (clickedEvent.type === "existing" && clickedEvent.htmlLink) {
    window.open(clickedEvent.htmlLink, "_blank");
  } else if (clickedEvent.type === "proposed" && clickedEvent.schedule) {
    const taskId = clickedEvent.schedule.task.id;
    highlightAndScrollToTask(taskId);
  }
}

/**
 * Highlight and scroll to a task in the list
 */
function highlightAndScrollToTask(taskId: string) {
  // Clear existing timeout
  if (highlightTimeout) {
    clearTimeout(highlightTimeout);
  }

  // Set highlighted task
  highlightedTaskId = taskId;

  // Scroll to task
  const element = document.getElementById(`task-schedule-item-${taskId}`);
  if (element) {
    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  // Clear highlight after 3 seconds
  highlightTimeout = setTimeout(() => {
    highlightedTaskId = null;
  }, 3000);
}

/**
 * Handle clicking on conflict warning - highlight affected task
 */
function handleConflictClick(taskId: string) {
  highlightAndScrollToTask(taskId);
}
```

#### Modal Size Update

```svelte
<Modal
  {isOpen}
  onClose={handleClose}
  size="2xl"  <!-- Changed from "xl" to "2xl" for desktop -->
  closeOnBackdrop={status !== 'saving'}
  closeOnEscape={status !== 'saving'}
  persistent={status === 'saving'}
>
```

### 2. ScheduleConflictAlert.svelte

#### Enhanced Props

```typescript
export let conflicts: ConflictInfo[] = [];
export let warnings: string[] = [];
export let phaseValidationWarning: string | null = null;
export let dismissible = false;
export let compact = false;
export let onTaskClick: (taskId: string) => void = () => {}; // NEW
```

#### Enhanced Conflict Display

```svelte
{#each errorConflicts as conflict}
  <li class="flex items-start gap-2">
    <svelte:component
      this={getConflictIcon(conflict.type)}
      class="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
    />
    <div class="flex-1">
      <!-- Task name as clickable badge -->
      {#if conflict.taskName}
        <button
          onclick={() => onTaskClick(conflict.taskId)}
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                 bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200
                 hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors"
        >
          {conflict.taskName}
          <ExternalLink class="w-3 h-3" />
        </button>
      {/if}

      <!-- Description -->
      <span class="block mt-1 text-sm text-red-700 dark:text-red-300">
        {conflict.description}
      </span>

      <!-- Date/Time if available -->
      {#if conflict.date}
        <span class="block text-xs text-red-600 dark:text-red-400 mt-0.5">
          {formatDate(conflict.date)} at {formatTime(conflict.date)}
        </span>
      {/if}
    </div>
  </li>
{/each}
```

#### Updated Sections Structure

```svelte
<!-- More descriptive headers with counts -->
<span class="text-sm text-red-800 dark:text-red-200 flex-1 text-left font-semibold">
  Scheduling Conflicts
  <span class="ml-1 px-1.5 py-0.5 bg-red-100 dark:bg-red-900/40 rounded-full text-xs">
    {errorConflicts.length}
  </span>
</span>
```

### 3. TaskScheduleItem.svelte

#### Simplified Date Picker (Start + Duration)

```svelte
<!-- NEW: Expandable/Collapsible Design -->
<div
  id="task-schedule-item-{schedule.task.id}"
  class="rounded-lg border transition-all duration-200
         {isHighlighted
           ? 'border-primary-500 ring-2 ring-primary-500 ring-opacity-50 bg-primary-50 dark:bg-primary-900/20'
           : schedule.hasConflict
             ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10'
             : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'}"
>
  {#if isEditing}
    <!-- Editing Mode (Expanded) -->
    <div class="p-4 space-y-4">
      <div class="flex items-center justify-between">
        <h4 class="font-medium text-gray-900 dark:text-white">
          {schedule.task?.title || 'Untitled Task'}
        </h4>
        {#if schedule.task?.priority}
          <span class="px-2 py-0.5 text-xs rounded-full {priorityClass}">
            {schedule.task.priority}
          </span>
        {/if}
      </div>

      <!-- Simplified Date Inputs: Start Date + Duration -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Start Date & Time
          </label>
          <TextInput
            type="datetime-local"
            bind:value={tempStart}
            class="text-sm"
            size="sm"
            error={editError && !tempStart}
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Duration (minutes)
          </label>
          <TextInput
            type="number"
            bind:value={tempDuration}
            min="15"
            max="480"
            step="15"
            class="text-sm"
            size="sm"
            error={editError && (!tempDuration || tempDuration <= 0)}
          />
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            End: {calculateEndTime(tempStart, tempDuration)}
          </p>
        </div>
      </div>

      {#if editError}
        <p class="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
          <AlertTriangle class="w-3 h-3" />
          {editError}
        </p>
      {/if}

      <!-- Action Buttons -->
      <div class="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
        <div class="flex items-center gap-2">
          <Button
            onclick={saveEdit}
            variant="ghost"
            size="sm"
            class="text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
          >
            <CheckCircle2 class="w-4 h-4 mr-1" />
            Save
          </Button>
          <Button onclick={cancelEditing} variant="ghost" size="sm">
            <X class="w-4 h-4 mr-1" />
            Cancel
          </Button>
        </div>
        {#if schedule.originalStart && schedule.originalEnd}
          <Button
            onclick={resetToOriginal}
            variant="ghost"
            size="sm"
            title="Reset to AI-suggested time"
          >
            <RotateCcw class="w-4 h-4 mr-1" />
            Reset
          </Button>
        {/if}
      </div>
    </div>
  {:else}
    <!-- Collapsed Mode (Clickable) -->
    <button
      onclick={startEditing}
      class="w-full text-left p-3 sm:p-4 hover:bg-gray-100 dark:hover:bg-gray-700
             transition-colors rounded-lg focus:outline-none focus:ring-2
             focus:ring-primary-500 focus:ring-offset-2"
    >
      <div class="flex items-start justify-between">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <h4 class="font-medium text-gray-900 dark:text-white truncate">
              {schedule.task?.title || 'Untitled Task'}
            </h4>
            {#if schedule.task?.priority}
              <span class="px-2 py-0.5 text-xs rounded-full {priorityClass}">
                {schedule.task.priority}
              </span>
            {/if}
          </div>

          <div class="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400 mt-1.5">
            <span class="flex items-center gap-1">
              <Calendar class="w-3 h-3" />
              {formatDateTime(schedule.proposedStart)}
            </span>
            <span class="flex items-center gap-1">
              <Clock class="w-3 h-3" />
              {duration} min
            </span>
          </div>

          {#if schedule.hasConflict}
            <div class="flex items-start gap-1 mt-1.5 text-sm text-amber-700 dark:text-amber-300">
              <AlertTriangle class="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{schedule.conflictReason}</span>
            </div>
          {/if}
        </div>

        <!-- Expand indicator -->
        <div class="ml-3 flex-shrink-0">
          <ChevronRight class="w-5 h-5 text-gray-400" />
        </div>
      </div>
    </button>
  {/if}
</div>
```

#### New Props and State

```typescript
export let schedule: ProposedTaskSchedule;
export let isEditing = false;
export let isHighlighted = false; // NEW - for highlighting from conflict clicks

// Local editing state
let tempStart = "";
let tempDuration = 60; // NEW - duration in minutes
let editError = "";

// Initialize editing values when entering edit mode
$: if (isEditing && !tempStart) {
  tempStart = formatDateTimeForInput(schedule.proposedStart);
  tempDuration = calculateDuration(
    schedule.proposedStart,
    schedule.proposedEnd,
  );
  editError = "";
}

/**
 * Calculate end time display based on start + duration
 */
function calculateEndTime(start: string, durationMinutes: number): string {
  if (!start || !durationMinutes) return "N/A";

  try {
    const startDate = parseDateTimeFromInput(start);
    const endDate = addMinutes(startDate, durationMinutes);
    return formatTime(endDate);
  } catch {
    return "Invalid";
  }
}

/**
 * Save edited schedule with duration
 */
function saveEdit() {
  if (!tempStart || !tempDuration || tempDuration <= 0) {
    editError = "Start time and duration are required";
    return;
  }

  const newStart = parseDateTimeFromInput(tempStart);
  const newEnd = addMinutes(newStart, tempDuration);

  // Validate duration (max 8 hours)
  if (tempDuration > 480) {
    editError = "Task duration cannot exceed 8 hours";
    return;
  }

  dispatch("editSave", {
    schedule,
    newStart,
    newEnd,
  });

  isEditing = false;
  tempStart = "";
  tempDuration = 60;
  editError = "";
}
```

### 4. CalendarView.svelte

#### Support for Highlighting

```typescript
export let highlightedTaskId: string | null = null; // NEW

// Update event rendering to show highlight
function getEventsForDay(date: Date): any[] {
  // ... existing code ...

  for (const schedule of proposedSchedules) {
    if (!schedule?.task?.title) continue;

    const scheduleStart = new Date(schedule.proposedStart);
    if (scheduleStart >= dayStart && scheduleStart <= dayEnd) {
      const isHighlighted = highlightedTaskId === schedule.task.id;

      dayEvents.push({
        type: "proposed",
        title: schedule.task.title,
        start: scheduleStart,
        end: new Date(schedule.proposedEnd),
        color: isHighlighted
          ? "bg-primary-200 dark:bg-primary-700 ring-2 ring-primary-500"
          : schedule.hasConflict
            ? "bg-amber-100 dark:bg-amber-900/30 border-amber-400"
            : "bg-primary-100 dark:bg-primary-900/30 border-primary-500",
        schedule: schedule,
        isHighlighted,
      });
    }
  }

  // ... rest of code ...
}
```

## Visual Design Specifications

### Color Coding System

Following BuildOS Style Guide color patterns:

#### Task States

```scss
// Normal task (no conflicts)
.task-normal {
  @apply bg-gray-50 dark:bg-gray-800
         border-gray-200 dark:border-gray-700;
}

// Task with warning/conflict
.task-warning {
  @apply bg-amber-50/50 dark:bg-amber-900/10
         border-amber-300 dark:border-amber-700;
}

// Highlighted task (from click)
.task-highlighted {
  @apply bg-primary-50 dark:bg-primary-900/20
         border-primary-500
         ring-2 ring-primary-500 ring-opacity-50;
}

// Task in edit mode
.task-editing {
  @apply bg-white dark:bg-gray-800
         border-primary-400 dark:border-primary-600
         shadow-lg;
}
```

#### Conflict Alert Colors

```scss
// Error conflicts (blocking issues)
.conflict-error {
  @apply bg-gradient-to-r from-rose-50 to-red-50
         dark:from-rose-900/20 dark:to-red-900/20
         border-red-200 dark:border-red-800;
}

// Warning conflicts (non-blocking)
.conflict-warning {
  @apply bg-gradient-to-r from-amber-50 to-yellow-50
         dark:from-amber-900/20 dark:to-yellow-900/20
         border-amber-200 dark:border-amber-800;
}
```

### Spacing and Layout

Following 8px grid system:

```scss
// Task list panel
.task-list-panel {
  @apply p-4; // 16px padding
  gap: 12px; // 12px between tasks
}

// Task item padding
.task-item {
  @apply p-4; // 16px padding
}

// Modal content
.modal-content {
  @apply max-h-[70vh]; // 70% viewport height max
}

// Scrollable areas
.scrollable {
  @apply overflow-y-auto;
  scrollbar-width: thin; // Firefox
  scrollbar-color: theme("colors.gray.300") theme("colors.gray.100");

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    @apply bg-gray-100 dark:bg-gray-800;
  }

  &::-webkit-scrollbar-thumb {
    @apply bg-gray-300 dark:bg-gray-600 rounded-full;

    &:hover {
      @apply bg-gray-400 dark:bg-gray-500;
    }
  }
}
```

### Responsive Breakpoints

```scss
// Desktop layout (≥1024px)
@media (min-width: 1024px) {
  .phase-scheduling-modal {
    max-width: theme("maxWidth.7xl"); // 1280px
  }

  .task-calendar-grid {
    display: grid;
    grid-template-columns: 2fr 3fr; // 40% / 60% split
  }
}

// Tablet (768px - 1023px)
@media (min-width: 768px) and (max-width: 1023px) {
  .phase-scheduling-modal {
    max-width: theme("maxWidth.6xl"); // 1152px
  }

  // Stack vertically on tablet
  .task-calendar-grid {
    display: flex;
    flex-direction: column;
  }
}

// Mobile (<768px)
@media (max-width: 767px) {
  .phase-scheduling-modal {
    max-width: 100%;
    margin: 1rem;
  }

  // Collapsible calendar on mobile
  .calendar-panel {
    max-height: 400px;
  }
}
```

## Accessibility Considerations

### Keyboard Navigation

1. **Tab Order**: Header → Conflict Alerts → Task List → Calendar → Footer
2. **Arrow Keys**: Navigate between tasks in list
3. **Enter/Space**: Expand/collapse task items
4. **Escape**: Close modal or cancel editing

### ARIA Labels

```svelte
<!-- Task list -->
<div
  role="list"
  aria-label="Tasks to schedule"
  aria-live="polite"
>
  {#each proposedSchedules as schedule}
    <div
      role="listitem"
      aria-label="{schedule.task.title} - {formatDateTime(schedule.proposedStart)}"
      aria-expanded={isEditing}
    >
      <!-- Task content -->
    </div>
  {/each}
</div>

<!-- Conflict alerts -->
<button
  onclick={() => onTaskClick(conflict.taskId)}
  aria-label="View task {conflict.taskName} with conflict"
>
  {conflict.taskName}
</button>

<!-- Highlighted task -->
<div
  aria-current={isHighlighted ? 'true' : 'false'}
  class="task-item"
>
  <!-- Content -->
</div>
```

### Screen Reader Support

```svelte
<!-- Announce when task is highlighted -->
{#if isHighlighted}
  <div role="status" aria-live="assertive" class="sr-only">
    Task {schedule.task.title} highlighted
  </div>
{/if}

<!-- Announce conflict count -->
<div role="status" aria-live="polite" class="sr-only">
  {conflictCount} scheduling conflicts found
</div>
```

## Animation and Transitions

Following BuildOS animation standards:

```scss
// Task highlight pulse
@keyframes highlight-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 theme("colors.primary.500" / 0.5);
  }
  50% {
    box-shadow: 0 0 0 8px theme("colors.primary.500" / 0);
  }
}

.task-highlighted {
  animation: highlight-pulse 2s ease-out;
}

// Smooth expansion
.task-item {
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
}

// Scroll behavior
.smooth-scroll {
  scroll-behavior: smooth;
}
```

## Implementation Checklist

### Phase 1: Layout Restructuring

- [ ] Update Modal size to `2xl` (1280px max-width)
- [ ] Implement desktop two-column grid layout
- [ ] Add mobile vertical stack with collapsible calendar
- [ ] Update responsive breakpoints and styling
- [ ] Test layout on various screen sizes

### Phase 2: Enhanced Conflict Alerts

- [ ] Add `onTaskClick` callback prop to ScheduleConflictAlert
- [ ] Display task names as clickable badges in conflicts
- [ ] Implement click-to-highlight functionality
- [ ] Add visual differentiation for conflict types
- [ ] Update conflict descriptions to be more specific

### Phase 3: Task List Improvements

- [ ] Convert TaskScheduleItem to expandable/collapsible
- [ ] Replace dual datetime pickers with start + duration
- [ ] Add highlighted state styling
- [ ] Implement expand/collapse animations
- [ ] Add duration validation and end time preview

### Phase 4: Calendar Integration

- [ ] Add `highlightedTaskId` prop to CalendarView
- [ ] Implement highlight styling for calendar events
- [ ] Wire up calendar event clicks to task highlighting
- [ ] Add auto-scroll to highlighted tasks
- [ ] Test highlight timeout and clearing

### Phase 5: Polish and Accessibility

- [ ] Add proper ARIA labels and roles
- [ ] Implement keyboard navigation
- [ ] Test screen reader compatibility
- [ ] Add smooth scroll behavior
- [ ] Implement focus management
- [ ] Add animations and transitions

### Phase 6: Testing

- [ ] Test on desktop (1920x1080, 1366x768)
- [ ] Test on tablet (iPad, Surface)
- [ ] Test on mobile (iPhone, Android)
- [ ] Test dark mode on all devices
- [ ] Test with real conflict data
- [ ] Test with 1 task, 5 tasks, 20+ tasks
- [ ] Verify accessibility with screen readers
- [ ] Test keyboard navigation

## File References

### Components to Modify

- `apps/web/src/lib/components/project/PhaseSchedulingModal.svelte` - Main modal
- `apps/web/src/lib/components/scheduling/ScheduleConflictAlert.svelte` - Enhanced alerts
- `apps/web/src/lib/components/scheduling/TaskScheduleItem.svelte` - Expandable items
- `apps/web/src/lib/components/scheduling/CalendarView.svelte` - Highlight support

### Related Files

- `apps/web/src/lib/utils/schedulingUtils.ts` - Type definitions
- `apps/web/src/lib/stores/schedulingStore.ts` - State management
- `apps/web/docs/design/BUILDOS_STYLE_GUIDE.md` - Design reference

## Success Metrics

### User Experience

- [ ] Tasks and calendar visible simultaneously on desktop
- [ ] Click any conflict warning to jump to affected task
- [ ] Click any calendar event to see corresponding task
- [ ] Edit task schedule with single date + duration (not 2 pickers)
- [ ] Clear visual distinction between normal/warning/highlighted tasks

### Technical

- [ ] Modal loads in <100ms
- [ ] Smooth 60fps animations
- [ ] No layout shift on resize
- [ ] Passes WCAG AA accessibility
- [ ] Works on browsers: Chrome, Safari, Firefox, Edge

### Design Adherence

- [ ] Follows BuildOS 8px spacing grid
- [ ] Uses BuildOS color system
- [ ] Matches Apple-inspired aesthetic
- [ ] Maintains dark mode consistency
- [ ] Responsive across all breakpoints

## Future Enhancements

### Phase 2 (Post-MVP)

1. **Drag-and-Drop**: Drag tasks directly onto calendar
2. **Bulk Actions**: Select multiple tasks for batch editing
3. **Smart Suggestions**: AI-powered alternative time suggestions
4. **Conflict Resolution**: One-click conflict resolution options
5. **Calendar Sync**: Live calendar sync during editing

### Nice-to-Have

- Task filtering (by conflict status, priority)
- Saved scheduling preferences
- Export schedule to various formats
- Undo/redo for schedule changes
- Multi-select for group scheduling

## Notes

- Prioritize desktop experience (primary use case)
- Mobile should remain functional but optimized for desktop
- Color coding must work in both light and dark modes
- Keep ADHD users in mind: reduce cognitive load, clear visual hierarchy
- Test with real user data for performance

---

**Design Status**: Ready for Implementation
**Estimated Effort**: 8-12 hours
**Priority**: High
