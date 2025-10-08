---
title: Daily Brief Worker - Scheduling Patterns for SMS Implementation
type: research
status: completed
created: 2025-10-08T00:36:37Z
tags: [worker, scheduler, queue, timezone, sms, daily-briefs]
related_files:
  - /apps/worker/src/scheduler.ts
  - /apps/worker/src/worker.ts
  - /apps/worker/src/lib/supabaseQueue.ts
  - /apps/worker/src/workers/brief/briefWorker.ts
  - /apps/worker/src/workers/brief/briefGenerator.ts
---

# Daily Brief Worker - Scheduling Patterns for SMS Implementation

## Executive Summary

This document analyzes the daily brief generation flow in the worker service to extract reusable patterns for implementing timezone-aware SMS scheduling. The system uses a Redis-free, Supabase-based queue with cron scheduling, engagement backoff, and comprehensive error handling.

**Key Findings:**

- Scheduler runs hourly via cron to check user preferences
- Timezone-aware scheduling using `date-fns-tz`
- Atomic job claiming prevents duplicates
- Job adapter pattern for zero-downtime migrations
- Progress tracking with exponential backoff retries
- Engagement backoff system to throttle inactive users

---

## 1. Scheduler Architecture

### 1.1 Scheduler Setup (`/apps/worker/src/scheduler.ts`)

**Cron Pattern:**

```typescript
// Lines 121-132
cron.schedule("0 * * * *", async () => {
  console.log("🔍 Checking for scheduled briefs...");
  await checkAndScheduleBriefs();
});

// Also runs once at startup
setTimeout(() => {
  checkAndScheduleBriefs();
}, 5000);
```

**Key Characteristics:**

- **Frequency:** Every hour on the hour (`0 * * * *`)
- **Initial Run:** 5-second delay after startup
- **Polling Window:** Checks for briefs scheduled in the next hour
- **Batch Processing:** Handles multiple users in parallel

### 1.2 Timezone Handling Pattern

**Critical Implementation (Lines 440-463):**

```typescript
function calculateDailyRunTime(
  now: Date,
  hours: number,
  minutes: number,
  seconds: number,
  timezone: string,
): Date {
  // Get current time in user's timezone
  const nowInUserTz = utcToZonedTime(now, timezone);

  // Set target time for today with precise time (no milliseconds)
  let targetInUserTz = setHours(nowInUserTz, hours);
  targetInUserTz = setMinutes(targetInUserTz, minutes);
  targetInUserTz = setSeconds(targetInUserTz, seconds);
  targetInUserTz.setMilliseconds(0); // Ensure precise scheduling

  // If target time has passed today, schedule for tomorrow
  if (isBefore(targetInUserTz, nowInUserTz)) {
    targetInUserTz = addDays(targetInUserTz, 1);
  }

  // Convert back to UTC
  return zonedTimeToUtc(targetInUserTz, timezone);
}
```

**Pattern for SMS:**

1. Convert current UTC time to user's timezone
2. Set target time in user's timezone
3. If time has passed, schedule for tomorrow
4. Convert back to UTC for storage
5. Clear milliseconds for precise scheduling

### 1.3 Deduplication Strategy

**Job Deduplication (Lines 82-102):**

```typescript
// Calculate priority based on immediacy
const delay = Math.max(0, scheduledFor.getTime() - Date.now());
const isImmediate = delay < 60000; // Less than 1 minute
const priority = isImmediate ? 1 : 10;

// Create dedup key for this specific brief
const dedupKey = `brief-${userId}-${briefDate}`;

if (isImmediate) {
  // Atomically cancel any existing jobs for this date
  const { count } = await queue.cancelBriefJobsForDate(userId, briefDate);
  if (count > 0) {
    console.log(`🚫 Cancelled ${count} existing brief job(s)`);
  }
}

// Add job with dedup key
const job = await queue.add("generate_daily_brief", userId, jobData, {
  priority,
  scheduledFor,
  dedupKey: isImmediate ? `${dedupKey}-${Date.now()}` : dedupKey,
});
```

**Pattern for SMS:**

- Use `sms-${userId}-${targetDate}` as dedup key
- Immediate SMS (priority 1) vs scheduled (priority 10)
- Cancel existing jobs for same date when immediate send requested

---

## 2. Queue System Architecture

### 2.1 Supabase Queue (`/apps/worker/src/lib/supabaseQueue.ts`)

**Configuration (Lines 52-60):**

```typescript
constructor(options?: {
  pollInterval?: number;
  batchSize?: number;
  stalledTimeout?: number;
}) {
  this.pollInterval = options?.pollInterval ?? 5000; // 5 seconds
  this.batchSize = options?.batchSize ?? 5;
  this.stalledTimeout = options?.stalledTimeout ?? 300000; // 5 minutes
}
```

**Environment-based Config (`/apps/worker/src/config/queueConfig.ts`):**

```typescript
// Development (Lines 129-136)
export const developmentConfig: Partial<QueueConfiguration> = {
  pollInterval: 2000, // Faster polling
  batchSize: 2, // Smaller batches for debugging
  stalledTimeout: 120000, // Shorter timeout
  statsUpdateInterval: 30000, // More frequent stats
};

// Production (Lines 139-146)
export const productionConfig: Partial<QueueConfiguration> = {
  pollInterval: 5000, // Standard polling
  batchSize: 10, // Larger batches for throughput
  stalledTimeout: 600000, // Longer timeout
  statsUpdateInterval: 300000, // Less frequent stats (5 minutes)
};
```

### 2.2 Job Enqueuing Pattern

**Adding Jobs to Queue (Lines 65-105):**

```typescript
async add(
  jobType: JobType,
  userId: string,
  data: any,
  options?: JobOptions,
): Promise<QueueJob> {
  const dedupKey = options?.dedupKey ??
    `${jobType}-${userId}-${options?.scheduledFor?.toISOString() ?? Date.now()}`;

  // Use atomic database function for deduplication
  const { data: jobId, error } = await supabase.rpc("add_queue_job", {
    p_user_id: userId,
    p_job_type: jobType,
    p_metadata: data,
    p_priority: options?.priority ?? 10,
    p_scheduled_for: options?.scheduledFor?.toISOString() ?? new Date().toISOString(),
    p_dedup_key: dedupKey,
  });

  // Fetch the created job
  const { data: job, error: fetchError } = await supabase
    .from("queue_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  return job;
}
```

**Database RPC Function:** `add_queue_job`

- Atomic insertion with deduplication
- Returns job ID
- Handles concurrent requests safely

### 2.3 Job Processing Loop

**Polling and Claiming (Lines 168-226):**

```typescript
private async processJobs(): Promise<void> {
  if (this.isProcessing) return;

  this.isProcessing = true;
  try {
    // Claim jobs atomically
    const jobTypes = Array.from(this.processors.keys());
    const { data: jobs, error } = await supabase.rpc("claim_pending_jobs", {
      p_job_types: jobTypes,
      p_batch_size: this.batchSize,
    });

    if (!jobs || jobs.length === 0) {
      return; // No jobs to process
    }

    console.log(`🎯 Claimed ${jobs.length} job(s) for processing`);

    // Process jobs concurrently with error isolation
    const results = await Promise.allSettled(
      jobs.map((job) => this.processJob(job as QueueJob)),
    );

    // Log any failed jobs for monitoring
    const failedJobs = results
      .filter(({ result }) => result.status === "rejected")
      .map(({ result, index }) => ({
        jobId: jobs[index].queue_job_id,
        reason: (result as PromiseRejectedResult).reason,
      }));
  } finally {
    this.isProcessing = false;
  }
}
```

**Database RPC Function:** `claim_pending_jobs`

- Atomic batch claiming
- Prevents duplicate processing
- Returns only jobs matching registered types

---

## 3. Job Lifecycle

### 3.1 Job States

```
pending → processing → completed
   ↓           ↓
   ↓       → failed (with retry)
   ↓       → failed (max retries exceeded)
   ↓
→ cancelled
```

### 3.2 Job Adapter Pattern

**Purpose:** Zero-downtime migration from BullMQ to Supabase queues

**Implementation (`/apps/worker/src/workers/shared/jobAdapter.ts`):**

```typescript
export interface LegacyJob<T = any> {
  id: string;
  data: T & { userId: string };
  opts: { priority?: number };
  timestamp: number;
  attemptsMade: number;
  updateProgress: (progress: number | object) => Promise<void>;
  log: (message: string) => Promise<void>;
}

export function createLegacyJob<T>(
  processingJob: ProcessingJob<T>,
): LegacyJob<T> {
  const adapter = new JobAdapter(processingJob);
  return adapter.getLegacyJob();
}
```

**Usage in Worker (`/apps/worker/src/worker.ts`, Lines 36-57):**

```typescript
async function processBrief(job: ProcessingJob) {
  const jobType = job.data.priority === 1 ? "⚡ IMMEDIATE" : "📅 SCHEDULED";

  await job.log(`${jobType} brief started for user ${job.userId}`);

  try {
    // Convert ProcessingJob to type-safe legacy format
    const legacyJob = createLegacyJob(job);

    // Use existing brief processor with type-safe adapter
    await processBriefJob(legacyJob);

    const duration = Date.now() - startTime;
    await job.log(`✅ ${jobType} brief completed in ${duration}ms`);

    return { success: true, duration };
  } catch (error: any) {
    await job.log(`❌ ${jobType} brief failed: ${error.message}`);
    throw error;
  }
}
```

### 3.3 Job Registration

**Processor Registration (Lines 170-180):**

```typescript
queue.process("generate_daily_brief", processBrief);
queue.process("generate_brief_email", processEmailBrief);
queue.process("generate_phases", processPhases);
queue.process("onboarding_analysis", processOnboarding);
queue.process("send_notification", processNotificationWrapper);
queue.process("send_sms", processSMS);
```

**Pattern:**

1. Define processor function
2. Register with `queue.process(jobType, processorFn)`
3. Queue starts polling for registered job types

---

## 4. Progress Tracking

### 4.1 Progress Update Pattern

**Implementation (`/apps/worker/src/lib/progressTracker.ts`):**

```typescript
async updateProgress(
  jobId: string,
  progress: JobProgress,
  retryCount: number = 0,
): Promise<boolean> {
  try {
    // Validate progress data
    const validatedProgress = this.validateProgress(progress);

    // Get current job metadata
    const { data: currentJob, error: fetchError } = await supabase
      .from("queue_jobs")
      .select("metadata, status")
      .eq("id", jobId)
      .single();

    // Don't update progress for completed/failed/cancelled jobs
    if (!["pending", "processing"].includes(currentJob.status)) {
      console.warn(`⚠️ Skipping progress update for job ${jobId}`);
      return false;
    }

    // Merge with existing metadata safely
    const updatedMetadata = {
      ...currentMetadata,
      progress: validatedProgress,
      lastProgressUpdate: new Date().toISOString(),
    };

    // Update the job with validated progress
    const { error: updateError } = await supabase
      .from("queue_jobs")
      .update({
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("status", currentJob.status); // Optimistic lock

    return true;
  } catch (error) {
    return await this.handleProgressUpdateError(jobId, progress, retryCount, error);
  }
}
```

**Retry Logic with Exponential Backoff (Lines 207-235):**

```typescript
private async handleProgressUpdateError(
  jobId: string,
  progress: JobProgress,
  retryCount: number,
  error: any,
): Promise<boolean> {
  if (retryCount >= this.maxRetries) {
    console.error(`❌ Progress update failed after ${this.maxRetries} retries`);
    await this.logProgressUpdateFailure(jobId, progress, error);
    return false;
  }

  // Calculate exponential backoff delay
  const delay = this.retryDelayMs * Math.pow(2, retryCount);
  console.warn(`⚠️ Retrying in ${delay}ms (attempt ${retryCount + 1})`);

  // Wait before retry
  await new Promise((resolve) => setTimeout(resolve, delay));

  // Retry the update
  return await this.updateProgress(jobId, progress, retryCount + 1);
}
```

### 4.2 Progress Tracking in Brief Generator

**Example Usage (`/apps/worker/src/workers/brief/briefGenerator.ts`):**

```typescript
// Lines 150-154: Fetching projects
await updateProgress(
  dailyBrief.id,
  { step: "fetching_projects", progress: 10 },
  jobId,
);

// Lines 165-182: Generating project briefs
const projectBriefPromises = projects.map(async (project, i) => {
  const progress = 20 + (i / projects.length) * 60; // 20% to 80%

  await updateProgress(
    dailyBrief.id,
    {
      step: `processing_project_${project.name}`,
      progress: Math.round(progress),
    },
    jobId,
  );

  return await generateProjectBrief(project, briefDate, timezone);
});

// Lines 212-216: Consolidating briefs
await updateProgress(
  dailyBrief.id,
  { step: "consolidating_briefs", progress: 85 },
  jobId,
);

// Lines 234-238: LLM analysis
await updateProgress(
  dailyBrief.id,
  { step: "llm_analysis", progress: 90 },
  jobId,
);

// Lines 340-344: Finalizing
await updateProgress(
  dailyBrief.id,
  { step: "finalizing", progress: 95 },
  jobId,
);
```

---

## 5. Engagement Backoff System

### 5.1 Backoff Calculator (`/apps/worker/src/lib/briefBackoffCalculator.ts`)

**Backoff Schedule (Lines 28-34):**

```typescript
private readonly BACKOFF_SCHEDULE = {
  COOLING_OFF_DAYS: 2,
  FIRST_REENGAGEMENT: 4,
  SECOND_REENGAGEMENT: 10,
  THIRD_REENGAGEMENT: 31,
  RECURRING_INTERVAL: 31,
};
```

**Decision Logic (Lines 135-226):**

```typescript
private calculateBackoffDecision(
  daysSinceLastLogin: number,
  daysSinceLastBrief: number,
): BackoffDecision {
  // Days 0-2: Send normal briefs
  if (daysSinceLastLogin <= 2) {
    return {
      shouldSend: true,
      isReengagement: false,
      daysSinceLastLogin,
      reason: "User is active (logged in within 2 days)",
    };
  }

  // Days 2-4: Cooling off period (no emails)
  if (daysSinceLastLogin > 2 && daysSinceLastLogin < 4) {
    return {
      shouldSend: false,
      isReengagement: false,
      daysSinceLastLogin,
      reason: "Cooling off period (3 days inactive)",
    };
  }

  // Day 4: First re-engagement
  if (daysSinceLastLogin === 4 && daysSinceLastBrief >= 2) {
    return {
      shouldSend: true,
      isReengagement: true,
      daysSinceLastLogin,
      reason: "4-day re-engagement email",
    };
  }

  // Days 4-10: First backoff
  if (daysSinceLastLogin > 4 && daysSinceLastLogin < 10) {
    return { shouldSend: false, ... };
  }

  // Day 10: Second re-engagement
  if (daysSinceLastLogin === 10 && daysSinceLastBrief >= 6) {
    return {
      shouldSend: true,
      isReengagement: true,
      daysSinceLastLogin,
      reason: "10-day re-engagement email",
    };
  }

  // Days 10-31: Second backoff
  if (daysSinceLastLogin > 10 && daysSinceLastLogin < 31) {
    return { shouldSend: false, ... };
  }

  // Day 31+: Send every 31 days
  if (daysSinceLastLogin >= 31 && daysSinceLastBrief >= 31) {
    return {
      shouldSend: true,
      isReengagement: true,
      daysSinceLastLogin,
      reason: `31+ day re-engagement (${daysSinceLastLogin} days inactive)`,
    };
  }

  return { shouldSend: false, ... };
}
```

### 5.2 Integration with Scheduler

**Batch Engagement Check (`/apps/worker/src/scheduler.ts`, Lines 160-189):**

```typescript
// PHASE 1: Batch fetch engagement data for all users
const engagementDataMap = new Map();

if (ENGAGEMENT_BACKOFF_ENABLED) {
  console.log("🔍 Batch checking engagement status for all users...");
  const engagementChecks = await Promise.allSettled(
    preferences.map(async (preference) => {
      const decision = await backoffCalculator.shouldSendDailyBrief(
        preference.user_id,
      );
      return { userId: preference.user_id, decision };
    }),
  );

  engagementChecks.forEach((result) => {
    if (result.status === "fulfilled" && result.value) {
      const { userId, decision } = result.value;
      engagementDataMap.set(userId, decision);
    }
  });
}

// PHASE 2: Filter users based on engagement
for (const preference of preferences) {
  if (ENGAGEMENT_BACKOFF_ENABLED) {
    const backoffDecision = engagementDataMap.get(preference.user_id);

    if (!backoffDecision?.shouldSend) {
      console.log(`⏸️ Skipping brief for user: ${backoffDecision?.reason}`);
      continue;
    }

    engagementMetadata = {
      isReengagement: backoffDecision.isReengagement,
      daysSinceLastLogin: backoffDecision.daysSinceLastLogin,
    };
  }

  // Calculate next run time and queue job
  const nextRunTime = calculateNextRunTime(preference, now);
  usersToSchedule.push({ preference, nextRunTime, engagementMetadata });
}
```

**Feature Flag:**

```typescript
// Line 24
const ENGAGEMENT_BACKOFF_ENABLED =
  process.env.ENGAGEMENT_BACKOFF_ENABLED === "true";
```

---

## 6. Error Handling Patterns

### 6.1 Multi-Layer Error Isolation

**Job Processing (`/apps/worker/src/lib/supabaseQueue.ts`, Lines 231-273):**

```typescript
private async processJob(job: QueueJob): Promise<void> {
  // Outer try-catch: Catch-all for unexpected errors
  try {
    const processor = this.processors.get(job.job_type as JobType);
    if (!processor) {
      await this.failJob(job.id, `No processor for job type: ${job.job_type}`, false);
      return;
    }

    // Process the job with proper error handling
    await this.executeJobProcessor(job, processor, startTime);
  } catch (error) {
    console.error(`❌ Unexpected error processing job ${job.queue_job_id}:`, error);

    try {
      // Attempt to mark the job as failed
      await this.failJob(job.id, error.message, false);
    } catch (failError) {
      console.error(`❌ Failed to mark job as failed:`, failError);
    }
  }
}
```

**Processor Execution (Lines 276-330):**

```typescript
private async executeJobProcessor(
  job: QueueJob,
  processor: JobProcessor,
  startTime: number,
): Promise<void> {
  try {
    // Create processing job wrapper
    const processingJob: ProcessingJob = {
      id: job.queue_job_id,
      userId: job.user_id!,
      data: job.metadata,
      attempts: job.attempts || 0,

      updateProgress: async (progress: JobProgress) => {
        const success = await updateJobProgress(job.id, progress);
        if (!success) {
          // Log but don't throw - progress updates should not crash jobs
          console.warn(`⚠️ Progress update failed, continuing execution`);
        }
      },

      log: async (message: string) => {
        console.log(`   📝 [${job.queue_job_id}] ${message}`);
      },
    };

    // Process the job
    const result = await processor(processingJob);

    // Mark as completed
    await supabase.rpc("complete_queue_job", {
      p_job_id: job.id,
      p_result: result,
    });

    console.log(`✅ Completed ${job.job_type} job ${job.queue_job_id}`);
  } catch (error: any) {
    console.error(`❌ Job ${job.queue_job_id} failed:`, error);

    // Determine if we should retry
    const shouldRetry = (job.attempts || 0) < (job.max_attempts || 3);
    await this.failJob(job.id, error.message, shouldRetry);
  }
}
```

### 6.2 Graceful Degradation

**SMS Worker Example (`/apps/worker/src/workers/smsWorker.ts`):**

```typescript
// Lines 7-49: Conditional initialization
let twilioClient: TwilioClient | null = null;
let smsService: SMSService | null = null;

if (
  twilioConfig.accountSid &&
  twilioConfig.authToken &&
  twilioConfig.messagingServiceSid
) {
  try {
    twilioClient = new TwilioClient(twilioConfig);
    smsService = new SMSService(twilioClient, supabase);
    console.log("Twilio SMS service initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Twilio client:", error);
    twilioClient = null;
    smsService = null;
  }
} else {
  console.warn(
    "Twilio credentials not configured - SMS functionality disabled",
  );
}

// Lines 56-64: Graceful failure
export async function processSMSJob(job: LegacyJob<any>) {
  if (!twilioClient || !smsService) {
    const errorMessage =
      "SMS service not available - Twilio credentials not configured";
    console.error(errorMessage);
    await updateJobStatus(job.id, "failed", "send_sms", errorMessage);
    throw new Error(errorMessage);
  }

  // Continue processing...
}
```

---

## 7. Testing Patterns

### 7.1 Scheduler Tests (`/apps/worker/tests/scheduler.test.ts`)

**Key Test Cases:**

```typescript
// Lines 28-46: Daily brief scheduling
it("should schedule daily brief 24 hours apart", () => {
  const now = new Date("2024-01-15T10:00:00Z");
  const preference = {
    frequency: "daily",
    time_of_day: "09:00:00",
    timezone: "UTC",
  };

  const nextRun = calculateNextRunTime(preference, now);

  // Should schedule for tomorrow at 09:00 since 09:00 today has passed
  expect(nextRun).toEqual(new Date("2024-01-16T09:00:00Z"));
});

// Lines 67-84: Timezone handling
it("should handle different timezones correctly", () => {
  const now = new Date("2024-01-15T10:00:00Z"); // 10:00 UTC = 05:00 EST
  const preference = {
    frequency: "daily",
    time_of_day: "09:00:00",
    timezone: "America/New_York",
  };

  const nextRun = calculateNextRunTime(preference, now);

  // Should schedule for today at 09:00 EST (14:00 UTC)
  expect(nextRun).toEqual(new Date("2024-01-15T14:00:00Z"));
});

// Lines 86-104: Weekly frequency
it("should handle weekly frequency", () => {
  const now = new Date("2024-01-15T10:00:00Z"); // Monday
  const preference = {
    frequency: "weekly",
    day_of_week: 1, // Monday
    time_of_day: "09:00:00",
    timezone: "UTC",
  };

  const nextRun = calculateNextRunTime(preference, now);

  // Should schedule for next Monday since 09:00 today has passed
  expect(nextRun).toEqual(new Date("2024-01-22T09:00:00Z"));
});
```

---

## 8. Patterns for SMS Scheduling Implementation

### 8.1 Recommended Architecture

Based on the daily brief patterns, here's the recommended approach for SMS scheduling:

**1. Create SMS Preference Table:**

```sql
CREATE TABLE user_sms_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  is_active BOOLEAN DEFAULT true,
  frequency TEXT DEFAULT 'daily', -- 'daily', 'weekly', 'custom'
  time_of_day TIME DEFAULT '09:00:00',
  day_of_week INTEGER, -- 0-6 for weekly
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**2. Scheduler Function (similar to `checkAndScheduleBriefs`):**

```typescript
async function checkAndScheduleSMS() {
  const now = new Date();
  const oneHourFromNow = addHours(now, 1);

  // Get active SMS preferences
  const { data: preferences } = await supabase
    .from("user_sms_preferences")
    .select("*")
    .eq("is_active", true);

  // Calculate next run times
  const usersToSchedule = preferences.map((pref) => ({
    preference: pref,
    nextRunTime: calculateNextRunTime(pref, now),
  }));

  // Filter for jobs in next hour
  const toBatchSchedule = usersToSchedule.filter(
    ({ nextRunTime }) =>
      isAfter(nextRunTime, now) && isBefore(nextRunTime, oneHourFromNow),
  );

  // Batch check for existing jobs
  const { data: existingJobs } = await supabase
    .from("queue_jobs")
    .select("user_id, scheduled_for")
    .in("user_id", userIds)
    .eq("job_type", "send_daily_sms")
    .in("status", ["pending", "processing"]);

  // Queue jobs for users without existing jobs
  await Promise.allSettled(
    usersToQueue.map(({ preference, nextRunTime }) =>
      queue.add(
        "send_daily_sms",
        preference.user_id,
        {
          userId: preference.user_id,
          timezone: preference.timezone,
          scheduledDate: format(
            utcToZonedTime(nextRunTime, preference.timezone),
            "yyyy-MM-dd",
          ),
        },
        {
          priority: 10,
          scheduledFor: nextRunTime,
          dedupKey: `sms-${preference.user_id}-${format(nextRunTime, "yyyy-MM-dd")}`,
        },
      ),
    ),
  );
}
```

**3. Cron Schedule:**

```typescript
// Run every hour
cron.schedule("0 * * * *", async () => {
  console.log("🔍 Checking for scheduled SMS...");
  await checkAndScheduleSMS();
});
```

**4. SMS Job Processor:**

```typescript
async function processDailySMS(job: ProcessingJob) {
  const { userId, timezone, scheduledDate } = job.data;

  await job.log(`Starting daily SMS for user ${userId}`);
  await job.updateProgress({
    current: 1,
    total: 3,
    message: "Generating content",
  });

  // Generate SMS content (similar to brief generation)
  const smsContent = await generateDailySMSContent(
    userId,
    scheduledDate,
    timezone,
  );

  await job.updateProgress({ current: 2, total: 3, message: "Sending SMS" });

  // Queue SMS send job
  await queue.add(
    "send_sms",
    userId,
    {
      message_id: smsContent.id,
      phone_number: smsContent.phone_number,
      message: smsContent.message,
      priority: "normal",
    },
    {
      priority: 5,
      scheduledFor: new Date(),
    },
  );

  await job.updateProgress({ current: 3, total: 3, message: "SMS queued" });

  return { success: true, sms_id: smsContent.id };
}
```

### 8.2 Key Differences from Daily Briefs

| Aspect                 | Daily Briefs                            | SMS Scheduling                    |
| ---------------------- | --------------------------------------- | --------------------------------- |
| **Content Generation** | Complex (projects, tasks, LLM analysis) | Simple (pre-formatted text)       |
| **Engagement Backoff** | Yes (4, 10, 31 day schedule)            | Optional (simpler throttling)     |
| **Email vs SMS**       | Separate email job after brief          | Direct SMS send                   |
| **Progress Tracking**  | 10 steps (0-100%)                       | 3 steps (generate, send, confirm) |
| **Job Priority**       | Immediate (1) vs Scheduled (10)         | Normal (5)                        |

### 8.3 Reusable Components

**Direct Reuse (no changes needed):**

1. `calculateNextRunTime()` - Timezone-aware scheduling
2. `SupabaseQueue` - Queue management
3. `JobAdapter` - Legacy compatibility
4. `ProgressTracker` - Progress tracking
5. `queueConfig` - Environment configuration

**Adapt for SMS:**

1. `checkAndScheduleBriefs()` → `checkAndScheduleSMS()`
2. `BriefBackoffCalculator` → `SMSBackoffCalculator` (simpler logic)
3. `processBriefJob()` → `processDailySMS()`

---

## 9. File Reference Summary

### Core Scheduler Files

| File                                             | Lines | Purpose                                         |
| ------------------------------------------------ | ----- | ----------------------------------------------- |
| `/apps/worker/src/scheduler.ts`                  | 1-554 | Cron scheduler, timezone handling, job queueing |
| `/apps/worker/src/lib/supabaseQueue.ts`          | 1-575 | Queue implementation, job claiming, processing  |
| `/apps/worker/src/config/queueConfig.ts`         | 1-225 | Environment-based configuration                 |
| `/apps/worker/src/lib/progressTracker.ts`        | 1-318 | Progress tracking with retries                  |
| `/apps/worker/src/lib/briefBackoffCalculator.ts` | 1-228 | Engagement-based throttling                     |

### Worker Processing Files

| File                                               | Lines  | Purpose                              |
| -------------------------------------------------- | ------ | ------------------------------------ |
| `/apps/worker/src/worker.ts`                       | 1-250  | Worker setup, processor registration |
| `/apps/worker/src/workers/brief/briefWorker.ts`    | 1-328  | Brief job processing                 |
| `/apps/worker/src/workers/brief/briefGenerator.ts` | 1-1312 | Brief content generation             |
| `/apps/worker/src/workers/shared/jobAdapter.ts`    | 1-163  | BullMQ compatibility adapter         |
| `/apps/worker/src/workers/shared/queueUtils.ts`    | 1-133  | Job status updates, notifications    |

### Reference Implementations

| File                                                          | Lines | Purpose                           |
| ------------------------------------------------------------- | ----- | --------------------------------- |
| `/apps/worker/src/workers/smsWorker.ts`                       | 1-173 | SMS job processing example        |
| `/apps/worker/src/workers/notification/notificationWorker.ts` | 1-532 | Multi-channel notification worker |
| `/apps/worker/tests/scheduler.test.ts`                        | 1-222 | Scheduler unit tests              |

---

## 10. Key Takeaways for SMS Implementation

### Critical Patterns to Replicate

1. **Timezone-Aware Scheduling:**
   - Convert to user TZ → Calculate target time → Convert to UTC
   - Clear milliseconds for precise scheduling
   - Handle "time has passed today" logic

2. **Atomic Job Management:**
   - Use database RPCs for atomic operations
   - Deduplication via `dedupKey`
   - Batch checking for existing jobs

3. **Error Isolation:**
   - Multi-layer try-catch blocks
   - Promise.allSettled for parallel operations
   - Graceful degradation for missing services

4. **Progress Tracking:**
   - Update at key milestones
   - Exponential backoff for retries
   - Don't fail job if progress update fails

5. **Testing Strategy:**
   - Test timezone conversions
   - Test scheduling logic (today vs tomorrow)
   - Test weekly vs daily frequencies

### Environment Configuration

```bash
# SMS-specific environment variables to add:
QUEUE_POLL_INTERVAL=5000          # Reuse existing
QUEUE_BATCH_SIZE=5                # Reuse existing
QUEUE_STALLED_TIMEOUT=300000      # Reuse existing
SMS_BACKOFF_ENABLED=true          # New: Enable SMS throttling
SMS_DAILY_SEND_TIME=09:00:00      # New: Default send time
SMS_TIMEZONE_DEFAULT=UTC          # New: Default timezone
```

### Next Steps

1. **Create SMS preference table** with timezone support
2. **Implement `checkAndScheduleSMS()`** using daily brief pattern
3. **Add `processDailySMS()` processor** to worker
4. **Register cron job** for hourly checks
5. **Add tests** for timezone handling and scheduling logic
6. **Implement optional engagement backoff** for SMS

---

## Conclusion

The daily brief worker provides a robust, production-tested foundation for implementing timezone-aware SMS scheduling. The key patterns—timezone handling, atomic job management, error isolation, and progress tracking—can be directly applied to SMS scheduling with minimal modifications.

The scheduler's hourly cron pattern with next-hour lookahead provides an efficient balance between responsiveness and database load. The engagement backoff system demonstrates how to implement sophisticated throttling while maintaining good user experience.

For SMS implementation, reuse the core scheduling logic (`calculateNextRunTime`), queue infrastructure (`SupabaseQueue`), and job lifecycle patterns, while simplifying the content generation and removing the email-specific complexity.
