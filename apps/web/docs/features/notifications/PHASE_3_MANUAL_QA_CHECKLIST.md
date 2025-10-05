# Phase 3: Phase Generation Notification - Manual QA Testing Checklist

**Date Created**: 2025-10-04
**Status**: Ready for QA
**Related Spec**: [generic-stackable-notification-system-spec.md](./generic-stackable-notification-system-spec.md)

## Overview

This checklist covers manual QA testing for Phase 3 (Phase Generation Integration) of the Generic Stackable Notification System. All code is complete and unit tested - this validates real-world usage.

## Pre-Testing Setup

### Environment Check

- [ ] `PUBLIC_USE_NEW_NOTIFICATIONS=true` in `.env`
- [ ] Web app running (`pnpm dev`)
- [ ] Logged in as test user
- [ ] At least one project with tasks exists
- [ ] Browser DevTools console open for error monitoring

---

## Test Suite 1: Initial Phase Generation

### Test 1.1: Phases-Only Strategy

**Setup**: Project with 5-10 tasks, no existing phases

**Steps**:

1. Navigate to project detail page
2. Click "Generate Phases" button
3. In confirmation modal, select "Phases Only" strategy
4. Click "Generate Phases"

**Expected Results**:

- [ ] Notification appears in bottom-right stack immediately
- [ ] Notification shows "Processing" status with project name
- [ ] Progress steps advance (Queue → Analyze → Generate → Finalize)
- [ ] Can click notification to expand modal
- [ ] Modal shows full step timeline with progress
- [ ] On completion, notification shows "Success" status
- [ ] Project page updates with generated phases
- [ ] Can click "View Project" action
- [ ] Can dismiss notification

**Bugs/Issues Found**:

```
[Write any issues here]
```

---

### Test 1.2: Schedule-in-Phases Strategy

**Setup**: Project with 5-10 tasks, no existing phases, user has calendar connected

**Steps**:

1. Navigate to project detail page
2. Click "Generate Phases" button
3. Select "Schedule tasks in phases" strategy
4. Click "Generate Phases"

**Expected Results**:

- [ ] Notification appears with 5 steps (includes "Schedule" step)
- [ ] Schedule step shows when calendar integration runs
- [ ] Tasks are assigned to calendar slots
- [ ] Project page shows phases with scheduled tasks
- [ ] Notification summary shows calendar event count

**Bugs/Issues Found**:

```
[Write any issues here]
```

---

### Test 1.3: Calendar-Optimized Strategy

**Setup**: Project with 5-10 tasks, no existing phases, user has calendar with events

**Steps**:

1. Navigate to project detail page
2. Click "Generate Phases" button
3. Select "Calendar optimized" strategy
4. Click "Generate Phases"

**Expected Results**:

- [ ] Notification shows calendar-optimized workflow
- [ ] Tasks scheduled around existing calendar events
- [ ] No conflicts with existing meetings
- [ ] Summary shows optimization results

**Bugs/Issues Found**:

```
[Write any issues here]
```

---

## Test Suite 2: Phase Regeneration

### Test 2.1: Regenerate Existing Phases

**Setup**: Project with existing phases (from Test 1.1)

**Steps**:

1. Navigate to project with phases
2. Click "Regenerate Phases" button
3. Select strategy (any)
4. Confirm regeneration

**Expected Results**:

- [ ] Notification shows `isRegeneration: true` badge
- [ ] Warning about overwriting existing phases (if in modal)
- [ ] Old phases replaced with new phases
- [ ] Notification indicates regeneration in title/badge

**Bugs/Issues Found**:

```
[Write any issues here]
```

---

## Test Suite 3: Error Handling & Retry

### Test 3.1: Network Error During Generation

**Setup**: Project with tasks

**Steps**:

1. Open browser DevTools Network tab
2. Set network to "Offline" or throttle to "Slow 3G"
3. Start phase generation
4. Wait for failure

**Expected Results**:

- [ ] Notification shows "Error" status
- [ ] Error message displayed in notification
- [ ] "Retry" button available
- [ ] Click retry re-executes generation
- [ ] After restoring network, retry succeeds

**Bugs/Issues Found**:

```
[Write any issues here]
```

---

### Test 3.2: API Error (Backend Failure)

**Setup**: Simulate API error (if possible) or test with project that has validation errors

**Steps**:

1. Trigger phase generation with invalid data (e.g., no tasks selected)
2. Observe error handling

**Expected Results**:

- [ ] Notification shows error status
- [ ] Meaningful error message displayed
- [ ] Can retry or dismiss
- [ ] No undefined errors or crashes

**Bugs/Issues Found**:

```
[Write any issues here]
```

---

## Test Suite 4: Notification Persistence

### Test 4.1: Page Refresh During Processing

**Steps**:

1. Start phase generation
2. While notification shows "Processing", refresh the page
3. Observe notification restoration

**Expected Results**:

- [ ] Notification persists after refresh
- [ ] Shows "Processing" state (or completed if finished during refresh)
- [ ] Can expand modal
- [ ] No duplicate notifications
- [ ] Actions (retry, view project) still work

**Bugs/Issues Found**:

```
[Write any issues here]
```

---

### Test 4.2: Navigate Away and Return

**Steps**:

1. Start phase generation
2. Navigate to different page (e.g., projects list)
3. Return to project page

**Expected Results**:

- [ ] Notification visible in stack on all pages
- [ ] Processing continues in background
- [ ] Completion status updates regardless of page
- [ ] Can expand from any page

**Bugs/Issues Found**:

```
[Write any issues here]
```

---

## Test Suite 5: Concurrent Operations

### Test 5.1: Multiple Phase Generations

**Setup**: At least 2 different projects with tasks

**Steps**:

1. Open Project A, start phase generation
2. Open Project B (new tab or navigate), start phase generation
3. Observe both notifications

**Expected Results**:

- [ ] Both notifications appear in stack
- [ ] Can expand either notification independently
- [ ] Progress updates for both simultaneously
- [ ] No conflicts or mixed state
- [ ] Both complete successfully

**Bugs/Issues Found**:

```
[Write any issues here]
```

---

### Test 5.2: Phase Generation + Brain Dump

**Steps**:

1. Start phase generation on a project
2. Open brain dump modal
3. Process a brain dump while phase generation runs

**Expected Results**:

- [ ] Both notifications in stack
- [ ] Can expand either one
- [ ] No interference between operations
- [ ] Both complete successfully

**Bugs/Issues Found**:

```
[Write any issues here]
```

---

## Test Suite 6: UI/UX Validation

### Test 6.1: Minimize/Expand Behavior

**Steps**:

1. Start phase generation
2. Click notification to expand modal
3. Click minimize button
4. Click notification again to expand
5. Press ESC key

**Expected Results**:

- [ ] Click expands to modal smoothly
- [ ] Minimize button collapses to stack
- [ ] Can re-expand by clicking
- [ ] ESC key minimizes modal
- [ ] No visual glitches or flashing

**Bugs/Issues Found**:

```
[Write any issues here]
```

---

### Test 6.2: Step Progress Display

**Steps**:

1. Start phase generation with any strategy
2. Observe step progression in minimized view
3. Expand modal and observe full timeline

**Expected Results**:

- [ ] Minimized view shows current step name
- [ ] Progress bar reflects completion percentage
- [ ] Modal shows all steps with status icons
- [ ] Completed steps show checkmark
- [ ] Current step shows spinner
- [ ] Pending steps show empty circle

**Bugs/Issues Found**:

```
[Write any issues here]
```

---

### Test 6.3: Action Buttons

**Steps**:

1. Complete a phase generation successfully
2. Test all action buttons in modal

**Expected Results**:

- [ ] "View Project" navigates to project page
- [ ] "Regenerate" opens phase generation modal
- [ ] "Close" dismisses notification
- [ ] "Minimize" collapses to stack
- [ ] All buttons visually distinct and labeled clearly

**Bugs/Issues Found**:

```
[Write any issues here]
```

---

## Test Suite 7: Integration with Project Store

### Test 7.1: Project Updates After Generation

**Steps**:

1. Note current project state (phases, tasks)
2. Generate phases
3. Wait for completion
4. Verify project state updates

**Expected Results**:

- [ ] `projectStoreV2.setPhases()` called with results
- [ ] Project page shows new phases immediately
- [ ] Tasks assigned to correct phases
- [ ] Backlog tasks handled correctly
- [ ] No need to refresh page

**Bugs/Issues Found**:

```
[Write any issues here]
```

---

### Test 7.2: Project Date Changes

**Setup**: Project with specific start/end dates

**Steps**:

1. Generate phases with strategy that adjusts dates
2. Observe if project dates update

**Expected Results**:

- [ ] If backend returns `project_dates_changed: true`, dates update
- [ ] Project header reflects new dates
- [ ] No date update if flag not set

**Bugs/Issues Found**:

```
[Write any issues here]
```

---

## Test Suite 8: Telemetry & Debugging

### Test 8.1: Console Logging

**Steps**:

1. Open browser console
2. Run complete phase generation flow
3. Review console output

**Expected Results**:

- [ ] No errors in console
- [ ] Telemetry events logged (if implemented)
- [ ] Duration tracking visible in modal
- [ ] Fallback mode indicated if SSE unavailable

**Bugs/Issues Found**:

```
[Write any issues here]
```

---

## Test Suite 9: Edge Cases

### Test 9.1: Empty Task List

**Steps**:

1. Create project with NO tasks
2. Try to generate phases

**Expected Results**:

- [ ] Validation prevents generation OR
- [ ] Error message shown in notification
- [ ] No crashes or undefined errors

**Bugs/Issues Found**:

```
[Write any issues here]
```

---

### Test 9.2: Very Large Task List

**Steps**:

1. Create project with 50+ tasks
2. Generate phases

**Expected Results**:

- [ ] Generation completes (may take longer)
- [ ] Progress updates smoothly
- [ ] No timeout errors
- [ ] Phases generated correctly

**Bugs/Issues Found**:

```
[Write any issues here]
```

---

### Test 9.3: Rapid Generation Requests

**Steps**:

1. Start phase generation
2. Immediately click regenerate
3. Try to start another generation

**Expected Results**:

- [ ] System prevents duplicate requests OR
- [ ] Shows appropriate message
- [ ] No race conditions
- [ ] Notification state consistent

**Bugs/Issues Found**:

```
[Write any issues here]
```

---

## Summary

### Test Execution Summary

- **Total Tests**: 21
- **Passed**: \_\_\_ / 21
- **Failed**: \_\_\_ / 21
- **Blocked**: \_\_\_ / 21

### Critical Issues Found

```
[List any blocking issues that prevent Phase 3 sign-off]
```

### Non-Critical Issues

```
[List minor issues or enhancements]
```

### Sign-Off

- [ ] All critical tests passed
- [ ] All critical bugs fixed
- [ ] Phase 3 ready for production

**Tested By**: ******\_\_\_******
**Date**: ******\_\_\_******
**Sign-Off**: ******\_\_\_******

---

## Next Steps

After completing this checklist:

1. Document all issues in GitHub Issues or bug tracker
2. Fix critical bugs before sign-off
3. Update notification system status in spec
4. Proceed to Phase 4 (Calendar Analysis) or Phase 5 (Polish) based on priority
