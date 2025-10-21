---
title: Timeout and Deadline Management Audit
date: 2025-10-21
author: Claude Code
status: completed
priority: high
tags:
  - audit
  - timeout
  - performance
  - reliability
  - infrastructure
related:
  - Vercel configuration
  - Worker job processing
  - LLM service integration
  - Database query optimization
  - SSE streaming
---

# Timeout and Deadline Management Audit

**Audit Date:** October 21, 2025
**Scope:** BuildOS Platform (Web + Worker)
**Focus:** Timeout handling, deadline management, retry logic, and user experience for long operations

## Executive Summary

This audit examines timeout handling and deadline management across the BuildOS platform, identifying critical gaps and risks. The platform shows **good timeout coverage in most areas** but has **several high-priority issues** that could lead to poor user experience, infinite retries, or silent failures.

### Key Findings

**Strengths:**

- ✅ Worker job timeouts well-configured (10min default, configurable)
- ✅ LLM calls have 120s timeout protection
- ✅ SSE streams have 60s timeout with proper cleanup
- ✅ Database queries have timeout protection in critical areas
- ✅ Webhook calls have 30s timeout
- ✅ Good retry logic with exponential backoff in worker

**Critical Issues:**

- 🔴 **NO Vercel function timeout configuration** - relying on platform default (60s)
- 🔴 **Missing timeout on brain dump processing endpoint** - can exceed Vercel limit
- 🔴 **Missing timeout on transcription endpoint** - OpenAI Whisper can be slow
- 🟡 Some database queries lack explicit timeout protection
- 🟡 No exponential backoff cap in some retry implementations
- 🟡 Long operations not always backgrounded appropriately

---

## Detailed Findings

### 1. Vercel Function Timeout Handling (60-second limit)

#### Current State

**Configuration:**

- ❌ No `maxDuration` config in any API route files
- ❌ No global timeout configuration in `vercel.json`
- ⚠️ Relying on Vercel's default 60-second timeout
- ⚠️ No route-specific timeout overrides

**Platform Limits:**

- Free/Hobby: 10 seconds
- Pro: 60 seconds (default)
- Enterprise: Up to 900 seconds (15 minutes)

**At-Risk Endpoints:**

1. **`/api/braindumps/generate`** (POST) - **HIGH RISK**
   - **File:** `/apps/web/src/routes/api/braindumps/generate/+server.ts`
   - **Issue:** Synchronous LLM processing can exceed 60s
   - **Risk:** Silent timeout failures, incomplete operations
   - **Evidence:**
     ```typescript
     // Line 211: No timeout protection
     parseResult = await processor.processBrainDump({
       brainDump: text,
       userId: user.id,
       // ... processing can take 60+ seconds for complex brain dumps
     });
     ```

2. **`/api/transcribe`** (POST) - **MEDIUM RISK**
   - **File:** `/apps/web/src/routes/api/transcribe/+server.ts`
   - **Issue:** OpenAI Whisper API can be slow for long audio
   - **Risk:** Timeout on large audio files
   - **Evidence:**
     ```typescript
     // Line 112: No timeout on OpenAI API call
     const transcription = await openai.audio.transcriptions.create({
       model: "whisper-1",
       file: whisperFile,
       // No timeout specified
     });
     ```

3. **`/api/dashboard/bottom-sections`** (GET) - **LOW RISK (Mitigated)**
   - **File:** `/apps/web/src/routes/api/dashboard/bottom-sections/+server.ts`
   - **Issue:** Multiple parallel database queries
   - **Mitigation:** ✅ Has `Promise.race` with timeouts (3-5s per query)
   - **Evidence:**
     ```typescript
     // Line 142: Good timeout implementation
     Promise.race([
       supabase.from('brain_dumps').select(...),
       createTimeoutPromise(5000)
     ])
     ```

4. **`/api/daily-briefs/generate`** (POST) - **MEDIUM RISK**
   - **File:** `/apps/web/src/routes/api/daily-briefs/generate/+server.ts`
   - **Issue:** Synchronous brief generation can be slow
   - **Mitigation:** ⚠️ Has `background` mode but default is synchronous
   - **Risk:** Users who don't use background mode can timeout

#### Recommendations

**Priority 1 - Critical (Implement Immediately):**

1. **Add route-specific timeout configuration:**

   ```typescript
   // In each long-running route
   export const config = {
     maxDuration: 60, // Explicitly set to platform limit
   };
   ```

2. **Convert brain dump to streaming-only:**

   ```typescript
   // Remove synchronous processing from /api/braindumps/generate
   // Force all requests to use /api/braindumps/stream (SSE)
   // This avoids Vercel function timeout entirely
   ```

3. **Add timeout wrapper for OpenAI Whisper:**
   ```typescript
   const transcription = await Promise.race([
     openai.audio.transcriptions.create({...}),
     new Promise((_, reject) =>
       setTimeout(() => reject(new Error('Transcription timeout')), 55000)
     )
   ]);
   ```

**Priority 2 - Important:**

4. **Add explicit timeout monitoring:**

   ```typescript
   // Middleware to log near-timeout warnings
   const VERCEL_TIMEOUT = 60000;
   const WARNING_THRESHOLD = 50000; // 50s

   if (Date.now() - startTime > WARNING_THRESHOLD) {
     console.warn(`Request approaching timeout: ${endpoint}`);
   }
   ```

5. **Document timeout limits in API responses:**
   ```typescript
   // Add to error responses
   if (isTimeout) {
     return ApiResponse.timeout(
       "Operation timed out. For large operations, use streaming or background mode.",
       {
         maxDuration: 60,
         suggestion: "Use /api/braindumps/stream for SSE streaming",
       },
     );
   }
   ```

---

### 2. Worker Job Timeout Configuration

#### Current State - GOOD ✅

**Configuration:**

- **File:** `/apps/worker/src/config/queueConfig.ts`
- **Default:** 600,000ms (10 minutes)
- **Configurable:** Via `QUEUE_WORKER_TIMEOUT` env var
- **Minimum:** 10,000ms (enforced)

**Evidence:**

```typescript
// Line 115: Good default
workerTimeout: (parseEnvInt("QUEUE_WORKER_TIMEOUT", 600000), // 10 minutes default
  // Line 84: Minimum validation
  (validated.workerTimeout = Math.max(10000, validated.workerTimeout)));
```

**Job-Specific Timeouts:**

- **Stalled timeout:** 300,000ms (5 min) - configurable via `QUEUE_STALLED_TIMEOUT`
- **Development:** 120,000ms (2 min) for faster feedback
- **Production:** 600,000ms (10 min) for complex jobs

**Monitoring:**

- ✅ Stats logging enabled
- ✅ Health checks configured
- ✅ Progress tracking with retries

#### Recommendations

**Priority 3 - Nice to Have:**

1. **Add per-job-type timeout configuration:**

   ```typescript
   // Different timeouts for different job types
   const JOB_TIMEOUTS = {
     generate_daily_brief: 600000, // 10 min
     generate_phases: 300000, // 5 min
     send_email: 30000, // 30s
     onboarding_analysis: 180000, // 3 min
   };
   ```

2. **Add timeout warnings before failure:**
   ```typescript
   // Warn at 80% of timeout
   if (elapsedTime > timeout * 0.8) {
     await updateJobProgress({
       status: "warning",
       message: "Job approaching timeout",
     });
   }
   ```

---

### 3. Long-Running LLM Calls Without Timeouts

#### Current State - GOOD ✅

**LLM Service Timeout Configuration:**

- **File:** `/apps/worker/src/lib/services/smart-llm-service.ts`
- **Timeout:** 120,000ms (2 minutes)
- **Method:** `AbortSignal.timeout(120000)`

**Evidence:**

```typescript
// Line 571: Good timeout implementation
const response = await fetch(this.apiUrl, {
  method: "POST",
  headers,
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(120000), // 2 minute timeout
});
```

**Timeout Handling:**

```typescript
// Line 600: Proper error handling
if (error instanceof Error && error.name === "AbortError") {
  throw new Error(`Request timeout for model ${params.model}`);
}
```

**Coverage:**

- ✅ Web app LLM service: Uses same pattern
- ✅ Worker LLM service: Has 120s timeout
- ✅ LLM pool health checks: 5s timeout (line 139)

#### Potential Issues

**Web App Brain Dump Processor:**

- **File:** `/apps/web/src/lib/utils/braindump-processor.ts`
- **Issue:** No explicit timeout on `processBrainDump()` call
- **Risk:** Can run indefinitely if LLM service timeout fails
- **Impact:** Vercel function timeout (60s) provides fallback, but not graceful

#### Recommendations

**Priority 2 - Important:**

1. **Add timeout to brain dump processing:**

   ```typescript
   const BRAIN_DUMP_TIMEOUT = 55000; // 55s (5s buffer for Vercel)

   const parseResult = await Promise.race([
     processor.processBrainDump({...}),
     new Promise((_, reject) =>
       setTimeout(() => reject(new Error('Brain dump processing timeout')),
         BRAIN_DUMP_TIMEOUT)
     )
   ]);
   ```

2. **Add timeout to all external API calls:**

   ```typescript
   // Enforce timeout on all fetch calls
   const safeFetch = (url, options) => {
     const controller = new AbortController();
     const timeout = setTimeout(
       () => controller.abort(),
       options.timeout || 30000,
     );

     return fetch(url, {
       ...options,
       signal: controller.signal,
     }).finally(() => clearTimeout(timeout));
   };
   ```

---

### 4. Database Query Timeout Settings

#### Current State - PARTIAL ✅

**Timeout Protection Found:**

1. **Dashboard queries** - GOOD ✅
   - **File:** `/apps/web/src/routes/api/dashboard/bottom-sections/+server.ts`
   - **Timeout:** 3-5s per query using `Promise.race`
   - **Evidence:**

     ```typescript
     // Line 136-243: Timeout wrapper
     const createTimeoutPromise = (ms: number) =>
       new Promise((_, reject) =>
         setTimeout(() => reject(new Error('Query timeout')), ms)
       );

     await Promise.race([
       supabase.from('brain_dumps').select(...),
       createTimeoutPromise(5000)
     ])
     ```

2. **Worker statistics** - GOOD ✅
   - **File:** `/apps/worker/src/index.ts`
   - **Timeout:** 5s for stats collection
   - **Evidence:**
     ```typescript
     // Line 109: Stats timeout
     const timeoutPromise = new Promise((_, reject) =>
       setTimeout(() => reject(new Error("Stats timeout")), 5000),
     );
     const stats = await Promise.race([statsPromise, timeoutPromise]);
     ```

**Missing Timeout Protection:**

Most database queries across the codebase **lack explicit timeout protection**:

- Brain dump queries in `/api/braindumps/generate`
- Project queries in various endpoints
- Task queries
- Calendar event queries
- User preference queries

#### Default Behavior

Supabase client **may** have default timeouts, but not explicitly configured:

- ⚠️ No global timeout configuration found
- ⚠️ No per-query timeout configuration
- ⚠️ Relying on default TCP/HTTP timeouts (potentially 60s+)

#### Recommendations

**Priority 2 - Important:**

1. **Add global Supabase client timeout:**

   ```typescript
   // In Supabase client initialization
   const supabase = createClient(url, key, {
     db: {
       timeout: 30000, // 30 second default query timeout
     },
     global: {
       fetch: (url, options) => {
         const controller = new AbortController();
         const timeout = setTimeout(() => controller.abort(), 30000);
         return fetch(url, {
           ...options,
           signal: controller.signal,
         }).finally(() => clearTimeout(timeout));
       },
     },
   });
   ```

2. **Add query-specific timeouts for complex queries:**

   ```typescript
   // For complex joins or aggregations
   const complexQuery = await Promise.race([
     supabase
       .from("brain_dumps")
       .select(
         `
         *,
         brain_dump_links(*),
         projects(*)
       `,
       )
       .limit(50),
     new Promise((_, reject) =>
       setTimeout(() => reject(new Error("Complex query timeout")), 10000),
     ),
   ]);
   ```

3. **Add timeout monitoring:**

   ```typescript
   // Log slow queries
   const queryStart = Date.now();
   const result = await supabase.from("table").select();
   const duration = Date.now() - queryStart;

   if (duration > 1000) {
     console.warn(`Slow query: ${duration}ms`, { table, query });
   }
   ```

---

### 5. Webhook Timeout Handling

#### Current State - GOOD ✅

**Configuration:**

- **File:** `/apps/worker/src/lib/services/webhook-email-service.ts`
- **Default:** 30,000ms (30 seconds)
- **Configurable:** Via `WEBHOOK_TIMEOUT` env var

**Evidence:**

```typescript
// Line 38: Configuration
timeout: parseInt(process.env.WEBHOOK_TIMEOUT || "30000", 10),

// Line 76: Timeout implementation
const timeoutId = setTimeout(() => {
  // Timeout handling
}, this.config.timeout!);
```

**Coverage:**

- ✅ Email webhook calls
- ✅ Proper error handling
- ✅ Fallback mechanisms

#### Recommendations

**Priority 4 - Low Priority:**

1. **Add webhook retry with backoff:**
   ```typescript
   // Retry failed webhooks with exponential backoff
   const retryWebhook = async (attempt = 0) => {
     try {
       return await sendWebhook();
     } catch (error) {
       if (attempt < 3) {
         const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
         await sleep(delay);
         return retryWebhook(attempt + 1);
       }
       throw error;
     }
   };
   ```

---

### 6. SSE Connection Timeout Handling

#### Current State - GOOD ✅

**Configuration:**

- **File:** `/apps/web/src/lib/utils/sse-processor.ts`
- **Default:** 60,000ms (60 seconds)
- **Configurable:** Via `timeout` option

**Evidence:**

```typescript
// Line 28: Default timeout
private static readonly DEFAULT_TIMEOUT = 60000; // 60 seconds

// Line 41: Timeout parameter
const { timeout = SSEProcessor.DEFAULT_TIMEOUT, parseJSON = true, onParseError } = options;

// Line 53-56: Timeout implementation
const timeoutPromise = new Promise<never>((_, reject) => {
  timeoutId = setTimeout(() => {
    reject(new Error(`SSE stream timeout after ${timeout}ms`));
  }, timeout);
});
```

**Cleanup:**

```typescript
// Line 72-77: Proper cleanup
} finally {
  // Clean up
  if (timeoutId) {
    clearTimeout(timeoutId);
  }
  reader.releaseLock();
}
```

**Usage:**

- ✅ Brain dump streaming endpoint
- ✅ Daily brief generation endpoint
- ✅ Proper error handling
- ✅ Client-side timeout handling

#### Recommendations

**Priority 4 - Low Priority:**

1. **Add reconnection logic for SSE:**

   ```typescript
   // Auto-reconnect on timeout
   const connectSSE = async (retries = 3) => {
     try {
       await SSEProcessor.processStream(response, callbacks, {
         timeout: 60000,
       });
     } catch (error) {
       if (retries > 0 && error.message.includes("timeout")) {
         console.log(`SSE timeout, reconnecting... (${retries} retries left)`);
         await sleep(1000);
         return connectSSE(retries - 1);
       }
       throw error;
     }
   };
   ```

2. **Add heartbeat/keepalive:**
   ```typescript
   // Send keepalive every 30s to prevent timeout
   const keepaliveInterval = setInterval(() => {
     writer.write({ type: "keepalive", timestamp: Date.now() });
   }, 30000);
   ```

---

### 7. Retry Logic Without Exponential Backoff Caps

#### Current State - MIXED ⚠️

**Good Implementations:**

1. **Worker Queue** - EXCELLENT ✅
   - **File:** `/apps/worker/src/config/queueConfig.ts`
   - **Max Retries:** Configurable (default: 3)
   - **Backoff:** Exponential with configurable base
   - **Evidence:**

     ```typescript
     // Line 100: Max retries
     maxRetries: parseEnvInt("QUEUE_MAX_RETRIES", 3),

     // Line 101: Backoff base
     retryBackoffBase: parseEnvInt("QUEUE_RETRY_BACKOFF_BASE", 1000),

     // Line 79: Minimum enforcement
     validated.retryBackoffBase = Math.max(100, validated.retryBackoffBase);
     ```

2. **Brain Dump Processing** - GOOD ✅
   - **File:** `/apps/web/src/routes/api/braindumps/generate/+server.ts`
   - **Max Retries:** 3 (configurable via options)
   - **Evidence:**
     ```typescript
     // Line 220: Retry configuration
     retryAttempts: options?.retryAttempts || 3;
     ```

**Missing Backoff Caps:**

1. **Rate Limiter Retry** - NO CAP ⚠️
   - **File:** `/apps/web/src/lib/utils/rate-limiter.ts`
   - **Issue:** No maximum retry limit
   - **Risk:** Infinite retry loops if rate limit never clears

2. **Phase Generation Retry** - NO CAP ⚠️
   - **File:** `/apps/web/src/lib/services/phase-generation/strategies/base-strategy.ts`
   - **Issue:** Retry logic exists but no explicit cap mentioned
   - **Risk:** Long retry chains on persistent failures

3. **Calendar Service Retry** - NO CAP ⚠️
   - **File:** `/apps/web/src/lib/services/calendar-service.ts`
   - **Issue:** Retry logic for calendar sync without cap
   - **Risk:** Infinite retries on OAuth failure

#### Recommendations

**Priority 1 - Critical:**

1. **Add max retry cap to all retry implementations:**

   ```typescript
   const MAX_RETRIES = 5;
   const MAX_BACKOFF = 60000; // 60 seconds max

   async function retryWithBackoff(fn, attempt = 0) {
     try {
       return await fn();
     } catch (error) {
       if (attempt >= MAX_RETRIES) {
         throw new Error(`Max retries (${MAX_RETRIES}) exceeded`);
       }

       const backoff = Math.min(1000 * Math.pow(2, attempt), MAX_BACKOFF);

       await sleep(backoff);
       return retryWithBackoff(fn, attempt + 1);
     }
   }
   ```

2. **Add circuit breaker pattern:**

   ```typescript
   class CircuitBreaker {
     private failures = 0;
     private lastFailure = 0;
     private readonly threshold = 5;
     private readonly timeout = 60000;

     async execute(fn) {
       if (this.isOpen()) {
         throw new Error("Circuit breaker is open");
       }

       try {
         const result = await fn();
         this.onSuccess();
         return result;
       } catch (error) {
         this.onFailure();
         throw error;
       }
     }

     isOpen() {
       if (this.failures >= this.threshold) {
         if (Date.now() - this.lastFailure < this.timeout) {
           return true;
         }
         this.reset();
       }
       return false;
     }

     onSuccess() {
       this.failures = 0;
     }

     onFailure() {
       this.failures++;
       this.lastFailure = Date.now();
     }

     reset() {
       this.failures = 0;
     }
   }
   ```

---

### 8. User-Facing Loading States for Long Operations

#### Current State - GOOD ✅

**Loading State Implementations Found:**

1. **Brain Dump Modal** - EXCELLENT ✅
   - **File:** `/apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte`
   - **States:** Processing, analyzing, generating, saving
   - **Feedback:** Real-time progress via SSE
   - **Evidence:** Multiple `isLoading`, `isProcessing` reactive states

2. **Processing Modal** - EXCELLENT ✅
   - **File:** `/apps/web/src/lib/components/brain-dump/ProcessingModal.svelte`
   - **Features:** Progress indicators, step-by-step feedback
   - **Real-time:** SSE connection for live updates

3. **Dual Processing Results** - EXCELLENT ✅
   - **File:** `/apps/web/src/lib/components/brain-dump/DualProcessingResults.svelte`
   - **Features:** Stage-by-stage progress display
   - **Feedback:** Analysis → Context → Tasks flow

4. **Daily Brief Modal** - GOOD ✅
   - **File:** `/apps/web/src/lib/components/briefs/DailyBriefModal.svelte`
   - **Features:** Loading states, progress tracking
   - **Real-time:** SSE streaming for brief generation

**Common Patterns:**

- ✅ Loading spinners
- ✅ Progress bars
- ✅ Stage indicators
- ✅ Real-time status updates via SSE
- ✅ Error states with retry options

#### Potential Improvements

**Priority 3 - Nice to Have:**

1. **Add timeout warnings to user:**

   ```typescript
   // Show warning when approaching timeout
   if (elapsedTime > 45000) {
     // 45s warning for 60s limit
     showWarning("This is taking longer than usual. Please wait...");
   }
   ```

2. **Add estimated time remaining:**

   ```typescript
   // Calculate ETA based on progress
   const estimatedTimeRemaining = calculateETA(startTime, progress);
   showProgress(`Estimated time: ${estimatedTimeRemaining}s`);
   ```

3. **Add "this might take a while" messages:**

   ```typescript
   // For known slow operations
   if (contentLength > 10000) {
     showInfo("Processing large content may take 30-60 seconds");
   }
   ```

4. **Add background job fallback:**
   ```typescript
   // Offer background processing if taking too long
   if (elapsedTime > 30000) {
     showOption("Continue in background?", () => {
       switchToBackgroundMode();
       notifyWhenComplete();
     });
   }
   ```

---

### 9. Operations That Should Be Backgrounded But Aren't

#### Current State - MIXED ⚠️

**Operations Currently Backgrounded (GOOD):**

1. **Daily Brief Generation** ✅
   - **Option:** `background: true` mode exists
   - **File:** `/apps/web/src/routes/api/daily-briefs/generate/+server.ts`
   - **Evidence:**
     ```typescript
     // Line 97: Background mode
     if (background) {
       return handleBackgroundGeneration(...);
     }
     ```

2. **Email Sending** ✅
   - **Method:** Non-blocking job queue
   - **File:** Email jobs queued separately
   - **Evidence:** Worker handles email jobs asynchronously

3. **Calendar Sync** ✅
   - **Method:** Background worker jobs
   - **File:** Calendar events synced via worker

**Operations That SHOULD Be Backgrounded:**

1. **Brain Dump Processing** - CURRENTLY SYNCHRONOUS ⚠️
   - **Current:** Synchronous in `/api/braindumps/generate`
   - **Issue:** Can take 30-60+ seconds
   - **Risk:** Vercel timeout, poor UX
   - **Recommendation:** Force all to use streaming or background mode

   **Why This Is a Problem:**

   ```typescript
   // Line 211-223: Synchronous processing
   parseResult = await processor.processBrainDump({
     brainDump: text,
     userId: user.id,
     selectedProjectId: selectedProjectId,
     // ... this can take 60+ seconds
   });

   // User is waiting the entire time
   // If Vercel times out, user sees error
   ```

2. **Large Data Exports** - NOT BACKGROUNDED ⚠️
   - **Issue:** No export functionality found, but if added, should be backgrounded
   - **Recommendation:** Implement via worker queue with email notification

3. **Bulk Operations** - PARTIALLY BACKGROUNDED ⚠️
   - **Example:** Batch task updates
   - **Issue:** Some bulk operations synchronous
   - **Recommendation:** Add background option for bulk operations

#### Recommendations

**Priority 1 - Critical:**

1. **Convert brain dump to streaming-only:**

   ```typescript
   // Remove synchronous mode from /api/braindumps/generate
   // Redirect all requests to /api/braindumps/stream

   export const POST: RequestHandler = async ({ request, locals }) => {
     // Deprecation warning
     console.warn(
       "Synchronous brain dump endpoint deprecated, use /api/braindumps/stream",
     );

     // Redirect to streaming endpoint
     return new Response(null, {
       status: 307,
       headers: {
         Location: "/api/braindumps/stream",
       },
     });
   };
   ```

2. **Add background mode to all long operations:**

   ```typescript
   // Standard pattern for long operations
   interface LongOperationOptions {
     background?: boolean;
     notify?: boolean; // Email/push when complete
     timeout?: number;
   }

   async function handleLongOperation(options: LongOperationOptions) {
     if (options.background) {
       // Queue job
       const jobId = await queueBackgroundJob();

       // Return immediately
       return ApiResponse.success({
         jobId,
         status: "processing",
         message: "Processing in background",
       });
     }

     // Synchronous with timeout
     return Promise.race([
       performOperation(),
       timeoutPromise(options.timeout || 55000),
     ]);
   }
   ```

3. **Add operation size thresholds:**
   ```typescript
   // Auto-background for large operations
   if (contentSize > BACKGROUND_THRESHOLD) {
     return handleBackgroundMode({
       message: "Large operation detected, processing in background",
       estimatedTime: estimateProcessingTime(contentSize),
     });
   }
   ```

**Priority 2 - Important:**

4. **Add progress polling for background jobs:**

   ```typescript
   // Client-side polling for background job status
   async function pollJobStatus(jobId: string) {
     const interval = setInterval(async () => {
       const status = await getJobStatus(jobId);

       if (status.complete) {
         clearInterval(interval);
         showResult(status.result);
       } else {
         updateProgress(status.progress);
       }
     }, 2000);
   }
   ```

5. **Add real-time notifications:**
   ```typescript
   // Use Supabase Realtime for job completion
   const subscription = supabase
     .channel(`job:${jobId}`)
     .on(
       "postgres_changes",
       {
         event: "UPDATE",
         schema: "public",
         table: "queue_jobs",
         filter: `id=eq.${jobId}`,
       },
       (payload) => {
         if (payload.new.status === "completed") {
           notifyUser("Operation complete!");
         }
       },
     )
     .subscribe();
   ```

---

## Risk Assessment

### Critical Risks (Address Immediately)

| Risk                               | Impact              | Likelihood | Severity    | File Location                         |
| ---------------------------------- | ------------------- | ---------- | ----------- | ------------------------------------- |
| No Vercel timeout config           | User experience     | High       | 🔴 Critical | All `/api/*` routes                   |
| Brain dump sync processing timeout | Data loss, timeouts | High       | 🔴 Critical | `/api/braindumps/generate/+server.ts` |
| No retry cap in some services      | Infinite loops      | Medium     | 🟡 High     | Various service files                 |
| Missing DB query timeouts          | Slow queries block  | Medium     | 🟡 High     | Multiple API routes                   |

### Medium Risks (Address Soon)

| Risk                           | Impact         | Likelihood | Severity  | File Location                |
| ------------------------------ | -------------- | ---------- | --------- | ---------------------------- |
| Transcription timeout          | Poor UX        | Medium     | 🟡 Medium | `/api/transcribe/+server.ts` |
| No background mode enforcement | Timeouts       | Medium     | 🟡 Medium | Brain dump processing        |
| Missing timeout warnings       | User confusion | Medium     | 🟢 Low    | UI components                |

### Low Risks (Monitor)

| Risk                       | Impact           | Likelihood | Severity |
| -------------------------- | ---------------- | ---------- | -------- |
| SSE timeout without retry  | Connection drops | Low        | 🟢 Low   |
| No ETA for long operations | Poor UX          | Low        | 🟢 Low   |
| Missing webhook retry      | Email failures   | Low        | 🟢 Low   |

---

## Implementation Priorities

### Phase 1: Critical Fixes (Week 1)

1. **Add Vercel timeout configuration** (1 hour)
   - Add `maxDuration` to all API routes
   - Document platform limits
   - Add timeout monitoring

2. **Convert brain dump to streaming-only** (4 hours)
   - Deprecate synchronous endpoint
   - Update frontend to use SSE
   - Add fallback handling

3. **Add retry caps** (2 hours)
   - Implement max retry limits
   - Add exponential backoff caps
   - Add circuit breaker pattern

4. **Add database query timeouts** (3 hours)
   - Configure global Supabase timeout
   - Add per-query timeouts for complex queries
   - Add slow query logging

### Phase 2: Important Improvements (Week 2)

5. **Add timeout protection to LLM calls** (2 hours)
   - Wrap all LLM calls with timeouts
   - Add graceful degradation
   - Improve error messages

6. **Improve loading states** (4 hours)
   - Add timeout warnings
   - Add estimated time remaining
   - Add background job fallback

7. **Background all long operations** (6 hours)
   - Add background mode to all long operations
   - Implement job polling
   - Add real-time notifications

### Phase 3: Polish (Week 3)

8. **Add monitoring and alerts** (3 hours)
   - Log timeout events
   - Alert on high timeout rates
   - Track operation durations

9. **Documentation** (2 hours)
   - Document timeout limits
   - Add troubleshooting guide
   - Update API documentation

10. **Testing** (4 hours)
    - Test timeout scenarios
    - Test retry logic
    - Test background job processing

---

## Monitoring Recommendations

### Metrics to Track

1. **Timeout Events:**

   ```typescript
   // Track timeout occurrences
   metrics.increment("api.timeout", {
     endpoint: route,
     duration: elapsedTime,
     user: userId,
   });
   ```

2. **Operation Durations:**

   ```typescript
   // Track how long operations take
   metrics.histogram("operation.duration", duration, {
     operation: "brain_dump_processing",
     success: true,
   });
   ```

3. **Retry Counts:**

   ```typescript
   // Track retry attempts
   metrics.increment("retry.attempt", {
     operation: "llm_call",
     attempt: attemptNumber,
   });
   ```

4. **Background Job Completion Time:**
   ```typescript
   // Track background job duration
   metrics.histogram("background_job.duration", duration, {
     job_type: "generate_daily_brief",
     status: "completed",
   });
   ```

### Alerts to Configure

1. **High Timeout Rate:**
   - Alert when timeout rate > 5% of requests
   - Check for platform issues or code problems

2. **Slow Operations:**
   - Alert when operation duration > 90% of timeout
   - Indicates need for optimization or backgrounding

3. **Retry Storms:**
   - Alert when retry count spikes
   - Indicates upstream service issues

4. **Background Job Backlog:**
   - Alert when queue depth > 100 jobs
   - Indicates worker capacity issues

---

## Conclusion

The BuildOS platform has **solid timeout handling in most critical areas**, particularly in the worker service and SSE streaming. However, there are **significant gaps** in Vercel function timeout configuration and some retry logic implementations that pose risks to reliability and user experience.

### Immediate Actions Required

1. Add explicit `maxDuration` configuration to all Vercel API routes
2. Convert brain dump processing to streaming-only to avoid Vercel timeout
3. Add retry caps and exponential backoff limits to all retry logic
4. Add global database query timeout configuration

### Overall Assessment

**Current State:** 7/10 - Good foundation with critical gaps
**Target State:** 9/10 - Production-ready with comprehensive timeout management
**Effort Required:** ~30 hours over 3 weeks

By implementing the recommendations in this audit, the platform will have robust timeout and deadline management that ensures reliable operation and excellent user experience even under load or with slow external services.

---

## Appendix: Code Examples

### A. Vercel Route Timeout Configuration

```typescript
// apps/web/src/routes/api/braindumps/generate/+server.ts

// Add at top of file
export const config = {
  maxDuration: 60, // Vercel Pro limit
};

// Or for specific platforms
export const config = {
  maxDuration: 300, // 5 minutes for Enterprise
  runtime: "nodejs18.x",
};
```

### B. Unified Timeout Utility

```typescript
// apps/web/src/lib/utils/timeout.ts

export class TimeoutManager {
  private static readonly VERCEL_LIMIT = 60000; // 60s
  private static readonly BUFFER = 5000; // 5s buffer

  static async withTimeout<T>(
    promise: Promise<T>,
    timeout: number = this.VERCEL_LIMIT - this.BUFFER,
    errorMessage = 'Operation timed out'
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), timeout);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  static async withRetry<T>(
    fn: () => Promise<T>,
    options: {
      maxRetries?: number;
      backoffBase?: number;
      maxBackoff?: number;
      timeout?: number;
    } = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      backoffBase = 1000,
      maxBackoff = 30000,
      timeout = this.VERCEL_LIMIT - this.BUFFER
    } = options;

    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.withTimeout(fn(), timeout);
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          const backoff = Math.min(
            backoffBase * Math.pow(2, attempt),
            maxBackoff
          );
          await new Promise(resolve => setTimeout(resolve, backoff));
        }
      }
    }

    throw new Error(
      `Operation failed after ${maxRetries} retries: ${lastError!.message}`
    );
  }
}

// Usage:
const result = await TimeoutManager.withTimeout(
  processor.processBrainDump({...}),
  55000,
  'Brain dump processing timeout'
);

const resultWithRetry = await TimeoutManager.withRetry(
  () => llmService.generate({...}),
  { maxRetries: 3, timeout: 55000 }
);
```

### C. Database Query Timeout Wrapper

```typescript
// apps/web/src/lib/utils/db-timeout.ts

export async function queryWithTimeout<T>(
  queryFn: () => Promise<T>,
  timeout: number = 30000,
  queryName: string = "unknown",
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await Promise.race([
      queryFn(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Query timeout: ${queryName}`)),
          timeout,
        ),
      ),
    ]);

    const duration = Date.now() - startTime;

    // Log slow queries
    if (duration > 1000) {
      console.warn(`Slow query (${duration}ms): ${queryName}`);
    }

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Query failed (${duration}ms): ${queryName}`, error);
    throw error;
  }
}

// Usage:
const braindumps = await queryWithTimeout(
  () =>
    supabase
      .from("brain_dumps")
      .select("*, brain_dump_links(*), projects(*)")
      .limit(50),
  10000, // 10s timeout
  "fetch_enriched_braindumps",
);
```

### D. Background Job Pattern

```typescript
// apps/web/src/lib/utils/background-operation.ts

export interface BackgroundOperationOptions {
  operationName: string;
  userId: string;
  data: any;
  timeout?: number;
  notify?: boolean;
}

export async function runOrBackground<T>(
  operation: () => Promise<T>,
  options: BackgroundOperationOptions
): Promise<{
  mode: 'sync' | 'background';
  result?: T;
  jobId?: string;
}> {
  const { operationName, userId, data, timeout = 55000, notify = true } = options;

  // Try synchronous execution with timeout
  try {
    const result = await Promise.race([
      operation(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), timeout)
      )
    ]);

    return { mode: 'sync', result };
  } catch (error) {
    if (error instanceof Error && error.message === 'TIMEOUT') {
      // Switch to background mode
      const jobId = await queueBackgroundJob({
        type: operationName,
        userId,
        data,
        notify
      });

      return { mode: 'background', jobId };
    }
    throw error;
  }
}

// Usage:
const { mode, result, jobId } = await runOrBackground(
  () => processor.processBrainDump({...}),
  {
    operationName: 'brain_dump_processing',
    userId: user.id,
    data: { content, selectedProjectId }
  }
);

if (mode === 'background') {
  return ApiResponse.success({
    jobId,
    status: 'processing',
    message: 'Processing in background. You will be notified when complete.'
  });
} else {
  return ApiResponse.success({ result });
}
```

---

**END OF AUDIT**
