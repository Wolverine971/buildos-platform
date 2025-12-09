---
date: 2025-10-24T14:30:00.000Z
researcher: Claude Code
git_commit: 1bebb2b
branch: main
repository: buildos-platform
topic: 'Time Block Adjustment Feature - Complete Specification'
tags: [spec, time-blocks, calendar-integration, features]
status: complete
last_updated: 2025-10-24
last_updated_by: Claude Code
path: thoughts/shared/research/2025-10-24_14-30-00_timeblock-adjustment-feature-spec.md
---

# Feature Specification: Time Block Date/Time Adjustment with Google Calendar Sync

**Date**: 2025-10-24
**Researcher**: Claude Code
**Git Commit**: 1bebb2b
**Branch**: main
**Repository**: buildos-platform

---

## Executive Summary

This specification outlines the implementation of a time block adjustment feature that allows users to change the start/end times of existing time blocks directly in the TimeBlockDetailModal component, with bidirectional synchronization to Google Calendar.

### Key Features

- ✅ Adjust start and end times in the detail modal
- ✅ Automatic Google Calendar event updates
- ✅ Conflict detection to prevent overlapping blocks
- ✅ Optional suggestion regeneration on time changes
- ✅ Timezone awareness and preservation
- ✅ Sync loop prevention (app vs. calendar changes)
- ✅ Rollback on error with user feedback

---

## 1. Current State Analysis

### 1.1 TimeBlockDetailModal Component

**File**: `apps/web/src/lib/components/time-blocks/TimeBlockDetailModal.svelte` (lines 1-402)

#### Current Capabilities

- Display time block details (read-only)
- Show date, time, duration, and timezone
- Display Google Calendar link
- Show/regenerate AI suggestions
- Delete time block with confirmation

#### Limitations

- **NO EDIT FUNCTIONALITY** - All times displayed are read-only
- Cannot modify start/end times
- Cannot change block type or project association
- Cannot adjust timezone

#### Current Props

```typescript
block: TimeBlockWithProject;
isRegenerating?: boolean;
onClose: () => void;
onDelete: () => void;
onRegenerate: () => void;
```

### 1.2 Time Block Service Capabilities

**File**: `apps/web/src/lib/services/time-block.service.ts` (lines 340-537)

#### Existing Update Method

```typescript
async updateTimeBlock(
  blockId: string,
  params: UpdateTimeBlockParams
): Promise<TimeBlockWithProject>
```

**UpdateTimeBlockParams Interface**:

```typescript
{
  block_type?: TimeBlockType;           // 'project' | 'build'
  project_id?: string | null;           // Optional
  start_time?: Date;                    // ISO string converted to Date
  end_time?: Date;                      // ISO string converted to Date
  timezone?: string;                    // Optional, defaults to user's
  regenerate_suggestions?: boolean;     // Force AI regeneration
}
```

#### What Already Works

✅ **Update Validation**

- Duration validation: 15-600 minutes
- Date validation: end_time > start_time
- Conflict detection: Prevents overlapping blocks
- Block deletion detection: Cannot update deleted blocks

✅ **Google Calendar Sync**

- Updates existing calendar event automatically
- Preserves calendar_event_id across updates
- Updates timezone for calendar event
- Syncs new times to calendar

✅ **Database Updates**

- Updates: `start_time`, `end_time`, `duration_minutes`, `timezone`
- Tracks: `sync_source = 'app'`, `sync_status = 'synced'`
- Timestamps: `updated_at`, `last_synced_at`
- Suggestions: Auto-regenerated if enabled

✅ **Suggestion Management**

- Auto-regenerates if time/project changed
- Can force regeneration with `regenerate_suggestions: true`
- Updates `ai_suggestions`, `suggestions_state`, `suggestions_generated_at`

### 1.3 Google Calendar Integration

**File**: `apps/web/src/lib/services/calendar-service.ts` (lines 839-1062)

#### Update Method

```typescript
async updateCalendarEvent(
  userId: string,
  params: UpdateCalendarEventParams
): Promise<UpdateCalendarEventResponse>
```

**What Works**
✅ Update single calendar event
✅ Update time/date via `start_time` and `end_time`
✅ Update timezone
✅ Update description (includes AI suggestions)
✅ Support for recurring events with `update_scope`
✅ Error handling with Google API

### 1.4 Webhook Sync (Bidirectional)

**File**: `apps/web/src/lib/services/calendar-webhook-service.ts` (lines 961-1022)

#### Sync Loop Prevention

```typescript
const SYNC_LOOP_PREVENTION_WINDOW = 5 * 60 * 1000; // 5 minutes

// Skip if this is our own app-initiated change echoing back
if (timeBlock.sync_source === 'app' &&
    timeBlock.updated_at > (now - 5 minutes)) {
  continue;  // Don't process our own changes
}
```

**How It Works**

- Google webhook notifies of calendar changes
- Sync source tracked: `'app'` (BuildOS) vs `'google'` (Calendar)
- 5-minute prevention window avoids processing our own updates
- Time blocks sync back from calendar: times, deletions, etc.

---

## 2. Feature Requirements

### 2.1 User Interaction Flow

```
User opens TimeBlockDetailModal
    ↓
Sees time block details (date, time, duration)
    ↓
User clicks "Edit" button (NEW)
    ↓
Edit mode activates (enables form fields)
    ↓
User modifies:
  - Start date/time (DateTimeInput component)
  - End date/time (DateTimeInput component)
  - Timezone (optional selector)
  - Regenerate suggestions checkbox (optional)
    ↓
User clicks "Save Changes"
    ↓
System validates:
  - Duration 15-600 minutes
  - End time > Start time
  - No time block conflicts
  - Block not already deleted
    ↓
System updates:
  - Database time_blocks table
  - Google Calendar event
  - AI suggestions (if time changed)
    ↓
Modal closes with success message
User sees updated time block in calendar
```

### 2.2 Functional Requirements

#### F1: Time Adjustment UI

- **Location**: TimeBlockDetailModal.svelte (edit section)
- **Fields**:
    - Start Date/Time input (with datetime-local type)
    - End Date/Time input (with datetime-local type)
    - Timezone selector (optional)
    - "Regenerate Suggestions" checkbox
    - Save button
    - Cancel button

- **Validation Display**:
    - Show error if duration < 15 min
    - Show error if duration > 600 min
    - Show error if end time <= start time
    - Show error if block conflicts with existing block
    - Show error if time block is deleted

#### F2: Data Submission

- **Endpoint**: PATCH `/api/time-blocks/blocks/[id]`
- **Payload**:
    ```typescript
    {
      start_time: "2025-10-25T14:00:00Z",    // ISO string
      end_time: "2025-10-25T15:30:00Z",      // ISO string
      timezone: "America/New_York",          // Optional, keeps existing if not provided
      regenerate_suggestions: true           // Optional
    }
    ```
- **Response**:
    ```typescript
    {
      success: true,
      data: {
        time_block: TimeBlockWithProject  // Updated block with new times
      }
    }
    ```

#### F3: Validation & Conflict Detection

- **Duration Check**: MIN_DURATION_MINUTES (15) to MAX_DURATION_MINUTES (600)
- **Time Range Check**: end_time must be > start_time
- **Conflict Detection**: Check against other blocks (excluding current block)
- **Block State Check**: Cannot update blocks with sync_status = 'deleted'

#### F4: Google Calendar Synchronization

- **Auto-sync**: All time changes automatically update Google Calendar event
- **Timezone Handling**: Update timezone in calendar event if changed
- **Event Link**: calendar_event_link preserved (only ID used for update)
- **Sync Tracking**: Set sync_source = 'app' and sync_status = 'synced'
- **Error Handling**: Partial failure (calendar update fails) should log but not prevent DB update

#### F5: AI Suggestion Regeneration

- **Auto-regenerate**: If time/project/type changed AND suggestions exist
- **Manual Trigger**: User can force regeneration with checkbox
- **State Management**: suggestions_state updated during generation
- **Async Processing**: Use existing suggestion service (non-blocking)

#### F6: Sync Loop Prevention

- **Detection**: Webhook receives change → checks sync_source
- **Prevention**: 5-minute window prevents echoing back our own changes
- **Fields Used**: time_blocks.sync_source, time_blocks.updated_at
- **Implementation**: Already in place in calendar-webhook-service.ts

#### F7: Timezone Preservation

- **Default**: User's existing block timezone (usually "America/New_York")
- **Optional Change**: User can update timezone if needed
- **Calendar Sync**: New timezone passed to Google Calendar API
- **Storage**: Stored in time_blocks.timezone field

---

## 3. Technical Implementation Plan

### 3.1 Component Modifications

#### File: `apps/web/src/lib/components/time-blocks/TimeBlockDetailModal.svelte`

**Changes Required**:

1. **Add State Variables**:

    ```typescript
    let isEditMode = $state(false);
    let editFormData = $state({
    	start_time: '',
    	end_time: '',
    	timezone: '',
    	regenerate_suggestions: false
    });
    let isSaving = $state(false);
    let errors = $state<string[]>([]);
    ```

2. **Add New Props**:

    ```typescript
    onUpdate?: (params: UpdateTimeBlockParams) => Promise<void>;
    ```

3. **Add Methods**:
    - `toggleEditMode()` - Toggle between view/edit
    - `validateTimes()` - Validate duration, date range
    - `handleSaveChanges()` - Submit update via onUpdate callback
    - `handleCancel()` - Cancel edit and reset form
    - `formatDateTimeForInput()` - Convert ISO to datetime-local format
    - `parseDateTimeFromInput()` - Convert datetime-local to ISO

4. **Add UI Elements**:
    - Edit button (header section)
    - Form fields (conditional on isEditMode)
    - Error messages
    - Loading spinner on save
    - Cancel/Save buttons

5. **Keep Existing Elements**:
    - View-only time display (when not editing)
    - Google Calendar link
    - Suggestions section
    - Delete button

**Key Considerations**:

- Preserve all existing functionality when not in edit mode
- Reuse time-range-selector component if available
- Match design system styling (dark mode support)
- Handle timezone parameter optionally (default to existing)

#### Component Integration Points

```typescript
// Parent component usage
<TimeBlockDetailModal
  {block}
  onClose={() => ...}
  onDelete={() => ...}
  onUpdate={async (params) => {
    await timeBlockService.updateTimeBlock(block.id, params);
    // Refresh block data
    await loadTimeBlocks();
  }}
/>
```

### 3.2 API Endpoint Verification

**File**: `apps/web/src/routes/api/time-blocks/blocks/[id]/+server.ts` (lines 8-55)

**Current Implementation**: Already exists and fully supports updates!

```typescript
export async function PATCH(event) {
	try {
		const { id } = event.params;
		const body = await parseRequestBody(event);

		// Validation and business logic
		const service = new TimeBlockService(userId);
		const updated = await service.updateTimeBlock(id, {
			start_time: new Date(body.start_time),
			end_time: new Date(body.end_time),
			timezone: body.timezone,
			regenerate_suggestions: body.regenerate_suggestions
		});

		return ApiResponse.success({ time_block: updated });
	} catch (error) {
		// Error handling
	}
}
```

**Status**: ✅ **NO CHANGES NEEDED** - Endpoint already fully functional

### 3.3 Service Layer

**File**: `apps/web/src/lib/services/time-block.service.ts`

**Current Implementation**: Already has `updateTimeBlock()` method (lines 340-537)

**Capabilities Already Implemented**:

- ✅ Partial parameter updates
- ✅ Duration validation
- ✅ Conflict detection (excluding current block)
- ✅ Google Calendar sync
- ✅ Suggestion regeneration
- ✅ Timezone handling
- ✅ Database updates with metadata tracking

**Status**: ✅ **NO CHANGES NEEDED** - Service fully supports updates

### 3.4 Database Schema

**File**: `apps/web/supabase/migrations/20251013_create_time_blocks_table.sql`

**Current Schema**: Already supports updates with all required fields

**Relevant Columns**:

- `start_time` TIMESTAMPTZ - Supports updates
- `end_time` TIMESTAMPTZ - Supports updates
- `duration_minutes` INTEGER - Auto-calculated on update
- `timezone` TEXT - Optional, supports updates
- `sync_source` TEXT - Tracks 'app' vs 'google'
- `sync_status` TEXT - 'synced', 'pending', 'failed', 'deleted'
- `updated_at` TIMESTAMPTZ - Auto-updated
- `last_synced_at` TIMESTAMPTZ - Updated on sync

**Status**: ✅ **NO CHANGES NEEDED** - Schema fully supports feature

### 3.5 Google Calendar Integration

**File**: `apps/web/src/lib/services/calendar-service.ts`

**Current Implementation**: Already has `updateCalendarEvent()` method (lines 839-1062)

**Capabilities**:

- ✅ Update existing calendar events
- ✅ Update time/date
- ✅ Update timezone
- ✅ Update description with suggestions
- ✅ Handle error scenarios
- ✅ Support recurring events

**Status**: ✅ **NO CHANGES NEEDED** - Service fully supports updates

### 3.6 Webhook Sync Prevention

**File**: `apps/web/src/lib/services/calendar-webhook-service.ts` (lines 961-1022)

**Current Implementation**: Already prevents sync loops

```typescript
// Sync loop prevention for timeblocks
const SYNC_LOOP_PREVENTION_WINDOW = 5 * 60 * 1000; // 5 minutes
if (timeBlock.sync_source === 'app' &&
    recent update detected) {
    // Skip - this is our own change echoing back
    continue;
}
```

**Status**: ✅ **NO CHANGES NEEDED** - Loop prevention already in place

---

## 4. Implementation Steps

### Phase 1: Component UI (Estimated: 4-6 hours)

#### Step 1.1: Add Edit Mode State

- Add `isEditMode`, `editFormData`, `isSaving`, `errors` state variables
- Add `onUpdate` prop for update callback
- Implement `toggleEditMode()` method

#### Step 1.2: Create Form Fields

- Add start date/time input (datetime-local type)
- Add end date/time input (datetime-local type)
- Add timezone selector (optional)
- Add "Regenerate suggestions" checkbox
- Add Save/Cancel buttons
- Add error message display

#### Step 1.3: Add Formatting Utilities

- `formatDateTimeForInput()` - Convert ISO timestamp to datetime-local
- `parseDateTime()` - Parse datetime-local values back to ISO
- Handle timezone display and input

#### Step 1.4: Implement Validation

- Check duration (15-600 minutes)
- Check end time > start time
- Display validation errors inline

#### Step 1.5: Add Save Functionality

- Implement `handleSaveChanges()` - Call onUpdate callback
- Show loading spinner during save
- Handle errors and display messages
- Close modal on success
- Reset form on cancel

#### Step 1.6: Styling & Layout

- Match existing dark mode design
- Use Tailwind classes for spacing/borders
- Ensure responsive layout
- Add icons (edit, save, cancel)

### Phase 2: Integration & Testing (Estimated: 2-3 hours)

#### Step 2.1: Connect to Service

- Import TimeBlockService in parent component
- Call `updateTimeBlock()` in onUpdate handler
- Pass callback to TimeBlockDetailModal

#### Step 2.2: Test Validation

- Test duration validation (15 min minimum, 600 min maximum)
- Test end time validation (must be after start time)
- Test conflict detection (overlapping blocks)
- Test with deleted blocks

#### Step 2.3: Test Calendar Sync

- Verify calendar event updates with new times
- Verify timezone updates in calendar
- Verify calendar_event_link preserved
- Test error handling (calendar sync failure)

#### Step 2.4: Test Suggestion Regeneration

- Verify suggestions regenerate when time changes
- Test with regenerate_suggestions checkbox
- Verify suggestions update in modal after save

#### Step 2.5: End-to-End Testing

- Create time block → Edit times → Verify calendar
- Edit conflicting times → Verify error
- Edit with suggestion regeneration → Verify suggestions update
- Edit timezone → Verify calendar timezone updated

### Phase 3: Polish & Refinement (Estimated: 1-2 hours)

#### Step 3.1: UX Improvements

- Add loading states during save
- Smooth transitions between edit/view modes
- Preserve scroll position
- Add success message/toast

#### Step 3.2: Error Handling

- User-friendly error messages
- Suggest fixes for conflicts (e.g., "Block conflicts with 2:00 PM meeting")
- Allow recovery from partial failures

#### Step 3.3: Accessibility

- Proper ARIA labels for form inputs
- Keyboard navigation support
- Error announcements for screen readers

#### Step 3.4: Performance

- Debounce validation checks
- Optimize re-renders
- Cache timezone list

---

## 5. Data Flow Diagram

```
User clicks "Edit" in TimeBlockDetailModal
    ↓
isEditMode = true
    ↓
Render editable form fields:
  - Start date/time input (value from block.start_time)
  - End date/time input (value from block.end_time)
  - Timezone input (value from block.timezone)
  - Regenerate suggestions checkbox
    ↓
User modifies values
    ↓
Real-time validation:
  - Duration check (15-600 min)
  - Time range check (end > start)
  - Conflict check (query DB)
  - Display errors inline
    ↓
User clicks "Save"
    ↓
isSaving = true (show spinner)
    ↓
Call onUpdate({
  start_time: new Date(input),
  end_time: new Date(input),
  timezone: input,
  regenerate_suggestions: checkbox
})
    ↓
API PATCH /api/time-blocks/blocks/[id]
    ↓
TimeBlockService.updateTimeBlock()
    ├─ Validate parameters
    ├─ Check conflicts
    ├─ Update database
    ├─ Sync to Google Calendar
    ├─ Regenerate suggestions if needed
    └─ Return updated block
    ↓
Modal closes
    ↓
Parent component refreshes time blocks list
    ↓
User sees updated time block with new times
```

---

## 6. Testing Strategy

### Unit Tests

#### TimeBlockDetailModal Component

```typescript
// Test edit mode toggle
- Renders view mode initially
- Shows edit button
- Toggles to edit mode on button click
- Shows form fields in edit mode
- Toggles back to view mode on cancel

// Test form validation
- Shows error if duration < 15 minutes
- Shows error if duration > 600 minutes
- Shows error if end time <= start time
- Shows error if block conflicts with existing block
- Disables save button when validation fails

// Test data formatting
- Correctly formats ISO timestamp to datetime-local
- Correctly parses datetime-local back to ISO
- Preserves timezone information

// Test save functionality
- Calls onUpdate with correct parameters
- Shows loading spinner during save
- Closes modal on success
- Shows error messages on failure
- Allows retry after error
```

#### Time Block Service (Integration Tests)

```typescript
// Test updateTimeBlock method
- Updates start_time and end_time
- Calculates duration correctly
- Updates timezone if provided
- Syncs to Google Calendar
- Regenerates suggestions if needed
- Sets sync_source = 'app'
- Sets sync_status = 'synced'
- Throws error for deleted blocks
- Throws error for invalid times
- Throws error for conflicting blocks
```

### Integration Tests

#### API Endpoint

```typescript
// Test PATCH /api/time-blocks/blocks/[id]
- Requires authentication
- Verifies block ownership
- Updates block in database
- Returns updated block with new times
- Returns error for invalid input
- Returns error for conflicts
- Returns error for deleted blocks
```

#### Calendar Sync

```typescript
// Test Google Calendar integration
- Creates calendar event with correct times
- Updates calendar event when time changes
- Updates timezone in calendar
- Handles calendar API errors gracefully
- Preserves calendar_event_id across updates
- Preserves calendar_event_link
```

#### Suggestion Regeneration

```typescript
// Test AI suggestion updates
- Regenerates suggestions when time changes
- Updates suggestions_state correctly
- Updates suggestions_generated_at
- Handles suggestion service errors
- Shows suggestions in modal after update
```

### End-to-End Tests

```typescript
// Complete user workflow
1. Create time block 10:00 AM - 11:00 AM
2. Open detail modal
3. Click edit
4. Change to 2:00 PM - 3:00 PM
5. Click save
6. Verify:
   - Modal closes
   - Time block shows new time
   - Calendar event updated
   - Sync status is synced
   - suggestions are regenerated (if enabled)

// Test conflict detection
1. Create two blocks:
   - Block A: 10:00 AM - 11:00 AM
   - Block B: 2:00 PM - 3:00 PM
2. Edit Block B to 10:30 AM - 11:30 AM
3. Verify conflict error
4. Change to 3:00 PM - 4:00 PM
5. Verify save succeeds

// Test sync from calendar
1. Create time block via BuildOS
2. Edit time in Google Calendar
3. Wait for webhook
4. Verify:
   - Time block updated in BuildOS
   - sync_source = 'google'
   - No infinite sync loop
```

---

## 7. Error Handling & Edge Cases

### 7.1 Validation Errors

| Error                 | Message                                             | Fix                    |
| --------------------- | --------------------------------------------------- | ---------------------- |
| Duration < 15 min     | "Time block must be at least 15 minutes"            | Increase duration      |
| Duration > 600 min    | "Time block cannot exceed 600 minutes (10 hours)"   | Decrease duration      |
| End time ≤ start time | "End time must be after start time"                 | Adjust times           |
| Conflicting block     | "Time block conflicts with another block at [time]" | Choose different time  |
| Deleted block         | "Cannot update deleted blocks"                      | N/A (hide edit option) |
| Invalid timezone      | "Invalid timezone selected"                         | Choose valid timezone  |

### 7.2 API/Calendar Errors

| Error            | Handling                       | Fallback                        |
| ---------------- | ------------------------------ | ------------------------------- |
| 401 Unauthorized | Re-auth required               | Show reauth prompt              |
| 403 Forbidden    | Permission denied              | Show error message              |
| 404 Not Found    | Block deleted remotely         | Close modal, reload             |
| 429 Rate Limited | Retry with backoff             | Retry in 5 seconds              |
| Google API error | Log and continue               | Update DB, mark as pending sync |
| Network timeout  | Retry with exponential backoff | Show retry button               |

### 7.3 Edge Cases

#### Case 1: Block Deleted While Editing

```typescript
// User opens edit modal for block A
// Meanwhile, another device deletes block A
// User clicks save

// Expected behavior:
// - API returns 400: "Cannot update deleted blocks"
// - Modal shows error message
// - User can close modal
```

#### Case 2: Calendar Event Already Deleted

```typescript
// Time block exists in BuildOS
// Calendar event was deleted in Google Calendar
// User edits time block

// Expected behavior:
// - TimeBlockService.updateTimeBlock() returns error
// - Optional: Recreate calendar event automatically
// - Mark sync_status as 'pending' and retry
```

#### Case 3: Suggestion Generation Fails

```typescript
// User edits time block with "Regenerate suggestions" checked
// AI suggestion service is down

// Expected behavior:
// - Time block updates successfully
// - Suggestions fail silently (or show error toast)
// - suggestions_state marked as 'failed'
// - User can retry regeneration manually later
```

#### Case 4: Concurrent Edits

```typescript
// User A edits block from 10-11 AM
// User B edits same block from 2-3 PM
// A saves first, B saves second

// Expected behavior:
// - A's update succeeds
// - B's update succeeds (last-write-wins)
// - final_time_block shows 2-3 PM
// - Both generate calendar events at 2-3 PM
```

#### Case 5: Timezone Change

```typescript
// User in New York (EST) creates 10:00 AM block
// Changes timezone to Pacific (PST)
// Saves block

// Expected behavior:
// - start_time remains 10:00 AM EST (unchanged)
// - timezone field updated to PST
// - calendar event updated with new timezone
// - UI shows time relative to new timezone
```

---

## 8. Configuration & Constants

### Constants to Define

```typescript
// In time-block.service.ts or constants file
export const TIME_BLOCK_CONFIG = {
	MIN_DURATION_MINUTES: 15,
	MAX_DURATION_MINUTES: 600,
	DEFAULT_TIMEZONE: 'America/New_York',
	SYNC_LOOP_PREVENTION_WINDOW_MS: 5 * 60 * 1000, // 5 minutes
	CONFLICT_CHECK_BUFFER_MS: 0, // No buffer between blocks
	SUGGESTION_REGENERATE_DEBOUNCE_MS: 500
};
```

### Error Messages

```typescript
export const TIME_BLOCK_ERRORS = {
	DURATION_TOO_SHORT: 'Time block must be at least 15 minutes',
	DURATION_TOO_LONG: 'Time block cannot exceed 600 minutes (10 hours)',
	INVALID_TIME_RANGE: 'End time must be after start time',
	CONFLICTING_BLOCK: 'Time block conflicts with another block',
	BLOCK_DELETED: 'Cannot update deleted blocks',
	INVALID_TIMEZONE: 'Invalid timezone selected',
	CALENDAR_SYNC_FAILED: 'Failed to sync changes to Google Calendar',
	SAVE_FAILED: 'Failed to save time block changes'
};
```

---

## 9. UI/UX Specifications

### 9.1 Edit Mode Appearance

```
┌─────────────────────────────────────────┐
│  TIME BLOCK DETAIL MODAL                │
├─────────────────────────────────────────┤
│                                         │
│  ☐ Project Focus   ☐ Flexible Time    │
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ 📅 Date & Time                      ││
│  │                                      ││
│  │ [Edit] Start Date/Time               ││
│  │ ─────────────────────────────────────││
│  │ Start: [2025-10-25 14:00] ↓          ││
│  │                                      ││
│  │ [Edit] End Date/Time                 ││
│  │ ─────────────────────────────────────││
│  │ End:   [2025-10-25 15:30] ↓          ││
│  │                                      ││
│  │ [Edit] Timezone                      ││
│  │ ─────────────────────────────────────││
│  │ Timezone: [America/New_York] ↓       ││
│  │                                      ││
│  │ ☑ Regenerate Suggestions              ││
│  │ (Check to regenerate AI suggestions)  ││
│  │                                      ││
│  │ Duration: 1 hour 30 minutes          ││
│  │                                      ││
│  └─────────────────────────────────────┘│
│                                         │
│  ✓ Save Changes        ✕ Cancel         │
│                                         │
└─────────────────────────────────────────┘
```

### 9.2 Error Display

```
┌─────────────────────────────────────────┐
│ ⚠️ Time block must be at least 15 min   │
│ ⚠️ End time must be after start time     │
└─────────────────────────────────────────┘
```

### 9.3 Loading State

```
[💾 Saving Changes...]  ✕ Cancel
```

### 9.4 Success State

```
"Time block updated successfully"
Modal auto-closes after 2 seconds
```

---

## 10. Performance Considerations

### 10.1 Optimization Opportunities

1. **Debounce Validation Checks**
    - Don't check conflicts on every keystroke
    - Debounce for 500ms after user stops typing

2. **Local Validation First**
    - Check duration/time range before API call
    - Only call API for conflict check

3. **Batch Calendar Updates**
    - If multiple blocks updated, consider batch update
    - Currently single-block is fine for MVP

4. **Timezone Caching**
    - Cache timezone list (rarely changes)
    - Load on modal open, not every render

### 10.2 Database Performance

- **Index**: Already exists on `(user_id, start_time, end_time)`
- **Conflict Query**: O(log n) with index
- **Update**: Single row, no full table scan

---

## 11. Implementation Checklist

### Pre-Development

- [ ] Review this specification with team
- [ ] Discuss timezone handling approach
- [ ] Confirm error message wording
- [ ] Plan UI/UX design mockups

### Development Phase

- [ ] Add state variables to TimeBlockDetailModal
- [ ] Create edit form UI with inputs
- [ ] Implement date/time formatting utilities
- [ ] Add validation logic with error display
- [ ] Implement save functionality
- [ ] Add loading states and error handling
- [ ] Test all validation scenarios
- [ ] Test API integration
- [ ] Test Google Calendar sync
- [ ] Test suggestion regeneration

### Testing Phase

- [ ] Unit tests for component
- [ ] Unit tests for service
- [ ] Integration tests for API
- [ ] End-to-end tests
- [ ] Manual testing in dev environment
- [ ] Manual testing in staging
- [ ] Test on mobile devices
- [ ] Test dark mode
- [ ] Test error scenarios

### Pre-Deployment

- [ ] Code review
- [ ] Type checking passes
- [ ] Linting passes
- [ ] All tests pass
- [ ] Documentation updated
- [ ] No breaking changes
- [ ] Backward compatible

### Post-Deployment

- [ ] Monitor error logs
- [ ] Verify calendar sync works
- [ ] Gather user feedback
- [ ] Monitor performance metrics

---

## 12. Future Enhancements (Out of Scope)

- **Recurring Time Blocks**: Ability to create repeating time blocks
- **Bulk Edit**: Edit multiple time blocks at once
- **Time Block Templates**: Save and reuse time block patterns
- **Smart Scheduling**: AI-suggested optimal times based on calendar
- **Calendar Conflict Resolution**: Smart suggestions when Google Calendar conflicts detected
- **Multi-timezone Support**: Show time in multiple timezones
- **Block Locking**: Prevent accidental edits to important blocks

---

## 13. Related Documentation

### Existing Services & Components

- `TimeBlockService`: `apps/web/src/lib/services/time-block.service.ts`
- `CalendarService`: `apps/web/src/lib/services/calendar-service.ts`
- `CalendarWebhookService`: `apps/web/src/lib/services/calendar-webhook-service.ts`
- `TimeBlockDetailModal`: `apps/web/src/lib/components/time-blocks/TimeBlockDetailModal.svelte`
- `TimeRangeSelector`: `apps/web/src/lib/components/time-blocks/TimeRangeSelector.svelte` (reference for date/time inputs)
- `FormModal`: `apps/web/src/lib/components/ui/FormModal.svelte` (reference for form patterns)

### Architecture Documentation

- **Web-Worker Architecture**: `/docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md`
- **Queue System**: `/docs/architecture/diagrams/QUEUE-SYSTEM-FLOW.md`
- **Calendar Integration**: `/docs/integrations/calendar/`
- **API Reference**: `/apps/web/docs/technical/api/`
- **Database Schema**: `/apps/web/docs/technical/database/schema.md`

### Time Block Documentation

- **Brain Dump Processing**: `/apps/web/docs/features/brain-dump/`
- **Time Blocks Feature**: `/apps/web/docs/features/time-blocks/` (create if doesn't exist)
- **Notification System**: `/apps/web/docs/features/notifications/`

---

## 14. Appendix: Code Examples

### 14.1 Example: Update Service Call

```typescript
// From parent component
async function handleUpdateTimeBlock(params: UpdateTimeBlockParams) {
	try {
		const updated = await timeBlockService.updateTimeBlock(block.id, {
			start_time: new Date(params.start_time),
			end_time: new Date(params.end_time),
			timezone: params.timezone,
			regenerate_suggestions: params.regenerate_suggestions
		});

		// Refresh time blocks in parent component
		await loadTimeBlocks();

		// Show success toast
		showToast('Time block updated successfully', 'success');
	} catch (error) {
		console.error('Failed to update time block:', error);
		throw error; // Modal will catch and display
	}
}
```

### 14.2 Example: Form Validation

```typescript
function validateChanges(): string[] {
	const errors: string[] = [];
	const start = new Date(editFormData.start_time);
	const end = new Date(editFormData.end_time);

	// Duration check
	const duration = (end.getTime() - start.getTime()) / (1000 * 60);
	if (duration < 15) {
		errors.push('Time block must be at least 15 minutes');
	}
	if (duration > 600) {
		errors.push('Time block cannot exceed 600 minutes');
	}

	// Time range check
	if (end <= start) {
		errors.push('End time must be after start time');
	}

	return errors;
}
```

### 14.3 Example: Date/Time Formatting

```typescript
// Convert ISO to datetime-local input format
function formatDateTimeForInput(isoString: string): string {
	const date = new Date(isoString);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');

	return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Parse datetime-local to ISO format
function parseDateTime(inputValue: string): Date {
	return new Date(inputValue + ':00.000Z'); // Assume UTC
}
```

---

## Summary

This specification provides a comprehensive guide for implementing time block adjustment functionality in BuildOS. The feature leverages existing infrastructure:

✅ **Already Works**:

- TimeBlockService.updateTimeBlock() method
- PATCH API endpoint
- Google Calendar sync
- Suggestion regeneration
- Webhook sync prevention
- Database schema

**What Needs Building**:

- UI in TimeBlockDetailModal component
- Form fields and validation
- Edit mode toggle
- Date/time formatting for inputs

**Estimated Effort**: 7-11 hours total (4-6 hours UI, 2-3 hours integration, 1-2 hours polish)

**Risk Assessment**: Low - building on proven infrastructure with comprehensive error handling already in place.
