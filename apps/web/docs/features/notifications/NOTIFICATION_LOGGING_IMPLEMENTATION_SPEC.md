# Notification Logging System - Implementation Specification

**Status**: 🔴 Not Started
**Priority**: High
**Owner**: TBD
**Estimated Effort**: 2-3 weeks
**Created**: 2025-10-10
**Last Updated**: 2025-10-10

## Table of Contents

1. [Overview](#overview)
2. [Current State Analysis](#current-state-analysis)
3. [Architecture](#architecture)
4. [Implementation Phases](#implementation-phases)
5. [Database Schema Updates](#database-schema-updates)
6. [Code Examples](#code-examples)
7. [Migration Strategy](#migration-strategy)
8. [Testing Requirements](#testing-requirements)
9. [Monitoring & Alerting](#monitoring--alerting)
10. [Success Metrics](#success-metrics)

---

## Overview

### Problem Statement

The BuildOS notification system lacks comprehensive logging infrastructure, making it difficult to:

- Track notification delivery rates and failures
- Debug notification issues across web and worker
- Calculate accurate open/click rates
- Trace notifications across the full lifecycle
- Identify patterns in notification failures

### Objectives

1. **Unified Logging**: Single shared logger across web and worker apps
2. **Accurate Tracking**: Log all notification lifecycle events (created → queued → sent → delivered → opened → clicked)
3. **Correlation**: Track notifications from trigger to delivery with correlation IDs
4. **Visibility**: Real-time visibility into notification system health
5. **Analytics**: Accurate data for `/admin/notifications` dashboard

### Success Criteria

- ✅ All notification events logged with structured data
- ✅ Correlation IDs tracked across web → worker → external services
- ✅ Zero silent failures (all errors logged and alertable)
- ✅ Open/click rates tracked for all channels (email, push, SMS, in-app)
- ✅ Admin dashboard shows accurate metrics
- ✅ Average time to debug notification issues reduced by 80%

---

## Current State Analysis

### Existing Logging

**Current Infrastructure:**

- Console logging with emojis throughout codebase
- ActivityLogger (web only) - logs to `user_activity_logs`
- ErrorLoggerService (web only) - logs to `error_logs`
- ProgressTracker (worker only) - console logging with retries
- No shared logging framework
- No correlation IDs

**Gaps Identified:**

1. ❌ No logging in `emit_notification_event()` database function
2. ❌ Email tracking doesn't update `notification_deliveries`
3. ❌ Push/SMS/in-app channels have no open/click tracking
4. ❌ Status updates not atomic (race conditions possible)
5. ❌ Worker marks "sent" before actual delivery
6. ❌ No visibility into subscription matching or channel selection

**See Full Audit**: [`/thoughts/shared/research/2025-10-10_21-00-00_notification-system-audit.md`](/thoughts/shared/research/2025-10-10_21-00-00_notification-system-audit.md)

---

## Architecture

### Shared Logger Design

**Location**: `packages/shared-utils/src/logging/`

**Components:**

- `logger.ts` - Main Logger class with log levels
- `types.ts` - TypeScript interfaces for log entries
- `correlation.ts` - Correlation ID utilities
- `index.ts` - Public exports

**Features:**

- Log levels: debug, info, warn, error, fatal
- Multiple outputs: console, database, HTTP (for external services)
- Context propagation: user IDs, correlation IDs, notification metadata
- Child loggers for namespacing
- Emoji indicators for visual scanning
- Non-blocking database/HTTP logging

### Correlation ID Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        WEB APP (API Endpoint)                    │
│                                                                   │
│  1. Generate correlation ID: correlationId = generateCorrelationId() │
│  2. Log API request: logger.info('Processing request', { correlationId, userId }) │
│  3. Queue job with correlation ID in metadata                    │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                │ correlationId passed in job metadata
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                          WORKER (Job Processor)                  │
│                                                                   │
│  4. Extract correlation ID: const context = extractCorrelationContext(job.metadata) │
│  5. Create child logger: const logger = parentLogger.child('brief', context) │
│  6. Log all operations with correlation ID                       │
│  7. Pass correlation ID to external services (Twilio, Gmail)     │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                │ correlationId in external requests
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                    WEBHOOKS (Status Updates)                     │
│                                                                   │
│  8. Extract correlation ID from URL params or headers            │
│  9. Log webhook event with correlation ID                        │
│  10. Update notification_deliveries with correlation ID          │
└─────────────────────────────────────────────────────────────────┘
```

### Log Entry Structure

```typescript
{
  level: 'info',
  message: 'Notification sent successfully',
  timestamp: '2025-10-10T21:00:00.000Z',
  namespace: 'worker:notification:email',
  context: {
    correlationId: 'uuid-here',
    userId: 'user-uuid',
    notificationEventId: 'event-uuid',
    notificationDeliveryId: 'delivery-uuid',
    eventType: 'brief.completed',
    channel: 'email'
  },
  metadata: {
    duration_ms: 1250,
    emailTrackingId: 'tracking-uuid',
    status: 'sent'
  }
}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

**Goal**: Set up shared logger and integrate into existing code

**Tasks:**

1. ✅ Create shared logger in `packages/shared-utils/src/logging/`
2. ✅ Update `packages/shared-utils/src/index.ts` to export logger
3. ⬜ Install dependencies:
    ```bash
    cd packages/shared-utils
    pnpm add @supabase/supabase-js
    ```
4. ⬜ Create logger instances in web and worker:

    ```typescript
    // apps/web/src/lib/utils/logger.ts
    import { createLogger } from '@buildos/shared-utils';
    import { createServiceClient } from '@buildos/supabase-client';

    export const webLogger = createLogger('web', createServiceClient());
    ```

    ```typescript
    // apps/worker/src/lib/logger.ts
    import { createLogger } from '@buildos/shared-utils';
    import { createServiceClient } from '@buildos/supabase-client';

    export const workerLogger = createLogger('worker', createServiceClient());
    ```

5. ⬜ Test logger in development:
    ```typescript
    const logger = createLogger('test', supabase);
    logger.info('Test message', { userId: 'test-user' });
    logger.error('Test error', new Error('Test'), { userId: 'test-user' });
    ```

**Deliverables:**

- Shared logger package ready for use
- Logger instances created in web and worker
- Basic tests passing

---

### Phase 2: Notification Worker Integration (Week 1-2)

**Goal**: Add comprehensive logging to notification worker

**Tasks:**

#### 2.1 Update notificationWorker.ts

**File**: `apps/worker/src/workers/notification/notificationWorker.ts`

**Changes:**

```typescript
import { workerLogger } from '../../lib/logger.js';
import { generateCorrelationId, createCorrelationContext } from '@buildos/shared-utils';

export async function processNotification(
	job: ProcessingJob<NotificationJobMetadata>
): Promise<void> {
	const { delivery_id, channel } = job.data;

	// Extract or generate correlation ID
	const correlationId = job.data.correlationId || generateCorrelationId();
	const logger = workerLogger.child('notification', { correlationId, jobId: job.id });

	logger.info('Processing notification job', {
		notificationDeliveryId: delivery_id,
		channel
	});

	try {
		// Get delivery record
		const { data: delivery, error: fetchError } = await supabase
			.from('notification_deliveries')
			.select('*')
			.eq('id', delivery_id)
			.single();

		if (fetchError || !delivery) {
			logger.error('Delivery not found', fetchError, {
				notificationDeliveryId: delivery_id
			});
			throw new Error(`Delivery ${delivery_id} not found: ${fetchError?.message}`);
		}

		logger.debug('Delivery record fetched', {
			notificationDeliveryId: delivery_id,
			notificationEventId: delivery.event_id,
			channel: delivery.channel,
			status: delivery.status,
			attempts: delivery.attempts
		});

		// Send notification
		const startTime = Date.now();
		const result = await sendNotification(channel, typedDelivery, logger);
		const duration_ms = Date.now() - startTime;

		if (result.success) {
			logger.info(
				'Notification sent successfully',
				{
					notificationDeliveryId: delivery_id,
					channel,
					externalId: result.external_id
				},
				{
					duration_ms,
					status: 'sent'
				}
			);
		} else {
			logger.error(
				'Notification send failed',
				new Error(result.error),
				{
					notificationDeliveryId: delivery_id,
					channel
				},
				{
					duration_ms,
					status: 'failed'
				}
			);
		}
	} catch (error: any) {
		logger.fatal('Notification job failed', error, {
			notificationDeliveryId: delivery_id,
			channel
		});
		throw error;
	}
}
```

#### 2.2 Update Channel Adapters

**Email Adapter** (`emailAdapter.ts`):

```typescript
export async function sendEmailNotification(
	delivery: NotificationDelivery,
	logger: Logger
): Promise<DeliveryResult> {
	const childLogger = logger.child('email');

	childLogger.info('Formatting email notification', {
		notificationDeliveryId: delivery.id,
		recipientUserId: delivery.recipient_user_id
	});

	try {
		// Get user email
		const { data: user, error: userError } = await supabase
			.from('users')
			.select('email, name')
			.eq('id', delivery.recipient_user_id)
			.single();

		if (userError || !user?.email) {
			childLogger.warn('User email not found', {
				notificationDeliveryId: delivery.id,
				recipientUserId: delivery.recipient_user_id
			});
			return { success: false, error: 'User email not found' };
		}

		childLogger.debug('User email retrieved', {
			recipientEmail: user.email,
			recipientUserId: delivery.recipient_user_id
		});

		// ... rest of email sending logic

		childLogger.info(
			'Email notification sent via webhook',
			{
				notificationDeliveryId: delivery.id,
				emailRecordId: emailRecord.id,
				trackingId
			},
			{
				webhookSuccess: true,
				messageId: webhookResult.messageId
			}
		);

		return {
			success: true,
			external_id: emailRecord.id
		};
	} catch (error: any) {
		childLogger.error('Email notification failed', error, {
			notificationDeliveryId: delivery.id
		});
		return { success: false, error: error.message };
	}
}
```

**SMS Adapter** (`smsAdapter.ts`):

- Add logger parameter
- Log template selection
- Log URL shortening
- Log Twilio queue status

**Push Adapter** (in `notificationWorker.ts`):

- Log subscription lookup
- Log webpush send status
- Log subscription expiration

#### 2.3 Add Correlation ID to Queue Jobs

**File**: `apps/worker/src/workers/brief/briefWorker.ts:356-377`

```typescript
await serviceClient.rpc('emit_notification_event', {
	p_event_type: 'brief.completed',
	p_event_source: 'worker_job',
	p_target_user_id: job.data.userId,
	p_payload: {
		// ... existing payload
		correlationId: job.data.correlationId // ADD THIS
	},
	p_metadata: {
		correlationId: job.data.correlationId // ADD THIS
	},
	p_scheduled_for: notificationScheduledFor?.toISOString()
});
```

**Deliverables:**

- Worker notification processing fully logged
- Correlation IDs tracked from job → delivery → send
- All channel adapters instrumented

---

### Phase 3: Database Function Logging (Week 2)

**Goal**: Add logging to `emit_notification_event()` PostgreSQL function

**Challenges:**

- PostgreSQL functions can't write to console
- Need to log to a database table

**Solution: Create `notification_logs` table**

**Migration**: `apps/web/supabase/migrations/20251011_notification_logs.sql`

```sql
-- Notification system logging table
CREATE TABLE notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_level TEXT NOT NULL CHECK (log_level IN ('debug', 'info', 'warn', 'error')),
  message TEXT NOT NULL,
  namespace TEXT NOT NULL DEFAULT 'db_function',
  correlation_id UUID,
  event_id UUID REFERENCES notification_events(id) ON DELETE CASCADE,
  delivery_id UUID REFERENCES notification_deliveries(id) ON DELETE CASCADE,
  context JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_logs_created_at ON notification_logs(created_at DESC);
CREATE INDEX idx_notification_logs_level ON notification_logs(log_level);
CREATE INDEX idx_notification_logs_correlation_id ON notification_logs(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX idx_notification_logs_event_id ON notification_logs(event_id) WHERE event_id IS NOT NULL;

-- Helper function for logging from database functions
CREATE OR REPLACE FUNCTION log_notification_event(
  p_level TEXT,
  p_message TEXT,
  p_namespace TEXT DEFAULT 'db_function',
  p_correlation_id UUID DEFAULT NULL,
  p_event_id UUID DEFAULT NULL,
  p_delivery_id UUID DEFAULT NULL,
  p_context JSONB DEFAULT '{}'::jsonb,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS void AS $$
BEGIN
  INSERT INTO notification_logs (
    log_level,
    message,
    namespace,
    correlation_id,
    event_id,
    delivery_id,
    context,
    metadata
  ) VALUES (
    p_level,
    p_message,
    p_namespace,
    p_correlation_id,
    p_event_id,
    p_delivery_id,
    p_context,
    p_metadata
  );
END;
$$ LANGUAGE plpgsql;
```

**Update `emit_notification_event()` function**:

```sql
CREATE OR REPLACE FUNCTION emit_notification_event(
  -- ... existing parameters
) RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
  v_subscription RECORD;
  v_delivery_id UUID;
  v_correlation_id UUID;
  v_delivery_count INTEGER := 0;
  v_subscription_count INTEGER := 0;
BEGIN
  -- Extract correlation ID from payload or metadata
  v_correlation_id := COALESCE(
    (p_metadata->>'correlationId')::UUID,
    (p_payload->>'correlationId')::UUID,
    gen_random_uuid()
  );

  -- Log event creation
  PERFORM log_notification_event(
    'info',
    'Creating notification event',
    'emit_notification_event',
    v_correlation_id,
    NULL,
    NULL,
    jsonb_build_object(
      'event_type', p_event_type,
      'event_source', p_event_source,
      'target_user_id', p_target_user_id
    ),
    jsonb_build_object('scheduled_for', p_scheduled_for)
  );

  -- Create event record
  INSERT INTO notification_events (...) VALUES (...)
  RETURNING id INTO v_event_id;

  PERFORM log_notification_event(
    'debug',
    'Notification event created',
    'emit_notification_event',
    v_correlation_id,
    v_event_id
  );

  -- Find subscriptions
  FOR v_subscription IN
    SELECT ...
    FROM notification_subscriptions
    WHERE ...
  LOOP
    v_subscription_count := v_subscription_count + 1;

    -- Log subscription match
    PERFORM log_notification_event(
      'debug',
      'Subscription matched',
      'emit_notification_event',
      v_correlation_id,
      v_event_id,
      NULL,
      jsonb_build_object(
        'subscription_id', v_subscription.id,
        'subscriber_user_id', v_subscription.user_id
      )
    );

    -- Create deliveries for enabled channels
    -- Log each delivery creation
    IF v_prefs.push_enabled THEN
      -- Insert into notification_deliveries
      PERFORM log_notification_event(
        'info',
        'Delivery created',
        'emit_notification_event',
        v_correlation_id,
        v_event_id,
        v_delivery_id,
        jsonb_build_object('channel', 'push', 'recipient_user_id', v_subscription.user_id)
      );
      v_delivery_count := v_delivery_count + 1;
    END IF;

    -- ... repeat for email, SMS, in_app
  END LOOP;

  -- Log summary
  PERFORM log_notification_event(
    'info',
    'Notification event processing complete',
    'emit_notification_event',
    v_correlation_id,
    v_event_id,
    NULL,
    jsonb_build_object('event_type', p_event_type),
    jsonb_build_object(
      'subscriptions_matched', v_subscription_count,
      'deliveries_created', v_delivery_count
    )
  );

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;
```

**Deliverables:**

- `notification_logs` table created
- `log_notification_event()` helper function
- `emit_notification_event()` fully instrumented
- Visibility into subscription matching and delivery creation

---

### Phase 4: Tracking Integration (Week 2)

**Goal**: Connect email/SMS tracking to notification_deliveries table

#### 4.1 Email Tracking Sync

**File**: `apps/web/src/routes/api/email-tracking/[tracking_id]/+server.ts`

**Add after updating `email_recipients`**:

```typescript
import { createLogger } from '@buildos/shared-utils';

const logger = createLogger('api:email-tracking', supabase);

export const GET: RequestHandler = async ({ params, request }) => {
	const { tracking_id } = params;

	try {
		// ... existing email_recipients update logic

		// NEW: Sync to notification_deliveries
		const { data: email, error: emailError } = await supabase
			.from('emails')
			.select('template_data')
			.eq('tracking_id', tracking_id)
			.single();

		const deliveryId = email?.template_data?.delivery_id;

		if (deliveryId) {
			logger.info('Syncing email open to notification_deliveries', {
				trackingId: tracking_id,
				notificationDeliveryId: deliveryId
			});

			const { error: deliveryError } = await supabase
				.from('notification_deliveries')
				.update({
					opened_at: new Date().toISOString(),
					status: 'opened',
					updated_at: new Date().toISOString()
				})
				.eq('id', deliveryId)
				.is('opened_at', null); // Only update first open

			if (deliveryError) {
				logger.error('Failed to sync email open', deliveryError, {
					trackingId: tracking_id,
					notificationDeliveryId: deliveryId
				});
			} else {
				logger.debug('Email open synced successfully', {
					trackingId: tracking_id,
					notificationDeliveryId: deliveryId
				});
			}
		}

		// Return tracking pixel
		return new Response(TRANSPARENT_PNG_BASE64, {
			headers: { 'Content-Type': 'image/png' }
		});
	} catch (error) {
		logger.error('Email tracking failed', error, { trackingId: tracking_id });
		// Return pixel even on error
		return new Response(TRANSPARENT_PNG_BASE64, {
			headers: { 'Content-Type': 'image/png' }
		});
	}
};
```

**Repeat for click tracking** in `/click/+server.ts`

#### 4.2 SMS Link Tracking

**File**: `apps/web/src/routes/l/[short_code]/+server.ts`

**Add logging and notification_deliveries sync**:

```typescript
import { createLogger } from '@buildos/shared-utils';

const logger = createLogger('api:link-tracking', supabase);

export const GET: RequestHandler = async ({ params }) => {
	const { short_code } = params;

	try {
		// Get tracking link
		const { data: link, error } = await supabase
			.from('notification_tracking_links')
			.select('*, notification_deliveries!inner(id, event_id)')
			.eq('short_code', short_code)
			.single();

		if (error || !link) {
			logger.warn('Tracking link not found', { shortCode: short_code });
			return new Response('Not Found', { status: 404 });
		}

		logger.info('SMS link clicked', {
			shortCode: short_code,
			notificationDeliveryId: link.delivery_id,
			destinationUrl: link.destination_url
		});

		// Update click count
		await supabase
			.from('notification_tracking_links')
			.update({
				click_count: link.click_count + 1,
				first_clicked_at: link.first_clicked_at || new Date().toISOString(),
				last_clicked_at: new Date().toISOString()
			})
			.eq('id', link.id);

		// Sync to notification_deliveries
		const { error: deliveryError } = await supabase
			.from('notification_deliveries')
			.update({
				clicked_at: link.first_clicked_at || new Date().toISOString(),
				status: 'clicked',
				updated_at: new Date().toISOString()
			})
			.eq('id', link.delivery_id)
			.is('clicked_at', null); // Only update first click

		if (deliveryError) {
			logger.error('Failed to sync SMS click', deliveryError, {
				shortCode: short_code,
				notificationDeliveryId: link.delivery_id
			});
		}

		// Redirect to destination
		return new Response(null, {
			status: 302,
			headers: { Location: link.destination_url }
		});
	} catch (error) {
		logger.error('Link tracking failed', error, { shortCode: short_code });
		return new Response('Internal Error', { status: 500 });
	}
};
```

**Deliverables:**

- Email tracking synced to notification_deliveries
- SMS tracking synced to notification_deliveries
- Open/click rates accurate in admin dashboard

---

### Phase 5: Analytics Fix & Testing (Week 3)

#### 5.1 Fix Analytics Bug

**File**: `apps/web/supabase/migrations/20251011_fix_notification_analytics.sql`

```sql
-- Fix channel performance "delivered" metric
CREATE OR REPLACE FUNCTION get_notification_channel_performance(
  p_interval INTERVAL DEFAULT '7 days'::interval
) RETURNS TABLE (
  channel TEXT,
  total_sent INTEGER,
  sent INTEGER,        -- NEW: Explicit sent count
  delivered INTEGER,   -- FIXED: Now counts 'delivered' status
  opened INTEGER,
  clicked INTEGER,
  failed INTEGER,
  success_rate NUMERIC,
  open_rate NUMERIC,
  click_rate NUMERIC,
  avg_delivery_time_ms NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    nd.channel,
    COUNT(*)::INTEGER AS total_sent,
    COUNT(*) FILTER (WHERE nd.status = 'sent')::INTEGER AS sent,         -- NEW
    COUNT(*) FILTER (WHERE nd.status = 'delivered')::INTEGER AS delivered, -- FIXED
    COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::INTEGER AS opened,
    COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL)::INTEGER AS clicked,
    COUNT(*) FILTER (WHERE nd.status = 'failed')::INTEGER AS failed,
    ROUND((COUNT(*) FILTER (WHERE nd.status = 'sent') * 100.0 / NULLIF(COUNT(*), 0))::NUMERIC, 2) AS success_rate,
    ROUND((COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL) * 100.0 / NULLIF(COUNT(*) FILTER (WHERE nd.status = 'sent'), 0))::NUMERIC, 2) AS open_rate,
    ROUND((COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL) * 100.0 / NULLIF(COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL), 0))::NUMERIC, 2) AS click_rate,
    AVG(EXTRACT(EPOCH FROM (nd.sent_at - nd.created_at)) * 1000) FILTER (WHERE nd.sent_at IS NOT NULL)::NUMERIC AS avg_delivery_time_ms
  FROM notification_deliveries nd
  WHERE nd.created_at >= NOW() - p_interval
  GROUP BY nd.channel
  ORDER BY total_sent DESC;
END;
$$ LANGUAGE plpgsql STABLE;
```

#### 5.2 Add Delivery Time NULL Checks

**Add to same migration**:

```sql
-- Fix delivery time calculations with explicit NULL filters
CREATE OR REPLACE FUNCTION get_sms_notification_stats()
RETURNS TABLE (
  total_users_with_phone BIGINT,
  users_phone_verified BIGINT,
  users_sms_enabled BIGINT,
  users_opted_out BIGINT,
  phone_verification_rate NUMERIC,
  sms_adoption_rate NUMERIC,
  opt_out_rate NUMERIC,
  total_sms_sent_24h BIGINT,
  sms_delivery_rate_24h NUMERIC,
  avg_sms_delivery_time_seconds NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH sms_24h AS (
    SELECT
      COUNT(*) AS sent_count,
      COUNT(*) FILTER (WHERE status = 'delivered') AS delivered_count,
      AVG(EXTRACT(EPOCH FROM (delivered_at - created_at))) FILTER (WHERE delivered_at IS NOT NULL) AS avg_delivery_seconds  -- FIXED: Added NULL filter
    FROM notification_deliveries
    WHERE channel = 'sms'
      AND created_at >= NOW() - INTERVAL '24 hours'
  )
  SELECT
    -- ... rest of query
    (SELECT avg_delivery_seconds FROM sms_24h)::NUMERIC
  FROM user_sms_preferences;
END;
$$ LANGUAGE plpgsql STABLE;
```

#### 5.3 Testing

**Create test suite**: `apps/web/src/lib/tests/notification-logging.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createLogger } from '@buildos/shared-utils';

describe('Notification Logging', () => {
	it('should log notification creation', async () => {
		const logger = createLogger('test:notification', mockSupabase);

		logger.info('Notification created', {
			notificationEventId: 'test-event-id',
			eventType: 'brief.completed',
			userId: 'test-user'
		});

		// Assert log entry created
		expect(console.log).toHaveBeenCalledWith(
			expect.stringContaining('[test:notification]'),
			expect.objectContaining({
				notificationEventId: 'test-event-id'
			})
		);
	});

	it('should track correlation ID across services', async () => {
		const correlationId = generateCorrelationId();
		const context = createCorrelationContext(correlationId, { userId: 'test-user' });

		expect(context.correlationId).toBe(correlationId);
		expect(context.userId).toBe('test-user');
	});

	it('should sync email tracking to notification_deliveries', async () => {
		// Test email tracking sync
		// ...
	});
});
```

**Manual testing checklist**:

- [ ] Send test email notification, verify logs at each step
- [ ] Open test email, verify `opened_at` synced
- [ ] Click test email link, verify `clicked_at` synced
- [ ] Send test SMS notification, verify logs
- [ ] Click SMS link, verify tracking
- [ ] Check admin dashboard shows accurate metrics
- [ ] Verify correlation IDs appear in logs
- [ ] Test failed notifications log properly

**Deliverables:**

- Analytics bug fixed
- NULL checks added
- Test suite created and passing
- Manual testing completed

---

## Database Schema Updates

### New Tables

#### `notification_logs`

Purpose: Store logs from database functions

```sql
CREATE TABLE notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_level TEXT NOT NULL CHECK (log_level IN ('debug', 'info', 'warn', 'error')),
  message TEXT NOT NULL,
  namespace TEXT NOT NULL DEFAULT 'db_function',
  correlation_id UUID,
  event_id UUID REFERENCES notification_events(id) ON DELETE CASCADE,
  delivery_id UUID REFERENCES notification_deliveries(id) ON DELETE CASCADE,
  context JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes:**

- `idx_notification_logs_created_at` - Query by time
- `idx_notification_logs_level` - Filter by severity
- `idx_notification_logs_correlation_id` - Trace correlation IDs
- `idx_notification_logs_event_id` - Lookup by event

**Retention**: Recommend 90-day retention with partitioning by month

### Modified Tables

#### `notification_deliveries`

Add correlation_id column:

```sql
ALTER TABLE notification_deliveries
ADD COLUMN correlation_id UUID;

CREATE INDEX idx_notification_deliveries_correlation_id
ON notification_deliveries(correlation_id)
WHERE correlation_id IS NOT NULL;
```

#### `notification_events`

Add correlation_id column:

```sql
ALTER TABLE notification_events
ADD COLUMN correlation_id UUID;

CREATE INDEX idx_notification_events_correlation_id
ON notification_events(correlation_id)
WHERE correlation_id IS NOT NULL;
```

---

## Code Examples

### Example 1: Web API Endpoint with Logging

```typescript
// apps/web/src/routes/api/braindumps/stream/+server.ts
import {
	createLogger,
	generateCorrelationId,
	createCorrelationContext
} from '@buildos/shared-utils';
import { createServiceClient } from '@buildos/supabase-client';

const supabase = createServiceClient();
const logger = createLogger('api:braindumps:stream', supabase);

export const POST: RequestHandler = async ({ request, locals }) => {
	const correlationId = generateCorrelationId();
	const context = createCorrelationContext(correlationId, {
		userId: locals.user.id,
		requestId: crypto.randomUUID()
	});

	logger.info('Brain dump processing started', context);

	try {
		const body = await request.json();

		logger.debug('Request body parsed', context, {
			contentLength: body.content?.length || 0
		});

		// Process brain dump...

		logger.info('Brain dump processing complete', context, {
			duration_ms: Date.now() - startTime,
			projectId: result.projectId
		});

		return json({ success: true });
	} catch (error) {
		logger.error('Brain dump processing failed', error, context);
		return json({ error: 'Processing failed' }, { status: 500 });
	}
};
```

### Example 2: Worker Job with Correlation ID

```typescript
// apps/worker/src/workers/brief/briefWorker.ts
import { workerLogger } from '../../lib/logger.js';
import { extractCorrelationContext } from '@buildos/shared-utils';

export async function processBriefJob(job: LegacyJob<BriefJobData>) {
	const context = extractCorrelationContext(job.data.metadata || {});
	const logger = workerLogger.child('brief', {
		...context,
		userId: job.data.userId,
		jobId: job.id
	});

	logger.info('Processing brief job', {
		briefDate: job.data.briefDate
	});

	try {
		const startTime = Date.now();

		// Generate brief...

		logger.info(
			'Brief generated successfully',
			{
				briefId: brief.id
			},
			{
				duration_ms: Date.now() - startTime,
				taskCount: todaysTaskCount
			}
		);

		// Emit notification event with correlation ID
		await serviceClient.rpc('emit_notification_event', {
			p_event_type: 'brief.completed',
			p_target_user_id: job.data.userId,
			p_payload: { briefId: brief.id },
			p_metadata: { correlationId: context.correlationId } // Pass correlation ID
		});
	} catch (error) {
		logger.error('Brief generation failed', error);
		throw error;
	}
}
```

### Example 3: Email Tracking with Sync

```typescript
// apps/web/src/routes/api/email-tracking/[tracking_id]/+server.ts
import { createLogger } from '@buildos/shared-utils';
import { createServiceClient } from '@buildos/supabase-client';

const supabase = createServiceClient();
const logger = createLogger('api:email-tracking', supabase);

export const GET: RequestHandler = async ({ params }) => {
	const { tracking_id } = params;

	try {
		// Update email_recipients
		await supabase
			.from('email_recipients')
			.update({ opened_at: new Date().toISOString() })
			.eq('email_id', emailId)
			.is('opened_at', null);

		// Get notification delivery ID
		const { data: email } = await supabase
			.from('emails')
			.select('template_data')
			.eq('tracking_id', tracking_id)
			.single();

		const deliveryId = email?.template_data?.delivery_id;

		if (deliveryId) {
			logger.info('Email opened', {
				trackingId: tracking_id,
				notificationDeliveryId: deliveryId
			});

			// Sync to notification_deliveries
			await supabase
				.from('notification_deliveries')
				.update({
					opened_at: new Date().toISOString(),
					status: 'opened'
				})
				.eq('id', deliveryId)
				.is('opened_at', null);
		}

		return new Response(TRANSPARENT_PNG_BASE64, {
			headers: { 'Content-Type': 'image/png' }
		});
	} catch (error) {
		logger.error('Email tracking failed', error, { trackingId: tracking_id });
		return new Response(TRANSPARENT_PNG_BASE64, {
			headers: { 'Content-Type': 'image/png' }
		});
	}
};
```

---

## Migration Strategy

### Rollout Plan

#### Stage 1: Development Testing (Week 1)

- Deploy logger to dev environment
- Test basic logging functionality
- Verify console output format
- Test database logging

#### Stage 2: Worker Integration (Week 1-2)

- Deploy worker changes to staging
- Monitor logs for 48 hours
- Verify correlation IDs propagate
- Check log volume and performance

#### Stage 3: Database Function Updates (Week 2)

- Create `notification_logs` table in staging
- Deploy updated `emit_notification_event()` function
- Monitor for 24 hours
- Verify no performance degradation

#### Stage 4: Tracking Integration (Week 2-3)

- Deploy tracking sync changes to staging
- Send test notifications and verify tracking
- Check admin dashboard accuracy
- Monitor for 48 hours

#### Stage 5: Production Rollout (Week 3)

- Deploy all changes to production
- Monitor closely for 7 days
- Set up alerting (Phase 6)
- Document any issues

### Rollback Plan

If critical issues arise:

1. **Logger Issues**: Disable database/HTTP logging, keep console logging

    ```typescript
    const logger = createLogger('namespace', supabase, {
    	enableDatabase: false,
    	enableHttp: false
    });
    ```

2. **Database Function Issues**: Revert to previous `emit_notification_event()` version

    ```bash
    psql -d database -f rollback_migration.sql
    ```

3. **Tracking Sync Issues**: Remove sync code, tracking still works for email_recipients

### Backwards Compatibility

- Old code without logger will continue to work (console.log still functions)
- New logger is additive - doesn't break existing functionality
- Database schema changes are non-breaking (new columns/tables only)
- Can gradually migrate existing code to new logger

---

## Testing Requirements

### Unit Tests

**Logger Tests** (`packages/shared-utils/src/logging/logger.test.ts`):

- ✅ Log level filtering works
- ✅ Console output formatted correctly
- ✅ Database logging works (mocked)
- ✅ HTTP logging works (mocked)
- ✅ Child loggers inherit context
- ✅ Error normalization works

**Correlation Tests** (`packages/shared-utils/src/logging/correlation.test.ts`):

- ✅ Correlation ID generation works
- ✅ Context creation works
- ✅ Extraction from Headers works
- ✅ Extraction from metadata works
- ✅ Injection into metadata works

### Integration Tests

**Worker Tests** (`apps/worker/src/tests/notification-logging.test.ts`):

- ✅ Notification worker logs all steps
- ✅ Correlation ID propagates through job
- ✅ Channel adapters log correctly
- ✅ Errors logged with full context

**API Tests** (`apps/web/src/lib/tests/notification-tracking.test.ts`):

- ✅ Email tracking syncs to notification_deliveries
- ✅ SMS tracking syncs to notification_deliveries
- ✅ Correlation IDs tracked correctly
- ✅ Admin analytics show correct data

### Manual Testing

**End-to-End Flow**:

1. Create test user with email, phone, push subscription
2. Trigger brief.completed notification
3. Verify logs appear at each step:
    - Worker job claim
    - Notification event emission
    - Delivery creation (4 deliveries: push, email, SMS, in-app)
    - Worker processing
    - Channel adapter sending
    - Status updates
4. Open email, verify `opened_at` updated
5. Click email link, verify `clicked_at` updated
6. Click SMS link, verify tracking
7. Check admin dashboard shows accurate data
8. Search logs by correlation ID, verify full trace

---

## Monitoring & Alerting

### Metrics to Track

1. **Log Volume**
    - Logs per minute by level (debug, info, warn, error)
    - Logs per service (web, worker)
    - Database log table growth rate

2. **Notification Metrics**
    - Deliveries created per minute
    - Send failures per minute
    - Open rate by channel
    - Click rate by channel
    - Average delivery time

3. **Error Rates**
    - Notification send failures
    - Database logging failures
    - HTTP logging failures
    - Correlation ID missing rate

### Alerting Rules

**Critical Alerts** (page on-call):

- Notification send failure rate > 10% for 5 minutes
- Database logging failures > 100/minute
- Email tracking sync failures > 50/minute

**Warning Alerts** (Slack notification):

- Notification send failure rate > 5% for 10 minutes
- Average delivery time > 10 seconds
- Log volume > 10,000/minute (potential log storm)

**Info Alerts** (dashboard only):

- Open rate drops below historical average
- Click rate drops below historical average

### Dashboard Views

**Create Grafana/Similar Dashboard**:

**Panel 1: Notification Volume**

- Total notifications sent (last 24h)
- Breakdown by channel
- Trend line

**Panel 2: Delivery Success Rate**

- Success rate by channel
- Failed notifications count
- Retry queue depth

**Panel 3: Engagement Metrics**

- Open rate by channel (24h, 7d, 30d)
- Click rate by channel
- Time to open histogram

**Panel 4: Log Health**

- Log entries per minute
- Error log rate
- Database log table size

**Panel 5: Correlation Trace**

- Search by correlation ID
- Timeline of all events
- Error highlights

---

## Success Metrics

### Quantitative Metrics

| Metric                            | Current | Target | Measurement                                 |
| --------------------------------- | ------- | ------ | ------------------------------------------- |
| **Notification visibility**       | 30%     | 100%   | % of notification events logged             |
| **Correlation trace rate**        | 0%      | 95%    | % of notifications with correlation ID      |
| **Debug time**                    | 30 min  | 5 min  | Average time to diagnose notification issue |
| **Open rate accuracy**            | Unknown | ±2%    | Difference between reported and actual      |
| **Failed notification detection** | Manual  | <1 min | Time to detect send failures                |

### Qualitative Metrics

- ✅ Engineering team reports improved debugging experience
- ✅ Admin dashboard trusted as source of truth
- ✅ Notification issues resolved faster
- ✅ Product team can make data-driven decisions on notification strategy

---

## Appendix A: Log Level Guidelines

### When to use each level

**DEBUG** - Verbose diagnostic information

- Variable values
- Function entry/exit
- Conditional branch taken
- Query results (summarized)

**INFO** - Normal operations

- Request received
- Job started/completed
- Notification sent successfully
- Status changed

**WARN** - Recoverable issues

- Retry attempted
- Fallback used
- Validation warning
- Performance degradation

**ERROR** - Failures requiring attention

- API call failed
- Database error
- Notification send failed
- Unexpected exception

**FATAL** - Critical failures

- Service cannot continue
- Data corruption detected
- Required dependency unavailable

---

## Appendix B: Correlation ID Best Practices

### Generating Correlation IDs

- Generate at API gateway/entry point
- Pass through all services
- Store in job metadata
- Include in external API calls (Twilio, Gmail)

### Naming Conventions

- `correlationId` - Tracks entire user action across services
- `requestId` - Unique per API request
- `jobId` - Unique per queue job
- `sessionId` - Unique per user session

### Example Trace

```
correlationId: 550e8400-e29b-41d4-a716-446655440000

Timeline:
1. [2025-10-10 21:00:00.000] [web:api:braindumps] Brain dump processing started
2. [2025-10-10 21:00:01.234] [web:api:braindumps] Brain dump saved to database
3. [2025-10-10 21:00:02.456] [web:api:queue] Job queued: type=send_notification
4. [2025-10-10 21:00:10.123] [worker:notification] Processing notification job
5. [2025-10-10 21:00:10.500] [worker:notification:email] Formatting email
6. [2025-10-10 21:00:11.789] [worker:notification:email] Email sent via webhook
7. [2025-10-10 21:00:12.000] [webhook:email] Email delivered by Gmail
8. [2025-10-10 21:05:30.456] [api:email-tracking] Email opened
```

---

## Appendix C: Environment Variables

Add to `.env` files:

```bash
# Logging Configuration
LOG_LEVEL=info                    # debug | info | warn | error | fatal
LOG_TO_DATABASE=true              # Enable database logging
LOG_TO_HTTP=false                 # Enable HTTP logging (for external services)
LOG_HTTP_URL=                     # e.g., https://logs.betterstack.com/ingest
LOG_HTTP_TOKEN=                   # API token for external log service

# Development overrides
# In development, use LOG_LEVEL=debug for verbose logging
```

---

## Appendix D: Migration Checklist

Use this checklist when deploying:

### Pre-Deployment

- [ ] All tests passing
- [ ] Code reviewed and approved
- [ ] Environment variables configured
- [ ] Database migrations written
- [ ] Rollback plan documented

### Deployment

- [ ] Deploy shared-utils package
- [ ] Run database migrations
- [ ] Deploy worker changes
- [ ] Deploy web changes
- [ ] Verify logs appearing in development

### Post-Deployment

- [ ] Monitor logs for 1 hour
- [ ] Check admin dashboard accuracy
- [ ] Send test notifications and verify tracking
- [ ] Review error logs for issues
- [ ] Update documentation

### Week 1 Follow-up

- [ ] Review log volume and adjust levels if needed
- [ ] Set up alerting rules
- [ ] Create Grafana dashboard
- [ ] Train team on new logging system
- [ ] Document common debugging workflows

---

**Document Status**: ✅ Complete
**Next Steps**: Review with engineering team, estimate effort, schedule implementation

**Questions or Feedback**: File an issue or contact the platform team
