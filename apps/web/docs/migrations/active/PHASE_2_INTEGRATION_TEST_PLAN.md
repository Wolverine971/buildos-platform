# Phase 2: Brain Dump Integration - Test Plan

**Date:** 2025-10-01
**Status:** Ready for Testing
**Feature Flag:** `PUBLIC_USE_NEW_NOTIFICATIONS`

---

## Integration Architecture

### Current Setup ✅

```
User starts brain dump
  ↓
BrainDumpModal processes
  ↓
brain-dump-v2.store updates (phase: 'parsing')
  ↓
Bridge subscription detects change
  ↓
Bridge creates BrainDumpNotification
  ↓
notificationStore adds notification
  ↓
NotificationStackManager renders
  ↓
User sees notification in bottom-right
```

### Feature Flag Logic ✅

**Layout** (`+layout.svelte`):

```svelte
{#if USE_NEW_NOTIFICATION_SYSTEM}
	<NotificationStackManager /> <!-- NEW -->
{:else}
	<BrainDumpProcessingNotification /> <!-- OLD -->
{/if}
```

**Bridge Initialization:**

```typescript
onMount(() => {
	if (USE_NEW_NOTIFICATION_SYSTEM) {
		initBrainDumpNotificationBridge();
	}
});
```

---

## Test Scenarios

### Scenario 1: New System (Feature Flag ON)

**Setup:**

```bash
echo "PUBLIC_USE_NEW_NOTIFICATIONS=true" > apps/web/.env.local
pnpm dev
```

**Test Steps:**

1. Open browser console
2. Navigate to dashboard
3. Click "Brain Dump" button
4. Enter some text (e.g., "Build a new feature to track goals")
5. Click "Process" or "Continue"

**Expected Console Logs:**

```
[Layout] USE_NEW_NOTIFICATION_SYSTEM: true
[BrainDumpNotificationBridge] Initializing bridge
[BrainDumpNotificationBridge] syncBrainDumpToNotification called: {
  phase: "parsing",
  brainDumpId: "uuid-here",
  hasActiveNotification: false,
  lastProcessedId: null
}
[BrainDumpNotificationBridge] Creating notification for: uuid-here
[NotificationStore] Adding notification: notif_...
```

**Expected UI:**

- ✅ Notification appears in bottom-right corner
- ✅ Shows "Processing brain dump"
- ✅ Shows progress updates ("Analyzing content...", "Extracting tasks...")
- ✅ Can click to expand modal
- ✅ OLD notification does NOT appear

**If Logs Don't Appear:**

- Bridge not initializing → Check feature flag value
- Bridge not subscribing → Check `onMount` in layout
- Store not updating → Check brain dump modal processing

---

### Scenario 2: Old System (Feature Flag OFF)

**Setup:**

```bash
echo "PUBLIC_USE_NEW_NOTIFICATIONS=false" > apps/web/.env.local
pnpm dev
```

**Test Steps:**

1. Start a brain dump (same as above)

**Expected:**

- ✅ OLD notification appears (full modal or minimized)
- ✅ NEW stack does NOT appear
- ✅ No bridge logs in console

---

### Scenario 3: Duplicate Detection

**Setup:** Feature flag ON

**Test Steps:**

1. Start a brain dump
2. While processing, refresh the page
3. Check console logs and UI

**Expected Console Logs:**

```
[BrainDumpNotificationBridge] Initializing bridge
[BrainDumpNotificationBridge] Found existing notification on init: notif_...
[BrainDumpNotificationBridge] syncBrainDumpToNotification called: {
  phase: "parsing",
  brainDumpId: "same-uuid",
  hasActiveNotification: true,  // <-- Rehydrated!
  lastProcessedId: "same-uuid"
}
[BrainDumpNotificationBridge] Updating existing notification: notif_...
```

**Expected UI:**

- ✅ Only ONE notification in stack
- ✅ No duplicates created
- ✅ Notification persists across refresh

---

### Scenario 4: Multiple Brain Dumps

**Setup:** Feature flag ON

**Test Steps:**

1. Start first brain dump → let it complete
2. Wait 10 seconds (allow tracking to clear)
3. Start second brain dump

**Expected:**

- ✅ First notification shows success
- ✅ Second notification created (new ID)
- ✅ Both visible in stack (first completed, second processing)

---

### Scenario 5: Close vs Minimize

**Setup:** Feature flag ON

**Test Steps:**

1. Start brain dump
2. Click notification to expand modal
3. Click minimize button (↓)
4. Verify notification stays in stack (minimized)
5. Click notification again to expand
6. Click close button (✕)
7. Verify notification removed completely

**Expected:**

- ✅ Minimize → modal closes, notification in stack
- ✅ Close → notification removed from stack entirely

---

## Debug Checklist

### If Bridge Not Creating Notifications:

1. **Check Feature Flag:**

    ```bash
    cat apps/web/.env.local | grep PUBLIC_USE_NEW_NOTIFICATIONS
    ```

2. **Check Console for Init Log:**

    ```
    [BrainDumpNotificationBridge] Initializing bridge
    ```

    - If missing → Feature flag not true or bridge not imported

3. **Check Subscription Calls:**

    ```
    [BrainDumpNotificationBridge] syncBrainDumpToNotification called
    ```

    - If missing → Store not updating or subscription not working

4. **Check Processing Phase:**
    - Brain dump must set `processing.phase = 'parsing'`
    - Check brain dump modal logic

### If Notifications Not Appearing:

1. **Check NotificationStackManager Rendering:**
    - Inspect DOM for `<div class="notification-stack">`
    - Should be in bottom-right corner

2. **Check Notification Store:**

    ```javascript
    // In browser console
    $notificationStore.notifications.size; // Should be > 0
    ```

3. **Check Z-Index:**
    - NotificationStackManager should have high z-index
    - Check for CSS conflicts

### If Duplicates Still Appearing:

1. **Check Rehydration Logic:**

    ```
    [BrainDumpNotificationBridge] Found existing notification on init
    ```

    - If missing → Rehydration not working

2. **Check Session Storage:**

    ```javascript
    // In browser console
    sessionStorage.getItem('buildos_notifications_v1');
    ```

    - Should contain persisted notifications

3. **Check Brain Dump ID:**
    - Each brain dump should have unique ID
    - Test notifications should start with `test_`

---

## Success Criteria

### Must Have ✅

- [x] Feature flag ON → new system works
- [x] Feature flag OFF → old system works
- [x] Real brain dump creates notification
- [x] No duplicates on page refresh
- [x] Close button removes notification
- [x] Minimize button keeps notification
- [x] Test notifications don't persist
- [x] API call to /stream is made
- [x] Streaming progress updates work

### Nice to Have 🎯

- [x] Streaming progress updates work (context + tasks)
- [ ] Multiple concurrent brain dumps work (not tested)
- [x] Modal expansion/minimization smooth
- [x] Keyboard shortcuts work (ESC to close)

---

## Integration Status

### ✅ Completed

1. **Bridge Service**
    - `brain-dump-notification.bridge.ts` created
    - Store subscription set up
    - Rehydration logic implemented
    - Duplicate prevention logic added
    - **API call trigger added** ✅
    - **Streaming state updates implemented** ✅

2. **Type-Specific Components**
    - `BrainDumpMinimizedView.svelte` created
    - `BrainDumpModalContent.svelte` created
    - Modal wrapper added with close/minimize buttons

3. **Generic Infrastructure**
    - `NotificationStackManager.svelte` registered in layout
    - `NotificationModal.svelte` supports brain dump type
    - `MinimizedNotification.svelte` supports brain dump type
    - **Notification store hydration race condition fixed** ✅

4. **Feature Flag**
    - Layout respects `PUBLIC_USE_NEW_NOTIFICATIONS`
    - Old system hidden when flag is ON
    - New system shown when flag is ON

### ✅ Verified (Partial)

1. **End-to-End Flow** (Partially Tested)
    - [x] Start real brain dump
    - [x] Verify notification created
    - [x] Verify API call to /stream made
    - [x] Verify streaming updates work (context + tasks)
    - [ ] Verify parse results display correctly
    - [ ] Verify apply operations flow
    - [ ] Verify success view display
    - [ ] Verify completion handled correctly

2. **Critical Bug Fixes** (Complete)
    - [x] Hydration race condition - notifications persist
    - [x] API call trigger - /stream is called
    - [x] Streaming updates - real-time progress shows

3. **Edge Cases** (Not Tested)
    - [x] Page refresh during processing - notification persists
    - [ ] Multiple brain dumps - not tested
    - [ ] Network errors - not tested
    - [ ] Cancellation - not tested
    - [ ] Auto-accept flow - not tested
    - [ ] Parse results interaction - not tested

---

## Rollout Plan

### Phase 1: Internal Testing (Current)

- Enable feature flag for development
- Test all scenarios above
- Fix any bugs discovered

### Phase 2: Beta Testing

- Enable for select users
- Monitor error logs
- Gather feedback

### Phase 3: Full Rollout

- Enable for all users
- Remove old notification component
- Clean up feature flag code

---

## Troubleshooting Commands

```bash
# Check feature flag
cat apps/web/.env.local

# Clear session storage (fresh start)
# In browser console:
sessionStorage.clear()

# Check notification store state
# In browser console:
$notificationStore

# Check brain dump store state
# In browser console:
$brainDumpV2Store

# Check if bridge initialized
# Look for this in console:
[BrainDumpNotificationBridge] Initializing bridge
```

---

## Next Steps

1. **Test Scenario 1** (New System) - Verify basic flow works
2. **Test Scenario 3** (Duplicates) - Verify refresh handling
3. **Test Scenario 5** (Close/Minimize) - Verify buttons work
4. Fix any issues discovered
5. Document findings
6. Move to Phase 3 (Phase Generation)

---

## Related Documentation

- [Phase 2 Status Report](./PHASE_2_BRAIN_DUMP_MIGRATION_STATUS.md)
- [Phase 2 Fixes Summary](./PHASE_2_FIXES_SUMMARY.md)
- [Notification System Implementation](./NOTIFICATION_SYSTEM_IMPLEMENTATION.md)
