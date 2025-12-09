---
date: 2025-10-13T04:55:45-07:00
researcher: Claude Code
git_commit: 1df7369b330929e44974a52bab3c77042d09bab5
branch: main
repository: buildos-platform
topic: 'Overlapping Database Columns in Daily Briefs, SMS Notifications, and Generic Notification System'
tags: [research, codebase, notifications, sms, database-schema, preferences, daily-briefs]
status: complete
last_updated: 2025-10-13
last_updated_by: Claude Code
last_updated_note: 'Added follow-up research section after daily brief notification refactor completion'
path: thoughts/shared/research/2025-10-13_04-55-45_overlapping-notification-preferences-analysis.md
---

# Research: Overlapping Database Columns in Daily Briefs, SMS Notifications, and Generic Notification System

**Date**: 2025-10-13T04:55:45-07:00
**Researcher**: Claude Code
**Git Commit**: 1df7369b330929e44974a52bab3c77042d09bab5
**Branch**: main
**Repository**: buildos-platform

## Research Question

"I think I have overlapping database columns that are for the same things. I have daily briefs and I now have SMS notifications. And I also have notifications. Please investigate what is going on."

## Executive Summary

**YES, you have significant overlapping functionality** across three separate preference systems:

1. **`user_brief_preferences`** - Legacy system for daily brief email delivery
2. **`user_sms_preferences`** - SMS-specific preferences (event reminders + daily briefs)
3. **`user_notification_preferences`** - Generic notification system (all event types, all channels)

### Critical Overlaps Identified

| Functionality          | Legacy Location                            | Modern Location                                                           | Status                          |
| ---------------------- | ------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------- |
| **Daily brief emails** | `user_brief_preferences.email_daily_brief` | `user_notification_preferences.email_enabled` (brief.completed)           | ⚠️ **DUPLICATE SYSTEMS**        |
| **Daily brief SMS**    | `user_sms_preferences.daily_brief_sms`     | `user_notification_preferences.sms_enabled` (brief.completed)             | ⚠️ **BOTH CHECKED** (AND logic) |
| **Quiet hours**        | `user_sms_preferences.quiet_hours_*`       | `user_notification_preferences.quiet_hours_*`                             | ⚠️ **DUPLICATE CONFIG**         |
| **Daily rate limits**  | `user_sms_preferences.daily_sms_limit`     | `user_notification_preferences.max_per_day`                               | ⚠️ **SEPARATE SYSTEMS**         |
| **Timezone**           | `user_brief_preferences.timezone`          | `user_sms_preferences.timezone`, `user_notification_preferences.timezone` | ⚠️ **STORED 3 PLACES**          |

---

## Detailed Findings

### 1. Daily Brief Email Delivery - DUPLICATE SYSTEMS RUNNING

#### System 1: Legacy Email Path

**Controlled by:** `user_brief_preferences.email_daily_brief`

**Flow:**

```
Scheduler → Brief Generation → Email Worker → Email Sender Service → Webhook
```

**Files:**

- `/apps/worker/src/workers/brief/briefWorker.ts:96-295` - Creates email record if `email_daily_brief = true`
- `/apps/worker/src/workers/brief/emailWorker.ts:88-128` - Checks `email_daily_brief` before sending
- `/apps/worker/src/lib/services/email-sender.ts:119-161` - Triple-checks `email_daily_brief` flag

**Email Format:** Brief-specific template with markdown rendering

**Preference Check:**

```typescript
// /apps/worker/src/lib/services/email-sender.ts:144-151
const shouldSend = preferences.email_daily_brief === true && preferences.is_active === true;
```

---

#### System 2: Modern Notification System

**Controlled by:** `user_notification_preferences.email_enabled` (for event type: `brief.completed`)

**Flow:**

```
Brief Generation → emit_notification_event → Notification Worker → Email Adapter → Webhook
```

**Files:**

- `/apps/worker/src/workers/brief/briefWorker.ts:368-389` - Emits `brief.completed` event
- `/supabase/migrations/20251013_fix_notification_broadcast_bug.sql:178-218` - Creates email delivery if `email_enabled = true`
- `/apps/worker/src/workers/notification/emailAdapter.ts:131-337` - Sends via generic template

**Email Format:** Generic notification template (less rich than brief-specific)

**Preference Check:**

```typescript
// /apps/worker/src/workers/notification/preferenceChecker.ts:85-95
if (!prefs.email_enabled) {
	return { allowed: false, reason: 'Email disabled for brief.completed' };
}
```

---

#### **THE PROBLEM:**

Both systems run in parallel! A user could receive:

- One email from the legacy system
- Another email from the notification system

**Impact:**

- Duplicate emails if both preferences are enabled
- Confusing UX - users don't know which setting controls what
- Maintenance burden - two codepaths to maintain

**Evidence in Code:**

```typescript
// /apps/worker/src/workers/brief/briefWorker.ts:96-295
// LEGACY: Always runs, creates email record
if (preferences?.email_daily_brief) {
  await createEmailRecord(...);
  await queueJob('generate_brief_email', ...);
}

// Lines 368-389
// MODERN: Always runs, emits notification event
await serviceClient.rpc('emit_notification_event', {
  p_event_type: 'brief.completed',
  // ... creates email delivery if email_enabled = true
});
```

---

### 2. Daily Brief SMS - Requires BOTH Preferences

**Controlled by:**

1. `user_notification_preferences.sms_enabled` (for `brief.completed`)
2. `user_sms_preferences.daily_brief_sms` (specific flag)

**Logic:** SMS is ONLY sent if BOTH are true (AND condition)

**Where Checked:**

```typescript
// /apps/worker/src/workers/notification/preferenceChecker.ts:122-188
// Check 1: Generic notification preference
if (!prefs.sms_enabled) {
	return { allowed: false, reason: 'SMS disabled for event type' };
}

// Check 2: SMS-specific preference
const { data: smsPrefs } = await supabase
	.from('user_sms_preferences')
	.select('daily_brief_sms, ...')
	.eq('user_id', userId);

if (eventType === 'brief.completed' && !smsPrefs.daily_brief_sms) {
	return { allowed: false, reason: 'Daily brief SMS disabled' };
}
```

**Additional Requirements:**

- `user_sms_preferences.phone_verified = true`
- `user_sms_preferences.opted_out = false`
- `user_sms_preferences.phone_number` exists

**THE PROBLEM:**

- Users must enable SMS in TWO places for daily briefs to work
- Not documented anywhere - confusing for users
- `daily_brief_sms` is redundant if `sms_enabled` is already checked

**Files:**

- `/apps/worker/src/workers/notification/preferenceChecker.ts:122-188` - Checks both
- `/apps/worker/src/workers/notification/smsAdapter.ts:396-418` - Double-checks before sending

---

### 3. Calendar Event SMS Reminders - Separate System

**Controlled by:** `user_sms_preferences.event_reminders_enabled`

**NOT part of notification system** - uses its own dedicated flow:

```
Midnight Scheduler → Daily SMS Worker → SMS Worker → Twilio
```

**Files:**

- `/apps/worker/src/scheduler.ts:616-624` - Queries users with `event_reminders_enabled = true`
- `/apps/worker/src/workers/dailySmsWorker.ts:56-98` - Generates event reminder SMS
- `/apps/worker/src/workers/smsWorker.ts:57-461` - Sends via Twilio

**THE PROBLEM:**

- Calendar SMS uses `user_sms_preferences` directly
- Daily brief SMS uses `user_notification_preferences` + `user_sms_preferences`
- Inconsistent architecture for similar functionality

---

### 4. Quiet Hours - Duplicate Configuration

#### Location 1: `user_sms_preferences`

```typescript
{
	quiet_hours_start: string | null; // HH:MM:SS format
	quiet_hours_end: string | null; // HH:MM:SS format
}
```

**Used by:**

- Daily SMS Worker (calendar event reminders) - `/apps/worker/src/workers/dailySmsWorker.ts:200-229`
- SMS Worker (all SMS sends) - `/apps/worker/src/workers/smsWorker.ts:123-171`

---

#### Location 2: `user_notification_preferences`

```typescript
{
	quiet_hours_enabled: boolean | null;
	quiet_hours_start: string | null;
	quiet_hours_end: string | null;
}
```

**Currently NOT enforced** - column exists but no code checks it for SMS notifications via notification system!

**THE PROBLEM:**

- Calendar SMS respects `user_sms_preferences.quiet_hours_*`
- Notification system SMS does NOT check quiet hours at all
- Generic notification system has quiet hours columns but doesn't use them
- Users expect quiet hours to apply to ALL SMS, but they don't

**Evidence:**

```typescript
// /apps/worker/src/workers/notification/smsAdapter.ts
// MISSING: No quiet hours check before queuing SMS!

// Compare to:
// /apps/worker/src/workers/smsWorker.ts:123-171
// Calendar SMS DOES check quiet hours
if (isInQuietHours(scheduledFor, quietHoursStart, quietHoursEnd)) {
	// Reschedule to end of quiet hours
}
```

---

### 5. Daily Rate Limiting - Separate Implementations

#### Implementation 1: `user_sms_preferences`

```typescript
{
	daily_sms_limit: number | null; // Default: 10
	daily_sms_count: number | null; // Current count
	daily_count_reset_at: string | null; // Last reset timestamp
}
```

**Used by:**

- Daily SMS Worker - `/apps/worker/src/workers/dailySmsWorker.ts:84-107` (checks before scheduling)
- SMS Worker - `/apps/worker/src/workers/smsWorker.ts:173-197` (checks at send time)

**How it works:**

1. Counter resets at midnight in user's timezone
2. Each SMS increments counter via RPC: `increment_daily_sms_count()`
3. Pre-send validation checks if limit reached

---

#### Implementation 2: `user_notification_preferences`

```typescript
{
	max_per_hour: number | null;
	max_per_day: number | null;
}
```

**Currently NOT enforced** - columns exist but no code implements rate limiting!

**THE PROBLEM:**

- SMS from calendar reminders respects `daily_sms_limit`
- SMS from notification system IGNORES `max_per_day`
- Inconsistent rate limiting across SMS types
- `max_per_hour` is defined but never checked

**Risk:** Notification system could send unlimited SMS if daily limit in `user_sms_preferences` is bypassed

---

### 6. Timezone - Stored in THREE Places

```typescript
// Table 1: user_brief_preferences
timezone: string | null; // Used for: Brief generation scheduling

// Table 2: user_sms_preferences
timezone: string | null; // Used for: Quiet hours calculation, daily limit reset

// Table 3: user_notification_preferences
timezone: string | null; // Used for: (not currently used!)
```

**THE PROBLEM:**

- Same timezone stored redundantly
- No synchronization - changes in one place don't update others
- Risk of timezone mismatches causing incorrect scheduling

**Where Used:**

- Brief scheduling: `/apps/worker/src/scheduler.ts:57-60` (reads `user_brief_preferences.timezone`)
- SMS scheduling: `/apps/worker/src/scheduler.ts:617-623` (reads `user_sms_preferences.timezone`)
- Quiet hours: `/apps/worker/src/workers/dailySmsWorker.ts:206` (reads `user_sms_preferences.timezone`)
- Notification system: NOT USED (but column exists!)

---

## Code References

### Preference Tables

- `packages/shared-types/src/database.schema.ts:1038-1048` - `user_brief_preferences` schema
- `packages/shared-types/src/database.schema.ts:1154-1180` - `user_sms_preferences` schema
- `packages/shared-types/src/database.schema.ts:1121-1140` - `user_notification_preferences` schema

### Daily Brief Email (Legacy)

- `apps/worker/src/workers/brief/briefWorker.ts:96-295` - Email record creation
- `apps/worker/src/workers/brief/emailWorker.ts:27-269` - Email sending job
- `apps/worker/src/lib/services/email-sender.ts:119-161` - `shouldSendEmail()` check
- `apps/worker/src/lib/services/email-sender.ts:246-434` - `sendDailyBriefEmail()` formatting

### Daily Brief Notifications (Modern)

- `apps/worker/src/workers/brief/briefWorker.ts:368-389` - Emits `brief.completed` event
- `supabase/migrations/20251013_fix_notification_broadcast_bug.sql:16-293` - `emit_notification_event()` function
- `apps/worker/src/workers/notification/notificationWorker.ts:378-642` - Notification processor
- `apps/worker/src/workers/notification/preferenceChecker.ts:42-214` - Preference validation

### SMS Delivery

- `apps/worker/src/workers/notification/smsAdapter.ts:384-546` - SMS adapter (notification system)
- `apps/worker/src/workers/dailySmsWorker.ts:56-98` - Calendar event SMS
- `apps/worker/src/workers/smsWorker.ts:57-461` - SMS sending with Twilio

### Preference Checking

- `apps/worker/src/workers/notification/preferenceChecker.ts:122-188` - SMS preference validation (requires BOTH flags)
- `apps/worker/src/lib/services/email-sender.ts:119-161` - Email preference validation (legacy)

---

## Architecture Insights

### Current State: Three Overlapping Systems

```
┌─────────────────────────────────────────────────────────────┐
│ LEGACY SYSTEM (user_brief_preferences)                      │
│ - Controls: Daily brief generation + email delivery         │
│ - Email format: Rich brief-specific template                │
│ - Columns: is_active, email_daily_brief, timezone           │
└─────────────────────────────────────────────────────────────┘
                         ↓
         Still runs even if notification system is active!
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ SMS-SPECIFIC SYSTEM (user_sms_preferences)                  │
│ - Controls: Calendar event reminders + daily brief SMS opt-in│
│ - Features: Phone verification, quiet hours, rate limiting   │
│ - Columns: phone_number, phone_verified, opted_out,         │
│            event_reminders_enabled, daily_brief_sms,         │
│            quiet_hours_*, daily_sms_limit, timezone          │
└─────────────────────────────────────────────────────────────┘
                         ↓
              Some features duplicated below ↓
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ GENERIC NOTIFICATION SYSTEM (user_notification_preferences) │
│ - Controls: All notification channels for all event types   │
│ - Channels: Push, in-app, email, SMS                        │
│ - Columns: push_enabled, in_app_enabled, email_enabled,     │
│            sms_enabled, quiet_hours_*, max_per_day,          │
│            max_per_hour, timezone                            │
│ - Issue: Some columns defined but not enforced!             │
└─────────────────────────────────────────────────────────────┘
```

### Daily Brief Email Flow - BOTH PATHS RUN

```
Brief Generation Worker
    └─> briefWorker.ts:processBriefJob()
        │
        ├─> [LEGACY PATH]
        │   if (email_daily_brief = true)
        │     → Queue generate_brief_email job
        │     → emailWorker.ts processes
        │     → email-sender.ts checks email_daily_brief again
        │     → Sends rich formatted email
        │
        └─> [MODERN PATH]
            emit_notification_event('brief.completed')
              → emit_notification_event() checks email_enabled
              → Creates notification_delivery (email channel)
              → Queue send_notification job
              → emailAdapter.ts processes
              → Sends generic notification email

Result: User potentially receives 2 emails!
```

### Daily Brief SMS Flow - Requires BOTH Flags

```
Brief Generation Worker
    └─> emit_notification_event('brief.completed')
        └─> emit_notification_event() function
            │
            ├─> Check 1: user_notification_preferences.sms_enabled
            │   └─> if FALSE: skip SMS delivery creation
            │
            └─> Check 2: user_sms_preferences checks (in SQL function)
                ├─> phone_verified = true?
                ├─> opted_out = false?
                ├─> phone_number exists?
                └─> daily_brief_sms = true?  ← SPECIFIC CHECK
                    └─> if ALL TRUE: create notification_delivery
                        └─> Queue send_notification job
                            └─> smsAdapter.ts
                                └─> Preference checker VALIDATES AGAIN:
                                    ├─> sms_enabled still true?
                                    └─> daily_brief_sms still true?
```

**Result:** User must enable SMS in TWO places:

1. `user_notification_preferences.sms_enabled = true` (for "brief.completed")
2. `user_sms_preferences.daily_brief_sms = true`

---

## Recommendations

### Priority 1: Consolidate Daily Brief Email Delivery

**Goal:** Eliminate duplicate email system

**Option A: Migrate to Notification System (Recommended)**

1. Deprecate `user_brief_preferences.email_daily_brief`
2. Migrate all users to `user_notification_preferences.email_enabled` for "brief.completed"
3. Remove legacy email path from `briefWorker.ts` (lines 96-295)
4. Decommission `emailWorker.ts` and `email-sender.ts`
5. Enhance notification email template to match rich brief formatting

**Option B: Keep Legacy System**

1. Remove `brief.completed` email delivery from notification system
2. Document that `user_brief_preferences` controls daily brief emails
3. Keep notification system for other event types

**Migration Script Needed:**

```sql
-- Copy email preferences to notification system
INSERT INTO user_notification_preferences (
  user_id, event_type, email_enabled, created_at, updated_at
)
SELECT
  user_id,
  'brief.completed' as event_type,
  email_daily_brief as email_enabled,
  NOW() as created_at,
  NOW() as updated_at
FROM user_brief_preferences
WHERE email_daily_brief = true
ON CONFLICT (user_id, event_type) DO UPDATE
  SET email_enabled = EXCLUDED.email_enabled;
```

---

### Priority 2: Simplify Daily Brief SMS Preferences

**Goal:** Remove redundant `daily_brief_sms` flag

**Current Logic:**

```typescript
// BOTH must be true:
user_notification_preferences.sms_enabled (for brief.completed) AND
user_sms_preferences.daily_brief_sms
```

**Proposed Logic:**

```typescript
// ONLY check:
user_notification_preferences.sms_enabled (for brief.completed)
// Keep SMS-specific checks:
user_sms_preferences.phone_verified = true
user_sms_preferences.opted_out = false
```

**Changes Required:**

1. Remove `daily_brief_sms` check from `preferenceChecker.ts:176-186`
2. Update UI to only show generic notification preference toggle
3. Mark `user_sms_preferences.daily_brief_sms` as deprecated
4. Migration script to sync existing values

---

### Priority 3: Enforce Quiet Hours Consistently

**Goal:** Make quiet hours work for ALL SMS types

**Current:** Only calendar SMS respects quiet hours

**Proposed:**

1. **Move quiet hours to `user_sms_preferences`** (canonical location for SMS settings)
2. Implement quiet hours check in notification system before sending SMS
3. Add quiet hours check to `smsAdapter.ts` (currently missing!)

**Code Changes:**

```typescript
// /apps/worker/src/workers/notification/smsAdapter.ts
// ADD THIS BEFORE LINE 492:
const smsPrefs = await getSMSPreferences(userId);
if (isInQuietHours(now, smsPrefs.quiet_hours_start, smsPrefs.quiet_hours_end, smsPrefs.timezone)) {
  // Reschedule to end of quiet hours
  const rescheduledTime = calculateQuietHoursEnd(...);
  // Re-queue job with new scheduled_for time
}
```

**Deprecate:**

- `user_notification_preferences.quiet_hours_*` columns (remove or mark unused)

---

### Priority 4: Consolidate Daily Rate Limiting

**Goal:** Single rate limiting implementation

**Recommended:** Keep `user_sms_preferences.daily_sms_limit` as canonical source

**Changes Required:**

1. Implement rate limit check in `smsAdapter.ts` before sending
2. Reuse existing `increment_daily_sms_count()` RPC
3. Deprecate `user_notification_preferences.max_per_day` and `max_per_hour`

**Add to smsAdapter.ts:**

```typescript
// Before queuing SMS (around line 490):
const { daily_sms_count, daily_sms_limit } = await getSMSPreferences(userId);
if (daily_sms_count >= daily_sms_limit) {
	return {
		success: false,
		error: 'Daily SMS limit reached',
		should_retry: false
	};
}
```

---

### Priority 5: Centralize Timezone Storage

**Goal:** Single source of truth for user timezone

**Recommended Approach:**

1. Add `timezone` to `users` table (canonical location)
2. Migrate all existing timezone values
3. Update all queries to read from `users.timezone`
4. Mark timezone columns in preference tables as deprecated

**Migration Script:**

```sql
-- Add timezone to users table
ALTER TABLE users ADD COLUMN timezone TEXT DEFAULT 'UTC';

-- Copy from user_brief_preferences (most likely to be accurate)
UPDATE users u
SET timezone = COALESCE(
  (SELECT timezone FROM user_brief_preferences WHERE user_id = u.id),
  (SELECT timezone FROM user_sms_preferences WHERE user_id = u.id),
  'UTC'
);

-- Update queries to use users.timezone
```

---

## Summary Table: What to Keep vs. Deprecate

| Feature                   | Current Locations                                                                          | Recommended                                                | Action                                     |
| ------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------ |
| **Daily brief email**     | `user_brief_preferences.email_daily_brief` + `user_notification_preferences.email_enabled` | **Keep:** `user_notification_preferences.email_enabled`    | ❌ Deprecate legacy path                   |
| **Daily brief SMS**       | `user_sms_preferences.daily_brief_sms` + `user_notification_preferences.sms_enabled`       | **Keep:** `user_notification_preferences.sms_enabled` only | ❌ Deprecate `daily_brief_sms`             |
| **Calendar SMS**          | `user_sms_preferences.event_reminders_enabled`                                             | **Keep:** As-is (different flow)                           | ✅ Keep                                    |
| **Quiet hours**           | `user_sms_preferences.quiet_hours_*` + `user_notification_preferences.quiet_hours_*`       | **Keep:** `user_sms_preferences` only                      | ❌ Deprecate notification prefs version    |
| **Daily rate limit**      | `user_sms_preferences.daily_sms_limit` + `user_notification_preferences.max_per_*`         | **Keep:** `user_sms_preferences.daily_sms_limit`           | ❌ Deprecate max*per*\*                    |
| **Timezone**              | 3 tables                                                                                   | **Keep:** `users.timezone` (NEW)                           | ❌ Deprecate all preference table versions |
| **Phone verification**    | `user_sms_preferences` only                                                                | **Keep:** As-is                                            | ✅ Keep                                    |
| **Generic notifications** | `user_notification_preferences`                                                            | **Keep:** Expand to other events                           | ✅ Keep and enhance                        |

---

## Migration Complexity Estimate

### Phase 1: Quick Wins (Low Risk)

- **Document the overlap** ✅ (this research doc)
- **Add quiet hours check to notification SMS** (1 file change)
- **Add rate limit check to notification SMS** (1 file change)
- **Add UI warnings** about duplicate email systems

### Phase 2: Email Consolidation (Medium Risk)

- **Migrate preferences** (SQL script)
- **Disable legacy email path** (feature flag)
- **Test both systems in parallel** (1-2 weeks)
- **Remove legacy code** (after validation)

### Phase 3: SMS Simplification (Low Risk)

- **Remove `daily_brief_sms` requirement** (1 file change)
- **Migrate existing preferences** (SQL script)
- **Update UI** (remove toggle)

### Phase 4: Timezone Centralization (Medium Risk)

- **Add `users.timezone`** (migration)
- **Copy existing values** (data migration)
- **Update all queries** (10+ files)
- **Test thoroughly** (timezone bugs are critical)

---

## Open Questions

1. **Why does the legacy email system still exist?**
    - Was the notification system intended to replace it?
    - Are there differences in email formatting that users depend on?

2. **Why require BOTH `sms_enabled` AND `daily_brief_sms`?**
    - Is this intentional defense-in-depth?
    - Or was this an oversight during notification system implementation?

3. **Should calendar event SMS be migrated to notification system?**
    - Currently separate flow with dedicated worker
    - Could use `calendar.event_reminder` event type in notification system
    - Would simplify architecture but requires significant refactoring

4. **What happens if preferences are mismatched?**
    - Example: `email_daily_brief = true` but `email_enabled = false`
    - User gets one email but not the other
    - Very confusing behavior!

---

## Related Documentation

- `/apps/web/CLAUDE.md` - Web app architecture
- `/apps/worker/CLAUDE.md` - Worker service architecture
- `/docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md` - System architecture
- `/docs/features/notifications/README.md` - Notification system docs (if exists)

---

## Testing Recommendations

### Test Case 1: Duplicate Email Scenario

```sql
-- Set up conflicting preferences
UPDATE user_brief_preferences
SET email_daily_brief = true
WHERE user_id = 'test-user';

INSERT INTO user_notification_preferences (user_id, event_type, email_enabled)
VALUES ('test-user', 'brief.completed', true);

-- Trigger brief generation
-- Expected: User receives 2 emails (one from each system)
```

### Test Case 2: SMS Requires Both Flags

```sql
-- Test 1: Only sms_enabled = true
UPDATE user_notification_preferences
SET sms_enabled = true
WHERE user_id = 'test-user' AND event_type = 'brief.completed';

UPDATE user_sms_preferences
SET daily_brief_sms = false
WHERE user_id = 'test-user';

-- Expected: No SMS sent

-- Test 2: Only daily_brief_sms = true
UPDATE user_notification_preferences
SET sms_enabled = false;

UPDATE user_sms_preferences
SET daily_brief_sms = true;

-- Expected: No SMS sent

-- Test 3: Both true
UPDATE user_notification_preferences SET sms_enabled = true;
UPDATE user_sms_preferences SET daily_brief_sms = true;

-- Expected: SMS sent
```

### Test Case 3: Quiet Hours Not Enforced

```sql
-- Set quiet hours in SMS prefs
UPDATE user_sms_preferences
SET quiet_hours_start = '22:00:00',
    quiet_hours_end = '08:00:00',
    timezone = 'America/Los_Angeles'
WHERE user_id = 'test-user';

-- Trigger notification at 11pm PT
-- Expected (BUG): SMS sent anyway (quiet hours not checked!)
-- Actual: Calendar SMS would be blocked, but notification SMS goes through
```

---

## Conclusion

You have **three overlapping preference systems** that evolved independently:

1. **Legacy brief system** - Still sending emails even though notification system exists
2. **SMS-specific system** - Handles calendar reminders correctly, but has redundant flags for daily briefs
3. **Generic notification system** - Partially integrated, has unused columns, and missing enforcement of quiet hours and rate limits

**Root Cause:** The generic notification system was added but the legacy systems were never fully migrated or decommissioned.

**Impact:**

- Users receive duplicate emails
- Confusing UX (multiple places to configure same thing)
- SMS requires enabling two separate toggles
- Quiet hours only work for some SMS types
- Rate limiting inconsistently enforced
- Timezone stored redundantly

**Next Steps:**

1. Implement quick wins (add quiet hours + rate limit checks to notification SMS)
2. Plan migration for email consolidation
3. Simplify SMS preferences (remove redundant flag)
4. Centralize timezone storage
5. Document current behavior for users

---

## Follow-up Research [2025-10-13T17:40:27-07:00]

### Update: Daily Brief Notification Refactor Completed

**Date**: 2025-10-13
**Status**: Email consolidation complete, SMS cleanup still needed

#### What Was Fixed

✅ **Priority 1: Email Consolidation (COMPLETED)**

- Migrated to user-level preferences (`event_type='user'`)
- Added `should_email_daily_brief` to `user_notification_preferences`
- Removed `email_daily_brief` from `user_brief_preferences` (marked deprecated)
- Updated all worker code to use new column
- Fixed duplicate email issue

See: `/thoughts/shared/research/2025-10-13_06-00-00_daily-brief-notification-refactor-plan.md`

#### What Still Needs Fixing

⚠️ **Priority 2: SMS Simplification (IN PROGRESS)**

**Issues Identified**:

1. 🚨 **CRITICAL**: Daily brief SMS bypasses quiet hours (users could get SMS during sleep)
2. 🚨 **CRITICAL**: Daily brief SMS bypasses rate limiting (unlimited SMS possible)
3. ⚠️ **UX ISSUE**: Duplicate SMS checks - `daily_brief_sms` AND `should_sms_daily_brief` both required

**Fields to Remove**:

- `daily_brief_sms` - Now redundant with `should_sms_daily_brief` (event_type='user')
- `task_reminders` - Never implemented, no worker code
- `next_up_enabled` - Never implemented, no worker code

**Fields to Keep**:

- `event_reminders_enabled` ✅ (Fully working calendar SMS feature)
- `morning_kickoff_enabled`, `evening_recap_enabled` ⏳ (Future features - UI ready, no worker)
- `quiet_hours_*`, `daily_sms_limit`, phone verification fields ✅ (Essential)

#### SMS Flow Status

| Flow                     | Implementation Status       | Action Needed             |
| ------------------------ | --------------------------- | ------------------------- |
| Calendar Event Reminders | ✅ **WORKING**              | Keep as-is                |
| Morning Kickoff          | ❌ UI only, no worker       | Keep for future OR remove |
| Evening Recap            | ❌ UI only, no worker       | Keep for future OR remove |
| Next Up Notifications    | ❌ UI only, no worker       | Remove completely         |
| Task Reminders           | ❌ Field exists, never used | Remove completely         |
| Daily Brief SMS          | ⚠️ Duplicate checks         | Simplify to single check  |

#### Detailed Migration Plan

See: `/thoughts/shared/research/2025-10-13_17-40-27_sms-flow-deprecation-migration-plan.md`

**Phase 1: Fix Critical Bugs** (Deploy ASAP)

- Add quiet hours check to notification SMS
- Add rate limit check to notification SMS
- Remove redundant `daily_brief_sms` check

**Phase 2: Remove Deprecated Fields** (Deploy after Phase 1)

- Remove `task_reminders`, `next_up_enabled`, `daily_brief_sms` from code
- Update UI, API endpoints, service layer

**Phase 3: Database Cleanup** (Deploy last)

- Mark columns as deprecated
- Drop columns after 2 weeks
- Regenerate TypeScript schemas

#### Updated Architecture After Refactor

**User-Level Daily Brief Preferences** (`event_type='user'`):

```typescript
user_notification_preferences {
  should_email_daily_brief: boolean;  // Controls email ✅
  should_sms_daily_brief: boolean;    // Controls SMS ✅
}
```

**SMS-Specific Settings** (Global for ALL SMS types):

```typescript
user_sms_preferences {
  // Phone Verification (KEEP)
  phone_number, phone_verified, opted_out

  // Working Features (KEEP)
  event_reminders_enabled         ✅
  event_reminder_lead_time_minutes ✅

  // Future Features (KEEP or REMOVE - Decision needed)
  morning_kickoff_enabled   ⏳
  morning_kickoff_time      ⏳
  evening_recap_enabled     ⏳

  // Safety Controls (KEEP - But not enforced for daily brief SMS!)
  quiet_hours_start         🚨 NOT enforced!
  quiet_hours_end           🚨 NOT enforced!
  daily_sms_limit           🚨 NOT enforced!
  daily_sms_count           🚨 NOT enforced!

  // Deprecated (REMOVE)
  daily_brief_sms    ❌ Redundant
  task_reminders     ❌ Never implemented
  next_up_enabled    ❌ Never implemented
}
```

#### Summary of Remaining Work

**Critical (Fix ASAP)**:

1. Add quiet hours enforcement to daily brief SMS
2. Add rate limiting enforcement to daily brief SMS
3. Remove dual-check requirement for daily brief SMS

**Medium Priority**: 4. Remove unused fields from codebase (`task_reminders`, `next_up_enabled`, `daily_brief_sms`) 5. Update UI to remove deprecated toggles

**Low Priority**: 6. Drop deprecated columns from database 7. Decide on future features (implement or remove completely)

**Risk Assessment**: HIGH - Current bugs allow SMS to bypass user safety preferences
