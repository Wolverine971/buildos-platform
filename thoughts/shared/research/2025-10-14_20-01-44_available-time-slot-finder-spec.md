---
date: 2025-10-14T20:01:44Z
researcher: Claude
git_commit: 44cdd992233e05654f6b5fbd241d1ba655bf62b9
branch: main
repository: buildos-platform
topic: 'Available Time Slot Finder - Feature Specification'
tags: [research, specification, time-play, calendar, feature-design]
status: draft
last_updated: 2025-10-14
last_updated_by: Claude
path: thoughts/shared/research/2025-10-14_20-01-44_available-time-slot-finder-spec.md
---

# Available Time Slot Finder - Feature Specification

**Date**: 2025-10-14T20:01:44Z
**Researcher**: Claude
**Git Commit**: 44cdd992233e05654f6b5fbd241d1ba655bf62b9
**Branch**: main
**Repository**: buildos-platform

## Executive Summary

Add an intelligent time slot finder to the Time Play calendar that identifies available time windows between existing events and time blocks. Users can configure detection parameters (buffer time, slot duration, time range) and see available slots dynamically highlighted on the calendar. Clicking a slot opens the time block creation modal with pre-filled times.

## Problem Statement

Users need to quickly identify available time slots in their calendar for scheduling new time blocks. Currently, they must:

- Manually scan the calendar for gaps
- Estimate available time windows
- Drag-to-create without visual guidance for optimal slots

This feature automates slot detection and provides visual guidance for efficient time blocking.

---

## Core Features

### 1. Dynamic Slot Detection

**Algorithm:**

```
For each day in the visible date range:
  1. Collect occupied times:
     - Google Calendar events
     - Existing time blocks

  2. Apply buffer time around each occupied slot:
     - Add buffer before event start
     - Add buffer after event end

  3. Identify gaps between buffered slots

  4. Filter gaps by configuration:
     - Within time range (earliestStart to latestEnd)
     - Duration >= minDuration
     - Duration <= maxDuration

  5. Return available slots with metadata
```

**Detection Rules:**

- Slots must be continuous (no breaks)
- Slots respect both calendar events AND time blocks
- Buffer time creates "breathing room" between commitments
- All-day events occupy the entire configured time range
- Slots at day boundaries are allowed (e.g., 8:00 AM start, 8:00 PM end)

### 2. Visual Representation

**Available Slot Styling:**

```css
- Background: Light teal/green (rgb(209 250 229) or Tailwind emerald-100)
- Border: 2px dashed emerald-400
- Opacity: 0.5 (normal), 0.7 (hover)
- Z-index: 5 (above grid, below events/blocks)
- Border-radius: 8px
- Transition: all 150ms ease
```

**Slot Content (for slots >= 60 mins):**

- Display duration in center (e.g., "90 min", "2.5 hrs")
- Font: text-xs, font-medium, color emerald-700
- Centered vertically and horizontally

**Hover Effect:**

- Increase opacity to 0.7
- Scale slightly (1.02)
- Show enhanced shadow
- Display tooltip with exact times:
    ```
    Available Slot
    9:30 AM - 11:00 AM
    Duration: 90 minutes
    Click to create time block
    ```

**States:**

- **Hidden**: Toggle off (slots not visible)
- **Visible**: Toggle on (slots rendered)
- **Hover**: Enhanced styling + tooltip
- **Loading**: Subtle pulse animation while calculating

### 3. Configuration Panel

**Component: `AvailableSlotFinder.svelte`**

Location: Below calendar grid and list view (always visible when in Time Play page)

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  ◉ Show Available Time Slots                    [Toggle]    │
│                                                               │
│  Configuration (when toggle is ON):                          │
│                                                               │
│  Buffer Time                                                  │
│  ○ None  ○ 15 min  ● 30 min  ○ 1 hour                       │
│                                                               │
│  Slot Duration                                                │
│  Min: [30] mins    Max: [600] mins (10 hrs)                  │
│  ├─────────────●─────────────┤                              │
│                                                               │
│  Time Window                                                  │
│  Earliest: [8:00] AM    Latest: [8:00] PM                    │
│  ├──────●──────────────────●────┤                           │
│                                                               │
│  📊 Found 7 available slots in current view                   │
└─────────────────────────────────────────────────────────────┘
```

**Controls:**

1. **Main Toggle** (Top Right)
    - Switch component (iOS-style toggle)
    - Persists to localStorage: `timeplay-show-available-slots`
    - Immediately shows/hides slots on calendar

2. **Buffer Time** (Radio Buttons)
    - Options: 0 min, 15 min, 30 min, 1 hour
    - Default: 30 min
    - Visual: Horizontal radio group with clear labels
    - Hint text: "Time cushion before and after each commitment"

3. **Slot Duration** (Dual Range Slider)
    - Min: 15-600 minutes (step: 15 min)
    - Max: 30-600 minutes (step: 15 min)
    - Default: Min 30, Max 600
    - Visual: Dual-handle slider with values displayed above handles
    - Validation: Max must be >= Min + 15
    - Live value display: "30 mins - 10 hrs"

4. **Time Window** (Dual Time Picker)
    - Earliest Start: 0-23 (hours)
    - Latest End: 1-24 (hours)
    - Default: 8 AM - 8 PM
    - Visual: Dual-handle slider with time labels
    - Validation: Latest must be > Earliest
    - 24-hour display with AM/PM conversion

5. **Slot Count Display** (Bottom)
    - Real-time count of available slots
    - Format: "📊 Found X available slots in current view"
    - If 0 slots: "⚠️ No available slots match current criteria"
    - Animated counter (count up/down on change)

**Interaction & Responsiveness:**

- All changes apply instantly (no "Apply" button needed)
- Debounce slider changes: 150ms
- Save all config to localStorage on change
- Smooth animations for slot appearance/disappearance
- Loading indicator during recalculation (if > 100ms)

**Persistence (localStorage):**

```typescript
interface SlotFinderConfig {
  enabled: boolean;              // default: false
  bufferTime: 0 | 15 | 30 | 60; // default: 30
  minDuration: number;           // default: 30 (minutes)
  maxDuration: number;           // default: 600 (minutes)
  earliestStart: number;         // default: 8 (hour)
  latestEnd: number;             // default: 20 (hour)
}

localStorage key: 'timeplay-slot-finder-config'
```

### 4. View-Specific Implementations

#### Day View

- Show all available slots for the single day
- Full detail: duration text, hover tooltips
- Most straightforward visualization

#### Week View

- Show available slots across all 7 days
- Same styling as day view
- Slots calculated independently per day
- Visual density may be high (acceptable - users can adjust config)

#### Month View

**Special Handling:**

Option A: **Indicator Badges** (Recommended)

- Show small badge on days with available slots
- Badge displays slot count (e.g., "3")
- Badge color: emerald-500
- Click badge → tooltip with slot details:

    ```
    Available Slots - Oct 14
    • 9:00 AM - 10:30 AM (90 min)
    • 2:00 PM - 4:00 PM (2 hrs)
    • 6:30 PM - 8:00 PM (90 min)

    [Create Time Block]
    ```

- Click "Create Time Block" → modal with day pre-selected

Option B: **Subtle Background Tint**

- Days with slots have subtle emerald tint
- Hover shows tooltip with slot details
- Click day → switch to day view with slots visible

**Recommendation:** Option A (indicator badges) - clearer affordance

#### List View

**New Section: "Available Time Slots"**

Add a collapsible section above the time blocks list:

```
┌─────────────────────────────────────────────────────────────┐
│ ▼ Available Time Slots (7)                                   │
│                                                               │
│  📅 Mon, Oct 14                                              │
│  ├─ 9:00 AM - 10:30 AM (90 min)         [Create Block]     │
│  ├─ 2:00 PM - 4:00 PM (2 hrs)           [Create Block]     │
│  └─ 6:30 PM - 8:00 PM (90 min)          [Create Block]     │
│                                                               │
│  📅 Tue, Oct 15                                              │
│  ├─ 8:00 AM - 12:00 PM (4 hrs)          [Create Block]     │
│  └─ 3:00 PM - 5:00 PM (2 hrs)           [Create Block]     │
│                                                               │
│ ▼ Scheduled Time Blocks (12)                                 │
│  [existing time blocks list...]                              │
└─────────────────────────────────────────────────────────────┘
```

Features:

- Grouped by day (chronologically)
- Sorted by start time within each day
- Each slot is clickable (opens modal)
- "Create Block" button per slot
- Collapsible sections
- Empty state: "No available slots found - adjust filters"

### 5. Slot Interaction

**Click Behavior:**

1. User clicks available slot (calendar or list)
2. Open `TimeBlockCreateModal` with pre-filled data:
    - `initialStart`: Slot start time
    - `initialEnd`: Slot end time
    - Focus on project selection (skip time selection)
3. User can still adjust times if needed
4. Create block as normal

**Keyboard Support:**

- Tab through available slots
- Enter/Space to open modal
- Arrow keys to navigate between slots

**Touch Support:**

- Minimum touch target: 44×44px (iOS guidelines)
- Tap slot → modal
- Long-press → show tooltip with details

### 6. Performance Optimization

**Memoization Strategy:**

```typescript
// Recalculate only when dependencies change
const availableSlots = $derived.by(() => {
	const { blocks, calendarEvents, config, days } = getCurrentState();

	return calculateAvailableSlots(blocks, calendarEvents, config, days);
});
```

**Debouncing:**

- Slider changes debounced at 150ms
- Prevents excessive recalculation during drag

**Calculation Limits:**

- Max 42 days (month view: 6 weeks)
- Max ~700 potential slots (42 days × 16 hours / 30 min slots)
- Typical: ~50-100 slots in week view

**Optimization Techniques:**

1. Calculate slots only for visible date range
2. Use binary search for gap detection (sorted events)
3. Skip days with no gaps (all-day events)
4. Cache calculation results per day
5. Use web workers if calculation > 200ms (future enhancement)

---

## Technical Implementation

### Data Structures

```typescript
// apps/web/src/lib/types/time-play.ts

export interface AvailableSlot {
	id: string; // Unique ID (e.g., "slot-2025-10-14-0900-1030")
	startTime: Date; // Slot start
	endTime: Date; // Slot end
	duration: number; // Duration in minutes
	dayIndex: number; // Index in days array (for positioning)
	dayDate: Date; // The day this slot belongs to
}

export interface SlotFinderConfig {
	enabled: boolean; // Show/hide slots
	bufferTime: 0 | 15 | 30 | 60; // Minutes before/after events
	minDuration: number; // Minimum slot size (minutes)
	maxDuration: number; // Maximum slot size (minutes)
	earliestStart: number; // Hour (0-23)
	latestEnd: number; // Hour (0-23)
}

export interface OccupiedTimeSlot {
	start: Date;
	end: Date;
	type: 'event' | 'block';
	id: string;
}
```

### Core Algorithm

```typescript
// apps/web/src/lib/utils/slot-finder.ts

export function calculateAvailableSlots(
	blocks: TimeBlockWithProject[],
	calendarEvents: CalendarEvent[],
	config: SlotFinderConfig,
	days: Date[]
): AvailableSlot[] {
	const slots: AvailableSlot[] = [];

	for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
		const dayDate = days[dayIndex];

		// 1. Get all occupied slots for this day
		const occupied = getOccupiedSlotsForDay(dayDate, blocks, calendarEvents, config.bufferTime);

		// 2. Sort by start time
		occupied.sort((a, b) => a.start.getTime() - b.start.getTime());

		// 3. Define day boundaries
		const dayStart = new Date(dayDate);
		dayStart.setHours(config.earliestStart, 0, 0, 0);

		const dayEnd = new Date(dayDate);
		dayEnd.setHours(config.latestEnd, 0, 0, 0);

		// 4. Find gaps
		const gaps = findGaps(occupied, dayStart, dayEnd);

		// 5. Filter by duration
		const validSlots = gaps.filter((gap) => {
			const duration = (gap.end.getTime() - gap.start.getTime()) / (1000 * 60);
			return duration >= config.minDuration && duration <= config.maxDuration;
		});

		// 6. Convert to AvailableSlot objects
		validSlots.forEach((gap, index) => {
			const duration = (gap.end.getTime() - gap.start.getTime()) / (1000 * 60);
			slots.push({
				id: `slot-${dayDate.toISOString().split('T')[0]}-${index}`,
				startTime: gap.start,
				endTime: gap.end,
				duration,
				dayIndex,
				dayDate
			});
		});
	}

	return slots;
}

function getOccupiedSlotsForDay(
	dayDate: Date,
	blocks: TimeBlockWithProject[],
	calendarEvents: CalendarEvent[],
	bufferTime: number
): OccupiedTimeSlot[] {
	const occupied: OccupiedTimeSlot[] = [];

	// Add time blocks
	blocks.forEach((block) => {
		const blockStart = new Date(block.start_time);
		if (isSameDay(blockStart, dayDate)) {
			const start = new Date(blockStart.getTime() - bufferTime * 60 * 1000);
			const end = new Date(new Date(block.end_time).getTime() + bufferTime * 60 * 1000);
			occupied.push({ start, end, type: 'block', id: block.id });
		}
	});

	// Add calendar events
	calendarEvents.forEach((event) => {
		const eventStart = new Date(event.start.dateTime || event.start.date || '');
		if (isSameDay(eventStart, dayDate)) {
			const start = new Date(eventStart.getTime() - bufferTime * 60 * 1000);
			const end = new Date(
				new Date(event.end.dateTime || event.end.date || '').getTime() +
					bufferTime * 60 * 1000
			);
			occupied.push({ start, end, type: 'event', id: event.id });
		}
	});

	return occupied;
}

function findGaps(
	occupied: OccupiedTimeSlot[],
	dayStart: Date,
	dayEnd: Date
): Array<{ start: Date; end: Date }> {
	const gaps: Array<{ start: Date; end: Date }> = [];

	if (occupied.length === 0) {
		// Entire day is available
		return [{ start: dayStart, end: dayEnd }];
	}

	// Gap before first event
	if (occupied[0].start > dayStart) {
		gaps.push({ start: dayStart, end: occupied[0].start });
	}

	// Gaps between events
	for (let i = 0; i < occupied.length - 1; i++) {
		const currentEnd = occupied[i].end;
		const nextStart = occupied[i + 1].start;

		if (currentEnd < nextStart) {
			gaps.push({ start: currentEnd, end: nextStart });
		}
	}

	// Gap after last event
	const lastEnd = occupied[occupied.length - 1].end;
	if (lastEnd < dayEnd) {
		gaps.push({ start: lastEnd, end: dayEnd });
	}

	return gaps;
}

function isSameDay(date1: Date, date2: Date): boolean {
	return (
		date1.getFullYear() === date2.getFullYear() &&
		date1.getMonth() === date2.getMonth() &&
		date1.getDate() === date2.getDate()
	);
}
```

### Store Integration

```typescript
// apps/web/src/lib/stores/timePlayStore.ts

// Add to TimePlayState interface
interface TimePlayState {
	// ... existing fields
	slotFinderConfig: SlotFinderConfig;
	availableSlots: AvailableSlot[];
}

// Add to store methods
function createTimePlayStore() {
	// ... existing code

	return {
		// ... existing methods

		updateSlotFinderConfig(updates: Partial<SlotFinderConfig>) {
			update((state) => {
				const newConfig = { ...state.slotFinderConfig, ...updates };

				// Save to localStorage
				if (browser) {
					localStorage.setItem('timeplay-slot-finder-config', JSON.stringify(newConfig));
				}

				return {
					...state,
					slotFinderConfig: newConfig
				};
			});
		},

		// Triggered automatically via $effect in component
		recalculateSlots() {
			update((state) => {
				if (!state.slotFinderConfig.enabled) {
					return { ...state, availableSlots: [] };
				}

				const slots = calculateAvailableSlots(
					state.blocks,
					calendarEvents, // from component
					state.slotFinderConfig,
					days // from component
				);

				return { ...state, availableSlots: slots };
			});
		}
	};
}
```

### Component Structure

```
apps/web/src/lib/components/time-play/
├── AvailableSlotFinder.svelte       (NEW - config panel)
├── AvailableSlotList.svelte         (NEW - list view slots)
├── TimePlayCalendar.svelte          (MODIFIED - render slots)
└── TimeBlockCreateModal.svelte      (MODIFIED - pre-fill from slot)

apps/web/src/lib/utils/
└── slot-finder.ts                   (NEW - detection algorithm)

apps/web/src/lib/types/
└── time-play.ts                     (NEW - type definitions)

apps/web/src/lib/stores/
└── timePlayStore.ts                 (MODIFIED - add slot config state)
```

---

## User Experience Flow

### Scenario 1: First-Time User

1. User navigates to Time Play page
2. Sees calendar with existing events/blocks
3. Notices config panel at bottom: "Show Available Time Slots [OFF]"
4. Toggles switch to ON
5. Calendar instantly highlights 7 available slots in light teal
6. User adjusts buffer time to 15 min → slots recalculate, now 9 slots
7. User clicks a 90-minute slot at 9:00 AM
8. Modal opens with times pre-filled
9. User selects project and clicks "Create block"
10. New block appears, available slot disappears, remaining slots adjust

### Scenario 2: Power User with Tight Schedule

1. User has packed calendar with many commitments
2. Enables slot finder with default config
3. Sees only 2 small slots (35 min, 40 min)
4. Adjusts min duration to 30 min (from 45 min) → 4 slots now visible
5. Adjusts time window to start at 7 AM → 1 additional morning slot appears
6. Reduces buffer time to 0 min → slots expand slightly
7. Clicks optimal 2-hour afternoon slot
8. Creates deep work block for priority project

### Scenario 3: Mobile User

1. User on phone in portrait mode
2. Config panel is vertical-friendly (stacked layout)
3. Sliders are touch-optimized (large hit targets)
4. Taps slot on calendar → modal with pre-filled times
5. Quick adjustment and block creation
6. Responsive updates without lag

---

## Edge Cases & Error Handling

### No Available Slots

- **Display**: "⚠️ No available slots match current criteria"
- **Suggestions**:
    - "Try reducing buffer time"
    - "Expand time window"
    - "Reduce minimum duration"

### Overlapping Events

- **Handling**: Merge overlapping occupied slots before gap detection
- **Buffer**: Apply buffer to merged slot boundaries

### All-Day Events

- **Handling**: Mark entire configured time range as occupied
- **Visual**: No slots shown on days with all-day events

### Time Zone Handling

- **Consistency**: All times displayed in user's local timezone
- **Storage**: Store config in local timezone preferences
- **Calendar Integration**: Google Calendar events auto-converted to local time

### Invalid Configuration

- **Min > Max Duration**: Disable controls, show warning
- **Earliest >= Latest Time**: Disable controls, show warning
- **Validation**: Real-time validation with clear error messages

### Performance Degradation

- **Threshold**: If calculation takes > 200ms
- **Fallback**: Show loading indicator
- **Future**: Move to web worker for heavy calculations

---

## Accessibility (a11y)

### Keyboard Navigation

- **Tab**: Navigate through available slots
- **Enter/Space**: Open modal for selected slot
- **Arrow Keys**: Move between slots (day/week view)
- **Escape**: Close modal

### Screen Readers

- **Slot Labels**: "Available time slot from 9:00 AM to 10:30 AM, duration 90 minutes"
- **Count Announcements**: "7 available slots found" (aria-live="polite")
- **Config Changes**: Announce slot count changes
- **Empty State**: "No available slots found with current settings"

### Focus Management

- **Focus Indicator**: Clear focus ring on slots and controls
- **Focus Trap**: Modal traps focus when open
- **Return Focus**: Return to triggering slot after modal close

### Color Contrast

- **Text on Teal**: Ensure WCAG AA compliance (4.5:1 ratio)
- **Border**: High contrast dashed border for visibility
- **No Color-Only**: Duration text provides non-color indicator

---

## Testing Strategy

### Unit Tests

**Slot Detection Algorithm** (`slot-finder.test.ts`)

```typescript
describe('calculateAvailableSlots', () => {
	it('should find gap between two events', () => {
		// Event 1: 9am-10am, Event 2: 11am-12pm
		// Expected slot: 10am-11am
	});

	it('should apply buffer time correctly', () => {
		// Event: 9am-10am, Buffer: 30min
		// Occupied: 8:30am-10:30am
	});

	it('should filter by min/max duration', () => {
		// Gaps: 20min, 45min, 90min, 5hrs
		// Min: 30min, Max: 2hrs
		// Expected: 45min, 90min
	});

	it('should respect time window boundaries', () => {
		// Gaps: 7am-9am, 2pm-4pm, 9pm-11pm
		// Window: 8am-8pm
		// Expected: 8am-9am, 2pm-4pm
	});

	it('should handle overlapping events', () => {
		// Event 1: 9am-11am, Event 2: 10am-12pm
		// Merged: 9am-12pm
	});

	it('should handle all-day events', () => {
		// All-day event on Oct 14
		// Expected: No slots on Oct 14
	});
});
```

**Component Tests**

- `AvailableSlotFinder.svelte`: Config changes update store
- `TimePlayCalendar.svelte`: Slots render correctly in all views
- `AvailableSlotList.svelte`: Slots grouped and sorted properly

### Integration Tests

**E2E Scenarios** (Playwright)

1. Enable slot finder → slots appear
2. Adjust config → slots recalculate
3. Click slot → modal opens with pre-filled times
4. Create block → slot disappears
5. Delete block → slot reappears
6. Switch views → slots persist/adapt
7. Reload page → config persisted

### Performance Tests

**Benchmarks**

- Calculation time for 7 days (week view): < 50ms
- Calculation time for 42 days (month view): < 200ms
- UI responsiveness after config change: < 100ms
- Slider drag smoothness: 60fps

---

## Design Specs

### Colors (Tailwind)

**Available Slots**

- Background: `bg-emerald-100/50` (light mode), `bg-emerald-900/20` (dark mode)
- Border: `border-emerald-400` (light mode), `border-emerald-500` (dark mode)
- Text: `text-emerald-700` (light mode), `text-emerald-300` (dark mode)
- Hover BG: `bg-emerald-100/70` (light mode), `bg-emerald-900/30` (dark mode)

**Config Panel**

- Background: `bg-white/80` (light mode), `bg-slate-900/60` (dark mode)
- Border: `border-slate-200/80` (light mode), `border-slate-800/70` (dark mode)
- Toggle ON: `bg-emerald-500`
- Toggle OFF: `bg-slate-300` (light mode), `bg-slate-700` (dark mode)

### Typography

**Slot Duration Text**

- Font: Inter, -apple-system, sans-serif
- Size: `text-xs` (12px)
- Weight: `font-medium` (500)
- Line Height: `leading-tight`

**Config Labels**

- Font: Inter
- Size: `text-sm` (14px)
- Weight: `font-semibold` (600)

**Slot Count**

- Font: Inter
- Size: `text-sm` (14px)
- Weight: `font-medium` (500)

### Spacing

**Slot Padding**

- Small slots (< 60 min): No padding, center duration text
- Medium slots (60-120 min): `p-2`
- Large slots (> 120 min): `p-3`

**Config Panel Padding**

- Container: `p-6`
- Section gaps: `space-y-6`
- Control gaps: `gap-4`

### Animations

**Slot Appear/Disappear**

```css
@keyframes slot-fade-in {
	from {
		opacity: 0;
		transform: scaleY(0.95);
	}
	to {
		opacity: 1;
		transform: scaleY(1);
	}
}

.available-slot {
	animation: slot-fade-in 200ms ease-out;
}
```

**Hover Transition**

```css
.available-slot {
	transition: all 150ms ease;
}

.available-slot:hover {
	transform: translateY(-1px) scaleY(1.02);
}
```

**Counter Animation**

```css
@keyframes count-up {
	from {
		opacity: 0;
		transform: translateY(4px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}
```

---

## Future Enhancements

### Phase 2 (Post-MVP)

1. **Smart Slot Recommendations**
    - Highlight "optimal" slots based on:
        - Duration match (e.g., 90-min slots for deep work)
        - Time of day (morning for creative work)
        - Historical patterns (when user is most productive)

2. **Slot Templates**
    - Save common configurations as presets:
        - "Deep Work" (90-120 min slots, 8-11 AM)
        - "Quick Tasks" (30-45 min slots, any time)
        - "Meetings" (60 min slots, 2-5 PM)

3. **Multi-Day Slot Finder**
    - Find slots spanning multiple days
    - "Find next 3 available 2-hour slots this week"

4. **Calendar Heatmap**
    - Visual density map showing availability across weeks
    - Darker = more available time

5. **Recurring Slot Blocking**
    - Block recurring slots (e.g., "every Monday 9-11 AM")
    - Auto-create time blocks for recurring slots

6. **AI-Powered Suggestions**
    - "Based on your schedule, tomorrow afternoon has 3 hours free"
    - "Your calendar is packed this week - consider declining X meeting"

### Phase 3 (Advanced)

1. **Team Availability**
    - Find common available slots across team calendars
    - Suggest optimal meeting times

2. **Integration with Tasks**
    - Auto-suggest slots based on task duration estimates
    - "Task X needs 90 min - here are 4 available slots"

3. **Focus Time Protection**
    - Auto-block slots meeting criteria
    - Integration with Do Not Disturb / Slack status

---

## Implementation Checklist

### Core Features

- [ ] Create `slot-finder.ts` utility with detection algorithm
- [ ] Add `SlotFinderConfig` and `AvailableSlot` types
- [ ] Integrate config into `timePlayStore.ts`
- [ ] Implement localStorage persistence for config
- [ ] Create `AvailableSlotFinder.svelte` config panel component
- [ ] Modify `TimePlayCalendar.svelte` to render slots in day/week views
- [ ] Implement month view indicator badges
- [ ] Create `AvailableSlotList.svelte` for list view
- [ ] Add slot click handler → modal with pre-filled times
- [ ] Implement debouncing for config changes
- [ ] Add loading states for calculation

### Visual & Styling

- [ ] Design slot appearance (colors, borders, shadows)
- [ ] Create hover effects and tooltips
- [ ] Implement responsive layout for config panel
- [ ] Add animations (fade-in, hover, counter)
- [ ] Ensure dark mode compatibility
- [ ] Mobile-optimized touch targets

### Accessibility

- [ ] Keyboard navigation for slots
- [ ] Screen reader labels and announcements
- [ ] Focus management and trapping
- [ ] ARIA attributes for dynamic content
- [ ] Color contrast validation

### Testing

- [ ] Unit tests for slot detection algorithm
- [ ] Unit tests for config validation
- [ ] Component tests for all new components
- [ ] Integration tests for end-to-end flow
- [ ] Performance benchmarks
- [ ] Cross-browser testing
- [ ] Mobile device testing

### Documentation

- [ ] Update Time Play feature documentation
- [ ] Add inline code comments
- [ ] Create user guide for slot finder
- [ ] Update changelog

---

## Success Metrics

### Quantitative

- **Adoption Rate**: % of Time Play users who enable slot finder
- **Usage Frequency**: Avg. uses per session
- **Time Saved**: Reduction in time to create blocks (baseline vs. with feature)
- **Accuracy**: % of slots clicked and converted to blocks
- **Performance**: 95th percentile calculation time < 200ms

### Qualitative

- **User Feedback**: NPS score for feature
- **User Interviews**: Satisfaction with slot detection accuracy
- **Usability**: Task completion rate for "find and book available slot"

---

## Open Questions

1. **Should we persist the toggle state globally or per-view?**
    - Global: Same state across day/week/month views
    - Per-view: Different state per view (e.g., always on in week, off in month)
    - **Recommendation**: Global (simpler UX)

2. **Should buffer time be applied to all-day events?**
    - Option A: No buffer (all-day already occupies full day)
    - Option B: Apply buffer (may block previous/next day)
    - **Recommendation**: Option A

3. **How to handle slots that span lunch hours (12-1 PM)?**
    - User mentioned NOT to exclude lunch hours
    - Should we still show a visual indicator that it's lunch time?
    - **Recommendation**: Show all slots, no special lunch treatment

4. **Should we limit the number of visible slots to prevent clutter?**
    - Option A: No limit (user can adjust config if cluttered)
    - Option B: Limit to top 10 slots (e.g., largest or earliest)
    - **Recommendation**: Option A (no limit) - user has full control via config

5. **Should the feature be enabled by default for new users?**
    - Option A: Enabled (discoverable, helpful)
    - Option B: Disabled (avoid overwhelming new users)
    - **Recommendation**: Disabled (let users discover and opt-in)

---

## Related Documentation

- Time Play Calendar: `/apps/web/src/lib/components/time-play/TimePlayCalendar.svelte`
- Time Play Store: `/apps/web/src/lib/stores/timePlayStore.ts`
- Calendar Service: `/apps/web/src/lib/services/calendar-service.ts`
- Time Block Modal: `/apps/web/src/lib/components/time-play/TimeBlockCreateModal.svelte`

---

## Revision History

- **2025-10-14**: Initial specification drafted by Claude based on user requirements

---

## Appendix: Example Calculations

### Example 1: Simple Day

**Input:**

- Day: Oct 14, 2025
- Events:
    - Meeting 1: 9:00 AM - 10:00 AM
    - Meeting 2: 2:00 PM - 3:00 PM
- Config:
    - Buffer: 30 min
    - Min: 30 min
    - Max: 10 hrs
    - Window: 8 AM - 8 PM

**Occupied Slots (with buffer):**

- 8:30 AM - 10:30 AM (Meeting 1 + buffer)
- 1:30 PM - 3:30 PM (Meeting 2 + buffer)

**Available Slots:**

1. 8:00 AM - 8:30 AM (30 min) ✓
2. 10:30 AM - 1:30 PM (3 hrs) ✓
3. 3:30 PM - 8:00 PM (4.5 hrs) ✓

**Result: 3 available slots**

### Example 2: Packed Day

**Input:**

- Day: Oct 15, 2025
- Events:
    - 8:00 AM - 9:00 AM
    - 9:30 AM - 11:00 AM
    - 11:00 AM - 12:00 PM
    - 1:00 PM - 2:30 PM
    - 3:00 PM - 5:00 PM
    - 6:00 PM - 7:30 PM
- Config:
    - Buffer: 15 min
    - Min: 45 min
    - Max: 10 hrs
    - Window: 8 AM - 8 PM

**Occupied Slots (with buffer):**

- 7:45 AM - 9:15 AM
- 9:15 AM - 11:15 AM (merged overlap)
- 10:45 AM - 12:15 PM
- 12:45 PM - 2:45 PM
- 2:45 PM - 5:15 PM
- 5:45 PM - 7:45 PM

**Available Slots:**

1. None (all gaps < 45 min after merging)

**Result: 0 available slots** → User needs to adjust config (reduce min duration or buffer)

### Example 3: Weekend (Mostly Free)

**Input:**

- Day: Oct 18, 2025 (Saturday)
- Events:
    - Brunch: 11:00 AM - 12:30 PM
- Config:
    - Buffer: 30 min
    - Min: 60 min
    - Max: 10 hrs
    - Window: 8 AM - 8 PM

**Occupied Slots:**

- 10:30 AM - 1:00 PM (Brunch + buffer)

**Available Slots:**

1. 8:00 AM - 10:30 AM (2.5 hrs) ✓
2. 1:00 PM - 8:00 PM (7 hrs) ✓

**Result: 2 large available slots** (ideal for deep work)

---

**End of Specification**
