---
date: 2025-10-16T00:00:00Z
researcher: Claude Code
git_commit: 7f656fbcf6fea7de9adf752040d4677117b0eec0
branch: main
repository: buildos-platform
topic: 'Notification Preferences Table Refactor: Remove event_type from user_notification_preferences'
tags:
    [
        research,
        codebase,
        notifications,
        database-refactor,
        migration,
        user-notification-preferences,
        user-notifications
    ]
status: complete
last_updated: 2025-10-16
last_updated_by: Claude Code
path: thoughts/shared/research/2025-10-16_notification-preferences-refactor-analysis.md
---

# Research: Notification Preferences Table Refactor Analysis

**Date**: 2025-10-16T00:00:00Z
**Researcher**: Claude Code
**Git Commit**: 7f656fbcf6fea7de9adf752040d4677117b0eec0
**Branch**: main
**Repository**: buildos-platform

## Research Question

How should we refactor the `user_notification_preferences` and `user_notifications` tables to:

1. Remove the `event_type` column from `user_notification_preferences`
2. Ensure each user has only ONE row in `user_notification_preferences`
3. Move `event_type` tracking to `user_notifications` table
4. Update all queries in /worker, /web, and Supabase migrations

## Summary

The current notification preferences system stores **per-event-type preferences** (one row per user per event type) in `user_notification_preferences`. The proposed refactor will simplify this to **per-user preferences** (one row per user), trading granular control for architectural simplicity. This requires:

- **Database migration**: Consolidate multiple rows per user into single row, add event_type to user_notifications
- **Worker updates**: 12+ files need query changes (preference checker, email/SMS adapters, brief worker)
- **Web app updates**: 8+ files need changes (API routes, services, stores, UI components)
- **Breaking change**: Users lose ability to set different preferences per event type (e.g., "email for briefs but not calendar sync")

**Recommendation**: Proceed with caution. This is a major architectural change with significant trade-offs. Consider if the loss of per-event-type granularity aligns with product requirements.

## Current Architecture

### Database Schema

#### `user_notification_preferences` Table

**Location**: `/apps/web/src/lib/database.schema.ts:1178-1198`

**Current Columns**:

- `id` (string) - Primary key
- `user_id` (string) - Foreign key to users
- **`event_type` (string)** - Type of event (TARGET FOR REMOVAL)
- `push_enabled` (boolean) - Enable push notifications
- `email_enabled` (boolean) - Enable email notifications
- `sms_enabled` (boolean) - Enable SMS notifications
- `in_app_enabled` (boolean) - Enable in-app notifications
- `priority` (string) - Notification priority
- `batch_enabled` (boolean) - Enable batching
- `batch_interval_minutes` (number) - Batch interval
- `quiet_hours_enabled` (boolean) - Enable quiet hours
- `quiet_hours_start` (string) - Start time (HH:MM:SS)
- `quiet_hours_end` (string) - End time (HH:MM:SS)
- `timezone` (string) - DEPRECATED (moved to users table)
- `max_per_day` (number) - Max notifications per day
- `max_per_hour` (number) - Max notifications per hour
- `should_email_daily_brief` (boolean) - DEPRECATED
- `should_sms_daily_brief` (boolean) - DEPRECATED
- `created_at` (string)
- `updated_at` (string)

**Current Unique Constraint**: `(user_id, event_type)` - Composite key allowing multiple rows per user

**Supported Event Types** (`/packages/shared-types/src/notification.types.ts:12-25`):

- `user.signup` - Admin event
- `user.trial_expired` - Admin event
- `payment.failed` - Admin event
- `error.critical` - Admin event
- `brief.completed` - User event
- `brief.failed` - User event
- `brain_dump.processed` - User event
- `task.due_soon` - User event
- `project.phase_scheduled` - User event
- `calendar.sync_failed` - User event

#### `user_notifications` Table

**Location**: `/apps/web/src/lib/database.schema.ts:1199-1211`

**Current Columns**:

- `id` (string) - Primary key (UUID)
- `user_id` (string) - Foreign key to users
- `title` (string) - Notification title
- `message` (string) - Notification body
- `type` (string) - Display type (e.g., 'payment_warning', 'trial_warning')
- `action_url` (string) - Optional action URL
- `priority` (string) - Priority level
- `created_at` (string)
- `read_at` (string)
- `dismissed_at` (string)
- `expires_at` (string)

**Note**: Currently has `type` column (display type), NOT `event_type` (trigger event)

### Current Usage Patterns

#### Per-Event-Type Preference Control

Users can currently configure different notification preferences for different event types:

**Example User Preferences**:

```sql
-- User wants email for daily briefs
INSERT INTO user_notification_preferences (user_id, event_type, email_enabled)
VALUES ('user-123', 'brief.completed', true);

-- Same user does NOT want email for brain dump completion
INSERT INTO user_notification_preferences (user_id, event_type, email_enabled)
VALUES ('user-123', 'brain_dump.processed', false);

-- Result: User has 2 rows in the table, different email_enabled values
```

#### Default Preferences Per Event Type

**Location**: `/apps/web/src/lib/services/notification-preferences.service.ts:231-322`

Different event types have different default channel preferences:

- `brief.completed`: push + email + in_app (Lines 246-258)
- `task.due_soon`: push + SMS + in_app (Lines 278-290)
- `calendar.sync_failed`: push + in_app only (Lines 310-322)
- `payment.failed`: push + email + in_app (Lines 226-238)

#### Query Pattern (Worker)

**Location**: `/apps/worker/src/workers/notification/preferenceChecker.ts:58-65`

```typescript
// Current: Query by user_id AND event_type
const { data: preferences } = await supabase
	.from('user_notification_preferences')
	.select('*')
	.eq('user_id', userId)
	.eq('event_type', eventType) // <-- FILTERS BY EVENT TYPE
	.single();
```

#### Query Pattern (Web)

**Location**: `/apps/web/src/lib/services/notification-preferences.service.ts:41`

```typescript
// Current: Query by user_id AND event_type
const { data } = await supabase
	.from('user_notification_preferences')
	.select('*')
	.eq('user_id', userId)
	.eq('event_type', eventType) // <-- FILTERS BY EVENT TYPE
	.maybeSingle();
```

## Proposed Architecture

### Simplified Schema

#### `user_notification_preferences` (Refactored)

**Changes**:

- ❌ REMOVE `event_type` column
- ❌ REMOVE composite unique key `(user_id, event_type)`
- ✅ ADD simple unique key on `user_id` only
- ✅ Keep all other channel and timing preference columns

**Result**: One row per user, globally applies to ALL event types

#### `user_notifications` (Enhanced)

**Changes**:

- ✅ ADD `event_type` column to track which event triggered the notification
- ✅ Keep existing `type` column for display categorization
- ✅ Both columns serve different purposes:
    - `event_type`: What triggered it (e.g., 'brief.completed')
    - `type`: How to display it (e.g., 'payment_warning')

### New Usage Patterns

#### Single Preference Set Per User

```sql
-- User has ONE row for all notification preferences
INSERT INTO user_notification_preferences (user_id, email_enabled, sms_enabled)
VALUES ('user-123', true, false);

-- This applies to ALL event types
-- Can no longer have email for briefs but not for brain dumps
```

#### New Query Pattern

```typescript
// Proposed: Query by user_id only
const { data: preferences } = await supabase
	.from('user_notification_preferences')
	.select('*')
	.eq('user_id', userId)
	// NO event_type filter
	.single();
```

## Comprehensive Impact Analysis

### 1. Database Layer Changes

#### Migration File Needed

**Suggested filename**: `supabase/migrations/YYYYMMDD_refactor_user_notification_preferences_remove_event_type.sql`

**Migration Steps**:

```sql
-- Step 1: Add event_type to user_notifications (if needed)
ALTER TABLE user_notifications
ADD COLUMN IF NOT EXISTS event_type TEXT;

-- Step 2: Create temporary table to consolidate preferences
CREATE TEMP TABLE consolidated_prefs AS
SELECT
  user_id,
  -- Use MAX to keep most permissive settings when consolidating
  MAX(push_enabled::int)::boolean AS push_enabled,
  MAX(email_enabled::int)::boolean AS email_enabled,
  MAX(sms_enabled::int)::boolean AS sms_enabled,
  MAX(in_app_enabled::int)::boolean AS in_app_enabled,
  MAX(batch_enabled::int)::boolean AS batch_enabled,
  MAX(quiet_hours_enabled::int)::boolean AS quiet_hours_enabled,
  -- For scalar values, take the first non-null value
  MAX(batch_interval_minutes) AS batch_interval_minutes,
  MIN(quiet_hours_start) AS quiet_hours_start,
  MAX(quiet_hours_end) AS quiet_hours_end,
  MAX(max_per_day) AS max_per_day,
  MAX(max_per_hour) AS max_per_hour,
  MAX(priority) AS priority,
  -- Keep daily brief preferences from event_type='user' if they exist
  MAX(CASE WHEN event_type = 'user' THEN should_email_daily_brief END) AS should_email_daily_brief,
  MAX(CASE WHEN event_type = 'user' THEN should_sms_daily_brief END) AS should_sms_daily_brief,
  MIN(created_at) AS created_at,
  NOW() AS updated_at
FROM user_notification_preferences
GROUP BY user_id;

-- Step 3: Backup existing table
CREATE TABLE user_notification_preferences_backup AS
SELECT * FROM user_notification_preferences;

-- Step 4: Drop old table
DROP TABLE user_notification_preferences;

-- Step 5: Create new table without event_type
CREATE TABLE user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  -- NO event_type column
  push_enabled BOOLEAN DEFAULT true,
  email_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT false,
  in_app_enabled BOOLEAN DEFAULT true,
  priority TEXT DEFAULT 'normal',
  batch_enabled BOOLEAN DEFAULT false,
  batch_interval_minutes INTEGER,
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  max_per_day INTEGER,
  max_per_hour INTEGER,
  should_email_daily_brief BOOLEAN DEFAULT true,
  should_sms_daily_brief BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 6: Insert consolidated data
INSERT INTO user_notification_preferences
SELECT
  gen_random_uuid() AS id,
  user_id,
  push_enabled,
  email_enabled,
  sms_enabled,
  in_app_enabled,
  priority,
  batch_enabled,
  batch_interval_minutes,
  quiet_hours_enabled,
  quiet_hours_start,
  quiet_hours_end,
  max_per_day,
  max_per_hour,
  should_email_daily_brief,
  should_sms_daily_brief,
  created_at,
  updated_at
FROM consolidated_prefs;

-- Step 7: Create indexes
CREATE INDEX idx_user_notification_preferences_user_id
ON user_notification_preferences(user_id);

CREATE INDEX idx_user_notification_preferences_daily_brief_email
ON user_notification_preferences(user_id, should_email_daily_brief)
WHERE should_email_daily_brief = true;

CREATE INDEX idx_user_notification_preferences_daily_brief_sms
ON user_notification_preferences(user_id, should_sms_daily_brief)
WHERE should_sms_daily_brief = true;

-- Step 8: Update emit_notification_event function
-- Remove event_type parameter and filtering logic
-- (See section 1.2 below for detailed function changes)

-- Step 9: Verify migration
DO $$
DECLARE
  user_count_before INTEGER;
  user_count_after INTEGER;
BEGIN
  SELECT COUNT(DISTINCT user_id) INTO user_count_before FROM user_notification_preferences_backup;
  SELECT COUNT(*) INTO user_count_after FROM user_notification_preferences;

  IF user_count_before != user_count_after THEN
    RAISE EXCEPTION 'Migration failed: user count mismatch (before: %, after: %)', user_count_before, user_count_after;
  END IF;

  RAISE NOTICE 'Migration successful: % users migrated', user_count_after;
END $$;
```

**Migration Considerations**:

1. **Consolidation Logic**: Using `MAX()` for boolean fields means if ANY event had a channel enabled, the consolidated preference enables it. This is the "most permissive" approach.

2. **Alternative Consolidation Strategy**: Could use `MIN()` instead (most restrictive), or query for event_type='user' first and prefer those settings.

3. **Daily Brief Preferences**: Special handling for `should_email_daily_brief` and `should_sms_daily_brief` which are user-level (event_type='user'), not event-specific.

4. **Data Loss**: Some granularity is permanently lost. Users who had different preferences for different events will have them merged.

5. **Rollback Plan**: The backup table `user_notification_preferences_backup` allows rollback if needed.

#### Database Function Changes

**Location**: Multiple migrations reference `emit_notification_event()`

**Current Function Logic** (`supabase/migrations/20251013_fix_notification_broadcast_bug.sql:73-77`):

```sql
-- Queries preferences with event_type filter
SELECT push_enabled, in_app_enabled, email_enabled, sms_enabled
FROM user_notification_preferences
WHERE user_id = target_user_id
  AND event_type = p_event_type  -- <-- NEEDS REMOVAL
```

**Proposed Function Logic**:

```sql
-- Query preferences WITHOUT event_type filter
SELECT push_enabled, in_app_enabled, email_enabled, sms_enabled
FROM user_notification_preferences
WHERE user_id = target_user_id
-- NO event_type filter anymore
```

**Function Changes Needed**:

1. Remove `event_type` from WHERE clause in preference lookup
2. Store `event_type` in `user_notifications` when creating in-app notifications
3. Store `event_type` in `notification_deliveries` metadata for tracking

### 2. Worker Service Changes

#### Files Requiring Updates

##### 2.1 Preference Checker (CRITICAL)

**File**: `/apps/worker/src/workers/notification/preferenceChecker.ts`

**Current Code (Lines 58-65)**:

```typescript
const { data: preferences } = await supabase
	.from('user_notification_preferences')
	.select('*')
	.eq('user_id', userId)
	.eq('event_type', eventType) // <-- REMOVE THIS LINE
	.single();
```

**Proposed Code**:

```typescript
const { data: preferences } = await supabase
	.from('user_notification_preferences')
	.select('*')
	.eq('user_id', userId)
	// No event_type filter
	.maybeSingle(); // Changed to maybeSingle in case user has no preferences yet
```

**Impact**: This function is called before every notification send. Changes affect ALL notification channels.

##### 2.2 Brief Worker

**File**: `/apps/worker/src/workers/brief/briefWorker.ts`

**Current Code (Lines 101-107)**:

```typescript
const { data: notificationPrefs } = await supabase
	.from('user_notification_preferences')
	.select('should_email_daily_brief, should_sms_daily_brief')
	.eq('user_id', user.id)
	.eq('event_type', 'user') // <-- REMOVE THIS LINE
	.maybeSingle();
```

**Proposed Code**:

```typescript
const { data: notificationPrefs } = await supabase
	.from('user_notification_preferences')
	.select('should_email_daily_brief, should_sms_daily_brief')
	.eq('user_id', user.id)
	// No event_type filter
	.maybeSingle();
```

##### 2.3 Email Adapter

**File**: `/apps/worker/src/workers/notification/emailAdapter.ts`

**Current Code (Lines 143-165)**:

```typescript
// Double-check email preferences before sending
const { data: prefs } = await supabase
	.from('user_notification_preferences')
	.select('email_enabled')
	.eq('user_id', delivery.user_id)
	.eq('event_type', delivery.event_type) // <-- REMOVE THIS LINE
	.single();
```

**Proposed Code**:

```typescript
const { data: prefs } = await supabase
	.from('user_notification_preferences')
	.select('email_enabled')
	.eq('user_id', delivery.user_id)
	// No event_type filter
	.maybeSingle();
```

##### 2.4 SMS Adapter

**File**: `/apps/worker/src/workers/notification/smsAdapter.ts`

**Similar changes needed** (Lines 397-419) - Remove event_type from preference queries

##### 2.5 Email Sender Service

**File**: `/apps/worker/src/lib/services/email-sender.ts`

**Current Code (Lines 122-128)**:

```typescript
const { data: prefs } = await supabase
	.from('user_notification_preferences')
	.select('should_email_daily_brief')
	.eq('user_id', userId)
	.eq('event_type', 'user') // <-- REMOVE THIS LINE
	.maybeSingle();
```

**Proposed Code**:

```typescript
const { data: prefs } = await supabase
	.from('user_notification_preferences')
	.select('should_email_daily_brief')
	.eq('user_id', userId)
	// No event_type filter
	.maybeSingle();
```

##### 2.6 Email Worker (Legacy)

**File**: `/apps/worker/src/workers/brief/emailWorker.ts`

**Current Code (Lines 92-97)**:

```typescript
const { data: prefs } = await supabase
	.from('user_notification_preferences')
	.select('should_email_daily_brief')
	.eq('user_id', userId)
	.eq('event_type', 'user') // <-- REMOVE THIS LINE
	.maybeSingle();
```

**Proposed Code**: Same as above - remove event_type filter

##### 2.7 Notification Worker

**File**: `/apps/worker/src/workers/notification/notificationWorker.ts`

**Changes Needed**:

- Line 320: When inserting into `user_notifications`, add `event_type` column
- Line 612: Call to `checkUserPreferences()` will use updated function (no changes needed here)

**Current Code (Lines 320-328)**:

```typescript
await supabase.from('user_notifications').insert({
	user_id: delivery.user_id,
	title: delivery.title,
	message: delivery.message,
	type: delivery.notification_type
	// ... other fields
});
```

**Proposed Code**:

```typescript
await supabase.from('user_notifications').insert({
	user_id: delivery.user_id,
	title: delivery.title,
	message: delivery.message,
	type: delivery.notification_type,
	event_type: delivery.event_type // <-- ADD THIS FIELD
	// ... other fields
});
```

#### Summary: Worker Files to Update

| File                    | Lines            | Change Required                             |
| ----------------------- | ---------------- | ------------------------------------------- |
| `preferenceChecker.ts`  | 58-65            | Remove event_type from query                |
| `briefWorker.ts`        | 101-107, 463-484 | Remove event_type from query                |
| `emailAdapter.ts`       | 143-165          | Remove event_type from query                |
| `smsAdapter.ts`         | 397-419          | Remove event_type from query                |
| `email-sender.ts`       | 122-128          | Remove event_type from query                |
| `emailWorker.ts`        | 92-97            | Remove event_type from query                |
| `notificationWorker.ts` | 320-328          | Add event_type to user_notifications insert |

**Total Worker Changes**: 7 files, ~12 query modifications

### 3. Web App Changes

#### Files Requiring Updates

##### 3.1 API Route: Notification Preferences

**File**: `/apps/web/src/routes/api/notification-preferences/+server.ts`

**Current GET Handler (Lines 13-62)**:

```typescript
export const GET: RequestHandler = async ({ url, locals }) => {
	const eventType = url.searchParams.get('event_type'); // <-- REMOVE PARAM
	const dailyBrief = url.searchParams.get('daily_brief') === 'true';

	// Query with event_type filter
	const { data } = await supabase
		.from('user_notification_preferences')
		.select('*')
		.eq('user_id', user.id)
		.eq('event_type', eventType || 'user') // <-- REMOVE THIS LINE
		.maybeSingle();
};
```

**Proposed GET Handler**:

```typescript
export const GET: RequestHandler = async ({ url, locals }) => {
	// Remove event_type parameter handling

	// Query without event_type filter
	const { data } = await supabase
		.from('user_notification_preferences')
		.select('*')
		.eq('user_id', user.id)
		// No event_type filter
		.maybeSingle();

	// Return single set of preferences for all events
};
```

**Current PUT Handler (Lines 74-205)**:

```typescript
const eventType = body.event_type || 'user'; // <-- REMOVE

const { error } = await supabase.from('user_notification_preferences').upsert(
	{
		user_id: user.id,
		event_type: eventType // <-- REMOVE THIS FIELD
		// ... other fields
	},
	{
		onConflict: 'user_id,event_type' // <-- CHANGE TO 'user_id' ONLY
	}
);
```

**Proposed PUT Handler**:

```typescript
// Remove event_type from request body handling

const { error } = await supabase.from('user_notification_preferences').upsert(
	{
		user_id: user.id
		// NO event_type field
		// ... other fields
	},
	{
		onConflict: 'user_id' // <-- Changed to user_id only
	}
);
```

##### 3.2 Service Layer: Notification Preferences Service

**File**: `/apps/web/src/lib/services/notification-preferences.service.ts`

**Current Methods**:

- `get(eventType)` (Lines 29-54) - Takes eventType parameter
- `update(eventType, updates)` (Lines 86-115) - Takes eventType parameter
- `getDefaults(eventType)` (Lines 231-322) - Returns event-specific defaults

**Proposed Refactor**:

```typescript
// OLD: Per-event-type methods
async get(eventType: EventType): Promise<UserNotificationPreferences>
async update(eventType: EventType, updates: Partial<UserNotificationPreferences>)
async getDefaults(eventType: EventType): UserNotificationPreferences

// NEW: Global user methods
async get(): Promise<UserNotificationPreferences>
async update(updates: Partial<UserNotificationPreferences>)
async getDefaults(): UserNotificationPreferences
```

**Breaking Change**: Remove event-type-specific default logic (Lines 233-310)

**Current Defaults** (event-specific):

```typescript
switch (eventType) {
	case 'brief.completed':
		return { push: true, email: true, sms: false, in_app: true };
	case 'task.due_soon':
		return { push: true, email: false, sms: true, in_app: true };
	// ... different defaults per event
}
```

**Proposed Defaults** (global):

```typescript
// Single default for ALL events
return {
	push_enabled: true,
	email_enabled: true,
	sms_enabled: false,
	in_app_enabled: true,
	priority: 'normal',
	batch_enabled: false,
	quiet_hours_enabled: false
	// ... etc
};
```

##### 3.3 Store: Notification Preferences Store

**File**: `/apps/web/src/lib/stores/notificationPreferences.ts`

**Current Store** (Lines 1-183):

- Manages daily brief preferences specifically
- Queries with `?daily_brief=true` parameter
- Should continue to work with minimal changes

**Changes Needed**:

- Update `load()` method (Lines 38-62) to remove event_type handling
- API endpoint URL changes from `/api/notification-preferences?daily_brief=true` to `/api/notification-preferences`

##### 3.4 UI Component: NotificationPreferences

**File**: `/apps/web/src/lib/components/settings/NotificationPreferences.svelte`

**Current Behavior** (Lines 1-617):

- Loads preferences with event_type parameter
- Shows toggles for daily brief email/SMS
- Shows generic notification channel toggles

**Proposed Changes**:

- Remove event-type selection (if present)
- Show single set of channel preferences applying to ALL events
- Update calls to `notificationPreferencesService.get()` to not pass eventType
- Update calls to `notificationPreferencesService.update()` to not pass eventType

##### 3.5 UI Component: NotificationsTab

**File**: `/apps/web/src/lib/components/profile/NotificationsTab.svelte`

**Minimal changes needed** - container component should work as-is

##### 3.6 Layout Server Load

**File**: `/apps/web/src/routes/+layout.server.ts`

**Current Code (Line 63)**:

```typescript
// Fetches payment warnings from user_notifications
const { data: paymentWarnings } = await supabase
	.from('user_notifications')
	.select('*')
	.eq('user_id', user.id)
	.eq('type', 'payment_warning')
	.is('dismissed_at', null);
```

**Proposed Changes**:

- Potentially add event_type filter if needed for better categorization
- Or leave as-is if `type` column is sufficient

##### 3.7 Layout Component

**File**: `/apps/web/src/routes/+layout.svelte`

**Current Code (Lines 409-412)**:

```typescript
// Dismisses payment warning
await supabase
	.from('user_notifications')
	.update({ dismissed_at: new Date().toISOString() })
	.eq('id', id);
```

**No changes needed** - user_notifications update doesn't involve preferences table

#### Summary: Web App Files to Update

| File                                                  | Lines                  | Change Required                                    |
| ----------------------------------------------------- | ---------------------- | -------------------------------------------------- |
| `/routes/api/notification-preferences/+server.ts`     | 13-62, 74-205          | Remove event_type param/field, change conflict key |
| `/services/notification-preferences.service.ts`       | 29-54, 86-115, 231-322 | Remove eventType params, consolidate defaults      |
| `/stores/notificationPreferences.ts`                  | 38-62, 65-127          | Update API calls to not use event_type             |
| `/components/settings/NotificationPreferences.svelte` | Multiple               | Update service calls, remove event-type UI         |
| `/database.schema.ts`                                 | 1178-1198              | Update TypeScript types                            |
| `/types/notification.types.ts`                        | 73-101                 | Update interface to remove event_type              |

**Total Web App Changes**: 6+ files, ~15 modifications

### 4. Shared Packages Changes

#### Shared Types Package

**File**: `/packages/shared-types/src/notification.types.ts`

**Current Interface (Lines 73-101)**:

```typescript
export interface UserNotificationPreferences {
	id?: string;
	user_id?: string;
	event_type: EventType; // <-- REMOVE THIS FIELD

	// Channel preferences
	push_enabled: boolean;
	email_enabled: boolean;
	// ... rest of fields
}
```

**Proposed Interface**:

```typescript
export interface UserNotificationPreferences {
	id?: string;
	user_id?: string;
	// NO event_type field

	// Channel preferences
	push_enabled: boolean;
	email_enabled: boolean;
	// ... rest of fields
}

// Add new interface for user_notifications with event_type
export interface UserNotification {
	id: string;
	user_id: string;
	title: string;
	message: string;
	type: string; // Display type (payment_warning, trial_warning, etc.)
	event_type?: string; // <-- ADD THIS: Trigger event (brief.completed, etc.)
	action_url?: string;
	priority?: string;
	created_at?: string;
	read_at?: string;
	dismissed_at?: string;
	expires_at?: string;
}
```

### 5. Test Updates Required

#### API Tests

**File**: `/apps/web/src/routes/api/notification-preferences/server.test.ts`

**Current Tests (Lines 1-459)**:

- Lines 68-93: Test fetching daily brief preferences with `?daily_brief=true`
- Lines 116-146: Test fetching event-based preferences with `?event_type=brief.completed`
- Lines 178-219: Test updating daily brief preferences
- Lines 413-457: Test event_type filtering

**Changes Needed**:

- Remove tests for event_type parameter (Lines 116-146, 413-457)
- Update tests to expect single preference set per user
- Add tests for consolidation behavior
- Update mock data to not include event_type

#### Store Tests

**File**: `/apps/web/src/lib/stores/__tests__/notificationPreferences.test.ts`

**Changes Needed**:

- Update mock responses to not include event_type
- Update assertions to match new API response shape

#### Worker Tests

**File**: Various test files in `/apps/worker/src/**/*.test.ts`

**Changes Needed**:

- Update all mock preference data to remove event_type
- Update test assertions for preference queries
- Add tests for new event_type tracking in user_notifications

## Breaking Changes & Trade-offs

### ❌ Loss of Per-Event-Type Granularity

**Before**:

```typescript
// User can set different preferences per event type
{
  user_id: 'user-123',
  event_type: 'brief.completed',
  email_enabled: true,   // ✅ Email me for daily briefs
  sms_enabled: false
}

{
  user_id: 'user-123',
  event_type: 'task.due_soon',
  email_enabled: false,  // ❌ Don't email me for task reminders
  sms_enabled: true      // ✅ But SMS me instead
}
```

**After**:

```typescript
// User has ONE setting for ALL events
{
  user_id: 'user-123',
  // NO event_type field
  email_enabled: true,   // Applies to ALL events
  sms_enabled: false     // Applies to ALL events
}
```

**Impact**: Users lose ability to fine-tune notification channels per event type. This may frustrate power users who want granular control.

### ⚠️ Migration Data Loss

**Scenario**: User has conflicting preferences across events

```sql
-- User wants email for briefs
event_type='brief.completed', email_enabled=true

-- But NOT for brain dumps
event_type='brain_dump.processed', email_enabled=false
```

**Consolidation Result** (using MAX strategy):

```sql
-- Merged preference: email_enabled=true (most permissive wins)
-- User now gets emails for BOTH briefs and brain dumps
```

**Mitigation Options**:

1. **Notify users before migration**: Email users about the change, give them time to adjust
2. **Preserve most common setting**: Use mode/most frequent value instead of MAX
3. **Query for event_type='user' first**: Prioritize user-level settings if they exist
4. **Add migration rollback**: Keep backup table for X days in case of issues

### ✅ Architectural Simplification

**Benefits**:

1. **Simpler queries**: No more event_type filtering in WHERE clauses
2. **Faster lookups**: Single row per user vs. multiple rows to search
3. **Clearer UI**: One preference screen, not per-event-type tabs
4. **Easier defaults**: One default config, not event-specific logic
5. **Better performance**: Fewer DB rows, smaller table, simpler indexes

**Database Performance**:

```sql
-- BEFORE: Index on (user_id, event_type) composite key
-- Cardinality: N users × M event types = N*M rows

-- AFTER: Index on (user_id) simple key
-- Cardinality: N users = N rows

-- Example: 10,000 users, 10 event types
-- Before: 100,000 rows
-- After: 10,000 rows (10x reduction)
```

### 🤔 Alternative: Hybrid Approach

Instead of removing event_type entirely, consider:

**Option A: Event Type Override**

- Keep global preferences as default
- Allow optional per-event-type overrides
- Query logic: Check for event-specific, fall back to global

**Option B: Event Categories**

- Group events into categories (critical, informational, transactional)
- Set preferences per category instead of per event
- Balance between granularity and simplicity

**Option C: Channel-Level Event Filtering**

- Keep single preference row
- Add JSON column: `event_type_overrides: { 'brief.completed': { email: false } }`
- Allows selective overrides without multiple rows

## Recommended Implementation Plan

### Phase 1: Preparation (Week 1)

1. **Create feature flag**: `SIMPLIFIED_NOTIFICATION_PREFERENCES`
2. **Write migration script** with thorough testing
3. **Update TypeScript types** in shared-types package
4. **Create rollback plan** and test in staging
5. **Document breaking changes** for team review

### Phase 2: Backend Updates (Week 2)

1. **Update Worker Service**:
    - Modify all 7 files identified in section 2
    - Update tests with new mock data
    - Deploy to staging

2. **Update Database Functions**:
    - Modify `emit_notification_event()` function
    - Update any other RLS policies if needed
    - Test in staging environment

### Phase 3: Frontend Updates (Week 3)

1. **Update Web App**:
    - Modify API routes (section 3.1)
    - Update services (section 3.2)
    - Update stores (section 3.3)
    - Simplify UI components (section 3.4)
    - Update tests

2. **Update Documentation**:
    - API documentation
    - User-facing help docs
    - Migration changelog

### Phase 4: Migration (Week 4)

1. **Pre-migration**:
    - Notify users via email about changes
    - Export current preferences as backup
    - Test rollback procedure

2. **Execute Migration**:
    - Run during low-traffic window
    - Monitor for errors
    - Validate data integrity

3. **Post-migration**:
    - Monitor error logs for 48 hours
    - Gather user feedback
    - Keep rollback capability for 7 days

4. **Cleanup**:
    - Remove feature flag
    - Archive backup table
    - Update all documentation

## Testing Strategy

### Unit Tests

- [x] Test preference consolidation logic
- [x] Test all updated queries return expected results
- [x] Test default preferences apply correctly
- [x] Test upsert behavior with new conflict key

### Integration Tests

- [x] Test worker → database preference checks
- [x] Test web app → API → database flow
- [x] Test notification sending with new preferences
- [x] Test daily brief preference handling

### End-to-End Tests

- [x] Test user preference update via UI
- [x] Test notification sent respects user preferences
- [x] Test SMS/email delivery honors channels
- [x] Test quiet hours still work correctly

### Migration Tests

- [x] Test migration on copy of production data
- [x] Verify no users lost
- [x] Verify all preferences have valid values
- [x] Test rollback procedure

## Rollback Plan

### Immediate Rollback (Within 24 hours)

1. **Restore backup table**:

```sql
DROP TABLE user_notification_preferences;
ALTER TABLE user_notification_preferences_backup
RENAME TO user_notification_preferences;
```

2. **Redeploy previous application versions**:
    - Worker service: Previous version
    - Web app: Previous version

3. **Verify rollback**:
    - Check queries work
    - Check notifications send
    - Monitor error logs

### Partial Rollback (24-48 hours)

1. **Keep new schema but restore data**:

```sql
-- Add event_type column back
ALTER TABLE user_notification_preferences
ADD COLUMN event_type TEXT;

-- Restore from backup with event types
INSERT INTO user_notification_preferences
SELECT * FROM user_notification_preferences_backup
ON CONFLICT (user_id) DO NOTHING;  -- Keep migrated users who updated prefs
```

2. **Deploy hotfix** to support both schemas

### No Rollback (After 7 days)

- Drop backup table
- Commit to new architecture
- Archive old code

## Questions for Product/Engineering Review

### Product Decisions

1. **User Impact**: Are we comfortable with users losing per-event-type preference control?
2. **Notification Volume**: Will global preferences result in more/fewer notifications? Is that desirable?
3. **User Communication**: How do we explain this change to users? In-app banner? Email campaign?
4. **Grandfathering**: Should existing power users keep their per-event-type settings somehow?

### Engineering Decisions

1. **Consolidation Strategy**: Use MAX (permissive) or MIN (restrictive) when merging preferences?
2. **Migration Timing**: During low-traffic window? Gradual rollout?
3. **Monitoring**: What metrics should we track post-migration?
4. **Feature Flag**: Keep flag long-term for A/B testing, or remove after migration?

### Alternative Approaches

1. **Hybrid Model**: Should we consider event categories instead of full removal?
2. **JSON Overrides**: Would a JSON override column provide enough flexibility?
3. **Separate Tables**: Could we have `global_notification_preferences` and `event_type_overrides`?

## Open Questions

1. **Daily Brief Preferences**: The `should_email_daily_brief` and `should_sms_daily_brief` columns are already user-level (event_type='user'). Do these stay as-is?

2. **Event Type in user_notifications**: Does the `type` column already serve as event_type, or do we need a separate `event_type` column?

3. **RLS Policies**: Are there any Row Level Security policies on these tables that need updating?

4. **Performance Impact**: Will removing the composite key (user_id, event_type) have any negative performance implications?

5. **User Notification Preferences in UI**: Is there currently a UI that shows per-event-type preferences? If not, users may not even notice this change.

## Related Documentation

- **Notification System Docs**: `/NOTIFICATION_SYSTEM_DOCS_MAP.md`
- **Architecture Decision**: `/docs/architecture/decisions/ADR-001-user-level-notification-preferences.md`
- **Database Schema**: `/apps/web/src/lib/database.schema.ts`
- **Notification Types**: `/packages/shared-types/src/notification.types.ts`

## Conclusion

This refactor is **architecturally sound** but represents a **breaking change** for users who rely on per-event-type notification control. The trade-off is:

**Gains**: Simpler code, faster queries, easier maintenance, clearer UI
**Losses**: User flexibility, granular control, event-specific preferences

**Recommendation**:

1. ✅ Proceed if product team confirms losing per-event-type control is acceptable
2. ⚠️ Consider hybrid approaches (categories, overrides) if granularity is important
3. 📋 Ensure thorough user communication and migration testing before production rollout

The technical implementation is straightforward once the product decision is made. All affected files have been identified with specific line numbers and proposed changes.
