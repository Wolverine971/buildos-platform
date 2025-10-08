---
title: SMS/Twilio Infrastructure Research
date: 2025-10-08
author: Claude Code
tags: [sms, twilio, infrastructure, notifications, messaging]
status: complete
related_docs:
  - /docs/integrations/twilio/README.md
  - /docs/guides/sms-setup-guide.md
  - /docs/api/sms-api-reference.md
  - /docs/architecture/SMS_NOTIFICATION_CHANNEL_DESIGN.md
---

# SMS/Twilio Infrastructure Research

## Overview

This document provides a comprehensive overview of the existing SMS/Twilio infrastructure in the BuildOS platform, including implementation details, database schema, configuration, and usage patterns.

## Executive Summary

BuildOS has a **fully-featured SMS notification system** powered by Twilio with:

- ✅ Queue-based architecture with Supabase queues
- ✅ Template system for reusable messages
- ✅ Phone verification via Twilio Verify
- ✅ User preferences with quiet hours and daily limits
- ✅ Retry logic with exponential backoff
- ✅ Webhook-based delivery tracking
- ✅ Integration with generic notification system
- ✅ Rate limiting and opt-out support
- ✅ SMS click tracking with URL shortening

**Current Status:** Production-ready, actively used for task reminders and daily brief notifications.

---

## 1. Architecture

### System Components

```
┌─────────────────┐
│   Web App       │
│  (SvelteKit)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌─────────────────┐
│  SMS Service    │──────│ Twilio Package  │
│   (Frontend)    │      │  (@buildos/     │
└────────┬────────┘      │   twilio-svc)   │
         │               └─────────┬───────┘
         ▼                         │
┌─────────────────┐                │
│  Supabase DB    │◄───────────────┘
│   - Tables      │
│   - RPCs        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌─────────────────┐
│  Queue System   │──────│  Worker Service │
│  (queue_jobs)   │      │  (Railway)      │
└─────────────────┘      └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │  Twilio API     │
                         │  (Cloud)        │
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │  User Phone     │
                         │  (SMS Delivery) │
                         └─────────────────┘
```

### Package Structure

**Location:** `/packages/twilio-service/`

```typescript
/packages/twilio-service/
├── src/
│   ├── index.ts              // Package exports
│   ├── client.ts             // TwilioClient class
│   ├── services/
│   │   └── sms.service.ts    // SMSService class
│   └── __tests__/
│       └── sms.test.ts       // Unit tests
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

**Dependencies:**

- `twilio`: ^4.23.0 (Official Twilio SDK)
- `@supabase/supabase-js`: ^2.39.8
- `@buildos/shared-types`: workspace:\*
- `@buildos/supabase-client`: workspace:\*

---

## 2. Database Schema

### Core Tables

#### `sms_messages`

Primary table for all SMS messages.

```sql
CREATE TABLE sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

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

**Indexes:**

```sql
CREATE INDEX idx_sms_messages_user_status ON sms_messages(user_id, status);
CREATE INDEX idx_sms_messages_scheduled ON sms_messages(scheduled_for)
  WHERE status IN ('pending', 'scheduled');
CREATE INDEX idx_sms_messages_queue_job ON sms_messages(queue_job_id);
CREATE INDEX idx_sms_messages_notification_delivery ON sms_messages(notification_delivery_id)
  WHERE notification_delivery_id IS NOT NULL;
```

#### `sms_templates`

Reusable message templates with variable substitution.

```sql
CREATE TABLE sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Seeded Templates:**

1. `task_reminder` - Task due date reminders
2. `daily_brief_ready` - Daily brief completion notifications
3. `urgent_task` - Urgent task alerts
4. `welcome_sms` - Welcome message for new users
5. `notif_*` - Notification system templates (user.signup, brief.completed, etc.)

#### `user_sms_preferences`

User-level SMS preferences and settings.

```sql
CREATE TABLE user_sms_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Contact info
  phone_number TEXT,
  phone_verified BOOLEAN DEFAULT false,
  phone_verified_at TIMESTAMPTZ,

  -- Notification preferences
  task_reminders BOOLEAN DEFAULT false,
  daily_brief_sms BOOLEAN DEFAULT false,
  urgent_alerts BOOLEAN DEFAULT true,

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
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_user_sms_prefs UNIQUE(user_id)
);
```

### Enums

```sql
CREATE TYPE sms_status AS ENUM (
  'pending',
  'queued',
  'sending',
  'sent',
  'delivered',
  'failed',
  'undelivered',
  'scheduled',
  'cancelled'
);

CREATE TYPE sms_priority AS ENUM ('low', 'normal', 'high', 'urgent');
```

### Database Functions

#### `queue_sms_message`

Main function for queueing SMS messages.

```sql
CREATE OR REPLACE FUNCTION queue_sms_message(
  p_user_id UUID,
  p_phone_number TEXT,
  p_message TEXT,
  p_priority sms_priority DEFAULT 'normal',
  p_scheduled_for TIMESTAMPTZ DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS UUID
```

**What it does:**

1. Creates `sms_messages` record
2. Queues job in `queue_jobs` table
3. Returns message ID
4. Handles scheduled messages (within 5 minutes queued immediately, later scheduled)

**Priority Mapping:**

- `urgent` → priority 1
- `high` → priority 5
- `normal` → priority 10
- `low` → priority 20

#### `get_user_sms_channel_info`

Helper function for notification system integration.

```sql
CREATE OR REPLACE FUNCTION get_user_sms_channel_info(p_user_id UUID)
RETURNS TABLE (
  has_sms_available BOOLEAN,
  phone_number TEXT,
  phone_verified BOOLEAN,
  phone_verified_at TIMESTAMPTZ,
  opted_out BOOLEAN
)
```

**Returns:**

- `has_sms_available`: true if phone verified AND not opted out
- Phone number and verification details
- Opt-out status

---

## 3. Twilio Service Implementation

### TwilioClient Class

**Location:** `/packages/twilio-service/src/client.ts`

**Configuration:**

```typescript
interface TwilioConfig {
  accountSid: string;
  authToken: string;
  messagingServiceSid: string;
  verifyServiceSid?: string;
  statusCallbackUrl?: string;
}
```

**Key Methods:**

#### `sendSMS(params)`

```typescript
async sendSMS(params: {
  to: string;
  body: string;
  scheduledAt?: Date;
  metadata?: Record<string, any>;
}): Promise<MessageInstance>
```

**Features:**

- Automatic phone number formatting (E.164)
- Scheduled message support (up to 7 days ahead)
- Status callback with metadata
- Error handling with specific Twilio error codes

**Phone Number Formatting:**

```typescript
private formatPhoneNumber(phone: string): string {
  // Handles:
  // - 5551234567 → +15551234567
  // - 15551234567 → +15551234567
  // - (555) 123-4567 → +15551234567
  // - +15551234567 → +15551234567
}
```

#### `verifyPhoneNumber(phoneNumber)`

```typescript
async verifyPhoneNumber(phoneNumber: string): Promise<{ verificationSid: string }>
```

Uses Twilio Verify API to send 6-digit verification code.

#### `checkVerification(phoneNumber, code)`

```typescript
async checkVerification(phoneNumber: string, code: string): Promise<boolean>
```

Validates verification code, returns `true` if approved.

#### `getMessageStatus(messageSid)`

```typescript
async getMessageStatus(messageSid: string): Promise<string>
```

Fetches current message status from Twilio.

#### `cancelScheduledMessage(messageSid)`

```typescript
async cancelScheduledMessage(messageSid: string): Promise<void>
```

Cancels a scheduled message.

### SMSService Class

**Location:** `/packages/twilio-service/src/services/sms.service.ts`

Higher-level service with business logic.

**Constructor:**

```typescript
constructor(twilioClient: TwilioClient, supabase: SupabaseClient<any>)
```

**Key Methods:**

#### `sendTaskReminder(params)`

```typescript
async sendTaskReminder(params: {
  userId: string;
  phoneNumber: string;
  taskName: string;
  dueDate: Date;
  projectContext?: string;
})
```

**Flow:**

1. Fetch `task_reminder` template
2. Format relative time ("in 30 minutes", "in 2 hours")
3. Check user SMS preferences
4. Create `sms_messages` record
5. Send via Twilio
6. Update status and template usage count

**Priority Calculation:**

```typescript
private calculatePriority(dueDate: Date): string {
  const hoursUntilDue = (dueDate.getTime() - Date.now()) / (1000 * 60 * 60);

  if (hoursUntilDue < 1) return "urgent";
  if (hoursUntilDue < 24) return "high";
  if (hoursUntilDue < 72) return "normal";
  return "low";
}
```

#### `sendDailyBriefNotification(params)`

```typescript
async sendDailyBriefNotification(params: {
  userId: string;
  phoneNumber: string;
  mainFocus: string;
  briefId: string;
})
```

Uses `daily_brief_ready` template with high priority.

#### `checkUserSMSPreferences(userId, preferenceType)`

**Validates:**

1. Phone verified
2. Not opted out
3. Specific preference enabled (task_reminders, daily_brief_sms, etc.)
4. Not in quiet hours (unless urgent_alerts)
5. Daily SMS limit not exceeded

**Quiet Hours Logic:**

```typescript
private isTimeInRange(current: string, start: string, end: string): boolean {
  // Handles overnight quiet hours (e.g., 21:00 to 08:00)
  if (start > end) {
    return current >= start || current <= end;
  }
  return current >= start && current <= end;
}
```

#### `sendWithRetry(params, maxAttempts = 3)`

Automatic retry with exponential backoff.

**Retry Logic:**

- Attempts 1-3 retries
- Exponential backoff: 2^attempt \* 1000ms
- Skips retry for specific error codes (21211, 21614)

---

## 4. Worker Integration

### SMS Worker

**Location:** `/apps/worker/src/workers/smsWorker.ts`

**Initialization:**

```typescript
// Conditional initialization - only if Twilio credentials present
if (accountSid && authToken && messagingServiceSid) {
  twilioClient = new TwilioClient({ ... });
  smsService = new SMSService(twilioClient, supabase);
}
```

**Job Processing:**

```typescript
export async function processSMSJob(job: LegacyJob<any>) {
  // 1. Validate SMS service available
  if (!twilioClient || !smsService) {
    throw new Error("SMS service not available");
  }

  // 2. Get message from database
  const smsMessage = await supabase
    .from("sms_messages")
    .select("*")
    .eq("id", message_id)
    .single();

  // 3. Send via Twilio
  const twilioMessage = await twilioClient.sendSMS({
    to: phone_number,
    body: message,
    metadata: { message_id, user_id }
  });

  // 4. Update status
  await supabase
    .from("sms_messages")
    .update({
      status: "sent",
      twilio_sid: twilioMessage.sid,
      sent_at: new Date().toISOString()
    })
    .eq("id", message_id);

  // 5. Handle errors and retries
  catch (error) {
    // Update attempt count
    // Re-queue with exponential backoff if attempts < max_attempts
  }
}
```

**Retry Strategy:**

- Failed messages re-queued automatically
- Exponential backoff: `Math.pow(2, attempt_count) * 60` seconds
- Max 3 attempts (configurable)

### SMS Adapter (Notification System)

**Location:** `/apps/worker/src/workers/notification/smsAdapter.ts`

Integrates SMS with the generic notification system.

**Key Features:**

1. **Template Caching** (5-minute TTL)

```typescript
const templateCache = new Map<
  string,
  { template: SMSTemplate | null; timestamp: number }
>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
```

2. **Template-based Formatting**

```typescript
async function formatSMSMessage(
  delivery: NotificationDelivery,
): Promise<string> {
  const eventType = payload.event_type;
  const templateKey = templateKeyMap[eventType]; // e.g., "notif_user_signup"

  if (templateKey) {
    const template = await getTemplate(templateKey);
    if (template) {
      const variables = extractTemplateVars(payload, eventType);
      return renderTemplate(template.message_template, variables);
    }
  }

  // Fallback to hardcoded formatting
  return fallbackFormat(eventType, payload);
}
```

3. **URL Shortening for Click Tracking**

```typescript
async function shortenUrlsInMessage(
  message: string,
  deliveryId: string,
): Promise<string> {
  const urlRegex = /(https?:\/\/[^\s<>"]+)/g;
  const urls = message.match(urlRegex) || [];

  for (const url of urls) {
    const { data: shortCode } = await supabase.rpc("create_tracking_link", {
      p_delivery_id: deliveryId,
      p_destination_url: url,
    });

    const shortUrl = `https://build-os.com/l/${shortCode}`;
    message = message.replace(url, shortUrl);
  }

  return message;
}
```

4. **Dual-Table Updates**

- Creates `sms_messages` record
- Links to `notification_deliveries` via `notification_delivery_id`
- Queues job via `queue_sms_message` RPC

**Flow:**

```typescript
export async function sendSMSNotification(delivery: NotificationDelivery): Promise<DeliveryResult> {
  // 1. Format message from payload
  let messageContent = await formatSMSMessage(delivery);

  // 2. Shorten URLs for click tracking
  messageContent = await shortenUrlsInMessage(messageContent, delivery.id);

  // 3. Create SMS message record
  const { data: smsMessage } = await supabase
    .from("sms_messages")
    .insert({
      user_id: delivery.recipient_user_id,
      phone_number: delivery.channel_identifier,
      message_content: messageContent,
      priority: mapPriority(delivery.payload.priority),
      notification_delivery_id: delivery.id  // Link!
    })
    .select()
    .single();

  // 4. Queue SMS job
  await supabase.rpc('queue_sms_message', { ... });

  return { success: true, external_id: smsMessage.id };
}
```

---

## 5. Webhook Integration

### Status Callback Webhook

**Location:** `/apps/web/src/routes/api/webhooks/twilio/status/+server.ts`

**Purpose:** Receives delivery status updates from Twilio.

**Security:**

```typescript
// Validates Twilio signature
const isValid = twilio.validateRequest(
  PRIVATE_TWILIO_AUTH_TOKEN,
  twilioSignature,
  webhookUrl,
  params,
);
```

**Status Mapping:**

```typescript
const statusMap: Record<string, string> = {
  queued: "queued",
  sending: "sending",
  sent: "sent",
  delivered: "delivered",
  failed: "failed",
  undelivered: "undelivered",
  canceled: "cancelled",
};
```

**Dual-Table Updates:**

1. Updates `sms_messages` table
2. Updates `notification_deliveries` table (if linked)

**Error Categorization:**

```typescript
function categorizeErrorCode(errorCode: string): {
  category: string;
  shouldRetry: boolean;
  severity: "low" | "medium" | "high" | "critical";
};
```

**Categories:**

- `invalid_number` - Don't retry (21211, 21614, 30000-30010)
- `account_issue` - Don't retry (30020-30030)
- `carrier_issue` - Retry possible (30004-30006)
- `unreachable` - Retry possible (30003)
- `rate_limit` - Retry possible (20429, 14107)

**Enhanced Retry Logic:**

```typescript
if (messageStatus === "failed" && shouldRetry) {
  let baseDelay = 60; // seconds

  if (errorCategory === "rate_limit") baseDelay = 300; // 5 min
  if (errorCategory === "carrier_issue") baseDelay = 180; // 3 min

  const delay = Math.pow(2, attempt_count) * baseDelay; // Exponential

  // Re-queue job
  await supabase.rpc("add_queue_job", {
    p_job_type: "send_sms",
    p_scheduled_for: new Date(Date.now() + delay * 1000),
    p_metadata: {
      retry_attempt: attempt_count + 1,
      error_category: errorCategory,
    },
  });
}
```

---

## 6. Frontend Services

### SMSService (Web App)

**Location:** `/apps/web/src/lib/services/sms.service.ts`

Singleton service for frontend SMS operations.

**Methods:**

#### `sendSMS(params)`

Queues SMS message via `queue_sms_message` RPC.

#### `sendTaskReminder(taskId)`

Fetches task details and sends reminder using template.

#### `verifyPhoneNumber(phoneNumber)`

Initiates verification via `/api/sms/verify` endpoint.

#### `confirmVerification(phoneNumber, code)`

Confirms verification code and updates `user_sms_preferences`.

#### `getSMSMessages(userId)`

Fetches message history (last 50).

#### `getSMSPreferences(userId)`

Gets user SMS preferences.

#### `updateSMSPreferences(userId, preferences)`

Updates preferences (quiet hours, notification types, etc.).

#### `optOut(userId)`

Opts user out of all SMS notifications.

### API Endpoints

#### POST `/api/sms/verify`

**Purpose:** Start phone verification.

**Request:**

```json
{
  "phoneNumber": "+15551234567"
}
```

**Response:**

```json
{
  "success": true,
  "verificationSent": true,
  "verificationSid": "VAxxxxxxxx"
}
```

**Validation:**

- Checks phone not already verified by another user
- Creates/updates `user_sms_preferences` with `phone_verified: false`
- Sends verification code via Twilio Verify

**Error Handling:**

- `409 Conflict` - Phone already verified by another user
- `429 Too Many Requests` - Rate limit exceeded
- `400 Bad Request` - Invalid phone format

#### POST `/api/sms/verify/confirm`

**Purpose:** Confirm verification code.

**Request:**

```json
{
  "phoneNumber": "+15551234567",
  "code": "123456"
}
```

**Response:**

```json
{
  "success": true,
  "verified": true,
  "message": "Phone number verified successfully"
}
```

**Updates:**

- Sets `phone_verified: true`
- Sets `phone_verified_at: NOW()`

---

## 7. Configuration

### Environment Variables

#### Web App (`apps/web/.env`)

```bash
# Required
PRIVATE_TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PRIVATE_TWILIO_AUTH_TOKEN=your_auth_token
PRIVATE_TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Optional
PRIVATE_TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PRIVATE_TWILIO_STATUS_CALLBACK_URL=https://build-os.com/api/webhooks/twilio/status
PRIVATE_SMS_RATE_LIMIT_PER_MINUTE=10
PRIVATE_SMS_RATE_LIMIT_PER_HOUR=100
```

#### Worker Service (`apps/worker/.env`)

```bash
# Twilio Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_STATUS_CALLBACK_URL=https://build-os.com/api/webhooks/twilio/status
```

**Note:** Worker gracefully handles missing credentials (logs warning, disables SMS).

### Twilio Setup

**Required Steps:**

1. **Create Twilio Account**
   - Sign up at twilio.com
   - Get Account SID and Auth Token

2. **Create Messaging Service**
   - Navigate to Messaging > Services
   - Add phone numbers to sender pool
   - Configure opt-out keywords (STOP, UNSUBSCRIBE)
   - Set status callback URL

3. **Create Verify Service** (Optional)
   - Navigate to Verify > Services
   - Configure SMS channel
   - 6-digit codes, 10-minute validity

4. **Configure Webhooks**
   - Set status callback: `https://build-os.com/api/webhooks/twilio/status`
   - Enable signature validation

---

## 8. Rate Limiting and Throttling

### Database-Level Rate Limiting

**User Preferences:**

```sql
daily_sms_limit INTEGER DEFAULT 10,
daily_sms_count INTEGER DEFAULT 0,
daily_count_reset_at TIMESTAMPTZ DEFAULT NOW()
```

**Enforcement:**

```typescript
if (prefs.daily_sms_count >= prefs.daily_sms_limit) {
  return false; // Block sending
}
```

### Quiet Hours

**Configuration:**

```sql
quiet_hours_start TIME DEFAULT '21:00',
quiet_hours_end TIME DEFAULT '08:00',
timezone TEXT DEFAULT 'America/Los_Angeles'
```

**Enforcement:**

```typescript
const isInQuietHours = this.isTimeInRange(
  currentTime,
  prefs.quiet_hours_start,
  prefs.quiet_hours_end,
);

if (isInQuietHours && preferenceType !== "urgent_alerts") {
  return false; // Block non-urgent messages during quiet hours
}
```

### API Rate Limiting

**Implemented via `/apps/web/src/lib/utils/rate-limiter.ts`**

- Phone verification: 5 attempts per hour per user
- SMS sending: 10 per minute, 100 per hour per user
- Status webhooks: Unlimited (from Twilio)

### Twilio Rate Limits

- **Verify API:** 5 attempts per phone number per hour
- **SMS API:** Depends on account tier (typically 1 msg/sec)
- **Scheduled messages:** Maximum 7 days in advance

---

## 9. Testing Infrastructure

### Unit Tests

**Location:** `/packages/twilio-service/src/__tests__/sms.test.ts`

**Test Coverage:**

1. **SMS Service Tests:**
   - Send task reminder SMS
   - Block sending if user opted out
   - Format relative time correctly
   - Calculate priority correctly

2. **Twilio Client Tests:**
   - Phone number formatting (various formats)
   - E.164 normalization

**Running Tests:**

```bash
cd packages/twilio-service
pnpm test
```

### Test Phone Numbers (Twilio)

```typescript
// Magic Twilio test numbers
"+15005550006"; // Valid number (success)
"+15005550001"; // Invalid number (error)
"+15005550009"; // SMS not capable (error)

// Verification codes
"123456"; // Always succeeds in test mode
"000000"; // Always fails in test mode
```

### Manual Testing

**Location:** `/apps/web/tests/manual/test-sms-click-tracking.md`

Provides step-by-step instructions for testing:

- Phone verification flow
- SMS sending
- Click tracking
- Webhook delivery

---

## 10. Usage Patterns

### Task Reminder Flow

```typescript
// 1. User creates task with due date
const task = {
  name: "Complete report",
  due_date: new Date("2024-12-25T14:00:00"),
  user_id: "user-uuid",
};

// 2. System sends reminder (automated)
await smsService.sendTaskReminder({
  userId: task.user_id,
  phoneNumber: userPrefs.phone_number,
  taskName: task.name,
  dueDate: task.due_date,
  projectContext: project.name,
});

// 3. Template rendered: "BuildOS: Complete report is due in 2 hours. Project: Website Redesign"

// 4. Message queued and sent via worker

// 5. Delivery status updated via webhook
```

### Daily Brief Notification Flow

```typescript
// 1. Daily brief generated by worker
const brief = await generateDailyBrief(userId);

// 2. Check user preferences
if (userPrefs.daily_brief_sms) {
  await smsService.sendDailyBriefNotification({
    userId,
    phoneNumber: userPrefs.phone_number,
    mainFocus: brief.main_focus,
    briefId: brief.id,
  });
}

// 3. Template rendered: "Your BuildOS daily brief is ready! Key focus: Complete Q4 reports. Check the app for details."
```

### Notification System Integration

```typescript
// 1. Event emitted (e.g., user signup)
await supabase.rpc("emit_notification_event", {
  p_event_type: "user.signup",
  p_event_source: "web",
  p_target_user_id: null, // Broadcast to admins
  p_payload: {
    user_email: "new@user.com",
    signup_method: "google",
  },
});

// 2. Function creates notification deliveries
// - In-app notification
// - Push notification
// - SMS notification (if enabled)

// 3. Worker processes SMS delivery
const delivery = await getDelivery(deliveryId);
await sendSMSNotification(delivery);

// 4. Message formatted with template
// Template: "BuildOS: New user {{user_email}} signed up via {{signup_method}}"
// Result: "BuildOS: New user new@user.com signed up via google"

// 5. URLs shortened for tracking
// "Check details at https://build-os.com/admin/users/123"
// → "Check details at https://build-os.com/l/abc123"

// 6. Dual-table update on delivery
// - sms_messages.status = 'sent'
// - notification_deliveries.status = 'sent'
```

---

## 11. Error Handling

### Twilio Error Codes

**Common Errors:**

| Code  | Description             | Handling           |
| ----- | ----------------------- | ------------------ |
| 21211 | Invalid phone number    | Don't retry        |
| 21610 | Message too long        | Truncate and retry |
| 21614 | Phone not SMS capable   | Don't retry        |
| 20003 | Authentication failure  | Check credentials  |
| 20429 | Rate limit exceeded     | Retry with backoff |
| 30003 | Unreachable destination | Retry with backoff |
| 30004 | Message blocked         | Don't retry        |

**Error Handling Strategy:**

```typescript
try {
  await twilioClient.sendSMS({ ... });
} catch (error: any) {
  if (error.code === 21211) {
    throw new Error(`Invalid phone number: ${params.to}`);
  } else if (error.code === 21614) {
    throw new Error("Phone number is not SMS capable");
  }
  throw error;
}
```

### Database Error Handling

**Example: Duplicate Phone Number**

```typescript
const { data: existingUser } = await supabase
  .from("user_sms_preferences")
  .select("user_id")
  .eq("phone_number", phoneNumber)
  .eq("phone_verified", true)
  .neq("user_id", session.user.id)
  .single();

if (existingUser) {
  return ApiResponse.conflict(
    "This phone number is already verified by another user",
  );
}
```

### Graceful Degradation

**Worker Initialization:**

```typescript
if (!twilioConfig.accountSid || !twilioConfig.authToken) {
  console.warn(
    "Twilio credentials not configured - SMS functionality disabled",
  );
  twilioClient = null;
  smsService = null;
}

// Later in job processing:
if (!twilioClient || !smsService) {
  const errorMessage =
    "SMS service not available - Twilio credentials not configured";
  await updateJobStatus(job.id, "failed", "send_sms", errorMessage);
  throw new Error(errorMessage);
}
```

---

## 12. Security Considerations

### Phone Verification

- **Required before sending:** All SMS messages require verified phone number
- **One phone per user:** Prevents phone number sharing/spoofing
- **Verification SID tracking:** Links verification to user record

### Webhook Security

**Signature Validation:**

```typescript
const twilioSignature = request.headers.get("X-Twilio-Signature");
const isValid = twilio.validateRequest(
  PRIVATE_TWILIO_AUTH_TOKEN,
  twilioSignature,
  webhookUrl,
  params,
);

if (!isValid) {
  return json({ error: "Invalid signature" }, { status: 401 });
}
```

**HTTPS Only:** All webhooks use secure HTTPS endpoints.

### Rate Limiting

**Per-User Limits:**

- Daily SMS limit (default 10)
- Hourly API rate limits
- Verification attempt limits

**Prevents:**

- SMS bombing attacks
- Cost overruns
- Abuse of verification system

### Data Privacy

**Encryption:**

- Phone numbers stored as plain text (required for Twilio)
- Sensitive data in metadata JSON

**RLS Policies:**

```sql
CREATE POLICY "Users can view their own SMS messages" ON sms_messages
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access" ON sms_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### Opt-out Compliance

**TCPA/CAN-SPAM Compliance:**

- `STOP` keyword handling (Twilio automatic)
- One-click opt-out in UI
- `opted_out` flag enforcement
- Opt-out reason tracking

---

## 13. Monitoring and Analytics

### Key Metrics

**SQL Queries:**

```sql
-- Daily SMS volume
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_messages,
  COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) FILTER (WHERE status = 'delivered')::float / COUNT(*) as delivery_rate
FROM sms_messages
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at);

-- Template usage
SELECT
  t.name,
  t.usage_count,
  COUNT(m.id) as messages_sent,
  COUNT(*) FILTER (WHERE m.status = 'delivered') as delivered
FROM sms_templates t
LEFT JOIN sms_messages m ON m.template_id = t.id
GROUP BY t.id
ORDER BY messages_sent DESC;

-- User engagement
SELECT
  COUNT(DISTINCT user_id) as active_users,
  COUNT(*) FILTER (WHERE phone_verified = true) as verified_users,
  COUNT(*) FILTER (WHERE opted_out = true) as opted_out_users,
  AVG(daily_sms_count) as avg_daily_messages
FROM user_sms_preferences;

-- Error analysis
SELECT
  twilio_error_code,
  twilio_error_message,
  COUNT(*) as occurrence_count
FROM sms_messages
WHERE status = 'failed'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY twilio_error_code, twilio_error_message
ORDER BY occurrence_count DESC;
```

### Logging

**Structured Logging in Webhook:**

```typescript
function logWebhookEvent(
  level: "info" | "warn" | "error",
  message: string,
  context: Partial<WebhookContext> & Record<string, any>,
) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    source: "twilio_webhook",
    message,
    ...context,
  };

  console.log("[TwilioWebhook]", message, logEntry);
}
```

**Log Events:**

- Webhook received
- Signature validation
- Status updates
- Error categorization
- Retry scheduling
- Processing time

### Performance Tracking

**Webhook Response Time:**

```typescript
const startTime = Date.now();
// ... process webhook ...
const processingTime = Date.now() - startTime;

logWebhookEvent("info", "Webhook processed successfully", {
  processingTimeMs: processingTime,
});
```

**Template Cache Performance:**

```typescript
export function getTemplateCacheStats(): {
  size: number;
  templates: string[];
} {
  return {
    size: templateCache.size,
    templates: Array.from(templateCache.keys()),
  };
}
```

---

## 14. Implementation Highlights

### Template System

**Variable Substitution:**

```typescript
private renderTemplate(template: string, vars: Record<string, any>): string {
  return template.replace(/{{(\w+)}}/g, (match, key) => {
    return vars[key] || "";
  });
}
```

**Usage Example:**

```typescript
// Template: "BuildOS: {{task_name}} is due {{due_time}}. {{task_context}}"
// Variables: { task_name: "Write report", due_time: "in 2 hours", task_context: "Q4 Planning" }
// Result: "BuildOS: Write report is due in 2 hours. Q4 Planning"
```

### Scheduled Messages

**Twilio Native Scheduling (< 7 days):**

```typescript
if (params.scheduledAt) {
  const diffHours =
    (params.scheduledAt.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (diffHours > 0 && diffHours <= 168) {
    // Within 7 days
    messageParams.sendAt = params.scheduledAt.toISOString();
    messageParams.scheduleType = "fixed";
  }
}
```

**Database Scheduling (> 7 days):**

```typescript
// Store in sms_messages with status 'scheduled'
// Worker picks up when scheduled_for <= NOW() + 5 minutes
```

### Click Tracking

**URL Shortening:**

```typescript
// Original: "Check https://build-os.com/admin/users/123"
// Shortened: "Check https://build-os.com/l/abc123"

const { data: shortCode } = await supabase.rpc("create_tracking_link", {
  p_delivery_id: deliveryId,
  p_destination_url: url,
});

const shortUrl = `https://build-os.com/l/${shortCode}`;
```

**Click Tracking Table:**

```sql
CREATE TABLE sms_click_tracking (
  id UUID PRIMARY KEY,
  short_code TEXT UNIQUE,
  delivery_id UUID REFERENCES notification_deliveries(id),
  destination_url TEXT,
  click_count INTEGER DEFAULT 0,
  first_clicked_at TIMESTAMPTZ,
  last_clicked_at TIMESTAMPTZ
);
```

### Notification System Integration

**Dual-Table Pattern:**

1. Create record in `sms_messages`
2. Link to `notification_deliveries` via `notification_delivery_id`
3. Both tables updated on status changes

**Benefits:**

- Unified notification tracking
- SMS-specific metadata preserved
- Analytics across all channels

---

## 15. Best Practices

### Message Content

✅ **Do:**

- Keep under 160 characters
- Use clear, actionable language
- Include opt-out instructions
- Test with various data inputs

❌ **Don't:**

- Use spam trigger words
- Exceed character limit (gets split)
- Send promotional content without consent
- Include unshortened long URLs

### Scheduling

✅ **Do:**

- Respect user quiet hours
- Consider timezone differences
- Batch non-urgent messages
- Use appropriate priority levels

❌ **Don't:**

- Send during quiet hours (except urgent)
- Ignore timezone settings
- Queue too many messages at once
- Use urgent priority unnecessarily

### Template Design

✅ **Do:**

- Use descriptive variable names
- Keep templates flexible
- Document required variables
- Set appropriate max_length

❌ **Don't:**

- Hardcode user-specific data
- Create overly complex templates
- Forget to handle missing variables
- Ignore character limits

### Error Handling

✅ **Do:**

- Implement proper retry logic
- Log all errors for debugging
- Categorize error types
- Have fallback communication methods

❌ **Don't:**

- Retry permanent failures
- Ignore error codes
- Skip logging
- Assume messages always succeed

---

## 16. Future Enhancements

### Planned Features

**From Documentation:**

1. **WhatsApp Business API support**
2. **MMS capabilities for rich media**
3. **International phone number support**
4. **Advanced analytics dashboard**
5. **A/B testing for message optimization**
6. **Smart scheduling based on user engagement**

### Integration Points

**Potential Uses:**

- Calendar event reminders
- Project milestone notifications
- Team collaboration alerts
- Payment reminder messages
- Onboarding welcome series
- Recurring task reminders

---

## 17. Troubleshooting Guide

### Common Issues

#### Phone Verification Not Sending

**Symptoms:**

- User doesn't receive verification code
- Error message in logs

**Debugging:**

1. Check Verify Service SID configured
2. Verify phone number format (+1 for US)
3. Check Twilio account has credits
4. Review rate limiting

**SQL Check:**

```sql
SELECT * FROM user_sms_preferences
WHERE user_id = 'user-uuid';
```

#### Messages Stuck in Queue

**Symptoms:**

- Messages show `status = 'pending'` or `'queued'`
- Not being sent

**Debugging:**

1. Verify worker service is running
2. Check Twilio credentials in worker .env
3. Check `queue_jobs` table

**SQL Check:**

```sql
SELECT * FROM queue_jobs
WHERE job_type = 'send_sms'
  AND status IN ('pending', 'processing')
ORDER BY created_at DESC;

SELECT * FROM sms_messages
WHERE status IN ('pending', 'queued')
ORDER BY created_at DESC;
```

#### Webhooks Not Working

**Symptoms:**

- Status never updates to `'delivered'`
- Webhook endpoint errors in Twilio logs

**Debugging:**

1. Check URL is publicly accessible
2. Verify HTTPS certificate valid
3. Test signature validation
4. Check firewall rules

**Test Webhook:**

```bash
curl -X POST https://build-os.com/api/webhooks/twilio/status \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "MessageSid=SM123&MessageStatus=delivered&message_id=test-uuid"
```

#### High Failure Rate

**Symptoms:**

- Many messages with `status = 'failed'`
- High error codes

**Debugging:**

1. Analyze error codes
2. Check phone number validity
3. Review message content (compliance)
4. Verify Twilio account standing

**SQL Analysis:**

```sql
SELECT
  twilio_error_code,
  twilio_error_message,
  COUNT(*) as count
FROM sms_messages
WHERE status = 'failed'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY twilio_error_code, twilio_error_message
ORDER BY count DESC;
```

---

## 18. Code Examples

### Send SMS Directly (Backend)

```typescript
import { TwilioClient, SMSService } from "@buildos/twilio-service";
import { createServiceClient } from "@buildos/supabase-client";

const twilioClient = new TwilioClient({
  accountSid: process.env.PRIVATE_TWILIO_ACCOUNT_SID!,
  authToken: process.env.PRIVATE_TWILIO_AUTH_TOKEN!,
  messagingServiceSid: process.env.PRIVATE_TWILIO_MESSAGING_SERVICE_SID!,
});

const supabase = createServiceClient();
const smsService = new SMSService(twilioClient, supabase);

// Send task reminder
await smsService.sendTaskReminder({
  userId: "user-uuid",
  phoneNumber: "+15551234567",
  taskName: "Complete report",
  dueDate: new Date("2024-12-25T14:00:00"),
  projectContext: "Q4 Planning",
});
```

### Queue SMS via Database Function

```sql
-- Queue an SMS message
SELECT queue_sms_message(
  p_user_id := 'user-uuid',
  p_phone_number := '+15551234567',
  p_message := 'Your task is due soon!',
  p_priority := 'high'::sms_priority,
  p_scheduled_for := NOW() + INTERVAL '1 hour',
  p_metadata := '{"task_id": "task-uuid"}'::jsonb
);
```

### Frontend Usage

```typescript
import { smsService } from "$lib/services/sms.service";

// Send verification code
const verifyResult = await smsService.verifyPhoneNumber("+15551234567");

// Confirm verification
const confirmResult = await smsService.confirmVerification(
  "+15551234567",
  "123456",
);

// Update preferences
await smsService.updateSMSPreferences(userId, {
  task_reminders: true,
  quiet_hours_start: "22:00",
  quiet_hours_end: "08:00",
});

// Send task reminder
await smsService.sendTaskReminder(taskId);
```

---

## 19. Related Documentation

### Internal Documentation

1. **[Twilio Integration README](/docs/integrations/twilio/README.md)**
   - Complete integration guide
   - Architecture diagrams
   - Feature overview

2. **[SMS Setup Guide](/docs/guides/sms-setup-guide.md)**
   - Step-by-step Twilio setup
   - Environment configuration
   - Testing instructions

3. **[SMS API Reference](/docs/api/sms-api-reference.md)**
   - Complete API documentation
   - Type definitions
   - Error codes

4. **[SMS Notification Channel Design](/docs/architecture/SMS_NOTIFICATION_CHANNEL_DESIGN.md)**
   - Notification system integration
   - Design decisions
   - Implementation phases

5. **[SMS Testing Guide](/docs/testing/SMS_NOTIFICATION_TESTING_GUIDE.md)**
   - Testing strategies
   - Manual test procedures
   - Automated test examples

### External Resources

1. **[Twilio SMS Documentation](https://www.twilio.com/docs/sms)**
2. **[Twilio Verify API](https://www.twilio.com/docs/verify/api)**
3. **[Twilio Error Codes](https://www.twilio.com/docs/api/errors)**
4. **[TCPA Compliance Guide](https://www.twilio.com/en-us/blog/compliance-tcpa-text-messaging)**

---

## 20. Summary

### What We Have

✅ **Complete SMS Infrastructure:**

- Twilio integration package (`@buildos/twilio-service`)
- Database schema with tables and functions
- Queue-based job processing
- Template system with variable substitution
- Phone verification via Twilio Verify
- User preferences with quiet hours
- Retry logic with exponential backoff
- Webhook-based delivery tracking
- Notification system integration
- Click tracking with URL shortening

✅ **Production Features:**

- Rate limiting (daily limits, quiet hours)
- Error categorization and handling
- Dual-table updates (SMS + notifications)
- Template caching for performance
- Security (signature validation, RLS)
- Compliance (opt-out, TCPA)
- Monitoring and analytics

✅ **Developer Experience:**

- Comprehensive documentation
- Unit tests
- Type-safe TypeScript
- Graceful degradation
- Clear error messages

### What's Missing

❌ **Not Yet Implemented:**

- WhatsApp Business API
- MMS support
- International phone numbers (limited)
- Advanced analytics dashboard
- A/B testing framework

### Key Takeaways

1. **Architecture:** Queue-based, reliable, scalable
2. **Integration:** Dual-purpose (standalone + notification system)
3. **Security:** Phone verification required, signature validation
4. **Reliability:** Retry logic, error categorization, delivery tracking
5. **User Experience:** Quiet hours, daily limits, opt-out support
6. **Cost:** Optimized with template caching, scheduled sending

### Next Steps for Development

If building on this infrastructure:

1. **Review existing templates** in `sms_templates` table
2. **Configure Twilio credentials** in environment variables
3. **Test phone verification flow** in development
4. **Monitor delivery rates** in production
5. **Set up alerts** for high failure rates
6. **Consider international support** if needed

---

## Appendix A: File Locations

### Package Files

- `/packages/twilio-service/src/index.ts`
- `/packages/twilio-service/src/client.ts`
- `/packages/twilio-service/src/services/sms.service.ts`
- `/packages/twilio-service/src/__tests__/sms.test.ts`
- `/packages/twilio-service/package.json`

### Worker Files

- `/apps/worker/src/workers/smsWorker.ts`
- `/apps/worker/src/workers/notification/smsAdapter.ts`
- `/apps/worker/.env.example`

### Web App Files

- `/apps/web/src/lib/services/sms.service.ts`
- `/apps/web/src/routes/api/sms/verify/+server.ts`
- `/apps/web/src/routes/api/sms/verify/confirm/+server.ts`
- `/apps/web/src/routes/api/webhooks/twilio/status/+server.ts`
- `/apps/web/src/lib/components/settings/SMSPreferences.svelte`
- `/apps/web/src/lib/components/settings/PhoneVerification.svelte`

### Database Files

- `/apps/web/supabase/migrations/20250928_add_sms_messaging_tables.sql`
- `/apps/web/supabase/migrations/20251006_sms_notification_channel_phase1.sql`

### Documentation Files

- `/docs/integrations/twilio/README.md`
- `/docs/guides/sms-setup-guide.md`
- `/docs/guides/sms-testing-guide.md`
- `/docs/api/sms-api-reference.md`
- `/docs/architecture/SMS_NOTIFICATION_CHANNEL_DESIGN.md`
- `/docs/testing/SMS_NOTIFICATION_TESTING_GUIDE.md`

---

_End of Research Document_
