# Calendar Disconnect Modal - Test Plan

## Feature Overview

This test plan covers the new calendar disconnect confirmation modal that checks for scheduled events and time blocks before disconnecting Google Calendar.

## Implementation Date

2025-10-22

## Files Changed

1. **New Files:**
    - `/src/lib/services/calendar-disconnect-service.ts` - Service for checking dependencies
    - `/src/lib/components/calendar/CalendarDisconnectModal.svelte` - Modal component

2. **Modified Files:**
    - `/src/lib/components/profile/CalendarTab.svelte` - Updated disconnect flow
    - `/src/routes/profile/+page.server.ts` - Added data removal support

## Test Scenarios

### Scenario 1: No Calendar Dependencies

**Setup:** User has connected calendar but no scheduled tasks or time blocks
**Steps:**

1. Navigate to Profile → Calendar tab
2. Click "Disconnect" button
   **Expected:**

- Calendar disconnects immediately without showing modal
- Success toast: "Calendar disconnected successfully"

### Scenario 2: Calendar with Scheduled Tasks

**Setup:** User has tasks scheduled on their calendar
**Steps:**

1. Navigate to Profile → Calendar tab
2. Click "Disconnect" button
   **Expected:**

- Modal appears showing count of scheduled tasks
- Two options displayed: "Keep tasks" and "Remove all data"
- Cancel button available

**Test Keep Option:** 3. Select "Keep tasks and time blocks" 4. Click "Keep & Disconnect"
**Expected:**

- Calendar disconnects
- Tasks remain in system (verify in tasks list)
- Success toast: "Calendar disconnected successfully"

**Test Remove Option:** 3. Select "Remove all calendar data" 4. Click "Remove & Disconnect"
**Expected:**

- Warning appears about irreversible action
- Calendar disconnects
- All task_calendar_events removed from database
- Success toast: "Calendar disconnected and all data removed"

### Scenario 3: Calendar with Time Blocks

**Setup:** User has time blocks synced from calendar
**Steps:**

1. Navigate to Profile → Calendar tab
2. Click "Disconnect" button
   **Expected:**

- Modal shows count of time blocks
- Options to keep or remove data

### Scenario 4: Cancel Operation

**Steps:**

1. Navigate to Profile → Calendar tab
2. Click "Disconnect" button
3. Click "Cancel" or X button
   **Expected:**

- Modal closes
- Calendar remains connected
- No changes made

### Scenario 5: Loading States

**Steps:**

1. Click "Disconnect" button
   **Expected:**

- Button shows loading spinner while checking dependencies

2. In modal, click "Disconnect"
   **Expected:**

- Button shows "Disconnecting..." with loading spinner
- Buttons disabled during operation

## Database Verification

### Check Calendar Dependencies

```sql
-- Check task_calendar_events
SELECT COUNT(*) FROM task_calendar_events WHERE user_id = '[user_id]';

-- Check time_blocks with calendar links
SELECT COUNT(*) FROM time_blocks
WHERE user_id = '[user_id]' AND calendar_event_id IS NOT NULL;

-- Check calendar-sourced tasks
SELECT COUNT(*) FROM tasks
WHERE user_id = '[user_id]' AND source = 'calendar_analysis';
```

### Verify Data Removal (after "Remove all data" option)

```sql
-- Should return 0
SELECT COUNT(*) FROM task_calendar_events WHERE user_id = '[user_id]';

-- Calendar fields should be NULL
SELECT calendar_event_id, calendar_event_link FROM time_blocks
WHERE user_id = '[user_id]';

-- source_calendar_event_id should be NULL
SELECT source_calendar_event_id FROM tasks
WHERE user_id = '[user_id]' AND source = 'calendar_analysis';
```

## Edge Cases to Test

1. **Network Failure During Check**
    - Disconnect network after clicking "Disconnect"
    - Should show error toast: "Failed to check calendar data"

2. **Network Failure During Disconnect**
    - Disconnect network after confirming in modal
    - Should show error toast: "Failed to disconnect calendar"

3. **Rapid Clicks**
    - Click disconnect button multiple times quickly
    - Should only trigger once (button disabled during check)

4. **Browser Back Button**
    - Open modal and use browser back
    - Modal should close, no changes made

## Accessibility Testing

1. **Keyboard Navigation**
    - Tab through all interactive elements
    - Enter/Space to select radio buttons
    - Escape key closes modal (when not processing)

2. **Screen Reader**
    - All buttons have proper labels
    - Modal has proper ARIA attributes
    - Radio buttons properly associated with labels

## Visual Testing

1. **Light Mode**
    - Check all colors and contrasts
    - Verify hover states
    - Check selected radio button styling

2. **Dark Mode**
    - Switch to dark mode
    - Verify all elements visible
    - Check color contrasts

3. **Mobile View**
    - Test on mobile screen size
    - Modal should be full width on mobile
    - All text should be readable

## Performance Testing

1. **Large Data Sets**
    - Test with user having 100+ scheduled tasks
    - Dependency check should complete within 2 seconds
    - Modal should render smoothly

2. **Concurrent Operations**
    - Have calendar sync running in background
    - Try to disconnect
    - Should handle gracefully

## Regression Testing

1. **Normal Disconnect Flow** (without dependencies)
    - Should work as before

2. **Calendar Reconnect**
    - After disconnect, reconnect calendar
    - Should work normally

3. **Other Calendar Features**
    - Calendar preferences save
    - Calendar analysis
    - Task scheduling
    - All should work normally

## Success Criteria

✅ Modal appears when calendar has dependencies
✅ Modal does NOT appear when no dependencies
✅ Keep option preserves all data
✅ Remove option deletes calendar data correctly
✅ Cancel option works without changes
✅ Loading states display properly
✅ Error handling works
✅ Accessibility requirements met
✅ Works on mobile and desktop
✅ No regression in existing features
