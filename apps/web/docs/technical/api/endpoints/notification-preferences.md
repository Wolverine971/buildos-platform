<!-- apps/web/docs/technical/api/endpoints/notification-preferences.md -->

# Notification Preferences API Endpoints

This document provides comprehensive documentation for the Notification Preferences API endpoints in the BuildOS platform.

## Overview

The notification preferences system allows users to control how they receive notifications across multiple channels (email, SMS, push, in-app). As of **2025-10-16**, the system uses a **simplified global preference model** where each user has ONE set of preferences that apply to ALL notification types.

**Base Path:** `/api/notification-preferences`

**Authentication:** Required for all endpoints

---

## Architecture

### Global User Preferences (Post-Refactor 2025-10-16)

The current architecture uses **one row per user** in the `user_notification_preferences` table:

- **Global Settings**: User preferences apply to ALL notification events
- **No Event Types**: Removed `event_type` column and composite key
- **Simplified Model**: Users can no longer set different preferences per event type
- **Performance**: ~10x reduction in database rows (from N users × M events to N users)

**Key Principle**: User has ONE global preference set controlling ALL notifications across ALL channels.

**Opt-in Requirement (2026-02-05)**: Notification delivery requires an active `notification_subscriptions` row created via explicit opt-in (or `admin_only=true`). New users start with all channels disabled, and the API only activates subscriptions when the user opts in.

### Preference Fields

**Channel Controls:**

- `push_enabled` - Browser push notifications
- `email_enabled` - Email notifications
- `sms_enabled` - SMS text messages (requires phone verification)
- `in_app_enabled` - In-app notification center

**Delivery Controls:**

- `quiet_hours_enabled` - Block notifications during sleep hours
- `quiet_hours_start` / `quiet_hours_end` - Time window (HH:MM format)
- `batch_enabled` - Group notifications together
- `batch_interval_minutes` - Batching interval
- `max_per_hour` / `max_per_day` - Rate limiting

**User-Level Settings (Daily Briefs):**

- `should_email_daily_brief` - Email when daily brief is ready
- `should_sms_daily_brief` - SMS when daily brief is ready

### Refactor History (2025-10-16)

On 2025-10-16, the notification preferences system underwent a major architectural simplification:

**Before:**

- Multiple rows per user (one per event type)
- Composite key: `(user_id, event_type)`
- Users could set different preferences per event (e.g., email for briefs, SMS for tasks)

**After:**

- ONE row per user
- Simple unique key: `user_id`
- Global preferences apply to ALL events
- Migration consolidated multiple rows using "most permissive" strategy

See [Notification Preferences Refactor](#notification-preferences-refactor-2025-10-16) section for migration details.

---

## Endpoints

### 1. `GET /api/notification-preferences` - Get Preferences

**Purpose:** Fetch user's global notification preferences

**File:** `/apps/web/src/routes/api/notification-preferences/+server.ts`

**Authentication:** Required

#### Query Parameters

| Parameter     | Type    | Required | Default | Description                                         |
| ------------- | ------- | -------- | ------- | --------------------------------------------------- |
| `daily_brief` | boolean | No       | false   | If true, returns only daily brief preference fields |

#### Response (Full Global Preferences)

**Request:** `GET /api/notification-preferences`

```typescript
{
  preferences: {
    id: string,
    user_id: string,
    // Channel preferences (apply to ALL notifications)
    push_enabled: boolean,
    email_enabled: boolean,
    sms_enabled: boolean,
    in_app_enabled: boolean,

    // Delivery preferences
    priority: string,
    batch_enabled: boolean,
    batch_interval_minutes: number | null,
    quiet_hours_enabled: boolean,
    quiet_hours_start: string | null,  // "HH:MM:SS" format
    quiet_hours_end: string | null,     // "HH:MM:SS" format
    max_per_hour: number | null,
    max_per_day: number | null,

    // Daily brief specific (user-level)
    should_email_daily_brief: boolean,
    should_sms_daily_brief: boolean,

    created_at: string,
    updated_at: string
  }
}
```

#### Response (Daily Brief Preferences Only)

**Request:** `GET /api/notification-preferences?daily_brief=true`

```typescript
{
  preferences: {
    should_email_daily_brief: boolean,
    should_sms_daily_brief: boolean,
    updated_at: string
  }
}
```

#### Default Values

If no preferences exist, the endpoint returns explicit opt-in defaults:

```typescript
{
  preferences: {
    push_enabled: false,
    email_enabled: false,
    sms_enabled: false,
    in_app_enabled: false,
    priority: 'normal',
    batch_enabled: false,
    quiet_hours_enabled: false,
    quiet_hours_start: '22:00:00',
    quiet_hours_end: '08:00:00',
    max_per_hour: null,
    max_per_day: null,
    should_email_daily_brief: false,
    should_sms_daily_brief: false
  }
}
```

---

### 2. `PUT /api/notification-preferences` - Update Preferences

**Purpose:** Update user's global notification preferences

**File:** `/apps/web/src/routes/api/notification-preferences/+server.ts`

**Authentication:** Required

**HTTP Method:** `PUT` (CHANGED from `POST` in refactor)

#### Query Parameters

| Parameter     | Type    | Required | Default | Description                                   |
| ------------- | ------- | -------- | ------- | --------------------------------------------- |
| `daily_brief` | boolean | No       | false   | If true, validates brief generation is active |

#### Request Body

**Full Preferences Update:**

```typescript
{
  // Channel preferences (apply globally)
  push_enabled?: boolean,
  email_enabled?: boolean,
  sms_enabled?: boolean,          // Requires phone verification
  in_app_enabled?: boolean,

  // Delivery preferences
  quiet_hours_enabled?: boolean,
  quiet_hours_start?: string,      // "HH:MM:SS" format
  quiet_hours_end?: string,        // "HH:MM:SS" format
  priority?: string,               // 'low', 'normal', 'high', 'urgent'
  batch_enabled?: boolean,
  batch_interval_minutes?: number,
  max_per_hour?: number,
  max_per_day?: number,

  // Daily brief specific
  should_email_daily_brief?: boolean,
  should_sms_daily_brief?: boolean   // Requires phone verification
}
```

**Daily Brief Only Update:**

```typescript
{
  should_email_daily_brief: boolean,
  should_sms_daily_brief: boolean
}
```

#### Response

**Success:**

```typescript
{
  success: true,
  preference: {
    // Updated full preference object
    user_id: string,
    push_enabled: boolean,
    email_enabled: boolean,
    // ... all fields
    updated_at: string
  }
}
```

**Error (Phone Not Verified):**

```typescript
{
  error: "Phone number not verified",
  requiresPhoneVerification: true
}
// Status: 400
```

**Error (Phone Not Set):**

```typescript
{
  error: "Phone number required",
  requiresPhoneSetup: true
}
// Status: 400
```

**Error (Brief Not Active):**

```typescript
{
  error: "Daily brief generation is not active. Enable brief generation in Brief Preferences first.",
  requiresBriefActivation: true
}
// Status: 400
```

#### Validation Rules

**SMS Notifications:**

- Enabling `sms_enabled` or `should_sms_daily_brief` requires:
    1. Phone number added to user account
    2. Phone number verified via SMS
    3. User not opted out of SMS

**Daily Brief Preferences:**

- When updating `should_email_daily_brief` or `should_sms_daily_brief`:
    - System checks if `user_brief_preferences.is_active = true`
    - Returns error if brief generation is disabled
    - Also upserts `notification_subscriptions` for `brief.completed` and `brief.failed`
    - Subscription is active if any daily brief channel is enabled (email/SMS/push/in-app)

**Quiet Hours:**

- Must use "HH:MM:SS" format (24-hour time)
- Both start and end required if `quiet_hours_enabled = true`

---

## Notification Preferences Refactor (2025-10-16)

### Overview

On 2025-10-16, the notification preferences system underwent a major architectural refactor to simplify the data model and improve performance.

### Key Changes

#### 1. Database Schema Changes

**Before:**

```sql
-- Multiple rows per user (composite key)
CREATE TABLE user_notification_preferences (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL,  -- ❌ REMOVED
  push_enabled BOOLEAN,
  email_enabled BOOLEAN,
  sms_enabled BOOLEAN,
  in_app_enabled BOOLEAN,
  -- ... other fields
  UNIQUE(user_id, event_type)  -- Composite key
);

-- Example data:
-- user_id: 'user-123', event_type: 'brief.completed', email: true
-- user_id: 'user-123', event_type: 'task.due_soon', email: false
-- Result: 2 rows for same user
```

**After:**

```sql
-- ONE row per user (simple unique key)
CREATE TABLE user_notification_preferences (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,  -- ✅ Simple unique constraint
  -- NO event_type column
  push_enabled BOOLEAN,
  email_enabled BOOLEAN,
  sms_enabled BOOLEAN,
  in_app_enabled BOOLEAN,
  should_email_daily_brief BOOLEAN,  -- User-level field
  should_sms_daily_brief BOOLEAN,    -- User-level field
  -- ... other fields
);

-- Example data:
-- user_id: 'user-123', email: true (applies to ALL events)
-- Result: 1 row per user
```

#### 2. Event Type Tracking Moved

`event_type` now lives in `user_notifications` table for tracking which event triggered a notification:

```sql
ALTER TABLE user_notifications
ADD COLUMN event_type TEXT;  -- Tracks notification trigger
```

#### 3. Migration Strategy

**Consolidation Logic:**

- Used "most permissive" approach for boolean fields
- If ANY event type had `email_enabled = true` → global `email_enabled = true`
- Preferred legacy user-level settings when present (pre-refactor data)
- Created backup table: `user_notification_preferences_backup` (7-day retention)

**Example Consolidation:**

```
User had:
  - event_type: 'brief.completed', push: true, email: true
  - event_type: 'task.due_soon', push: false, email: false

After migration:
  - push: true (MAX), email: true (MAX)

Result: Most permissive settings win
```

### Migration Files

1. **Phase 1**: `20251016_001_prepare_notification_preferences_refactor.sql`
    - Added `event_type` to `user_notifications`
    - Created backup table

2. **Phase 3**: `20251016_002_consolidate_notification_preferences.sql`
    - Consolidated multiple rows to single row per user
    - Dropped old table, created new schema
    - Verified data integrity

3. **Phase 4**: `20251016_003_update_emit_notification_event.sql`
    - Updated database function to query without `event_type` filter
    - Stores `event_type` in `user_notifications` for tracking

### Breaking Changes

**Lost Granularity:**

- Users can no longer set different preferences per event type
- Example: Can't have "email for briefs but not for task reminders"
- Trade-off: Simplicity and performance vs. granular control

**Data Migration:**

- Users with conflicting preferences had them merged
- Most permissive settings preserved
- Original data backed up for 7 days

### Benefits

- **10x Performance**: Reduced rows from ~100K to ~10K (for 10K users, 10 events)
- **Simpler Queries**: Single row lookup instead of filtering by event_type
- **Clearer UX**: One preference screen, not per-event configuration
- **Faster Indexing**: Unique key on user_id only

---

## Opt-in Enforcement Update (2026-02-05)

### Summary

- New users start with all channels disabled (explicit opt-in).
- `emit_notification_event` fails closed when preferences are missing.
- Daily brief deliveries use `should_email_daily_brief` / `should_sms_daily_brief` instead of `email_enabled` / `sms_enabled`.
- Subscriptions are activated only via explicit opt-in (`created_by` set) or `admin_only=true`.
- Queue metadata now includes `event_id` + `event_type` for worker fallback.
- In-app notifications link to delivery/event records.

### Migration Files

- `supabase/migrations/20260205_001_notification_opt_in_defaults.sql`
- `supabase/migrations/20260205_002_emit_notification_event_opt_in.sql`
- `supabase/migrations/20260205_003_user_notifications_linkage.sql`

---

## Database Schema

### user_notification_preferences (Current Schema)

```typescript
{
	id: string; // UUID primary key
	user_id: string; // Unique foreign key to users

	// Channel preferences (global)
	push_enabled: boolean;
	email_enabled: boolean;
	sms_enabled: boolean;
	in_app_enabled: boolean;

	// Delivery preferences
	priority: string; // 'low', 'normal', 'high', 'urgent'
	batch_enabled: boolean;
	batch_interval_minutes: number | null;

	// Quiet hours
	quiet_hours_enabled: boolean;
	quiet_hours_start: string | null; // "HH:MM:SS"
	quiet_hours_end: string | null; // "HH:MM:SS"

	// Rate limiting
	max_per_hour: number | null;
	max_per_day: number | null;

	// Daily brief preferences (user-level)
	should_email_daily_brief: boolean;
	should_sms_daily_brief: boolean;

	// Timestamps
	created_at: string;
	updated_at: string;
}
```

**Unique Constraint:** `user_id` (ONE row per user)

**Indexes:**

- Primary key on `id`
- Unique index on `user_id`
- Partial index on `(user_id, should_email_daily_brief)` WHERE `should_email_daily_brief = true`
- Partial index on `(user_id, should_sms_daily_brief)` WHERE `should_sms_daily_brief = true`

### user_notifications (Event Tracking)

```typescript
{
	id: string;
	user_id: string;
	title: string;
	message: string;
	type: string; // Display type ('payment_warning', etc.)
	event_type: string | null; // ✅ NEW: Trigger event ('brief.completed', etc.)
	delivery_id: string | null; // Link to notification_deliveries
	event_id: string | null; // Link to notification_events
	action_url: string | null;
	priority: string;
	created_at: string;
	read_at: string | null;
	dismissed_at: string | null;
	expires_at: string | null;
}
```

**Note:** `event_type` added in 2025-10-16 refactor to track what triggered the notification; `delivery_id` + `event_id` added in 2026-02-05 for lifecycle correlation.

---

## Usage Examples

### Get Global Notification Preferences

```typescript
const response = await fetch('/api/notification-preferences');
const { preferences } = await response.json();

console.log('Push enabled:', preferences.push_enabled);
console.log('Email enabled:', preferences.email_enabled);
console.log('SMS enabled:', preferences.sms_enabled);
console.log('In-app enabled:', preferences.in_app_enabled);
```

### Get Daily Brief Preferences Only

```typescript
const response = await fetch('/api/notification-preferences?daily_brief=true');
const { preferences } = await response.json();

console.log('Email daily briefs:', preferences.should_email_daily_brief);
console.log('SMS daily briefs:', preferences.should_sms_daily_brief);
```

### Update Global Channel Preferences

```typescript
const response = await fetch('/api/notification-preferences', {
	method: 'PUT',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		push_enabled: true,
		email_enabled: true,
		sms_enabled: false,
		in_app_enabled: true
	})
});

const result = await response.json();
if (result.success) {
	console.log('Preferences updated:', result.preference);
}
```

### Update Daily Brief Preferences

```typescript
const response = await fetch('/api/notification-preferences', {
	method: 'PUT',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		should_email_daily_brief: true,
		should_sms_daily_brief: true
	})
});

const result = await response.json();
if (!result.success) {
	if (result.requiresPhoneVerification) {
		alert('Please verify your phone number first');
	} else if (result.requiresBriefActivation) {
		alert('Enable daily brief generation first');
	}
}
```

### Enable Quiet Hours

```typescript
const response = await fetch('/api/notification-preferences', {
	method: 'PUT',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		quiet_hours_enabled: true,
		quiet_hours_start: '22:00:00',
		quiet_hours_end: '08:00:00'
	})
});
```

---

## Error Handling

### Common Error Responses

| Scenario                       | Status | Response                                            |
| ------------------------------ | ------ | --------------------------------------------------- |
| Not authenticated              | 401    | `{ error: 'Unauthorized' }`                         |
| Phone not verified (SMS)       | 400    | `{ error: '...', requiresPhoneVerification: true }` |
| Phone not set (SMS)            | 400    | `{ error: '...', requiresPhoneSetup: true }`        |
| Brief not active (daily brief) | 400    | `{ error: '...', requiresBriefActivation: true }`   |
| User opted out (SMS)           | 400    | `{ error: '...', requiresOptIn: true }`             |
| Database error                 | 500    | `{ error: 'Failed to fetch/update preferences' }`   |

---

## UI Components

### NotificationPreferences.svelte

**Location:** `/apps/web/src/lib/components/settings/NotificationPreferences.svelte`

**Purpose:** User-facing UI for managing global notification preferences

**Sections:**

1. **Daily Brief Notifications** - Email/SMS preferences for daily briefs
2. **Additional Notification Channels** - Push and in-app toggles
3. **Quiet Hours** - Time-based notification blocking

**Features:**

- Toggle switches for all channels (apply globally)
- Phone verification warnings for SMS
- Quiet hours time range selector
- Real-time save/load via API
- Visual feedback for subscription status

**Key Methods:**

```typescript
// UPDATED: No event_type parameter
await notificationPreferencesService.get();
await notificationPreferencesService.update({ push_enabled: true });
```

### Store

**Location:** `/apps/web/src/lib/stores/notificationPreferences.ts`

**Purpose:** Manages daily brief notification preferences

**Interface:**

```typescript
export interface DailyBriefNotificationPreferences {
	should_email_daily_brief: boolean;
	should_sms_daily_brief: boolean;
	updated_at?: string;
}
```

**Methods:**

- `load()` - Fetch from API (`?daily_brief=true`)
- `save(preferences)` - Update via PUT request

---

## Related Documentation

- **Refactor Analysis:** `/thoughts/shared/research/2025-10-16_notification-preferences-refactor-analysis.md`
- **Implementation Phases:** `/thoughts/shared/research/2025-10-16_notification-preferences-refactor-implementation-phases.md`
- **Migration Files:** `/supabase/migrations/20251016_00*_*.sql`
- **Daily Briefs API:** [daily-briefs.md](./daily-briefs.md)
- **Notification System Overview:** `/apps/web/docs/features/notifications/README.md`
- **Database Schema:** `/apps/web/docs/technical/database/schema.md`

---

## Testing

### Automated Tests

**File:** `/apps/web/src/routes/api/notification-preferences/server.test.ts`

**Coverage:**

- ✅ GET with ?daily_brief=true returns daily brief fields only
- ✅ GET without params returns full global preferences
- ✅ PUT validates phone verification for SMS
- ✅ PUT validates brief activation for daily brief prefs
- ✅ Queries use user_id only (no event_type filter)
- ✅ Uses maybeSingle() for null-safe queries

### Manual Testing Checklist

- [ ] Get default preferences (no existing preferences)
- [ ] Update global channel preferences (push, email, in-app)
- [ ] Update daily brief preferences (email, SMS)
- [ ] Enable SMS without verified phone (should fail with error)
- [ ] Enable SMS with verified phone (should succeed)
- [ ] Enable quiet hours with valid times
- [ ] Verify preferences persist across sessions
- [ ] Test UI toggles update database correctly
- [ ] Verify all notifications respect global preferences

### Test Data Setup

```sql
-- Create test user with global preferences
INSERT INTO user_notification_preferences (user_id, push_enabled, email_enabled, sms_enabled, in_app_enabled)
VALUES ('test-user-id', true, true, false, true)
ON CONFLICT (user_id) DO UPDATE SET
  push_enabled = EXCLUDED.push_enabled,
  email_enabled = EXCLUDED.email_enabled;

-- Enable daily brief email
UPDATE user_notification_preferences
SET should_email_daily_brief = true
WHERE user_id = 'test-user-id';

-- Verify phone for SMS testing
UPDATE user_sms_preferences
SET phone_verified = true, phone_number = '+15551234567'
WHERE user_id = 'test-user-id';
```

---

## Notes

- All timestamps in UTC
- Phone verification required for SMS features
- ONE row per user (simple unique constraint on `user_id`)
- Global preferences apply to ALL notification types
- Quiet hours respect user's timezone setting (stored in `users.timezone`)
- `event_type` removed from preferences table, added to notifications table for tracking
- Backup table available for 7 days post-migration: `user_notification_preferences_backup`
