<!-- docs/api/sms-api-reference.md -->

# SMS API Reference

## Overview

This document provides a complete reference for all SMS-related APIs in the BuildOS platform, including REST endpoints, database functions, and service methods.

## REST API Endpoints

### Phone Verification

#### POST `/api/sms/verify`

Start phone number verification process.

**Authentication:** Required

**Request Body:**

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
	"verificationSid": "VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**Error Responses:**

- `400` - Invalid phone number format
- `401` - Unauthorized
- `429` - Too many verification attempts

---

#### POST `/api/sms/verify/confirm`

Confirm phone verification with code.

**Authentication:** Required

**Request Body:**

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

**Error Responses:**

- `400` - Invalid code or phone number
- `401` - Unauthorized

---

### Webhooks

#### POST `/api/webhooks/twilio/status`

Receive delivery status updates from Twilio.

**Authentication:** Twilio Signature Validation

**Headers:**

- `X-Twilio-Signature`: Signature for request validation

**Request Body (Form Data):**

```
MessageSid=SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MessageStatus=delivered|sent|failed|undelivered
ErrorCode=30003 (optional)
ErrorMessage=Error description (optional)
```

**Query Parameters:**

- `message_id`: Internal message ID
- `user_id`: User who sent the message

**Response:**

```json
{
	"success": true
}
```

## Frontend Service Methods

### SMSService Class

Located at: `apps/web/src/lib/services/sms.service.ts`

#### `sendSMS(params: SendSMSParams)`

Send an SMS message.

**Parameters:**

```typescript
interface SendSMSParams {
	userId: string;
	phoneNumber: string;
	message: string;
	templateKey?: string;
	templateVars?: Record<string, any>;
	priority?: 'low' | 'normal' | 'high' | 'urgent';
	scheduledFor?: Date;
	metadata?: Record<string, any>;
}
```

**Returns:**

```typescript
Promise<ServiceResponse<{ messageId: string }>>;
```

---

#### `sendTaskReminder(taskId: string)`

**DEPRECATED**: This method is deprecated. Task reminders were never fully implemented and the feature has been removed.

Send a reminder for a specific task.

**Parameters:**

- `taskId`: UUID of the task

**Returns:**

```typescript
Promise<ServiceResponse<{ messageId: string }>>;
```

**Note**: This method will return an error. Use calendar event reminders (`event_reminders_enabled`) for time-based SMS notifications instead.

---

#### `verifyPhoneNumber(phoneNumber: string)`

Start phone verification process.

**Parameters:**

- `phoneNumber`: Phone number to verify

**Returns:**

```typescript
Promise<ServiceResponse<{ verificationSent: boolean }>>;
```

---

#### `confirmVerification(phoneNumber: string, code: string)`

Confirm verification with code.

**Parameters:**

- `phoneNumber`: Phone number being verified
- `code`: 6-digit verification code

**Returns:**

```typescript
Promise<ServiceResponse<{ verified: boolean }>>;
```

---

#### `getSMSMessages(userId: string)`

Get SMS message history for a user.

**Parameters:**

- `userId`: User UUID

**Returns:**

```typescript
Promise<ServiceResponse<{ messages: SMSMessage[] }>>;
```

---

#### `getSMSPreferences(userId: string)`

Get user SMS preferences.

**Parameters:**

- `userId`: User UUID

**Returns:**

```typescript
Promise<ServiceResponse<{ preferences: SMSPreferences }>>;
```

---

#### `updateSMSPreferences(userId: string, preferences: Partial<SMSPreferences>)`

Update user SMS preferences.

**Parameters:**

- `userId`: User UUID
- `preferences`: Partial preferences object

**Returns:**

```typescript
Promise<ServiceResponse<{ updated: boolean }>>;
```

---

#### `optOut(userId: string)`

Opt user out of all SMS notifications.

**Parameters:**

- `userId`: User UUID

**Returns:**

```typescript
Promise<ServiceResponse<{ optedOut: boolean }>>;
```

## Backend Service Methods

### TwilioClient Class

Located at: `packages/twilio-service/src/client.ts`

#### `sendSMS(params: SendSMSParams)`

Send SMS via Twilio API.

**Parameters:**

```typescript
interface SendSMSParams {
	to: string;
	body: string;
	scheduledAt?: Date;
	metadata?: Record<string, any>;
}
```

**Returns:**

```typescript
Promise<MessageInstance>;
```

**Throws:**

- `Error` - Invalid phone number (code 21211)
- `Error` - Message too long (code 21610)
- `Error` - Phone not SMS capable (code 21614)

---

#### `verifyPhoneNumber(phoneNumber: string)`

Send verification code.

**Parameters:**

- `phoneNumber`: Phone number to verify

**Returns:**

```typescript
Promise<{ verificationSid: string }>;
```

---

#### `checkVerification(phoneNumber: string, code: string)`

Verify code.

**Parameters:**

- `phoneNumber`: Phone number
- `code`: Verification code

**Returns:**

```typescript
Promise<boolean>;
```

---

#### `getMessageStatus(messageSid: string)`

Get Twilio message status.

**Parameters:**

- `messageSid`: Twilio message SID

**Returns:**

```typescript
Promise<string>;
```

---

#### `cancelScheduledMessage(messageSid: string)`

Cancel a scheduled message.

**Parameters:**

- `messageSid`: Twilio message SID

**Returns:**

```typescript
Promise<void>;
```

## Database Functions

### `queue_sms_message`

Queue an SMS message for sending.

**SQL Function:**

```sql
queue_sms_message(
  p_user_id UUID,
  p_phone_number TEXT,
  p_message TEXT,
  p_priority sms_priority DEFAULT 'normal',
  p_scheduled_for TIMESTAMPTZ DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS UUID
```

**Parameters:**

- `p_user_id`: User sending the message
- `p_phone_number`: Recipient phone number
- `p_message`: Message content
- `p_priority`: Message priority (low|normal|high|urgent)
- `p_scheduled_for`: Optional scheduled send time
- `p_metadata`: Optional metadata JSON

**Returns:** Message ID (UUID)

**Example:**

```sql
SELECT queue_sms_message(
  p_user_id := auth.uid(),
  p_phone_number := '+15551234567',
  p_message := 'Your task is due soon!',
  p_priority := 'high'::sms_priority,
  p_scheduled_for := NOW() + INTERVAL '1 hour'
);
```

## Type Definitions

### SMS Status Enum

```typescript
type SMSStatus =
	| 'pending'
	| 'queued'
	| 'sending'
	| 'sent'
	| 'delivered'
	| 'failed'
	| 'undelivered'
	| 'scheduled'
	| 'cancelled';
```

### SMS Priority Enum

```typescript
type SMSPriority = 'low' | 'normal' | 'high' | 'urgent';
```

### SMSMessage Type

```typescript
interface SMSMessage {
	id: string;
	user_id: string;
	phone_number: string;
	message_content: string;
	template_id?: string;
	template_vars?: Record<string, any>;
	status: SMSStatus;
	priority: SMSPriority;
	scheduled_for?: Date;
	sent_at?: Date;
	delivered_at?: Date;
	twilio_sid?: string;
	twilio_status?: string;
	twilio_error_code?: number;
	twilio_error_message?: string;
	attempt_count: number;
	max_attempts: number;
	queue_job_id?: string;
	project_id?: string;
	task_id?: string;
	metadata?: Record<string, any>;
	created_at: Date;
	updated_at: Date;
}
```

### SMSTemplate Type

```typescript
interface SMSTemplate {
	id: string;
	template_key: string;
	name: string;
	description?: string;
	message_template: string;
	template_vars?: Record<string, any>;
	required_vars?: string[];
	max_length: number;
	is_active: boolean;
	usage_count: number;
	last_used_at?: Date;
	created_by?: string;
	created_at: Date;
	updated_at: Date;
}
```

### SMSPreferences Type

```typescript
interface SMSPreferences {
	id: string;
	user_id: string;
	phone_number?: string;
	phone_verified: boolean;
	phone_verified_at?: Date;
	// Working features
	event_reminders_enabled: boolean; // Calendar event reminders
	event_reminder_lead_time_minutes: number;
	// Future features (UI ready, worker not implemented)
	morning_kickoff_enabled: boolean;
	morning_kickoff_time?: string;
	evening_recap_enabled: boolean;
	// Safety controls
	quiet_hours_start?: string;
	quiet_hours_end?: string;
	daily_sms_limit: number;
	daily_sms_count: number;
	daily_count_reset_at?: Date;
	opted_out: boolean;
	opted_out_at?: Date;
	opt_out_reason?: string;
	created_at: Date;
	updated_at: Date;
}
```

**DEPRECATED FIELDS** (removed 2025-10-29):

- `task_reminders` - Never implemented
- `daily_brief_sms` - Use `user_notification_preferences.should_sms_daily_brief` instead
- `next_up_enabled` - Never implemented
- `timezone` - Use `users.timezone` instead

See [SMS Deprecation Migration Plan](/thoughts/shared/research/2025-10-13_17-40-27_sms-flow-deprecation-migration-plan.md) for migration details.

## Error Codes

### Twilio Error Codes

| Code  | Description             | Action                 |
| ----- | ----------------------- | ---------------------- |
| 21211 | Invalid phone number    | Validate format        |
| 21610 | Message too long        | Shorten message        |
| 21614 | Phone not SMS capable   | Use different number   |
| 20003 | Authentication failure  | Check credentials      |
| 20429 | Rate limit exceeded     | Retry later            |
| 30003 | Unreachable destination | Check number validity  |
| 30004 | Message blocked         | Review content         |
| 30005 | Unknown destination     | Verify country support |
| 30006 | Landline not supported  | Use mobile number      |
| 30007 | Carrier violation       | Review message content |
| 30008 | Unknown error           | Contact support        |

### Application Error Codes

| Code   | Description          | Resolution            |
| ------ | -------------------- | --------------------- |
| SMS001 | Phone not verified   | Complete verification |
| SMS002 | User opted out       | Re-enable in settings |
| SMS003 | Daily limit exceeded | Wait for reset        |
| SMS004 | Quiet hours active   | Wait or mark urgent   |
| SMS005 | Template not found   | Check template key    |
| SMS006 | Invalid phone format | Use E.164 format      |
| SMS007 | Duplicate phone      | Use different number  |

## Rate Limits

### API Endpoints

- Phone verification: 5 attempts per hour per user
- SMS sending: 10 per minute, 100 per hour per user
- Status webhooks: Unlimited (from Twilio)

### Database Functions

- `queue_sms_message`: 100 calls per minute per user
- Queue processing: 10 concurrent messages

### Twilio Limits

- Verify API: 5 attempts per phone number per hour
- SMS API: Depends on account tier (typically 1 msg/sec)
- Scheduled messages: Maximum 7 days in advance

## Security Headers

### Required for Webhooks

```http
X-Twilio-Signature: base64_encoded_signature
```

### Required for API Calls

```http
Authorization: Bearer <supabase_jwt_token>
Content-Type: application/json
```

## Testing

### Test Phone Numbers (Twilio Test Credentials)

- `+15005550006`: Valid number (success)
- `+15005550001`: Invalid number (error)
- `+15005550009`: SMS not capable (error)

### Test Verification Codes

- `123456`: Always succeeds in test mode
- `000000`: Always fails in test mode

### Example Test Requests

#### Start Verification (cURL)

```bash
curl -X POST https://your-domain.com/api/sms/verify \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+15551234567"}'
```

#### Queue SMS (SQL)

```sql
-- Test SMS queueing
SELECT queue_sms_message(
  p_user_id := (SELECT id FROM auth.users LIMIT 1),
  p_phone_number := '+15005550006',
  p_message := 'Test message',
  p_priority := 'normal'::sms_priority
);
```

## Performance Considerations

### Caching

- Template cache: 5 minutes TTL
- User preferences: 1 minute TTL
- Message status: No cache (real-time)

### Indexes

```sql
-- Optimize message queries
CREATE INDEX idx_sms_messages_user_status
ON sms_messages(user_id, status);

CREATE INDEX idx_sms_messages_scheduled
ON sms_messages(scheduled_for)
WHERE status IN ('pending', 'scheduled');

-- Optimize template lookups
CREATE INDEX idx_sms_templates_key
ON sms_templates(template_key)
WHERE is_active = true;
```

### Query Optimization

- Batch message sending when possible
- Use partial indexes for scheduled messages
- Limit message history queries to 50 records

## Migration Guide

### From Email-Only to SMS+Email

1. Run database migration
2. Add Twilio credentials
3. Update worker configuration
4. Enable SMS in user preferences
5. Test with small user group
6. Roll out to all users

### Upgrading Templates

```sql
-- Migrate existing templates
INSERT INTO sms_templates (template_key, name, message_template)
SELECT
  'email_' || template_key,
  name,
  LEFT(email_body, 160)
FROM email_templates
WHERE is_active = true;
```

## Compliance

### TCPA Compliance

- Obtain explicit consent before sending
- Include opt-out in every message
- Honor opt-out requests immediately
- Maintain consent records

### GDPR Compliance

- Store minimal personal data
- Encrypt phone numbers at rest
- Provide data export capability
- Support right to deletion

### Message Content Guidelines

- Identify your business
- State message purpose
- Include opt-out instructions
- Avoid spam trigger words
- Keep under 160 characters
