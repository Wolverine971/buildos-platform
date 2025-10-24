---
date: 2025-10-24T15:00:00.000Z
researcher: Claude Code
topic: 'Time Block Adjustment Feature - Implementation Ultrathinking'
tags: [implementation, design-decisions, architecture]
status: in-progress
---

# Time Block Adjustment - Deep Implementation Thinking

## 1. Component Architecture Decisions

### 1.1 State Management Strategy

**Decision**: Use Svelte 5 `$state` runes for reactive state management (NOT old `let` variables)

**Reasoning**:

- Project already uses Svelte 5 with runes syntax
- `$state` provides true reactivity without need for manual triggers
- Better TypeScript support
- Cleaner code than old reactive statements

**State Structure**:

```typescript
// View/Edit Mode
let isEditMode = $state(false);

// Form data - clone of current block during edit
let editFormData = $state<EditFormData>({
	start_time: '', // datetime-local string: "2025-10-25T14:00"
	end_time: '', // datetime-local string: "2025-10-25T15:00"
	timezone: '', // "America/New_York"
	regenerate_suggestions: false
});

// Loading/Error states
let isSaving = $state(false);
let validationErrors = $state<string[]>([]);
let saveError = $state<string | null>(null);

// Original values for rollback
let originalBlock = $state<TimeBlockWithProject | null>(null);
```

**Why This Structure**:

- `editFormData` isolated from component state - no accidental mutations
- Separate `validationErrors` and `saveError` - allows showing both types
- `originalBlock` enables rollback on cancel
- All strings for form inputs (HTML `datetime-local` requires strings)

### 1.2 Component Layout Strategy

**Decision**: Keep modal structure, add conditional edit/view sections

**Current Structure** (read-only):

```
Modal
├─ Header (title)
├─ Content
│  ├─ Block type badges
│  ├─ View-only date/time display
│  ├─ Suggestions section
│  └─ Summary card
└─ Footer (Close, Delete buttons)
```

**New Structure** (with edit mode):

```
Modal
├─ Header (title + Edit button)
├─ Content
│  {#if isEditMode}
│    ├─ Error banner (if any)
│    ├─ Form fields:
│    │  ├─ Start date/time input
│    │  ├─ End date/time input
│    │  ├─ Timezone selector
│    │  └─ Regenerate suggestions checkbox
│    └─ Duration display (calculated, read-only)
│  {:else}
│    ├─ Current view-only display
│    ├─ Google Calendar link
│    ├─ Suggestions section
│    └─ Summary card
│  {/if}
└─ Footer
   {#if isEditMode}
     ├─ Save button (disabled if validation errors)
     └─ Cancel button
   {:else}
     ├─ Delete button
     └─ Close button
   {/if}
```

**Advantages**:

- Toggle entire edit UI instead of overlaying
- Cleaner visual experience
- No state confusion between view and edit
- Easier to manage lifecycle (form init on enter, cleanup on exit)

### 1.3 Form Initialization Strategy

**Decision**: Initialize form data when entering edit mode, not on modal open

**Implementation**:

```typescript
function enterEditMode() {
	// Store original for rollback
	originalBlock = block;

	// Clone block data to form
	editFormData = {
		start_time: formatDateTimeForInput(block.start_time),
		end_time: formatDateTimeForInput(block.end_time),
		timezone: block.timezone || 'America/New_York',
		regenerate_suggestions: false
	};

	// Clear errors
	validationErrors = [];
	saveError = null;

	isEditMode = true;
}

function exitEditMode() {
	isEditMode = false;
	validationErrors = [];
	saveError = null;
	originalBlock = null;

	// Form data cleared for memory
	editFormData = {
		start_time: '',
		end_time: '',
		timezone: '',
		regenerate_suggestions: false
	};
}
```

**Advantages**:

- Lazy initialization - no overhead for view-only users
- Clean separation between view and edit state
- Easy to reset on cancel
- Lower memory footprint

---

## 2. Date/Time Handling (Critical Complexity)

### 2.1 The datetime-local Challenge

**Problem**: HTML `<input type="datetime-local">` has quirks:

1. Returns local browser time (NOT UTC)
2. No timezone info in value
3. Format is always: "2025-10-25T14:30"
4. Assumes user's local timezone

**Example of confusion**:

```javascript
// User in New York (EST, UTC-5)
// Sets input to: "2025-10-25T14:00"
// This means: 14:00 in their local time (EST)
// ISO equivalent: "2025-10-25T18:00Z" (UTC)

// User in London (GMT, UTC+0)
// Same block, same input value: "2025-10-25T14:00"
// This means: 14:00 in their local time (GMT)
// ISO equivalent: "2025-10-25T14:00Z" (UTC)
// DIFFERENT TIME!
```

### 2.2 Solution: Explicit Timezone Handling

**Decision**:

1. Keep timezone field visible and editable
2. Always use block's stored timezone for calculations
3. Treat input times as LOCAL to that timezone (not browser timezone)

**Implementation**:

```typescript
// Convert ISO timestamp to datetime-local string
// Interpretation: time as if in the block's timezone
function formatDateTimeForInput(isoString: string, timezone: string): string {
	// Parse as UTC first
	const date = new Date(isoString);

	// Convert to timezone-aware date string
	const formatter = new Intl.DateTimeFormat('sv-SE', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		timeZone: timezone
	});

	const parts = formatter.formatToParts(date);
	const year = parts.find((p) => p.type === 'year')?.value;
	const month = parts.find((p) => p.type === 'month')?.value;
	const day = parts.find((p) => p.type === 'day')?.value;
	const hour = parts.find((p) => p.type === 'hour')?.value;
	const minute = parts.find((p) => p.type === 'minute')?.value;

	return `${year}-${month}-${day}T${hour}:${minute}`;
}

// Convert datetime-local string back to ISO
// Interpretation: input time is LOCAL to the selected timezone
function parseDateTime(inputValue: string, timezone: string): Date {
	const [datePart, timePart] = inputValue.split('T');
	const [year, month, day] = datePart.split('-').map(Number);
	const [hours, minutes] = timePart.split(':').map(Number);

	// Create date object in the selected timezone
	// Strategy: Create UTC date, then figure out offset

	// Get UTC offset for this timezone on this date
	const testDate = new Date(year, month - 1, day, 12, 0, 0);
	const formatter = new Intl.DateTimeFormat('sv-SE', {
		timeZone: timezone,
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	});

	// Get the offset by checking what UTC time gives us at noon
	const parts = formatter.formatToParts(testDate);
	const tzHour = Number(parts.find((p) => p.type === 'hour')?.value);
	const offset = (12 - tzHour) * 60 * 60 * 1000;

	// Create the actual UTC time
	const localTime = new Date(year, month - 1, day, hours, minutes, 0);
	const utcTime = new Date(localTime.getTime() - offset);

	return utcTime;
}
```

**Why This Works**:

- User always sees time in their block's timezone
- If they change timezone, times adjust appropriately
- API receives ISO format (UTC) - database stores correctly
- Calendar receives timezone + ISO time - Google handles correctly

### 2.3 Timezone Selector Implementation

**Decision**: Make timezone selector optional but visible

**Options Considered**:

1. **Auto-detect from browser** (Bad)
    - User might be traveling
    - Can't manually override
    - Confusing if browser TZ wrong

2. **Fixed to original block timezone** (Bad)
    - No flexibility
    - Confusing if user wants to change
    - Edge case: user actually did move

3. **Always editable** (CHOSEN - Good)
    - User can adjust if needed
    - Visible in form
    - Can see impact on times
    - Matches existing block timezone by default

**Implementation**:

```typescript
// Timezone list - cached or imported
const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Hong_Kong',
  'Australia/Sydney',
  // ... more
];

// In form:
<select bind:value={editFormData.timezone}>
  {#each COMMON_TIMEZONES as tz}
    <option value={tz}>{tz}</option>
  {/each}
</select>
```

---

## 3. Validation Strategy

### 3.1 When to Validate

**Decision**: Validate in three places

1. **Real-time while user types** (for UX feedback)
2. **Before API call** (catch errors early)
3. **On API response** (catch server-side issues)

**Implementation Approach**:

```typescript
// Real-time validation as user types
function validateForm(): string[] {
	const errors: string[] = [];

	try {
		const start = parseDateTime(editFormData.start_time, editFormData.timezone);
		const end = parseDateTime(editFormData.end_time, editFormData.timezone);

		// Duration check
		const durationMs = end.getTime() - start.getTime();
		const durationMin = durationMs / (1000 * 60);

		if (durationMin < 15) {
			errors.push('Time block must be at least 15 minutes');
		}
		if (durationMin > 600) {
			errors.push('Time block cannot exceed 600 minutes (10 hours)');
		}

		// Time range check
		if (end <= start) {
			errors.push('End time must be after start time');
		}
	} catch (e) {
		errors.push('Invalid date or time format');
	}

	return errors;
}

// Update validation whenever form changes
$effect(() => {
	if (isEditMode && editFormData.start_time && editFormData.end_time) {
		validationErrors = validateForm();
	}
});

// Check conflicts only on submit (expensive)
async function checkConflicts(): Promise<string[]> {
	const start = parseDateTime(editFormData.start_time, editFormData.timezone);
	const end = parseDateTime(editFormData.end_time, editFormData.timezone);

	// Call service or API to check
	// This is handled by service, but we could add pre-check here
	return [];
}
```

**Advantages**:

- User sees errors immediately as they type
- Save button disabled when errors exist
- Server-side errors still caught and displayed
- Debounced to prevent excessive checks

### 3.2 Conflict Detection

**Decision**: Let service handle it, display specific error message

**Why Not Check Real-Time**:

- Expensive database query per keystroke
- Debouncing needed anyway
- Service does it on save (definitive answer)
- User might be typing multiple fields

**Error Message**:

```
"Time block conflicts with an existing block at 2:00 PM - 3:00 PM"
```

---

## 4. Saving and Error Recovery

### 4.1 Save Flow with Rollback

**Decision**: Optimistic UI update followed by service call

**Implementation**:

```typescript
async function handleSaveChanges() {
	// 1. Validation check
	const errors = validateForm();
	if (errors.length > 0) {
		validationErrors = errors;
		return; // Don't proceed
	}

	// 2. Start loading
	isSaving = true;
	saveError = null;

	try {
		// 3. Parse form data
		const start = parseDateTime(editFormData.start_time, editFormData.timezone);
		const end = parseDateTime(editFormData.end_time, editFormData.timezone);

		// 4. Call service (which calls API)
		const updated = await onUpdate({
			start_time: start,
			end_time: end,
			timezone: editFormData.timezone,
			regenerate_suggestions: editFormData.regenerate_suggestions
		});

		// 5. Success - exit edit mode
		exitEditMode();

		// 6. Refresh parent component's block data
		// (handled by parent via event or prop update)
	} catch (error) {
		// 7. Error - stay in edit mode, show message
		const errorMessage = error instanceof Error ? error.message : 'Failed to update time block';

		saveError = errorMessage;
		validationErrors = []; // Clear validation errors

		// Log for debugging
		console.error('Time block update failed:', error);
	} finally {
		isSaving = false;
	}
}
```

**Recovery Options Provided**:

- Error message explains what went wrong
- Form state preserved
- User can adjust and retry
- Cancel button available to abandon edit

### 4.2 Error Message Strategy

**Principle**: Be specific, suggest fix when possible

| Error      | Message                                                              | Action                   |
| ---------- | -------------------------------------------------------------------- | ------------------------ |
| Conflict   | "Time block conflicts with another block at 2:00 PM - 3:00 PM"       | User adjusts time        |
| Validation | "Time block must be at least 15 minutes"                             | User extends duration    |
| Calendar   | "Failed to sync to Google Calendar. Check your calendar connection." | Retry or contact support |
| Deleted    | "Cannot update - this block was deleted from another device"         | Reload and try again     |
| Network    | "Network error. Please check connection and try again."              | Retry                    |

---

## 5. Timezone Edge Cases

### 5.1 Daylight Saving Time (DST)

**Scenario**: User creates block before DST change, edits after

**Example**:

```
Block created: Oct 24 2025 at 2:00 PM EDT (UTC-4)
DST ends Nov 2 2025 at 2:00 AM
User edits block on Nov 3 (now EST, UTC-5)

Should the time stay 2:00 PM?
```

**Decision**: Yes, absolute UTC time preserved

**Why**:

- Users think in absolute times ("2 PM")
- Changing timezone shouldn't shift the meeting
- Calendar event time doesn't change (it's UTC)

**Implementation**:

```typescript
// The ISO string is always UTC
// The timezone field is just for display preference
// So if times look different, it's display change only

// If user changes timezone from EDT to EST:
// start_time in DB: "2025-10-24T18:00Z" (unchanged)
// But displays as:
// - In EDT: 2:00 PM EDT
// - In EST: 1:00 PM EST
```

**Handling**:

- Show warning if changing timezone changes displayed time
- "Changing to EST will display times as 1:00 PM - 1:30 PM (but UTC time unchanged)"

### 5.2 UTC Offset Ambiguities

**Edge Case**: During DST overlap (happens in some timezones)

**Decision**: Use standard approach - Intl.DateTimeFormat handles this

---

## 6. Suggestion Regeneration Logic

### 6.1 When to Regenerate

**Decision**: User explicitly checks "Regenerate Suggestions" checkbox

**Why Not Automatic**:

- AI calls cost money (OpenAI API)
- Might take time to generate
- User might not want new suggestions
- Checkbox makes intent explicit

**Implementation**:

```typescript
// Form field
<label>
  <input
    type="checkbox"
    bind:checked={editFormData.regenerate_suggestions}
  />
  Regenerate AI suggestions
</label>

// On save, service receives flag
await onUpdate({
  start_time,
  end_time,
  timezone,
  regenerate_suggestions: editFormData.regenerate_suggestions
});

// Service will:
// 1. Update time block
// 2. If regenerate_suggestions === true, call suggestion service
// 3. Update suggestions in DB
// 4. Return block with new suggestions
```

### 6.2 UI Feedback

**During Generation**:

```
"Regenerating suggestions..." (with spinner)
```

**After Generation**:

- Modal closes and reopens (refreshes suggestions display)
- OR updates suggestions in place
- User sees new suggestions immediately

---

## 7. Integration Strategy

### 7.1 Parent Component Integration

**Decision**: Parent component responsible for calling service

**Why**:

- Keeps modal pure (just UI)
- Parent handles data refresh
- Easier to test
- Follows React/Svelte patterns

**Implementation in Parent**:

```typescript
// In component that renders TimeBlockDetailModal
let selectedBlock = $state<TimeBlockWithProject | null>(null);

async function handleUpdateTimeBlock(params: UpdateTimeBlockParams) {
  if (!selectedBlock) return;

  try {
    const updated = await timeBlockService.updateTimeBlock(
      selectedBlock.id,
      params
    );

    // Update local state
    selectedBlock = updated;

    // Refresh list
    await loadTimeBlocks();

    // Show success message
    showSuccessToast('Time block updated');

  } catch (error) {
    // Modal will display error
    throw error;
  }
}

// In template
<TimeBlockDetailModal
  block={selectedBlock}
  onClose={() => selectedBlock = null}
  onDelete={() => handleDeleteTimeBlock(selectedBlock.id)}
  onUpdate={handleUpdateTimeBlock}
/>
```

### 7.2 Modal Props

**Final Props Interface**:

```typescript
let {
	block,
	isRegenerating = false,
	onClose,
	onDelete,
	onRegenerate,
	onUpdate // NEW - for updating time/date
}: {
	block: TimeBlockWithProject;
	isRegenerating?: boolean;
	onClose: () => void;
	onDelete: () => void;
	onRegenerate: () => void;
	onUpdate?: (params: UpdateTimeBlockParams) => Promise<void>; // NEW
} = $props();
```

---

## 8. Testing Strategy

### 8.1 Unit Tests (Component Logic)

```typescript
describe('TimeBlockDetailModal - Edit Mode', () => {
	// Mode toggle
	test('toggles to edit mode and back', () => {
		// Render component
		// Click edit button
		// Assert form is visible
		// Click cancel
		// Assert form is hidden
	});

	// Form initialization
	test('initializes form with block data', () => {
		// Enter edit mode
		// Assert start_time shows correct datetime-local value
		// Assert end_time shows correct value
		// Assert timezone shows saved timezone
	});

	// Real-time validation
	test('validates duration >= 15 minutes', () => {
		// Set start: 2:00 PM
		// Set end: 2:10 PM (only 10 minutes)
		// Assert error message shown
		// Assert save button disabled
	});

	test('validates duration <= 600 minutes', () => {
		// Set start: 2:00 PM
		// Set end: next day 2:00 PM (1440 minutes)
		// Assert error message shown
	});

	// Date/time formatting
	test('formats ISO timestamp to datetime-local', () => {
		// Input: "2025-10-25T18:00:00Z" in "America/New_York"
		// Expected: "2025-10-25T14:00" (EDT is UTC-4)
	});

	// Form submission
	test('calls onUpdate with correct parameters', async () => {
		const mock = vi.fn();
		// Render with onUpdate={mock}
		// Enter edit mode
		// Change times
		// Click save
		// Assert mock called with { start_time, end_time, ... }
	});

	// Error handling
	test('displays server errors and allows retry', async () => {
		const mock = vi.fn().mockRejectedValueOnce(new Error('Conflict'));
		// Submit form
		// Assert error message shown
		// Assert form still visible
		// Fix conflict
		// Retry submission
	});
});
```

### 8.2 Integration Tests (Service + API)

```typescript
describe('Time Block Update - Integration', () => {
	test('updates block in database', async () => {
		const service = new TimeBlockService(userId);
		const block = await service.createTimeBlock({
			block_type: 'project',
			project_id: projectId,
			start_time: new Date('2025-10-25T14:00'),
			end_time: new Date('2025-10-25T15:00')
		});

		const updated = await service.updateTimeBlock(block.id, {
			start_time: new Date('2025-10-25T16:00'),
			end_time: new Date('2025-10-25T17:00')
		});

		expect(updated.start_time).toBe('2025-10-25T16:00:00Z');
		expect(updated.end_time).toBe('2025-10-25T17:00:00Z');
	});

	test('syncs to Google Calendar', async () => {
		// Mock calendar service
		const calendarMock = vi.spyOn(calendarService, 'updateCalendarEvent');

		const service = new TimeBlockService(userId);
		await service.updateTimeBlock(blockId, {
			start_time: newStart,
			end_time: newEnd
		});

		expect(calendarMock).toHaveBeenCalledWith(userId, {
			event_id: expect.any(String),
			start_time: expect.any(String),
			end_time: expect.any(String),
			timeZone: expect.any(String)
		});
	});

	test('detects conflicts', async () => {
		const service = new TimeBlockService(userId);

		// Create existing block 2-3 PM
		await service.createTimeBlock({
			block_type: 'project',
			project_id,
			start_time: new Date('2025-10-25T14:00'),
			end_time: new Date('2025-10-25T15:00')
		});

		// Try to update another to 2:30-3:30 PM
		expect(() =>
			service.updateTimeBlock(blockId, {
				start_time: new Date('2025-10-25T14:30'),
				end_time: new Date('2025-10-25T15:30')
			})
		).toThrow('conflicts');
	});
});
```

### 8.3 Critical E2E Flow

```typescript
describe('Time Block Adjustment - E2E', () => {
	test('complete user flow: edit → save → verify', async () => {
		// 1. Setup: Create time block
		const block = await createTestBlock('2 PM - 3 PM');

		// 2. Open modal
		render(TimeBlockDetailModal, { props: { block } });

		// 3. Click edit
		const editBtn = screen.getByText('Edit');
		await userEvent.click(editBtn);

		// 4. Change times to 3 PM - 4 PM
		const startInput = screen.getByDisplayValue('2025-10-25T14:00');
		const endInput = screen.getByDisplayValue('2025-10-25T15:00');

		await userEvent.clear(startInput);
		await userEvent.type(startInput, '2025-10-25T15:00');

		await userEvent.clear(endInput);
		await userEvent.type(endInput, '2025-10-25T16:00');

		// 5. Click save
		const saveBtn = screen.getByText('Save Changes');
		await userEvent.click(saveBtn);

		// 6. Verify:
		// - Modal closed
		// - Block updated in DB
		// - Calendar event updated
		// - UI shows new time

		const updatedBlock = await getBlock(block.id);
		expect(updatedBlock.start_time).toBe('2025-10-25T15:00:00Z');

		const calendarEvent = await getCalendarEvent(updatedBlock.calendar_event_id);
		expect(calendarEvent.start.dateTime).toBe('2025-10-25T15:00:00-04:00');
	});
});
```

---

## 9. Implementation Gotchas to Avoid

### 9.1 Datetime-Local Timezone Pitfall

❌ **Don't**: Assume `datetime-local` value is UTC
✅ **Do**: Treat as local time in the block's selected timezone

### 9.2 Timezone Display Inconsistency

❌ **Don't**: Show time in browser timezone while saying it's the block timezone
✅ **Do**: Always show time as it would appear in the block's timezone

### 9.3 Form State Persistence

❌ **Don't**: Leave form data in state after exiting edit mode
✅ **Do**: Clear form data when exiting to prevent memory leaks and confusion

### 9.4 Error Message Stickiness

❌ **Don't**: Keep old validation errors when moving to save error
✅ **Do**: Clear validation errors when showing save errors

### 9.5 Suggestion Regeneration Cost

❌ **Don't**: Auto-regenerate on every time change (costs money)
✅ **Do**: Make it explicit checkbox for user control

### 9.6 Calendar Sync Failure Handling

❌ **Don't**: Fail the entire operation if calendar update fails
✅ **Do**: Update DB successfully, mark calendar as pending retry

---

## 10. Code Organization Plan

```
TimeBlockDetailModal.svelte
├─ Script section (logic)
│  ├─ Imports
│  ├─ Props definition
│  ├─ State variables
│  ├─ Utility functions
│  │  ├─ formatDateTimeForInput()
│  │  ├─ parseDateTime()
│  │  ├─ validateForm()
│  │  └─ toggleEditMode/exitEditMode()
│  ├─ Event handlers
│  │  ├─ handleSaveChanges()
│  │  └─ handleCancel()
│  └─ Effects
│     └─ Validation reactivity
│
├─ Markup section
│  ├─ View mode (original)
│  ├─ Edit mode (new)
│  ├─ Error display
│  └─ Loading states
│
└─ Style section (add as needed)
```

---

## 11. Component Dependencies

```
TimeBlockDetailModal.svelte
├─ Depends on:
│  ├─ Modal.svelte (wrapper)
│  ├─ TimeBlockWithProject type
│  ├─ UpdateTimeBlockParams type
│  └─ Intl API (for timezone formatting)
│
└─ Parent component provides:
   ├─ block data
   ├─ onUpdate callback
   ├─ onClose callback
   └─ onDelete callback
```

---

## 12. Performance Considerations

### 12.1 Validation Debouncing

```typescript
// Debounce validation to prevent excessive checks
let validationDebounceTimer: NodeJS.Timeout;

$effect(() => {
	if (isEditMode && editFormData.start_time && editFormData.end_time) {
		clearTimeout(validationDebounceTimer);
		validationDebounceTimer = setTimeout(() => {
			validationErrors = validateForm();
		}, 300); // 300ms debounce
	}
});
```

### 12.2 Timezone List Caching

- Load timezone list once
- Don't recreate on every render
- Consider importing from shared const

### 12.3 Intl API Caching

- `Intl.DateTimeFormat` is relatively expensive
- Could cache formatter objects
- Not critical for small forms but good practice

---

## 13. Ready to Implement Checklist

Before starting code:

- [ ] Review current TimeBlockDetailModal structure
- [ ] Understand existing styling (dark mode, Tailwind classes)
- [ ] Locate existing form components for styling reference
- [ ] Plan error message placement and styling
- [ ] Prepare timezone list or import location
- [ ] Confirm test framework setup (Vitest)
- [ ] Review example of datetime-local handling in codebase (if exists)
