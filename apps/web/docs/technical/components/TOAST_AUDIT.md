<!-- apps/web/docs/technical/components/TOAST_AUDIT.md -->
# Toast System Audit - BuildOS Platform

**Audit Date:** 2026-01-01
**Scope:** Complete toast usage analysis across `/apps/web/`
**Status:** Initial Audit Complete

---

## Executive Summary

BuildOS has a robust toast notification system with **369 total toast usages** across the codebase. However, this audit identified **18 components with zero toast coverage** despite making API calls, and **45 components with inconsistent toast patterns**. The most critical gaps are in **account management** and **SMS operations**.

### Key Findings

| Metric | Value |
|--------|-------|
| Total Toast Usages | 369 |
| Success Toasts | 126 (34%) |
| Error Toasts | 187 (51%) |
| Warning Toasts | 15 (4%) |
| Info Toasts | 20 (5%) |
| Custom Toasts | 21 (6%) |
| Components with Full Coverage | 85 (57%) |
| Components with Partial Coverage | 45 (30%) |
| Components with No Coverage | 18 (12%) |

---

## 1. Toast Infrastructure

### Core Files

| File | Purpose |
|------|---------|
| `/src/lib/stores/toast.store.ts` | Core toast store and service |
| `/src/lib/components/ui/Toast.svelte` | Individual toast component |
| `/src/lib/components/ui/ToastContainer.svelte` | Toast stack manager |

### Toast Types

| Type | Usage | Appearance |
|------|-------|------------|
| `success` | Completed actions, confirmations | Emerald/green |
| `error` | Failures, validation errors | Red |
| `warning` | Partial failures, cautions | Amber/yellow |
| `info` | Status updates, neutral info | Blue |

### API Reference

```typescript
import { toastService } from '$lib/stores/toast.store';

// Standard methods
toastService.success(message: string, options?: ToastOptions)
toastService.error(message: string, options?: ToastOptions)
toastService.warning(message: string, options?: ToastOptions)
toastService.info(message: string, options?: ToastOptions)

// Advanced
toastService.add(toast: Toast)      // Full customization
toastService.remove(id: string)     // Manual removal
toastService.clear()                // Clear all toasts

// Options
interface ToastOptions {
  duration?: number;  // Default: 5000ms
  action?: {
    label: string;
    onClick: () => void;
  };
}
```

---

## 2. Current Toast Usage by Feature Area

### 2.1 Authentication & Account ✅ Partial Coverage

| Component | Toasts | Gap Analysis |
|-----------|--------|--------------|
| `auth/login/+page.svelte` | 2 | ✅ Good |
| `auth/register/+page.svelte` | 3 | ✅ Good |
| `AccountSettingsModal.svelte` | 0 | ❌ **CRITICAL** - No feedback on password/email changes |
| `AccountTab.svelte` | 0 | ❌ **CRITICAL** - Silent account mutations |

### 2.2 Project Management ✅ Good Coverage

| Component | Success | Error | Info | Warning |
|-----------|---------|-------|------|---------|
| `projects/[id]/+page.svelte` | 2 | 2 | - | - |
| `TasksList.svelte` | 6 | 6 | 3 | - |
| `PhasesSection.svelte` | 2 | 2 | 3 | - |
| `TaskModal.svelte` | 5 | 10 | - | 1 |
| `ProjectContextDocModal.svelte` | 2 | 1 | 2 | - |
| `ProjectCalendarSettingsModal.svelte` | 4 | 4 | - | - |

### 2.3 Daily Briefs ✅ Excellent Coverage

| Component | Success | Error | Info | Warning |
|-----------|---------|-------|------|---------|
| `briefs/+page.svelte` | 4 | 3 | - | - |
| `DailyBriefModal.svelte` | 4 | 3 | - | - |
| `DailyBriefsTab.svelte` | 4 | 3 | - | - |
| `BriefsSettingsModal.svelte` | 4 | 3 | - | - |

### 2.4 Ontology System ✅ Good Coverage

| Component | Success | Error | Info |
|-----------|---------|-------|------|
| `DocumentModal.svelte` | 2 | 3 | - |
| `OutputEditModal.svelte` | 3 | 4 | - |
| `TaskEditModal.svelte` | 4 | 4 | - |
| `LinkedEntities.svelte` | 2 | 3 | - |
| `OntologyContextDocModal.svelte` | 1 | 1 | 1 |
| `OntologyProjectEditModal.svelte` | 3 | 2 | 1 |

### 2.5 Brain Dump System ✅ Good Coverage

| Component | Success | Error | Warning | Info |
|-----------|---------|-------|---------|------|
| `BrainDumpModal.svelte` | - | 7 | 5 | 1 |
| `BrainDumpModalContent.svelte` | 4 | 6 | - | 1 |
| `brain-dump-navigation.ts` | 4 | - | - | 1 |

### 2.6 Notification & SMS Settings ⚠️ Partial Coverage

| Component | Success | Error | Info | Gap |
|-----------|---------|-------|------|-----|
| `NotificationPreferences.svelte` | 5 | 2 | - | ✅ Good |
| `PhoneVerification.svelte` | 2 | 3 | - | ✅ Good |
| `SMSPreferences.svelte` | 1 | 2 | 1 | ✅ Good |
| `ScheduledSMSList.svelte` | 0 | 0 | 0 | ❌ **HIGH** - Silent SMS ops |
| `NotificationsTab.svelte` | 0 | 0 | 0 | ❌ Medium |

### 2.7 Calendar Integration ⚠️ Partial Coverage

| Component | Toasts | Gap |
|-----------|--------|-----|
| `CalendarTab.svelte` | 3 error, 1 success | ✅ Good |
| `CalendarAnalysisResults.svelte` | 2 success, 3 error, 1 warning, 1 info | ✅ Good |
| `TimePlayCalendar.svelte` | 0 | ❌ **Medium** - Silent fetch failures |
| `CalendarConnectionOverlay.svelte` | 0 | ❌ Low |

### 2.8 Admin Features ⚠️ Inconsistent Coverage

| Component | Toasts | Gap |
|-----------|--------|-----|
| `sms-scheduler/+page.svelte` | 8+ | ✅ Good |
| `EmailComposerModal.svelte` | 8 | ✅ Good |
| `UserContextPanel.svelte` | 0 | ❌ Medium |
| `UserActivityModal.svelte` | 0 | ❌ Medium |
| `SessionDetailModal.svelte` | 0 | ❌ Low |
| `ErrorBrowser.svelte` | 0 | ❌ Low |

### 2.9 Agent Features ⚠️ Inconsistent Coverage

| Component | Toasts | Gap |
|-----------|--------|-----|
| `AgentChatModal.svelte` | Partial | ⚠️ Inconsistent - some paths missing |
| `OperationsQueue.svelte` | 0 | ❌ Medium |
| `ProjectFocusSelector.svelte` | 0 | ❌ Low |
| `OperationsLog.svelte` | 0 | ❌ Low |

---

## 3. Critical Gaps Identified

### 3.1 Priority 1: CRITICAL - Must Fix

#### Gap: Account Management - Zero Feedback
**Files:**
- `/src/lib/components/profile/AccountSettingsModal.svelte`
- `/src/lib/components/profile/AccountTab.svelte`

**Issue:** Password changes, email updates, and account settings mutations have **zero toast feedback**. Users cannot tell if their password change succeeded or failed.

**Impact:** HIGH - Security-sensitive operations with no user confirmation.

**Required Toasts:**
```typescript
// Password change
toastService.success('Password changed successfully');
toastService.error('Failed to change password: ' + error.message);

// Email update
toastService.success('Email updated successfully');
toastService.error('Failed to update email');

// Account settings
toastService.success('Account settings saved');
toastService.error('Failed to save settings');
```

#### Gap: SMS Operations - Silent Failures
**File:** `/src/lib/components/profile/ScheduledSMSList.svelte`

**Issue:** Delete and manage operations for scheduled SMS have no feedback.

**Impact:** HIGH - Users won't know if SMS changes took effect.

**Required Toasts:**
```typescript
// Delete SMS
toastService.success('Scheduled SMS deleted');
toastService.error('Failed to delete SMS');

// Load failure
toastService.error('Failed to load scheduled messages');
```

### 3.2 Priority 2: HIGH - Should Fix Soon

#### Gap: Calendar Fetch Failures
**File:** `/src/lib/components/time-blocks/TimePlayCalendar.svelte`

**Issue:** Calendar event loading failures only log to console.

**Impact:** MEDIUM - Users see blank calendar with no explanation.

**Required Toasts:**
```typescript
toastService.error('Failed to load calendar events. Please refresh.');
```

#### Gap: Agent Chat Inconsistency
**File:** `/src/lib/components/agent/AgentChatModal.svelte`

**Issue:** Multiple fetch operations (lines 468, 725, 1040, 1802) with inconsistent error handling.

**Impact:** MEDIUM - Some agent failures are silent, others show toasts.

**Fix:** Audit all fetch calls and add consistent error toasts.

### 3.3 Priority 3: MEDIUM - Fix When Touching

#### Admin Data Loading
**Files:**
- `UserActivityModal.svelte`
- `UserContextPanel.svelte`
- `SessionDetailModal.svelte`

**Issue:** Admin data loads fail silently.

**Required:** Error toasts for all admin fetch operations.

#### Notification Tab
**File:** `/src/lib/components/profile/NotificationsTab.svelte`

**Issue:** SMS preferences fetch has no error feedback.

### 3.4 Priority 4: LOW - Nice to Have

- Test components (`LogoutTest.svelte`)
- Landing page components (`ExampleProjectGraph.svelte`)
- Agent visualization components (`PlanVisualization.svelte`, `OperationsLog.svelte`)

---

## 4. Toast Message Guidelines

### 4.1 Message Format Standards

#### Success Messages
```typescript
// ✅ Good - Specific and actionable
toastService.success('Project "Marketing Q1" created successfully!');
toastService.success('5 tasks moved to "In Progress" phase');
toastService.success('Calendar events synced');

// ❌ Bad - Vague
toastService.success('Success');
toastService.success('Done');
toastService.success('OK');
```

#### Error Messages
```typescript
// ✅ Good - Explains what failed and why
toastService.error('Failed to save task: Network error. Please try again.');
toastService.error('Cannot delete project: You have pending tasks.');

// ❌ Bad - Unhelpful
toastService.error('Error');
toastService.error('Something went wrong');
toastService.error(error.message); // May expose internal details
```

#### Warning Messages
```typescript
// ✅ Good - Warns about consequences
toastService.warning('Auto-save failed. Your draft may not be saved.');
toastService.warning('Some tasks could not be scheduled due to conflicts.');

// ❌ Bad - Unclear risk
toastService.warning('Warning');
```

#### Info Messages
```typescript
// ✅ Good - Provides context
toastService.info('Brain dump queued - 3 brain dumps already processing');
toastService.info('New task added by another device');

// ❌ Bad - Unnecessary noise
toastService.info('Loading...');
toastService.info('Processing');
```

### 4.2 When to Use Each Type

| Scenario | Type | Example |
|----------|------|---------|
| CRUD operation succeeded | `success` | "Task deleted" |
| CRUD operation failed | `error` | "Failed to delete task" |
| Partial success | `warning` | "3 of 5 tasks scheduled" |
| Background event | `info` | "New brief available" |
| Validation error | `error` | "Please enter a valid date" |
| Rate limiting | `warning` | "Too many requests, please wait" |
| Data sync conflict | `warning` | "Changes saved, but conflicts detected" |
| Real-time update | `info` | "Project updated by another user" |

### 4.3 Duration Guidelines

| Scenario | Duration | Rationale |
|----------|----------|-----------|
| Simple confirmation | 3000ms | Quick acknowledgment |
| Standard success/error | 5000ms (default) | Time to read |
| Complex message | 7000ms | More content to read |
| Requires action | 10000ms+ | User needs to respond |
| Quick transition | 1000ms | e.g., "Signing out..." |

---

## 5. Underutilized Toast Features

### 5.1 Warning Toasts (Only 4% Usage)

**Current:** Mostly used for auto-save failures and partial operations.

**Opportunities:**
- Rate limiting feedback
- Approaching storage limits
- Calendar sync conflicts
- Validation warnings (non-blocking)
- Deprecated feature notices

### 5.2 Info Toasts (Only 5% Usage)

**Current:** Real-time updates and queue status.

**Opportunities:**
- Background processing status
- Feature hints/tips
- Sync status updates
- "Changes saved automatically" confirmations
- Session timeout warnings

### 5.3 Action Buttons

**Current:** Rarely used.

**Opportunities:**
```typescript
toastService.error('Failed to save. Would you like to retry?', {
  action: {
    label: 'Retry',
    onClick: () => saveData()
  }
});

toastService.info('Your brief is ready', {
  action: {
    label: 'View',
    onClick: () => openBrief()
  }
});
```

---

## 6. Implementation Plan

### Phase 1: Critical Fixes (Priority 1)
**Estimated Effort:** 2-3 hours

- [ ] Add toasts to `AccountSettingsModal.svelte`
  - Password change success/error
  - Email update success/error
  - Account deletion confirmation

- [ ] Add toasts to `AccountTab.svelte`
  - All account mutation operations

- [ ] Add toasts to `ScheduledSMSList.svelte`
  - SMS delete success/error
  - Load failure error

### Phase 2: High Priority Fixes (Priority 2)
**Estimated Effort:** 3-4 hours

- [ ] Add error toast to `TimePlayCalendar.svelte`
  - Calendar fetch failure

- [ ] Audit and fix `AgentChatModal.svelte`
  - Standardize all fetch error handling
  - Add missing toasts

- [ ] Add toasts to admin data loading components
  - `UserActivityModal.svelte`
  - `UserContextPanel.svelte`

### Phase 3: Medium Priority Fixes (Priority 3)
**Estimated Effort:** 2-3 hours

- [ ] Add toasts to `NotificationsTab.svelte`
- [ ] Add toasts to agent operation components
- [ ] Review and add warning toasts for partial operations
- [ ] Add info toasts for background processing status

### Phase 4: Consistency Pass (Priority 4)
**Estimated Effort:** 1-2 hours

- [ ] Standardize all error message formats
- [ ] Add action buttons where appropriate
- [ ] Review toast durations for consistency
- [ ] Update remaining low-priority components

---

## 7. Components Requiring Updates

### Must Update (Priority 1)

| Component | File Path | Required Toasts |
|-----------|-----------|-----------------|
| AccountSettingsModal | `/src/lib/components/profile/AccountSettingsModal.svelte` | Password, email, settings |
| AccountTab | `/src/lib/components/profile/AccountTab.svelte` | All account mutations |
| ScheduledSMSList | `/src/lib/components/profile/ScheduledSMSList.svelte` | Delete, load |

### Should Update (Priority 2)

| Component | File Path | Required Toasts |
|-----------|-----------|-----------------|
| TimePlayCalendar | `/src/lib/components/time-blocks/TimePlayCalendar.svelte` | Fetch error |
| AgentChatModal | `/src/lib/components/agent/AgentChatModal.svelte` | Standardize all |
| UserActivityModal | `/src/lib/components/admin/UserActivityModal.svelte` | Fetch error |
| UserContextPanel | `/src/lib/components/admin/UserContextPanel.svelte` | Fetch error |

### Consider Updating (Priority 3-4)

| Component | File Path | Notes |
|-----------|-----------|-------|
| NotificationsTab | `/src/lib/components/profile/NotificationsTab.svelte` | Fetch error |
| OperationsQueue | `/src/lib/components/agent/OperationsQueue.svelte` | Operation feedback |
| SessionDetailModal | `/src/lib/components/admin/SessionDetailModal.svelte` | Fetch error |
| CalendarConnectionOverlay | `/src/lib/components/calendar/CalendarConnectionOverlay.svelte` | Connection error |

---

## 8. Appendix: Full Toast Inventory

### Success Toasts (126 usages)

<details>
<summary>Click to expand full list</summary>

| Location | Message |
|----------|---------|
| `auth/login/+page.svelte:132` | Login successful |
| `auth/register/+page.svelte:31` | Registration successful |
| `projects/[id]/+page.svelte:521` | "Data refreshed" |
| `projects/[id]/+page.svelte:662` | "Project deleted" |
| `briefs/+page.svelte:510` | "Brief exported successfully" |
| `briefs/+page.svelte:520` | "Brief copied to clipboard" |
| `briefs/+page.svelte:538` | "Brief deleted successfully" |
| `DailyBriefModal.svelte:149` | "Brief regenerated successfully!" |
| `DailyBriefModal.svelte:180` | "Brief copied to clipboard" |
| `DailyBriefModal.svelte:199` | "Brief downloaded" |
| `DailyBriefModal.svelte:208` | "Email notifications enabled!" |
| `TasksList.svelte:378` | "Task restored successfully" |
| `TasksList.svelte:418` | "Task marked as complete/incomplete" |
| `TasksList.svelte:501` | "X tasks moved to phase Y" |
| `TasksList.svelte:577` | "X tasks scheduled/assigned" |
| `TasksList.svelte:682` | "X task dates removed" |
| `TasksList.svelte:769` | "X tasks deleted" |
| ... (100+ more) |

</details>

### Error Toasts (187 usages)

<details>
<summary>Click to expand full list</summary>

| Location | Message Pattern |
|----------|-----------------|
| `auth/login/+page.svelte:140` | Login error |
| `auth/register/+page.svelte:39` | Registration error |
| `projects/[id]/+page.svelte:524` | Refresh failure |
| `projects/[id]/+page.svelte:668` | Delete failure |
| `briefs/+page.svelte:409` | Generation error |
| `briefs/+page.svelte:513` | "Failed to export brief" |
| `briefs/+page.svelte:523` | "Failed to copy brief" |
| `briefs/+page.svelte:541` | "Failed to delete brief" |
| `TaskModal.svelte:477` | "Failed to refresh calendar connection." |
| `TaskModal.svelte:495` | "Failed to connect calendar." |
| `TaskModal.svelte:606` | "Cannot delete task: Invalid task ID." |
| `BrainDumpModal.svelte:426` | Processing error |
| `BrainDumpModal.svelte:950` | "Cannot process: validation failed." |
| ... (170+ more) |

</details>

### Warning Toasts (15 usages)

| Location | Message |
|----------|---------|
| `TaskModal.svelte:472` | Calendar disconnection warning |
| `BrainDumpModal.svelte:671` | Auto-save warning |
| `BrainDumpModal.svelte:729` | Audio duration warning |
| `BrainDumpModal.svelte:750` | Processing limit warning |
| `BrainDumpModal.svelte:852` | "Auto-save failed. Your draft may not be saved." |
| `CalendarAnalysisResults.svelte:370` | Partial success warning |

### Info Toasts (20 usages)

| Location | Message |
|----------|---------|
| `Navigation.svelte:134` | "Signing out..." |
| `TasksList.svelte:611` | "No tasks have dates to remove" |
| `PhasesSection.svelte:333` | "All tasks are already scheduled" |
| `PhasesSection.svelte:374` | "No backlog tasks to assign" |
| `PhasesSection.svelte:400` | "No overdue tasks found" |
| `OntologyContextDocModal.svelte:81` | "No changes to save" |
| `SMSPreferences.svelte:106` | "You have been opted out of SMS notifications" |
| `realtimeProject.service.ts:256` | "New task added" |
| `realtimeProject.service.ts:273` | "Task removed" |
| `brain-dump-navigation.ts:215` | "📥 Updates available - refresh to see changes" |

---

## 9. Changelog

| Date | Change |
|------|--------|
| 2026-01-01 | Initial audit completed |

---

*This document should be updated after each phase of implementation is complete.*
