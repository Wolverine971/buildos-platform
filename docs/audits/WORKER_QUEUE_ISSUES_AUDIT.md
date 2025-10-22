# Worker Service Queue and Job System Issues - Comprehensive Audit

## Executive Summary

This is a detailed analysis of the BuildOS worker service queue and job system, focusing on runtime issues that could cause system failures. The system uses Supabase-based queues with atomic job claiming (no Redis), but has several critical issues that could break the system.

**Critical Issues Found: 4**
**High Priority Issues: 7**  
**Medium Priority Issues: 6**

---

## CRITICAL ISSUES

### 1. Missing Global Uncaught Exception Handlers

**File:** `/apps/worker/src/index.ts`  
**Lines:** N/A (Issue: Missing handlers)

**Problem:**
The application only handles `SIGTERM` and `SIGINT` but has NO handlers for:

- `uncaughtException`
- `unhandledRejection`

**Impact:**
If any job processor throws an unhandled error or returns a rejected promise, the entire worker process will crash without proper cleanup. This will:

- Terminate all in-flight jobs abruptly
- Leave jobs marked as "processing" forever (stalled)
- Take down the entire worker service

**Example Scenario:**

```typescript
// In a job processor, if this happens:
async function processSomeJob(job: ProcessingJob) {
	const result = await someAsyncOperation(); // Throws unhandled error
	// Worker crashes without cleanup
}
```

**Fix Location:** `/apps/worker/src/index.ts` - Add to startup function:

```typescript
process.on('uncaughtException', (error) => {
	console.error('Uncaught Exception:', error);
	queue.stop();
	process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
	console.error('Unhandled Rejection at:', promise, 'reason:', reason);
	queue.stop();
	process.exit(1);
});
```

---

### 2. Race Condition in Job Claiming - Concurrent Processing Flag

**File:** `/apps/worker/src/lib/supabaseQueue.ts`  
**Lines:** 136-140, 168-171

**Problem:**

```typescript
this.processingInterval = setInterval(async () => {
	if (!this.isProcessing) {
		await this.processJobs(); // Async operation
	}
}, this.pollInterval);
```

The `isProcessing` flag check happens BEFORE the `await`, so multiple intervals can enter `processJobs()` simultaneously:

1. Interval 1 checks `isProcessing` (false) → enters processJobs()
2. **Before setting `isProcessing = true`**, Interval 2 also checks (still false) → enters processJobs()
3. Both now try to claim jobs from RPC simultaneously

This causes:

- Duplicate job claims (same job claimed by multiple workers)
- Duplicate processing
- Data corruption/race conditions

**Actual Code Flow:**

```typescript
async processJobs(): Promise<void> {
  if (this.isProcessing) return;      // Line 169: Too late, multiple threads here

  this.isProcessing = true;            // Line 171: Flag set, but race already happened
  try {
    const { data: jobs, error } = await supabase.rpc("claim_pending_jobs", {
      // Multiple callers can reach here before first one completes
    });
```

**Fix:** Use atomic flag or mutex pattern:

```typescript
private async processJobs(): Promise<void> {
  if (this.isProcessing) return;

  this.isProcessing = true;  // Must set IMMEDIATELY
  try {
    // ... rest of logic
  } finally {
    this.isProcessing = false;
  }
}
```

---

### 3. Stalled Jobs Recovery Never Kicks In Properly

**File:** `/apps/worker/src/lib/supabaseQueue.ts`  
**Lines:** 142-145

**Problem:**
The stalled job recovery interval is set to fire every 60 seconds:

```typescript
this.stalledJobInterval = setInterval(async () => {
	await this.recoverStalledJobs();
}, 60000); // 60 seconds
```

But there's no error handling for failures:

```typescript
private async recoverStalledJobs(): Promise<void> {
  try {
    const { data: count, error } = await supabase.rpc("reset_stalled_jobs", {
      p_stall_timeout: `${this.stalledTimeout / 1000} seconds`,
    });
    // ...
  } catch (error) {
    console.error("❌ Error in stalled job recovery:", error);
    // NO RETRY LOGIC - just logs and moves on
  }
}
```

**Impact:**

- If the RPC call fails even once, stalled job recovery stops silently
- Jobs stuck in "processing" state for hours won't be recovered
- Worker appears healthy but jobs are rotting

**Affected Code:**

- `/apps/worker/src/lib/supabaseQueue.ts` lines 354-371

---

### 4. Job Retry Logic Has Hardcoded Defaults Without Configuration

**File:** `/apps/worker/src/lib/supabaseQueue.ts`  
**Lines:** 327

**Problem:**

```typescript
private async executeJobProcessor(
  job: QueueJob,
  processor: JobProcessor,
  startTime: number,
): Promise<void> {
  try {
    // ... processing
  } catch (error: any) {
    const shouldRetry = (job.attempts || 0) < (job.max_attempts || 3);
    //                                                        ↑↑ HARDCODED DEFAULT
    await this.failJob(job.id, error.message || "Unknown error", shouldRetry);
  }
}
```

**Issues:**

1. Default of 3 retries is hardcoded instead of using `queueConfig.maxRetries`
2. No exponential backoff in retry logic - jobs retry immediately
3. No way to configure retry behavior globally - must be set per job
4. Creates inconsistency when configuration is changed

**Config Location:** `/apps/worker/src/config/queueConfig.ts` defines `maxRetries` but it's NOT used in queue.ts

---

## HIGH PRIORITY ISSUES

### 5. Job Data Validation Missing Before Processing

**File:** `/apps/worker/src/workers/shared/queueUtils.ts`  
**Lines:** 14-56

**Problem:**
Job data interfaces define optional fields, but processors don't validate:

```typescript
export interface BriefJobData extends ... {
  userId: string;
  briefDate?: string;      // Optional but required
  timezone?: string;       // Optional but required
  // ...
}
```

In briefWorker.ts (lines 31-68), it handles missing data with fallbacks:

```typescript
let briefDate = job.data.briefDate;
if (!briefDate) {
	// Falls back to "today" - but what if timezone is wrong?
}
```

**Issues:**

- No validation errors thrown early
- Silent fallbacks can mask configuration problems
- Processor receives invalid data but doesn't fail - logs warning instead

**Impact Examples:**

1. User has timezone stored as "America/New_Yor" (typo) - silently falls back to UTC
2. Brief date in wrong format "2025-13-45" - processor calculates wrong day
3. JobData is empty object - defaults apply but intent is unknown

---

### 6. Job Progress Updates Fail Silently in Production

**File:** `/apps/worker/src/lib/supabaseQueue.ts`  
**Lines:** 291-298

**Problem:**

```typescript
updateProgress: async (progress: JobProgress) => {
  const success = await updateJobProgress(job.id, progress);
  if (!success) {
    console.warn(
      `⚠️ Progress update failed for job ${job.queue_job_id}, continuing with job execution`,
    );
    // CONTINUES SILENTLY - progress tracking is lost
  }
},
```

In production with `enableAuditLog: false` (line 306 in progressTracker.ts):

- Progress update failures just log to console.warn
- No retry - just gives up
- Job appears to be hung (no progress updates)

**Impact:**

- Real-time UI shows stalled progress
- Monitoring systems can't track job progress
- If brief generation takes 5 minutes, UI shows 0% for entire time

---

### 7. Scheduler Creates Jobs With Inconsistent Timezone Handling

**File:** `/apps/worker/src/scheduler.ts`  
**Lines:** 59-68, 289-315

**Problem:**
Timezone is fetched twice in scheduler with different fallbacks:

```typescript
// Line 59-67: First fetch during queueBriefGeneration
const { data: user } = await supabase.from('users').select('timezone').eq('id', userId).single();

const userTimezone = (user as any)?.timezone || timezone || 'UTC';

// Line 197-211: Second batch fetch during checkAndScheduleBriefs
const { data: users } = await supabase.from('users').select('id, timezone').in('id', userIds);

const userTimezoneMap = new Map<string, string>();
(users as any)?.forEach((user: any) => {
	if (user.id && user.timezone) {
		userTimezoneMap.set(user.id, user.timezone); // ONLY sets if timezone exists
	}
});

// Line 292: Used without null-check fallback
userTimezoneMap.get(preference.user_id) || 'UTC';
```

**Race Condition:**
Between lines 197-211 batch fetch and line 289-315 actual scheduling, user timezone can:

- Be deleted from database
- Be set to invalid value
- Map lookup returns undefined

---

### 8. Scheduler Engagement Backoff Can Consume All DB Connections

**File:** `/apps/worker/src/scheduler.ts`  
**Lines:** 224-242

**Problem:**

```typescript
if (ENGAGEMENT_BACKOFF_ENABLED) {
	const engagementChecks = await Promise.allSettled(
		preferences.map(async (preference) => {
			if (!preference.user_id) return null;
			const decision = await backoffCalculator.shouldSendDailyBrief(preference.user_id);
			// Each user makes a DB query to backoffCalculator
			return { userId: preference.user_id, decision };
		})
	);
}
```

**Issue:**

- If 1000 users need briefs, this fires 1000 concurrent DB queries
- Each `shouldSendDailyBrief` call queries database (engagement data)
- No connection pooling limit checked
- Supabase has max connection limit (likely 100-200)

**Impact:**

- DB connections exhaust
- Scheduler hangs
- All subsequent jobs queue but never process

---

### 9. Email Job Queueing Doesn't Wait for Completion

**File:** `/apps/worker/src/workers/brief/briefGenerator.ts`  
**Lines:** ~200-250 (estimated based on structure)

**Problem:**
In briefGenerator.ts, after generating brief, email job is queued with no verification:

```typescript
// Queue email job (non-blocking)
const emailJob = await queue.add('generate_brief_email', userId, jobData, {
	// No await for confirmation
});

// Could return before email job is actually in queue
return brief;
```

**Issue:**

- No validation that email job was actually queued
- No error handling if email queue fails
- Brief marked complete but email job might not be queued
- User gets notification brief is ready but never receives email

---

## MEDIUM PRIORITY ISSUES

### 10. Scheduler Batch Operations Lack Atomic Error Handling

**File:** `/apps/worker/src/scheduler.ts`  
**Lines:** 376-401

**Problem:**

```typescript
const queueResults = await Promise.allSettled(
  usersToQueue.map(async (...) => {
    await queueBriefGeneration(...);  // Each can fail independently
    return preference.user_id;
  }),
);

// Only LOGS failures after all settle
const failureCount = queueResults.filter(
  (r) => r.status === "rejected",
).length;

console.warn(`⚠️ Failed to queue ${failureCount} brief(s)`);
```

**Issues:**

1. Failed jobs aren't retried - silently skipped for this hour
2. No alert if 50% of users fail to queue
3. No metrics sent to monitoring system
4. Loop continues even if pattern indicates system failure

---

### 11. SMS Safety Checks Can Trigger Silent Failures

**File:** `/apps/worker/src/workers/notification/smsAdapter.ts`  
**Lines:** 642-743

**Problem:**

```typescript
const safetyCheck = await performSMSSafetyChecks(
  delivery.recipient_user_id,
  supabase,
  { sendTime: new Date() },
);

if (!safetyCheck.allowed) {
  if (safetyCheck.checks.quietHours.inQuietHours) {
    // Reschedule... but what if rescheduling fails?
    const { error: rescheduleError } = await supabase
      .from("notification_deliveries")
      .update({ ... })
      .eq("id", delivery.id);

    if (rescheduleError) {
      smsLogger.error(
        "Failed to reschedule delivery for quiet hours",
        rescheduleError,
      );
      // Logs error but returns failure anyway
      return { success: false, error: `Rescheduled due to quiet hours...` };
    }
  }
}
```

**Issue:**
When rescheduling fails:

- SMS marked as failed (not pending)
- Notification delivery stuck in limbo
- User never gets SMS (even after quiet hours end)

---

### 12. Progress Tracker Exponential Backoff Can Delay Jobs

**File:** `/apps/worker/src/lib/progressTracker.ts`  
**Lines:** 207-235

**Problem:**

```typescript
private async handleProgressUpdateError(...): Promise<boolean> {
  if (retryCount >= this.maxRetries) {
    return false;
  }

  const delay = this.retryDelayMs * Math.pow(2, retryCount);
  // Retry 3 times: 1s, 2s, 4s = 7 seconds total delay

  await new Promise((resolve) => setTimeout(resolve, delay));
  return await this.updateProgress(jobId, progress, retryCount + 1);
}
```

**Issue:**

- If progress tracking DB is slow, job execution blocks for 7 seconds per progress update
- Progress updates can happen frequently (every step)
- If update fails twice, job waits 4 seconds just for progress update
- Multiple failures compound: 7s per update × multiple updates = 30+ second delay

**Impact:**

- Job completion delayed artificially
- Queue appears backed up when it's just progress tracking
- Slow jobs look like hung jobs

---

### 13. Queue Statistics Endpoint Can Timeout Under Load

**File:** `/apps/worker/src/index.ts`  
**Lines:** 105-134

**Problem:**

```typescript
app.get("/health", async (_req, res) => {
  try {
    const statsPromise = queue.getStats();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Stats timeout")), 5000),
    );

    const stats = await Promise.race([statsPromise, timeoutPromise]).catch(
      () => null,
    );
    // ...
  }
});
```

**Issue:**

- Stats query can take >5 seconds under heavy load
- Health check endpoint hangs
- Load balancers might mark worker unhealthy
- Container orchestration kills "unhealthy" worker
- Cascading failure: healthy worker marked unhealthy, gets killed, more jobs back up

**Root Cause:**

- `queue.getStats()` queries `queue_jobs_stats` materialized view
- View query can be slow if many jobs exist
- No query timeout on Supabase side

---

### 14. Job Metadata Type Casting Not Validated

**File:** `/apps/worker/src/workers/brief/briefWorker.ts`  
**Lines:** 50-52, 66-67

**Problem:**

```typescript
// Type assertion without validation
let timezone = (user as any)?.timezone || job.data.timezone || 'UTC';
```

And in timezone validation:

```typescript
function isValidTimezone(timezone: string): boolean {
	try {
		getTimezoneOffset(timezone, new Date());
		return true;
	} catch (error) {
		return false; // Only logs warning, doesn't throw
	}
}
```

**Issue:**

- `as any` casting bypasses TypeScript safety
- Invalid timezone silently converts to UTC
- No alert that something is wrong with user config
- Monitoring systems see timezone as always UTC for some users

---

### 15. Scheduler Can Miss Briefs During Daylight Savings Time

**File:** `/apps/worker/src/scheduler.ts`  
**Lines:** 519-542 (calculateDailyRunTime)

**Problem:**
During DST transition:

```typescript
function calculateDailyRunTime(
	now: Date,
	hours: number,
	minutes: number,
	seconds: number,
	timezone: string
): Date {
	const nowInUserTz = utcToZonedTime(now, timezone);
	// At 2 AM spring forward: clocks jump to 3 AM
	// calculateDailyRunTime scheduled for 2:30 AM will:
	// 1. Not exist today (skips to tomorrow)
	// 2. Might be 7+ hours early/late

	let targetInUserTz = setHours(nowInUserTz, hours);
	targetInUserTz = setMinutes(targetInUserTz, minutes);
	targetInUserTz = setSeconds(targetInUserTz, seconds);
	// ...
}
```

**Issue:**
No special handling for DST transitions - briefs can be scheduled during non-existent times or wrong times entirely.

---

## DETAILED REMEDIATION PRIORITIES

### Priority 1 (Fix Immediately)

1. Add global uncaught exception handlers
2. Fix race condition in job claiming
3. Add retry logic to stalled job recovery
4. Use config values instead of hardcoded retry defaults

### Priority 2 (Fix This Sprint)

5. Add validation to job data before processing
6. Implement proper retry/backoff for progress tracking
7. Add monitoring alerts for batch operation failures
8. Implement database connection pooling checks in scheduler

### Priority 3 (Fix Next Sprint)

9. Add atomic error handling for email job queueing
10. Improve SMS safety check error handling
11. Optimize stats query or implement caching
12. Add test coverage for timezone edge cases (DST)

---

## Files Requiring Attention

**Critical:**

- `/apps/worker/src/lib/supabaseQueue.ts` - Core queue logic
- `/apps/worker/src/index.ts` - Process-level error handling
- `/apps/worker/src/scheduler.ts` - Engagement backoff and DST handling

**High:**

- `/apps/worker/src/workers/notification/smsAdapter.ts` - SMS safety checks
- `/apps/worker/src/lib/progressTracker.ts` - Progress update retry logic
- `/apps/worker/src/workers/brief/briefGenerator.ts` - Email job queueing

**Medium:**

- `/apps/worker/src/workers/shared/queueUtils.ts` - Job data validation
- `/apps/worker/src/workers/brief/briefWorker.ts` - Timezone handling
- `/apps/worker/src/config/queueConfig.ts` - Configuration application

---

## Testing Recommendations

1. **Load test:** 1000 concurrent briefs - monitor DB connections
2. **Chaos test:** Kill Supabase connection during progress update
3. **DST test:** Run scheduler during daylight savings transitions
4. **Recovery test:** Mark jobs as "processing", restart worker, verify stalled recovery
5. **Duplicate test:** Send rapid API requests while processing same job
