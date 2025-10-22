---
title: Event-Driven Architecture Patterns in BuildOS
date: 2025-10-05 18:00:00
type: research
status: complete
context: Read-only research of event-driven patterns for notification event system design
related_docs:
    - /apps/web/docs/features/notifications/generic-stackable-notification-system-spec.md
    - /NOTIFICATION_SYSTEM_IMPLEMENTATION.md
    - /apps/worker/CLAUDE.md
tags:
    - architecture
    - events
    - webhooks
    - queue
    - realtime
    - notifications
---

# Event-Driven Architecture Patterns in BuildOS

## Executive Summary

This document catalogs all event-driven architecture patterns currently used in the BuildOS platform, providing a comprehensive reference for implementing the notification event system. The platform uses a sophisticated multi-layered event architecture combining browser events, Supabase Realtime, queue systems, webhooks, and database triggers.

## Research Methodology

- **Scope**: Complete codebase analysis (web + worker apps)
- **Search Patterns**: Events, webhooks, queue, subscriptions, triggers
- **Files Analyzed**: 172+ TypeScript/JavaScript files, 39 SQL migration files
- **Focus**: Patterns applicable to notification system design

---

## 1. Browser Event Patterns

### 1.1 Custom Events (DOM-based)

**Pattern**: Standard browser CustomEvent API for client-side event communication

**Current Usage**:

```typescript
// Brain dump applied event
window.dispatchEvent(
	new CustomEvent('brain-dump-applied', {
		detail: { projectId, taskIds }
	})
);

// Brain dump updates available event
window.dispatchEvent(
	new CustomEvent('brain-dump-updates-available', {
		detail: { brainDumpId, updates }
	})
);

// PWA install events
document.dispatchEvent(new CustomEvent('pwa-install-available'));
document.dispatchEvent(new CustomEvent('pwa-installed'));
```

**Files**:

- `/apps/web/src/lib/utils/brain-dump-navigation.ts` (lines 135-136, 205-206)
- `/apps/web/src/lib/utils/pwa-enhancements.ts` (lines 193, 202)

**Key Characteristics**:

- ✅ No library dependencies (native browser API)
- ✅ Type-safe with TypeScript
- ✅ Supports detail payload
- ⚠️ Client-side only (no server communication)
- ⚠️ No persistence (events lost on page refresh)

**Best Practices**:

1. Use descriptive event names with namespace (e.g., `brain-dump-applied`)
2. Include structured data in `detail` property
3. Dispatch from `window` or `document` for global events
4. Add `addEventListener` cleanup in `onDestroy` lifecycle

### 1.2 EventTarget Pattern (Not Currently Used)

**Potential Pattern**: Custom EventTarget class for typed event emitters

```typescript
// Example pattern (not implemented in BuildOS)
class NotificationEventEmitter extends EventTarget {
	emitCompleted(notificationId: string) {
		this.dispatchEvent(
			new CustomEvent('completed', {
				detail: { notificationId }
			})
		);
	}
}
```

**Why Not Used**: BuildOS prefers Svelte stores for state management over event emitters.

---

## 2. Supabase Realtime Subscriptions

### 2.1 Database Change Subscriptions

**Pattern**: Subscribe to Postgres changes via Supabase Realtime channels

**Current Implementation**: `/apps/web/src/lib/services/realtimeBrief.service.ts`

**Architecture**:

```typescript
// Channel creation
channel = supabaseClient.channel(`user-brief-notifications:${userId}`);

// Subscribe to table changes
channel.on(
	'postgres_changes',
	{
		event: '*', // INSERT, UPDATE, DELETE
		schema: 'public',
		table: 'queue_jobs',
		filter: `user_id=eq.${userId}`
	},
	(payload) => this.handleJobUpdate(payload)
);

// Subscribe to another table
channel.on(
	'postgres_changes',
	{
		event: '*',
		schema: 'public',
		table: 'daily_briefs',
		filter: `user_id=eq.${userId}`
	},
	(payload) => this.handleBriefUpdate(payload)
);

// Activate subscription
await channel.subscribe((status) => {
	if (status === 'SUBSCRIBED') {
		console.log('Real-time connected');
	}
});
```

**Payload Structure**:

```typescript
{
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  new: Record<string, any>,    // New row data
  old: Record<string, any>,    // Old row data (for UPDATE/DELETE)
  schema: 'public',
  table: 'queue_jobs',
  commit_timestamp: string
}
```

**Key Features**:

- ✅ Real-time database change notifications
- ✅ Row-level filtering with `filter` parameter
- ✅ Multiple table subscriptions per channel
- ✅ Automatic reconnection with exponential backoff
- ✅ User-scoped channels (security via RLS)
- ⚠️ Requires Supabase RLS policies
- ⚠️ Limited to 100 concurrent subscriptions per connection

**Best Practices** (from realtimeBrief.service.ts):

1. **Reconnection Logic**:

```typescript
private static handleSubscriptionError(): void {
  if (this.state.reconnectAttempts >= this.state.maxReconnectAttempts) {
    toastService.error('Real-time updates unavailable. Please refresh the page.');
    return;
  }

  const delay = Math.min(1000 * Math.pow(2, this.state.reconnectAttempts - 1), 10000);
  setTimeout(() => this.setupSubscription(), delay);
}
```

2. **Deduplication**:

```typescript
// Track shown notifications to prevent duplicates
private static shownNotifications = new Set<string>();

const notificationKey = `brief_complete_${job.queue_job_id}`;
if (this.state.shownNotifications.has(notificationKey)) {
  console.log('Skipping duplicate completion notification');
  return;
}
this.state.shownNotifications.add(notificationKey);

// Clean up after 5 minutes
setTimeout(() => {
  this.state.shownNotifications.delete(notificationKey);
}, 5 * 60 * 1000);
```

3. **Cleanup**:

```typescript
static async cleanup(): Promise<void> {
  if (this.state.channel && this.state.supabaseClient) {
    await this.state.supabaseClient.removeChannel(this.state.channel);
  }
  this.state.shownNotifications.clear();
}
```

### 2.2 Broadcast Events (Not Currently Used)

**Pattern**: Custom events broadcast through Supabase Realtime

```typescript
// Example pattern (configured but not actively used in BuildOS)
channel.on('broadcast', { event: 'brief_completed' }, (payload) => {
	this.handleBriefCompleted(payload);
});

// Send broadcast
await channel.send({
	type: 'broadcast',
	event: 'brief_completed',
	payload: { briefId, userId }
});
```

**Why Not Preferred**: BuildOS uses database change subscriptions instead of broadcasts for better persistence and reliability.

---

## 3. Queue/Job System (Supabase-based)

### 3.1 Queue Architecture

**Pattern**: Database-backed job queue with atomic operations (no Redis)

**Implementation**: `/apps/worker/src/lib/supabaseQueue.ts`

**Core Components**:

```typescript
interface ProcessingJob<T = any> {
	id: string;
	userId: string;
	data: T;
	attempts: number;

	// Job control methods (event-like callbacks)
	updateProgress: (progress: JobProgress) => Promise<void>;
	log: (message: string) => Promise<void>;
}

type JobProcessor<T = any> = (job: ProcessingJob<T>) => Promise<any>;
```

**Queue Operations** (Database RPCs):

1. **Add Job** (with deduplication):

```typescript
const { data: jobId } = await supabase.rpc('add_queue_job', {
	p_user_id: userId,
	p_job_type: 'generate_daily_brief',
	p_metadata: { briefDate, options },
	p_priority: 10,
	p_scheduled_for: new Date().toISOString(),
	p_dedup_key: `brief-${userId}-${briefDate}` // Prevent duplicates
});
```

2. **Claim Jobs** (atomic batch claiming):

```typescript
const { data: jobs } = await supabase.rpc('claim_pending_jobs', {
	p_job_types: ['generate_daily_brief', 'generate_brief_email'],
	p_batch_size: 5
});
```

3. **Complete Job**:

```typescript
await supabase.rpc('complete_queue_job', {
	p_job_id: jobId,
	p_result: { briefId, emailSent: true }
});
```

4. **Fail Job** (with retry logic):

```typescript
await supabase.rpc('fail_queue_job', {
	p_job_id: jobId,
	p_error_message: error.message,
	p_retry: shouldRetry // Automatic retry scheduling
});
```

5. **Cancel Jobs** (atomic cancellation):

```typescript
const { data: cancelledJobs } = await supabase.rpc('cancel_jobs_atomic', {
	p_user_id: userId,
	p_job_type: 'generate_daily_brief',
	p_metadata_filter: { briefDate: '2025-10-05' },
	p_allowed_statuses: ['pending', 'processing']
});
```

**Job Status Transitions**:

```
pending → processing → completed
                    ↘ failed → pending (retry)
                    ↘ cancelled
```

**Progress Tracking**:

```typescript
// Worker updates progress (stored in job metadata)
await job.updateProgress({
	current: 3,
	total: 10,
	message: 'Processing project 3 of 10...'
});

// Web app subscribes to queue_jobs table changes
channel.on(
	'postgres_changes',
	{
		table: 'queue_jobs',
		filter: `user_id=eq.${userId}`
	},
	(payload) => {
		const progress = payload.new.metadata?.progress;
		updateNotificationProgress(progress);
	}
);
```

**Key Features**:

- ✅ No Redis dependency (pure Supabase)
- ✅ Atomic job claiming prevents race conditions
- ✅ Built-in retry logic with exponential backoff
- ✅ Progress tracking via database updates
- ✅ Deduplication via unique keys
- ✅ Real-time progress via Supabase Realtime
- ⚠️ Database writes for progress updates (consider rate limiting)

### 3.2 Job Processors (Event Handlers)

**Pattern**: Register job processors for specific job types

```typescript
// Worker service: apps/worker/src/worker.ts
const queue = new SupabaseQueue();

// Register processor (like event handler)
queue.process('generate_daily_brief', async (job) => {
	await processBriefJob(job);
});

queue.process('generate_brief_email', async (job) => {
	await processEmailJob(job);
});

await queue.start(); // Begin polling
```

**Processing Flow**:

```typescript
// Worker polls database every 5 seconds
async processJobs() {
  const jobs = await supabase.rpc('claim_pending_jobs', {
    p_job_types: ['generate_daily_brief', 'generate_brief_email'],
    p_batch_size: 5
  });

  // Process concurrently with error isolation
  await Promise.allSettled(
    jobs.map(job => this.processJob(job))
  );
}
```

**Error Isolation** (Critical for reliability):

```typescript
private async processJob(job: QueueJob): Promise<void> {
  try {
    const processor = this.processors.get(job.job_type);
    await this.executeJobProcessor(job, processor);
  } catch (error) {
    // This catch prevents one job's error from crashing others
    console.error(`Job ${job.queue_job_id} failed:`, error);
    await this.failJob(job.id, error.message, shouldRetry);
  }
}
```

---

## 4. Webhook Patterns

### 4.1 Incoming Webhooks (External → BuildOS)

**Pattern**: HMAC-secured webhook endpoints for external services

**Implementation**: `/apps/web/src/routes/webhooks/daily-brief-email/+server.ts`

**Security Flow**:

```typescript
// 1. Verify HMAC signature
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
	const expectedSignature = createHmac('sha256', secret).update(payload).digest('hex');
	return signature === expectedSignature; // Timing-safe comparison
}

// 2. Verify timestamp freshness (prevent replay attacks)
const requestTime = new Date(timestamp).getTime();
const now = Date.now();
const MAX_AGE = 5 * 60 * 1000; // 5 minutes

if (Math.abs(now - requestTime) > MAX_AGE) {
	throw error(401, 'Webhook timestamp too old');
}

// 3. Verify source header
if (source !== 'daily-brief-worker') {
	throw error(401, 'Invalid webhook source');
}
```

**Webhook Payload Structure**:

```typescript
interface WebhookPayload {
	userId: string;
	briefId: string;
	briefDate: string;
	recipientEmail: string;
	timestamp: string;
	metadata?: {
		emailRecordId?: string;
		recipientRecordId?: string;
		trackingId?: string;
		subject?: string;
	};
}
```

**Headers**:

- `x-webhook-signature`: HMAC-SHA256 signature
- `x-webhook-timestamp`: ISO timestamp
- `x-source`: Source identifier (e.g., 'daily-brief-worker')

**Response Flow**:

```typescript
export const POST: RequestHandler = async ({ request }) => {
	// 1. Validate headers
	const signature = request.headers.get('x-webhook-signature');
	const timestamp = request.headers.get('x-webhook-timestamp');

	// 2. Parse and verify payload
	const rawBody = await request.text();
	if (!verifyWebhookSignature(rawBody, signature, secret)) {
		throw error(401, 'Invalid signature');
	}

	// 3. Process webhook
	const payload: WebhookPayload = JSON.parse(rawBody);
	await processEmail(payload);

	// 4. Return success
	return json({ success: true, messageId });
};
```

**Key Features**:

- ✅ HMAC signature verification (prevents tampering)
- ✅ Timestamp validation (prevents replay attacks)
- ✅ Source verification (prevents unauthorized callers)
- ✅ Error logging to database
- ✅ Health check endpoint (GET)
- ⚠️ Requires shared secret management

### 4.2 Outgoing Webhooks (BuildOS → External)

**Pattern**: Register webhooks with external services (Google Calendar)

**Implementation**: `/apps/web/src/lib/services/calendar-webhook-service.ts`

**Registration Flow**:

```typescript
async registerWebhook(userId: string, webhookUrl: string): Promise<void> {
  const auth = await this.oAuthService.getAuthenticatedClient(userId);
  const calendar = google.calendar({ version: 'v3', auth });

  // Generate unique channel ID and security token
  const channelId = `channel-${userId}-${Date.now()}`;
  const webhookToken = crypto.randomBytes(32).toString('hex');

  // Set expiration (7 days, max is 30 days)
  const expiration = Date.now() + 7 * 24 * 60 * 60 * 1000;

  // Register with Google
  const response = await calendar.events.watch({
    calendarId: 'primary',
    requestBody: {
      id: channelId,
      type: 'web_hook',
      address: webhookUrl,
      token: webhookToken,
      expiration: expiration.toString()
    }
  });

  // Store webhook metadata in database
  await supabase.from('calendar_webhooks').insert({
    user_id: userId,
    channel_id: channelId,
    resource_id: response.data.resourceId,
    expiration: expiration,
    webhook_token: webhookToken
  });
}
```

**Receiving Webhook Notifications**:

```typescript
// apps/web/src/routes/webhooks/calendar-events/+server.ts
export const POST: RequestHandler = async ({ request }) => {
	// 1. Validate Google webhook headers
	const channelId = request.headers.get('x-goog-channel-id');
	const resourceId = request.headers.get('x-goog-resource-id');
	const resourceState = request.headers.get('x-goog-resource-state');

	// 2. Look up webhook in database
	const webhook = await getWebhook(channelId, resourceId);

	// 3. Verify token (optional security layer)
	const token = request.headers.get('x-goog-channel-token');
	if (token !== webhook.webhook_token) {
		throw error(401, 'Invalid token');
	}

	// 4. Sync calendar events
	if (resourceState === 'exists') {
		await syncCalendarEvents(webhook.user_id);
	}

	return json({ success: true });
};
```

**Exponential Backoff** (Rate Limiting):

```typescript
private async executeWithBackoff<T>(fn: () => Promise<T>, retryCount = 0): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isRateLimited = error.code === 429 ||
      (error.code === 403 && error.message?.includes('quota'));

    if (!isRateLimited || retryCount >= maxRetries) {
      throw error;
    }

    // Exponential backoff with jitter
    const baseDelay = Math.min(
      1000 * Math.pow(2, retryCount),
      60000  // Max 60 seconds
    );
    const jitter = baseDelay * Math.random() * 0.25;
    const delay = Math.floor(baseDelay + jitter);

    await new Promise(resolve => setTimeout(resolve, delay));
    return this.executeWithBackoff(fn, retryCount + 1);
  }
}
```

**Key Features**:

- ✅ Webhook renewal (before 7-day expiration)
- ✅ Exponential backoff for rate limits
- ✅ Token verification (optional security)
- ✅ Resource state tracking
- ⚠️ Requires external service support
- ⚠️ Must handle webhook expiration/renewal

---

## 5. Database Triggers & Functions

### 5.1 Automatic Triggers (Postgres)

**Pattern**: Database triggers for automatic data operations

**Example**: Project History Trigger

**File**: `/apps/web/supabase/migrations/20250825_fix_projects_history_race_condition.sql`

```sql
CREATE OR REPLACE FUNCTION save_project_version()
RETURNS TRIGGER AS $$
DECLARE
    next_version INTEGER;
BEGIN
    -- Prevent recursion
    IF current_setting('app.skip_history_trigger', TRUE) = 'true' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Handle INSERT
    IF TG_OP = 'INSERT' THEN
        -- Use advisory lock to prevent race conditions
        PERFORM pg_advisory_xact_lock(hashtext(NEW.id::text));

        -- Get next version atomically
        SELECT COALESCE(MAX(version_number), 0) + 1
        INTO next_version
        FROM projects_history
        WHERE project_id = NEW.id;

        -- Insert history record
        INSERT INTO projects_history (
            project_id,
            version_number,
            is_first_version,
            project_data,
            created_by
        ) VALUES (
            NEW.id,
            next_version,
            (next_version = 1),
            row_to_json(NEW)::jsonb,
            NEW.user_id
        );

    -- Handle UPDATE
    ELSIF TG_OP = 'UPDATE' THEN
        -- Only save if data actually changed
        IF row_to_json(OLD)::jsonb != row_to_json(NEW)::jsonb THEN
            PERFORM pg_advisory_xact_lock(hashtext(NEW.id::text));

            SELECT COALESCE(MAX(version_number), 0) + 1
            INTO next_version
            FROM projects_history
            WHERE project_id = NEW.id;

            INSERT INTO projects_history (...) VALUES (...);
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
CREATE TRIGGER projects_history_trigger
    AFTER INSERT OR UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION save_project_version();
```

**Key Patterns**:

1. **Advisory Locks** (prevent race conditions):

```sql
PERFORM pg_advisory_xact_lock(hashtext(NEW.id::text));
```

2. **Recursion Prevention**:

```sql
IF current_setting('app.skip_history_trigger', TRUE) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
END IF;
```

3. **Conditional Execution**:

```sql
IF row_to_json(OLD)::jsonb != row_to_json(NEW)::jsonb THEN
    -- Only save if data changed
END IF;
```

**Other Triggers in BuildOS**:

- `update_*_updated_at`: Auto-update `updated_at` timestamps
- `validate_queue_job_status_transition_trigger`: Validate job status transitions
- `on_auth_user_created_trial`: Auto-create trial on user signup

**Key Features**:

- ✅ Automatic execution (no application code needed)
- ✅ Atomic operations (within transaction)
- ✅ Advisory locks prevent race conditions
- ✅ Can't be bypassed (enforced at database level)
- ⚠️ Limited debugging visibility
- ⚠️ Performance impact on write operations

### 5.2 NOTIFY/LISTEN (Not Currently Used)

**Pattern**: Postgres pub/sub for real-time notifications

```sql
-- Example pattern (not implemented in BuildOS)
CREATE OR REPLACE FUNCTION notify_project_change()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'project_changes',
        json_build_object(
            'operation', TG_OP,
            'project_id', NEW.id,
            'user_id', NEW.user_id
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Why Not Used**: BuildOS uses Supabase Realtime instead, which provides similar functionality with better client-side integration.

---

## 6. Bridge Pattern (Notification System)

### 6.1 Brain Dump Notification Bridge

**Pattern**: Bridge between domain-specific stores and generic notification store

**Implementation**: `/apps/web/src/lib/services/brain-dump-notification.bridge.ts`

**Architecture**:

```typescript
// 1. Subscribe to domain store
brainDumpStoreUnsubscribe = brainDumpV2Store.subscribe((state) => {
	for (const [brainDumpId, brainDump] of state.activeBrainDumps) {
		syncBrainDumpToNotification(brainDump);
	}
});

// 2. Create notification when processing starts
function syncBrainDumpToNotification(brainDump: any) {
	const isProcessing = brainDump.processing.phase === 'parsing';

	if (isProcessing && !activeBrainDumpNotifications.has(brainDumpId)) {
		const notificationId = createBrainDumpNotification(brainDump);
		activeBrainDumpNotifications.set(brainDumpId, notificationId);

		// CRITICAL: Trigger API call
		startProcessingAPICall(brainDump);
	}
}

// 3. Update notification as processing progresses
function updateBrainDumpNotification(notificationId: string, state: any) {
	notificationStore.update(notificationId, {
		status: determineStatus(state),
		data: extractData(state),
		progress: {
			type: 'streaming',
			message: getProgressMessage(state)
		}
	});
}

// 4. Handle streaming updates
export function handleBrainDumpStreamUpdate(status: StreamingMessage) {
	if (status.type === 'contextProgress') {
		brainDumpV2Store.updateStreamingState({
			contextStatus: 'processing',
			contextProgress: status.message
		});
	}
	// Bridge subscription auto-updates notification
}
```

**State Synchronization Flow**:

```
brainDumpV2Store (domain state)
    ↓ subscribe
brainDumpNotificationBridge
    ↓ transforms
notificationStore (UI state)
    ↓ renders
NotificationStackManager.svelte
```

**Action Handlers**:

```typescript
function buildBrainDumpNotificationActions(brainDumpId: string) {
	return {
		view: () => {
			const notifId = activeBrainDumpNotifications.get(brainDumpId);
			if (notifId) notificationStore.expand(notifId);
		},
		dismiss: () => {
			const notifId = activeBrainDumpNotifications.get(brainDumpId);
			if (notifId) {
				notificationStore.remove(notifId);
				activeBrainDumpNotifications.delete(brainDumpId);
				cancelBrainDumpAPIStream(brainDumpId);
				brainDumpV2Store.completeBrainDump(brainDumpId);
			}
		}
	};
}
```

**Multi-Instance Tracking**:

```typescript
// Map of brainDumpId → notificationId
const activeBrainDumpNotifications = new Map<string, string>();

// Track last processed timestamps to prevent duplicates
const lastProcessedTimestamps = new Map<string, number>();

// Track API streams for cancellation
const activeAPIStreams = new Map<string, AbortController>();

// Cleanup
function cleanupCompletedNotifications(state: any) {
	const activeBrainDumpIds = new Set(state.activeBrainDumps.keys());

	for (const [brainDumpId, notificationId] of activeBrainDumpNotifications) {
		if (!activeBrainDumpIds.has(brainDumpId)) {
			activeBrainDumpNotifications.delete(brainDumpId);
			lastProcessedTimestamps.delete(brainDumpId);
		}
	}
}
```

**Key Features**:

- ✅ Separation of concerns (domain vs UI state)
- ✅ Multiple simultaneous operations (multi-brain dump support)
- ✅ Action handler registration
- ✅ Automatic cleanup
- ✅ Deduplication
- ✅ API stream management
- ⚠️ Requires careful lifecycle management

### 6.2 Other Bridge Implementations

**Similar Bridges** (same pattern):

- `phase-generation-notification.bridge.ts`: Phase generation → notifications
- `calendar-analysis-notification.bridge.ts`: Calendar analysis → notifications
- `project-synthesis-notification.bridge.ts`: Project synthesis → notifications

All follow the same architectural pattern:

1. Subscribe to domain store
2. Create notification on operation start
3. Update notification on state changes
4. Handle completion/errors
5. Clean up on completion

---

## 7. Notification Store (Svelte 5 Reactivity)

### 7.1 Store Architecture

**Pattern**: Writable store with Map-based state management

**Implementation**: `/apps/web/src/lib/stores/notification.store.ts`

**Critical Pattern** (Svelte 5 Map Reactivity):

```typescript
// ❌ WRONG - Map mutation doesn't trigger reactivity
function updateNotification(id: string, updates: any) {
	update((state) => {
		const notification = state.notifications.get(id);
		state.notifications.set(id, { ...notification, ...updates });
		return state; // ❌ Same Map reference, no reactivity
	});
}

// ✅ CORRECT - Create new Map for reactivity
function updateNotification(id: string, updates: any) {
	update((state) => {
		const notification = state.notifications.get(id);
		const newNotifications = new Map(state.notifications); // ✅ New Map
		newNotifications.set(id, { ...notification, ...updates });
		return {
			...state,
			notifications: newNotifications // ✅ Triggers reactivity
		};
	});
}
```

**Action Handler Pattern** (Function Persistence):

```typescript
// Problem: Functions can't be serialized to sessionStorage
// Solution: Action registry with key-based lookup

const actionRegistry = new Map<string, NotificationActionHandler>();

function prepareActions(id: string, actions: Actions): Actions {
	const prepared: Actions = {};
	const keyMap: Record<string, string> = {};

	for (const [name, handler] of Object.entries(actions)) {
		const key = `${id}:${name}`;

		// Register handler
		registerNotificationAction(key, handler);

		// Create invoker (can be serialized as key)
		prepared[name] = createActionInvoker(key, { notificationId: id, name });
		keyMap[name] = key;
	}

	recordActionKeys(id, keyMap);
	return prepared;
}

function createActionInvoker(actionKey: string, context: any) {
	const invoker = () => {
		const handler = actionRegistry.get(actionKey);
		if (handler) handler();
	};

	// Store key as non-enumerable property
	Object.defineProperty(invoker, ACTION_KEY_SYMBOL, {
		value: actionKey,
		enumerable: false
	});

	return invoker;
}
```

**Persistence Flow**:

```typescript
// 1. Serialize (strip functions, keep metadata)
function serializeNotificationEntry(notification: Notification) {
	const { actions, ...notificationWithoutActions } = notification;
	const actionMetadata = getActionMetadataFromHandlers(notification.id, actions);

	return {
		id: notification.id,
		notification: notificationWithoutActions,
		actions: actionMetadata // [{ name: 'view', key: 'notif_123:view' }]
	};
}

// 2. Persist to sessionStorage
function persist() {
	const state = get({ subscribe });
	sessionStorage.setItem(
		STORAGE_KEY,
		JSON.stringify({
			version: STORAGE_VERSION,
			timestamp: Date.now(),
			notifications: serializeNotificationMap(state.notifications),
			stack: state.stack,
			expandedId: state.expandedId
		})
	);
}

// 3. Hydrate (restore functions)
function hydrateStoredNotification(entry: StoredNotificationEntry) {
	const hydratedActions: Actions = {};
	const keyMap: Record<string, string> = {};

	for (const { name, key } of entry.actions) {
		keyMap[name] = key;
		hydratedActions[name] = createActionInvoker(key, {
			notificationId: entry.id,
			name
		});
	}

	recordActionKeys(entry.id, keyMap);

	return {
		...entry.notification,
		actions: hydratedActions
	};
}
```

**Key Features**:

- ✅ Map-based storage (O(1) lookups)
- ✅ Svelte 5 reactivity (new Map instances)
- ✅ Action handler persistence (registry pattern)
- ✅ Session persistence (survives page refresh)
- ✅ Auto-close timers
- ✅ Deduplication
- ⚠️ Requires careful Map cloning
- ⚠️ Session storage limits (~5MB)

---

## 8. Comparison Matrix

| Pattern               | Real-time         | Persistent   | Server ↔ Client | Multi-instance | Complexity | Best For                  |
| --------------------- | ----------------- | ------------ | ---------------- | -------------- | ---------- | ------------------------- |
| **CustomEvent**       | ❌                | ❌           | ❌               | ✅             | Low        | Client-side coordination  |
| **Supabase Realtime** | ✅                | ✅ (via DB)  | ✅               | ✅             | Medium     | Live database updates     |
| **Queue System**      | ⚠️ (polling)      | ✅           | ✅               | ✅             | High       | Background processing     |
| **Webhooks**          | ✅                | ⚠️ (manual)  | ✅               | ✅             | Medium     | External integrations     |
| **DB Triggers**       | ✅ (via Realtime) | ✅           | ✅               | ✅             | Medium     | Automatic data operations |
| **Bridge Pattern**    | ✅                | ⚠️ (session) | ❌               | ✅             | Medium     | Store synchronization     |

---

## 9. Recommended Patterns for Notification Events

### 9.1 Notification Lifecycle Events

**Recommended**: Bridge Pattern + Supabase Realtime

**Rationale**:

- ✅ Already established pattern (brain dump bridge)
- ✅ Supports multiple simultaneous notifications
- ✅ Real-time updates across components
- ✅ Session persistence for page refreshes
- ✅ Clean separation of concerns

**Implementation Approach**:

```typescript
// 1. Create notification event types
type NotificationEvent =
	| { type: 'created'; notificationId: string; data: any }
	| { type: 'updated'; notificationId: string; updates: any }
	| { type: 'completed'; notificationId: string; result: any }
	| { type: 'dismissed'; notificationId: string }
	| { type: 'expanded'; notificationId: string }
	| { type: 'minimized'; notificationId: string };

// 2. Subscribe to notification store changes
notificationStore.subscribe((state) => {
	// Detect changes and emit events
	const changes = detectStateChanges(previousState, state);
	for (const change of changes) {
		emitNotificationEvent(change);
	}
});

// 3. External systems can listen
function onNotificationEvent(callback: (event: NotificationEvent) => void) {
	// Add to listeners
}
```

### 9.2 Cross-Component Communication

**Recommended**: Supabase Realtime Subscriptions

**Rationale**:

- ✅ Already used for queue_jobs, daily_briefs
- ✅ Automatic propagation across browser tabs
- ✅ Server authoritative (truth in database)
- ✅ RLS security built-in

**Implementation Approach**:

```typescript
// Subscribe to notification-related table changes
channel.on(
	'postgres_changes',
	{
		event: '*',
		schema: 'public',
		table: 'operation_status', // Or similar tracking table
		filter: `user_id=eq.${userId}`
	},
	(payload) => {
		if (payload.eventType === 'UPDATE' && payload.new.status === 'completed') {
			notificationStore.setStatus(payload.new.notification_id, 'success');
		}
	}
);
```

### 9.3 Analytics/Telemetry Events

**Recommended**: CustomEvent + Event Aggregation

**Rationale**:

- ✅ Lightweight (no server roundtrip)
- ✅ Can aggregate before sending to analytics
- ✅ Easy to test/debug

**Implementation Approach**:

```typescript
// Emit telemetry events
function trackNotificationEvent(eventName: string, properties: any) {
	window.dispatchEvent(
		new CustomEvent('notification-telemetry', {
			detail: { eventName, properties, timestamp: Date.now() }
		})
	);
}

// Aggregate and send
window.addEventListener('notification-telemetry', (event) => {
	const { eventName, properties } = event.detail;
	analytics.track(eventName, properties);
});
```

---

## 10. Anti-Patterns to Avoid

### 10.1 Map Mutation Without Cloning

```typescript
// ❌ WRONG - Breaks Svelte 5 reactivity
update((state) => {
	state.notifications.set(id, updated);
	return state;
});

// ✅ CORRECT - Create new Map
update((state) => ({
	...state,
	notifications: new Map(state.notifications).set(id, updated)
}));
```

### 10.2 Missing Cleanup

```typescript
// ❌ WRONG - Memory leak
function initBridge() {
	storeUnsubscribe = store.subscribe(handler);
	// Never calls storeUnsubscribe()
}

// ✅ CORRECT - Proper cleanup
export function cleanupBridge() {
	if (storeUnsubscribe) {
		storeUnsubscribe();
		storeUnsubscribe = null;
	}
	activeNotifications.clear();
	actionRegistry.clear();
}
```

### 10.3 Webhook Replay Attacks

```typescript
// ❌ WRONG - No timestamp validation
export const POST = async ({ request }) => {
	const payload = await request.json();
	await processWebhook(payload);
};

// ✅ CORRECT - Timestamp validation
export const POST = async ({ request }) => {
	const timestamp = request.headers.get('x-webhook-timestamp');
	const age = Date.now() - new Date(timestamp).getTime();

	if (age > MAX_AGE) {
		throw error(401, 'Webhook timestamp too old');
	}

	const rawBody = await request.text();
	if (!verifySignature(rawBody, signature, secret)) {
		throw error(401, 'Invalid signature');
	}

	await processWebhook(JSON.parse(rawBody));
};
```

### 10.4 Missing Deduplication

```typescript
// ❌ WRONG - Duplicate notifications on rapid updates
channel.on('postgres_changes', { table: 'queue_jobs' }, (payload) => {
  notificationStore.add({ ... });  // Creates duplicate!
});

// ✅ CORRECT - Deduplication
const shownNotifications = new Set<string>();

channel.on('postgres_changes', { table: 'queue_jobs' }, (payload) => {
  const key = `job_${payload.new.id}`;
  if (shownNotifications.has(key)) return;

  shownNotifications.add(key);
  notificationStore.add({ ... });

  // Cleanup after 5 minutes
  setTimeout(() => shownNotifications.delete(key), 5 * 60 * 1000);
});
```

---

## 11. Best Practices Summary

### 11.1 For Notification Events

1. **Use Bridge Pattern** for domain → UI state synchronization
2. **Use Supabase Realtime** for cross-tab/server updates
3. **Use CustomEvent** for client-side analytics only
4. **Always create new Map instances** for Svelte 5 reactivity
5. **Implement cleanup handlers** for subscriptions
6. **Add deduplication** for rapid-fire events
7. **Track action handlers** with registry pattern

### 11.2 For Queue/Background Jobs

1. **Use database RPCs** for atomic operations
2. **Implement retry logic** with exponential backoff
3. **Isolate job errors** (Promise.allSettled)
4. **Track progress** via metadata updates
5. **Subscribe to changes** via Supabase Realtime
6. **Use dedup keys** to prevent duplicate jobs

### 11.3 For Webhooks

1. **Always verify signatures** (HMAC-SHA256)
2. **Validate timestamps** (prevent replay attacks)
3. **Verify source headers** (prevent unauthorized calls)
4. **Log all webhook events** (debugging + auditing)
5. **Implement exponential backoff** (rate limits)
6. **Handle idempotency** (duplicate webhook calls)

### 11.4 For Database Triggers

1. **Use advisory locks** (prevent race conditions)
2. **Add recursion protection** (config settings)
3. **Conditional execution** (only when needed)
4. **Minimize performance impact** (avoid heavy operations)
5. **Test thoroughly** (hard to debug in production)

---

## 12. Next Steps for Notification Event System

### Phase 1: Event Emission (Recommended)

1. **Extend Bridge Pattern**:
    - Add event emission to notification store operations
    - Create typed event system (`NotificationEvent` union type)
    - Implement event listener registration

2. **Supabase Realtime Integration**:
    - Subscribe to notification-related table changes
    - Propagate database updates to notification store
    - Handle cross-tab synchronization

### Phase 2: Event Consumers

1. **Analytics Integration**:
    - CustomEvent → Analytics pipeline
    - Track user interactions (expand, dismiss, action clicks)
    - Aggregate before sending to reduce API calls

2. **External System Integration**:
    - Webhook endpoints for notification events
    - Queue jobs for async notification processing
    - Email/SMS notifications for critical events

### Phase 3: Advanced Features

1. **Event Filtering**:
    - Filter by notification type
    - Filter by status
    - Filter by user preferences

2. **Event Replay**:
    - Store events in database
    - Replay for debugging
    - Audit trail

---

## Appendix A: File References

### Key Implementation Files

**Supabase Realtime**:

- `/apps/web/src/lib/services/realtimeBrief.service.ts` (797 lines)
- `/apps/web/src/lib/services/realtimeProject.service.ts`

**Queue System**:

- `/apps/worker/src/lib/supabaseQueue.ts` (575 lines)
- `/apps/worker/src/workers/brief/briefWorker.ts` (285 lines)

**Webhooks**:

- `/apps/web/src/routes/webhooks/daily-brief-email/+server.ts` (439 lines)
- `/apps/web/src/routes/api/calendar/webhook/+server.ts` (43 lines)
- `/apps/web/src/lib/services/calendar-webhook-service.ts`

**Notification System**:

- `/apps/web/src/lib/stores/notification.store.ts` (912 lines)
- `/apps/web/src/lib/services/brain-dump-notification.bridge.ts` (911 lines)
- `/apps/web/src/lib/components/notifications/NotificationStackManager.svelte` (63 lines)

**Database Triggers**:

- `/apps/web/supabase/migrations/20250825_fix_projects_history_race_condition.sql`
- `/apps/web/supabase/migrations/20250927_queue_type_constraints.sql`

**Custom Events**:

- `/apps/web/src/lib/utils/brain-dump-navigation.ts` (lines 135-206)
- `/apps/web/src/lib/utils/pwa-enhancements.ts` (lines 193, 202)

---

## Appendix B: Pattern Decision Tree

```
Need to communicate event?
├─ Client-side only?
│  ├─ Analytics? → CustomEvent
│  ├─ Cross-component? → Svelte Store
│  └─ UI state sync? → Bridge Pattern
│
├─ Server ↔ Client?
│  ├─ Real-time database? → Supabase Realtime
│  ├─ Background job? → Queue System
│  ├─ External service? → Webhook
│  └─ Automatic data operation? → Database Trigger
│
└─ Complex workflow?
   └─ Combine multiple patterns (e.g., Queue + Realtime + Bridge)
```

---

**Research Complete**: This document provides a comprehensive overview of all event-driven architecture patterns currently used in BuildOS, with detailed implementation examples, best practices, and recommendations for the notification event system.
