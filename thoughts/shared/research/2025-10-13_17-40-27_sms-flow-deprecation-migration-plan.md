---
date: 2025-10-13T17:40:27-07:00
researcher: Claude Code
git_commit: 6e0f4fcff7e4b19f003d75ccb8634f8f2b78b41a
branch: main
repository: buildos-platform
topic: "SMS Flow Deprecation and Migration Plan - Cleaning Up After Daily Brief Notification Refactor"
tags:
  [
    migration,
    sms,
    notifications,
    database-schema,
    refactoring,
    user_sms_preferences,
  ]
status: phase3-migration-files-created
last_updated: 2025-10-15T02:00:00-07:00
last_updated_by: Claude Code
last_updated_note: "Phase 3 migration files created - ready for deployment after 2-week observation period"
related_docs:
  - thoughts/shared/research/2025-10-13_04-55-45_overlapping-notification-preferences-analysis.md
  - thoughts/shared/research/2025-10-13_06-00-00_daily-brief-notification-refactor-plan.md
  - docs/architecture/decisions/ADR-001-user-level-notification-preferences.md
implementation_files:
  - apps/worker/src/lib/utils/smsPreferenceChecks.ts (NEW - Phase 1)
  - apps/worker/src/workers/notification/smsAdapter.ts (MODIFIED - Phase 1)
  - apps/worker/src/workers/notification/preferenceChecker.ts (MODIFIED - Phase 1)
  - supabase/migrations/20251013_phase1_remove_daily_brief_sms_check.sql (NEW - Phase 1)
  - apps/web/src/routes/api/sms/preferences/+server.ts (MODIFIED - Phase 2)
  - apps/web/src/lib/components/settings/SMSPreferences.svelte (MODIFIED - Phase 2)
  - apps/web/src/lib/components/onboarding-v2/NotificationsStep.svelte (MODIFIED - Phase 2)
  - apps/web/src/lib/services/sms.service.ts (MODIFIED - Phase 2)
  - apps/web/docs/features/onboarding-v2/README.md (MODIFIED - Phase 2)
  - supabase/migrations/20251015_deprecate_unused_sms_fields.sql (NEW - Phase 3a)
  - supabase/migrations/20251029_remove_deprecated_sms_fields.sql (NEW - Phase 3b)
---

# SMS Flow Deprecation and Migration Plan

**Date**: 2025-10-13T17:40:27-07:00
**Researcher**: Claude Code
**Git Commit**: 6e0f4fcff7e4b19f003d75ccb8634f8f2b78b41a
**Branch**: main
**Repository**: buildos-platform

## Executive Summary

After the daily brief notification refactor (completed 2025-10-13), several SMS preference fields in `user_sms_preferences` are now deprecated or were never implemented. This document provides a comprehensive migration plan to:

1. **Fix critical bugs** introduced by the refactor (quiet hours and rate limiting bypass)
2. **Remove deprecated fields** that are redundant or never used
3. **Define clean SMS flow architecture** for future development

**Impact**: Medium risk, requires code changes + database migration + UI updates

---

## Background

### The Refactor (2025-10-13)

**Goal**: Separate brief generation timing from notification delivery

**What Changed**:

- Added `should_email_daily_brief` and `should_sms_daily_brief` to `user_notification_preferences` (event_type='user')
- Deprecated `email_daily_brief` in `user_brief_preferences`
- **BUT**: Left `daily_brief_sms` in `user_sms_preferences` - now redundant!

**Side Effects**:

- Daily brief SMS notifications now bypass quiet hours checks
- Daily brief SMS notifications now bypass rate limiting
- Users must enable SMS in TWO places (confusing UX)

### Current SMS Flows

| SMS Flow                  | Status                 | Implementation                                            |
| ------------------------- | ---------------------- | --------------------------------------------------------- |
| `event_reminders_enabled` | ✅ **WORKING**         | Fully implemented, runs nightly at midnight               |
| `morning_kickoff_enabled` | ❌ **NOT IMPLEMENTED** | UI exists, no worker code                                 |
| `evening_recap_enabled`   | ❌ **NOT IMPLEMENTED** | UI exists, no worker code                                 |
| `next_up_enabled`         | ❌ **NOT IMPLEMENTED** | UI exists, no worker code                                 |
| `task_reminders`          | ❌ **NEVER USED**      | Field exists, no implementation anywhere                  |
| `daily_brief_sms`         | ⚠️ **REDUNDANT**       | Duplicate of `should_sms_daily_brief` (event_type='user') |

---

## Critical Issues Found

### 🚨 Issue 1: Daily Brief SMS Bypasses Quiet Hours

**Problem**: Notification system SMS does NOT check quiet hours

**Evidence**:

- ✅ Calendar SMS checks quiet hours: `dailySmsWorker.ts:220-251`
- ❌ Daily brief SMS does NOT check: `smsAdapter.ts` missing quiet hours validation

**Impact**: Users receive daily brief SMS during sleep hours (e.g., 2 AM)

**Risk Level**: HIGH - User frustration, opt-outs, complaints

---

### 🚨 Issue 2: Daily Brief SMS Bypasses Rate Limiting

**Problem**: Notification system SMS does NOT check daily SMS limits

**Evidence**:

- ✅ Calendar SMS checks limits: `dailySmsWorker.ts:104-129`, `smsWorker.ts:173-197`
- ❌ Daily brief SMS does NOT check: `smsAdapter.ts` missing rate limit validation

**Impact**: Could send unlimited SMS notifications (spam risk, cost risk)

**Risk Level**: HIGH - Twilio costs, user annoyance, carrier blocks

---

### ⚠️ Issue 3: Duplicate SMS Preference Checks

**Problem**: Daily brief SMS requires TWO flags to be enabled

**Current Logic**:

```typescript
// File: apps/worker/src/workers/notification/preferenceChecker.ts:176-186

// Check 1: user_notification_preferences (event_type='user')
should_sms_daily_brief = true;

// Check 2: user_sms_preferences
daily_brief_sms = true;

// BOTH must be true for SMS to send!
```

**Impact**: Confusing UX - users don't know which toggle to use

**Risk Level**: MEDIUM - User confusion, support burden

---

## Deprecated Fields Analysis

### Fields to REMOVE

| Field             | Location               | Reason                                                      | Impact                                   |
| ----------------- | ---------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| `daily_brief_sms` | `user_sms_preferences` | Redundant with `should_sms_daily_brief` (event_type='user') | ⚠️ Active code usage - must update first |
| `task_reminders`  | `user_sms_preferences` | Never implemented, no worker flow                           | ⚠️ Active UI + API - safe to remove      |
| `next_up_enabled` | `user_sms_preferences` | Never implemented, no worker flow                           | ⚠️ Active UI + API - safe to remove      |

### Fields to KEEP

| Field                              | Location               | Reason                           | Status             |
| ---------------------------------- | ---------------------- | -------------------------------- | ------------------ |
| `event_reminders_enabled`          | `user_sms_preferences` | Fully working production feature | ✅ Keep            |
| `event_reminder_lead_time_minutes` | `user_sms_preferences` | Used by event reminders          | ✅ Keep            |
| `morning_kickoff_enabled`          | `user_sms_preferences` | Future feature (UI ready)        | ⏳ Keep for future |
| `morning_kickoff_time`             | `user_sms_preferences` | Future feature (UI ready)        | ⏳ Keep for future |
| `evening_recap_enabled`            | `user_sms_preferences` | Future feature (UI ready)        | ⏳ Keep for future |
| `phone_number`                     | `user_sms_preferences` | Essential for SMS                | ✅ Keep            |
| `phone_verified`                   | `user_sms_preferences` | Essential for SMS                | ✅ Keep            |
| `opted_out`                        | `user_sms_preferences` | Essential for SMS                | ✅ Keep            |
| `quiet_hours_start/end`            | `user_sms_preferences` | Prevents sleep disruption        | ✅ Keep            |
| `daily_sms_limit/count`            | `user_sms_preferences` | Prevents spam                    | ✅ Keep            |

---

## Migration Plan

### Phase 1: Fix Critical Bugs (Deploy ASAP)

**Goal**: Make daily brief SMS respect quiet hours and rate limits

**Priority**: 🚨 CRITICAL - Deploy before removing any fields

#### Task 1.1: Add Quiet Hours Check to Notification SMS

**File**: `apps/worker/src/workers/notification/smsAdapter.ts`

**Location**: Before line 450 (before queuing SMS job)

**Code Changes**:

```typescript
// Add quiet hours validation
const { data: smsPrefs, error: smsError } = await supabase
  .from("user_sms_preferences")
  .select("quiet_hours_start, quiet_hours_end, timezone")
  .eq("user_id", delivery.recipient_user_id)
  .single();

if (smsError) {
  logger.error(
    "Failed to fetch SMS preferences for quiet hours check",
    smsError,
  );
  // Continue without quiet hours check (fail open)
}

if (smsPrefs && smsPrefs.quiet_hours_start && smsPrefs.quiet_hours_end) {
  const now = new Date();
  const userTimezone = smsPrefs.timezone || "UTC";
  const isInQuietHours = checkQuietHours(
    now,
    smsPrefs.quiet_hours_start,
    smsPrefs.quiet_hours_end,
    userTimezone,
  );

  if (isInQuietHours) {
    logger.info("SMS delivery in quiet hours - rescheduling", {
      userId: delivery.recipient_user_id,
      quietHoursStart: smsPrefs.quiet_hours_start,
      quietHoursEnd: smsPrefs.quiet_hours_end,
    });

    // Reschedule to end of quiet hours
    const rescheduledTime = calculateQuietHoursEnd(
      smsPrefs.quiet_hours_end,
      userTimezone,
    );

    await supabase
      .from("notification_deliveries")
      .update({
        status: "scheduled",
        scheduled_for: rescheduledTime.toISOString(),
      })
      .eq("id", delivery.id);

    return { success: true, rescheduled: true };
  }
}
```

**Helper Function Needed**: Import from `smsWorker.ts` or create shared utility:

```typescript
// apps/worker/src/lib/utils/quietHoursChecker.ts
import { utcToZonedTime } from "date-fns-tz";

export function checkQuietHours(
  time: Date,
  quietStart: string, // HH:MM:SS
  quietEnd: string, // HH:MM:SS
  timezone: string,
): boolean {
  const timeInUserTz = utcToZonedTime(time, timezone);
  const hour = timeInUserTz.getHours();
  const minute = timeInUserTz.getMinutes();
  const timeMinutes = hour * 60 + minute;

  const [startHour, startMin] = quietStart.split(":").map(Number);
  const [endHour, endMin] = quietEnd.split(":").map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  // Handle overnight quiet hours (e.g., 22:00 - 08:00)
  if (startMinutes < endMinutes) {
    return timeMinutes >= startMinutes && timeMinutes < endMinutes;
  } else {
    return timeMinutes >= startMinutes || timeMinutes < endMinutes;
  }
}
```

---

#### Task 1.2: Add Rate Limit Check to Notification SMS

**File**: `apps/worker/src/workers/notification/smsAdapter.ts`

**Location**: Before line 445 (before quiet hours check)

**Code Changes**:

```typescript
// Check daily SMS limit
const { data: smsPrefs, error: smsError } = await supabase
  .from("user_sms_preferences")
  .select("daily_sms_count, daily_sms_limit, daily_count_reset_at")
  .eq("user_id", delivery.recipient_user_id)
  .single();

if (smsError) {
  logger.error(
    "Failed to fetch SMS preferences for rate limit check",
    smsError,
  );
  // Fail closed - if we can't check limits, don't send
  return { success: false, error: "Failed to verify SMS rate limit" };
}

if (!smsPrefs) {
  logger.error("No SMS preferences found for user", {
    userId: delivery.recipient_user_id,
  });
  return { success: false, error: "SMS preferences not configured" };
}

// Check if daily count needs reset
const today = format(new Date(), "yyyy-MM-dd");
const lastReset = smsPrefs.daily_count_reset_at
  ? format(parseISO(smsPrefs.daily_count_reset_at), "yyyy-MM-dd")
  : null;

if (!lastReset || lastReset !== today) {
  // Reset count
  await supabase
    .from("user_sms_preferences")
    .update({
      daily_sms_count: 0,
      daily_count_reset_at: new Date().toISOString(),
    })
    .eq("user_id", delivery.recipient_user_id);

  smsPrefs.daily_sms_count = 0;
}

const currentCount = smsPrefs.daily_sms_count || 0;
const limit = smsPrefs.daily_sms_limit || 10;

if (currentCount >= limit) {
  logger.warn("Daily SMS limit reached", {
    userId: delivery.recipient_user_id,
    count: currentCount,
    limit: limit,
  });

  await supabase
    .from("notification_deliveries")
    .update({
      status: "failed",
      failed_at: new Date().toISOString(),
      last_error: `Daily SMS limit reached (${currentCount}/${limit})`,
    })
    .eq("id", delivery.id);

  return { success: false, error: "Daily SMS limit reached" };
}

// Increment count BEFORE sending (prevents race conditions)
await supabase
  .from("user_sms_preferences")
  .update({
    daily_sms_count: currentCount + 1,
  })
  .eq("user_id", delivery.recipient_user_id);
```

---

#### Task 1.3: Remove Redundant `daily_brief_sms` Check

**File**: `apps/worker/src/workers/notification/preferenceChecker.ts`

**Action**: Remove lines 176-186

**Current Code** (REMOVE THIS):

```typescript
// Special check for brief.completed SMS
if (eventType === "brief.completed") {
  if (!smsPrefs.daily_brief_sms) {
    prefLogger.info("SMS not allowed - daily brief SMS disabled", {
      userId,
    });
    return {
      allowed: false,
      reason: "Daily brief SMS notifications disabled",
      preferences: prefs,
    };
  }
}
```

**New Code** (NO SPECIAL CASE):

```typescript
// Remove the special case entirely
// Daily brief SMS is now controlled by:
// - user_notification_preferences.should_sms_daily_brief (event_type='user')
// - user_sms_preferences.phone_verified, opted_out, phone_number
```

**Migration Note**: This change means users will only need to enable SMS in ONE place (user_notification_preferences), not two.

---

#### Task 1.4: Update SQL Function

**File**: `supabase/migrations/20251013_fix_notification_broadcast_bug.sql`

**Action**: Update line 238 in `emit_notification_event()` function

**Current Code**:

```sql
v_should_send_sms := COALESCE(v_sms_prefs.daily_brief_sms, false);
```

**New Code**:

```sql
-- No longer check daily_brief_sms for brief.completed
-- Rely on user_notification_preferences.should_sms_daily_brief instead
v_should_send_sms := true; -- SMS preferences already validated by notification system
```

**OR** create a new migration to drop this check entirely.

---

### Phase 1 Implementation Notes (2025-10-13)

**Status**: ✅ COMPLETED

#### What Was Actually Implemented

##### 1. Created Shared SMS Preference Utility

**File**: `/apps/worker/src/lib/utils/smsPreferenceChecks.ts` (NEW)

Instead of duplicating quiet hours and rate limit logic, created a shared utility with three key functions:

1. **`checkQuietHours()`** - Timezone-aware quiet hours checking
   - Handles overnight quiet hours (e.g., 22:00 - 08:00)
   - Returns reschedule time if in quiet hours
   - Uses `date-fns-tz` for proper timezone conversion

2. **`checkAndUpdateRateLimit()`** - Daily SMS limit enforcement
   - Checks and resets count at midnight
   - Increments count BEFORE sending (prevents race conditions)
   - Returns detailed results for logging

3. **`performSMSSafetyChecks()`** - All-in-one safety check
   - Checks phone verification, quiet hours, and rate limits
   - Gets timezone from `users.timezone` (not deprecated `user_sms_preferences.timezone`)
   - Returns comprehensive results for monitoring

##### 2. Added Safety Checks to smsAdapter.ts

**File**: `/apps/worker/src/workers/notification/smsAdapter.ts`

**Changes**:

- Line 15: Added import for `performSMSSafetyChecks`
- Lines 435-518: Added comprehensive safety checks BEFORE sending SMS
  - Checks run before creating sms_messages record
  - Reschedules SMS if in quiet hours (updates notification_deliveries)
  - Marks as failed if rate limit reached or phone not verified
  - Detailed logging for monitoring

**Implementation Difference from Plan**:

- Used the all-in-one `performSMSSafetyChecks()` function instead of separate checks
- More robust error handling and logging
- Safety checks run earlier in the flow (before queueing)

##### 3. Removed Redundant daily_brief_sms Check

**File**: `/apps/worker/src/workers/notification/preferenceChecker.ts`

**Changes**:

- Line 126: Removed `daily_brief_sms` from SELECT query
- Removed lines 175-187: Special case check for `brief.completed` event type

**Result**: Users now only need to enable SMS in ONE place (`should_sms_daily_brief` in `user_notification_preferences`), not two.

##### 4. Updated SQL Function

**File**: `/supabase/migrations/20251013_phase1_remove_daily_brief_sms_check.sql` (NEW)

**Changes**:

- Removed event-specific SMS preference checking (lines 236-241 in old function)
- SMS now relies solely on `v_prefs.sms_enabled` from `user_notification_preferences`
- Simplified logic: if `sms_enabled` is true AND phone verified/not opted out, send SMS
- Safety checks (quiet hours, rate limits) now handled in worker code

**Implementation Difference from Plan**:

- Created new migration file instead of modifying existing one
- More comprehensive comments explaining the Phase 1 changes
- Cleaner implementation by removing the entire CASE statement

#### Testing Checklist

Before deploying Phase 1:

- [ ] Test quiet hours enforcement (verify SMS rescheduled to end of quiet hours)
- [ ] Test rate limiting (verify SMS blocked when limit reached)
- [ ] Test single toggle works (enable only `should_sms_daily_brief`, not `daily_brief_sms`)
- [ ] Test backward compatibility (both toggles still work during transition)
- [ ] Monitor failed SMS rate for 24 hours post-deployment
- [ ] Check logs for quiet hours violations (should be 0)
- [ ] Check logs for rate limit violations (should be 0)

#### Files Changed

1. **NEW**: `/apps/worker/src/lib/utils/smsPreferenceChecks.ts` (400+ lines)
2. **MODIFIED**: `/apps/worker/src/workers/notification/smsAdapter.ts` (lines 15, 435-518)
3. **MODIFIED**: `/apps/worker/src/workers/notification/preferenceChecker.ts` (lines 126, removed 175-187)
4. **NEW**: `/supabase/migrations/20251013_phase1_remove_daily_brief_sms_check.sql` (297 lines)

---

### Phase 2 Implementation Notes (2025-10-13)

**Status**: ✅ COMPLETED

#### What Was Implemented

All three deprecated fields (`task_reminders`, `next_up_enabled`, `daily_brief_sms`) have been removed from the web app.

##### 1. API Endpoint Cleanup

**File**: `/apps/web/src/routes/api/sms/preferences/+server.ts`

**Changes**:

- Removed from `DEFAULT_PREFERENCES` object (lines 11, 15, 16)
- Removed from destructuring in PUT handler (lines 92, 96, 97)
- Removed conditional assignments (lines 116-118, 128-130, 131-133)

**Result**: API no longer accepts or returns these deprecated fields.

##### 2. Settings UI Cleanup

**File**: `/apps/web/src/lib/components/settings/SMSPreferences.svelte`

**Changes**:

- Removed state variables (lines 35, 39, 40)
- Removed from loadPreferences() (lines 60, 64, 65)
- Removed from savePreferences() (lines 81, 85, 86)
- Removed entire "Next Up Alerts" UI section (lines 283-315)
- Removed entire "Task Reminders" UI section (lines 395-427)
- Removed entire "Daily Brief Notifications" UI section (lines 429-459)

**Result**: Settings page no longer shows deprecated toggles. Daily brief SMS is now managed through NotificationPreferences.svelte.

##### 3. Onboarding Cleanup

**File**: `/apps/web/src/lib/components/onboarding-v2/NotificationsStep.svelte`

**Changes**:

- Removed from state object (line 24)
- Removed from API call (line 72)
- Removed from conditional checks (lines 85, 283, 287, 294, 299)
- Removed from icon mapping (line 142)
- Removed entire "Next Up Notifications" UI section (lines 226-244)

**Result**: Onboarding flow no longer includes next_up option.

##### 4. Type Safety Validation

**Validation**: ✅ `pnpm --filter=web typecheck` PASSED

All TypeScript type checking passes successfully after removing the deprecated fields.

#### Files Changed

1. **MODIFIED**: `/apps/web/src/routes/api/sms/preferences/+server.ts` (removed 3 fields from defaults, destructuring, and update logic)
2. **MODIFIED**: `/apps/web/src/lib/components/settings/SMSPreferences.svelte` (removed 3 state variables + 3 UI sections)
3. **MODIFIED**: `/apps/web/src/lib/components/onboarding-v2/NotificationsStep.svelte` (removed next_up from state, API, and UI)
4. **MODIFIED**: `/apps/web/src/lib/database.schema.ts` (removed 3 deprecated fields from user_sms_preferences type)
5. **MODIFIED**: `/apps/web/src/lib/services/sms.service.ts` (deprecated sendTaskReminder, removed fields from updateSMSPreferences)
6. **MODIFIED**: `/apps/web/docs/features/onboarding-v2/README.md` (removed next_up references from docs)

##### 5. Database Schema Cleanup

**File**: `/apps/web/src/lib/database.schema.ts`

**Changes**:

- Removed `daily_brief_sms: boolean | null;` from user_sms_preferences (line 1152)
- Removed `next_up_enabled: boolean | null;` from user_sms_preferences (line 1162)
- Removed `task_reminders: boolean | null;` from user_sms_preferences (line 1171)

**Result**: TypeScript schema now matches the cleaned API. Auto-generated types (database.types.ts, postgrest.api.d.ts) will be regenerated in Phase 3.

##### 6. Service Layer Cleanup

**File**: `/apps/web/src/lib/services/sms.service.ts`

**Changes**:

- Removed `task_reminders` and `daily_brief_sms` from updateSMSPreferences type definition (lines 243-244)
- Added deprecation comment to sendTaskReminder() function
- Made sendTaskReminder() return immediate error (feature deprecated)
- Commented out legacy implementation for reference

**Result**: Service layer no longer accepts deprecated fields. sendTaskReminder() gracefully fails with helpful error message.

##### 7. Documentation Updates

**File**: `/apps/web/docs/features/onboarding-v2/README.md`

**Changes**:

- Removed "⏰ Next Up Notifications" from notification types list (line 49)
- Removed `next_up_enabled BOOLEAN` from SMS preferences schema (line 151)

**Result**: Onboarding documentation accurately reflects current implementation (3 SMS types only).

#### Testing Checklist

Before deploying Phase 2:

- [x] Type checking passes (`pnpm --filter=web typecheck`)
- [ ] Settings page loads without errors
- [ ] Onboarding flow works correctly
- [ ] No console errors in browser
- [ ] API endpoints return expected data structure
- [ ] Users cannot see deprecated SMS toggles
- [ ] Daily brief SMS controlled via Notification Preferences page

**Note**: Generic API documentation files (utilities.md, authentication.md) contain example notification preference structures but don't need updating as they're illustrative examples, not SMS-specific docs.

---

### Phase 3 Implementation Notes (2025-10-15)

**Status**: ✅ MIGRATION FILES CREATED - Ready for deployment

#### What Was Implemented

Created two migration files following a safe two-step deployment strategy:

##### 1. Phase 3a: Mark Columns as Deprecated (Non-Breaking)

**File**: `/supabase/migrations/20251015_deprecate_unused_sms_fields.sql` (NEW)

**Purpose**: Mark deprecated columns with database comments - safe, non-breaking change that allows 2-week observation period before actual column removal.

**Key Features**:

- Adds deprecation comments to all three fields:
  - `daily_brief_sms` → Replaced by `should_sms_daily_brief`
  - `task_reminders` → Never implemented
  - `next_up_enabled` → Never implemented
- Includes verification query to confirm comments were applied
- Documents that columns will be dropped on 2025-10-29 (2 weeks from deprecation date)
- Provides simple rollback plan (remove comments)

**Deployment**: Can be deployed immediately - this is a metadata-only change with zero risk.

##### 2. Phase 3b: Drop Deprecated Columns (After 2-Week Wait)

**File**: `/supabase/migrations/20251029_remove_deprecated_sms_fields.sql` (NEW)

**Purpose**: Drop the deprecated columns from the database after confirming no issues from Phase 2 code changes.

**Key Safety Features**:

1. **Date Validation**: Migration will FAIL if run before 2025-10-29
   - Calculates days since deprecation date (2025-10-15)
   - Raises exception if less than 14 days have passed
   - Prevents premature execution

2. **Pre-Flight Checks**:
   - Shows current field usage statistics
   - Reports how many users have fields enabled
   - Warns if any users still have deprecated fields enabled (but proceeds since code doesn't check them)

3. **Post-Drop Verification**:
   - Confirms all three columns are dropped
   - Lists all remaining columns for verification
   - Provides next steps (regenerate TypeScript schemas)

4. **Comprehensive Rollback Plan**:
   - SQL to restore columns with default values
   - Documents that data loss is acceptable (explained why)
   - Notes that code no longer reads these fields

**Deployment**:

- ⚠️ **DO NOT DEPLOY before 2025-10-29**
- The migration includes safety checks to prevent early execution
- After deployment, must regenerate TypeScript schemas

#### Next Steps

1. **Deploy Phase 3a** (`20251015_deprecate_unused_sms_fields.sql`):
   - ✅ Safe to deploy immediately
   - Mark columns as deprecated in database metadata
   - Begin 2-week observation period

2. **Monitor for Issues** (2 weeks):
   - Watch for any problems from Phase 2 code changes
   - Verify no rollback needed
   - Check production logs for errors

3. **Deploy Phase 3b** (`20251029_remove_deprecated_sms_fields.sql`):
   - ⏳ Wait until 2025-10-29 or later
   - Safety checks will prevent premature execution
   - Drop the deprecated columns

4. **Regenerate TypeScript Schemas** (After Phase 3b):
   ```bash
   cd packages/shared-types
   pnpm run generate:types
   ```

   - This will update `database.schema.ts` to exclude dropped fields
   - Verify changes with `git diff`

#### Implementation Strategy

**Two-Migration Approach Benefits**:

- **Safety**: Non-breaking deprecation first, then actual removal
- **Observability**: 2-week window to catch any issues
- **Rollback**: Easy to revert if problems discovered
- **Documentation**: Database itself documents the deprecation timeline

**Why Not One Migration?**

- Separating deprecation from removal provides a safety net
- If Phase 2 code changes have issues, we can rollback without data loss
- Comments serve as documentation for other developers
- Allows time for production monitoring before permanent changes

#### Files Created

1. **NEW**: `/supabase/migrations/20251015_deprecate_unused_sms_fields.sql` (79 lines)
   - Marks columns as deprecated with detailed comments
   - Includes verification query with informative notices
   - Documents future removal date (2025-10-29)
   - Provides simple rollback instructions

2. **NEW**: `/supabase/migrations/20251029_remove_deprecated_sms_fields.sql` (173 lines)
   - Drops all three deprecated columns
   - Includes pre-flight date validation (prevents early execution)
   - Shows current usage statistics before dropping
   - Verifies successful drop with detailed notices
   - Lists all remaining columns for confirmation
   - Comprehensive rollback instructions

#### Testing Checklist

Before deploying Phase 3a:

- [x] Migration file created with proper naming convention
- [x] Comments include deprecation date and replacement information
- [x] Verification query included
- [x] Rollback plan documented
- [ ] Test migration in development environment
- [ ] Confirm migration runs without errors

Before deploying Phase 3b (after 2025-10-29):

- [ ] Verify 14+ days have passed since Phase 3a
- [ ] Confirm no production issues from Phase 2
- [ ] Test migration in staging environment
- [ ] Confirm safety checks work (try running early - should fail)
- [ ] Run migration in production
- [ ] Regenerate TypeScript schemas
- [ ] Verify no application errors

---

### Phase 2: Remove Deprecated Field Usage (Deploy After Phase 1)

**Goal**: Remove code references to deprecated fields

**Priority**: MEDIUM - Can deploy after bug fixes are confirmed working

#### Task 2.1: Remove `task_reminders` from Web App

**Files to Update**:

1. **API Endpoint**: `apps/web/src/routes/api/sms/preferences/+server.ts`
   - Line 15: Remove `task_reminders: false` from defaults
   - Line 96: Remove `task_reminders,` from parameter extraction
   - Lines 128-129: Remove update logic

2. **UI Component**: `apps/web/src/lib/components/settings/SMSPreferences.svelte`
   - Line 39: Remove `let taskReminders = $state(false);`
   - Line 64: Remove `taskReminders = preferences.task_reminders || false;`
   - Line 85: Remove `task_reminders: taskReminders,`
   - Lines 420-460: Remove toggle UI

3. **Service Layer**: `apps/web/src/lib/services/sms.service.ts`
   - Line 106: Remove `task_reminders` check (or remove entire `sendTaskReminder()` method)
   - Line 243: Remove from TypeScript interface

4. **Twilio Package**: `packages/twilio-service/src/services/sms.service.ts`
   - Line 44: Remove `"task_reminders"` from preference types
   - Update tests in `__tests__/sms.test.ts`

---

#### Task 2.2: Remove `next_up_enabled` from Web App

**Files to Update**:

1. **API Endpoint**: `apps/web/src/routes/api/sms/preferences/+server.ts`
   - Line 11: Remove `next_up_enabled: false` from defaults
   - Line 92: Remove `next_up_enabled,` from parameter extraction
   - Lines 116-117: Remove update logic

2. **UI Component**: `apps/web/src/lib/components/settings/SMSPreferences.svelte`
   - Line 35: Remove `let nextUpEnabled = $state(false);`
   - Line 60: Remove `nextUpEnabled = preferences.next_up_enabled || false;`
   - Line 81: Remove `next_up_enabled: nextUpEnabled,`
   - Lines 308-348: Remove toggle UI

3. **Onboarding Component**: `apps/web/src/lib/components/onboarding-v2/NotificationsStep.svelte`
   - Line 24: Remove `nextUpNotifications: false,`
   - Line 72: Remove `next_up_enabled: smsPreferences.nextUpNotifications,`
   - Lines 230-270: Remove toggle UI

---

#### Task 2.3: Remove `daily_brief_sms` from Web App

**Files to Update**:

1. **API Endpoint**: `apps/web/src/routes/api/sms/preferences/+server.ts`
   - Line 16: Remove `daily_brief_sms: false` from defaults
   - Line 97: Remove `daily_brief_sms,` from parameter extraction
   - Lines 131-132: Remove update logic

2. **UI Component**: `apps/web/src/lib/components/settings/SMSPreferences.svelte`
   - Line 40: Remove `let dailyBriefSms = $state(false);`
   - Line 65: Remove `dailyBriefSms = preferences.daily_brief_sms || false;`
   - Line 86: Remove `daily_brief_sms: dailyBriefSms,`
   - Lines 452-492: Remove toggle UI (if exists)
   - **Note**: Daily brief SMS is now controlled by NotificationPreferences.svelte

3. **Service Layer**: `apps/web/src/lib/services/sms.service.ts`
   - Line 244: Remove from TypeScript interface

---

### Phase 3: Database Schema Cleanup (Deploy Last)

**Goal**: Remove columns from database

**Priority**: LOW - Only after all code is deployed and confirmed working

#### Task 3.1: Mark Columns as Deprecated

**Migration File**: `supabase/migrations/YYYYMMDD_deprecate_unused_sms_fields.sql`

```sql
-- Mark deprecated columns (safe, non-breaking)
COMMENT ON COLUMN user_sms_preferences.daily_brief_sms IS
  'DEPRECATED as of 2025-10-13: Replaced by user_notification_preferences.should_sms_daily_brief (event_type=''user''). Will be removed in future version.';

COMMENT ON COLUMN user_sms_preferences.task_reminders IS
  'DEPRECATED as of 2025-10-13: Never implemented, no worker flow exists. Will be removed in future version.';

COMMENT ON COLUMN user_sms_preferences.next_up_enabled IS
  'DEPRECATED as of 2025-10-13: Never implemented, no worker flow exists. Will be removed in future version.';
```

---

#### Task 3.2: Drop Columns (After 2 Weeks)

**Migration File**: `supabase/migrations/YYYYMMDD_remove_deprecated_sms_fields.sql`

```sql
-- Wait 2 weeks after code deployment before running this!
-- Allows rollback if issues are discovered

ALTER TABLE user_sms_preferences
DROP COLUMN IF EXISTS daily_brief_sms,
DROP COLUMN IF EXISTS task_reminders,
DROP COLUMN IF EXISTS next_up_enabled;

-- Verify cleanup
DO $$
BEGIN
  RAISE NOTICE 'Deprecated SMS preference columns removed successfully';
  RAISE NOTICE 'Remaining columns: phone_number, phone_verified, opted_out, event_reminders_enabled, quiet_hours_*, daily_sms_limit, morning_kickoff_*, evening_recap_enabled';
END $$;
```

---

#### Task 3.3: Regenerate TypeScript Schemas

**After dropping columns**, regenerate schema files:

```bash
# Regenerate from database
cd packages/shared-types
pnpm run generate:types

# Verify changes
git diff src/database.types.ts
git diff src/database.schema.ts

# Update OpenAPI specs
cd ../../
pnpm run generate:api-types
```

---

### Phase 4: Update Future Feature UI (Optional)

**Goal**: Clearly mark unimplemented features in UI

**Priority**: LOW - Nice to have for user clarity

#### Option A: Show "Coming Soon" Badge

**File**: `apps/web/src/lib/components/settings/SMSPreferences.svelte`

**Changes**:

```svelte
<!-- Morning Kickoff Toggle -->
<div class="flex items-start justify-between">
  <div>
    <label class="font-medium">
      Morning Kickoff
      <span class="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
        Coming Soon
      </span>
    </label>
    <p class="text-sm text-gray-600">
      Start your day with a morning summary (feature in development)
    </p>
  </div>
  <label class="relative inline-flex items-center cursor-not-allowed opacity-50">
    <input type="checkbox" disabled bind:checked={morningKickoffEnabled} />
    <div class="..."></div>
  </label>
</div>
```

Apply similar changes to:

- `evening_recap_enabled`
- `morning_kickoff_time`

#### Option B: Remove from UI Entirely

Remove the toggles and add a "Future Features" section in the UI with a list of planned features.

---

## Clean SMS Flow Architecture

### Final State After Migration

```
user_notification_preferences (event_type='user')
├── should_email_daily_brief  → Controls daily brief email
└── should_sms_daily_brief    → Controls daily brief SMS

user_sms_preferences
├── Phone Verification
│   ├── phone_number
│   ├── phone_verified
│   ├── phone_verified_at
│   ├── opted_out
│   ├── opted_out_at
│   └── opt_out_reason
│
├── Calendar Event Reminders (Working Feature)
│   ├── event_reminders_enabled
│   └── event_reminder_lead_time_minutes
│
├── Future Features (UI Ready, No Worker)
│   ├── morning_kickoff_enabled
│   ├── morning_kickoff_time
│   └── evening_recap_enabled
│
├── Safety Controls (Applied to ALL SMS)
│   ├── quiet_hours_start
│   ├── quiet_hours_end
│   ├── daily_sms_limit
│   ├── daily_sms_count
│   └── daily_count_reset_at
│
└── Legacy (Use users.timezone instead)
    └── timezone
```

### SMS Sending Decision Tree

```
When daily brief completes:
  ↓
1. Check user_notification_preferences (event_type='user')
   ├─ should_sms_daily_brief = true? → Continue
   └─ should_sms_daily_brief = false? → Don't send SMS
  ↓
2. Check user_sms_preferences (Phone Verification)
   ├─ phone_number exists? → Continue
   ├─ phone_verified = true? → Continue
   └─ opted_out = false? → Continue
  ↓
3. Check user_sms_preferences (Rate Limiting)
   ├─ daily_sms_count < daily_sms_limit? → Continue
   └─ Limit reached? → Block SMS
  ↓
4. Check user_sms_preferences (Quiet Hours)
   ├─ Not in quiet hours? → Send SMS ✅
   └─ In quiet hours? → Reschedule to end of quiet hours
```

**NO MORE** dual checks for `daily_brief_sms` + `should_sms_daily_brief`!

---

## Testing Strategy

### Pre-Deployment Testing

#### Test 1: Verify Quiet Hours Enforcement

```sql
-- Set up test user with quiet hours
UPDATE user_sms_preferences
SET quiet_hours_start = '22:00:00',
    quiet_hours_end = '08:00:00',
    timezone = 'America/Los_Angeles'
WHERE user_id = 'test-user-id';

-- Enable daily brief SMS
UPDATE user_notification_preferences
SET should_sms_daily_brief = true
WHERE user_id = 'test-user-id' AND event_type = 'user';

-- Trigger brief generation at 11 PM PT
-- Expected: SMS should be rescheduled to 8 AM PT
-- Verify: notification_deliveries.status = 'scheduled', scheduled_for = '08:00 PT'
```

---

#### Test 2: Verify Rate Limiting

```sql
-- Set low SMS limit
UPDATE user_sms_preferences
SET daily_sms_limit = 2,
    daily_sms_count = 2
WHERE user_id = 'test-user-id';

-- Trigger brief generation
-- Expected: SMS should be blocked with error "Daily SMS limit reached"
-- Verify: notification_deliveries.status = 'failed', last_error contains "limit reached"
```

---

#### Test 3: Verify Single Toggle Works

```sql
-- ONLY enable should_sms_daily_brief (not daily_brief_sms)
UPDATE user_notification_preferences
SET should_sms_daily_brief = true
WHERE user_id = 'test-user-id' AND event_type = 'user';

-- Ensure daily_brief_sms is false or null
UPDATE user_sms_preferences
SET daily_brief_sms = false
WHERE user_id = 'test-user-id';

-- Trigger brief generation
-- Expected: SMS should be sent (no longer checking daily_brief_sms)
-- Verify: notification_deliveries.status = 'delivered'
```

---

#### Test 4: Verify Backward Compatibility

```sql
-- Old setup: Both toggles enabled
UPDATE user_notification_preferences
SET should_sms_daily_brief = true
WHERE user_id = 'test-user-id' AND event_type = 'user';

UPDATE user_sms_preferences
SET daily_brief_sms = true
WHERE user_id = 'test-user-id';

-- Trigger brief generation
-- Expected: SMS sent (still works during transition period)
```

---

### Post-Deployment Monitoring

#### Metrics to Track

1. **Quiet Hours Violations** (Should be 0)

   ```sql
   -- Check SMS sent during quiet hours
   SELECT d.id, d.recipient_user_id, d.sent_at, s.quiet_hours_start, s.quiet_hours_end
   FROM notification_deliveries d
   JOIN user_sms_preferences s ON s.user_id = d.recipient_user_id
   WHERE d.channel = 'sms'
     AND d.status = 'delivered'
     AND d.sent_at > NOW() - INTERVAL '24 hours'
     AND is_in_quiet_hours(d.sent_at, s.quiet_hours_start, s.quiet_hours_end, s.timezone);
   ```

2. **Rate Limit Violations** (Should be 0)

   ```sql
   -- Check users exceeding daily SMS limit
   SELECT user_id, COUNT(*) as sms_count, daily_sms_limit
   FROM notification_deliveries d
   JOIN user_sms_preferences s ON s.user_id = d.recipient_user_id
   WHERE d.channel = 'sms'
     AND d.status = 'delivered'
     AND d.sent_at::date = CURRENT_DATE
   GROUP BY user_id, daily_sms_limit
   HAVING COUNT(*) > daily_sms_limit;
   ```

3. **Failed SMS Deliveries** (Monitor spike)
   ```sql
   -- Track failed SMS rate
   SELECT
     DATE(created_at) as date,
     COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
     COUNT(*) as total_count,
     ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'failed') / COUNT(*), 2) as failure_rate
   FROM notification_deliveries
   WHERE channel = 'sms'
     AND created_at > NOW() - INTERVAL '7 days'
   GROUP BY DATE(created_at)
   ORDER BY date DESC;
   ```

---

## Rollback Plan

### If Critical Issues Arise in Phase 1

**Revert Code Changes**:

```bash
git revert <commit-hash>
git push origin main
```

**Temporarily Re-enable Old Logic**:

```typescript
// apps/worker/src/workers/notification/preferenceChecker.ts

// ROLLBACK: Re-add special case for brief.completed
if (eventType === "brief.completed") {
  if (!smsPrefs.daily_brief_sms) {
    return {
      allowed: false,
      reason: "Daily brief SMS notifications disabled (rollback active)",
    };
  }
}
```

### If Issues Arise in Phase 2 or 3

**Phase 2 Rollback** (Code removal):

```bash
# Restore code from previous commit
git checkout HEAD~1 -- apps/web/src/routes/api/sms/preferences/+server.ts
git checkout HEAD~1 -- apps/web/src/lib/components/settings/SMSPreferences.svelte
git commit -m "Rollback: Restore deprecated SMS fields to code"
```

**Phase 3 Rollback** (Column removal):

```sql
-- Restore dropped columns
ALTER TABLE user_sms_preferences
ADD COLUMN IF NOT EXISTS daily_brief_sms BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS task_reminders BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS next_up_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN user_sms_preferences.daily_brief_sms IS
  'RESTORED after rollback - originally deprecated 2025-10-13';
```

---

## Success Criteria

### Phase 1 Success

- ✅ No SMS sent during quiet hours (0 violations in 7 days)
- ✅ No SMS exceeding daily limits (0 violations in 7 days)
- ✅ Daily brief SMS works with ONLY `should_sms_daily_brief` enabled
- ✅ No increase in failed SMS rate
- ✅ No user complaints about missing SMS

### Phase 2 Success

- ✅ UI no longer shows deprecated toggles
- ✅ API no longer accepts deprecated fields
- ✅ TypeScript types reflect removed fields
- ✅ No errors in browser console
- ✅ Settings page loads correctly

### Phase 3 Success

- ✅ Database columns dropped successfully
- ✅ Schema types regenerated correctly
- ✅ No database errors in production
- ✅ All tests passing

---

## Timeline Estimate

| Phase                        | Tasks                                                      | Effort          | Deploy Wait            |
| ---------------------------- | ---------------------------------------------------------- | --------------- | ---------------------- |
| **Phase 1: Fix Bugs**        | Add quiet hours check, rate limit check, remove dual check | 4-6 hours       | Deploy ASAP            |
| **Phase 2: Remove Code**     | Remove from API, UI, services, tests                       | 3-4 hours       | +1 week after Phase 1  |
| **Phase 3: Schema Cleanup**  | Mark deprecated, drop columns, regenerate types            | 2 hours         | +2 weeks after Phase 2 |
| **Phase 4: Future Features** | Add "Coming Soon" badges (optional)                        | 1 hour          | Anytime                |
| **Total**                    | -                                                          | **10-13 hours** | **~3 weeks total**     |

---

## Related Documents

- [Overlapping Notification Preferences Analysis](/thoughts/shared/research/2025-10-13_04-55-45_overlapping-notification-preferences-analysis.md) - Original issue analysis
- [Daily Brief Notification Refactor Plan](/thoughts/shared/research/2025-10-13_06-00-00_daily-brief-notification-refactor-plan.md) - Implementation that caused this cleanup
- [ADR-001: User-Level Notification Preferences](/docs/architecture/decisions/ADR-001-user-level-notification-preferences.md) - Architecture decision

---

## Open Questions

1. **Should we implement morning_kickoff and evening_recap features?**
   - If YES: Keep columns and build worker implementation
   - If NO: Remove columns entirely in Phase 2

2. **Should quiet hours be timezone-aware?**
   - Current: Uses user's timezone from `user_sms_preferences.timezone`
   - Recommendation: Migrate to `users.timezone` for consistency

3. **Should rate limiting be global or per-SMS-type?**
   - Current: Global limit for ALL SMS types
   - Alternative: Separate limits for calendar vs daily brief SMS

4. **Should we add a "dry run" mode for testing?**
   - Would allow testing SMS logic without actually sending SMS
   - Useful for validating quiet hours and rate limiting

---

## Appendix: Complete File Change List

### Phase 1 Files

**Worker Files**:

- `apps/worker/src/workers/notification/smsAdapter.ts` (add quiet hours + rate limiting)
- `apps/worker/src/workers/notification/preferenceChecker.ts` (remove dual check)
- `apps/worker/src/lib/utils/quietHoursChecker.ts` (new shared utility)

**SQL Migrations**:

- `supabase/migrations/YYYYMMDD_fix_daily_brief_sms_safety_checks.sql` (update emit_notification_event function)

### Phase 2 Files

**Web App Files**:

- `apps/web/src/routes/api/sms/preferences/+server.ts`
- `apps/web/src/lib/components/settings/SMSPreferences.svelte`
- `apps/web/src/lib/components/onboarding-v2/NotificationsStep.svelte`
- `apps/web/src/lib/services/sms.service.ts`

**Package Files**:

- `packages/twilio-service/src/services/sms.service.ts`
- `packages/twilio-service/src/__tests__/sms.test.ts`

### Phase 3 Files

**SQL Migrations**:

- `supabase/migrations/YYYYMMDD_deprecate_unused_sms_fields.sql`
- `supabase/migrations/YYYYMMDD_remove_deprecated_sms_fields.sql`

**Schema Files** (regenerated):

- `packages/shared-types/src/database.types.ts`
- `packages/shared-types/src/database.schema.ts`
- `apps/web/src/lib/database.types.ts`
- `apps/web/src/lib/database.schema.ts`

---

**End of Migration Plan**
