# Bugfix Changelog

This document tracks significant bug fixes across the BuildOS platform. Entries are listed in reverse chronological order (most recent first).

---

## 2025-10-21: Fixed SMS Preferences API Schema Mismatch - Timezone Column Removed

**Issue**: Users visiting `https://build-os.com/profile?tab=notifications` received database error `PGRST204: Could not find the 'timezone' column of 'user_sms_preferences' in the schema cache` when attempting to save SMS preferences.

**Root Cause**: Schema migration mismatch after timezone centralization (ADR-002):

1. **Migration `20251013_drop_deprecated_timezone_columns.sql`** removed `user_sms_preferences.timezone` column as part of timezone centralization to `users` table
2. **API endpoint `/api/sms/preferences/+server.ts`** NOT updated after migration:
   - Line 17: `DEFAULT_PREFERENCES` included `timezone: null`
   - Lines 95-97: Destructured `timezone` from request body
   - Lines 130-135: Attempted to insert `timezone` into `user_sms_preferences` table
3. **Frontend component `SMSPreferences.svelte`** sent timezone in update requests (line 81)

**Impact**:

- **HIGH**: SMS preferences page completely broken - users unable to save any SMS settings
- **HIGH**: Blocks users from enabling SMS notifications, preventing entire SMS scheduling system from working
- **MEDIUM**: Affects onboarding flow - new users cannot complete SMS setup

**Fix**: Removed timezone field handling from SMS preferences API and frontend:

### 1. API Endpoint (`/apps/web/src/routes/api/sms/preferences/+server.ts`)

- Removed `timezone: null` from `DEFAULT_PREFERENCES` constant
- Removed `timezone` from request body destructuring
- Removed timezone update block (lines 130-135)
- Updated GET handler to only fetch timezone from `users` table (centralized source)
- Added comments referencing ADR-002-timezone-centralization

### 2. Frontend Component (`/apps/web/src/lib/components/settings/SMSPreferences.svelte`)

- Removed `timezone` from `smsService.updateSMSPreferences()` call (line 81)
- Kept timezone display read-only (fetched from users table via API)
- Added comment referencing ADR-002-timezone-centralization

### 3. Worker Utility (`/apps/worker/src/lib/utils/smsPreferenceChecks.ts`)

- Removed `timezone` from SELECT query (line 254) when fetching SMS preferences
- Removed `smsPrefs.timezone` fallback from timezone resolution (line 325)
- Removed `timezone` field from `SMSPreferences` interface
- Added comments referencing ADR-002-timezone-centralization

### 4. Verified Other Worker Code (Already Correct)

- ✅ `scheduler.ts:705-718` - Fetches timezone from users table for SMS scheduling
- ✅ `dailySmsWorker.ts:56-75` - Fetches timezone from users table
- ✅ `smsWorker.ts:138-146` - Fetches timezone from users table

**Related Documentation**:

- See `/docs/architecture/decisions/ADR-002-timezone-centralization.md` for timezone centralization decision
- See migration `/supabase/migrations/20251013_drop_deprecated_timezone_columns.sql`

**Cross-References**:

- Related to timezone centralization completed 2025-10-13
- Worker code already correctly implemented timezone fetching from users table

**Manual Verification Steps**:

1. Visit `https://build-os.com/profile?tab=notifications`
2. Verify page loads without errors
3. Toggle SMS event reminders, change quiet hours
4. Click "Save Preferences"
5. Verify preferences save successfully (no PGRST204 error)
6. Verify timezone still displays correctly (read-only from users table)

**Files Modified**:

- `/apps/web/src/routes/api/sms/preferences/+server.ts`
- `/apps/web/src/lib/components/settings/SMSPreferences.svelte`
- `/apps/worker/src/lib/utils/smsPreferenceChecks.ts`

---

## 2025-10-21: Fixed Daily Brief Modal Issues - Svelte 5 Migration + Database Schema Error

**Combined Fix**: This entry covers two related issues discovered while fixing the daily brief modal functionality.

**Issue**: Daily brief modal failed to open when clicking the brief card on `/projects` page, and URL query parameters (`?briefDate=YYYY-MM-DD`) did not trigger modal opening on page load or navigation.

**Root Cause**: Mixing of Svelte 4 and Svelte 5 syntax patterns caused event handling incompatibilities:

1. **Event Dispatcher Incompatibility** (`DailyBriefSection.svelte:3`, `DailyBriefsTab.svelte:3`):
   - Used Svelte 4's `createEventDispatcher()` API alongside Svelte 5 runes (`$state`, `$effect`)
   - In Svelte 5, `createEventDispatcher` + runes mode doesn't reliably propagate custom events
   - Child components dispatched `viewBrief` events that parent never received

2. **Async Modal Loading Timing Issues** (`projects/+page.svelte:85-88`, `536-539`):
   - Used `.then()` callbacks for async operations in `$effect` and event handlers
   - State updates in promise callbacks occurred outside reactive tracking scope
   - Modal state (`briefModalOpen`) set before component fully loaded

3. **Props Syntax Inconsistency** (`DailyBriefSection.svelte:22`, `DailyBriefsTab.svelte:50`):
   - Used `export let user` (Svelte 4) instead of `let { user } = $props()` (Svelte 5)
   - Caused reactivity issues when mixed with runes-based state management

**Impact**:

- **HIGH**: Core feature completely broken - users unable to view daily briefs via modal
- **MEDIUM**: Deep linking broken - direct URLs with `?briefDate=` parameter failed to open modal
- **MEDIUM**: Browser navigation broken - back/forward buttons didn't sync modal state with URL

**Fix**: Migrated to proper Svelte 5 patterns throughout the daily brief modal flow:

### 1. Converted to Callback Props Pattern

**DailyBriefSection.svelte** and **DailyBriefsTab.svelte**:

```typescript
// ❌ BEFORE: Svelte 4 event dispatcher
import { createEventDispatcher } from "svelte";
const dispatch = createEventDispatcher();
export let user = null;

function handleViewBrief() {
  dispatch("viewBrief", { briefId, briefDate });
}

// ✅ AFTER: Svelte 5 callback props
let {
  user = null,
  onViewBrief,
}: {
  user?: { id: string; email: string; is_admin: boolean } | null;
  onViewBrief?: (data: { briefId: string | null; briefDate: string }) => void;
} = $props();

function handleViewBrief() {
  if (displayDailyBrief?.id && displayDailyBrief?.brief_date && onViewBrief) {
    onViewBrief({ briefId, briefDate });
  }
}
```

### 2. Fixed Async Operations in $effect

**projects/+page.svelte** `$effect` block:

```typescript
// ❌ BEFORE: Promise .then() in effect
$effect(() => {
  if (briefDateParam && !briefModalOpen) {
    loadDailyBriefModal().then(() => {
      selectedBriefDate = briefDateParam;
      briefModalOpen = true;
    });
  }
});

// ✅ AFTER: IIFE with async/await (Svelte 5 pattern)
$effect(() => {
  if (briefDateParam && !briefModalOpen) {
    (async () => {
      await loadDailyBriefModal();
      selectedBriefDate = briefDateParam;
      briefModalOpen = true;
    })();
  }
});
```

### 3. Updated Event Binding Syntax

**projects/+page.svelte**:

```svelte
<!-- ❌ BEFORE: Svelte 4 event binding -->
<DailyBriefSection user={data.user} on:viewBrief={handleViewBrief} />
<DailyBriefsTab user={data.user} on:viewBrief={handleViewBrief} />

<!-- ✅ AFTER: Svelte 5 callback props -->
<DailyBriefSection user={data.user} onViewBrief={handleViewBrief} />
<DailyBriefsTab user={data.user} onViewBrief={handleViewBrief} />
```

### 4. Fixed Function Signatures

**projects/+page.svelte** handler:

```typescript
// ❌ BEFORE: Expected CustomEvent wrapper
async function handleViewBrief(
  event: CustomEvent<{ briefId: string; briefDate: string }>,
) {
  const { briefDate } = event.detail;
  // ...
}

// ✅ AFTER: Direct data parameter
async function handleViewBrief(data: {
  briefId: string | null;
  briefDate: string;
}) {
  const { briefDate } = data;
  // ...
}
```

### 5. Made popstate Handler Async

**projects/+page.svelte** browser navigation:

```typescript
// ❌ BEFORE: Sync function with .then()
function handlePopState() {
  loadDailyBriefModal().then(() => {
    // state updates
  });
}

// ✅ AFTER: Async function with await
async function handlePopState() {
  await loadDailyBriefModal();
  selectedBriefDate = briefDateParam;
  briefModalOpen = true;
}
```

**Additional Issue Discovered**: Database Schema Error (PGRST204)

While testing the modal fix, encountered a PostgREST error: `"Could not find the 'timezone' column of 'user_sms_preferences' in the schema cache"`. This was caused by:

1. **Schema Migration**: The `timezone` column was moved from `user_sms_preferences` table to `users` table (per ADR-002-timezone-centralization)
2. **Stale Queries**: Multiple queries still used `select('*')` on `user_sms_preferences`, causing PostgREST to try fetching the non-existent `timezone` column
3. **Type Mismatch**: Auto-generated PostgREST types included `timezone` but actual database schema didn't have it

**Additional Fix**: Replaced all `select('*')` queries on `user_sms_preferences` with explicit column selections:

```typescript
// ❌ BEFORE: Tries to select non-existent timezone column
.from('user_sms_preferences')
.select('*')

// ✅ AFTER: Explicit columns matching actual schema
.from('user_sms_preferences')
.select('id, user_id, phone_number, phone_verified, phone_verified_at, opted_out, opted_out_at, opt_out_reason, quiet_hours_start, quiet_hours_end, urgent_alerts, task_reminders, event_reminders_enabled, event_reminder_lead_time_minutes, morning_kickoff_enabled, morning_kickoff_time, evening_recap_enabled, next_up_enabled, daily_brief_sms, daily_sms_limit, daily_sms_count, daily_count_reset_at, created_at, updated_at')
```

**Additional Fix**: Converted legacy `$:` reactive statements to Svelte 5 `$derived` in `DailyBriefSection.svelte`:

```typescript
// ❌ BEFORE: Svelte 4 reactive statements (not allowed in runes mode)
$: notificationPreferences = $notificationPreferencesStore.preferences;
$: hasEmailOptIn = notificationPreferences?.should_email_daily_brief || false;
$: overallProgress = currentStreamingStatus ? Math.round(...) : 0;
$: displayDailyBrief = currentStreamingData?.mainBrief ? {...} : dailyBrief;

// ✅ AFTER: Svelte 5 $derived
let notificationPreferences = $derived($notificationPreferencesStore.preferences);
let hasEmailOptIn = $derived(notificationPreferences?.should_email_daily_brief || false);
let overallProgress = $derived(currentStreamingStatus ? Math.round(...) : 0);
let displayDailyBrief = $derived(currentStreamingData?.mainBrief ? {...} : dailyBrief);
```

**Files Modified**:

- `/apps/web/src/lib/components/briefs/DailyBriefSection.svelte:3,22,45-46,139-147,183-204` (event handling + reactive statements)
- `/apps/web/src/lib/components/briefs/DailyBriefsTab.svelte:3,48-55,297-305` (event handling)
- `/apps/web/src/routes/projects/+page.svelte:75-99,433-440,527-545,692,735` (event handlers + async)
- `/apps/web/src/lib/services/sms.service.ts:36,119,240` (schema fix - 3 queries)
- `/apps/web/src/routes/api/sms/preferences/+server.ts:41` (schema fix - 1 query)

**Testing**:

- ✅ Click daily brief card on `/projects` → Modal opens correctly
- ✅ Navigate to `/projects?briefDate=2025-01-21` → Modal opens with brief loaded
- ✅ Browser back/forward buttons → Modal syncs with URL state
- ✅ Close modal → URL updates (removes `?briefDate` param)
- ✅ No TypeScript errors in modified files

**Related Documentation**:

- Svelte 5 Migration: [Svelte 5 Runes Documentation](https://svelte-5-preview.vercel.app/docs/runes)
- Daily Briefs API: `/apps/web/docs/technical/api/endpoints/daily-briefs.md`
- Component Standards: `/apps/web/docs/technical/components/`

**Prevention**: Updated component patterns to consistently use Svelte 5 runes and callback props. Future components should follow this pattern to avoid event handling issues.

**Last Updated**: 2025-10-21

---

## 2025-10-21: Fixed N+1 Query Pattern in Admin User Activity Endpoint (HIGH SEVERITY PERFORMANCE FIX)

**Issue**: The admin user activity endpoint had a classic N+1 query problem that executed 200+ database queries for users with 100 projects, causing severe performance degradation, database load, and increased infrastructure costs.

**Root Cause**: In `/apps/web/src/routes/api/admin/users/[userId]/activity/+server.ts:42-66`, the code fetched task stats and notes counts individually for each project in a loop using `Promise.all()`:

```typescript
// BUGGY CODE: N+1 query pattern
const processedProjects = await Promise.all(
  (projects || []).map(async (project) => {
    // ❌ ONE query per project for tasks
    const { data: taskStats } = await supabase
      .from("tasks")
      .select("id, status, completed_at")
      .eq("project_id", project.id);

    // ❌ ONE query per project for notes
    const { count: notesCount } = await supabase
      .from("notes")
      .select("*", { count: "exact", head: true })
      .eq("project_id", project.id);
  }),
);
```

**Query Math**: For a user with N projects: `1 + (N × 2) = 2N + 1 queries`

- 100 projects = 201 queries
- 500 projects = 1,001 queries

**Impact**:

- **CRITICAL**: Admin dashboard took 2-10+ seconds to load for users with many projects (should be <500ms)
- **HIGH**: Database connection pool exhaustion - hundreds of parallel connections per page load
- **HIGH**: Increased Supabase costs due to excessive query volume and compute time
- **MEDIUM**: Scalability bottleneck - performance degraded linearly with user project count
- **MEDIUM**: Poor admin experience - made user activity analysis impractical for power users

**Additional Bugs Found During Fix**:

1. **Task Status Inconsistency**: Line 51 used `status === 'done'` but line 196 used `status === 'completed'` - inconsistent task completion check
2. **Missing Deleted Filter**: Deleted tasks (with `deleted_at != NULL`) were counted in project statistics, inflating task counts

**Fix**: Replaced N+1 pattern with bulk aggregation strategy that **reuses existing queries** and aggregates in-memory:

**New Implementation**:

```typescript
// ✅ Fetch ALL tasks once (already needed for activity timeline)
const { data: tasks } = await supabase
  .from("tasks")
  .select("*, projects(name), completed_at")
  .eq("user_id", userId)
  .is("deleted_at", null) // NEW: Exclude soft-deleted tasks
  .order("created_at", { ascending: false });

// ✅ Fetch ALL notes once (already needed for activity timeline)
const { data: notes } = await supabase
  .from("notes")
  .select("*, projects(name)")
  .eq("user_id", userId)
  .order("created_at", { ascending: false });

// ✅ Aggregate in-memory (no additional queries!)
const taskCountsByProject: Record<
  string,
  { total: number; completed: number }
> = {};
(tasks || []).forEach((task) => {
  if (task.project_id) {
    if (!taskCountsByProject[task.project_id]) {
      taskCountsByProject[task.project_id] = { total: 0, completed: 0 };
    }
    taskCountsByProject[task.project_id].total++;
    if (task.status === "done") {
      // FIXED: Consistent status check
      taskCountsByProject[task.project_id].completed++;
    }
  }
});

// ✅ No async needed - pure map operation
const processedProjects = (projects || []).map((project) => ({
  ...project,
  task_count: taskCountsByProject[project.id]?.total || 0,
  completed_task_count: taskCountsByProject[project.id]?.completed || 0,
  notes_count: notesCountsByProject[project.id] || 0,
}));
```

**Performance Improvement**:

- **Before**: 1 + 2N queries (201 queries for 100 projects, 1,001 for 500 projects)
- **After**: 9 constant queries (regardless of project count)
- **Speedup**:
  - 100 projects: **22x fewer queries** (201 → 9)
  - 500 projects: **111x fewer queries** (1,001 → 9)
- **Load Time**: 2-10 seconds → ~200-300ms (expected)

**Files Modified**:

- `/apps/web/src/routes/api/admin/users/[userId]/activity/+server.ts:34-99` - Complete rewrite of query pattern
  - Moved tasks and notes queries before project processing
  - Added `is('deleted_at', null)` filter to tasks query
  - Created in-memory aggregation maps
  - Removed async Promise.all loop
- `/apps/web/src/routes/api/admin/users/[userId]/activity/+server.ts:196` - Fixed task status from `'completed'` to `'done'`

**Improvements**:

- ✅ **Eliminated N+1 query pattern** - constant query count regardless of project count
- ✅ **Zero new queries** - reuses data already fetched for activity timeline
- ✅ **Filters soft-deleted tasks** - accurate counts exclude deleted_at != NULL
- ✅ **Fixed task status inconsistency** - uses `'done'` consistently throughout
- ✅ **Added type safety** - explicit `Record<string, ...>` types for aggregation maps
- ✅ **Improved scalability** - performance no longer degrades with project count
- ✅ **Reduced infrastructure costs** - 95%+ reduction in database queries

**Related Documentation**:

- `/thoughts/shared/research/2025-10-21_17-04-05_comprehensive-codebase-audit.md` - Comprehensive audit that identified this issue (Issue #9)
- `/apps/web/docs/technical/api/endpoints/admin.md` - Admin API specification
- Database schema: `/packages/shared-types/src/database.schema.ts:772+` (projects), `:1050+` (tasks), `:575+` (notes)

**Manual Verification Steps**:

1. **Create test user with many projects**:

   ```sql
   -- Create test user with 100 projects, each having varying task counts
   INSERT INTO projects (user_id, name, description)
   SELECT 'test-user-id', 'Project ' || i, 'Test project ' || i
   FROM generate_series(1, 100) AS i;
   ```

2. **Monitor query count**:
   - Open browser DevTools → Network tab
   - Navigate to: `/admin/users/{userId}/activity`
   - Filter network requests by "supabase" or "postgres"
   - **Expected**: ~9 total queries (not 200+)

3. **Measure load time**:
   - Use DevTools Performance tab
   - Measure total API response time
   - **Expected**: <500ms for 100 projects (was 2-10 seconds)

4. **Verify accuracy**:
   - Check project task counts match reality
   - Verify deleted tasks are NOT counted:

     ```sql
     -- Soft-delete a task
     UPDATE tasks SET deleted_at = NOW() WHERE id = 'test-task-id';

     -- Reload admin activity page
     -- Task count should decrease by 1
     ```

   - Verify completed task counts use `status = 'done'`:
     ```sql
     SELECT COUNT(*) FROM tasks WHERE project_id = 'test-project-id' AND status = 'done';
     -- Should match completed_task_count in API response
     ```

5. **Test edge cases**:
   - User with 0 projects → Should return empty array
   - User with projects that have 0 tasks → Should show task_count: 0
   - User with projects that have 0 notes → Should show notes_count: 0
   - Tasks with NULL project_id → Should be excluded from counts

**Database Optimization Recommendations** (Future Work):

While the current fix eliminates the N+1 pattern, these indexes would further improve performance for large datasets:

```sql
-- Composite index for tasks aggregation
CREATE INDEX idx_tasks_user_project_status
ON tasks(user_id, project_id, status)
WHERE deleted_at IS NULL;

-- Composite index for notes aggregation
CREATE INDEX idx_notes_user_project
ON notes(user_id, project_id);
```

**Related Issues**:

This same N+1 pattern appears in:

- `/apps/web/src/routes/api/projects/[id]/phases/[phaseId]/schedule/+server.ts` - Phase scheduling (Issue #13 in audit)

Consider applying the same bulk aggregation pattern to those endpoints.

---

## 2025-10-21: Fixed Queue Job Deduplication Race Condition (CRITICAL DATA CORRUPTION)

**Issue**: The queue system's `add_queue_job()` RPC function had a Time-of-Check-Time-of-Use (TOCTOU) race condition that allowed multiple concurrent requests to create duplicate jobs with the same `dedup_key`, despite deduplication logic being in place.

**Root Cause**: In `/apps/web/supabase/migrations/20251011_atomic_queue_job_operations.sql:271-282`, the deduplication logic used a non-atomic two-step pattern:

```sql
-- Step 1: Check for duplicate (NOT ATOMIC)
SELECT id, status INTO v_existing_job
FROM queue_jobs
WHERE dedup_key = p_dedup_key
  AND status IN ('pending', 'processing')
LIMIT 1;

-- Gap here allows race condition!

-- Step 2: Insert new job (SEPARATE OPERATION)
IF NOT FOUND THEN
  INSERT INTO queue_jobs (...) VALUES (...);
END IF;
```

The gap between SELECT and INSERT allowed concurrent threads to both see "no duplicate exists" and both create new jobs.

**Timeline of Race Condition**:

```
T=0ms:  Request A: SELECT (no duplicate found) ✓
T=1ms:  Request B: SELECT (no duplicate found) ✓
T=2ms:  Request A: INSERT (creates job-123) ✓
T=3ms:  Request B: INSERT (creates job-456) ❌ DUPLICATE!
Result: Two jobs with identical dedup_key in 'pending' status
```

**Impact**:

- **CRITICAL**: Database integrity violations - multiple active jobs with same `dedup_key`
- **HIGH COST**: Duplicate daily briefs generated → Wasted LLM API costs ($0.14/1M tokens × duplicates)
- **HIGH COST**: Duplicate SMS sent → Extra Twilio charges (~$0.0075/SMS × duplicates)
- **USER EXPERIENCE**: Users received multiple copies of the same daily brief email
- **SCALABILITY**: Problem worsens with concurrent load - 5 simultaneous requests could create 5 duplicates

**Example Scenario**:

- Scheduler triggers daily brief generation for user at 8:00 AM
- Multiple worker instances claim the job concurrently
- Each calls `add_queue_job()` with same `dedup_key: "brief-2025-10-21-user-123"`
- Race condition creates 3 duplicate jobs
- User receives 3 identical daily brief emails
- LLM costs tripled for same content

**Fix**: Implemented database-level atomic deduplication using PostgreSQL's partial unique index and `INSERT ... ON CONFLICT` pattern.

**Changes Made**:

1. **Database Schema** - Added partial unique index:

   ```sql
   CREATE UNIQUE INDEX CONCURRENTLY idx_queue_jobs_dedup_key_unique
   ON queue_jobs(dedup_key)
   WHERE dedup_key IS NOT NULL
     AND status IN ('pending', 'processing');
   ```

   - Partial index only enforces uniqueness for active jobs (pending/processing)
   - Allows historical jobs (completed/failed) to have duplicate `dedup_key` values
   - `CONCURRENTLY` ensures zero-downtime deployment

2. **RPC Function** - Replaced SELECT+INSERT with atomic operation:

   ```sql
   INSERT INTO queue_jobs (...) VALUES (...)
   ON CONFLICT (dedup_key)
   WHERE dedup_key IS NOT NULL AND status IN ('pending', 'processing')
   DO NOTHING
   RETURNING id;
   ```

   - Database enforces uniqueness atomically - race condition impossible
   - If duplicate exists, INSERT fails silently and existing job ID is returned
   - Single round-trip for new jobs (performance improvement)

3. **Monitoring** - Added deduplication event logging:

   ```sql
   RAISE NOTICE 'DEDUP_EVENT: Prevented duplicate job creation - job_type: %, dedup_key: %, existing_job_id: %'
   ```

   - Track how often deduplication prevents duplicates
   - Measure impact of race condition fix
   - Monitor for any unexpected deduplication patterns

4. **Cleanup** - Cancelled existing duplicate jobs:
   - Identified all `dedup_key` values with multiple active jobs
   - Kept oldest job per `dedup_key`, cancelled newer duplicates
   - Set cancellation reason for audit trail

**Files Modified**:

- **NEW**: `/apps/web/supabase/migrations/20251021_fix_queue_job_deduplication_race.sql` - Complete migration with all fixes
- **NEW**: `/apps/web/supabase/migrations/test_20251021_deduplication_fix.sql` - Comprehensive test suite

**Improvements**:

- ✅ **Atomic deduplication** - Database enforces uniqueness, no race conditions possible
- ✅ **Zero-downtime deployment** - `CREATE INDEX CONCURRENTLY` allows migration during operation
- ✅ **Performance improvement** - Single database round-trip for new jobs (vs previous two queries)
- ✅ **Better monitoring** - `DEDUP_EVENT` logs show deduplication in action
- ✅ **Historical data preserved** - Completed/failed jobs can have duplicate `dedup_key` values
- ✅ **Self-healing** - Existing duplicates automatically cancelled by migration

**Related Documentation**:

- `/thoughts/shared/research/2025-10-21_17-04-05_comprehensive-codebase-audit.md` - Comprehensive audit that identified this bug (Issue #2, lines 94-148)
- `/docs/architecture/diagrams/QUEUE-SYSTEM-FLOW.md` - Queue system design (lines 41-78 show intended deduplication flow)
- `/apps/worker/CLAUDE.md` - Worker service documentation with queue architecture
- `/apps/worker/src/lib/supabaseQueue.ts:68-108` - Queue client that uses `add_queue_job()`

**Manual Verification Steps**:

1. **Test basic deduplication**:

   ```sql
   -- Insert job with dedup key
   SELECT add_queue_job(
     'user-123'::uuid, 'generate_daily_brief',
     '{"briefDate": "2025-10-21"}'::jsonb,
     10, NOW(), 'brief-2025-10-21-user-123'
   );
   -- Returns: job_id_1

   -- Try to insert duplicate (should return same ID)
   SELECT add_queue_job(
     'user-123'::uuid, 'generate_daily_brief',
     '{"briefDate": "2025-10-21"}'::jsonb,
     10, NOW(), 'brief-2025-10-21-user-123'
   );
   -- Returns: job_id_1 (same ID, no duplicate created)
   ```

2. **Test completed jobs don't block new jobs**:

   ```sql
   -- Mark job as completed
   UPDATE queue_jobs SET status = 'completed'
   WHERE dedup_key = 'brief-2025-10-21-user-123';

   -- Create new job with same dedup_key (should succeed)
   SELECT add_queue_job(..., 'brief-2025-10-21-user-123');
   -- Returns: job_id_2 (new job created)
   ```

3. **Test high-concurrency scenario** (5 simultaneous requests):

   ```bash
   # Run 5 concurrent API calls
   for i in {1..5}; do
     curl -X POST http://localhost:3001/api/briefs/generate \
       -H "Content-Type: application/json" \
       -d '{"userId": "user-123", "briefDate": "2025-10-21"}' &
   done
   wait

   # Verify only ONE job created
   SELECT COUNT(*) FROM queue_jobs
   WHERE metadata->>'briefDate' = '2025-10-21'
     AND status IN ('pending', 'processing');
   -- Should return: 1 (not 5)
   ```

4. **Monitor deduplication events**:

   ```bash
   # Check worker logs for DEDUP_EVENT messages
   grep "DEDUP_EVENT" /path/to/worker/logs
   # Example output:
   # NOTICE: DEDUP_EVENT: Prevented duplicate job creation -
   #   job_type: generate_daily_brief,
   #   dedup_key: brief-2025-10-21-user-123,
   #   existing_job_id: abc-123-def
   ```

5. **Verify no active duplicates exist**:
   ```sql
   -- Check for any dedup_keys with multiple active jobs
   SELECT dedup_key, COUNT(*) as job_count
   FROM queue_jobs
   WHERE dedup_key IS NOT NULL
     AND status IN ('pending', 'processing')
   GROUP BY dedup_key
   HAVING COUNT(*) > 1;
   -- Should return: 0 rows (no duplicates)
   ```

**Test Suite**: Run the comprehensive test suite at `/apps/web/supabase/migrations/test_20251021_deduplication_fix.sql` to verify all aspects of the fix:

- Index existence and uniqueness enforcement
- No active duplicates in database
- Basic deduplication works correctly
- Completed jobs don't block new jobs
- Unique constraint prevents direct duplicate inserts
- Index performance is optimal

**Expected Results After Fix**:

- ✅ Zero duplicate daily briefs generated
- ✅ Zero duplicate SMS sent
- ✅ LLM costs reduced (no wasted duplicate processing)
- ✅ SMS costs reduced (no duplicate charges)
- ✅ Database integrity maintained
- ✅ `DEDUP_EVENT` logs show when deduplication prevents duplicates
- ✅ Performance improvement from single database round-trip

**Cross-references**:

- Related to Worker Exception Handlers (see entry below) - Both affect queue reliability
- Related to Daily Brief System audit findings - Duplicate briefs issue now resolved

---

## 2025-10-21: Fixed SMS Quiet Hours Minutes Being Ignored (CRITICAL PRIVACY VIOLATION)

**Issue**: SMS notifications were being sent during users' quiet hours due to incorrect time parsing. The quiet hours check used `parseInt()` on `HH:MM:SS` format strings, which **completely ignored the minutes component**, only checking the hour.

**Root Cause**: In `/apps/worker/src/workers/smsWorker.ts:138-145`, the code parsed quiet hours like this:

```typescript
const quietStart = parseInt(userPrefs.quiet_hours_start); // "22:30:00" → 22
const quietEnd = parseInt(userPrefs.quiet_hours_end); // "08:30:00" → 8
```

The `parseInt()` function stops parsing at the first non-digit character (`:`), so it only extracted the hour component and discarded the minutes entirely.

**Impact**:

- **CRITICAL**: Users received SMS notifications during their explicitly set quiet hours
- **Privacy Violation**: Users could be woken up at night (e.g., SMS sent at 22:15 when quiet hours start at 22:30)
- **Compliance Risk**: Potential TCPA violations - US telecommunications law requires respecting quiet hours preferences
- **User Trust**: Platform violated user privacy preferences, potentially causing users to disable SMS notifications entirely

**Example Scenario**:

- User sets quiet hours: 22:30 - 08:30
- Buggy code treats it as: 22:00 - 08:00
- SMS sent at 22:15 → Should be blocked, but was sent ❌
- SMS sent at 08:15 → Should be blocked, but was sent ❌
- Result: 60 minutes of daily privacy violations (30 min × 2)

**Fix**: Replaced buggy `parseInt()` logic with the proper `checkQuietHours()` function from `/apps/worker/src/lib/utils/smsPreferenceChecks.ts` that was created for this purpose but never integrated.

**Files Modified**:

- `/apps/worker/src/workers/smsWorker.ts:12` - Added import for `checkQuietHours`
- `/apps/worker/src/workers/smsWorker.ts:134-183` - Replaced buggy quiet hours check with correct implementation

**Improvements**:

- ✅ Correctly parses both hours AND minutes from `HH:MM:SS` format
- ✅ Converts times to minutes (e.g., `22:30` → `1350 minutes`) for accurate comparison
- ✅ Handles timezone conversion using user's timezone from `users.timezone` field
- ✅ Properly handles overnight quiet hours (e.g., 22:00 - 08:00)
- ✅ Returns accurate reschedule time when in quiet hours
- ✅ Better logging with detailed reason strings

**Related Documentation**:

- `/thoughts/shared/research/2025-10-21_17-04-05_comprehensive-codebase-audit.md` - Comprehensive audit that identified this bug (Issue #6)
- `/docs/architecture/SMS_NOTIFICATION_CHANNEL_DESIGN.md` - SMS system design intent
- `/apps/worker/src/lib/utils/smsPreferenceChecks.ts:57-123` - Proper implementation reference

**Manual Verification Steps**:

1. Set user quiet hours to `22:30 - 08:30` in `user_sms_preferences` table
2. Set user timezone to `America/Los_Angeles` (PST)
3. Schedule SMS for 22:15 PST → Should send immediately ✅
4. Schedule SMS for 22:35 PST → Should reschedule to 08:30 PST ✅
5. Schedule SMS for 08:15 PST → Should reschedule to 08:30 PST ✅
6. Schedule SMS for 08:35 PST → Should send immediately ✅
7. Check logs for detailed quiet hours messages with timezone info
8. Verify rescheduled SMS are queued with correct `scheduled_for` timestamp

**Verification Query**:

```sql
-- Check if any users have quiet hours with non-zero minutes
SELECT user_id, quiet_hours_start, quiet_hours_end
FROM user_sms_preferences
WHERE quiet_hours_start IS NOT NULL
  AND (quiet_hours_start NOT LIKE '%:00:00' OR quiet_hours_end NOT LIKE '%:00:00');
```

---

## 2025-10-21: Fixed Email Input Validation Weakness (HIGH SEVERITY SECURITY FIX)

**Issue**: Email validation across multiple API endpoints used a weak regex pattern that failed to prevent SMTP header injection attacks, DoS attacks via long strings, and RFC 5321 violations. The `/api/admin/emails/send` endpoint had NO email validation at all.

**Root Cause**: The codebase used a basic regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` duplicated across 4 files, with no centralized validation utility. This regex pattern failed to:

- Prevent SMTP header injection via `\r\n` characters (e.g., `attacker@evil.com\r\nBCC:everyone@company.com`)
- Enforce RFC 5321 length limits (254 chars total, 64 chars local part)
- Validate proper email structure beyond basic format
- Normalize emails to lowercase (causing duplicate detection issues)

**Impact**:

- **CRITICAL**: Email header injection vulnerability allowed attackers to send emails to arbitrary recipients via admin endpoints
- **HIGH**: DoS risk via excessively long email strings causing memory/processing issues
- **MEDIUM**: Data integrity issues with malformed emails stored in database
- **MEDIUM**: Duplicate account creation due to case-sensitive email comparisons

**Vulnerable Endpoints**:

1. `/api/admin/emails/send/+server.ts:16` - **NO VALIDATION** (most critical)
2. `/api/auth/register/+server.ts:14-18` - Weak regex only
3. `/api/admin/emails/generate/+server.ts:55` - No validation of `userInfo.basic.email`
4. `/api/beta/signup/+server.ts:34` - Weak regex only
5. `/api/feedback/+server.ts:49` - Weak regex for optional field

**Fix**: Created centralized email validation utilities and updated all affected endpoints.

**Files Created**:

- `/apps/web/src/lib/utils/email-validation.ts` - Backend Zod-based validation (authoritative)
- `/apps/web/src/lib/utils/client-email-validation.ts` - Frontend validation for better UX

**Backend Validation Features** (using Zod):

- RFC 5321 compliant (max 254 chars total, max 64 chars local part)
- Prevents SMTP header injection via `\r` and `\n` character checks
- Automatic lowercase normalization
- Comprehensive email format validation
- Separate validators for required vs optional email fields

**Files Modified**:

1. **`/apps/web/src/routes/api/admin/emails/send/+server.ts`** - Added email validation (was completely missing)
2. **`/apps/web/src/routes/api/auth/register/+server.ts`** - Replaced weak regex with Zod validation
3. **`/apps/web/src/routes/api/admin/emails/generate/+server.ts`** - Added validation for userInfo email
4. **`/apps/web/src/routes/api/beta/signup/+server.ts`** - Replaced weak regex, normalized email in DB inserts (POST and GET)
5. **`/apps/web/src/routes/api/feedback/+server.ts`** - Replaced weak regex with optional email validator

**Security Improvements**:

- ✅ Prevents SMTP header injection attacks
- ✅ Enforces RFC 5321 length limits (prevents DoS)
- ✅ Validates email structure comprehensively
- ✅ Normalizes emails to lowercase (prevents duplicates)
- ✅ Client-side validation for immediate user feedback
- ✅ Single source of truth for validation logic (no code duplication)

**Related Documentation**:

- `/thoughts/shared/research/2025-10-21_00-00-00_input-validation-security-audit.md` - Security audit that identified this issue

**Manual Verification Steps**:

1. Try to register with email containing `\r\n` characters - should be rejected with clear error
2. Try to register with email > 254 characters - should be rejected
3. Try to send admin email with no `@` symbol - should be rejected
4. Try beta signup with email having local part > 64 chars - should be rejected
5. Submit feedback with valid optional email - should succeed and normalize to lowercase
6. Submit feedback with NO email - should succeed (optional field)
7. Verify emails are stored in lowercase in database
8. Verify duplicate email detection now works case-insensitively

**Testing Notes**:

- All email validation now uses Zod schema for consistency and type safety
- Normalized emails are used throughout (lowercase) for database operations
- Optional email fields are handled differently (allow null/empty)
- Frontend validation provides instant feedback before API calls
- Backend validation is authoritative and cannot be bypassed

**Attack Examples Prevented**:

```
# SMTP Header Injection (NOW BLOCKED)
attacker@evil.com\r\nBCC:everyone@company.com

# DoS via Long Email (NOW BLOCKED)
a@extremely-long-email-address-that-exceeds-rfc-limits...com

# Local Part Too Long (NOW BLOCKED)
this-local-part-is-way-too-long-and-exceeds-64-characters-limit@example.com

# Case Sensitivity Issues (NOW FIXED)
User@Example.Com → normalized to user@example.com
```

---

## 2025-10-20: Fixed Prep Analysis UI Not Updating in DualProcessingResults Component

**Issue**: When preparatory analysis was running for existing projects, the UI in the DualProcessingResults component was not updating with analysis progress, status, or results. Users saw no indication that the analysis phase was occurring.

**Root Cause**: The brain-dump-v2.store's `updateBrainDumpStreamingState()` method was missing three critical fields:

- `analysisStatus` - The current state of the analysis (processing, completed, failed, etc.)
- `analysisProgress` - Progress message from the analysis phase
- `analysisResult` - The preparatory analysis result data containing classification, relevant tasks, etc.

When the brain-dump-notification.bridge called `updateBrainDumpStreamingState(brainDumpId, { analysisStatus: 'processing', ... })`, the store was silently dropping these analysis fields because it only handled context and tasks fields.

**Impact**:

- Analysis phase UI was completely hidden (no progress indicator, status, or results shown)
- Users had no feedback during the analysis phase of brain dump processing
- DualProcessingResults component received undefined analysis fields even though store methods were called with proper data
- Existing project updates showed no analysis information in the notification UI

**Fix**: Updated three streaming state methods in `/apps/web/src/lib/stores/brain-dump-v2.store.ts` to include analysis fields:

**Changed Methods**:

1. **`updateBrainDumpStreamingState()` (line 1134-1187)** - Per-brain-dump update method
   - Added `analysisStatus` field (defaults to 'not_needed')
   - Added `analysisProgress` field (defaults to '')
   - Added `analysisResult` field (defaults to undefined)
   - Properly merges analysis state across updates

2. **`updateStreamingState()` (line 1758-1798)** - Legacy single brain dump update method
   - Same three analysis fields added
   - Maintains backward compatibility for non-multi-brain-dump mode

3. **`resetStreamingState()` (line 1800-1817)** - Streaming state reset method
   - Initializes `analysisStatus` to 'not_needed'
   - Initializes `analysisProgress` to ''
   - Initializes `analysisResult` to null

**How It Works**:

1. API endpoint sends analysis SSE messages: `{ type: 'analysis', data: { status: 'processing', ... } }`
2. brain-dump-notification.bridge receives the message and calls: `updateBrainDumpStreamingState(id, { analysisStatus: 'processing', ... })`
3. Store now persists these analysis fields in the streaming state object
4. BrainDumpModalContent.svelte derives `realtimeStreamingState` from store
5. DualProcessingResults component receives analysis fields via props and renders the analysis UI

**Type Definitions Already Support This**:

- The type definitions at lines 80-90 (SingleBrainDumpState) and 226-236 (UnifiedBrainDumpState) already included the optional analysis fields
- The fix was just adding them to the actual state objects being created/updated

**Related Files**:

- `/apps/web/src/lib/components/brain-dump/DualProcessingResults.svelte:129-148` - Analysis UI rendering
- `/apps/web/src/lib/components/notifications/types/brain-dump/BrainDumpModalContent.svelte:77-79` - Streaming state derivation
- `/apps/web/src/lib/services/brain-dump-notification.bridge.ts:592-673` - Stream update handling
- `/apps/web/src/routes/api/braindumps/stream/+server.ts:159-247` - SSE analysis message sending

**Manual Verification Steps**:

1. Create a new brain dump with an existing project selected
2. Observe the DualProcessingResults component during processing
3. Should see "Analyzing Your Braindump" card appear while analysis is running
4. Should see analysis progress and results once analysis completes
5. Analysis classification badge should display (e.g., "strategic", "tactical", "mixed")
6. Relevant task count should show in analysis results
7. Context and tasks panels should still process normally after analysis completes

**Testing Notes**:

- Analysis should run only for existing projects (not new projects)
- Analysis should be the first phase of dual processing before context/tasks
- After analysis completes successfully, context and tasks phases should proceed
- If analysis fails, system should fall back to full processing without crashing

---

## 2025-10-20: Fixed Markdown Heading Inflation in Project Context and Task Descriptions

**Issue**: Project context and task descriptions were experiencing heading level inflation over successive brain dump processing cycles. Headings would gradually deepen (e.g., H2 → H4 → H6) causing markdown structure to become malformed and headings to exceed valid markdown limits.

**Root Cause**: The validation logic in `validateAndSanitizeCrudOperations()` was using conditional normalization based on a high threshold (expected max depth > 4 for projects, > 3 for tasks). This meant:

- Headings at levels 1-4 were left unchanged for projects
- Headings at levels 1-3 were left unchanged for tasks
- Over time, as normalized context was re-embedded in subsequent brain dump prompts and re-processed by the LLM, heading levels would drift deeper
- The conditional check meant normalization was OPTIONAL, allowing inflate to persist

**Impact**:

- Project context accumulated inconsistent heading levels (H1-H6) over multiple updates
- Task descriptions/details had unstable heading structures
- Context readability degraded with each brain dump cycle
- Markdown output became malformed when headings exceeded H6 limit

**Fix**: Implemented proactive, unconditional heading normalization:

**Changed Files**:

1. **`/apps/web/src/lib/services/prompts/core/validations.ts:38-81`**:
   - **Project Context** (line 47-55): ALWAYS normalize to H2 base level (remove conditional check)
   - **Task Descriptions** (line 60-67): ALWAYS normalize to H1 base level (remove conditional check)
   - **Task Details** (line 69-76): ALWAYS normalize to H1 base level (remove conditional check)
   - Added console.warn logging to track when normalization occurs

**Key Changes**:

- Removed `if (hasInflatedHeadings(data.context, 4))` conditional - now ALWAYS applies normalization
- Removed `if (hasInflatedHeadings(data.description, 3))` conditional - now ALWAYS applies normalization
- Removed `if (hasInflatedHeadings(data.details, 3))` conditional - now ALWAYS applies normalization
- Added warning logs to identify when content arrives with inflated headings

**Why This Works**:

- Ensures consistent heading levels on every validation pass
- Prevents heading drift across multiple brain dump cycles
- Maintains structural integrity of markdown content
- Uses existing `normalizeMarkdownHeadings()` utility from `/apps/web/src/lib/utils/markdown-nesting.ts`

**Related Utilities** (already available, now fully utilized):

- `normalizeMarkdownHeadings()`: Reduces heading levels back to target level
- `hasInflatedHeadings()`: Detects when headings exceed expected depth
- `adjustMarkdownHeadingLevels()`: Adjusts relative heading structure

**Testing Recommendations**:

1. Create new project with brain dump containing multi-level markdown in context
2. Verify project.context has headings starting at H2
3. Update project with new brain dump content
4. Verify context headings still start at H2 (not inflated to H4+)
5. Repeat update cycle 3-4 times and verify no heading drift
6. Check browser console for `[validations]` warning logs during normalization
7. Verify task descriptions/details maintain H1 base level across updates

**Cross-References**:

- See `/apps/web/src/lib/utils/markdown-nesting.ts` for heading utility functions
- Related context extraction: `/apps/web/src/lib/utils/braindump-processor.ts:1021-1183` (extractProjectContext)
- Related: Project schema `/packages/shared-types/src/database.schema.ts` (projects.context field)

---

## 2025-10-20: Updated LLM Prompts - Strategic Focus and Markdown Format

**Issue**:

1. Context and core dimensions were being generated as unformatted text instead of markdown
2. Context field was being polluted with task-level execution details instead of focusing on strategy

**Root Cause**:

- LLM prompts did not require markdown formatting
- No clear guidance distinguishing between strategic information (context) and execution details (tasks)
- All braindump details were being dumped into context without filtering

**Impact**:

- Context fields displayed as long paragraphs without structure, mixing strategy with task details
- Core dimensions lacked markdown formatting
- Context mixed strategy with execution details (task lists, step-by-step actions)
- Unclear separation between what belongs in context vs tasks table
- Someone unfamiliar with project couldn't quickly understand it from context alone

**Fix**: Updated prompts with TWO key changes:

**Change 1: Strategic vs Execution Distinction**

Context and core dimensions should capture STRATEGY only, not execution details:

- **Context IS**: Strategic overview, why project matters, key challenges, approach, evolution
- **Context is NOT**: Task lists, step-by-step actions, execution details
- **Include**: "Preparing for AP exams in 6 weeks with weak areas in Calc BC series and Bio labs"
- **Exclude**: "Study series convergence 1 hour daily", "Review 12 labs", "Take practice test Saturday"

**Change 2: Markdown Formatting with Natural Evolution**

Context and dimensions must use markdown, allowing structure to evolve naturally:

- Early: 1-2 sentences of strategy
- Mature: Rich markdown with headers, bullets, emphasis
- No prescriptive rules - LLM decides structure based on content

**Updated Files**:

1. `/apps/web/src/lib/services/prompts/core/prompt-components.ts`:
   - Added "What context IS/IS NOT" with clear examples
   - Updated core dimensions guidance for strategic focus only
   - Enhanced `generateCoreDimensionsMarkdownInstructions()` with strategic/execution examples

2. `/apps/web/src/lib/services/promptTemplate.service.ts` (prep-analysis):
   - Added filter: "Only capture strategic-level information, not execution details"
   - Added examples (include vs exclude)
   - Emphasized task-level details belong in tasks table

3. `/apps/web/docs/prompts/brain-dump/new-project/dual-processing/context/new-project-context-prompt.md`:
   - Updated guidelines with strategic focus emphasis
   - Added "DO NOT include task lists, step-by-step actions, or execution details"

4. `/apps/web/docs/prompts/brain-dump/existing-project/dual-processing/context/existing-project-context-prompt.md`:
   - Updated Update Rules with strategic focus
   - Added filter for strategic relevance
   - Added explicit "EXCLUDE task-level details" rule

**Key Philosophy**:

- Markdown IS required (not plain text)
- Context = Strategic Master Document (brings unfamiliar person up to speed on strategy)
- Tasks = Execution Details (specific actions, implementation)
- Structure evolves naturally as project matures
- Filter all braindump details: if it's about HOW TO DO something, it's a task, not context

**Testing Recommendations**:

1. Create project with brain dump containing strategy AND task details
2. Verify context captures only strategy, not task lists
3. Verify task details are extracted as separate tasks
4. Verify core dimensions contain strategic info, not execution specifics
5. Verify someone unfamiliar with project can understand it from context alone

**Cross-References**:

- See `/apps/web/src/lib/types/brain-dump.ts` for `PreparatoryAnalysisResult` interface
- See `/apps/web/docs/prompts/` for all prompt templates
- Related: Core Dimensions fields in `/packages/shared-types/src/database.schema.ts` (projects table)

---

## 2025-10-20: Fixed Missing Timeblock Cascade Deletion When Deleting Projects

**Issue**: When a project with timeblocks was deleted, the timeblocks and their associated Google Calendar events were NOT deleted, leaving orphaned data in both the database and Google Calendar.

**Root Cause**: The project deletion endpoint (`/api/projects/[id]/delete/+server.ts`) handled deletion of tasks and their calendar events but did not include logic to delete timeblocks. The system had the individual timeblock deletion logic (`TimeBlockService.deleteTimeBlock()`), but this wasn't being called during project cascade deletion.

**Impact**:

- Orphaned timeblocks remained in the database with deleted projects
- Google Calendar events for deleted project timeblocks persisted (data pollution)
- UI would show timeblocks for non-existent projects
- Inconsistent state between database and Google Calendar
- Potential confusion for users who deleted and recreated projects with timeblocks

**Fix**: Added cascade deletion for timeblocks in the project deletion endpoint:

1. **Step 4.5** (new): After deleting task calendar events, fetch all timeblocks linked to the project
2. **For each timeblock**:
   - If it has a `calendar_event_id`, attempt to delete from Google Calendar via `CalendarService`
   - Catch calendar deletion errors (log warnings but don't fail the entire operation)
   - Soft-delete the timeblock in database (set `sync_status = 'deleted'` to maintain audit trail)
3. **Return summary** with counts of successful/failed deletions

**Files Changed**:

- `/apps/web/src/routes/api/projects/[id]/delete/+server.ts` (lines 132-147, 317-397)

**Code Changes**:

```typescript
// New logic in DELETE handler (lines 132-147):
// 4.5. Delete time blocks associated with the project
const { data: timeBlocks, error: timeBlocksGetError } = await supabase
  .from("time_blocks")
  .select("id, calendar_event_id")
  .eq("project_id", projectId)
  .eq("user_id", userId);

if (timeBlocks && timeBlocks.length > 0 && !timeBlocksGetError) {
  const timeBlockResults = await handleTimeBlockDeletion(
    timeBlocks,
    userId,
    supabase,
  );
  warnings.push(...timeBlockResults.warnings);
  errors.push(...timeBlockResults.errors);
}

// New helper function (lines 317-397):
async function handleTimeBlockDeletion(
  timeBlocks: any[],
  userId: string,
  supabase: any,
): Promise<{ warnings: string[]; errors: string[] }> {
  const calendarService = new CalendarService(supabase);
  const warnings: string[] = [];
  const errors: string[] = [];
  let successCount = 0;
  let failCount = 0;

  for (const block of timeBlocks) {
    try {
      // Delete from Google Calendar if event exists
      if (block.calendar_event_id) {
        try {
          await calendarService.deleteCalendarEvent(userId, {
            event_id: block.calendar_event_id,
          });
        } catch (calendarError: any) {
          // Log but continue - we'll still soft-delete the timeblock
          warnings.push(
            `Failed to remove time block calendar event: ${calendarError?.message || "Unknown error"}`,
          );
        }
      }

      // Soft-delete the time block in database
      const nowIso = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("time_blocks")
        .update({
          sync_status: "deleted",
          sync_source: "app",
          updated_at: nowIso,
          last_synced_at: nowIso,
        })
        .eq("id", block.id)
        .eq("user_id", userId);

      if (updateError) {
        failCount++;
        warnings.push(
          `Failed to delete time block from database: ${updateError.message || "Unknown error"}`,
        );
      } else {
        successCount++;
      }
    } catch (error: any) {
      failCount++;
      warnings.push(
        `Failed to delete time block: ${error?.message || "Unknown error"}`,
      );
    }
  }

  // Add summary messages
  if (successCount > 0) {
    warnings.push(`${successCount} time block(s) deleted successfully.`);
  }
  if (failCount > 0) {
    errors.push(`${failCount} time block(s) failed to delete.`);
  }

  return { warnings, errors };
}
```

**Design Decisions**:

1. **Soft-delete vs Hard-delete**: Used soft-delete (setting `sync_status = 'deleted'`) to match the existing `TimeBlockService.deleteTimeBlock()` pattern. This maintains audit trails and allows recovery if needed.

2. **Error Handling**: Calendar deletion failures are logged as warnings but don't block the operation. Database deletions failures are logged but don't prevent the project deletion from completing. This follows the same pattern as task calendar event deletion.

3. **Sequence**: Timeblock deletion happens AFTER task/calendar event deletion and BEFORE final project deletion in the cascade sequence.

**Breaking Changes**: NONE

- Soft-deleted timeblocks are already filtered out by existing queries (`.neq('sync_status', 'deleted')`)
- All timeblock fetch operations already use this filter pattern
- Deleted timeblocks won't appear in the UI or API responses
- No existing code changes required

**Manual Verification Steps**:

1. Create a project with 2-3 timeblocks scheduled on Google Calendar
2. Verify timeblocks appear in the web UI and Google Calendar
3. Delete the project via the web UI
4. Verify in web UI: Timeblocks no longer appear in time blocks list
5. Verify in Google Calendar: Events have been removed
6. Verify in database (optional): `SELECT * FROM time_blocks WHERE project_id = '<deleted_project_id>'` shows `sync_status = 'deleted'`

**Related Documentation**:

- Time Blocks Feature: `/apps/web/docs/features/time-blocks/` (if exists)
- TimeBlockService: `/apps/web/src/lib/services/time-block.service.ts:650-692` (deleteTimeBlock method)
- CalendarService: `/apps/web/src/lib/services/calendar-service.ts`
- Database Schema: `/packages/shared-types/src/database.schema.ts:1076-1096` (time_blocks table)

**Date Fixed**: 2025-10-20
**Fixed By**: Claude Code
**Severity**: Medium (data consistency issue, no user data loss)
**Status**: ✅ Fixed

---

## 2025-10-20: Fixed Svelte 5 Critical Issues (Memory Leaks, Non-Reactive State, Logic Bugs)

**Context**: Following comprehensive audit documented in `/docs/SVELTE5_AUDIT_FINDINGS.md`, Phase 1 critical fixes were implemented to address memory leaks, non-reactive state variables, and logic bugs.

**Issues Fixed**: 7 critical bugs across memory management, UI reactivity, and rate limiting.

### Bug #1: PWA Enhancements Event Listener Memory Leak

**Severity**: CRITICAL
**Root Cause**: `initializePWAEnhancements()` and `setupInstallPrompt()` created 7 event listeners (5 + 2) that were never removed, causing memory accumulation and duplicate handlers.

**Impact**:

- Memory leaks compound over time (weeks of usage)
- Multiple handlers fire for same events
- PWA features behave erratically
- Mobile app crashes due to memory pressure

**Fix**: Refactored functions to store handler references and return cleanup functions:

```typescript
// Before: Inline handlers, no cleanup
darkModeMediaQuery.addEventListener("change", (e) => {
  /* handler */
});

// After: Named handlers with cleanup
const handleDarkModeChange = (e: MediaQueryListEvent) => {
  /* handler */
};
darkModeMediaQuery.addEventListener("change", handleDarkModeChange);

return () => {
  darkModeMediaQuery.removeEventListener("change", handleDarkModeChange);
  // ... remove all other listeners
};
```

**Files Changed**: `/apps/web/src/lib/utils/pwa-enhancements.ts:75-145, 184-218`

### Bug #2: Background Jobs Store Subscription Memory Leak

**Severity**: CRITICAL
**Root Cause**: `backgroundBrainDumpService.subscribe()` never stored or called its unsubscribe function, causing permanent subscription and duplicate job processing.

**Impact**:

- Background jobs processed multiple times
- Duplicate notifications sent to users
- Memory accumulates over application lifetime
- State updates become slower as subscription count grows

**Fix**: Stored unsubscribe function and called it in `destroy()`:

```typescript
// Before: Subscription leak
backgroundBrainDumpService.subscribe((job) => {
  /* update */
});

// After: Properly managed
let unsubscribeFromService = backgroundBrainDumpService.subscribe((job) => {
  /* update */
});

destroy: () => {
  if (unsubscribeFromService) {
    unsubscribeFromService();
    unsubscribeFromService = null;
  }
};
```

**Files Changed**: `/apps/web/src/lib/stores/backgroundJobs.ts:14, 21, 52-55`

### Bug #3: Time Blocks Store Subscription Memory Leak

**Severity**: CRITICAL
**Root Cause**: Module-level `internalStore.subscribe()` created permanent subscription with no cleanup mechanism.

**Impact**:

- Memory accumulates over time
- Store updates slow down as subscriptions persist
- No way to cleanup when store is no longer needed

**Fix**: Stored unsubscribe function and added `destroy()` method to store interface:

```typescript
// Before: Permanent subscription
internalStore.subscribe((value) => {
  currentState = value;
});

// After: Cleanup available
const unsubscribe = internalStore.subscribe((value) => {
  currentState = value;
});

return {
  // ... other methods
  destroy() {
    if (unsubscribe) unsubscribe();
  },
};
```

**Files Changed**: `/apps/web/src/lib/stores/timeBlocksStore.ts:64-66, 399-403`

### Bug #4: Logout Rate Limiting Failure

**Severity**: HIGH
**Root Cause**: Variable `logoutAttempts` initialized as `0`, then set to timestamp. Comparison `logoutAttempts > 0 && now - logoutAttempts < 2000` never worked properly because:

- First call: `0 > 0` is false, always bypasses rate limiting
- Variable name confusion (counter vs timestamp)

**Impact**:

- Users can spam logout button rapidly
- Multiple simultaneous logout requests to API
- Potential authentication state confusion
- Session handling issues

**Fix**: Renamed variable to `lastLogoutAttempt` for clarity, fixed logic:

```typescript
// Before: Broken logic
let logoutAttempts = $state(0);
if (logoutAttempts > 0 && now - logoutAttempts < 2000) return;
logoutAttempts = now;

// After: Clear intent
let lastLogoutAttempt = $state(0);
if (lastLogoutAttempt > 0 && now - lastLogoutAttempt < 2000) return;
lastLogoutAttempt = now;
```

**Files Changed**: `/apps/web/src/lib/components/layout/Navigation.svelte:56, 89-93, 123`

### Bug #5: Briefs Page Non-Reactive State

**Severity**: CRITICAL
**Root Cause**: Four state variables (`isToday`, `isInitialLoading`, `isLoading`, `showMobileMenu`) not wrapped in `$state()`, causing UI to freeze when values changed.

**Impact**:

- Mobile menu doesn't open/close
- Loading states don't update
- Page appears frozen
- Poor user experience

**Fix**: Wrapped variables in `$state()`:

```typescript
// Before: Non-reactive
let isToday = false;
let isInitialLoading = true;
let isLoading = false;
let showMobileMenu = false;

// After: Reactive
let isToday = $state(false);
let isInitialLoading = $state(true);
let isLoading = $state(false);
let showMobileMenu = $state(false);
```

**Files Changed**: `/apps/web/src/routes/briefs/+page.svelte:74, 77-78, 80`

### Bug #6: Trial Banner Non-Reactive State and Old Syntax

**Severity**: HIGH
**Root Cause**:

1. `dismissed` variable not wrapped in `$state()`, banner dismissal didn't update UI
2. Seven `$:` reactive declarations using deprecated Svelte 4 syntax

**Impact**:

- Banner doesn't disappear when dismissed
- Poor UX, users see dismissed banner
- Using deprecated syntax (future compatibility risk)

**Fix**:

1. Wrapped `dismissed` in `$state()` with sessionStorage initialization
2. Migrated all `$:` declarations to `$derived()`

```typescript
// Before: Non-reactive + old syntax
let dismissed = false;
$: trialEndDate = user.trial_ends_at ? new Date(user.trial_ends_at) : null;
$: daysLeft = trialEndDate ? getDaysUntilTrialEnd(trialEndDate) : 0;

// After: Reactive + modern syntax
let dismissed = $state(
  typeof window !== "undefined"
    ? sessionStorage.getItem("trial_banner_dismissed") === "true"
    : false,
);
let trialEndDate = $derived(
  user.trial_ends_at ? new Date(user.trial_ends_at) : null,
);
let daysLeft = $derived(trialEndDate ? getDaysUntilTrialEnd(trialEndDate) : 0);
```

**Files Changed**: `/apps/web/src/lib/components/trial/TrialBanner.svelte:21-48, 54-60`

### Bug #7: Recipient Selector Non-Reactive Collections

**Severity**: CRITICAL
**Root Cause**: Three Sets (`selectedUserIds`, `selectedMemberIds`, `selectedCustomIds`) not wrapped in `$state()`. In Svelte 5, Set/Map mutations require `$state()` wrapper for reactivity.

**Impact**:

- Checkbox selections don't trigger UI updates
- Email recipient selection completely broken
- Users can't see selected recipients
- Critical functionality failure

**Fix**: Wrapped all Sets in `$state()`:

```typescript
// Before: Non-reactive mutations
let selectedUserIds = new Set<string>();
let selectedMemberIds = new Set<string>();
let selectedCustomIds = new Set<string>();

// After: Reactive mutations
let selectedUserIds = $state(new Set<string>());
let selectedMemberIds = $state(new Set<string>());
let selectedCustomIds = $state(new Set<string>());
```

**Files Changed**: `/apps/web/src/lib/components/email/RecipientSelector.svelte:26-28`

### Summary of Changes

**Total Files Modified**: 7
**Total Lines Changed**: ~80 lines
**Complexity**: Medium (careful reactive dependency tracking required)
**Risk Level**: Low (targeted fixes, no breaking changes)

**Benefits**:

- ✅ Memory leaks eliminated (PWA, stores)
- ✅ UI properly updates when state changes
- ✅ Logout rate limiting works correctly
- ✅ Cleaner Svelte 5 syntax (`$derived` vs `$:`)
- ✅ Better application stability and performance

**Manual Verification Steps**:

1. **PWA Event Listeners**: Open DevTools → Performance Monitor → verify listener count doesn't grow over time
2. **Background Jobs**: Generate brain dump → check job updates only fire once (no duplicates)
3. **Time Blocks**: Load time blocks page → verify no memory leaks in subscriptions
4. **Logout Rate Limiting**: Rapidly click logout → verify rate limiting works (max 1 logout per 2 seconds)
5. **Briefs Page**: Toggle mobile menu → verify it opens/closes; check loading states update
6. **Trial Banner**: Dismiss banner → verify it disappears and stays dismissed for session
7. **Recipient Selector**: Select recipients via checkboxes → verify checkboxes update correctly

**Related Documentation**:

- Full audit report: `/docs/SVELTE5_AUDIT_FINDINGS.md`
- Svelte 5 runes guide: `/apps/web/CLAUDE.md` (Svelte 5 Runes section)

**Next Steps**: Phase 2 will address remaining 150+ instances of old `$:` syntax across the codebase (see audit Section 1).

---

## 2025-10-20: Fixed Critical Daily Brief Bugs (Task Counts, Performance, Deleted Tasks)

**Issues**: Three bugs were discovered and fixed in the daily brief generation flow:

1. **CRITICAL: Task counts always zero in notifications** - Users received notifications saying "0 tasks" even when they had tasks
2. **PERFORMANCE/SECURITY: Fetching all phase_tasks** - Worker fetched all phase_tasks from entire database without filtering
3. **DATA ACCURACY: Deleted tasks appearing in briefs** - Soft-deleted tasks were included in daily briefs

### Bug #1: Task Counts Always Zero

**Root Cause**: The query in `briefWorker.ts` tried to fetch project briefs using a non-existent column `daily_brief_id`. The `project_daily_briefs` table doesn't have this column - the relationship is stored via `user_id` + `brief_date` combination.

**Impact**:

- All task counts in notification payloads were always 0
- Email and SMS notifications showed "You have 0 tasks today" regardless of actual tasks
- Users couldn't trust the notification summaries

**Fix**: Changed query to use correct columns:

```typescript
// Before (WRONG - daily_brief_id doesn't exist):
.eq("daily_brief_id", brief.id)

// After (CORRECT):
.eq("user_id", job.data.userId)
.eq("brief_date", validatedBriefDate)
```

**Files Changed**: `/apps/worker/src/workers/brief/briefWorker.ts:398-402`

### Bug #2: Fetching All Phase Tasks (Performance/Security)

**Root Cause**: The query fetched ALL `phase_tasks` from the entire database without any filtering, then filtered in memory. This created unnecessary load and potential security exposure.

**Impact**:

- Performance degradation as database grows
- Fetched thousands of unnecessary rows
- Security risk if RLS not properly configured (could expose other users' phase tasks)
- Wasted memory and bandwidth

**Fix**: Restructured queries to fetch phases first, extract phase IDs, then filter phase_tasks:

```typescript
// Before (WRONG - no WHERE clause):
supabase.from("phase_tasks").select("*");

// After (CORRECT - filtered by phase_id):
const { data: phases } = await supabase
  .from("phases")
  .select("*")
  .in("project_id", projectIds);

const phaseIds = (phases || []).map((p) => p.id);

// Then fetch only relevant phase_tasks
phaseIds.length > 0
  ? supabase.from("phase_tasks").select("*").in("phase_id", phaseIds)
  : Promise.resolve({ data: [] });
```

**Files Changed**: `/apps/worker/src/workers/brief/briefGenerator.ts:426-463`

### Bug #3: Deleted Tasks Appearing in Briefs

**Root Cause**: Tasks use soft deletion (`deleted_at` timestamp), but the query only checked `outdated = false` without filtering out deleted tasks.

**Impact**: Users saw deleted tasks in daily brief emails, causing confusion about what work was actually pending.

**Fix**: Added `.is("deleted_at", null)` filter to task query.

**Files Changed**: `/apps/worker/src/workers/brief/briefGenerator.ts:443`

### Code Cleanup: Removed Dead Email Code

Removed 200+ lines of disabled legacy email code (wrapped in `if (false && shouldEmailBrief)`) that was replaced by the notification system. Removed unused import for `DailyBriefEmailSender`.

**Files Changed**: `/apps/worker/src/workers/brief/briefWorker.ts:13-14, 121-127`

**Manual Verification Steps**:

1. **Test Bug #1 Fix (Task Counts)**:
   - Create a project with several tasks (today's tasks, overdue, upcoming)
   - Generate a daily brief
   - Check notification event payload - task counts should be accurate
   - Verify email/SMS show correct task counts

2. **Test Bug #2 Fix (Performance)**:
   - Check database logs/metrics during brief generation
   - Verify phase_tasks query includes `WHERE phase_id IN (...)` clause
   - Confirm only relevant phase_tasks are fetched

3. **Test Bug #3 Fix (Deleted Tasks)**:
   - Create tasks and generate a brief
   - Delete some tasks
   - Generate a new brief
   - Verify deleted tasks don't appear

**Related Documentation**:

- Daily Briefs Feature: `/apps/worker/docs/features/daily-briefs/README.md`
- Brief Generator: `/apps/worker/src/workers/brief/briefGenerator.ts`
- Brief Worker: `/apps/worker/src/workers/brief/briefWorker.ts`
- Database Schema: `/packages/shared-types/src/database.schema.ts`
- Worker Architecture: `/apps/worker/CLAUDE.md`

**Date Fixed**: 2025-10-20
**Fixed By**: Claude Code
**Severity**: High (Bug #1 - critical UX issue, Bug #2 - performance/security, Bug #3 - data accuracy)
**Status**: ✅ Fixed

---

## 2025-10-20: Fixed Deleted Tasks Appearing in Daily Briefs

**⚠️ NOTE: This entry is superseded by the comprehensive fix above. Kept for historical reference.**

**Issue**: Daily briefs were including tasks that had been deleted by users, causing confusion and displaying outdated information in the generated briefs.

**Root Cause**: The task query in the worker's daily brief generation (`getUserProjectsWithData()` function) was only filtering by `outdated = false` but was not checking for soft-deleted tasks. Tasks use soft deletion (setting `deleted_at` to a timestamp), but the query was missing the `.is("deleted_at", null)` clause to exclude deleted tasks.

**Impact**: Users received daily brief emails showing deleted tasks, which caused confusion and made the briefs less useful and accurate.

**Fix**: Added `.is("deleted_at", null)` filter to the task query to properly exclude soft-deleted tasks from daily brief generation.

**Files Changed**:

- `/apps/worker/src/workers/brief/briefGenerator.ts:439` - Added `deleted_at` null check to task query

**Code Change**:

```typescript
supabase
  .from("tasks")
  .select("*")
  .in("project_id", projectIds)
  .eq("outdated", false)
  .is("deleted_at", null) // Added this line to filter out deleted tasks
  .order("updated_at", { ascending: false });
```

**Manual Verification Steps**:

1. Create a project with several tasks
2. Generate a daily brief and verify the tasks appear correctly
3. Delete one or more tasks from the project
4. Generate a new daily brief (either manually or wait for scheduled generation)
5. **Expected**: Deleted tasks should NOT appear in the brief

**Related Documentation**:

- Daily Briefs Feature: `/apps/worker/docs/features/daily-briefs/README.md`
- Brief Generator: `/apps/worker/src/workers/brief/briefGenerator.ts`
- Database Schema: `/packages/shared-types/src/database.schema.ts` (tasks table, line 1053: deleted_at field)
- Worker Architecture: `/apps/worker/CLAUDE.md`

**Date Fixed**: 2025-10-20
**Fixed By**: Claude Code
**Severity**: Medium (affects data accuracy in daily briefs)
**Status**: ✅ Fixed

---

## 2025-10-20: Fixed Stale Brain Dump Text Loading After Successful Completion

**Issue**: After completing a brain dump successfully and closing the modal, reopening the modal would load the previous brain dump text instead of starting with a clean slate.

**Root Cause**: When a brain dump was successfully saved, the draft record in the database was not being reliably cleaned up. While the backend attempted to update the draft status to 'saved' (which should exclude it from draft queries), this update could fail silently due to RLS policies, race conditions, or missing brainDumpId references. When the modal reopened, `loadInitialData()` would fetch and load the old draft because it still had status 'pending' or 'parsed' in the database.

**Impact**: Users saw stale brain dump text when reopening the modal after successful completion, causing confusion about whether the previous brain dump was actually saved.

**Fix**: Added explicit draft cleanup after successful brain dump save to ensure old drafts don't reload:

**Files Changed**:

- `apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte` (lines 1220-1228 - added `deleteDraft()` call after successful save)

**Code Change**:

```javascript
// After successful save, explicitly delete the draft
if (currentBrainDumpId) {
  try {
    await brainDumpService.deleteDraft(currentBrainDumpId);
    console.log("[BrainDumpModal] Draft cleaned up after successful save");
  } catch (deleteError) {
    console.warn(
      "[BrainDumpModal] Failed to delete draft after save:",
      deleteError,
    );
    // Non-fatal - backend should have marked it as 'saved' anyway
  }
}
```

**Manual Verification Steps**:

1. Open brain dump modal
2. Enter text for a project
3. Process the brain dump (parse and apply operations)
4. Verify success view is shown
5. Close the modal
6. Reopen the brain dump modal for the same project
7. **Expected**: Text area should be empty (no old text loaded)

**Related Documentation**:

- Brain Dump Feature: `/apps/web/docs/features/brain-dump/README.md`
- Brain Dump API Service: `/apps/web/src/lib/services/braindump-api.service.ts`
- Draft Endpoint: `/apps/web/src/routes/api/braindumps/draft/+server.ts`

**Date Fixed**: 2025-10-20
**Fixed By**: Claude Code
**Severity**: Medium (affects UX but no data loss)
**Status**: ✅ Fixed

---

## 2025-10-17: Fixed Brain Dump State Persistence on Page Reload/Dismiss

**Issue**: Brain dump processing gets into a "weird state" when page reloads or stops during processing. Dismissing the notification doesn't fully clear the state, causing orphaned jobs to persist across page reloads and prevent new brain dumps from starting properly.

**Root Cause**: The brain dump system uses three independent persistence layers that don't coordinate during cleanup:

1. **Background Service** - stores jobs in `sessionStorage['active-brain-dump-jobs']`
2. **Brain Dump Store** - stores state in `sessionStorage['brain-dump-unified-state']`
3. **Notification Store** - stores notifications in `sessionStorage['buildos_notifications_v2']`

When a notification is dismissed, it only cleared layers 2 & 3 but left orphaned jobs in layer 1. On page reload, these orphaned jobs were restored, creating a state mismatch.

**Impact**: Users couldn't fully reset brain dump processing by closing the notification. Orphaned state persisted across page reloads, causing confusion and blocking new brain dumps from starting.

**Fix**: Added cross-layer cleanup coordination:

1. **Background Service** (`braindump-background.service.ts:579-617`):
   - Added `clearJob(jobId)` - clear specific job by ID
   - Added `clearJobsForBrainDump(brainDumpId)` - clear all jobs for a brain dump

2. **Notification Bridge** (`brain-dump-notification.bridge.ts:57-88`):
   - Updated `dismiss` action to call `backgroundBrainDumpService.clearJobsForBrainDump()`
   - Added emergency reset function `forceResetAllBrainDumpState()` exposed as `window.__resetAllBrainDumps()`

3. **Brain Dump Store** (`brain-dump-v2.store.ts:914-970`):
   - Updated `completeBrainDump()` to clear background jobs
   - Updated `cancelBrainDump()` to clear background jobs

**Files Changed**:

- `apps/web/src/lib/services/braindump-background.service.ts` (lines 579-617 - added 2 cleanup methods)
- `apps/web/src/lib/services/brain-dump-notification.bridge.ts` (lines 1-16, 57-88, 940-996 - import, dismiss action, emergency reset)
- `apps/web/src/lib/stores/brain-dump-v2.store.ts` (lines 1-16, 914-970 - import, completeBrainDump, cancelBrainDump)

**Manual Verification Steps**:

1. Start a brain dump processing
2. Reload the page during processing
3. Close the brain dump notification by clicking the dismiss button
4. Open browser DevTools console
5. Check `sessionStorage['active-brain-dump-jobs']` - should be empty or not contain the dismissed brain dump
6. Check `sessionStorage['brain-dump-unified-state']` - should not have orphaned state
7. Start a new brain dump - should work normally without conflicts

**Emergency Recovery**: If the system gets stuck, run in browser console:

```javascript
window.__resetAllBrainDumps();
```

**Related Documentation**:

- Brain Dump Feature: `/apps/web/docs/features/brain-dump/README.md`
- Multi-Layer State Architecture: See "Technical Details" section above
- Notification System: `/NOTIFICATION_SYSTEM_DOCS_MAP.md`

**Date Fixed**: 2025-10-17
**Fixed By**: Claude Code
**Severity**: High (affects core functionality, no data loss but poor UX)
**Status**: ✅ Fixed

---
