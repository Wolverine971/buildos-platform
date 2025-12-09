---
title: 'SMS Scheduling Database Schema Research'
date: 2025-10-08
type: research
status: completed
tags: [sms, database, schema, notifications, messaging, queue]
related_docs:
    - /docs/architecture/SMS_NOTIFICATION_CHANNEL_DESIGN.md
    - /docs/architecture/NOTIFICATION_TRACKING_SYSTEM.md
    - /apps/web/supabase/migrations/20250928_add_sms_messaging_tables.sql
    - /apps/web/supabase/migrations/20251006_sms_notification_channel_phase1.sql
path: docs/features/sms-event-scheduling/research/database-schema.md
---

# SMS Scheduling Database Schema Research

## Executive Summary

This document provides a comprehensive analysis of the BuildOS database schema for notification and messaging systems, with a focus on informing the design of a new SMS scheduling data model. The research covers notification delivery tracking, queue management, SMS messaging infrastructure, and status tracking patterns.

## 1. Notification System Tables

### 1.1 `notification_events`

**Purpose:** Immutable log of all notification-worthy events in the system

**Schema:**

```sql
CREATE TABLE notification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type ~ '^[a-z]+\.[a-z_]+$'),
  event_source TEXT NOT NULL CHECK (
    event_source IN ('database_trigger', 'worker_job', 'api_action', 'cron_scheduler')
  ),

  -- Event actors and targets
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);
```

**Key Patterns:**

- Event type format: `domain.action` (e.g., `user.signup`, `brief.completed`)
- Immutable event log pattern
- JSONB payload for flexible event data
- Supports both user-initiated and system events
- Indexed by event_type, target_user_id, created_at

**Supported Event Types:**

- `user.signup`
- `user.trial_expired`
- `payment.failed`
- `error.critical`
- `brief.completed`
- `brief.failed`
- `brain_dump.processed`
- `task.due_soon`
- `project.phase_scheduled`
- `calendar.sync_failed`

### 1.2 `notification_subscriptions`

**Purpose:** Defines which users subscribe to which notification events

**Schema:**

```sql
CREATE TABLE notification_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,

  -- Subscription control
  is_active BOOLEAN DEFAULT TRUE,
  admin_only BOOLEAN DEFAULT FALSE,

  -- Optional filters for advanced use cases
  filters JSONB,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),

  UNIQUE(user_id, event_type)
);
```

**Key Patterns:**

- One subscription per user per event type (enforced by unique constraint)
- Admin-only events supported
- JSONB filters for conditional subscriptions
- Auto-creates default preferences on subscription

### 1.3 `user_notification_preferences`

**Purpose:** Per-user, per-event-type, per-channel notification preferences

**Schema:**

```sql
CREATE TABLE user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,

  -- Channel preferences
  push_enabled BOOLEAN DEFAULT TRUE,
  email_enabled BOOLEAN DEFAULT TRUE,
  sms_enabled BOOLEAN DEFAULT FALSE,
  in_app_enabled BOOLEAN DEFAULT TRUE,

  -- Delivery preferences
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('urgent', 'normal', 'low')),
  batch_enabled BOOLEAN DEFAULT FALSE,
  batch_interval_minutes INTEGER,

  -- Quiet hours
  quiet_hours_enabled BOOLEAN DEFAULT FALSE,
  quiet_hours_start TIME DEFAULT '22:00:00',
  quiet_hours_end TIME DEFAULT '08:00:00',
  timezone TEXT DEFAULT 'UTC',

  -- Frequency limits
  max_per_day INTEGER,
  max_per_hour INTEGER,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, event_type)
);
```

**Key Patterns:**

- Granular channel control per event type
- Quiet hours with timezone support
- Rate limiting (max per day/hour)
- Batching support
- Priority levels: urgent, normal, low
- Auto-created when user subscribes to an event

### 1.4 `notification_deliveries`

**Purpose:** Track all notification deliveries across all channels

**Schema:**

```sql
CREATE TABLE notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event relationship
  event_id UUID REFERENCES notification_events(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES notification_subscriptions(id) ON DELETE SET NULL,

  -- Recipient
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Channel details
  channel TEXT NOT NULL CHECK (channel IN ('push', 'email', 'sms', 'in_app')),
  channel_identifier TEXT,  -- e.g., phone number, email, push endpoint

  -- Delivery status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'sent', 'delivered', 'failed', 'bounced', 'opened', 'clicked')
  ),

  -- Payload
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Tracking timestamps
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,

  -- Retry tracking
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,

  -- External tracking IDs
  external_id TEXT,  -- e.g., Twilio SID
  tracking_id TEXT,  -- Internal tracking ID

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Key Patterns:**

- Multi-channel support (push, email, sms, in_app)
- Progressive status tracking (pending → sent → delivered → opened → clicked)
- Retry logic with attempt tracking
- External ID tracking for third-party services
- Indexed by event_id, recipient, status, channel, created_at

**Status Progression:**

1. `pending` - Created, not yet sent
2. `sent` - Handed off to delivery service
3. `delivered` - Confirmed received by recipient
4. `failed` - Delivery failed
5. `bounced` - Rejected by recipient
6. `opened` - Recipient opened/viewed
7. `clicked` - Recipient clicked link

## 2. Queue System

### 2.1 `queue_jobs`

**Purpose:** Central job queue for all asynchronous work

**Schema:**

```typescript
interface QueueJob {
	id: string; // UUID
	user_id: string; // UUID

	// Job details
	job_type: QueueType; // ENUM
	queue_job_id: string; // Unique job identifier

	// Scheduling
	scheduled_for: TIMESTAMPTZ;
	priority: number; // Default: 10 (lower = higher priority)

	// Status tracking
	status: QueueStatus; // ENUM
	attempts: number; // Default: 0
	max_attempts: number; // Default: 3

	// Execution tracking
	started_at?: TIMESTAMPTZ;
	processed_at?: TIMESTAMPTZ;
	completed_at?: TIMESTAMPTZ;

	// Results and errors
	result?: JSONB;
	error_message?: string;

	// Metadata
	metadata?: JSONB;
	created_at: TIMESTAMPTZ;
	updated_at?: TIMESTAMPTZ;
}
```

**Queue Type ENUM:**

```typescript
type QueueType =
	| 'generate_daily_brief'
	| 'generate_phases'
	| 'sync_calendar'
	| 'process_brain_dump'
	| 'send_email'
	| 'update_recurring_tasks'
	| 'cleanup_old_data'
	| 'onboarding_analysis'
	| 'send_sms'
	| 'generate_brief_email'
	| 'send_notification'
	| 'other';
```

**Queue Status ENUM:**

```typescript
type QueueStatus =
	| 'pending' // Waiting to be processed
	| 'processing' // Currently being processed
	| 'completed' // Successfully completed
	| 'failed' // Failed after all retries
	| 'cancelled' // Manually cancelled
	| 'retrying'; // Failed, will retry
```

**Key Patterns:**

- Priority-based scheduling (lower number = higher priority)
- Retry logic with max_attempts
- Status lifecycle: pending → processing → completed/failed
- JSONB metadata for job-specific data
- Indexed by job_type+status, scheduled_for+status

**Metadata Patterns by Job Type:**

**send_notification:**

```json
{
	"event_id": "uuid",
	"delivery_id": "uuid",
	"channel": "sms|email|push|in_app",
	"event_type": "domain.action"
}
```

**send_sms:**

```json
{
	"message_id": "uuid",
	"phone_number": "+1234567890",
	"message": "SMS content",
	"priority": "low|normal|high|urgent"
}
```

## 3. SMS Messaging System

### 3.1 `sms_messages`

**Purpose:** Track SMS messages and their delivery status

**Schema:**

```sql
CREATE TABLE sms_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Message details
  phone_number TEXT NOT NULL,
  message_content TEXT NOT NULL,
  template_id UUID REFERENCES sms_templates(id) ON DELETE SET NULL,
  template_vars JSONB,

  -- Status tracking
  status sms_status NOT NULL DEFAULT 'pending',
  priority sms_priority NOT NULL DEFAULT 'normal',

  -- Scheduling
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  -- Twilio integration
  twilio_sid TEXT,
  twilio_status TEXT,
  twilio_error_code INTEGER,
  twilio_error_message TEXT,

  -- Retry logic
  attempt_count INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,

  -- Related data
  queue_job_id UUID REFERENCES queue_jobs(id) ON DELETE SET NULL,
  notification_delivery_id UUID REFERENCES notification_deliveries(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**SMS Status ENUM:**

```typescript
type SMSStatus =
	| 'pending' // Created, not yet queued
	| 'queued' // Added to queue
	| 'sending' // Being sent via Twilio
	| 'sent' // Sent to carrier
	| 'delivered' // Confirmed delivered
	| 'failed' // Failed to send
	| 'undelivered' // Sent but not delivered
	| 'scheduled' // Scheduled for future
	| 'cancelled'; // Manually cancelled
```

**SMS Priority ENUM:**

```typescript
type SMSPriority =
	| 'low' // Non-urgent, can be delayed
	| 'normal' // Standard delivery
	| 'high' // Important, prioritize
	| 'urgent'; // Critical, send immediately
```

**Key Patterns:**

- Dual linkage: can be standalone OR linked to notification_deliveries
- Template support with variable substitution
- Full Twilio status tracking
- Retry mechanism with next_retry_at
- Can link to projects/tasks for context
- Indexed by user_id+status, scheduled_for, queue_job_id

**Usage Patterns:**

1. **Standalone SMS** (Direct send):
    - notification_delivery_id: NULL
    - Use case: Task reminders, daily briefs

2. **Event-driven SMS** (Via notification system):
    - notification_delivery_id: UUID
    - Use case: User signup, brief completed

### 3.2 `sms_templates`

**Purpose:** Reusable SMS message templates

**Schema:**

```sql
CREATE TABLE sms_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Template content
  message_template TEXT NOT NULL CHECK (LENGTH(TRIM(message_template)) > 0),

  -- Variable configuration
  template_vars JSONB DEFAULT '{}',
  required_vars JSONB DEFAULT '[]',

  -- Settings
  max_length INTEGER DEFAULT 160,
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Example Templates:**

```sql
-- Task reminder
template_key: 'task_reminder'
message_template: 'BuildOS: {{task_name}} is due {{due_time}}. {{task_context}}'
template_vars: {"task_name": "string", "due_time": "string", "task_context": "string"}

-- Daily brief ready
template_key: 'daily_brief_ready'
message_template: 'Your BuildOS daily brief is ready! Key focus: {{main_focus}}. Check the app for details.'
template_vars: {"main_focus": "string"}

-- Urgent task
template_key: 'urgent_task'
message_template: 'URGENT: {{task_name}} needs attention. Due: {{due_date}}. Reply STOP to opt out.'
template_vars: {"task_name": "string", "due_date": "string"}
```

**Key Patterns:**

- Template key constraint: `^[a-z0-9_]+$`
- Variable substitution with Mustache-style `{{var}}`
- Usage tracking
- Max length enforcement (160 chars default for single SMS)

### 3.3 `user_sms_preferences`

**Purpose:** User SMS notification preferences and phone verification

**Schema:**

```sql
CREATE TABLE user_sms_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  -- Contact info
  phone_number TEXT,
  phone_verified BOOLEAN DEFAULT false,
  phone_verified_at TIMESTAMPTZ,

  -- Feature preferences
  task_reminders BOOLEAN DEFAULT false,
  daily_brief_sms BOOLEAN DEFAULT false,
  urgent_alerts BOOLEAN DEFAULT true,
  morning_kickoff_enabled BOOLEAN DEFAULT false,
  morning_kickoff_time TIME,
  evening_recap_enabled BOOLEAN DEFAULT false,
  next_up_enabled BOOLEAN DEFAULT false,
  event_reminders_enabled BOOLEAN DEFAULT false,

  -- Timing preferences
  quiet_hours_start TIME DEFAULT '21:00',
  quiet_hours_end TIME DEFAULT '08:00',
  timezone TEXT DEFAULT 'America/Los_Angeles',

  -- Rate limiting
  daily_sms_limit INTEGER DEFAULT 10,
  daily_sms_count INTEGER DEFAULT 0,
  daily_count_reset_at TIMESTAMPTZ DEFAULT NOW(),

  -- Opt-out
  opted_out BOOLEAN DEFAULT false,
  opted_out_at TIMESTAMPTZ,
  opt_out_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Key Patterns:**

- One record per user (unique constraint)
- Phone verification required before sending
- Granular feature toggles
- Quiet hours with timezone
- Daily SMS rate limiting
- Opt-out tracking with reason

**SMS Availability Logic:**

```sql
-- Helper function to check if SMS is available for a user
CREATE FUNCTION get_user_sms_channel_info(p_user_id UUID)
RETURNS TABLE (
  has_sms_available BOOLEAN,
  phone_number TEXT,
  phone_verified BOOLEAN,
  phone_verified_at TIMESTAMPTZ,
  opted_out BOOLEAN
)
AS $$
  SELECT
    COALESCE(phone_verified = true AND opted_out = false, false) as has_sms_available,
    phone_number,
    COALESCE(phone_verified, false) as phone_verified,
    phone_verified_at,
    COALESCE(opted_out, false) as opted_out
  FROM user_sms_preferences
  WHERE user_id = p_user_id;
$$;
```

## 4. Link Tracking System

### 4.1 `notification_tracking_links`

**Purpose:** URL shortener for tracking clicks in SMS and other notifications

**Schema:**

```sql
CREATE TABLE notification_tracking_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link details
  short_code TEXT UNIQUE NOT NULL,
  delivery_id UUID NOT NULL REFERENCES notification_deliveries(id) ON DELETE CASCADE,
  destination_url TEXT NOT NULL,

  -- Tracking timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  first_clicked_at TIMESTAMPTZ,
  last_clicked_at TIMESTAMPTZ,
  click_count INTEGER DEFAULT 0,

  -- Optional metadata
  metadata JSONB DEFAULT '{}'::jsonb
);
```

**Key Patterns:**

- 6-character base62 short codes (e.g., `abc123`)
- Linked to notification_deliveries (cascades on delete)
- Click tracking with timestamps
- Collision-resistant short code generation
- Used in shortened URLs: `https://buildos.app/l/{short_code}`

**Helper Functions:**

```sql
-- Generate random short code
CREATE FUNCTION generate_short_code(length INTEGER DEFAULT 6)
RETURNS TEXT;

-- Create tracking link with collision handling
CREATE FUNCTION create_tracking_link(
  p_delivery_id UUID,
  p_destination_url TEXT
)
RETURNS TEXT;  -- Returns short_code
```

## 5. Status Tracking Patterns

### 5.1 Common Status Flow Patterns

**Notification Delivery Status:**

```
pending → sent → delivered → opened → clicked
         ↓
       failed
         ↓
     (retry logic)
```

**Queue Job Status:**

```
pending → processing → completed
         ↓           ↘
       retrying      failed
         ↓
    (retry logic)   cancelled
```

**SMS Message Status:**

```
pending → queued → sending → sent → delivered
         ↓         ↓         ↓      ↓
     scheduled  cancelled  failed  undelivered
```

### 5.2 Timestamp Patterns

**Progressive Timestamp Tracking:**

- `created_at` - When record was created
- `scheduled_for` - When to execute
- `started_at` - When processing began
- `sent_at` - When sent to external service
- `delivered_at` - When confirmed delivered
- `opened_at` - When user opened/viewed
- `clicked_at` - When user clicked link
- `failed_at` - When failure occurred
- `completed_at` - When fully completed
- `updated_at` - Last modification

### 5.3 Retry Logic Patterns

**Standard Retry Pattern:**

```typescript
interface RetryConfig {
	attempts: number; // Current attempt count
	max_attempts: number; // Maximum retries (usually 3)
	next_retry_at?: Date; // When to retry next
	last_error?: string; // Last error message
}
```

**Exponential Backoff:**

- Attempt 1: Immediate
- Attempt 2: +5 minutes
- Attempt 3: +15 minutes
- Attempt 4+: +30 minutes

## 6. Migration Files Reference

### Core Migrations

1. **20251006_notification_system_phase1.sql**
    - Creates notification_events, notification_subscriptions, user_notification_preferences
    - Creates notification_deliveries
    - Creates push_subscriptions
    - Adds send_notification to queue_type enum
    - Creates emit_notification_event() RPC function

2. **20251006_notification_system_phase3.sql**
    - Adds brief.completed and brief.failed event types
    - Auto-subscribes users to brief notifications
    - Backfills existing users

3. **20251006_sms_notification_channel_phase1.sql**
    - Adds notification_delivery_id FK to sms_messages
    - Creates get_user_sms_channel_info() helper
    - Updates emit_notification_event() to support SMS

4. **20250928_add_sms_messaging_tables.sql**
    - Creates sms_status and sms_priority enums
    - Creates sms_templates table
    - Creates sms_messages table
    - Creates user_sms_preferences table
    - Adds send_sms to queue_type enum
    - Creates queue_sms_message() helper function

5. **20251007_notification_tracking_links.sql**
    - Creates notification_tracking_links table
    - Creates generate_short_code() function
    - Creates create_tracking_link() function
    - Sets up RLS policies

## 7. Key Relationships

### Entity Relationship Diagram

```
notification_events (1) ─┬─> (N) notification_deliveries
                        │
notification_subscriptions (1) ─> (N) notification_deliveries
                        │
users (1) ──────────────┼──> (N) notification_deliveries
                        │
                        ├──> (1) user_notification_preferences (per event_type)
                        ├──> (1) user_sms_preferences
                        ├──> (N) sms_messages
                        └──> (N) queue_jobs

notification_deliveries (1) ─┬─> (1) sms_messages (optional)
                            └─> (N) notification_tracking_links

sms_templates (1) ───> (N) sms_messages

queue_jobs (1) ───> (1) sms_messages (optional)
```

### Dual-Purpose SMS Messages

SMS messages can be created in two ways:

1. **Standalone SMS** (e.g., task reminders):

    ```
    user → queue_jobs → sms_messages
    ```

2. **Event-driven SMS** (e.g., notification system):
    ```
    notification_event → notification_deliveries → sms_messages
                      ↓
                   queue_jobs
    ```

## 8. Recommendations for SMS Scheduling

Based on the existing schema patterns, here are recommendations for SMS scheduling:

### 8.1 Extend Existing Tables

**Option 1: Use sms_messages.scheduled_for** (RECOMMENDED)

- Already exists in sms_messages table
- Supports both immediate and scheduled sends
- Integration with queue_jobs for processing

**Option 2: Add scheduled_sms_messages table**

- Separate table for future scheduled messages
- Links to sms_messages when actually sent
- Better separation of concerns

### 8.2 Scheduling Patterns

**Recurring Messages:**

```sql
-- Option: Add to sms_messages
ALTER TABLE sms_messages ADD COLUMN recurrence_pattern TEXT;
ALTER TABLE sms_messages ADD COLUMN recurrence_ends TIMESTAMPTZ;
ALTER TABLE sms_messages ADD COLUMN parent_message_id UUID;
```

**One-time Scheduled:**

```sql
-- Already supported via scheduled_for column
INSERT INTO sms_messages (
  user_id,
  phone_number,
  message_content,
  status,
  scheduled_for
) VALUES (
  'user-uuid',
  '+1234567890',
  'Your daily brief is ready!',
  'scheduled',
  '2025-10-09 08:00:00-07'
);
```

### 8.3 Queue Integration

**Scheduled SMS Processing:**

```sql
-- Queue job created when scheduled_for is near
INSERT INTO queue_jobs (
  user_id,
  job_type,
  status,
  scheduled_for,
  metadata
) VALUES (
  'user-uuid',
  'send_sms',
  'pending',
  '2025-10-09 08:00:00-07',
  jsonb_build_object(
    'message_id', 'sms-message-uuid',
    'scheduled_send', true
  )
);
```

### 8.4 Status Handling for Scheduled Messages

**Status Progression:**

```
scheduled → queued → sending → sent → delivered
    ↓         ↓
cancelled   failed
```

**Scheduling Logic:**

```sql
-- Update sms_messages status when scheduled_for approaches
UPDATE sms_messages
SET status = 'queued'
WHERE status = 'scheduled'
  AND scheduled_for <= NOW() + INTERVAL '5 minutes';
```

## 9. Best Practices

### 9.1 Status Transitions

1. **Atomic Updates**: Always update status with timestamps

    ```sql
    UPDATE sms_messages
    SET status = 'sent',
        sent_at = NOW(),
        updated_at = NOW()
    WHERE id = 'message-uuid';
    ```

2. **Status Guards**: Prevent invalid transitions
    ```sql
    -- Can't go from 'delivered' to 'pending'
    CREATE FUNCTION validate_status_transition() ...
    ```

### 9.2 Retry Logic

1. **Exponential Backoff**: Use next_retry_at
2. **Max Attempts**: Enforce max_attempts limit
3. **Error Logging**: Store last_error for debugging

### 9.3 Rate Limiting

1. **Daily Limits**: Check user_sms_preferences.daily_sms_limit
2. **Reset Logic**: Update daily_count_reset_at daily
3. **Quiet Hours**: Respect quiet_hours_start/end

### 9.4 Phone Verification

1. **Always Check**: Use get_user_sms_channel_info()
2. **Fail Gracefully**: Handle unverified phones
3. **Opt-out Respect**: Check opted_out flag

## 10. Summary

The BuildOS database schema provides a robust, extensible foundation for SMS scheduling:

**Strengths:**

- Comprehensive notification tracking
- Multi-channel support (push, email, SMS, in-app)
- Flexible queue system
- Dual-purpose SMS (standalone + event-driven)
- Template support
- Phone verification and opt-out
- Click tracking via URL shortener

**Recommendations for SMS Scheduling:**

1. Leverage existing sms_messages.scheduled_for
2. Use queue_jobs for processing scheduled messages
3. Add recurrence support if needed for recurring messages
4. Respect user preferences (quiet hours, rate limits, opt-out)
5. Integrate with notification_deliveries for event-driven SMS
6. Use sms_templates for reusable message patterns

**Next Steps:**

1. Design recurring message schema (if needed)
2. Implement scheduler to queue messages near scheduled_for
3. Add scheduling UI/API
4. Test edge cases (timezone handling, quiet hours, rate limits)
5. Monitor and optimize queue performance

---

## Related Migrations

- `/apps/web/supabase/migrations/20250928_add_sms_messaging_tables.sql`
- `/apps/web/supabase/migrations/20251006_notification_system_phase1.sql`
- `/apps/web/supabase/migrations/20251006_notification_system_phase3.sql`
- `/apps/web/supabase/migrations/20251006_sms_notification_channel_phase1.sql`
- `/supabase/migrations/20251007_notification_tracking_links.sql`

## Type Definitions

- `/packages/shared-types/src/database.types.ts`
- `/apps/web/src/lib/database.types.ts`
