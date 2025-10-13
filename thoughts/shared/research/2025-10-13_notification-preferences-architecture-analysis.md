---
date: 2025-10-13T00:00:00-07:00
researcher: Claude Code
git_commit: current
branch: main
repository: buildos-platform
topic: "Notification Preferences Architecture Analysis - Post-Refactor"
tags: [research, notifications, architecture, preferences, database-schema]
status: complete
last_updated: 2025-10-13
---

# Notification Preferences Architecture Analysis (Post-Refactor)

**Date**: 2025-10-13
**Context**: Analysis of notification preferences architecture AFTER the daily brief refactor that separated brief generation from notification delivery.

## Executive Summary

The recent refactor successfully separated **brief generation timing** from **notification delivery** by introducing user-level notification preferences. However, there are still some overlaps and areas for consolidation with SMS-specific preferences.

### Key Architectural Decision: `event_type='user'`

The refactor introduced a critical pattern: user-level preferences use `event_type='user'` in `user_notification_preferences`, while event-based preferences use specific event types like `'brief.completed'`.

**See**: `/docs/architecture/decisions/ADR-001-user-level-notification-preferences.md`

---

## 1. User-Level Daily Brief Preferences (`event_type='user'`)

### Schema Definition

**Location**: `/packages/shared-types/src/database.schema.ts:1121-1142`

```typescript
user_notification_preferences: {
  user_id: string;
  event_type: string;  // 'user' for user-level preferences
  should_email_daily_brief: boolean | null;  // ✅ NEW (refactor)
  should_sms_daily_brief: boolean | null;    // ✅ NEW (refactor)
  // ... other columns
}
```

### Where These Are Written (Web API)

**File**: `/apps/web/src/routes/api/notification-preferences/+server.ts`

**Lines 74-205** - PUT handler

```typescript
// Check if this is a user-level daily brief preference update
const isDailyBriefUpdate =
  (should_email_daily_brief !== undefined || should_sms_daily_brief !== undefined) &&
  !event_type;

if (isDailyBriefUpdate) {
  // Validate phone number if enabling SMS (lines 92-123)
  if (should_sms_daily_brief === true) {
    const { data: smsPrefs } = await supabase
      .from('user_sms_preferences')
      .select('phone_number, phone_verified, opted_out')
      .eq('user_id', user.id)
      .single();

    // Check phone_number exists, phone_verified, not opted_out
  }

  // Store with event_type='user' (lines 146-168)
  const dailyBriefUpdates = {
    user_id: user.id,
    event_type: 'user',  // ← CRITICAL: User-level preferences
    should_email_daily_brief,
    should_sms_daily_brief,
    updated_at: new Date().toISOString()
  };

  await supabase
    .from('user_notification_preferences')
    .upsert(dailyBriefUpdates, {
      onConflict: 'user_id,event_type'  // Composite key ensures one row per user
    });
}
```

**Validation**:
- Phone verification required for SMS
- Brief generation must be active (`user_brief_preferences.is_active`)
- Returns clear error messages with specific flags (`requiresPhoneSetup`, `requiresPhoneVerification`)

### Where These Are Read (Worker)

**File**: `/apps/worker/src/workers/brief/briefWorker.ts`

**Lines 98-118** - Brief generation worker checks these preferences:

```typescript
const { data: notificationPrefs, error: notificationPrefsError } = await supabase
  .from('user_notification_preferences')
  .select('should_email_daily_brief, should_sms_daily_brief')
  .eq('user_id', job.data.userId)
  .eq('event_type', 'user')  // ← CRITICAL: Must filter by event_type='user'
  .single();

const shouldEmailBrief = notificationPrefs?.should_email_daily_brief ?? false;
const shouldSmsBrief = notificationPrefs?.should_sms_daily_brief ?? false;
```

**Post-Implementation Bug Fix** (Line 103): Added `.eq("event_type", "user")` to prevent `.single()` from failing when users have multiple preference rows.

**File**: `/apps/worker/src/workers/brief/emailWorker.ts`

**Lines 91-107** - Email worker double-checks before sending:

```typescript
const { data: notificationPrefs } = await supabase
  .from('user_notification_preferences')
  .select('should_email_daily_brief')
  .eq('user_id', userId)
  .eq('event_type', 'user')  // ← CRITICAL: Must filter by event_type='user'
  .single();

const { data: briefPrefs } = await supabase
  .from('user_brief_preferences')
  .select('is_active')
  .eq('user_id', userId)
  .single();

const shouldSendEmail =
  notificationPrefs?.should_email_daily_brief === true &&
  briefPrefs?.is_active === true;
```

**File**: `/apps/worker/src/lib/services/email-sender.ts`

**Lines 122-162** - Email service `shouldSendEmail()` method:

```typescript
async shouldSendEmail(userId: string): Promise<boolean> {
  // Check notification preferences for email opt-in
  const { data: notificationPrefs } = await this.supabase
    .from('user_notification_preferences')
    .select('should_email_daily_brief')
    .eq('user_id', userId)
    .eq('event_type', 'user')  // ← CRITICAL: Must filter by event_type='user'
    .single();

  // Check brief preferences for is_active (brief generation)
  const { data: briefPrefs } = await this.supabase
    .from('user_brief_preferences')
    .select('is_active')
    .eq('user_id', userId)
    .single();

  const shouldSend =
    notificationPrefs?.should_email_daily_brief === true &&
    briefPrefs.is_active === true;

  return shouldSend;
}
```

### How These Work

**Email Flow**:
1. Brief generation completes
2. Worker checks `should_email_daily_brief` (event_type='user')
3. If true AND `is_active=true`, creates email record
4. Email worker queues send job
5. Email service sends via webhook to web app

**SMS Flow**:
1. Brief generation completes
2. Worker checks `should_sms_daily_brief` (event_type='user')
3. If true, checks SMS prerequisites:
   - `user_sms_preferences.phone_verified = true`
   - `user_sms_preferences.phone_number` exists
   - `user_sms_preferences.opted_out = false`
4. If all pass, emits `brief.completed` notification event
5. Notification system delivers via SMS adapter

### Key Implementation Notes

**CRITICAL**: All queries MUST include `.eq("event_type", "user")` when fetching user-level daily brief preferences. Without this filter, `.single()` will fail if the user has both user-level and event-based preferences.

**Post-Implementation Bugs Fixed**:
- Added missing event_type filter to 3 worker files (briefWorker.ts, emailWorker.ts, email-sender.ts)
- See ADR-001 for lessons learned

---

## 2. Event-Based Notification Preferences

### Schema Definition

**Location**: `/packages/shared-types/src/database.schema.ts:1121-1142`

```typescript
user_notification_preferences: {
  user_id: string;
  event_type: string;  // e.g., 'brief.completed', 'task.due', etc.
  email_enabled: boolean | null;
  sms_enabled: boolean | null;
  push_enabled: boolean | null;
  in_app_enabled: boolean | null;
  // ... other columns
}
```

### Where These Are Checked (Notification Worker)

**File**: `/apps/worker/src/workers/notification/preferenceChecker.ts`

**Lines 42-214** - Main preference checking logic:

```typescript
export async function checkUserPreferences(
  userId: string,
  eventType: string,
  channel: NotificationChannel,
  logger: Logger,
): Promise<PreferenceCheckResult> {
  // Get notification preferences for this event type
  const { data: prefs } = await supabase
    .from('user_notification_preferences')
    .select('push_enabled, in_app_enabled, email_enabled, sms_enabled')
    .eq('user_id', userId)
    .eq('event_type', eventType)  // Event-specific preferences
    .single();

  // Check channel-specific preference
  let channelEnabled = false;
  switch (channel) {
    case 'push': channelEnabled = prefs.push_enabled || false; break;
    case 'in_app': channelEnabled = prefs.in_app_enabled || false; break;
    case 'email': channelEnabled = prefs.email_enabled || false; break;
    case 'sms': channelEnabled = prefs.sms_enabled || false; break;
  }

  if (!channelEnabled) {
    return {
      allowed: false,
      reason: `${channel} notifications disabled for event type: ${eventType}`,
    };
  }

  // Additional checks for SMS channel (lines 122-188)
  if (channel === 'sms') {
    const { data: smsPrefs } = await supabase
      .from('user_sms_preferences')
      .select('opted_out, phone_verified, phone_number, daily_brief_sms')
      .eq('user_id', userId)
      .single();

    if (smsPrefs.opted_out) return { allowed: false, reason: 'User opted out of SMS' };
    if (!smsPrefs.phone_verified) return { allowed: false, reason: 'Phone not verified' };
    if (!smsPrefs.phone_number) return { allowed: false, reason: 'No phone number' };

    // ⚠️ REDUNDANT CHECK (lines 176-186)
    if (eventType === 'brief.completed') {
      if (!smsPrefs.daily_brief_sms) {
        return { allowed: false, reason: 'Daily brief SMS disabled' };
      }
    }
  }

  return { allowed: true, reason: 'User preferences allow this notification' };
}
```

### Adapters That Use These Checks

**Email Adapter**: `/apps/worker/src/workers/notification/emailAdapter.ts`
- Lines 131-337
- Calls `checkUserPreferences()` before sending
- Double-checks preferences (safety check in case they changed)

**SMS Adapter**: `/apps/worker/src/workers/notification/smsAdapter.ts`
- Lines 384-546
- Calls `checkUserPreferences()` before sending
- Double-checks preferences (safety check in case they changed)

**Push Adapter**: `/apps/worker/src/workers/notification/notificationWorker.ts`
- Lines 150-247 - `sendPushNotification()`
- Checks preferences before sending

**In-App Adapter**: `/apps/worker/src/workers/notification/notificationWorker.ts`
- Lines 251-299 - `sendInAppNotification()`
- Inserts into `user_notifications` table

---

## 3. SMS-Specific Preferences (`user_sms_preferences`)

### Schema Definition

**Location**: `/packages/shared-types/src/database.schema.ts:1154-1180`

```typescript
user_sms_preferences: {
  user_id: string;

  // ✅ STILL NEEDED - Core SMS functionality
  phone_number: string | null;
  phone_verified: boolean | null;
  phone_verified_at: string | null;
  opted_out: boolean | null;
  opted_out_at: string | null;
  opt_out_reason: string | null;

  // ✅ STILL NEEDED - Calendar event reminders (separate system)
  event_reminders_enabled: boolean | null;
  event_reminder_lead_time_minutes: number | null;
  morning_kickoff_enabled: boolean | null;
  morning_kickoff_time: string | null;
  next_up_enabled: boolean | null;
  evening_recap_enabled: boolean | null;

  // ⚠️ REDUNDANT with user_notification_preferences (event_type='user')
  daily_brief_sms: boolean | null;

  // ✅ STILL NEEDED - Rate limiting
  daily_sms_limit: number | null;
  daily_sms_count: number | null;
  daily_count_reset_at: string | null;

  // ✅ STILL NEEDED - Quiet hours
  quiet_hours_start: string | null;  // HH:MM:SS
  quiet_hours_end: string | null;

  // ⚠️ REDUNDANT with users.timezone
  timezone: string | null;

  // Other fields
  task_reminders: boolean | null;
  urgent_alerts: boolean | null;
}
```

### Columns STILL NEEDED

#### 1. Phone Verification & Opt-out

**Required for all SMS functionality**:
- `phone_number` - User's phone number
- `phone_verified` - Whether phone is verified
- `phone_verified_at` - When verification occurred
- `opted_out` - Global SMS opt-out flag
- `opted_out_at` - When user opted out
- `opt_out_reason` - Why they opted out

**Checked by**:
- `preferenceChecker.ts:122-188` - Before any SMS send
- `briefWorker.ts:325-349` - Before sending daily brief SMS
- `dailySmsWorker.ts:92-102` - Before scheduling calendar SMS

#### 2. Calendar Event Reminders (Separate System)

**Not part of notification system** - has its own dedicated flow:
- `event_reminders_enabled` - Enable calendar event SMS reminders
- `event_reminder_lead_time_minutes` - Minutes before event to send (default: 15)
- `morning_kickoff_enabled` - Morning summary SMS
- `morning_kickoff_time` - Time for morning SMS
- `next_up_enabled` - "Next up" style reminders
- `evening_recap_enabled` - Evening summary SMS

**Used by**:
- `/apps/worker/src/scheduler.ts:616-624` - Schedules daily SMS jobs
- `/apps/worker/src/workers/dailySmsWorker.ts:1-472` - Generates calendar event SMS

**Flow**:
```
Midnight Scheduler
  → Checks event_reminders_enabled
  → Queue daily_sms job
  → Daily SMS Worker
     → Fetches calendar events
     → Generates LLM messages
     → Creates scheduled_sms_messages
     → Queues send_sms jobs
```

#### 3. Rate Limiting

**Implementation**: Tracks daily SMS count per user

**Columns**:
- `daily_sms_limit` - Max SMS per day (default: 10)
- `daily_sms_count` - Current count today
- `daily_count_reset_at` - Last reset timestamp

**Where Enforced**:
- `dailySmsWorker.ts:104-129` - Pre-scheduling check
- `smsWorker.ts:173-197` - Pre-send validation

**How It Works**:
```typescript
// dailySmsWorker.ts:104-129
const today = format(new Date(), 'yyyy-MM-dd');
const needsReset = smsPrefs.daily_count_reset_at
  ? format(parseISO(smsPrefs.daily_count_reset_at), 'yyyy-MM-dd') !== today
  : true;

if (needsReset) {
  await supabase.from('user_sms_preferences').update({
    daily_sms_count: 0,
    daily_count_reset_at: new Date().toISOString(),
  }).eq('user_id', userId);
}

const currentCount = needsReset ? 0 : smsPrefs.daily_sms_count || 0;
const limit = smsPrefs.daily_sms_limit || 10;

if (currentCount >= limit) {
  return { message: 'Daily SMS limit reached' };
}
```

**RPC Function**: `increment_daily_sms_count()` increments counter after successful send

#### 4. Quiet Hours

**Implementation**: Prevents SMS during user's quiet hours

**Columns**:
- `quiet_hours_start` - Start time (HH:MM:SS format)
- `quiet_hours_end` - End time (HH:MM:SS format)

**Where Enforced**:
- `dailySmsWorker.ts:221-251` - When scheduling calendar reminders
- `smsWorker.ts:123-171` - Before sending (reschedules if in quiet hours)

**How It Works**:
```typescript
// smsWorker.ts:127-171
if (userPrefs.quiet_hours_start && userPrefs.quiet_hours_end) {
  const quietStart = parseInt(userPrefs.quiet_hours_start);
  const quietEnd = parseInt(userPrefs.quiet_hours_end);
  const currentHour = now.getHours();

  const isQuietHours =
    quietStart < quietEnd
      ? currentHour >= quietStart && currentHour < quietEnd
      : currentHour >= quietStart || currentHour < quietEnd;

  if (isQuietHours) {
    // Reschedule to end of quiet hours
    const rescheduleTime = new Date(now);
    rescheduleTime.setHours(quietEnd, 0, 0, 0);

    await supabase.from('scheduled_sms_messages').update({
      scheduled_for: rescheduleTime.toISOString(),
    }).eq('id', scheduled_sms_id);

    return { success: false, reason: 'quiet_hours' };
  }
}
```

**Note**: Daily brief SMS from notification system does NOT check quiet hours yet!

### Columns NOW REDUNDANT

#### 1. `daily_brief_sms` ⚠️

**REDUNDANT** with `user_notification_preferences.should_sms_daily_brief` (event_type='user')

**Current Problem** (Lines 176-186 in `preferenceChecker.ts`):
```typescript
// Special check for brief.completed SMS
if (eventType === 'brief.completed') {
  if (!smsPrefs.daily_brief_sms) {
    return {
      allowed: false,
      reason: 'Daily brief SMS notifications disabled',
    };
  }
}
```

**This creates an AND condition**: Both must be true for daily brief SMS to send:
1. `user_notification_preferences.should_sms_daily_brief = true` (event_type='user')
2. `user_sms_preferences.daily_brief_sms = true`

**Recommended Fix**:
- Remove this check from `preferenceChecker.ts`
- Only check `should_sms_daily_brief`
- Keep SMS-specific checks (phone_verified, opted_out, etc.)

#### 2. `timezone` ⚠️

**REDUNDANT** with `users.timezone` (should be centralized)

**Current Usage**:
- `dailySmsWorker.ts:78-82` - Reads from `user_sms_preferences`
- `briefWorker.ts:39-61` - Reads from `users.timezone` (correct!)

**Recommended Fix**:
- Centralize in `users.timezone`
- Update `dailySmsWorker.ts` to read from `users` table
- Mark `user_sms_preferences.timezone` as deprecated

---

## 4. Current Overlaps and Conflicts

### Overlap 1: Daily Brief SMS - Requires TWO Flags ⚠️

**Problem**: User must enable SMS in TWO places:
1. `user_notification_preferences.should_sms_daily_brief = true` (event_type='user')
2. `user_sms_preferences.daily_brief_sms = true`

**Logic Flow**:
```typescript
// briefWorker.ts checks should_sms_daily_brief
if (notificationPrefs?.should_sms_daily_brief) {
  // Emits notification event
}

// emit_notification_event() checks sms_enabled for event type
// Creates delivery if sms_enabled = true

// preferenceChecker.ts checks BOTH:
// 1. sms_enabled (for event type)
// 2. daily_brief_sms (SMS-specific) ← REDUNDANT!
```

**Impact**:
- Confusing UX - users don't know which toggle to use
- Must enable in multiple places
- Not documented

**Recommended Fix**:
Remove `daily_brief_sms` check from `preferenceChecker.ts:176-186`

### Overlap 2: Quiet Hours - Not Enforced for Notification SMS ⚠️

**Problem**: Quiet hours only work for calendar SMS, not daily brief SMS

**Calendar SMS Flow** (WORKS):
```
dailySmsWorker.ts:221-251 → Checks quiet hours before scheduling
smsWorker.ts:123-171 → Checks quiet hours before sending (reschedules if needed)
```

**Daily Brief SMS Flow** (BROKEN):
```
briefWorker.ts → Emits notification event
emit_notification_event() → Creates delivery
notificationWorker.ts → Processes delivery
smsAdapter.ts → Queues SMS (NO QUIET HOURS CHECK!)
smsWorker.ts → Sends SMS (scheduled_sms_id is null, so no quiet hours check)
```

**Where Missing**:
- `smsAdapter.ts:384-546` - No quiet hours check before queuing
- SMS sent via notification system bypasses quiet hours validation

**Recommended Fix**:
Add quiet hours check to `smsAdapter.ts` before queuing SMS:
```typescript
// Before line 492 in smsAdapter.ts
const { data: smsPrefs } = await supabase
  .from('user_sms_preferences')
  .select('quiet_hours_start, quiet_hours_end, timezone')
  .eq('user_id', delivery.recipient_user_id)
  .single();

if (isInQuietHours(now, smsPrefs)) {
  // Reschedule delivery or skip
}
```

### Overlap 3: Rate Limiting - Not Enforced for Notification SMS ⚠️

**Problem**: Rate limiting only works for calendar SMS, not daily brief SMS

**Calendar SMS Flow** (WORKS):
```
dailySmsWorker.ts:104-129 → Checks daily_sms_count < daily_sms_limit
smsWorker.ts:173-197 → Checks again before sending
smsWorker.ts:198-200 → Increments counter: increment_daily_sms_count()
```

**Daily Brief SMS Flow** (BROKEN):
```
smsAdapter.ts → Queues SMS (NO RATE LIMIT CHECK!)
smsWorker.ts → Sends SMS (scheduled_sms_id is null, so no rate limit check)
                (but DOES increment counter!)
```

**Where Missing**:
- `smsAdapter.ts:384-546` - No rate limit check before queuing

**Risk**: Notification system could send unlimited SMS if daily limit is not checked

**Recommended Fix**:
Add rate limit check to `smsAdapter.ts` before queuing SMS:
```typescript
// Before line 492 in smsAdapter.ts
const { data: smsPrefs } = await supabase
  .from('user_sms_preferences')
  .select('daily_sms_count, daily_sms_limit')
  .eq('user_id', delivery.recipient_user_id)
  .single();

if (smsPrefs.daily_sms_count >= smsPrefs.daily_sms_limit) {
  return {
    success: false,
    error: 'Daily SMS limit reached',
  };
}
```

### Overlap 4: Timezone - Stored Multiple Places ⚠️

**Current Storage**:
1. `users.timezone` ← SHOULD BE CANONICAL
2. `user_sms_preferences.timezone`
3. `user_brief_preferences.timezone`
4. `user_notification_preferences.timezone` (exists but not used)

**Where Read**:
- Brief scheduling: `scheduler.ts` reads `user_brief_preferences.timezone`
- Brief generation: `briefWorker.ts` reads `users.timezone` (CORRECT!)
- SMS scheduling: `scheduler.ts` reads `user_sms_preferences.timezone`
- Quiet hours: `dailySmsWorker.ts` reads `user_sms_preferences.timezone`

**Problem**:
- No synchronization between copies
- Risk of timezone mismatches
- Inconsistent sources

**Recommended Fix**:
1. Centralize in `users.timezone`
2. Update all queries to read from `users` table
3. Mark other timezone columns as deprecated

---

## 5. Summary Table: What to Keep vs. Deprecate

| Feature | Current Locations | Recommended | Action |
|---------|-------------------|-------------|---------|
| **Daily brief email** | `user_notification_preferences.should_email_daily_brief` (event_type='user') | ✅ Keep as-is | None needed |
| **Daily brief SMS** | `should_sms_daily_brief` (event_type='user') + `daily_brief_sms` | Keep `should_sms_daily_brief` only | ❌ Remove `daily_brief_sms` check |
| **Calendar SMS** | `user_sms_preferences.event_reminders_enabled` | ✅ Keep as-is (different flow) | None needed |
| **Phone verification** | `user_sms_preferences` only | ✅ Keep as-is | None needed |
| **Quiet hours** | `user_sms_preferences.quiet_hours_*` | ✅ Keep | Add check to notification SMS |
| **Daily rate limit** | `user_sms_preferences.daily_sms_*` | ✅ Keep | Add check to notification SMS |
| **Timezone** | 4 tables | Centralize in `users.timezone` | ❌ Deprecate duplicates |
| **Event notifications** | `user_notification_preferences` (event-based) | ✅ Keep and expand | None needed |

---

## 6. Recommended Fixes (Priority Order)

### Priority 1: Add Quiet Hours to Notification SMS ⚠️ CRITICAL

**Risk**: Users receive SMS during quiet hours from daily briefs

**File**: `/apps/worker/src/workers/notification/smsAdapter.ts`

**Change**: Add quiet hours check before queuing SMS (around line 450):

```typescript
// Before queuing SMS message
const { data: smsPrefs } = await supabase
  .from('user_sms_preferences')
  .select('quiet_hours_start, quiet_hours_end, timezone')
  .eq('user_id', delivery.recipient_user_id)
  .single();

if (smsPrefs?.quiet_hours_start && smsPrefs?.quiet_hours_end) {
  const now = new Date();
  const userTz = smsPrefs.timezone || 'UTC';
  const userTime = utcToZonedTime(now, userTz);

  const isInQuietHours = checkQuietHours(
    userTime,
    smsPrefs.quiet_hours_start,
    smsPrefs.quiet_hours_end
  );

  if (isInQuietHours) {
    // Reschedule to end of quiet hours or mark as failed
    return {
      success: false,
      error: 'In quiet hours - rescheduled',
    };
  }
}
```

### Priority 2: Add Rate Limiting to Notification SMS ⚠️ CRITICAL

**Risk**: Notification system could send unlimited SMS

**File**: `/apps/worker/src/workers/notification/smsAdapter.ts`

**Change**: Add rate limit check before queuing SMS (around line 445):

```typescript
// Before queuing SMS message
const { data: smsPrefs } = await supabase
  .from('user_sms_preferences')
  .select('daily_sms_count, daily_sms_limit, daily_count_reset_at')
  .eq('user_id', delivery.recipient_user_id)
  .single();

// Check if needs reset
const today = format(new Date(), 'yyyy-MM-dd');
const needsReset = smsPrefs?.daily_count_reset_at
  ? format(parseISO(smsPrefs.daily_count_reset_at), 'yyyy-MM-dd') !== today
  : true;

const currentCount = needsReset ? 0 : smsPrefs?.daily_sms_count || 0;
const limit = smsPrefs?.daily_sms_limit || 10;

if (currentCount >= limit) {
  smsLogger.warn('Daily SMS limit reached', {
    userId: delivery.recipient_user_id,
    currentCount,
    limit,
  });

  return {
    success: false,
    error: `Daily SMS limit reached (${currentCount}/${limit})`,
  };
}
```

### Priority 3: Remove Redundant `daily_brief_sms` Check

**File**: `/apps/worker/src/workers/notification/preferenceChecker.ts`

**Change**: Remove lines 176-186 (special check for brief.completed):

```typescript
// DELETE THIS:
if (eventType === 'brief.completed') {
  if (!smsPrefs.daily_brief_sms) {
    return {
      allowed: false,
      reason: 'Daily brief SMS notifications disabled',
    };
  }
}
```

**Rationale**: `should_sms_daily_brief` (event_type='user') already controls this

### Priority 4: Centralize Timezone Storage

**Migration Required**:

```sql
-- Add timezone to users table if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- Copy from user_brief_preferences (most likely accurate)
UPDATE users u
SET timezone = COALESCE(
  (SELECT timezone FROM user_brief_preferences WHERE user_id = u.id),
  (SELECT timezone FROM user_sms_preferences WHERE user_id = u.id),
  'UTC'
);

-- Mark other columns as deprecated
COMMENT ON COLUMN user_brief_preferences.timezone IS
  'DEPRECATED: Use users.timezone instead';

COMMENT ON COLUMN user_sms_preferences.timezone IS
  'DEPRECATED: Use users.timezone instead';
```

**Code Changes**:
- Update all queries to read from `users.timezone`
- Files to update:
  - `/apps/worker/src/scheduler.ts` (scheduler reads brief prefs)
  - `/apps/worker/src/workers/dailySmsWorker.ts` (reads SMS prefs)

---

## 7. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ USER-LEVEL PREFERENCES (event_type='user')                      │
│ user_notification_preferences                                   │
│ - should_email_daily_brief: Controls email delivery             │
│ - should_sms_daily_brief: Controls SMS delivery                 │
│                                                                  │
│ Checked by: briefWorker, emailWorker, email-sender              │
│ Written by: /api/notification-preferences (web)                 │
└─────────────────────────────────────────────────────────────────┘
                         ↓
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│ EVENT-BASED PREFERENCES (event_type='brief.completed', etc.)    │
│ user_notification_preferences                                   │
│ - email_enabled: Channel-level control                          │
│ - sms_enabled: Channel-level control                            │
│ - push_enabled: Channel-level control                           │
│ - in_app_enabled: Channel-level control                         │
│                                                                  │
│ Checked by: preferenceChecker, notification adapters            │
│ Written by: /api/notification-preferences (web)                 │
└─────────────────────────────────────────────────────────────────┘
                         ↓
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│ SMS-SPECIFIC SETTINGS (all SMS types)                           │
│ user_sms_preferences                                            │
│                                                                  │
│ ✅ NEEDED:                                                       │
│ - phone_number, phone_verified, opted_out                       │
│ - event_reminders_enabled (calendar SMS)                        │
│ - quiet_hours_start, quiet_hours_end                            │
│ - daily_sms_limit, daily_sms_count                              │
│                                                                  │
│ ⚠️ REDUNDANT:                                                    │
│ - daily_brief_sms (use should_sms_daily_brief instead)          │
│ - timezone (use users.timezone instead)                         │
│                                                                  │
│ Checked by: preferenceChecker, dailySmsWorker, smsWorker        │
│ Written by: /api/sms-preferences (web)                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Related Documentation

- `/docs/architecture/decisions/ADR-001-user-level-notification-preferences.md` - Architectural decision for event_type='user'
- `/supabase/migrations/20251013_refactor_daily_brief_notification_prefs.sql` - Migration script
- `/thoughts/shared/research/2025-10-13_04-55-45_overlapping-notification-preferences-analysis.md` - Original analysis (pre-refactor)
- `/thoughts/shared/research/2025-10-13_06-00-00_daily-brief-notification-refactor-plan.md` - Implementation plan

---

## 9. Testing Recommendations

### Test Case 1: User-Level Daily Brief Preferences

```sql
-- Enable email only
UPDATE user_notification_preferences
SET should_email_daily_brief = true,
    should_sms_daily_brief = false
WHERE user_id = 'test-user' AND event_type = 'user';

-- Trigger brief generation
-- Expected: Email sent, no SMS
```

### Test Case 2: SMS with Phone Verification

```sql
-- Enable SMS without verified phone
UPDATE user_notification_preferences
SET should_sms_daily_brief = true
WHERE user_id = 'test-user' AND event_type = 'user';

UPDATE user_sms_preferences
SET phone_verified = false
WHERE user_id = 'test-user';

-- Trigger brief generation
-- Expected: No SMS sent, warning logged
```

### Test Case 3: Quiet Hours (Once Fixed)

```sql
-- Set quiet hours and enable SMS
UPDATE user_sms_preferences
SET quiet_hours_start = '22:00:00',
    quiet_hours_end = '08:00:00',
    timezone = 'America/Los_Angeles'
WHERE user_id = 'test-user';

-- Trigger brief at 11pm PT
-- Expected: SMS rescheduled to 8am PT
```

### Test Case 4: Daily Limit (Once Fixed)

```sql
-- Set limit and count near limit
UPDATE user_sms_preferences
SET daily_sms_limit = 10,
    daily_sms_count = 9
WHERE user_id = 'test-user';

-- Trigger 2 SMS sends
-- Expected: First succeeds, second blocked
```

---

## 10. Conclusion

The refactor successfully separated brief generation from notification delivery using the `event_type='user'` pattern. However, there are still important fixes needed:

1. **CRITICAL**: Add quiet hours enforcement to notification SMS
2. **CRITICAL**: Add rate limiting to notification SMS
3. Remove redundant `daily_brief_sms` check
4. Centralize timezone storage

These fixes will ensure consistent behavior across all SMS types (calendar reminders and daily brief notifications).
