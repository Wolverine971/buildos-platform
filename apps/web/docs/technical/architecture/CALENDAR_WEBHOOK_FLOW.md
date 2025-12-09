<!-- apps/web/docs/technical/architecture/CALENDAR_WEBHOOK_FLOW.md -->

# Calendar Webhook Service Documentation

## Overview

The Calendar Webhook Service (`calendar-webhook-service.ts`) provides bidirectional synchronization between Build OS tasks and Google Calendar events through webhook notifications. It ensures real-time updates while preventing sync loops.

## Architecture

```
Google Calendar → Webhook → Build OS → Database
                     ↓
              Process Changes
                     ↓
              Update Tasks
```

## Core Components

### 1. Webhook Registration

When a user connects their Google Calendar:

```typescript
registerWebhook(userId, webhookUrl, calendarId)
  ├─ Generate unique channel ID & security token
  ├─ Register webhook with Google Calendar API
  ├─ Store channel info in `calendar_webhook_channels` table
  └─ Perform initial sync to get sync token
```

**Key Features:**

- 7-day expiration (renewable)
- Unique security token per channel
- Automatic initial sync

### 2. Webhook Notification Handling

When Google Calendar sends a notification:

```typescript
handleWebhookNotification(channelId, resourceId, token, headers)
  ├─ Verify channel exists in database
  ├─ Validate security token
  ├─ Check resource state (sync vs changes)
  └─ Process calendar changes
```

**Security:**

- Token validation prevents unauthorized access
- Channel verification ensures legitimate source
- Resource state filtering avoids unnecessary processing

### 3. Sync Process

#### Incremental Sync (Normal Operation)

```typescript
syncCalendarChanges(userId, calendarId, syncToken)
  ├─ Fetch changes since last sync using sync token
  ├─ Filter events created after user account creation
  ├─ Process batch of changes
  └─ Update sync token for next sync
```

#### Full Resync (Token Expiration Recovery)

```typescript
performFullResync(userId, calendarId)
  ├─ Fetch all events from user creation date
  ├─ Process all relevant events
  ├─ Get fresh sync token
  └─ Update database with new token
```

## Sync Loop Prevention

### The Challenge

When Build OS updates Google Calendar, Google sends a webhook notification back, which could cause an infinite loop.

### The Solution

1. **Source Tracking:**
    - App changes: `sync_source: 'app'`
    - Google changes: `sync_source: 'google'`

2. **Time Window Check:**

    ```typescript
    const SYNC_LOOP_PREVENTION_WINDOW = 5 * 60 * 1000; // 5 minutes

    if (
    	taskEvent.sync_source === 'app' &&
    	new Date(taskEvent.updated_at) > Date.now() - SYNC_LOOP_PREVENTION_WINDOW
    ) {
    	// Skip - this is our own change echoing back
    	continue;
    }
    ```

3. **Why 5 Minutes?**
    - Webhook delivery can be delayed
    - Network latency considerations
    - Google's processing time
    - Safety margin for distributed systems

## Event Processing

### Batch Processing Flow

```typescript
processBatchEventChanges(userId, events, calendarId)
  ├─ Query all task_calendar_events for event IDs
  ├─ Build lookup map for O(1) access
  ├─ Process each event
  │   ├─ Check sync loop prevention
  │   ├─ Handle deletions (cancelled events)
  │   ├─ Handle recurring event changes
  │   └─ Handle date/time updates
  └─ Execute batch database updates
```

### Event Type Handling

#### 1. Regular Event Updates

- Time/date changes → Update task start_date and duration
- Title changes → Update task title
- Deletion → Remove task_calendar_event record

#### 2. Recurring Event Updates

- Master event RRULE changes → Update task recurrence pattern
- Single instance modification → Create exception record
- Instance cancellation → Mark in recurring_task_instances

#### 3. Exception Handling

```typescript
// Modified instance detection
if (event.recurringEventId && !taskEvent.is_master_event) {
	// Create exception record
	await createExceptionRecord(event, taskEvent);
}
```

## Database Schema

### calendar_webhook_channels

```sql
- user_id: string
- channel_id: string (unique per registration)
- resource_id: string (from Google)
- calendar_id: string (usually 'primary')
- expiration: number (timestamp)
- sync_token: string (for incremental sync)
- webhook_token: string (security token)
```

### task_calendar_events

```sql
- id: string
- task_id: string
- calendar_event_id: string
- sync_source: 'app' | 'google'
- sync_status: 'synced' | 'error' | 'deleted'
- sync_version: number
- is_master_event: boolean
- is_exception: boolean
- recurrence_rule: string (RRULE)
```

## Rate Limiting & Resilience

### Exponential Backoff

```typescript
executeWithBackoff(fn, retryCount)
  ├─ Try operation
  ├─ On 429/403 quota error
  │   ├─ Calculate backoff: initialDelay * factor^retryCount
  │   ├─ Add jitter (0-25% random delay)
  │   └─ Retry up to maxRetries
  └─ Return result or throw
```

**Configuration:**

- Max retries: 5
- Initial delay: 1 second
- Max delay: 60 seconds
- Backoff factor: 2

## Webhook Lifecycle

### Registration

1. User connects Google Calendar
2. Register webhook with 7-day expiration
3. Store channel info
4. Perform initial sync

### Renewal

```typescript
renewExpiringWebhooks(webhookUrl)
  ├─ Find webhooks expiring in 24 hours
  ├─ Perform final sync
  ├─ Unregister old webhook
  └─ Register new webhook
```

### Health Monitoring

```typescript
checkAndRepairWebhook(userId, calendarId, webhookUrl)
  ├─ Check expiration
  ├─ Validate sync token
  ├─ Repair if needed
  └─ Return health status
```

## Error Recovery

### Sync Token Expiration (410 Error)

1. Detect 410 error or "sync token expired" message
2. Trigger full resync automatically
3. Get new sync token
4. Continue normal operation

### Authentication Failures

1. Detect 401 error
2. Mark webhook as unhealthy
3. Notify user to reauthorize
4. Pause sync until reauthorized

### Partial Sync Failures

- Process what we can
- Log errors for failed events
- Continue with remaining events
- Return partial success status

## Best Practices

### DO:

- ✅ Always validate webhook tokens
- ✅ Use batch processing for efficiency
- ✅ Implement exponential backoff
- ✅ Track sync_source to prevent loops
- ✅ Handle token expiration gracefully
- ✅ Log detailed information for debugging

### DON'T:

- ❌ Process events older than user creation
- ❌ Create tasks from Google events (one-way for now)
- ❌ Ignore rate limits
- ❌ Process sync notifications as changes
- ❌ Trust external event IDs without validation

## Monitoring & Debugging

### Key Log Points

```typescript
console.log('[WEBHOOK] Received notification:', {...});
console.log('[SYNC] Starting syncCalendarChanges:', {...});
console.log('[BATCH_PROCESS] Processing events:', {...});
console.log('[RESYNC] Full resync triggered:', {...});
```

### Health Check Endpoints

- `GET /api/calendar/webhook/health` - Check webhook status
- `POST /api/calendar/webhook/resync` - Trigger manual resync
- `GET /api/calendar/webhook/status` - Get sync statistics

## Common Issues & Solutions

### Issue: Events not syncing from Google

**Solution:** Check webhook registration and sync token validity

### Issue: Duplicate events appearing

**Solution:** Verify sync_source tracking and time window

### Issue: Rate limit errors

**Solution:** Exponential backoff is automatic, check quota usage

### Issue: Old events being processed

**Solution:** Verify user creation date filtering

## Performance Considerations

1. **Batch Processing:** Process multiple events in single database transaction
2. **Map Lookups:** O(1) event lookup instead of O(n) array search
3. **Incremental Sync:** Only fetch changes since last sync
4. **Client-side Filtering:** Filter old events after fetch when using sync token
5. **Connection Pooling:** Reuse OAuth clients

## Security

1. **Token Validation:** Every webhook verified against stored token
2. **User Isolation:** Changes only affect authenticated user's data
3. **HTTPS Only:** Webhook URL must be HTTPS
4. **Time-limited Channels:** 7-day expiration limits exposure
5. **Audit Logging:** All sync operations logged with timestamps
