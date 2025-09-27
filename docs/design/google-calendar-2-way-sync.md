# Google Calendar Webhook Integration - Implementation Guide

## Overview

This implementation provides two-way synchronization between Google Calendar and the task management system. When users make changes to events in Google Calendar (date/time changes or deletions), those changes automatically sync back to the associated tasks.

## Key Features

- ✅ Automatic webhook registration on calendar connection
- ✅ Two-way sync for date/time changes
- ✅ Event deletion sync
- ✅ Prevention of sync loops
- ✅ Automatic webhook renewal
- ✅ Security token verification

## Database Schema

### Required Tables

```sql
-- 1. Webhook channel tracking table
CREATE TABLE calendar_webhook_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id VARCHAR(255) NOT NULL UNIQUE,
    resource_id VARCHAR(255),
    calendar_id VARCHAR(255) DEFAULT 'primary',
    expiration BIGINT NOT NULL,
    sync_token VARCHAR(255),
    webhook_token VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, calendar_id)
);

CREATE INDEX idx_webhook_channels_channel_id ON calendar_webhook_channels(channel_id);
CREATE INDEX idx_webhook_channels_expiration ON calendar_webhook_channels(expiration);

-- 2. Add sync tracking columns to task_calendar_events
ALTER TABLE task_calendar_events
ADD COLUMN IF NOT EXISTS sync_source VARCHAR(50) DEFAULT 'app',
ADD COLUMN IF NOT EXISTS sync_version INTEGER DEFAULT 1;
```

### Existing Required Tables

- `users` - User accounts
- `tasks` - Task records with `start_date` and `duration_minutes` columns
- `task_calendar_events` - Links tasks to Google Calendar events
- `user_calendar_tokens` - Stores Google OAuth tokens

## Core Services

### 1. CalendarWebhookService (`src/lib/services/calendar-webhook-service.ts`)

**Purpose**: Manages webhook lifecycle and sync operations

**Key Methods**:

- `registerWebhook(userId, webhookUrl, calendarId)` - Registers a new webhook with Google
- `handleWebhookNotification(channelId, resourceId, token, headers)` - Processes incoming webhooks
- `syncCalendarChanges(userId, calendarId, syncToken)` - Fetches and processes calendar changes
- `unregisterWebhook(userId, calendarId)` - Removes webhook registration
- `renewExpiringWebhooks(webhookUrl)` - Renews webhooks before expiration

**Critical Implementation Details**:

- Generates unique channel IDs: `channel-${userId}-${Date.now()}`
- Creates security tokens using crypto.randomBytes
- Sets 7-day expiration (Google max is 30 days)
- Stores webhook info in `calendar_webhook_channels` table
- Handles sync token for incremental updates

### 2. CalendarService Updates (`src/lib/services/calendar-service.ts`)

**Required Addition**:

```typescript
private async markAppInitiatedChange(eventId: string, userId: string): Promise<void> {
    const { data: taskEvent } = await this.supabase
        .from('task_calendar_events')
        .select('id')
        .eq('calendar_event_id', eventId)
        .eq('user_id', userId)
        .single();

    if (taskEvent) {
        await this.supabase
            .from('task_calendar_events')
            .update({
                sync_source: 'app',
                updated_at: new Date().toISOString()
            })
            .eq('id', taskEvent.id);
    }
}
```

**Call this method** after any app-initiated calendar changes in:

- `scheduleTask()` - After creating calendar event
- `updateCalendarEvent()` - After updating event
- `deleteCalendarEvent()` - After deleting event

## API Endpoints

### 1. Webhook Receiver (`src/routes/webhooks/calendar-events/+server.ts`)

**Purpose**: Receives and processes Google Calendar webhook notifications

**HTTP Methods**:

- `POST` - Handles webhook notifications from Google
- `GET` - Responds to Google's webhook verification challenge

**Security**:

- Verifies webhook token matches stored token
- Validates channel and resource IDs
- Uses service role for database operations

**Headers from Google**:

- `x-goog-channel-id` - Channel identifier
- `x-goog-resource-id` - Resource identifier
- `x-goog-resource-state` - Event state (sync/exists/not_exists)
- `x-goog-channel-token` - Security token

### 2. Calendar OAuth Callback (`src/routes/auth/google/calendar-callback/+page.server.ts`)

**Updates Required**:

1. Import `CalendarWebhookService`
2. After successful token exchange, register webhook:

```typescript
const webhookService = new CalendarWebhookService(supabase);
const webhookUrl = `${url.origin}/webhooks/calendar-events`;
await webhookService.registerWebhook(user.id, webhookUrl, 'primary');
```

### 3. Calendar Disconnection

**Location**: Where `disconnectCalendar` action is defined

**Updates Required**:

```typescript
// Unregister webhook before disconnecting
const webhookService = new CalendarWebhookService(supabase);
await webhookService.unregisterWebhook(user.id, 'primary');
await calendarService.disconnectCalendar(user.id);
```

### 4. Webhook Renewal Cron (`src/routes/api/cron/renew-webhooks/+server.ts`)

**Purpose**: Renews webhooks before they expire

**Security**: Requires `PRIVATE_CRON_SECRET` in Authorization header

**Schedule**: Should run daily

## Environment Variables

### Required

```bash
# Google OAuth (existing)
PRIVATE_GOOGLE_CLIENT_ID=your-client-id
PRIVATE_GOOGLE_CLIENT_SECRET=your-client-secret

# Supabase (existing)
PUBLIC_SUPABASE_URL=your-supabase-url
PRIVATE_SUPABASE_SERVICE_KEY=your-service-role-key

# New for webhooks
PRIVATE_CRON_SECRET=secure-random-string-for-cron-auth
```

## Sync Logic

### Preventing Sync Loops

The system prevents infinite sync loops using the `sync_source` field:

1. **App → Google**: When app updates calendar, sets `sync_source = 'app'`
2. **Google → App**: When processing webhook, checks if `sync_source = 'app'` and `updated_at` is within 60 seconds
3. If recent app change detected, skips processing to prevent loop

### Event Processing Flow

1. **Webhook Received** → Verify security token
2. **Fetch Changes** → Use sync token for incremental updates
3. **Process Each Event**:
    - If deleted (`status = 'cancelled'`) → Delete `task_calendar_event`
    - If updated → Update task `start_date` and `duration_minutes`
4. **Update Sync Token** → Store for next incremental sync

### Data Synchronization

**What Syncs from Google → App**:

- Event start time → `tasks.start_date`
- Event end time → Calculates duration → `tasks.duration_minutes`
- Event deletion → Removes `task_calendar_events` record
- Event title → `task_calendar_events.event_title`

**What Does NOT Sync**:

- Event description changes
- Event color changes
- Attendee changes
- Recurring event modifications

## Setup Checklist

### Development Environment

- [ ] Run database migrations (create tables and indexes)
- [ ] Add `PRIVATE_CRON_SECRET` to `.env.local`
- [ ] Install ngrok for local testing (optional)
- [ ] Add ngrok domain to Google OAuth authorized domains (if using)

### Production Deployment

- [ ] **Domain Verification** (CRITICAL):
    1. Go to [Google Search Console](https://search.google.com/search-console)
    2. Add your domain
    3. Verify ownership (DNS TXT record recommended)
    4. Wait for verification confirmation

- [ ] Ensure HTTPS is enabled (required for webhooks)
- [ ] Set up daily cron job to call `/api/cron/renew-webhooks`
- [ ] Add production domain to Google OAuth authorized redirect URIs
- [ ] Set all environment variables in production

## Testing Guide

### Local Testing with ngrok

```bash
# 1. Start dev server
npm run dev

# 2. Start ngrok tunnel
ngrok http 5173

# 3. Use ngrok URL for webhook registration
# Update webhook URL to use ngrok domain
```

### Manual Testing Steps

1. **Connect Calendar**:
    - Navigate to profile settings
    - Click "Connect Calendar"
    - Complete OAuth flow
    - Verify `calendar_webhook_channels` record created

2. **Test Date/Time Sync**:
    - Create task and schedule to calendar via app
    - Note the task ID and calendar event ID
    - Open Google Calendar
    - Change event time
    - Wait 5-10 seconds
    - Check if task `start_date` and `duration_minutes` updated

3. **Test Deletion Sync**:
    - Delete event in Google Calendar
    - Wait 5-10 seconds
    - Verify `task_calendar_events` record removed

4. **Verify No Sync Loops**:
    - Update task time via app
    - Check Google Calendar updated
    - Verify task doesn't get re-updated from webhook

### Debug Queries

```sql
-- Check webhook registrations
SELECT * FROM calendar_webhook_channels WHERE user_id = 'USER_ID';

-- Check recent sync activity
SELECT * FROM task_calendar_events
WHERE user_id = 'USER_ID'
ORDER BY updated_at DESC
LIMIT 10;

-- Check for sync issues
SELECT tce.*, t.title, t.start_date, t.duration_minutes
FROM task_calendar_events tce
JOIN tasks t ON t.id = tce.task_id
WHERE tce.user_id = 'USER_ID'
AND tce.sync_status != 'synced';
```

## Common Issues and Solutions

### Issue: Webhook not firing

**Check**:

- Domain verified in Google Search Console?
- URL is HTTPS?
- Webhook not expired? (check database)
- No firewall blocking Google's requests?

### Issue: "Unauthorized webhook callback channel"

**Solution**: Verify domain ownership in Google Search Console

### Issue: Sync loops occurring

**Check**:

- `markAppInitiatedChange()` called after app updates?
- Time window in sync loop prevention (60 seconds)?
- `sync_source` field being set correctly?

### Issue: 410 errors in logs

**Meaning**: Sync token expired
**Solution**: Automatic - system performs full sync and gets new token

## Monitoring Recommendations

1. **Log these events**:
    - Webhook registration success/failure
    - Webhook notification received
    - Number of events processed per sync
    - Sync token expiration/renewal
    - Any 4xx/5xx errors from Google API

2. **Set up alerts for**:
    - Webhook registration failures
    - High number of sync conflicts
    - Expired webhooks not renewing

3. **Track metrics**:
    - Average sync latency
    - Number of active webhooks
    - Sync success rate
    - Events processed per day

## Security Considerations

1. **Webhook Token**: Generated using crypto.randomBytes(32) for each channel
2. **State Validation**: OAuth state parameter verified against user ID
3. **Service Role**: Webhook endpoint uses service role for database operations
4. **HTTPS Required**: Google only sends webhooks to HTTPS endpoints
5. **Domain Verification**: Prevents unauthorized webhook registrations

## Architecture Decisions

1. **7-day expiration**: Balances API limits with reliability
2. **Sync token approach**: Enables incremental updates vs full sync
3. **60-second window**: Prevents sync loops while allowing quick updates
4. **Primary calendar only**: Simplifies implementation, can extend later
5. **Separate webhook table**: Allows multiple calendars per user in future

## Future Enhancements

- [ ] Support multiple calendars per user
- [ ] Sync event description and other metadata
- [ ] Handle recurring event modifications
- [ ] Add manual sync button for users
- [ ] Implement retry logic for failed syncs
- [ ] Add sync history/audit log
- [ ] Support for calendar-specific preferences

---

## Quick Validation Script

Run this to verify implementation:

```typescript
// Test script to validate implementation
async function validateWebhookImplementation() {
	const checks = {
		'Database tables exist': await checkDatabaseTables(),
		'CalendarWebhookService exists': fs.existsSync(
			'./src/lib/services/calendar-webhook-service.ts'
		),
		'Webhook endpoint exists': fs.existsSync(
			'./src/routes/webhooks/calendar-events/+server.ts'
		),
		'Cron endpoint exists': fs.existsSync('./src/routes/api/cron/renew-webhooks/+server.ts'),
		'markAppInitiatedChange implemented': await checkMarkAppInitiatedChange(),
		'Environment variables set': process.env.PRIVATE_CRON_SECRET !== undefined,
		'Domain verified': await checkDomainVerification()
	};

	console.table(checks);
	return Object.values(checks).every((v) => v === true);
}
```

This implementation provides a robust, secure, and scalable two-way sync between Google Calendar and your task management system.
