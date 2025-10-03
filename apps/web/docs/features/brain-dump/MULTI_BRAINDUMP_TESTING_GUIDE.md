# Multi-Brain Dump Testing Guide

**Date:** 2025-10-01
**Status:** 🟢 **Ready for Testing**

---

## Quick Start

### 1. Enable Feature Flag

```bash
cd /Users/annawayne/buildos-platform/apps/web

# Create or edit .env.local
echo "PUBLIC_ENABLE_MULTI_BRAINDUMP=true" >> .env.local
echo "PUBLIC_USE_NEW_NOTIFICATIONS=true" >> .env.local
```

### 2. Start Development Server

```bash
pnpm dev
```

**Important:** Restart the dev server if it's already running - environment variables are loaded at startup.

### 3. Verify Feature Flag is Active

Open browser console and check:

```javascript
// Should log: true
console.log(import.meta.env.PUBLIC_ENABLE_MULTI_BRAINDUMP);
```

---

## Test Scenarios

### Scenario 1: Start Single Brain Dump (Baseline)

**Purpose:** Verify basic functionality still works

**Steps:**

1. Click "Brain Dump" button
2. Select a project or create new
3. Enter text (e.g., "Build a landing page with hero section, features, and CTA")
4. Click "Process"

**Expected:**

- ✅ Modal closes
- ✅ Notification appears in bottom-right
- ✅ Notification shows "Processing brain dump..."
- ✅ Notification shows streaming progress updates
- ✅ Notification shows success when complete

**Console Logs to Check:**

```
[BrainDumpModal] Starting brain dump in multi-mode: { brainDumpId: "xxx", processingType: "dual", currentActive: 0 }
[BrainDumpModal] Brain dump started successfully: xxx
[Store] Started brain dump xxx, active count: 1
[BrainDumpNotificationBridge] Creating notification for: xxx
```

---

### Scenario 2: Start Two Concurrent Brain Dumps

**Purpose:** Verify multiple brain dumps work simultaneously

**Steps:**

1. Start first brain dump (as in Scenario 1)
2. **Immediately** click "Brain Dump" button again (don't wait for first to finish)
3. Select a different project
4. Enter different text (e.g., "Create API endpoints for user management")
5. Click "Process"

**Expected:**

- ✅ Both notifications appear in stack
- ✅ Both show processing independently
- ✅ Both stream progress updates
- ✅ Both complete successfully
- ✅ No interference between the two

**Console Logs to Check:**

```
[BrainDumpModal] Starting brain dump in multi-mode: { brainDumpId: "xxx", currentActive: 1 }
[BrainDumpModal] Brain dump started successfully: xxx
[Store] Started brain dump xxx, active count: 2
[BrainDumpNotificationBridge] Creating notification for: xxx
```

**Visual Check:**

- Two notification cards in bottom-right stack
- Each shows different title/content
- Both have independent progress bars
- Can expand/minimize each independently

---

### Scenario 3: Start Three Concurrent Brain Dumps (Max Limit)

**Purpose:** Verify max concurrent limit works

**Steps:**

1. Start first brain dump
2. Start second brain dump (while first processing)
3. Start third brain dump (while first two processing)

**Expected:**

- ✅ All three notifications appear
- ✅ All three process concurrently
- ✅ Active count in console shows 3

**Console Logs to Check:**

```
[Store] Started brain dump xxx, active count: 3
```

**Visual Check:**

- Three notification cards visible
- All showing processing state
- Stack is getting crowded (expected)

---

### Scenario 4: Queue Brain Dump (4th While 3 Processing)

**Purpose:** Verify queueing works when limit reached

**Steps:**

1. Start three brain dumps (as in Scenario 3)
2. **Immediately** start a fourth brain dump

**Expected:**

- ✅ Toast notification appears: "Brain dump queued - 3 brain dumps already processing"
- ✅ Fourth brain dump is NOT processing yet
- ✅ Fourth brain dump appears in queue (check console)

**Console Logs to Check:**

```
[BrainDumpModal] Brain dump queued (max concurrent reached)
[Store] Max concurrent reached (3), queuing brain dump xxx
[Store] Queued brain dump xxx, queue size: 1
```

**Visual Check:**

- Toast appears with queue message
- Only 3 notifications in stack (not 4)

---

### Scenario 5: Auto-Start Queued Brain Dump

**Purpose:** Verify queued brain dumps auto-start when slot frees

**Steps:**

1. Complete Scenario 4 (3 processing, 1 queued)
2. Wait for ONE of the three brain dumps to complete
3. Click "Apply Operations" and complete it

**Expected:**

- ✅ Completed brain dump notification updates to success state
- ✅ Queued brain dump automatically starts processing
- ✅ Still 3 active brain dumps (one completed, queued one started)

**Console Logs to Check:**

```
[Store] Completing brain dump xxx
[Store] Processing queued brain dump xxx
[Store] Started brain dump xxx, active count: 3
```

**Visual Check:**

- Fourth notification now appears in stack
- Shows "Processing..." state
- Three total processing notifications visible

---

### Scenario 6: Session Persistence (Page Refresh)

**Purpose:** Verify brain dumps persist across refresh

**Steps:**

1. Start 2-3 brain dumps
2. Let them process for a few seconds
3. Refresh the page (F5 or Cmd+R)

**Expected (Current Implementation):**

- ⚠️ Brain dumps are cleared (by design)
- ✅ No errors in console
- ✅ Clean slate after refresh

**Future Enhancement:**

- Could restore in-progress brain dumps
- Could reconnect to SSE streams
- Currently not implemented

**Console Logs to Check:**

```
[Store] Loaded persisted state
[Store] Cleaned up abandoned brain dumps
```

---

### Scenario 7: Error Handling

**Purpose:** Verify errors are handled gracefully

**Steps:**

1. Start brain dump with very short text (< 10 characters)
2. Or disconnect network mid-processing

**Expected:**

- ✅ Notification shows error state
- ✅ Error message displayed in notification
- ✅ Can dismiss notification
- ✅ Other brain dumps continue processing

**Console Logs to Check:**

```
[BrainDumpNotificationBridge] Processing error: xxx
[Store] Brain dump error: xxx
```

---

### Scenario 8: Expand/Minimize Notifications

**Purpose:** Verify notification interaction works

**Steps:**

1. Start 2 brain dumps
2. Click on first notification to expand
3. Click outside modal to minimize
4. Click on second notification to expand

**Expected:**

- ✅ First notification expands to full modal
- ✅ Shows processing details (if still processing) or results (if complete)
- ✅ Clicking outside minimizes back to stack
- ✅ Second notification can be expanded independently
- ✅ Only one modal open at a time

---

### Scenario 9: Cancel/Dismiss Notifications

**Purpose:** Verify cleanup works

**Steps:**

1. Start brain dump
2. Click X button on notification

**Expected:**

- ✅ Notification removed from stack
- ✅ Brain dump removed from store
- ✅ API stream aborted (check network tab)

**Console Logs to Check:**

```
[BrainDumpNotificationBridge] Cancelling API stream for: xxx
[Store] Completing brain dump xxx
```

---

### Scenario 10: Legacy Mode (Feature Flag Off)

**Purpose:** Verify backward compatibility

**Steps:**

1. Disable feature flag: `PUBLIC_ENABLE_MULTI_BRAINDUMP=false`
2. Restart dev server
3. Start brain dump

**Expected:**

- ✅ Old behavior works (single brain dump only)
- ✅ Uses legacy `startProcessing()` method
- ✅ No errors

**Console Logs to Check:**

```
[BrainDumpModal] Starting brain dump in legacy mode
```

---

## Browser Console Testing

### Check Active Brain Dumps

```javascript
// Import store in console
import { brainDumpV2Store } from '$lib/stores/brain-dump-v2.store';

// Check active count
console.log('Active:', brainDumpV2Store.getActiveBrainDumpCount());

// Get all active brain dumps
import { get } from 'svelte/store';
const state = get(brainDumpV2Store);
console.log('Brain Dumps:', Array.from(state.activeBrainDumps.entries()));
```

### Check Queue

```javascript
const state = get(brainDumpV2Store);
console.log('Queue:', state.queuedBrainDumps);
console.log('Queue Size:', state.queuedBrainDumps.length);
```

### Check Notification Stack

```javascript
import { notificationStore } from '$lib/stores/notification.store';
const notifState = get(notificationStore);
console.log('Notifications:', Array.from(notifState.notifications.entries()));
console.log('Stack:', notifState.stack);
```

---

## Network Tab Verification

### Check Concurrent SSE Streams

1. Open DevTools → Network tab
2. Filter by "stream" or "SSE"
3. Start 3 brain dumps

**Expected:**

- ✅ Three separate connections to `/api/braindumps/stream` or `/stream-short`
- ✅ All showing "pending" (EventStream)
- ✅ Each receiving independent messages

**Event Names to Check:**

- `contextProgress`
- `tasksProgress`
- `complete`

---

## Common Issues & Solutions

### Issue 1: Feature Flag Not Working

**Symptom:** Still using legacy mode even with flag enabled

**Solution:**

1. Verify `.env.local` has correct flag
2. Restart dev server (pnpm dev)
3. Hard refresh browser (Cmd+Shift+R)
4. Check console: `import.meta.env.PUBLIC_ENABLE_MULTI_BRAINDUMP`

### Issue 2: TypeScript Errors

**Symptom:** Red squiggly lines in IDE

**Solution:**

1. Run `pnpm check` to verify
2. Restart TypeScript server in VS Code
3. Check for missing imports

### Issue 3: Notifications Not Appearing

**Symptom:** Brain dump processes but no notification

**Solution:**

1. Check `PUBLIC_USE_NEW_NOTIFICATIONS=true` in `.env.local`
2. Check browser console for bridge errors
3. Verify notification store is initialized

### Issue 4: Queue Not Processing

**Symptom:** Queued brain dump doesn't start after one completes

**Solution:**

1. Check console for `processQueue()` calls
2. Verify `completeBrainDump()` is called
3. Check if there's an error in the queue logic

---

## Success Criteria Checklist

After testing, verify:

### Functional Requirements

- ✅ Can start 3 concurrent brain dumps
- ✅ Each processes independently
- ✅ Each has its own notification
- ✅ Can expand/minimize any notification
- ✅ 4th brain dump queues automatically
- ✅ Queued brain dump auto-starts when slot frees
- ✅ No race conditions or state corruption

### User Experience

- ✅ Modal closes immediately after submission (allows rapid re-use)
- ✅ Clear toast feedback when brain dump is queued
- ✅ Notification stack shows all active brain dumps
- ✅ Streaming progress updates work correctly
- ✅ Error states display properly

### Performance

- ✅ No noticeable lag when starting brain dumps
- ✅ UI remains responsive with 3 concurrent operations
- ✅ Memory usage is reasonable

### Code Quality

- ✅ No TypeScript errors
- ✅ No console errors
- ✅ Clean console logs (no spam)

---

## Reporting Issues

If you find a bug, report with:

1. **Steps to reproduce**
2. **Expected behavior**
3. **Actual behavior**
4. **Console logs** (copy full output)
5. **Screenshots** (if visual bug)
6. **Network tab** (if API issue)

**Example Bug Report:**

```
Title: Queued brain dump doesn't start after completion

Steps:
1. Start 3 brain dumps
2. Start 4th (gets queued)
3. Complete first brain dump
4. Wait 5 seconds

Expected: 4th brain dump starts processing
Actual: 4th brain dump stays in queue

Console logs:
[Store] Completing brain dump xxx
[Store] Released mutex for brain dump xxx
(no processQueue log appears)

Screenshot: [attach]
```

---

## Next Steps After Testing

### If All Tests Pass ✅

1. **Document results** in GitHub issue or status doc
2. **Write unit tests** (see MULTI_BRAINDUMP_STATUS_UPDATE.md)
3. **Create PR** for review
4. **Gradual rollout** (10% → 50% → 100%)

### If Tests Fail ❌

1. **Document failures** with details above
2. **Debug** using console logs and network tab
3. **Fix issues** in code
4. **Re-test** until all pass

---

## Advanced Testing (Optional)

### Stress Test: 10 Brain Dumps

Try to start 10 brain dumps rapidly:

**Expected:**

- First 3 process
- Next 5 queue (up to max queue of 5)
- Last 2 rejected (queue full)

### Performance Test: Large Text

Start brain dumps with very large text (5000+ characters):

**Expected:**

- Processing takes longer
- No UI freeze
- Memory usage reasonable

### Edge Case: Empty Text

Try to start brain dump with empty text:

**Expected:**

- Validation error
- No brain dump started
- Toast error message

---

**Ready to test? Start with Scenario 1 and work your way through!** 🚀
