---
date: 2025-10-16T08:00:00-08:00
researcher: Claude Code
git_commit: 6a0b7b671c1ac12b9e71c38c2ada052387168723
branch: main
repository: buildos-platform
topic: 'Frontend Notification Preferences Verification After Refactor'
tags:
    [
        research,
        codebase,
        notifications,
        frontend,
        user-preferences,
        onboarding,
        profile,
        admin,
        bug-report
    ]
status: complete
last_updated: 2025-10-16
last_updated_by: Claude Code
path: thoughts/shared/research/2025-10-16_08-00-00_frontend-notification-preferences-verification.md
---

# Research: Frontend Notification Preferences Verification After Refactor

**Date**: 2025-10-16T08:00:00-08:00
**Researcher**: Claude Code
**Git Commit**: 6a0b7b671c1ac12b9e71c38c2ada052387168723
**Branch**: main
**Repository**: buildos-platform

## Research Question

After refactoring the notification preferences system to remove `event_type` from `user_notification_preferences` table, verify that all frontend pages properly use the new global preferences pattern:

1. Profile page `/profile` notifications tab
2. Onboarding V2 flow notifications step
3. Admin pages using notification preferences

## Executive Summary

### ✅ **GOOD NEWS**

- **Profile Page**: Correctly implemented with new refactored pattern
- **API Endpoint**: Properly refactored (one row per user, no event_type)
- **Service Layer**: Correctly updated (no event_type parameters)
- **Admin Pages**: Correctly use event_type for analytics/testing only (not user preferences)

### ❌ **CRITICAL ISSUE FOUND**

**Onboarding V2 NotificationsStep** has a bug that attempts to save preferences using the OLD pattern with `event_type: 'brief.completed'`, which doesn't match the refactored API.

---

## Detailed Findings

## 1. Profile Page - Notifications Tab ✅ CORRECT

### File Structure

```
/apps/web/src/routes/profile/+page.svelte (main profile page)
  └─→ /apps/web/src/lib/components/profile/NotificationsTab.svelte
      ├─→ NotificationPreferences.svelte (global channels)
      ├─→ SMSPreferences.svelte (SMS-specific)
      └─→ ScheduledSMSList.svelte (scheduled messages)
```

### Implementation Analysis

**File**: `/apps/web/src/lib/components/settings/NotificationPreferences.svelte`

**Status**: ✅ **CORRECTLY REFACTORED**

#### What It Does Right:

1. **No event_type usage** (Lines 85, 237):

    ```typescript
    // Line 85 - Loading preferences
    const prefs = await notificationPreferencesService.get(); // No event_type param ✅

    // Line 237 - Saving preferences
    await notificationPreferencesService.update({
    	push_enabled: pushEnabled,
    	in_app_enabled: inAppEnabled,
    	quiet_hours_enabled: quietHoursEnabled,
    	quiet_hours_start: quietHoursStart,
    	quiet_hours_end: quietHoursEnd
    }); // No event_type param ✅
    ```

2. **Global channel preferences** (Lines 40-57):
    - `dailyBriefEmailEnabled` - Daily brief email toggle
    - `dailyBriefSmsEnabled` - Daily brief SMS toggle
    - `pushEnabled` - Push notifications
    - `inAppEnabled` - In-app notifications
    - `quietHoursEnabled` - Quiet hours settings

3. **Separate daily brief handling** (Lines 115-131):
    - Uses `notificationPreferencesStore.save()` for daily brief preferences
    - Correctly saves `should_email_daily_brief` and `should_sms_daily_brief`

#### Minor Issue:

- **Line 23**: Imports `EventType` but never uses it

    ```typescript
    import type { EventType, UserNotificationPreferences } from '@buildos/shared-types';
    ```

    **Fix**: Remove unused `EventType` import

**Code References**:

- `apps/web/src/lib/components/settings/NotificationPreferences.svelte:23` - Unused import
- `apps/web/src/lib/components/settings/NotificationPreferences.svelte:85` - Correct get() call
- `apps/web/src/lib/components/settings/NotificationPreferences.svelte:237` - Correct update() call

---

## 2. Onboarding V2 - Notifications Step ❌ CRITICAL BUG

### File Structure

```
/apps/web/src/routes/onboarding/+page.svelte
  └─→ /apps/web/src/lib/components/onboarding-v2/NotificationsStep.svelte
      └─→ PhoneVerificationCard.svelte
```

### Implementation Analysis

**File**: `/apps/web/src/lib/components/onboarding-v2/NotificationsStep.svelte`

**Status**: ❌ **BUG - Using OLD pattern**

### 🐛 THE BUG (Lines 85-92):

```typescript
// Line 85-92: WRONG - trying to use event_type!
const notifResponse = await fetch('/api/notification-preferences', {
	method: 'PUT',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		event_type: 'brief.completed', // ❌ PROBLEM: API doesn't use event_type anymore!
		sms_enabled: true
	})
});
```

### Why This Is Wrong:

1. **Database schema changed**: `user_notification_preferences` table no longer has `event_type` column
2. **API expects global preferences**: The endpoint now uses `onConflict: 'user_id'` (one row per user)
3. **Field is ignored**: The API will accept the `event_type` field but ignore it (goes into `...updates` spread)
4. **Wrong approach**: Should be setting `should_sms_daily_brief: true` instead

### What The Code Should Be:

```typescript
// CORRECT APPROACH:
const notifResponse = await fetch('/api/notification-preferences', {
	method: 'PUT',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		should_sms_daily_brief: true // ✅ CORRECT: Set daily brief SMS preference
	})
});
```

### Additional Context:

The onboarding step is trying to enable SMS notifications when the user:

1. Verifies their phone number (Lines 36-45)
2. Selects SMS notification options (Lines 64-98)

The code should be setting the **daily brief SMS preference** (`should_sms_daily_brief`), not trying to use event-type-specific preferences that no longer exist.

### Impact:

- **Severity**: Medium (doesn't cause crashes, but preferences may not be saved correctly)
- **User Impact**: Users completing onboarding may not have SMS notifications enabled as expected
- **Data Impact**: No data corruption, but may create confusion about notification settings

**Code References**:

- `apps/web/src/lib/components/onboarding-v2/NotificationsStep.svelte:85-92` - Bug location

---

## 3. Admin Pages ✅ CORRECT (Different Use Case)

### Admin Notification Pages

Admin pages extensively use `event_type`, but this is **CORRECT** because they:

1. Query different tables: `notification_deliveries`, `notification_logs`, `user_notifications`
2. Are used for analytics and testing, NOT user preference management
3. Need to test different event types for the notification system

### Admin Files Using event_type (Correctly):

| File                                                  | Usage                                   | Status |
| ----------------------------------------------------- | --------------------------------------- | ------ |
| `ChannelPayloadEditor.svelte`                         | Admin test payload builder              | ✅ OK  |
| `NotificationTypeSelector.svelte`                     | Event type selection for admin testing  | ✅ OK  |
| `LogFilters.svelte`                                   | Filtering logs by event type            | ✅ OK  |
| `/api/admin/notifications/real-data/[userId]/[event]` | Admin API for testing different events  | ✅ OK  |
| Various analytics endpoints                           | Event-type-based metrics and breakdowns | ✅ OK  |

**These are NOT bugs** - admin tools need to work with event types for testing and monitoring the notification system.

---

## 4. API Endpoint Verification ✅ CORRECT

**File**: `/apps/web/src/routes/api/notification-preferences/+server.ts`

**Status**: ✅ **CORRECTLY REFACTORED**

### GET Handler (Lines 13-48):

```typescript
// Correctly queries by user_id only (no event_type filter)
const { data, error } = await supabase
	.from('user_notification_preferences')
	.select(dailyBrief ? 'should_email_daily_brief, should_sms_daily_brief, updated_at' : '*')
	.eq('user_id', user.id) // Only user_id filter ✅
	.maybeSingle();
```

### PUT Handler (Lines 58-156):

```typescript
// Line 144: Correctly uses user_id as unique constraint
const { data, error } = await supabase.from('user_notification_preferences').upsert(updateData, {
	onConflict: 'user_id' // ✅ One row per user
});
```

### Validation Logic:

- Lines 69-100: Validates phone verification for SMS
- Lines 103-123: Validates brief generation is active for daily brief notifications
- Lines 126-138: Builds update object with global preferences

**Code References**:

- `apps/web/src/routes/api/notification-preferences/+server.ts:44` - Correct query
- `apps/web/src/routes/api/notification-preferences/+server.ts:144` - Correct upsert

---

## 5. Service Layer Verification ✅ CORRECT

**File**: `/apps/web/src/lib/services/notification-preferences.service.ts`

**Status**: ✅ **CORRECTLY REFACTORED**

### Methods Correctly Updated:

#### `get()` Method (Lines 30-53):

```typescript
async get(): Promise<UserNotificationPreferences> {
  const { data, error } = await this.supabase
    .from('user_notification_preferences')
    .select('*')
    .eq('user_id', user.id)  // ✅ No event_type filter
    .maybeSingle();

  return data || this.getDefaults();
}
```

#### `update()` Method (Lines 68-93):

```typescript
async update(updates: Partial<UserNotificationPreferences>): Promise<void> {
  const { error } = await this.supabase.from('user_notification_preferences').upsert(
    {
      user_id: user.id,
      ...updates,
      updated_at: new Date().toISOString()
    },
    {
      onConflict: 'user_id'  // ✅ One row per user
    }
  );
}
```

#### `getDefaults()` Method (Lines 209-225):

```typescript
private getDefaults(): UserNotificationPreferences {
  // Returns GLOBAL defaults (not event-specific) ✅
  return {
    push_enabled: true,
    email_enabled: true,
    sms_enabled: false,
    in_app_enabled: true,
    priority: 'normal',
    batch_enabled: false,
    quiet_hours_enabled: false,
    quiet_hours_start: '22:00:00',
    quiet_hours_end: '08:00:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    should_email_daily_brief: false,
    should_sms_daily_brief: false
  };
}
```

### Important Distinction:

The service also has methods for `notification_subscriptions` table (Lines 96-204), which **DOES use event_type**:

- `subscribe(eventType)` - Subscribe to specific event types
- `unsubscribe(eventType)` - Unsubscribe from event types
- `isSubscribed(eventType)` - Check subscription status

This is a **DIFFERENT table** (`notification_subscriptions`) used for event-level subscriptions, separate from channel preferences in `user_notification_preferences`.

**Code References**:

- `apps/web/src/lib/services/notification-preferences.service.ts:30-53` - Correct get()
- `apps/web/src/lib/services/notification-preferences.service.ts:68-93` - Correct update()
- `apps/web/src/lib/services/notification-preferences.service.ts:209-225` - Global defaults

---

## Architecture Insights

### Two Separate Concepts:

The notification system uses TWO different tables for different purposes:

#### 1. `user_notification_preferences` (Refactored - Global Preferences)

**Purpose**: Channel and delivery preferences (HOW to deliver notifications)

**Schema**:

- `user_id` (UNIQUE) - One row per user
- `push_enabled`, `email_enabled`, `sms_enabled`, `in_app_enabled` - Channel toggles
- `quiet_hours_enabled`, `quiet_hours_start`, `quiet_hours_end` - Timing preferences
- `should_email_daily_brief`, `should_sms_daily_brief` - Daily brief preferences
- **NO `event_type` column**

**Usage**: Profile settings, onboarding preferences, global notification controls

#### 2. `notification_subscriptions` (Still Uses event_type)

**Purpose**: Event subscription management (WHAT events to receive)

**Schema**:

- `user_id`, `event_type` (COMPOSITE UNIQUE) - Multiple rows per user
- `is_active` - Subscription status
- `filters` - Event-specific filters

**Usage**: Subscribe/unsubscribe from specific event types (e.g., "brief.completed", "task.due_soon")

### The Confusion:

The **onboarding bug** appears to be mixing these two concepts:

- It's trying to set channel preferences (`sms_enabled`) using event-type pattern
- Should instead be setting daily brief preferences (`should_sms_daily_brief`)

---

## Summary of Problems Found

### 🐛 Critical Bug:

**Location**: `/apps/web/src/lib/components/onboarding-v2/NotificationsStep.svelte:85-92`

**Problem**: Attempting to save notification preferences with `event_type: 'brief.completed'`

**Fix Required**:

```typescript
// CURRENT (WRONG):
body: JSON.stringify({
	event_type: 'brief.completed', // ❌ Remove this
	sms_enabled: true
});

// SHOULD BE:
body: JSON.stringify({
	should_sms_daily_brief: true // ✅ Set daily brief SMS preference
});
```

### 🔧 Minor Issue:

**Location**: `/apps/web/src/lib/components/settings/NotificationPreferences.svelte:23`

**Problem**: Unused `EventType` import

**Fix**: Remove from import statement

---

## Recommendations

### Immediate Actions:

1. **Fix Onboarding V2 Bug** (High Priority):
    - Update `NotificationsStep.svelte` lines 85-92
    - Remove `event_type` from API call
    - Set `should_sms_daily_brief: true` instead
    - Test onboarding flow end-to-end

2. **Clean Up Imports** (Low Priority):
    - Remove unused `EventType` from `NotificationPreferences.svelte`

### Testing Checklist:

- [ ] Test onboarding V2 flow with SMS enabled
- [ ] Verify preferences saved correctly in database
- [ ] Check profile page notification settings load correctly
- [ ] Ensure daily brief SMS notifications are sent to users who opted in during onboarding

### No Action Needed:

- ✅ Profile page is working correctly
- ✅ API endpoint is properly refactored
- ✅ Service layer is correct
- ✅ Admin pages are correctly using event_type for analytics

---

## Code References Summary

### Files With Issues:

| File                                                            | Lines | Issue                        | Severity | Fix Required                  |
| --------------------------------------------------------------- | ----- | ---------------------------- | -------- | ----------------------------- |
| `apps/web/src/lib/components/onboarding-v2/NotificationsStep.s` | 85-92 | Using old event_type pattern | Critical | Remove event_type, use global |
| `apps/web/src/lib/components/settings/NotificationPreferences`  | 23    | Unused EventType import      | Minor    | Remove from import            |

### Files Correctly Implemented:

| File                                                   | Status | Notes                             |
| ------------------------------------------------------ | ------ | --------------------------------- |
| `apps/web/src/routes/api/notification-preferences/+se` | ✅     | Properly refactored               |
| `apps/web/src/lib/services/notification-preferences.s` | ✅     | Methods updated correctly         |
| `apps/web/src/lib/components/settings/NotificationPre` | ✅     | Uses new pattern (except import)  |
| `apps/web/src/lib/components/profile/NotificationsTa`  | ✅     | Container component working       |
| Admin notification pages                               | ✅     | Correctly use event_type for logs |

---

## Related Documentation

- **Refactor Analysis**: `thoughts/shared/research/2025-10-16_notification-preferences-refactor-analysis.md`
- **Implementation Phases**: `thoughts/shared/research/2025-10-16_notification-preferences-refactor-implementation-phases.md`
- **Notification System Map**: `/NOTIFICATION_SYSTEM_DOCS_MAP.md`

---

## Conclusion

The notification preferences refactor was **mostly successful**:

- ✅ Profile page correctly uses global preferences
- ✅ API and service layer properly refactored
- ✅ Admin tools correctly use event_type for analytics
- ❌ Onboarding V2 has a critical bug using old pattern

**Priority Fix**: Update `NotificationsStep.svelte` to use `should_sms_daily_brief` instead of trying to set event-type-specific preferences.

The bug is **non-breaking** (API will accept the request) but **functionally incorrect** (preferences won't be saved as intended). Users completing onboarding may not receive SMS notifications as expected.
