# Bugfix Changelog

This document tracks significant bug fixes across the BuildOS platform. Entries are listed in reverse chronological order (most recent first).

---

## 2025-10-17: Fixed Brain Dump State Persistence on Page Reload/Dismiss

**Issue**: Brain dump processing gets into a "weird state" when page reloads or stops during processing. Dismissing the notification doesn't fully clear the state, causing orphaned jobs to persist across page reloads and prevent new brain dumps from starting properly.

**Root Cause**: The brain dump system uses three independent persistence layers that don't coordinate during cleanup:

1. **Background Service** - stores jobs in `sessionStorage['active-brain-dump-jobs']`
2. **Brain Dump Store** - stores state in `sessionStorage['brain-dump-unified-state']`
3. **Notification Store** - stores notifications in `sessionStorage['buildos_notifications_v2']`

When a notification is dismissed, it only cleared layers 2 & 3 but left orphaned jobs in layer 1. On page reload, these orphaned jobs were restored, creating a state mismatch.

**Impact**: Users couldn't fully reset brain dump processing by closing the notification. Orphaned state persisted across page reloads, causing confusion and blocking new brain dumps from starting.

**Fix**: Added cross-layer cleanup coordination:

1. **Background Service** (`braindump-background.service.ts:579-617`):
   - Added `clearJob(jobId)` - clear specific job by ID
   - Added `clearJobsForBrainDump(brainDumpId)` - clear all jobs for a brain dump

2. **Notification Bridge** (`brain-dump-notification.bridge.ts:57-88`):
   - Updated `dismiss` action to call `backgroundBrainDumpService.clearJobsForBrainDump()`
   - Added emergency reset function `forceResetAllBrainDumpState()` exposed as `window.__resetAllBrainDumps()`

3. **Brain Dump Store** (`brain-dump-v2.store.ts:914-970`):
   - Updated `completeBrainDump()` to clear background jobs
   - Updated `cancelBrainDump()` to clear background jobs

**Files Changed**:

- `apps/web/src/lib/services/braindump-background.service.ts` (lines 579-617 - added 2 cleanup methods)
- `apps/web/src/lib/services/brain-dump-notification.bridge.ts` (lines 1-16, 57-88, 940-996 - import, dismiss action, emergency reset)
- `apps/web/src/lib/stores/brain-dump-v2.store.ts` (lines 1-16, 914-970 - import, completeBrainDump, cancelBrainDump)

**Manual Verification Steps**:

1. Start a brain dump processing
2. Reload the page during processing
3. Close the brain dump notification by clicking the dismiss button
4. Open browser DevTools console
5. Check `sessionStorage['active-brain-dump-jobs']` - should be empty or not contain the dismissed brain dump
6. Check `sessionStorage['brain-dump-unified-state']` - should not have orphaned state
7. Start a new brain dump - should work normally without conflicts

**Emergency Recovery**: If the system gets stuck, run in browser console:
```javascript
window.__resetAllBrainDumps()
```

**Related Documentation**:

- Brain Dump Feature: `/apps/web/docs/features/brain-dump/README.md`
- Multi-Layer State Architecture: See "Technical Details" section above
- Notification System: `/NOTIFICATION_SYSTEM_DOCS_MAP.md`

**Date Fixed**: 2025-10-17
**Fixed By**: Claude Code
**Severity**: High (affects core functionality, no data loss but poor UX)
**Status**: ✅ Fixed

---
