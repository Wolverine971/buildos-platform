---
date: 2025-10-13T17:40:27-07:00
researcher: Claude Code
git_commit: 6e0f4fcff7e4b19f003d75ccb8634f8f2b78b41a
branch: main
repository: buildos-platform
topic: "Clean SMS Flow Data Model Specification - Post-Refactor Architecture"
tags:
  [
    specification,
    sms,
    notifications,
    data-model,
    architecture,
    user_sms_preferences,
  ]
status: complete
last_updated: 2025-10-13
last_updated_by: Claude Code
related_docs:
  - thoughts/shared/research/2025-10-13_17-40-27_sms-flow-deprecation-migration-plan.md
  - thoughts/shared/research/2025-10-13_04-55-45_overlapping-notification-preferences-analysis.md
---

# Clean SMS Flow Data Model Specification

**Date**: 2025-10-13T17:40:27-07:00
**Researcher**: Claude Code
**Git Commit**: 6e0f4fcff7e4b19f003d75ccb8634f8f2b78b41a
**Branch**: main
**Repository**: buildos-platform

## Overview

This document specifies the CLEAN, FINAL SMS flow data model after completing the notification preferences refactor and removing deprecated fields.

**Goal**: Define a clear, maintainable SMS architecture with no redundancy or confusion.

**Principles**:

1. **Single Source of Truth**: Each setting has ONE location
2. **Separation of Concerns**: User preferences vs SMS-specific settings vs safety controls
3. **Consistency**: All SMS types follow the same safety rules
4. **Extensibility**: Easy to add new SMS notification types

---

## Architecture Overview

### Three-Layer Model

```
┌─────────────────────────────────────────────────────┐
│ Layer 1: USER PREFERENCES                           │
│ (What notifications do I want?)                     │
│                                                      │
│ user_notification_preferences (event_type='user')   │
│ ├── should_email_daily_brief                        │
│ └── should_sms_daily_brief                          │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│ Layer 2: SMS FEATURE TOGGLES                        │
│ (Which SMS features are enabled?)                   │
│                                                      │
│ user_sms_preferences                                │
│ ├── event_reminders_enabled                         │
│ ├── morning_kickoff_enabled (future)                │
│ └── evening_recap_enabled (future)                  │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│ Layer 3: SMS SAFETY CONTROLS                        │
│ (Global rules for ALL SMS)                          │
│                                                      │
│ user_sms_preferences                                │
│ ├── Phone verification                              │
│ ├── Quiet hours                                     │
│ └── Rate limiting                                   │
└─────────────────────────────────────────────────────┘
```

---

## Data Model Specification

### Table 1: `user_notification_preferences`

**Purpose**: User-level notification delivery preferences

**Schema**:

```sql
CREATE TABLE user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,

  -- User-Level Daily Brief Controls (event_type='user')
  should_email_daily_brief BOOLEAN DEFAULT false,
  should_sms_daily_brief BOOLEAN DEFAULT false,

  -- Event-Based Notification Controls (other event_types)
  push_enabled BOOLEAN DEFAULT true,
  in_app_enabled BOOLEAN DEFAULT true,
  email_enabled BOOLEAN DEFAULT false,
  sms_enabled BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Composite primary key
  UNIQUE (user_id, event_type)
);
```

**Key Fields**:

| Field                      | Type    | Purpose                                         | Used For                                                              |
| -------------------------- | ------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| `event_type`               | TEXT    | Distinguishes user-level from event-based prefs | `'user'` for daily brief, `'brief.completed'` for event notifications |
| `should_email_daily_brief` | BOOLEAN | Enable email when daily brief completes         | event_type='user' only                                                |
| `should_sms_daily_brief`   | BOOLEAN | Enable SMS when daily brief completes           | event_type='user' only                                                |
| `email_enabled`            | BOOLEAN | Enable email for specific events                | event_type='brief.completed', etc.                                    |
| `sms_enabled`              | BOOLEAN | Enable SMS for specific events                  | event_type='task.reminder', etc.                                      |

**Design Decisions**:

- ✅ `event_type='user'` stores user-level daily brief preferences
- ✅ Other event types store event-based notification preferences
- ✅ Composite PK `(user_id, event_type)` prevents duplicate rows

---

### Table 2: `user_sms_preferences`

**Purpose**: SMS-specific settings and safety controls

**Schema**:

```sql
CREATE TABLE user_sms_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  -- Phone Verification (Required for ALL SMS)
  phone_number TEXT,
  phone_verified BOOLEAN DEFAULT false,
  phone_verified_at TIMESTAMPTZ,
  opted_out BOOLEAN DEFAULT false,
  opted_out_at TIMESTAMPTZ,
  opt_out_reason TEXT,

  -- SMS Feature Toggles
  event_reminders_enabled BOOLEAN DEFAULT false,           -- Calendar event reminders
  event_reminder_lead_time_minutes INTEGER DEFAULT 15,     -- Minutes before event
  morning_kickoff_enabled BOOLEAN DEFAULT false,           -- Future: Morning summary
  morning_kickoff_time TIME DEFAULT '08:00:00',            -- Future: When to send
  evening_recap_enabled BOOLEAN DEFAULT false,             -- Future: Evening recap

  -- Safety Controls (Applied to ALL SMS)
  quiet_hours_start TIME,                                  -- HH:MM:SS (e.g., '22:00:00')
  quiet_hours_end TIME,                                    -- HH:MM:SS (e.g., '08:00:00')
  daily_sms_limit INTEGER DEFAULT 10,                      -- Max SMS per day
  daily_sms_count INTEGER DEFAULT 0,                       -- Current count
  daily_count_reset_at TIMESTAMPTZ,                        -- Last reset time

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Field Categories**:

#### 1. Phone Verification (REQUIRED for ALL SMS)

| Field               | Type        | Default | Purpose                            |
| ------------------- | ----------- | ------- | ---------------------------------- |
| `phone_number`      | TEXT        | NULL    | User's phone number (E.164 format) |
| `phone_verified`    | BOOLEAN     | false   | Phone verified via SMS code        |
| `phone_verified_at` | TIMESTAMPTZ | NULL    | When verification occurred         |
| `opted_out`         | BOOLEAN     | false   | User opted out of ALL SMS          |
| `opted_out_at`      | TIMESTAMPTZ | NULL    | When user opted out                |
| `opt_out_reason`    | TEXT        | NULL    | Why user opted out (optional)      |

**Validation Rules**:

- ✅ SMS can ONLY be sent if `phone_verified = true`
- ✅ SMS MUST be blocked if `opted_out = true`
- ✅ `phone_number` must exist and be valid E.164 format

---

#### 2. SMS Feature Toggles

| Field                              | Type    | Default  | Purpose                         | Status         |
| ---------------------------------- | ------- | -------- | ------------------------------- | -------------- |
| `event_reminders_enabled`          | BOOLEAN | false    | Enable calendar event reminders | ✅ **WORKING** |
| `event_reminder_lead_time_minutes` | INTEGER | 15       | Minutes before event to send    | ✅ **WORKING** |
| `morning_kickoff_enabled`          | BOOLEAN | false    | Enable morning summary SMS      | ⏳ **FUTURE**  |
| `morning_kickoff_time`             | TIME    | 08:00:00 | When to send morning SMS        | ⏳ **FUTURE**  |
| `evening_recap_enabled`            | BOOLEAN | false    | Enable evening recap SMS        | ⏳ **FUTURE**  |

**Design Decisions**:

- ✅ Each SMS feature has its own toggle
- ✅ Daily brief SMS controlled by `user_notification_preferences.should_sms_daily_brief`
- ✅ Clear separation: Feature toggles vs User preferences

---

#### 3. Safety Controls (Applied to ALL SMS)

| Field                  | Type        | Default | Purpose                                |
| ---------------------- | ----------- | ------- | -------------------------------------- |
| `quiet_hours_start`    | TIME        | NULL    | Start of quiet hours (user's timezone) |
| `quiet_hours_end`      | TIME        | NULL    | End of quiet hours (user's timezone)   |
| `daily_sms_limit`      | INTEGER     | 10      | Max SMS per day (prevents spam)        |
| `daily_sms_count`      | INTEGER     | 0       | Current SMS sent today                 |
| `daily_count_reset_at` | TIMESTAMPTZ | NULL    | Last time count was reset              |

**Enforcement Rules**:

- ✅ **MUST** check quiet hours for ALL SMS types
- ✅ **MUST** check rate limits for ALL SMS types
- ✅ **MUST** respect timezone (from `users.timezone`)

---

## SMS Flow Logic

### Decision Tree for Sending SMS

```
┌─────────────────────────────────────────────┐
│ SMS Send Request                            │
│ (e.g., daily brief completed)               │
└─────────────────┬───────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│ Step 1: Check User Preference               │
│                                             │
│ IF event_type='user':                       │
│   → Check should_sms_daily_brief            │
│ ELSE:                                       │
│   → Check sms_enabled for event_type        │
└─────────────────┬───────────────────────────┘
                  ↓ [ENABLED]
┌─────────────────────────────────────────────┐
│ Step 2: Check Feature Toggle                │
│                                             │
│ IF daily brief:                             │
│   → No additional check (user pref only)    │
│ IF calendar reminder:                       │
│   → Check event_reminders_enabled           │
│ IF morning kickoff:                         │
│   → Check morning_kickoff_enabled           │
└─────────────────┬───────────────────────────┘
                  ↓ [ENABLED]
┌─────────────────────────────────────────────┐
│ Step 3: Phone Verification Check            │
│                                             │
│ user_sms_preferences:                       │
│   ✓ phone_number exists?                    │
│   ✓ phone_verified = true?                  │
│   ✓ opted_out = false?                      │
└─────────────────┬───────────────────────────┘
                  ↓ [VERIFIED]
┌─────────────────────────────────────────────┐
│ Step 4: Rate Limit Check                    │
│                                             │
│ user_sms_preferences:                       │
│   ✓ daily_sms_count < daily_sms_limit?      │
│                                             │
│ IF exceeded:                                │
│   → Block SMS                               │
│   → Log "Daily SMS limit reached"           │
└─────────────────┬───────────────────────────┘
                  ↓ [WITHIN LIMIT]
┌─────────────────────────────────────────────┐
│ Step 5: Quiet Hours Check                   │
│                                             │
│ user_sms_preferences:                       │
│   ✓ quiet_hours_start, quiet_hours_end set? │
│   ✓ Current time in quiet hours?            │
│                                             │
│ IF in quiet hours:                          │
│   → Reschedule to quiet_hours_end           │
│   → Log "Rescheduled due to quiet hours"    │
└─────────────────┬───────────────────────────┘
                  ↓ [NOT IN QUIET HOURS]
┌─────────────────────────────────────────────┐
│ ✅ Send SMS via Twilio                      │
│                                             │
│ Post-send:                                  │
│   → Increment daily_sms_count               │
│   → Update sms_messages table               │
│   → Track delivery status                   │
└─────────────────────────────────────────────┘
```

---

## SMS Type Specifications

### 1. Daily Brief SMS

**Trigger**: When daily brief generation completes

**User Control**: `user_notification_preferences.should_sms_daily_brief` (event_type='user')

**Flow**:

```typescript
// apps/worker/src/workers/brief/briefWorker.ts

if (notificationPrefs?.should_sms_daily_brief) {
  // Check phone verification
  const smsPrefs = await getSMSPreferences(userId);

  if (smsPrefs.phone_verified && !smsPrefs.opted_out) {
    // Check rate limits
    if (smsPrefs.daily_sms_count < smsPrefs.daily_sms_limit) {
      // Check quiet hours
      if (!isInQuietHours(smsPrefs)) {
        // Send SMS
        await sendDailyBriefSMS(userId, briefId);
      }
    }
  }
}
```

**Safety Checks**:

- ✅ Phone verification
- ✅ Rate limiting
- ✅ Quiet hours

---

### 2. Calendar Event Reminder SMS

**Trigger**: Nightly at midnight (12:00 AM)

**User Control**: `user_sms_preferences.event_reminders_enabled`

**Flow**:

```typescript
// apps/worker/src/scheduler.ts

// Every midnight, schedule reminders for users with event_reminders_enabled = true
SELECT user_id, timezone FROM user_sms_preferences
WHERE event_reminders_enabled = true
  AND phone_verified = true
  AND opted_out = false;

// For each user:
//   1. Fetch calendar events for today
//   2. Generate SMS messages (LLM or template)
//   3. Schedule SMS for (event_start - lead_time_minutes)
//   4. Apply quiet hours and rate limits
```

**Safety Checks**:

- ✅ Phone verification (checked before scheduling)
- ✅ Rate limiting (checked at schedule time and send time)
- ✅ Quiet hours (checked at send time, reschedule if needed)

---

### 3. Morning Kickoff SMS (FUTURE FEATURE)

**Trigger**: Daily at `morning_kickoff_time` (user's timezone)

**User Control**: `user_sms_preferences.morning_kickoff_enabled`

**Flow** (Not Yet Implemented):

```typescript
// apps/worker/src/scheduler.ts (future)

// Every hour, check for users with morning_kickoff scheduled
SELECT user_id, morning_kickoff_time, timezone
FROM user_sms_preferences
WHERE morning_kickoff_enabled = true
  AND phone_verified = true
  AND opted_out = false
  AND (current_time_in_tz >= morning_kickoff_time);

// For each user:
//   1. Fetch tasks and calendar events for today
//   2. Generate morning summary message (LLM)
//   3. Send SMS
//   4. Apply rate limits and quiet hours
```

**Implementation Status**: ❌ NOT IMPLEMENTED

- UI exists and saves preferences to database
- NO worker code to generate or send messages
- See migration plan for implementation guidance

---

### 4. Evening Recap SMS (FUTURE FEATURE)

**Trigger**: Daily at evening time (e.g., 8:00 PM in user's timezone)

**User Control**: `user_sms_preferences.evening_recap_enabled`

**Flow** (Not Yet Implemented):

```typescript
// apps/worker/src/scheduler.ts (future)

// Every evening (e.g., 8 PM), send recap
SELECT user_id, timezone
FROM user_sms_preferences
WHERE evening_recap_enabled = true
  AND phone_verified = true
  AND opted_out = false;

// For each user:
//   1. Fetch completed tasks for today
//   2. Fetch calendar events that occurred
//   3. Generate recap message (LLM)
//   4. Send SMS
//   5. Apply rate limits and quiet hours
```

**Implementation Status**: ❌ NOT IMPLEMENTED

- UI exists and saves preferences to database
- NO worker code to generate or send messages
- See migration plan for implementation guidance

---

## Safety Controls Implementation

### Quiet Hours Check

**Purpose**: Prevent SMS during user's sleep hours

**Implementation**:

```typescript
// apps/worker/src/lib/utils/quietHoursChecker.ts

import { utcToZonedTime } from "date-fns-tz";

export function isInQuietHours(
  smsPrefs: UserSMSPreferences,
  sendTime: Date = new Date(),
): boolean {
  if (!smsPrefs.quiet_hours_start || !smsPrefs.quiet_hours_end) {
    return false; // No quiet hours set
  }

  const timezone = smsPrefs.timezone || "UTC";
  const timeInUserTz = utcToZonedTime(sendTime, timezone);
  const currentMinutes =
    timeInUserTz.getHours() * 60 + timeInUserTz.getMinutes();

  const [startHour, startMin] = smsPrefs.quiet_hours_start
    .split(":")
    .map(Number);
  const [endHour, endMin] = smsPrefs.quiet_hours_end.split(":").map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  // Handle overnight quiet hours (e.g., 22:00 - 08:00)
  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

export function calculateQuietHoursEnd(
  quietHoursEnd: string,
  timezone: string,
): Date {
  const [endHour, endMin] = quietHoursEnd.split(":").map(Number);
  const now = new Date();
  const endTime = utcToZonedTime(now, timezone);

  endTime.setHours(endHour, endMin, 0, 0);

  // If end time already passed today, schedule for tomorrow
  if (endTime <= now) {
    endTime.setDate(endTime.getDate() + 1);
  }

  return zonedTimeToUtc(endTime, timezone);
}
```

**Where to Apply**:

- ✅ Calendar event reminders: Already implemented in `dailySmsWorker.ts:220-251`
- 🚨 Daily brief SMS: **MISSING** - must add to `smsAdapter.ts`
- ⏳ Future features: Must include when implementing

**Behavior**:

- If SMS scheduled during quiet hours → Reschedule to `quiet_hours_end`
- Log reschedule event for debugging

---

### Rate Limiting Check

**Purpose**: Prevent SMS spam, control Twilio costs

**Implementation**:

```typescript
// apps/worker/src/lib/utils/rateLimitChecker.ts

import { format, parseISO } from "date-fns";

export async function checkAndIncrementSMSCount(
  userId: string,
  supabase: SupabaseClient,
): Promise<{ allowed: boolean; reason?: string }> {
  const { data: smsPrefs, error } = await supabase
    .from("user_sms_preferences")
    .select("daily_sms_count, daily_sms_limit, daily_count_reset_at")
    .eq("user_id", userId)
    .single();

  if (error || !smsPrefs) {
    return { allowed: false, reason: "SMS preferences not found" };
  }

  // Check if count needs reset
  const today = format(new Date(), "yyyy-MM-dd");
  const lastReset = smsPrefs.daily_count_reset_at
    ? format(parseISO(smsPrefs.daily_count_reset_at), "yyyy-MM-dd")
    : null;

  let currentCount = smsPrefs.daily_sms_count || 0;
  const limit = smsPrefs.daily_sms_limit || 10;

  if (!lastReset || lastReset !== today) {
    // Reset count for new day
    currentCount = 0;
    await supabase
      .from("user_sms_preferences")
      .update({
        daily_sms_count: 0,
        daily_count_reset_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  }

  if (currentCount >= limit) {
    return {
      allowed: false,
      reason: `Daily SMS limit reached (${currentCount}/${limit})`,
    };
  }

  // Increment count BEFORE sending (prevents race conditions)
  await supabase
    .from("user_sms_preferences")
    .update({ daily_sms_count: currentCount + 1 })
    .eq("user_id", userId);

  return { allowed: true };
}
```

**Where to Apply**:

- ✅ Calendar event reminders: Already implemented in `dailySmsWorker.ts:104-129` and `smsWorker.ts:173-197`
- 🚨 Daily brief SMS: **MISSING** - must add to `smsAdapter.ts`
- ⏳ Future features: Must include when implementing

**Behavior**:

- Check count before sending
- Increment count BEFORE sending (prevents race conditions)
- Reset count at midnight in user's timezone

---

## TypeScript Interfaces

### User Notification Preferences

```typescript
// packages/shared-types/src/index.ts

export interface UserNotificationPreferences {
  id: string;
  user_id: string;
  event_type: string;

  // User-Level Daily Brief (event_type='user')
  should_email_daily_brief: boolean;
  should_sms_daily_brief: boolean;

  // Event-Based Notifications
  push_enabled: boolean;
  in_app_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;

  created_at: string;
  updated_at: string;
}

export type DailyBriefNotificationPrefs = Pick<
  UserNotificationPreferences,
  "should_email_daily_brief" | "should_sms_daily_brief"
>;
```

---

### SMS Preferences

```typescript
// packages/shared-types/src/index.ts

export interface UserSMSPreferences {
  id: string;
  user_id: string;

  // Phone Verification
  phone_number: string | null;
  phone_verified: boolean;
  phone_verified_at: string | null;
  opted_out: boolean;
  opted_out_at: string | null;
  opt_out_reason: string | null;

  // SMS Feature Toggles
  event_reminders_enabled: boolean;
  event_reminder_lead_time_minutes: number;
  morning_kickoff_enabled: boolean;
  morning_kickoff_time: string; // TIME format
  evening_recap_enabled: boolean;

  // Safety Controls
  quiet_hours_start: string | null; // TIME format
  quiet_hours_end: string | null; // TIME format
  daily_sms_limit: number;
  daily_sms_count: number;
  daily_count_reset_at: string | null;

  // Metadata
  created_at: string;
  updated_at: string;
}

// Helper type for phone verification check
export type PhoneVerificationStatus = Pick<
  UserSMSPreferences,
  "phone_number" | "phone_verified" | "opted_out"
>;

// Helper type for safety controls
export type SMSSafetyControls = Pick<
  UserSMSPreferences,
  | "quiet_hours_start"
  | "quiet_hours_end"
  | "daily_sms_limit"
  | "daily_sms_count"
>;
```

---

## Migration from Current State

### Deprecated Fields (TO BE REMOVED)

| Field               | Current Location         | Replacement                                    | Action                                         |
| ------------------- | ------------------------ | ---------------------------------------------- | ---------------------------------------------- |
| `daily_brief_sms`   | `user_sms_preferences`   | `should_sms_daily_brief` (event_type='user')   | Remove from code, mark deprecated, drop column |
| `task_reminders`    | `user_sms_preferences`   | N/A (never implemented)                        | Remove completely                              |
| `next_up_enabled`   | `user_sms_preferences`   | N/A (never implemented)                        | Remove completely                              |
| `email_daily_brief` | `user_brief_preferences` | `should_email_daily_brief` (event_type='user') | Already marked deprecated                      |

### Fields to Keep

| Field                     | Location               | Purpose             | Status        |
| ------------------------- | ---------------------- | ------------------- | ------------- |
| `event_reminders_enabled` | `user_sms_preferences` | Calendar event SMS  | ✅ Production |
| `morning_kickoff_enabled` | `user_sms_preferences` | Morning summary SMS | ⏳ Future     |
| `evening_recap_enabled`   | `user_sms_preferences` | Evening recap SMS   | ⏳ Future     |
| `quiet_hours_*`           | `user_sms_preferences` | Sleep protection    | ✅ Keep       |
| `daily_sms_limit`         | `user_sms_preferences` | Spam prevention     | ✅ Keep       |
| Phone verification fields | `user_sms_preferences` | SMS auth            | ✅ Keep       |

---

## API Endpoints

### Get Daily Brief Notification Preferences

```typescript
GET /api/notification-preferences?daily_brief=true

Response:
{
  should_email_daily_brief: boolean;
  should_sms_daily_brief: boolean;
  updated_at: string;
}
```

### Update Daily Brief Notification Preferences

```typescript
POST /api/notification-preferences?daily_brief=true

Body:
{
  should_email_daily_brief: boolean;
  should_sms_daily_brief: boolean;
}

Response:
{
  success: true;
  data: {
    should_email_daily_brief: boolean;
    should_sms_daily_brief: boolean;
    updated_at: string;
  }
}
```

### Get SMS Feature Preferences

```typescript
GET / api / sms / preferences;

Response: {
  // Phone Verification
  phone_number: string | null;
  phone_verified: boolean;
  opted_out: boolean;

  // Feature Toggles
  event_reminders_enabled: boolean;
  event_reminder_lead_time_minutes: number;
  morning_kickoff_enabled: boolean;
  morning_kickoff_time: string;
  evening_recap_enabled: boolean;

  // Safety Controls
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  daily_sms_limit: number;
  daily_sms_count: number;
}
```

### Update SMS Preferences

```typescript
PUT /api/sms/preferences

Body:
{
  event_reminders_enabled?: boolean;
  event_reminder_lead_time_minutes?: number;
  morning_kickoff_enabled?: boolean;
  morning_kickoff_time?: string;
  evening_recap_enabled?: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  daily_sms_limit?: number;
}

Response:
{
  success: true;
  data: UserSMSPreferences;
}
```

---

## UI Component Guidelines

### Daily Brief Notification Settings

**Location**: Settings → Notifications → Daily Brief Notifications

**Controls**:

- [ ] Email Daily Brief (toggle)
- [ ] SMS Daily Brief (toggle with phone verification check)

**Logic**:

```typescript
// If user enables SMS but phone not verified:
if (should_sms_daily_brief && !phone_verified) {
  showPhoneVerificationModal();
  should_sms_daily_brief = false; // Revert until verified
}
```

---

### SMS Feature Settings

**Location**: Settings → SMS Preferences

**Sections**:

1. **Phone Verification** (Top section - required)
   - Display verified phone number or verification button
   - Show opt-out status

2. **SMS Features** (Main section)
   - [ ] Calendar Event Reminders (toggle) ✅ Working
     - Lead time slider (5, 10, 15, 30, 60 minutes)
   - [ ] Morning Kickoff (toggle + time picker) ⏳ Coming Soon
   - [ ] Evening Recap (toggle) ⏳ Coming Soon

3. **Safety Settings** (Advanced section)
   - Quiet hours (start time, end time pickers)
   - Daily SMS limit (number input, 1-50 range)
   - Current SMS count / limit display

**Design Notes**:

- Disable SMS feature toggles if phone not verified
- Show "Coming Soon" badge for unimplemented features
- Explain what each feature does with helpful descriptions

---

## Testing Checklist

### Unit Tests

- [ ] `isInQuietHours()` correctly handles overnight quiet hours
- [ ] `isInQuietHours()` respects timezone
- [ ] `checkAndIncrementSMSCount()` resets count at midnight
- [ ] `checkAndIncrementSMSCount()` blocks when limit reached
- [ ] Phone verification checks block SMS correctly

### Integration Tests

- [ ] Daily brief SMS sends when `should_sms_daily_brief = true`
- [ ] Daily brief SMS blocked when phone not verified
- [ ] Daily brief SMS blocked when opted out
- [ ] Daily brief SMS rescheduled if in quiet hours
- [ ] Daily brief SMS blocked when rate limit reached
- [ ] Calendar event SMS sends correctly
- [ ] All SMS types respect quiet hours
- [ ] All SMS types respect rate limits

### E2E Tests

- [ ] User can enable daily brief SMS from settings
- [ ] User can set quiet hours and SMS respects them
- [ ] User can set daily limit and SMS stops at limit
- [ ] User can opt out and ALL SMS stops
- [ ] Phone verification flow works end-to-end

---

## Monitoring & Metrics

### Key Metrics to Track

1. **SMS Delivery Success Rate**
   - Total SMS sent vs delivered
   - Failed SMS reasons

2. **Quiet Hours Violations**
   - Should be 0 after bug fixes deployed

3. **Rate Limit Hits**
   - How many users hit daily limits
   - Adjust defaults if too restrictive

4. **Phone Verification Rate**
   - % of users who verify phone numbers

5. **Opt-Out Rate**
   - Track why users opt out
   - Improve SMS experience

### Monitoring Queries

```sql
-- SMS sent during quiet hours (should be 0)
SELECT COUNT(*) as violations
FROM notification_deliveries d
JOIN user_sms_preferences s ON s.user_id = d.recipient_user_id
WHERE d.channel = 'sms'
  AND d.status = 'delivered'
  AND d.sent_at > NOW() - INTERVAL '24 hours'
  AND is_in_quiet_hours(d.sent_at, s.quiet_hours_start, s.quiet_hours_end, s.timezone);

-- Users exceeding daily SMS limit
SELECT user_id, COUNT(*) as sms_sent, daily_sms_limit
FROM notification_deliveries d
JOIN user_sms_preferences s ON s.user_id = d.recipient_user_id
WHERE d.channel = 'sms'
  AND d.status = 'delivered'
  AND DATE(d.sent_at) = CURRENT_DATE
GROUP BY user_id, daily_sms_limit
HAVING COUNT(*) > daily_sms_limit;
```

---

## Summary

### Clean Architecture After Migration

**User Preferences**:

- `should_email_daily_brief` (event_type='user')
- `should_sms_daily_brief` (event_type='user')

**SMS Features**:

- `event_reminders_enabled` ✅
- `morning_kickoff_enabled` ⏳
- `evening_recap_enabled` ⏳

**Safety Controls** (Applied to ALL SMS):

- Phone verification ✅
- Quiet hours ✅
- Rate limiting ✅

### Key Improvements

- ✅ No duplicate preference checks
- ✅ Single source of truth for each setting
- ✅ Consistent safety rules for all SMS types
- ✅ Clear separation of user preferences vs feature toggles vs safety controls
- ✅ Extensible architecture for future SMS types

### Next Steps

1. Implement Phase 1 bug fixes (quiet hours + rate limiting for daily brief SMS)
2. Remove deprecated fields from codebase
3. Drop deprecated columns from database
4. (Optional) Implement morning_kickoff and evening_recap features

---

**End of Specification**
