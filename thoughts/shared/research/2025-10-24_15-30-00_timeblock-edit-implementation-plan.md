---
date: 2025-10-24T15:30:00.000Z
researcher: Claude Code
topic: 'Time Block Edit Feature - Implementation Plan with TaskModal Pattern'
tags: [implementation, design-decisions, patterns]
status: in-progress
---

# Time Block Edit Implementation - Ultrathinking & Plan

## 🎯 KEY INSIGHT: TaskModal Already Solves This!

The TaskModal component (lines 193-254) demonstrates the **exact pattern** we need:

```typescript
// TaskModal's date/time utility functions (COPY-PASTE READY!)
function formatDateTimeForInput(date: Date | string | null): string {
	if (!date) return '';
	try {
		const dateObj = typeof date === 'string' ? new Date(date) : date;
		if (isNaN(dateObj.getTime())) return '';
		// Format for HTML datetime-local input
		return format(dateObj, "yyyy-MM-dd'T'HH:mm");
	} catch (error) {
		console.warn('Failed to format datetime for input:', date, error);
		return '';
	}
}

function parseDateTimeFromInput(value: string): string | null {
	if (!value) return null;
	try {
		// The datetime-local input gives us a value in local time
		// Just create a date directly from it
		const date = new Date(value);
		if (isNaN(date.getTime())) return null;
		// Convert to ISO string for storage (UTC)
		return date.toISOString();
	} catch (error) {
		console.warn('Failed to parse datetime from input:', value, error);
		return null;
	}
}
```

## 🎓 Why TaskModal's Approach Works for TimeBlock

TaskModal uses `date-fns` library which is already in the project. Its pattern is:

1. **Store dates as UTC** in database (Supabase TIMESTAMPTZ)
2. **JavaScript Date handles UTC ↔ local conversion automatically**
3. **No manual UTC manipulation needed**
4. **Browser timezone transparency** - JavaScript Date just works

**Critical Comments in TaskModal (lines 5-10)**:

```
Simplified timezone approach:
- All dates stored as UTC in database (Supabase timestamptz)
- Display all dates/times in browser's local timezone
- JavaScript Date handles UTC↔local conversion automatically
- No manual UTC manipulation needed
```

This is EXACTLY what TimeBlocks uses too! We can follow the same pattern.

## 🔄 TimeBlock Timezone Difference

TimeBlocks have ONE extra field: `timezone` stored in database.

**Why?**

- TimeBlocks are scheduled focus sessions tied to a project
- User might want explicit timezone control
- When time changes, timezone should stay the same (unless user changes it)

**How to handle it**:

- Keep timezone field visible (optional)
- If user doesn't change it, use existing block.timezone
- If user changes it, update it
- Always display times as they would appear in THAT timezone

**Implementation**:

```typescript
// Time blocks store timezone explicitly
let timezoneValue = $state(block.timezone || 'America/New_York');

// When saving, pass it through
await onUpdate({
	start_time: parseDateTimeFromInput(startDateValue),
	end_time: parseDateTimeFromInput(endDateValue),
	timezone: timezoneValue, // User's choice, or existing
	regenerate_suggestions: regenerateSuggestionsChecked
});
```

## 📐 Implementation Architecture

### Current TimeBlockDetailModal Structure

```
Modal
├─ Content
│  ├─ Type badges
│  ├─ Date/Time display (read-only)
│  ├─ Calendar link
│  ├─ Suggestions
│  └─ Summary
└─ Footer
   ├─ Delete button
   └─ Close button
```

### New TimeBlockDetailModal Structure

```
Modal
├─ Header (+ Edit button NEW)
├─ Content
│  {#if isEditMode}
│    ├─ Error banner
│    ├─ Form fields:
│    │  ├─ Start date/time input (datetime-local)
│    │  ├─ End date/time input (datetime-local)
│    │  ├─ Timezone selector (select dropdown)
│    │  └─ Regenerate checkbox
│    └─ Duration display (calculated)
│  {:else}
│    ├─ Type badges
│    ├─ Date/Time display
│    ├─ Calendar link
│    ├─ Suggestions
│    └─ Summary
│  {/if}
└─ Footer
   {#if isEditMode}
     ├─ Save button (disabled if errors)
     └─ Cancel button
   {:else}
     ├─ Delete button
     └─ Close button
   {/if}
```

## 📝 Implementation Steps (Detailed)

### Step 1: Add State Variables (5 min)

```typescript
// Edit mode
let isEditMode = $state(false);
let isSaving = $state(false);

// Form data
let editFormData = $state({
	start_time: '',
	end_time: '',
	timezone: '',
	regenerate_suggestions: false
});

// Errors
let validationErrors = $state<string[]>([]);
let saveError = $state<string | null>(null);
```

### Step 2: Add Date/Time Utilities (Copy-paste from TaskModal) (2 min)

```typescript
// Import date-fns format at top
import { format } from 'date-fns';

// Copy formatDateTimeForInput and parseDateTimeFromInput
// from TaskModal exactly (lines 193-254)
```

### Step 3: Add Helper Functions (10 min)

```typescript
// Enter edit mode with form initialization
function enterEditMode() {
	editFormData = {
		start_time: formatDateTimeForInput(block.start_time),
		end_time: formatDateTimeForInput(block.end_time),
		timezone: block.timezone || 'America/New_York',
		regenerate_suggestions: false
	};
	validationErrors = [];
	saveError = null;
	isEditMode = true;
}

// Exit edit mode and cleanup
function exitEditMode() {
	isEditMode = false;
	validationErrors = [];
	saveError = null;
	editFormData = {
		start_time: '',
		end_time: '',
		timezone: '',
		regenerate_suggestions: false
	};
}

// Validate form in real-time
function validateForm(): string[] {
	const errors: string[] = [];
	if (!editFormData.start_time || !editFormData.end_time) {
		return errors; // Still typing
	}

	try {
		const start = new Date(editFormData.start_time);
		const end = new Date(editFormData.end_time);

		if (isNaN(start.getTime()) || isNaN(end.getTime())) {
			errors.push('Invalid date format');
			return errors;
		}

		const durationMs = end.getTime() - start.getTime();
		const durationMin = durationMs / (1000 * 60);

		if (durationMin < 15) {
			errors.push('Time block must be at least 15 minutes');
		}
		if (durationMin > 600) {
			errors.push('Time block cannot exceed 600 minutes (10 hours)');
		}
		if (end <= start) {
			errors.push('End time must be after start time');
		}
	} catch (e) {
		errors.push('Invalid date or time');
	}

	return errors;
}

// Handle save
async function handleSaveChanges() {
	const errors = validateForm();
	if (errors.length > 0) {
		validationErrors = errors;
		return;
	}

	isSaving = true;
	saveError = null;

	try {
		const start = new Date(editFormData.start_time);
		const end = new Date(editFormData.end_time);

		if (onUpdate) {
			await onUpdate({
				start_time: start,
				end_time: end,
				timezone: editFormData.timezone,
				regenerate_suggestions: editFormData.regenerate_suggestions
			});
		}

		exitEditMode();
	} catch (error) {
		saveError = error instanceof Error ? error.message : 'Failed to save';
	} finally {
		isSaving = false;
	}
}
```

### Step 4: Add Real-Time Validation Effect (3 min)

```typescript
// Debounced validation
$effect(() => {
	if (isEditMode && editFormData.start_time && editFormData.end_time) {
		validationErrors = validateForm();
	}
});
```

### Step 5: Update Props (1 min)

```typescript
let {
	block,
	isRegenerating = false,
	onClose,
	onDelete,
	onRegenerate,
	onUpdate // NEW
}: {
	block: TimeBlockWithProject;
	isRegenerating?: boolean;
	onClose: () => void;
	onDelete: () => void;
	onRegenerate: () => void;
	onUpdate?: (params: any) => Promise<void>; // NEW
} = $props();
```

### Step 6: Add Edit Header Section (20 min)

In the header (before date/time display), add:

```svelte
{#if !isEditMode}
	<button type="button" class="... edit button styling ..." onclick={enterEditMode}>
		<svg>...</svg>
		<span>Edit Times</span>
	</button>
{/if}
```

### Step 7: Add Edit Form UI (30 min)

Wrap current display in conditional, add edit form:

```svelte
{#if isEditMode}
	<!-- Error banner -->
	{#if validationErrors.length > 0 || saveError}
		<div class="... error styling ...">
			{#each validationErrors as error}
				<p>{error}</p>
			{/each}
			{#if saveError}
				<p class="text-red-600">{saveError}</p>
			{/if}
		</div>
	{/if}

	<!-- Start date/time input -->
	<input type="datetime-local" bind:value={editFormData.start_time} class="..." />

	<!-- End date/time input -->
	<input type="datetime-local" bind:value={editFormData.end_time} class="..." />

	<!-- Timezone selector -->
	<select bind:value={editFormData.timezone} class="...">
		<option value="America/New_York">America/New_York</option>
		<!-- ... more timezones ... -->
	</select>

	<!-- Regenerate checkbox -->
	<label>
		<input type="checkbox" bind:checked={editFormData.regenerate_suggestions} />
		Regenerate AI suggestions
	</label>

	<!-- Duration display (calculated) -->
	<div class="... duration display ...">
		Duration: {calculateDuration(editFormData.start_time, editFormData.end_time)} minutes
	</div>
{:else}
	<!-- Current read-only display (existing code) -->
{/if}
```

### Step 8: Update Footer Buttons (10 min)

```svelte
<div slot="footer">
	{#if isEditMode}
		<button onclick={handleSaveChanges} disabled={validationErrors.length > 0 || isSaving}>
			{#if isSaving}Saving...{:else}Save Changes{/if}
		</button>
		<button onclick={() => exitEditMode()}>Cancel</button>
	{:else}
		<!-- Existing delete and close buttons -->
	{/if}
</div>
```

### Step 9: Import date-fns at Top (1 min)

```typescript
import { format } from 'date-fns';
```

### Step 10: Create Common Timezones List (2 min)

```typescript
const TIMEZONES = [
	'America/New_York',
	'America/Chicago',
	'America/Denver',
	'America/Los_Angeles',
	'Europe/London',
	'Europe/Paris',
	'Asia/Tokyo',
	'Australia/Sydney'
];
```

## 💡 Key Insights Ultrathinking

### Why This Works So Well

1. **No Reinventing the Wheel**
    - TaskModal already solved datetime-local handling
    - Using `date-fns` format() for reliable formatting
    - Proven pattern in production codebase

2. **Timezone Simplicity**
    - TimeBlocks already store timezone field
    - No need for complex Intl API manipulation
    - Just keep user's choice or use existing

3. **Validation Strategy**
    - Real-time validation in $effect
    - Server-side validation happens in TimeBlockService
    - Debouncing not needed (no API calls on keystroke)

4. **Error Recovery**
    - Form stays open on error
    - User can read error message and adjust
    - All data preserved

5. **Calendar Sync Already Works**
    - TimeBlockService.updateTimeBlock() handles it
    - We just pass parameters
    - No special handling needed

### Critical Differences from Ultrathinking Doc

**Original Ultrathinking said**: Need complex Intl API, debouncing, timezone handling

**Actually**: TaskModal shows it's much simpler:

- `new Date(datetime-local-string)` → already handles browser timezone
- `date.toISOString()` → converts to UTC automatically
- No manual manipulation needed!

### Testing Strategy (Ultrathinking)

**What to Test**:

1. ✅ Edit button appears and works
2. ✅ Form loads with correct times
3. ✅ Validation works (< 15 min, > 600 min)
4. ✅ Save calls onUpdate with correct params
5. ✅ Calendar syncs with new times
6. ✅ Timezone is preserved/updated
7. ✅ Error messages display and allow retry
8. ✅ Cancel button restores view mode

**No Need to Test** (already covered by service):

- Conflict detection (service does it)
- Google Calendar sync (service does it)
- Suggestion regeneration (service does it)

## 🚀 Estimated Time Breakdown

| Step                 | Time       | Total        |
| -------------------- | ---------- | ------------ |
| 1. Add state         | 5 min      | 5 min        |
| 2. Copy utilities    | 2 min      | 7 min        |
| 3. Helper functions  | 10 min     | 17 min       |
| 4. Validation effect | 3 min      | 20 min       |
| 5. Update props      | 1 min      | 21 min       |
| 6. Edit button       | 5 min      | 26 min       |
| 7. Form UI           | 30 min     | 56 min       |
| 8. Footer buttons    | 10 min     | 66 min       |
| 9. Import date-fns   | 1 min      | 67 min       |
| 10. Timezone list    | 2 min      | 69 min       |
| **Testing**          | **30 min** | **99 min**   |
| **TOTAL**            |            | **~2 hours** |

## 🎯 Implementation Order

1. **Copy utilities from TaskModal** ← Start here
2. **Add state variables**
3. **Add helper functions**
4. **Add validation effect**
5. **Update component props**
6. **Add edit button** ← First visible change
7. **Add form UI**
8. **Update footer**
9. **Test everything**

## 🧪 Quick Manual Testing Checklist

```
[ ] Click Edit button - form appears
[ ] Start time shows current block start time
[ ] End time shows current block end time
[ ] Timezone shows current block timezone
[ ] Change start time - error clears if valid duration
[ ] Change end time - error clears if valid duration
[ ] Try to save with < 15 min - error shows
[ ] Try to save with > 600 min - error shows
[ ] Save valid changes - modal closes
[ ] Refresh page - time block has new times
[ ] Check Google Calendar - event updated
[ ] Cancel edit - modal returns to view mode
[ ] Check error message when save fails (use dev tools to mock error)
```

---

## Summary

The solution is **much simpler than ultrathinking indicated** because:

1. ✅ Date/time handling already solved in TaskModal
2. ✅ Timezone handling is simple (browser + explicit field)
3. ✅ Service handles all business logic (validation, conflicts, calendar)
4. ✅ Component just needs basic form UI

**Estimated implementation: 2 hours including testing**

Ready to implement!
