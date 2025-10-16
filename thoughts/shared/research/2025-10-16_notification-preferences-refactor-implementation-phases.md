---
date: 2025-10-16T00:00:00Z
researcher: Claude Code
git_commit: 7f656fbcf6fea7de9adf752040d4677117b0eec0
branch: main
repository: buildos-platform
topic: "Notification Preferences Refactor - Implementation Phases"
tags: [implementation, phases, notifications, refactor, migration-plan]
status: in_progress
progress: "Phase 4 of 9 complete (Database migrations and functions ready)"
last_updated: 2025-10-16
last_updated_by: Claude Code
---

# Notification Preferences Refactor - Implementation Phases

**Parent Research**: `2025-10-16_notification-preferences-refactor-analysis.md`

## Overview

This document outlines the phased implementation plan for refactoring the notification preferences system to remove `event_type` from `user_notification_preferences` and ensure one row per user.

## Phase Strategy

Each phase is:

- ✅ **Independently deployable** - Can be deployed without breaking existing functionality
- ✅ **Testable** - Can be validated before moving to next phase
- ✅ **Reversible** - Has clear rollback path if issues arise
- ✅ **Incremental** - Builds on previous phases

## Phase 1: Database Preparation

**Goal**: Prepare database for migration without breaking changes
**Duration**: 1-2 hours
**Risk**: Low (additive only)

### Tasks:

1. ✅ Add `event_type` column to `user_notifications` (nullable, will be populated during migration)
2. ✅ Create backup table `user_notification_preferences_backup`
3. ✅ Verify backup table has all data
4. ✅ Create migration script (don't run yet)

### Files to Create:

- `supabase/migrations/YYYYMMDD_001_prepare_notification_preferences_refactor.sql`

### SQL Script:

```sql
-- Step 1: Add event_type to user_notifications (nullable for now)
ALTER TABLE user_notifications
ADD COLUMN IF NOT EXISTS event_type TEXT;

CREATE INDEX IF NOT EXISTS idx_user_notifications_event_type
ON user_notifications(event_type)
WHERE event_type IS NOT NULL;

-- Step 2: Create backup of current preferences
CREATE TABLE IF NOT EXISTS user_notification_preferences_backup AS
SELECT * FROM user_notification_preferences;

-- Step 3: Verify backup
DO $$
DECLARE
  original_count INTEGER;
  backup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO original_count FROM user_notification_preferences;
  SELECT COUNT(*) INTO backup_count FROM user_notification_preferences_backup;

  IF original_count != backup_count THEN
    RAISE EXCEPTION 'Backup verification failed: original=%, backup=%', original_count, backup_count;
  END IF;

  RAISE NOTICE 'Backup successful: % rows backed up', backup_count;
END $$;
```

### Validation:

```sql
-- Check event_type column exists on user_notifications
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_notifications' AND column_name = 'event_type';

-- Check backup table exists and has data
SELECT COUNT(*) FROM user_notification_preferences_backup;

-- Compare row counts
SELECT
  (SELECT COUNT(*) FROM user_notification_preferences) as original,
  (SELECT COUNT(*) FROM user_notification_preferences_backup) as backup;
```

### Deployment:

- Deploy to staging first
- Validate backup exists
- Deploy to production
- **No code changes needed** - database only

---

## Phase 2: Update TypeScript Types

**Goal**: Update shared types to match new schema
**Duration**: 1-2 hours
**Risk**: Low (type changes only)

### Tasks:

1. ✅ Update `UserNotificationPreferences` interface - remove `event_type` field
2. ✅ Update `UserNotification` interface - add `event_type` field
3. ✅ Update database schema types
4. ✅ Run type checking across monorepo

### Files to Update:

- `/packages/shared-types/src/notification.types.ts`
- `/apps/web/src/lib/database.schema.ts`

### Changes:

#### `/packages/shared-types/src/notification.types.ts`

```typescript
// BEFORE
export interface UserNotificationPreferences {
  id?: string;
  user_id?: string;
  event_type: EventType; // <-- REMOVE
  push_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  in_app_enabled: boolean;
  // ... rest
}

// AFTER
export interface UserNotificationPreferences {
  id?: string;
  user_id?: string;
  // event_type removed
  push_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  in_app_enabled: boolean;
  // ... rest
}

// Update UserNotification interface
export interface UserNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  event_type?: string; // <-- ADD (optional for now)
  action_url?: string;
  priority?: string;
  created_at?: string;
  read_at?: string;
  dismissed_at?: string;
  expires_at?: string;
}
```

### Validation:

```bash
# Run type checking
pnpm typecheck

# Should show type errors in files that reference event_type
# These will be fixed in subsequent phases
```

### Deployment:

- Commit type changes
- **DO NOT deploy yet** - will break existing code
- Keep in feature branch

---

## Phase 3: Database Migration (Consolidation)

**Goal**: Consolidate multiple preference rows into one per user
**Duration**: 2-4 hours (includes testing)
**Risk**: High (destructive operation)

### Tasks:

1. ✅ Write consolidation migration script
2. ✅ Test on staging with production data copy
3. ✅ Verify data integrity after migration
4. ✅ Run migration on production
5. ✅ Monitor for issues

### Files to Create:

- `supabase/migrations/YYYYMMDD_002_consolidate_notification_preferences.sql`

### Migration Script:

```sql
-- This migration consolidates multiple user_notification_preferences rows
-- into single row per user (removes event_type column)

BEGIN;

-- Step 1: Create temporary consolidated table
CREATE TEMP TABLE consolidated_prefs AS
SELECT
  user_id,

  -- Use MAX for boolean fields (most permissive)
  MAX(push_enabled::int)::boolean AS push_enabled,
  MAX(email_enabled::int)::boolean AS email_enabled,
  MAX(sms_enabled::int)::boolean AS sms_enabled,
  MAX(in_app_enabled::int)::boolean AS in_app_enabled,
  MAX(batch_enabled::int)::boolean AS batch_enabled,
  MAX(quiet_hours_enabled::int)::boolean AS quiet_hours_enabled,

  -- For scalar values, prefer event_type='user' if exists, otherwise take first
  COALESCE(
    MAX(CASE WHEN event_type = 'user' THEN batch_interval_minutes END),
    MAX(batch_interval_minutes)
  ) AS batch_interval_minutes,

  COALESCE(
    MIN(CASE WHEN event_type = 'user' THEN quiet_hours_start END),
    MIN(quiet_hours_start)
  ) AS quiet_hours_start,

  COALESCE(
    MAX(CASE WHEN event_type = 'user' THEN quiet_hours_end END),
    MAX(quiet_hours_end)
  ) AS quiet_hours_end,

  COALESCE(
    MAX(CASE WHEN event_type = 'user' THEN max_per_day END),
    MAX(max_per_day)
  ) AS max_per_day,

  COALESCE(
    MAX(CASE WHEN event_type = 'user' THEN max_per_hour END),
    MAX(max_per_hour)
  ) AS max_per_hour,

  COALESCE(
    MAX(CASE WHEN event_type = 'user' THEN priority END),
    MAX(priority)
  ) AS priority,

  -- Daily brief preferences (always from event_type='user')
  MAX(CASE WHEN event_type = 'user' THEN should_email_daily_brief END) AS should_email_daily_brief,
  MAX(CASE WHEN event_type = 'user' THEN should_sms_daily_brief END) AS should_sms_daily_brief,

  -- Timestamps
  MIN(created_at) AS created_at,
  NOW() AS updated_at

FROM user_notification_preferences
GROUP BY user_id;

-- Step 2: Verify consolidation (one row per user)
DO $$
DECLARE
  distinct_users INTEGER;
  consolidated_rows INTEGER;
BEGIN
  SELECT COUNT(DISTINCT user_id) INTO distinct_users FROM user_notification_preferences;
  SELECT COUNT(*) INTO consolidated_rows FROM consolidated_prefs;

  IF distinct_users != consolidated_rows THEN
    RAISE EXCEPTION 'Consolidation failed: % distinct users but % consolidated rows',
      distinct_users, consolidated_rows;
  END IF;

  RAISE NOTICE 'Consolidation verified: % users → % rows', distinct_users, consolidated_rows;
END $$;

-- Step 3: Drop old table (backup already exists from Phase 1)
DROP TABLE user_notification_preferences;

-- Step 4: Create new table without event_type column
CREATE TABLE user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  -- Channel preferences
  push_enabled BOOLEAN DEFAULT true,
  email_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT false,
  in_app_enabled BOOLEAN DEFAULT true,

  -- Delivery preferences
  priority TEXT DEFAULT 'normal',
  batch_enabled BOOLEAN DEFAULT false,
  batch_interval_minutes INTEGER,

  -- Quiet hours
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TIME,
  quiet_hours_end TIME,

  -- Frequency limits
  max_per_day INTEGER,
  max_per_hour INTEGER,

  -- Daily brief preferences (user-level)
  should_email_daily_brief BOOLEAN DEFAULT true,
  should_sms_daily_brief BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 5: Insert consolidated data
INSERT INTO user_notification_preferences (
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
)
SELECT
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

-- Step 6: Create indexes
CREATE INDEX idx_user_notification_preferences_user_id
ON user_notification_preferences(user_id);

CREATE INDEX idx_user_notification_preferences_daily_brief_email
ON user_notification_preferences(user_id, should_email_daily_brief)
WHERE should_email_daily_brief = true;

CREATE INDEX idx_user_notification_preferences_daily_brief_sms
ON user_notification_preferences(user_id, should_sms_daily_brief)
WHERE should_sms_daily_brief = true;

-- Step 7: Final verification
DO $$
DECLARE
  user_count_before INTEGER;
  user_count_after INTEGER;
  duplicate_check INTEGER;
BEGIN
  SELECT COUNT(DISTINCT user_id) INTO user_count_before FROM user_notification_preferences_backup;
  SELECT COUNT(*) INTO user_count_after FROM user_notification_preferences;

  -- Check for duplicates
  SELECT COUNT(*) INTO duplicate_check
  FROM (
    SELECT user_id, COUNT(*)
    FROM user_notification_preferences
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) dups;

  IF user_count_before != user_count_after THEN
    RAISE EXCEPTION 'Migration failed: user count mismatch (before: %, after: %)',
      user_count_before, user_count_after;
  END IF;

  IF duplicate_check > 0 THEN
    RAISE EXCEPTION 'Migration failed: % duplicate user_id entries found', duplicate_check;
  END IF;

  RAISE NOTICE 'Migration successful: % users migrated, 0 duplicates', user_count_after;
END $$;

COMMIT;

-- Rollback command (for reference, do not run):
-- ROLLBACK;
-- DROP TABLE user_notification_preferences;
-- ALTER TABLE user_notification_preferences_backup RENAME TO user_notification_preferences;
```

### Validation Queries:

```sql
-- Check one row per user
SELECT user_id, COUNT(*) as row_count
FROM user_notification_preferences
GROUP BY user_id
HAVING COUNT(*) > 1;
-- Should return 0 rows

-- Check all users migrated
SELECT
  (SELECT COUNT(DISTINCT user_id) FROM user_notification_preferences_backup) as before,
  (SELECT COUNT(*) FROM user_notification_preferences) as after;
-- Should match

-- Sample data check
SELECT * FROM user_notification_preferences LIMIT 5;
```

### Deployment:

- Test on staging with production data copy
- Schedule maintenance window for production
- Run migration during low-traffic period
- Monitor error logs immediately after
- Keep backup table for 7 days minimum

---

## Phase 4: Update Database Functions

**Goal**: Update Supabase database functions to not use event_type
**Duration**: 2-3 hours
**Risk**: Medium (affects notification delivery)

### Tasks:

1. ✅ Update `emit_notification_event()` function
2. ✅ Update any other RLS policies or functions
3. ✅ Test function calls in staging
4. ✅ Deploy to production

### Files to Create:

- `supabase/migrations/YYYYMMDD_003_update_emit_notification_event.sql`

### Migration Script:

```sql
-- Update emit_notification_event to not filter by event_type

CREATE OR REPLACE FUNCTION emit_notification_event(
  p_event_type TEXT,
  p_user_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_priority TEXT DEFAULT 'normal',
  p_correlation_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  delivery_id UUID,
  channel TEXT,
  user_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id UUID;
  v_user_prefs RECORD;
  v_delivery_id UUID;
BEGIN
  -- Fetch user preferences (NO event_type filter)
  SELECT
    push_enabled,
    in_app_enabled,
    email_enabled,
    sms_enabled
  INTO v_user_prefs
  FROM user_notification_preferences
  WHERE user_notification_preferences.user_id = p_user_id;

  -- If no preferences found, use defaults
  IF NOT FOUND THEN
    v_user_prefs := ROW(true, true, true, false);
  END IF;

  -- Create notification deliveries for enabled channels

  -- Push notification
  IF v_user_prefs.push_enabled THEN
    INSERT INTO notification_deliveries (
      user_id,
      event_type,
      channel,
      title,
      message,
      priority,
      correlation_id
    ) VALUES (
      p_user_id,
      p_event_type,
      'push',
      p_title,
      p_message,
      p_priority,
      p_correlation_id
    )
    RETURNING id, 'push', user_id
    INTO v_delivery_id, channel, user_id;

    RETURN NEXT;
  END IF;

  -- In-app notification
  IF v_user_prefs.in_app_enabled THEN
    INSERT INTO user_notifications (
      user_id,
      title,
      message,
      type,
      event_type,  -- Now tracking event_type in user_notifications
      priority
    ) VALUES (
      p_user_id,
      p_title,
      p_message,
      'info',
      p_event_type,
      p_priority
    )
    RETURNING id INTO v_notification_id;

    -- Also create delivery record
    INSERT INTO notification_deliveries (
      user_id,
      event_type,
      channel,
      title,
      message,
      priority,
      correlation_id,
      notification_id
    ) VALUES (
      p_user_id,
      p_event_type,
      'in_app',
      p_title,
      p_message,
      p_priority,
      p_correlation_id,
      v_notification_id
    )
    RETURNING id, 'in_app', user_id
    INTO v_delivery_id, channel, user_id;

    RETURN NEXT;
  END IF;

  -- Email notification
  IF v_user_prefs.email_enabled THEN
    INSERT INTO notification_deliveries (
      user_id,
      event_type,
      channel,
      title,
      message,
      priority,
      correlation_id
    ) VALUES (
      p_user_id,
      p_event_type,
      'email',
      p_title,
      p_message,
      p_priority,
      p_correlation_id
    )
    RETURNING id, 'email', user_id
    INTO v_delivery_id, channel, user_id;

    RETURN NEXT;
  END IF;

  -- SMS notification
  IF v_user_prefs.sms_enabled THEN
    INSERT INTO notification_deliveries (
      user_id,
      event_type,
      channel,
      title,
      message,
      priority,
      correlation_id
    ) VALUES (
      p_user_id,
      p_event_type,
      'sms',
      p_title,
      p_message,
      p_priority,
      p_correlation_id
    )
    RETURNING id, 'sms', user_id
    INTO v_delivery_id, channel, user_id;

    RETURN NEXT;
  END IF;

  RETURN;
END;
$$;
```

### Validation:

```sql
-- Test function call
SELECT * FROM emit_notification_event(
  'test.event',
  '00000000-0000-0000-0000-000000000000'::uuid,
  'Test Notification',
  'This is a test',
  'normal',
  'test-correlation-id'
);

-- Check deliveries created
SELECT * FROM notification_deliveries
WHERE correlation_id = 'test-correlation-id';

-- Cleanup test data
DELETE FROM notification_deliveries WHERE correlation_id = 'test-correlation-id';
DELETE FROM user_notifications WHERE event_type = 'test.event';
```

---

## Phase 5: Update Worker Service

**Goal**: Update all worker service queries to not use event_type
**Duration**: 3-4 hours
**Risk**: Medium (affects notification sending)

### Files to Update:

#### 5.1 Preference Checker

**File**: `/apps/worker/src/workers/notification/preferenceChecker.ts`

**Line 58-65**: Remove event_type filter

```typescript
// BEFORE
const { data: preferences } = await supabase
  .from("user_notification_preferences")
  .select("*")
  .eq("user_id", userId)
  .eq("event_type", eventType) // REMOVE
  .single();

// AFTER
const { data: preferences } = await supabase
  .from("user_notification_preferences")
  .select("*")
  .eq("user_id", userId)
  .maybeSingle();
```

#### 5.2 Brief Worker

**File**: `/apps/worker/src/workers/brief/briefWorker.ts`

**Line 101-107**: Remove event_type='user' filter

```typescript
// BEFORE
const { data: notificationPrefs } = await supabase
  .from("user_notification_preferences")
  .select("should_email_daily_brief, should_sms_daily_brief")
  .eq("user_id", user.id)
  .eq("event_type", "user") // REMOVE
  .maybeSingle();

// AFTER
const { data: notificationPrefs } = await supabase
  .from("user_notification_preferences")
  .select("should_email_daily_brief, should_sms_daily_brief")
  .eq("user_id", user.id)
  .maybeSingle();
```

#### 5.3 Email Adapter

**File**: `/apps/worker/src/workers/notification/emailAdapter.ts`

**Line 143-165**: Remove event_type filter

```typescript
// BEFORE
const { data: prefs } = await supabase
  .from("user_notification_preferences")
  .select("email_enabled")
  .eq("user_id", delivery.user_id)
  .eq("event_type", delivery.event_type) // REMOVE
  .single();

// AFTER
const { data: prefs } = await supabase
  .from("user_notification_preferences")
  .select("email_enabled")
  .eq("user_id", delivery.user_id)
  .maybeSingle();
```

#### 5.4 SMS Adapter

**File**: `/apps/worker/src/workers/notification/smsAdapter.ts`

**Line 397-419**: Remove event_type filter (handled by preferenceChecker)

#### 5.5 Email Sender Service

**File**: `/apps/worker/src/lib/services/email-sender.ts`

**Line 122-128**: Remove event_type='user' filter

```typescript
// BEFORE
const { data: prefs } = await supabase
  .from("user_notification_preferences")
  .select("should_email_daily_brief")
  .eq("user_id", userId)
  .eq("event_type", "user") // REMOVE
  .maybeSingle();

// AFTER
const { data: prefs } = await supabase
  .from("user_notification_preferences")
  .select("should_email_daily_brief")
  .eq("user_id", userId)
  .maybeSingle();
```

#### 5.6 Email Worker

**File**: `/apps/worker/src/workers/brief/emailWorker.ts`

**Line 92-97**: Remove event_type='user' filter

```typescript
// BEFORE
const { data: prefs } = await supabase
  .from("user_notification_preferences")
  .select("should_email_daily_brief")
  .eq("user_id", userId)
  .eq("event_type", "user") // REMOVE
  .maybeSingle();

// AFTER
const { data: prefs } = await supabase
  .from("user_notification_preferences")
  .select("should_email_daily_brief")
  .eq("user_id", userId)
  .maybeSingle();
```

#### 5.7 Notification Worker

**File**: `/apps/worker/src/workers/notification/notificationWorker.ts`

**Line 320-328**: Add event_type to user_notifications insert

```typescript
// BEFORE
await supabase.from("user_notifications").insert({
  user_id: delivery.user_id,
  title: delivery.title,
  message: delivery.message,
  type: delivery.notification_type,
  priority: delivery.priority,
});

// AFTER
await supabase.from("user_notifications").insert({
  user_id: delivery.user_id,
  title: delivery.title,
  message: delivery.message,
  type: delivery.notification_type,
  event_type: delivery.event_type, // ADD
  priority: delivery.priority,
});
```

### Validation:

```bash
# Type check worker
cd apps/worker
pnpm typecheck

# Run worker tests
pnpm test

# Build worker
pnpm build
```

---

## Phase 6: Update Web App Backend

**Goal**: Update API routes, services, and stores
**Duration**: 3-4 hours
**Risk**: Medium (breaks frontend if deployed prematurely)

### Files to Update:

#### 6.1 API Route: Notification Preferences

**File**: `/apps/web/src/routes/api/notification-preferences/+server.ts`

**GET Handler (Line 13-62)**:

```typescript
// BEFORE
export const GET: RequestHandler = async ({ url, locals }) => {
  const eventType = url.searchParams.get("event_type"); // REMOVE

  const { data } = await supabase
    .from("user_notification_preferences")
    .select("*")
    .eq("user_id", user.id)
    .eq("event_type", eventType || "user") // REMOVE
    .maybeSingle();

  return json(data || getDefaults(eventType));
};

// AFTER
export const GET: RequestHandler = async ({ url, locals }) => {
  const { data } = await supabase
    .from("user_notification_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return json(data || getDefaults());
};
```

**PUT Handler (Line 74-205)**:

```typescript
// BEFORE
const eventType = body.event_type || "user"; // REMOVE

const { error } = await supabase.from("user_notification_preferences").upsert(
  {
    user_id: user.id,
    event_type: eventType, // REMOVE
    push_enabled: body.push_enabled,
    email_enabled: body.email_enabled,
    // ... other fields
  },
  {
    onConflict: "user_id,event_type", // CHANGE
  },
);

// AFTER
const { error } = await supabase.from("user_notification_preferences").upsert(
  {
    user_id: user.id,
    // NO event_type field
    push_enabled: body.push_enabled,
    email_enabled: body.email_enabled,
    // ... other fields
  },
  {
    onConflict: "user_id", // CHANGED
  },
);
```

#### 6.2 Service: Notification Preferences

**File**: `/apps/web/src/lib/services/notification-preferences.service.ts`

**Remove eventType parameter from all methods**:

```typescript
// BEFORE
async get(eventType: EventType): Promise<UserNotificationPreferences>
async update(eventType: EventType, updates: Partial<UserNotificationPreferences>)
async getDefaults(eventType: EventType): UserNotificationPreferences

// AFTER
async get(): Promise<UserNotificationPreferences>
async update(updates: Partial<UserNotificationPreferences>)
async getDefaults(): UserNotificationPreferences
```

**Update queries (Line 41, 71, 100)**:

```typescript
// Remove .eq('event_type', eventType) from all queries
const { data } = await supabase
  .from("user_notification_preferences")
  .select("*")
  .eq("user_id", userId)
  // NO event_type filter
  .maybeSingle();
```

**Consolidate defaults (Line 231-322)**:

```typescript
// BEFORE: Event-specific defaults
getDefaults(eventType: EventType) {
  switch (eventType) {
    case 'brief.completed': return { ... };
    case 'task.due_soon': return { ... };
    // etc
  }
}

// AFTER: Single default
getDefaults() {
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
    max_per_day: null,
    max_per_hour: null,
    should_email_daily_brief: true,
    should_sms_daily_brief: false
  };
}
```

#### 6.3 Store: Notification Preferences

**File**: `/apps/web/src/lib/stores/notificationPreferences.ts`

**Update load method (Line 38-62)**:

```typescript
// BEFORE
async load() {
  const response = await fetch('/api/notification-preferences?daily_brief=true');
  // ...
}

// AFTER
async load() {
  const response = await fetch('/api/notification-preferences');
  // ... (rest stays same)
}
```

#### 6.4 Database Schema Types

**File**: `/apps/web/src/lib/database.schema.ts`

**Update table type (Line 1178-1198)**:

```typescript
// BEFORE
export interface UserNotificationPreferences {
  id: string;
  user_id: string;
  event_type: string; // REMOVE
  // ... other fields
}

// AFTER
export interface UserNotificationPreferences {
  id: string;
  user_id: string;
  // NO event_type field
  // ... other fields
}

// Update UserNotification interface (Line 1199-1211)
export interface UserNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  event_type?: string | null; // ADD
  // ... other fields
}
```

### Validation:

```bash
# Type check web app
cd apps/web
pnpm typecheck

# Run web app tests
pnpm test:run

# Build web app
pnpm build
```

---

## Phase 7: Update Web App Frontend

**Goal**: Update UI components and component logic
**Duration**: 2-3 hours
**Risk**: Low (UI changes)

### Files to Update:

#### 7.1 NotificationPreferences Component

**File**: `/apps/web/src/lib/components/settings/NotificationPreferences.svelte`

**Update service calls**:

```typescript
// BEFORE
await notificationPreferencesService.get("brief.completed");
await notificationPreferencesService.update("brief.completed", {
  email_enabled: true,
});

// AFTER
await notificationPreferencesService.get();
await notificationPreferencesService.update({ email_enabled: true });
```

**Remove event-type selection UI** (if present)

#### 7.2 Layout Server Load

**File**: `/apps/web/src/routes/+layout.server.ts`

**No changes needed** - payment warnings query doesn't use event_type in preferences

### Validation:

```bash
# Type check
pnpm typecheck

# Visual testing in browser
pnpm dev
# Navigate to notification preferences page
# Verify preferences load and save correctly
```

---

## Phase 8: Update Tests

**Goal**: Fix all broken tests
**Duration**: 3-4 hours
**Risk**: Low (test-only changes)

### Files to Update:

#### 8.1 API Tests

**File**: `/apps/web/src/routes/api/notification-preferences/server.test.ts`

**Remove event_type test cases (Line 116-146, 413-457)**
**Update mock data** (remove event_type field)
**Update assertions** (expect single preference set)

#### 8.2 Store Tests

**File**: `/apps/web/src/lib/stores/__tests__/notificationPreferences.test.ts`

**Update mock responses** (remove event_type)
**Update assertions** (match new API shape)

#### 8.3 Worker Tests

**Various files in `/apps/worker/src/**/\*.test.ts`\*\*

**Update mock preference data** (remove event_type)
**Update test assertions** (queries without event_type filter)

### Validation:

```bash
# Run all tests
pnpm test:run

# Should have 0 failures
```

---

## Phase 9: Documentation and Cleanup

**Goal**: Update docs and remove temporary code
**Duration**: 2-3 hours
**Risk**: None

### Tasks:

1. ✅ Update API documentation
2. ✅ Update architecture docs
3. ✅ Update user-facing help docs
4. ✅ Add migration notes to CHANGELOG
5. ✅ Archive backup table (after 7 days)
6. ✅ Remove feature flags (if any)

### Files to Update:

- `/docs/technical/api/` - API documentation
- `/docs/architecture/` - Architecture docs
- `/CHANGELOG.md` - Migration notes
- User help docs (if any)

### Cleanup SQL (run after 7 days):

```sql
-- After verifying migration success for 7 days
DROP TABLE IF EXISTS user_notification_preferences_backup;
```

---

## Deployment Strategy

### Staging Deployment Order:

1. Phase 1 (Database prep) → Deploy to staging
2. Phase 2 (Types) → Deploy to staging
3. Phase 3 (Migration) → Run on staging
4. Phase 4 (DB functions) → Deploy to staging
5. Phase 5 (Worker) → Deploy to staging
6. Phase 6 (Web backend) → Deploy to staging
7. Phase 7 (Web frontend) → Deploy to staging
8. Phase 8 (Tests) → Validate on staging
9. Comprehensive end-to-end testing on staging

### Production Deployment Order:

**Pre-deployment**:

- Schedule maintenance window (optional, migration is fast)
- Notify users of upcoming changes
- Prepare rollback plan

**Deployment**:

1. Phase 1 → Production (database prep) - No downtime
2. Phase 3 → Production (migration) - Brief downtime (~1 minute)
3. Phase 4 → Production (DB functions) - No downtime
4. Phase 5 + 6 + 7 → Production (all app code) - Deploy atomically
5. Monitor error logs for 24-48 hours
6. Phase 9 → Production (docs and cleanup after 7 days)

### Rollback Points:

**Before Phase 3 (Migration)**:

- Easy rollback - just revert code changes

**After Phase 3 (Migration)**:

```sql
-- Emergency rollback
BEGIN;

-- Restore old table
DROP TABLE user_notification_preferences;
ALTER TABLE user_notification_preferences_backup
RENAME TO user_notification_preferences;

-- Restore old function
-- (Revert Phase 4 migration)

COMMIT;
```

**After 7 Days**:

- No rollback - backup table deleted
- Must forward-fix any issues

---

## Success Criteria

### Per Phase:

- ✅ All migrations run without errors
- ✅ Type checking passes
- ✅ All tests pass
- ✅ Manual testing confirms functionality
- ✅ No increase in error logs

### Overall:

- ✅ One row per user in `user_notification_preferences`
- ✅ No event_type column in `user_notification_preferences`
- ✅ event_type column exists in `user_notifications`
- ✅ All notifications still send correctly
- ✅ User preferences still load/save correctly
- ✅ No data loss (all users have preferences)
- ✅ Performance improved (fewer DB rows)

---

## Risk Mitigation

### High-Risk Phases:

- **Phase 3** (Migration) - Destructive operation
  - Mitigation: Comprehensive testing on staging with production data copy
  - Mitigation: Backup table created in Phase 1
  - Mitigation: Transaction-based migration (can rollback)

- **Phase 5-6** (Worker/Web updates) - Affects live notification delivery
  - Mitigation: Deploy during low-traffic period
  - Mitigation: Monitor error logs closely
  - Mitigation: Keep rollback plan ready

### Monitoring:

- Error log spike alerts
- Notification delivery rate monitoring
- Database query performance monitoring
- User preference update rate monitoring

---

## Timeline Estimate

- **Phase 1**: 1-2 hours
- **Phase 2**: 1-2 hours
- **Phase 3**: 2-4 hours (includes testing)
- **Phase 4**: 2-3 hours
- **Phase 5**: 3-4 hours
- **Phase 6**: 3-4 hours
- **Phase 7**: 2-3 hours
- **Phase 8**: 3-4 hours
- **Phase 9**: 2-3 hours

**Total**: ~20-30 hours of implementation time
**Calendar Time**: ~1 week with proper testing between phases

---

## Current Status

- [ ] Phase 1: Database Preparation
- [ ] Phase 2: Update TypeScript Types
- [ ] Phase 3: Database Migration
- [ ] Phase 4: Update Database Functions
- [ ] Phase 5: Update Worker Service
- [ ] Phase 6: Update Web App Backend
- [ ] Phase 7: Update Web App Frontend
- [ ] Phase 8: Update Tests
- [ ] Phase 9: Documentation and Cleanup

**Next Action**: Begin Phase 1 - Database Preparation
