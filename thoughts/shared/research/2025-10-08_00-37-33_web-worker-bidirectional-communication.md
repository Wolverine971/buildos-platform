---
title: 'Web-Worker Bidirectional Communication Patterns'
date: 2025-10-08
status: complete
tags: [architecture, web-worker-communication, api, webhooks, realtime, authentication]
related_docs:
    - /docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md
    - /docs/DEPLOYMENT_TOPOLOGY.md
    - /apps/web/CLAUDE.md
    - /apps/worker/CLAUDE.md
path: thoughts/shared/research/2025-10-08_00-37-33_web-worker-bidirectional-communication.md
---

# Web-Worker Bidirectional Communication Research

## Executive Summary

BuildOS uses a **queue-based architecture** with **Supabase PostgreSQL** as the central communication hub between the web app (Vercel) and worker service (Railway). Communication is **100% database-mediated** with NO direct HTTP calls between services, except for:

1. **Web → Worker**: Direct HTTP calls to Railway API endpoints for job queuing
2. **Worker → Web**: Webhook callbacks for specific operations (email delivery)
3. **Bidirectional**: Supabase Realtime broadcasts for real-time updates

## Architecture Overview

### Communication Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    Communication Flows                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Web App (Vercel)           Worker Service (Railway)        │
│  ┌──────────────┐           ┌──────────────┐               │
│  │  SvelteKit   │           │   Express    │               │
│  │   + API      │           │   + Cron     │               │
│  └──────┬───────┘           └──────┬───────┘               │
│         │                           │                       │
│         │  ① HTTP POST              │                       │
│         │──────────────────────────>│                       │
│         │  /queue/brief              │                       │
│         │  /queue/phases             │                       │
│         │  /queue/onboarding         │                       │
│         │                           │                       │
│         │                           │  ② Database RPCs     │
│         │       Supabase            │  add_queue_job()     │
│         │  ┌────────────────┐       │  claim_pending_jobs()│
│         │  │   PostgreSQL   │<──────┤  complete_queue_job()│
│         ├─>│   queue_jobs   │       │  fail_queue_job()    │
│         │  │   + RLS        │       │                       │
│         │  └────────┬───────┘       │                       │
│         │           │               │                       │
│         │  ③ Realtime Broadcast     │                       │
│         │<──────────┴───────────────┤                       │
│         │  user:${userId}           │                       │
│         │  brief_completed          │                       │
│         │  brief_failed             │                       │
│         │                           │                       │
│         │  ④ Webhook Callback       │                       │
│         │<──────────────────────────┤                       │
│         │  POST /api/webhooks/...   │                       │
│         │  Bearer ${SECRET}         │                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 1. Web → Worker Communication

### Pattern 1: Direct HTTP API Calls (Primary Method)

**Location**: `/apps/web/src/lib/services/railwayWorker.service.ts`

#### Available Worker Endpoints

| Endpoint              | Method | Purpose                      | Authentication |
| --------------------- | ------ | ---------------------------- | -------------- |
| `/health`             | GET    | Health check                 | None           |
| `/queue/brief`        | POST   | Queue daily brief generation | CORS only      |
| `/queue/phases`       | POST   | Queue phase generation       | CORS only      |
| `/queue/onboarding`   | POST   | Queue onboarding analysis    | CORS only      |
| `/jobs/:jobId`        | GET    | Get job status               | CORS only      |
| `/users/:userId/jobs` | GET    | Get user's jobs              | CORS only      |
| `/queue/stats`        | GET    | Get queue statistics         | CORS only      |

#### Security Model

**No authentication required** - Worker endpoints are protected by:

1. **CORS**: Only allowed origins can make requests
2. **Public deployment**: Railway URL is publicly accessible
3. **Database RLS**: User data protected at database level
4. **Service role**: Worker uses service key to bypass RLS

**Allowed Origins** (from `/apps/worker/src/index.ts`):

```typescript
const allowedOrigins = [
	// Development
	'http://localhost:5173',
	'http://localhost:3000',
	'http://localhost:4173',
	'https://localhost:5173',
	// Production
	'https://build-os.com'
];
```

#### Example: Queue Brief Generation

**Web App Side** (`railwayWorker.service.ts`):

```typescript
static async queueBriefGeneration(
  userId: string,
  options?: {
    scheduledFor?: Date;
    briefDate?: string;
    timezone?: string;
  }
): Promise<QueueBriefResponse> {
  const response = await fetch(`${this.WORKER_URL}/queue/brief`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      scheduledFor: options?.scheduledFor?.toISOString(),
      briefDate: options?.briefDate,
      timezone: options?.timezone,
      forceRegenerate: true
    }),
    signal: AbortSignal.timeout(10000)
  });

  return response.json(); // { success, jobId, scheduledFor, briefDate }
}
```

**Worker Side** (`/apps/worker/src/index.ts`):

```typescript
app.post('/queue/brief', async (req, res) => {
	const { userId, scheduledFor, briefDate, timezone, forceRegenerate } = req.body;

	// Validate user exists
	const { data: user } = await supabase.from('users').select('id').eq('id', userId).single();

	if (!user) {
		return res.status(404).json({ error: 'User not found' });
	}

	// Queue job via Supabase RPC
	const job = await queue.add(
		'generate_daily_brief',
		userId,
		{ briefDate, timezone },
		{
			priority: forceRegenerate ? 1 : 10,
			scheduledFor: new Date(scheduledFor)
		}
	);

	return res.json({
		success: true,
		jobId: job.queue_job_id,
		scheduledFor: scheduledFor,
		briefDate
	});
});
```

#### Example: Get Job Status

**Web App**:

```typescript
static async getJobStatus(jobId: string): Promise<QueueJob | null> {
  const response = await fetch(`${this.WORKER_URL}/jobs/${jobId}`, {
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) return null;
  return response.json();
}
```

**Worker**:

```typescript
app.get('/jobs/:jobId', async (req, res) => {
	const { jobId } = req.params;
	const job = await queue.getJob(jobId);

	if (!job) {
		return res.status(404).json({ error: 'Job not found' });
	}

	return res.json(job);
});
```

### Pattern 2: Database Queue System (Indirect Communication)

**Location**: `/apps/worker/src/lib/supabaseQueue.ts`

#### Database RPC Functions

**File**: `/apps/web/supabase/migrations/` (various)

| RPC Function                   | Purpose                              | Called By      | Security     |
| ------------------------------ | ------------------------------------ | -------------- | ------------ |
| `add_queue_job()`              | Create new queue job                 | Web + Worker   | Service role |
| `claim_pending_jobs()`         | Atomically claim jobs for processing | Worker only    | Service role |
| `complete_queue_job()`         | Mark job as completed                | Worker only    | Service role |
| `fail_queue_job()`             | Mark job as failed with retry        | Worker only    | Service role |
| `reset_stalled_jobs()`         | Recover stuck jobs                   | Worker startup | Service role |
| `cancel_brief_jobs_for_date()` | Cancel duplicate jobs                | Worker         | Service role |

#### Job Creation Flow

**Web App** (via SvelteKit API route):

```typescript
// /apps/web/src/routes/api/phases-jobs/+server.ts
export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	const { projectId, options } = await request.json();

	// Verify project ownership
	const { data: project } = await supabase
		.from('projects')
		.select('id')
		.eq('id', projectId)
		.eq('user_id', user.id)
		.single();

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	// Call Railway worker to queue job
	const response = await fetch(`${PUBLIC_RAILWAY_WORKER_URL}/queue/phases`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ userId: user.id, projectId, options })
	});

	return response.json();
};
```

**Worker** (atomic job creation):

```typescript
// /apps/worker/src/lib/supabaseQueue.ts
async add(
  jobType: JobType,
  userId: string,
  data: any,
  options?: JobOptions
): Promise<QueueJob> {
  const dedupKey = options?.dedupKey ??
    `${jobType}-${userId}-${Date.now()}`;

  // Atomic insert with deduplication
  const { data: jobId, error } = await supabase.rpc("add_queue_job", {
    p_user_id: userId,
    p_job_type: jobType,
    p_metadata: data,
    p_priority: options?.priority ?? 10,
    p_scheduled_for: options?.scheduledFor?.toISOString() ?? new Date().toISOString(),
    p_dedup_key: dedupKey
  });

  // Fetch created job
  const { data: job } = await supabase
    .from("queue_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  return job;
}
```

#### Job Processing Flow

**Worker** (polling and claiming):

```typescript
// Worker polls every 5 seconds
async processJobs(): Promise<void> {
  const jobTypes = Array.from(this.processors.keys());

  // Atomic batch claim (SKIP LOCKED prevents race conditions)
  const { data: jobs } = await supabase.rpc("claim_pending_jobs", {
    p_job_types: jobTypes,
    p_batch_size: this.batchSize
  });

  // Process jobs in parallel
  await Promise.allSettled(
    jobs.map(job => this.processJob(job))
  );
}

async processJob(job: QueueJob): Promise<void> {
  const processor = this.processors.get(job.job_type);

  try {
    const result = await processor({
      id: job.id,
      userId: job.user_id,
      data: job.metadata,
      attempts: job.attempts
    });

    // Mark as completed
    await supabase.rpc("complete_queue_job", {
      p_job_id: job.id,
      p_result: result
    });
  } catch (error) {
    // Mark as failed with retry
    await supabase.rpc("fail_queue_job", {
      p_job_id: job.id,
      p_error_message: error.message,
      p_retry: true
    });
  }
}
```

## 2. Worker → Web Communication

### Pattern 1: Supabase Realtime Broadcasts (Primary)

**Location**: `/apps/worker/src/workers/shared/queueUtils.ts` (Worker)
**Location**: `/apps/web/src/lib/services/realtimeBrief.service.ts` (Web)

#### Worker: Sending Notifications

```typescript
// /apps/worker/src/workers/shared/queueUtils.ts
export async function notifyUser(userId: string, event: string, payload?: any) {
	try {
		const channel = supabase.channel(`user:${userId}`);
		await channel.send({
			type: 'broadcast',
			event: event,
			payload: payload
		});

		console.log(`📢 Sent notification to user ${userId}: ${event}`);
	} catch (error) {
		console.error('Failed to send notification:', error);
	}
}

// Usage in worker
await notifyUser(userId, 'brief_completed', {
	briefId: 'uuid',
	briefDate: '2025-10-08',
	timezone: 'America/New_York'
});

await notifyUser(userId, 'brief_failed', {
	error: 'LLM API error',
	briefDate: '2025-10-08'
});
```

#### Web: Subscribing to Notifications

```typescript
// /apps/web/src/lib/services/realtimeBrief.service.ts
static async initialize(
  userId: string,
  supabaseClient: SupabaseClient,
  timezone?: string
): Promise<void> {
  // Create channel for user-specific notifications
  this.state.channel = supabaseClient.channel(
    `user-brief-notifications:${userId}`
  );

  // Subscribe to broadcasts
  this.state.channel
    .on('broadcast', { event: 'brief_completed' }, (payload) => {
      this.handleBriefCompleted(payload);
    })
    .on('broadcast', { event: 'brief_failed' }, (payload) => {
      this.handleBriefFailed(payload);
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'queue_jobs',
      filter: `user_id=eq.${userId}`
    }, (payload) => {
      this.handleJobUpdate(payload);
    });

  await this.state.channel.subscribe();
}

private static handleBriefCompleted(payload: any): void {
  toastService.success(`Your brief for ${payload.briefDate} is ready!`);
  briefNotificationStatus.set({ isGenerating: false });
  invalidateAll(); // Refresh data
}
```

#### Notification Events

| Event                  | Trigger                  | Payload                            | Purpose               |
| ---------------------- | ------------------------ | ---------------------------------- | --------------------- |
| `brief_completed`      | Brief generation done    | `{ briefId, briefDate, timezone }` | Show success toast    |
| `brief_failed`         | Brief generation error   | `{ error, briefDate }`             | Show error toast      |
| `brief_email_sent`     | Email sent successfully  | `{ emailId, trackingId }`          | Email confirmation    |
| `phases_completed`     | Phase generation done    | `{ projectId, phaseCount }`        | Update project UI     |
| `onboarding_completed` | Onboarding analysis done | `{ questionsGenerated }`           | Navigate to next step |

### Pattern 2: Webhook Callbacks (Secondary)

**Location**: `/apps/web/src/routes/api/webhooks/send-notification-email/+server.ts`

#### Worker → Web Webhook Flow

**Worker calls web app webhook**:

```typescript
// Worker sends email via web app webhook
const response = await fetch(`${BUILDOS_WEBHOOK_URL}/api/webhooks/send-notification-email`, {
	method: 'POST',
	headers: {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${PRIVATE_BUILDOS_WEBHOOK_SECRET}`
	},
	body: JSON.stringify({
		recipientEmail: 'user@example.com',
		recipientUserId: 'uuid',
		subject: 'Your daily brief is ready',
		htmlContent: '<html>...</html>',
		textContent: 'Your daily brief...',
		deliveryId: 'uuid',
		eventId: 'uuid'
	})
});
```

**Web app webhook handler**:

```typescript
// /apps/web/src/routes/api/webhooks/send-notification-email/+server.ts
export const POST: RequestHandler = async ({ request }) => {
	// Validate webhook secret
	const authHeader = request.headers.get('authorization');
	const expectedSecret = PRIVATE_BUILDOS_WEBHOOK_SECRET;

	if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json();

	// Send email via Gmail
	const emailService = new EmailService(supabase);
	const result = await emailService.sendEmail({
		to: body.recipientEmail,
		subject: body.subject,
		html: body.htmlContent,
		userId: body.recipientUserId
	});

	return json({ success: true, messageId: result.messageId });
};
```

#### Authentication: Shared Webhook Secret

**Environment Variables**:

```bash
# Worker (.env)
BUILDOS_WEBHOOK_URL=https://build-os.com
PRIVATE_BUILDOS_WEBHOOK_SECRET=shared-secret-key-here

# Web (.env)
PRIVATE_BUILDOS_WEBHOOK_SECRET=shared-secret-key-here
```

**Security Flow**:

1. Worker includes `Authorization: Bearer ${SECRET}` header
2. Web app validates header matches expected secret
3. Returns 401 Unauthorized if invalid
4. Processes request only if valid

### Pattern 3: External Webhooks (Twilio, etc.)

**Location**: `/apps/web/src/routes/api/webhooks/twilio/status/+server.ts`

#### Twilio Status Webhooks

**Flow**: Twilio → Web App (status updates) → Worker (retry logic)

```typescript
// /apps/web/src/routes/api/webhooks/twilio/status/+server.ts
export const POST: RequestHandler = async ({ request, url }) => {
	const body = await request.text();
	const params = new URLSearchParams(body);

	const messageSid = params.get('MessageSid');
	const messageStatus = params.get('MessageStatus');
	const errorCode = params.get('ErrorCode');

	// Validate Twilio signature
	const twilioSignature = request.headers.get('X-Twilio-Signature');
	const isValid = twilio.validateRequest(
		PRIVATE_TWILIO_AUTH_TOKEN,
		twilioSignature,
		webhookUrl,
		Object.fromEntries(params)
	);

	if (!isValid) {
		return json({ error: 'Invalid signature' }, { status: 401 });
	}

	// Update SMS message status
	await supabase
		.from('sms_messages')
		.update({
			twilio_status: messageStatus,
			delivered_at: messageStatus === 'delivered' ? new Date() : null
		})
		.eq('twilio_sid', messageSid);

	// If failed, queue retry job
	if (messageStatus === 'failed') {
		await supabase.rpc('add_queue_job', {
			p_user_id: userId,
			p_job_type: 'send_sms',
			p_metadata: { message_id: messageId, retry_attempt: 1 }
		});
	}

	return json({ success: true });
};
```

## 3. Authentication & Authorization

### Service Role Pattern

**Worker uses service role** for all database operations:

```typescript
// /apps/worker/src/lib/supabase.ts
import { createServiceClient } from '@buildos/supabase-client';

export const supabase = createServiceClient();
```

**Why service role?**

- Bypasses Row Level Security (RLS)
- Can access jobs across all users (scheduler needs this)
- Required for atomic job claiming
- Trusted server environment

**Web app uses both**:

- **User sessions**: `PUBLIC_SUPABASE_ANON_KEY` + RLS policies
- **API routes**: `PRIVATE_SUPABASE_SERVICE_KEY` for specific operations

### Row Level Security (RLS)

**Queue Jobs** (`queue_jobs` table):

```sql
-- Users can only see their own jobs
CREATE POLICY "Users see own jobs" ON queue_jobs
  FOR SELECT USING (auth.uid() = user_id);

-- Service role bypasses RLS
CREATE POLICY "Service role full access" ON queue_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

**SMS Messages** (`sms_messages` table):

```sql
-- Users can view their own messages
CREATE POLICY "Users can view own SMS" ON sms_messages
  FOR SELECT USING (auth.uid() = user_id);

-- Service role (worker) has full access
CREATE POLICY "Service role full access" ON sms_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### CORS Configuration

**Worker CORS** (`/apps/worker/src/index.ts`):

```typescript
app.use(
	cors({
		origin: function (origin, callback) {
			// Allow requests with no origin (mobile apps, curl)
			if (!origin) return callback(null, true);

			if (allowedOrigins.includes(origin)) {
				return callback(null, true);
			} else {
				return callback(new Error('Not allowed by CORS'));
			}
		},
		credentials: true
	})
);
```

## 4. Updating Scheduled Jobs from Web App

### Scenario: User Changes Brief Schedule

**Flow**:

1. User updates `user_brief_preferences` table (timezone, frequency)
2. Web app updates database directly (no worker call needed)
3. Worker scheduler reads preferences on next run
4. Scheduler creates new jobs based on new preferences

**No direct update to worker required** - worker is stateless and reads from database.

### Scenario: Cancel Scheduled Brief

**Web App**:

```typescript
// Call worker to cancel jobs
const response = await fetch(`${RAILWAY_WORKER_URL}/queue/brief/cancel`, {
	method: 'POST',
	body: JSON.stringify({ userId, briefDate })
});

// OR update database directly
await supabase.rpc('cancel_brief_jobs_for_date', {
	p_user_id: userId,
	p_brief_date: briefDate
});
```

**Worker**:

```typescript
app.post('/queue/brief/cancel', async (req, res) => {
	const { userId, briefDate } = req.body;

	const { count } = await queue.cancelBriefJobsForDate(userId, briefDate);

	return res.json({
		success: true,
		cancelledJobs: count
	});
});
```

## 5. Implementation Examples

### Example 1: Phase Generation (User-Initiated)

**Flow**: User clicks "Generate Phases" → Web → Worker → Realtime → Web

**Step 1: User Action** (Web Component)

```typescript
// User clicks button
async function generatePhases() {
	const result = await RailwayWorkerService.queuePhasesGeneration(userId, projectId, {
		regenerate: true
	});

	// Start polling for status
	const jobId = result.jobId;
	pollJobStatus(jobId);
}
```

**Step 2: Queue Job** (Worker API)

```typescript
app.post('/queue/phases', async (req, res) => {
	const { userId, projectId, options } = req.body;

	// Check for existing jobs
	const { data: existing } = await supabase
		.from('queue_jobs')
		.select('*')
		.eq('user_id', userId)
		.eq('metadata->projectId', projectId)
		.in('status', ['pending', 'processing']);

	if (existing?.length > 0) {
		return res.status(409).json({
			error: 'Already generating phases'
		});
	}

	// Queue job
	const job = await queue.add(
		'generate_phases',
		userId,
		{
			projectId,
			options
		},
		{ priority: 5 }
	);

	return res.json({ jobId: job.queue_job_id });
});
```

**Step 3: Process Job** (Worker)

```typescript
// Worker claims and processes
queue.process('generate_phases', async (job) => {
	const { projectId } = job.data;

	// Generate phases via LLM
	const phases = await generatePhasesViaLLM(projectId);

	// Save to database
	await savePhasesToDatabase(projectId, phases);

	// Notify user via Realtime
	await notifyUser(job.userId, 'phases_completed', {
		projectId,
		phaseCount: phases.length
	});

	return { projectId, phaseCount: phases.length };
});
```

**Step 4: UI Update** (Web Realtime)

```typescript
// Subscribe to notifications
supabase
	.channel(`user:${userId}`)
	.on('broadcast', { event: 'phases_completed' }, (payload) => {
		toastService.success('Phases generated!');
		// Refresh project data
		invalidateAll();
	})
	.subscribe();
```

### Example 2: Daily Brief (Scheduled)

**Flow**: Cron → Worker Scheduler → Queue → Worker → Realtime → Web

**Step 1: Scheduler** (Worker Cron)

```typescript
// Runs hourly
cron.schedule('0 * * * *', async () => {
	const hour = new Date().getHours();

	// Get users with briefs scheduled for this hour
	const { data: users } = await supabase
		.from('user_brief_preferences')
		.select('*')
		.eq('enabled', true)
		.eq('brief_time_hour', hour);

	// Queue jobs for each user
	for (const user of users) {
		await queue.add('generate_daily_brief', user.user_id, {
			briefDate: getTodayInTimezone(user.timezone),
			timezone: user.timezone
		});
	}
});
```

**Step 2: Worker Processes** (same as user-initiated)

**Step 3: Web Receives Notification** (Realtime subscription)

## 6. Environment Variables

### Web App (.env)

```bash
# Supabase
PUBLIC_SUPABASE_URL=https://xxx.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
PRIVATE_SUPABASE_SERVICE_KEY=eyJhbGc...

# Railway Worker
PUBLIC_RAILWAY_WORKER_URL=https://buildos-worker.railway.app

# Webhooks
PRIVATE_BUILDOS_WEBHOOK_SECRET=shared-secret-key
```

### Worker (.env)

```bash
# Supabase (service role only)
PUBLIC_SUPABASE_URL=https://xxx.supabase.co
PRIVATE_SUPABASE_SERVICE_KEY=eyJhbGc...

# Webhooks to web app
BUILDOS_WEBHOOK_URL=https://build-os.com
PRIVATE_BUILDOS_WEBHOOK_SECRET=shared-secret-key

# External services
PRIVATE_OPENROUTER_API_KEY=sk-...
PRIVATE_TWILIO_ACCOUNT_SID=AC...
PRIVATE_TWILIO_AUTH_TOKEN=...
```

## 7. Key Takeaways

### Communication Patterns Summary

| Pattern             | Direction      | Authentication       | Use Case                     |
| ------------------- | -------------- | -------------------- | ---------------------------- |
| HTTP API calls      | Web → Worker   | CORS only            | Queue jobs, get status       |
| Database queue      | Web → Worker   | Service role RLS     | Async job processing         |
| Realtime broadcasts | Worker → Web   | User channel         | Job completion notifications |
| Webhook callbacks   | Worker → Web   | Shared secret        | Email delivery               |
| External webhooks   | External → Web | Signature validation | Twilio status updates        |

### Security Model

1. **Worker API endpoints**: CORS-protected, no authentication
2. **Database access**: Service role bypasses RLS for trusted operations
3. **Webhooks**: Shared secret or signature validation
4. **User data**: Protected by RLS policies on database

### Stateless Design

- **Worker has no state** - all state in database
- **Web can query worker** for job status at any time
- **No session management** between services
- **Database is source of truth** for all job data

### Scaling Considerations

- **Horizontal worker scaling**: Multiple workers can poll same queue
- **Atomic job claiming**: `SKIP LOCKED` prevents duplicate processing
- **No coordination needed**: Workers are independent
- **Database bottleneck**: Supabase connection pooling handles load

## 8. Related Files

### Web App

- `/apps/web/src/lib/services/railwayWorker.service.ts` - Worker API client
- `/apps/web/src/lib/services/realtimeBrief.service.ts` - Realtime subscriptions
- `/apps/web/src/routes/api/phases-jobs/+server.ts` - Job queuing endpoint
- `/apps/web/src/routes/api/webhooks/send-notification-email/+server.ts` - Email webhook
- `/apps/web/src/routes/api/webhooks/twilio/status/+server.ts` - Twilio webhook

### Worker

- `/apps/worker/src/index.ts` - Express API server with endpoints
- `/apps/worker/src/lib/supabaseQueue.ts` - Queue management
- `/apps/worker/src/workers/shared/queueUtils.ts` - Notification utilities
- `/apps/worker/src/scheduler.ts` - Cron scheduler

### Documentation

- `/docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md` - Complete architecture
- `/docs/DEPLOYMENT_TOPOLOGY.md` - Deployment overview
- `/apps/web/CLAUDE.md` - Web app guide
- `/apps/worker/CLAUDE.md` - Worker guide

## 9. Recommendations for New Features

### Adding New Worker Job Type

1. **Define job type** in `@buildos/shared-types`
2. **Add processor** in worker: `queue.process("new_job_type", async (job) => { ... })`
3. **Add API endpoint** in worker: `POST /queue/new-job-type`
4. **Add client method** in `railwayWorker.service.ts`
5. **Add realtime handler** in appropriate service (e.g., `realtimeProject.service.ts`)
6. **Update RLS policies** if new tables involved

### Updating Worker State from Web

**Don't update worker directly** - update database:

1. Web app updates database table (e.g., `user_preferences`)
2. Worker reads on next execution (stateless)
3. Use database as single source of truth

### Real-time Updates

**Always use Supabase Realtime**:

- Worker broadcasts to user channel: `supabase.channel('user:${userId}').send(...)`
- Web subscribes to channel: `supabase.channel('user:${userId}').on('broadcast', ...)`
- No polling needed for real-time updates

## Conclusion

BuildOS uses a **queue-based, database-mediated architecture** that provides:

- ✅ **Reliable job processing** with atomic operations
- ✅ **Real-time updates** via Supabase Realtime
- ✅ **Simple scaling** with stateless workers
- ✅ **Security** via RLS and service roles
- ✅ **No direct coupling** between services

The system is designed for **horizontal scaling** and **eventual consistency**, with the database as the **single source of truth** for all state.
