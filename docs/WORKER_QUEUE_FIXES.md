# Worker Queue System - Fix Examples

This document provides code examples for fixing the critical issues identified in the audit.

## CRITICAL FIX #1: Add Global Exception Handlers

**File:** `/apps/worker/src/index.ts`

**Current Code (Missing):**

```typescript
// Nothing - process crashes on unhandled errors
```

**Fixed Code:**
Add this to the `start()` function BEFORE starting the server:

```typescript
async function start() {
  try {
    // Add global error handlers FIRST
    process.on("uncaughtException", (error) => {
      console.error("🚨 CRITICAL: Uncaught Exception", error);
      console.error("Stack:", error.stack);
      // Gracefully shutdown queue
      try {
        queue.stop();
      } catch (e) {
        console.error("Failed to stop queue:", e);
      }
      // Exit to allow restart
      process.exit(1);
    });

    process.on("unhandledRejection", (reason, promise) => {
      console.error("🚨 CRITICAL: Unhandled Rejection");
      console.error("Promise:", promise);
      console.error("Reason:", reason);
      // Gracefully shutdown queue
      try {
        queue.stop();
      } catch (e) {
        console.error("Failed to stop queue:", e);
      }
      // Exit to allow restart
      process.exit(1);
    });

    // Start the worker
    await startWorker();
    // ... rest of startup
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}
```

---

## CRITICAL FIX #2: Fix Race Condition in Job Claiming

**File:** `/apps/worker/src/lib/supabaseQueue.ts`

**Problem:** Multiple intervals can enter processJobs() simultaneously

**Current Code (Line 168-171):**

```typescript
private async processJobs(): Promise<void> {
  if (this.isProcessing) return;        // Check happens before await

  this.isProcessing = true;              // Set after check - RACE CONDITION
  try {
    const { data: jobs, error } = await supabase.rpc("claim_pending_jobs", {
      // Multiple calls here at same time
    });
```

**Fixed Code:**

```typescript
private async processJobs(): Promise<void> {
  if (this.isProcessing) return;

  this.isProcessing = true;
  try {
    // Now guaranteed only one execution at a time
    const { data: jobs, error } = await supabase.rpc("claim_pending_jobs", {
      p_job_types: jobTypes,
      p_batch_size: this.batchSize,
    });

    if (error) {
      console.error("❌ Error claiming jobs:", error);
      return;
    }

    if (!jobs || jobs.length === 0) {
      return;
    }

    console.log(`🎯 Claimed ${jobs.length} job(s) for processing`);

    // Process jobs concurrently with proper error isolation
    const results = await Promise.allSettled(
      jobs.map((job) => this.processJob(job as QueueJob)),
    );

    // ... rest of error handling
  } catch (error) {
    console.error("❌ Error in job processing loop:", error);
  } finally {
    // CRITICAL: Always reset flag, even on error
    this.isProcessing = false;
  }
}
```

Key Change: Add `finally` block to ALWAYS reset `isProcessing` flag.

---

## CRITICAL FIX #3: Add Retry Logic to Stalled Job Recovery

**File:** `/apps/worker/src/lib/supabaseQueue.ts`

**Current Code (Lines 354-371):**

```typescript
private async recoverStalledJobs(): Promise<void> {
  try {
    const { data: count, error } = await supabase.rpc("reset_stalled_jobs", {
      p_stall_timeout: `${this.stalledTimeout / 1000} seconds`,
    });

    if (error) {
      console.error("❌ Error recovering stalled jobs:", error);
      return;  // NO RETRY - SILENT FAILURE
    }

    if (count && count > 0) {
      console.log(`🔄 Recovered ${count} stalled job(s)`);
    }
  } catch (error) {
    console.error("❌ Error in stalled job recovery:", error);
  }
}
```

**Fixed Code:**

```typescript
private stalledJobRetryCount = 0;
private readonly MAX_STALLED_RETRIES = 3;

private async recoverStalledJobs(): Promise<void> {
  try {
    const { data: count, error } = await supabase.rpc("reset_stalled_jobs", {
      p_stall_timeout: `${this.stalledTimeout / 1000} seconds`,
    });

    if (error) {
      this.stalledJobRetryCount++;

      if (this.stalledJobRetryCount >= this.MAX_STALLED_RETRIES) {
        console.error(
          `❌ CRITICAL: Stalled job recovery failed ${this.MAX_STALLED_RETRIES} times:`,
          error
        );
        // In production, alert ops team here
        this.stalledJobRetryCount = 0; // Reset for next attempt
      } else {
        console.warn(
          `⚠️ Stalled job recovery failed (attempt ${this.stalledJobRetryCount}/${this.MAX_STALLED_RETRIES}):`,
          error.message
        );
      }
      return;
    }

    // Reset on success
    this.stalledJobRetryCount = 0;

    if (count && count > 0) {
      console.log(`🔄 Recovered ${count} stalled job(s)`);
    }
  } catch (error) {
    console.error("❌ Unexpected error in stalled job recovery:", error);
    this.stalledJobRetryCount++;

    if (this.stalledJobRetryCount >= this.MAX_STALLED_RETRIES) {
      console.error(
        `❌ CRITICAL: Stalled job recovery crashes repeatedly - check database connection`
      );
      this.stalledJobRetryCount = 0;
    }
  }
}
```

---

## CRITICAL FIX #4: Use Config Values for Retry Defaults

**File:** `/apps/worker/src/lib/supabaseQueue.ts`

**Current Code (Line 327):**

```typescript
const shouldRetry = (job.attempts || 0) < (job.max_attempts || 3);
//                                                        ↑↑ HARDCODED
```

**Fixed Code:**
Import config at top:

```typescript
import { queueConfig } from "../config/queueConfig";
```

Then in executeJobProcessor:

```typescript
private async executeJobProcessor(
  job: QueueJob,
  processor: JobProcessor,
  startTime: number,
): Promise<void> {
  try {
    // ... processing code
  } catch (error: any) {
    console.error(`❌ Job ${job.queue_job_id} failed:`, error);

    // Use configuration instead of hardcoded value
    const maxRetries = job.max_attempts || queueConfig.maxRetries;
    const shouldRetry = (job.attempts || 0) < maxRetries;

    await this.failJob(job.id, error.message || "Unknown error", shouldRetry);
  }
}
```

---

## HIGH PRIORITY FIX #5: Add Job Data Validation

**File:** `/apps/worker/src/workers/shared/queueUtils.ts`

**New Validation Function:**

```typescript
/**
 * Validate BriefJobData and throw if invalid
 */
export function validateBriefJobData(data: any): BriefJobData {
  // Check userId
  if (!data.userId || typeof data.userId !== "string") {
    throw new Error("Invalid job data: userId is required and must be string");
  }

  // Validate briefDate if provided
  if (data.briefDate) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(data.briefDate)) {
      throw new Error(
        `Invalid job data: briefDate must be YYYY-MM-DD format, got "${data.briefDate}"`,
      );
    }

    // Validate date is reasonable (not in future by more than 30 days)
    const jobDate = new Date(data.briefDate);
    const maxFuture = new Date();
    maxFuture.setDate(maxFuture.getDate() + 30);

    if (jobDate > maxFuture) {
      throw new Error(`Invalid job data: briefDate too far in future`);
    }
  }

  // Validate timezone if provided
  if (data.timezone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: data.timezone });
    } catch (e) {
      throw new Error(
        `Invalid job data: timezone "${data.timezone}" is not valid`,
      );
    }
  }

  return data as BriefJobData;
}
```

**Usage in briefWorker.ts:**

```typescript
export async function processBriefJob(job: LegacyJob<BriefJobData>) {
  console.log(`🏃 Processing brief job ${job.id} for user ${job.data.userId}`);

  try {
    // Validate job data immediately
    const validatedData = validateBriefJobData(job.data);

    await updateJobStatus(job.id, "processing", "brief");

    // ... rest of processing with validated data
```

---

## HIGH PRIORITY FIX #6: Implement Proper Progress Update Retry

**File:** `/apps/worker/src/lib/progressTracker.ts`

**Current Issue:** Progress updates with exponential backoff cause job delays

**Improved Approach:**

```typescript
/**
 * Update progress with smart retry strategy
 */
async updateProgress(
  jobId: string,
  progress: JobProgress,
  retryCount: number = 0,
): Promise<boolean> {
  try {
    // Validate progress data
    const validatedProgress = this.validateProgress(progress);

    // Quick operation - single attempt first
    const { error: updateError } = await supabase
      .from("queue_jobs")
      .update({
        metadata: {
          ...currentMetadata,
          progress: validatedProgress,
          lastProgressUpdate: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("status", currentJob.status);

    if (!updateError) {
      return true; // Success - no retry needed
    }

    // Only retry if it's a temporary error
    const isTemporaryError =
      updateError.message?.includes('connection') ||
      updateError.message?.includes('timeout') ||
      updateError.message?.includes('429'); // Rate limit

    if (!isTemporaryError || retryCount >= this.maxRetries) {
      console.warn(
        `Progress update failed permanently for job ${jobId}:`,
        updateError.message
      );
      // Don't block job execution for progress tracking failure
      return false;
    }

    // Use smaller backoff for progress tracking (50ms, 100ms, 200ms)
    const delay = 50 * Math.pow(2, retryCount);

    console.warn(
      `Progress update temporary failure, retrying in ${delay}ms (${retryCount + 1}/${this.maxRetries})`
    );

    await new Promise((resolve) => setTimeout(resolve, delay));
    return await this.updateProgress(jobId, progress, retryCount + 1);
  } catch (error) {
    console.error(`Unexpected error in progress update:`, error);
    return false;
  }
}
```

---

## HIGH PRIORITY FIX #7: Add DB Connection Monitoring

**File:** `/apps/worker/src/scheduler.ts`

**Before engagement backoff:**

```typescript
async function checkAndScheduleBriefs() {
  try {
    // ... existing code ...

    if (ENGAGEMENT_BACKOFF_ENABLED && preferences.length > 0) {
      console.log("🔍 Batch checking engagement status for all users...");

      // IMPORTANT: Limit concurrent queries to prevent connection exhaustion
      const MAX_CONCURRENT_CHECKS = 20; // Conservative limit
      const failedChecks: string[] = [];

      for (let i = 0; i < preferences.length; i += MAX_CONCURRENT_CHECKS) {
        const batch = preferences.slice(i, i + MAX_CONCURRENT_CHECKS);

        const engagementChecks = await Promise.allSettled(
          batch.map(async (preference) => {
            if (!preference.user_id) return null;
            try {
              const decision = await backoffCalculator.shouldSendDailyBrief(
                preference.user_id,
              );
              return { userId: preference.user_id, decision };
            } catch (error) {
              failedChecks.push(preference.user_id);
              console.error(
                `Failed to check engagement for user ${preference.user_id}:`,
                error
              );
              return null;
            }
          }),
        );

        // Process results
        engagementChecks.forEach((result) => {
          if (result.status === "fulfilled" && result.value) {
            const { userId, decision } = result.value;
            engagementDataMap.set(userId, decision);
          }
        });

        // Log batch progress
        if (i + MAX_CONCURRENT_CHECKS < preferences.length) {
          console.log(
            `Processed ${Math.min(i + MAX_CONCURRENT_CHECKS, preferences.length)}/${preferences.length} users`
          );
        }
      }

      if (failedChecks.length > 0) {
        console.warn(
          `⚠️ Failed to check engagement for ${failedChecks.length} users`
        );
      }
    }
```

---

## Summary of Key Changes

| Issue                    | Fix                     | Impact                            |
| ------------------------ | ----------------------- | --------------------------------- |
| Uncaught exceptions      | Add process.on handlers | Prevents process crash            |
| Job claiming race        | Add finally block       | Prevents duplicate processing     |
| Stalled recovery fails   | Add retry counter       | Recovers stuck jobs               |
| Hardcoded retries        | Use config.maxRetries   | Respects configuration            |
| No validation            | validateBriefJobData()  | Catches errors early              |
| Silent progress failure  | Smarter retry logic     | Doesn't delay jobs                |
| DB connection exhaustion | Batch engagement checks | Prevents connection pool overflow |
