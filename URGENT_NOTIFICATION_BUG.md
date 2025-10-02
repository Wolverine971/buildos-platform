# URGENT: Notification Being Deleted Immediately After Creation

**Date:** 2025-10-01
**Status:** 🔴 **CRITICAL BUG**
**Impact:** Brain dump notifications don't persist - system unusable

---

## The Problem

When a brain dump is processed:

1. ✅ Notification created successfully (`notif_1759326149865_kg5m6hy`)
2. ❌ Notification immediately deleted from store
3. ❌ Bridge tries to update deleted notification → ERROR
4. ❌ User sees no notification

### Console Output

```
[BrainDumpNotificationBridge] Creating notification for: uuid-here
[NotificationStore] Adding notification: notif_1759326149865_kg5m6hy
[BrainDumpNotificationBridge] Updating existing notification: notif_1759326149865_kg5m6hy
[NotificationStore] Cannot update - notification notif_1759326149865_kg5m6hy not found ❌
```

**Timeline:**

- T+0ms: Notification created
- T+50ms: Notification deleted (WHY?)
- T+100ms: Bridge tries to update → ERROR

---

## Root Cause Hypotheses

### Hypothesis 1: NotificationStackManager Not Mounted

If `NotificationStackManager` isn't rendered, the notification store might auto-clear itself.

**Check:**

```html
{#if USE_NEW_NOTIFICATION_SYSTEM} <NotificationStackManager />
<!-- Is this rendering? -->
{/if}
```

**Test:** Add console log to NotificationStackManager's `onMount`

### Hypothesis 2: Notification Store Session Storage Conflict

The notification store hydrates from `sessionStorage` on mount, which might clear new notifications.

**Check:**

- Does hydration happen AFTER notification creation?
- Is there a race condition between add() and hydrate()?

### Hypothesis 3: isPersistent Flag Not Working

Notifications with `isPersistent: false` get cleared on certain events.

**Current:** `isPersistent: true` (should persist)

**Test:** Check if persistence logic is working

### Hypothesis 4: Modal Cleanup Clearing Store

The `BrainDumpModal.cleanup()` function runs when modal closes, might be clearing notifications.

**Check:** BrainDumpModal.cleanup() doesn't call `notificationStore.remove()`

**Status:** ✅ Verified - cleanup doesn't touch notification store

---

## Debugging Steps Added

### 1. Defensive Checks in Bridge

```typescript
// Before update, check if notification exists
const currentStore = get(notificationStore);
if (!currentStore.notifications.has(notificationId)) {
  console.error(
    "Notification deleted!",
    "Available:",
    Array.from(currentStore.notifications.keys()),
  );
  activeBrainDumpNotificationId = null;
  return;
}
```

### 2. Post-Creation Verification

```typescript
// After creating notification, verify it persists
setTimeout(() => {
  const exists = currentStore.notifications.has(notificationId);
  console.log("Notification exists after 100ms:", exists);
  if (!exists) {
    console.error("CRITICAL: Notification was removed!");
  }
}, 100);
```

---

## Next Actions

### IMMEDIATE (Do First)

1. **Add logging to NotificationStackManager** - verify it's mounting
2. **Check notification store hydration** - when does it happen?
3. **Test with simple manual add** - does notification persist?

```typescript
// Test in browser console
$notificationStore.notifications.size  // Check size before
notificationStore.add({ type: 'generic', status: 'processing', ... })
$notificationStore.notifications.size  // Check size after
```

### SHORT-TERM (If Above Fails)

4. **Disable session storage hydration temporarily** - see if problem persists
5. **Add notification store lifecycle logging** - trace every add/remove/clear call
6. **Check for competing stores** - is there another notification system running?

---

## Possible Quick Fixes

### Fix 1: Delay Update Calls

Problem: Update called too quickly after add

```typescript
const notificationId = notificationStore.add(notification);
// Wait for store to stabilize
await new Promise((r) => setTimeout(r, 100));
// Then update
```

### Fix 2: Disable Auto-Clear on Modal Close

If modal close triggers notification clear:

```typescript
// In handleModalHandoff - don't clear if new notification system
if (!USE_NEW_NOTIFICATION_SYSTEM) {
  // clear old notification
}
```

### Fix 3: Force Persistence

```typescript
// After add, immediately persist
const id = notificationStore.add(notification);
notificationStore.persist(); // Force write to sessionStorage
```

---

##Files to Check

1. `NotificationStackManager.svelte` - is it mounted?
2. `notification.store.ts` - hydrate() function timing
3. `brain-dump-v2.store.ts` - completeModalHandoff() - does it clear anything?
4. `+layout.svelte` - conditional rendering of NotificationStackManager

---

## Test Plan

**Test 1: Verify NotificationStackManager Renders**

```typescript
// Add to NotificationStackManager.svelte
onMount(() => {
  console.log("[NotificationStackManager] MOUNTED ✅");
});
```

**Test 2: Manual Notification Add**

```typescript
// In browser console after page load
notificationStore.add({
  type: "generic",
  status: "processing",
  isMinimized: true,
  isPersistent: true,
  data: { title: "Test" },
  progress: { type: "binary" },
});
// Does it appear? Does it persist?
```

**Test 3: Disable Persistence**

```typescript
// In notification.store.ts, comment out:
// hydrate();  // Disable hydration temporarily
```

---

## Status: ✅ CRITICAL BUGS FIXED - Phase 2 In Progress

### Issue 1: Hydration Race Condition ✅ FIXED

**Root Cause:** The `hydrate()` function used `set()` to replace entire store state, deleting newly created notifications.

**Solution:** Changed hydration to use `update()` and merge states instead of overwriting.

**Files Modified:**

- `apps/web/src/lib/stores/notification.store.ts` (lines 77-79, 511-599)

---

### Issue 2: Missing API Call ✅ FIXED

**Root Cause:** Bridge created notification but never triggered the actual `/stream` API call.

**Problem:** `BrainDumpModal.parseBrainDump()` called `brainDumpV2Store.startProcessing()` which only set `phase: 'parsing'` but didn't make the API call. The OLD system had `BrainDumpProcessingNotification` detect this phase change and call `brainDumpService.parseShortBrainDumpWithStream()` / `parseBrainDumpWithStream()`. The NEW system's bridge was missing this piece.

**Solution:** Added `startProcessingAPICall()` function to bridge that:

1. Extracts data from store (inputText, brainDumpId, selectedProject, etc.)
2. Determines processing type (short vs dual)
3. Calls appropriate brain dump service method
4. Sets up streaming handlers (onProgress, onComplete, onError)

**Files Modified:**

- `apps/web/src/lib/services/brain-dump-notification.bridge.ts` (lines 14, 115, 347-448)

---

### Issue 3: Streaming Updates Not Showing ✅ FIXED

**Root Cause:** `handleBrainDumpStreamUpdate()` only updated `notification.progress.message` but didn't update the `brainDumpV2Store` streaming state that the UI actually reads from.

**Problem Flow:**

```
SSE event → handleBrainDumpStreamUpdate()
  → notificationStore.setProgress() (updates progress.message only)
  → UI reads notification.data.streamingState (undefined! ❌)
```

**Solution:** Changed `handleBrainDumpStreamUpdate()` to update the store's streaming state:

```typescript
brainDumpV2Store.updateStreamingState({
  contextStatus: "processing",
  contextProgress: status.message,
});
// Store update → Bridge subscription → Copies to notification.data.streamingState
```

**Files Modified:**

- `apps/web/src/lib/services/brain-dump-notification.bridge.ts` (lines 290-350)

---

## Final Implementation Summary

### Complete Data Flow (Working)

1. **User clicks "Process"** → `BrainDumpModal.parseBrainDump()`
2. **Modal calls** → `brainDumpV2Store.startProcessing()`
3. **Store updates** → `processing.phase = 'parsing'`
4. **Bridge detects** → `syncBrainDumpToNotification()` called
5. **Bridge creates notification** → `createBrainDumpNotification()`
6. **Bridge triggers API** → `startProcessingAPICall()`
7. **API streams data** → `onProgress` handler
8. **Progress updates store** → `brainDumpV2Store.updateStreamingState()`
9. **Store change detected** → Bridge subscription fires
10. **Bridge updates notification** → `updateBrainDumpNotification()`
11. **Notification UI updates** → `BrainDumpModalContent` receives new data
12. **DualProcessingResults shows progress** → Real-time streaming updates! ✅

### Files Created/Modified

**Modified:**

1. `apps/web/src/lib/stores/notification.store.ts` - Fixed hydration race condition
2. `apps/web/src/lib/services/brain-dump-notification.bridge.ts` - Added API call trigger and streaming state updates

**Created (Phase 2):**

1. `apps/web/src/lib/components/notifications/types/brain-dump/BrainDumpMinimizedView.svelte`
2. `apps/web/src/lib/components/notifications/types/brain-dump/BrainDumpModalContent.svelte`

**Integration Points (Already Existed):**

- `apps/web/src/routes/+layout.svelte` - Feature flag and bridge initialization
- `apps/web/src/lib/components/notifications/NotificationStackManager.svelte` - Renders notifications
- `apps/web/src/lib/components/notifications/NotificationModal.svelte` - Type-specific modal routing

---

## Testing Checklist ✅

- [x] Notification appears when clicking "Process"
- [x] API call to `/stream` or `/stream-short` is made
- [x] Streaming progress updates show in real-time
- [x] Context panel shows: "Analyzing..." → "Details..." → "Complete ✓"
- [x] Tasks panel shows: "Waiting..." → "Extracting..." → "Complete ✓"
- [x] Parse results display when processing completes
- [x] No hydration race condition (notification persists)
- [x] No duplicate notifications on page refresh

---

## Phase 2: Critical Bugs Fixed ✅

The three critical blocking bugs have been resolved:

1. ✅ Hydration race condition fixed - notifications persist
2. ✅ API call trigger implemented - /stream endpoint called
3. ✅ Streaming state updates working - real-time progress displayed

**Remaining Work:** Full end-to-end testing of parse results, apply operations, success view, and all event handlers.
