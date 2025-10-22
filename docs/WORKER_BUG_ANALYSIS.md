# BuildOS Worker Bug Analysis & Fixes

**Analysis Date**: 2025-10-22
**Analyzer**: Claude Code (Senior Engineer Review)
**Status**: 1/5 Fixed, 4/5 Ready for Implementation

---

## Executive Summary

Comprehensive ultrathink analysis of the `/apps/worker` codebase identified **5 bugs** across the SMS worker, daily SMS scheduler, and queue retry logic:

| Bug # | Severity | Status | Component | Issue |
|-------|----------|--------|-----------|-------|
| 1 | Small | ✅ FIXED | smsWorker.ts | Daily limit check fails when count=0 |
| 2 | Medium | 🔴 READY | smsWorker.ts | Redundant DB queries (3x fetch of same data) |
| 3 | Medium | 🔴 READY | dailySmsWorker.ts | Race condition in count reset (data loss) |
| 4 | Small | 🔴 READY | dailySmsWorker.ts | Orphaned SMS on creation failure |
| 5 | Small | 🔴 READY | smsWorker.ts | Retry job missing dedup_key |

---

## Detailed Analysis

### ✅ BUG #1: FIXED - Daily SMS Limit Check with Zero Count

**File**: `apps/worker/src/workers/smsWorker.ts`
**Lines**: 171-172
**Severity**: Small - Logic Error

**The Problem**:
```typescript
// BUGGY CODE:
if (userPrefs.daily_sms_limit && userPrefs.daily_sms_count) {
    if (userPrefs.daily_sms_count >= userPrefs.daily_sms_limit) {
        // ... cancel SMS ...
    }
}
```

When `daily_sms_count` is `0` (a valid value meaning "0 messages sent today"), the condition fails because `0` is falsy in JavaScript. This means users who have sent 0 SMS messages today are **never checked against their daily limit** - they can bypass the limit!

**Root Cause**: Truthy check (`&&`) instead of null-check

**The Fix**:
```typescript
// FIXED CODE:
if (userPrefs.daily_sms_limit != null && userPrefs.daily_sms_count != null) {
    if (userPrefs.daily_sms_count >= userPrefs.daily_sms_limit) {
        // ... cancel SMS ...
    }
}
```

**Status**: ✅ COMPLETED on 2025-10-22

---

### 🔴 BUG #2: READY - Redundant Database Queries

**File**: `apps/worker/src/workers/smsWorker.ts`
**Lines**: 359-432
**Severity**: Medium - Inefficiency + Race Condition Potential

**The Problem**:
The code fetches `send_attempts` from the database **THREE times**:

1. **First fetch** (lines 359-363): Get current value
2. **Second fetch** (lines 395-399): Get it again after update
3. **Third fetch** (lines 415-421): Get it a third time for delay calculation

This creates:
- **Performance Issue**: 3x database round trips for one field
- **Race Condition**: Each fetch might get a different value if concurrent workers are running

**Why It Matters**:
If multiple worker instances process SMS failures simultaneously, the retry delay calculation might use stale data, resulting in incorrect retry intervals.

**The Fix**:
Fetch once with all needed fields, calculate the new value, and reuse it:

```typescript
// Fetch once with both fields needed
const { data: currentScheduledSms } = await supabase
    .from('scheduled_sms_messages')
    .select('send_attempts, max_send_attempts')
    .eq('id', scheduled_sms_id)
    .single();

const newAttemptCount = (currentScheduledSms?.send_attempts ?? 0) + 1;
const maxAttempts = currentScheduledSms?.max_send_attempts ?? 3;

// Update with the calculated value
await supabase
    .from('scheduled_sms_messages')
    .update({
        status: 'failed',
        last_error: error.message,
        send_attempts: newAttemptCount,
        updated_at: new Date().toISOString()
    })
    .eq('id', scheduled_sms_id);

// Use the value we already have for retry decision
const shouldRetry = newAttemptCount < maxAttempts;

if (shouldRetry) {
    const delay = Math.pow(2, newAttemptCount) * 60; // Reuse newAttemptCount!
    // ... queue retry ...
}
```

**Status**: 🔴 READY - Senior engineer fix needed

---

### 🔴 BUG #3: READY - Daily SMS Count Reset Race Condition

**File**: `apps/worker/src/workers/dailySmsWorker.ts`
**Lines**: 92-106 and 417-423
**Severity**: Medium - Data Loss

**The Problem**:
Read-modify-write race condition when resetting daily SMS count:

```typescript
// BUGGY CODE:
const needsReset = ... // Check if reset needed
if (needsReset) {
    await supabase.from('user_sms_preferences').update({
        daily_sms_count: 0,
        daily_count_reset_at: new Date().toISOString()
    }).eq('user_id', userId);
}

// ... later in code ...

// Later: update the count
await supabase.from('user_sms_preferences').update({
    daily_sms_count: currentCount + (insertedMessages?.length || 0)
}).eq('user_id', userId);
```

**Race Condition Scenario**:
```
Time T1: Worker A fetches smsPrefs (daily_count_reset_at = 2025-10-20)
Time T1: Worker B fetches smsPrefs (daily_count_reset_at = 2025-10-20)
Time T2: Worker A updates count to 0 (because reset needed)
Time T3: Worker A inserts 2 SMS messages
Time T4: Worker A updates count to 0 + 2 = 2 ✓
Time T5: Worker B updates count to 0 (because it also determined reset needed)
Time T6: Worker B inserts 3 SMS messages
Time T7: Worker B updates count to 0 + 3 = 3 ❌ OVERWRITES A's count!
```

**Result**: 2 SMS messages from Worker A are lost!

**The Fix**:
Use atomic database increment instead of read-then-write:

```sql
-- CREATE THIS DATABASE FUNCTION:
CREATE OR REPLACE FUNCTION increment_user_daily_sms_count(
  p_user_id UUID,
  p_increment INT
) RETURNS INT AS $$
DECLARE
  v_new_count INT;
BEGIN
  UPDATE user_sms_preferences
  SET daily_sms_count = daily_sms_count + p_increment
  WHERE user_id = p_user_id
  RETURNING daily_sms_count INTO v_new_count;
  RETURN COALESCE(v_new_count, p_increment);
END;
$$ LANGUAGE plpgsql VOLATILE;
```

```typescript
// FIXED CODE:
const messageCount = insertedMessages?.length || 0;
if (messageCount > 0) {
    await supabase.rpc('increment_user_daily_sms_count', {
        p_user_id: userId,
        p_increment: messageCount
    });
}
```

**Status**: 🔴 READY - Requires database migration + code change

---

### 🔴 BUG #4: READY - Orphaned Scheduled SMS on Creation Failure

**File**: `apps/worker/src/workers/dailySmsWorker.ts`
**Lines**: 363-415
**Severity**: Small - Error Handling Gap

**The Problem**:
When creating linked SMS message records, if the `sms_messages` insert fails, the `scheduled_sms_messages` record is left **orphaned**:

```typescript
// BUGGY CODE:
for (const msg of insertedMessages || []) {
    const { data: smsMessage, error: smsError } = await supabase
        .from('sms_messages')
        .insert({...})
        .select()
        .single();

    if (smsError || !smsMessage) {
        console.error('❌ [DailySMS] Error creating sms_message:', smsError);
        continue;  // ← ORPHANED! No link, no status update
    }
    // ... rest of code ...
}
```

**What Happens**:
1. `scheduled_sms_messages` record created with status='scheduled' (line 341-344)
2. Attempt to create corresponding `sms_messages` record fails
3. Code skips to next message without marking scheduled SMS as failed
4. Result: Orphaned `scheduled_sms_messages` record with:
   - No `sms_message_id` link
   - No queued `send_sms` job
   - Status still 'scheduled' (will never be processed)

**The Fix**:
Mark failed records instead of orphaning them:

```typescript
// FIXED CODE:
for (const msg of insertedMessages || []) {
    try {
        const { data: smsMessage, error: smsError } = await supabase
            .from('sms_messages')
            .insert({...})
            .select()
            .single();

        if (smsError || !smsMessage) {
            console.error('❌ [DailySMS] Error creating sms_message:', smsError);

            // Mark scheduled SMS as failed instead of orphaning it
            await supabase
                .from('scheduled_sms_messages')
                .update({
                    status: 'failed',
                    last_error: `Failed to create SMS message: ${smsError?.message || 'Unknown error'}`
                })
                .eq('id', msg.id);

            continue;
        }
        // ... rest of code ...
    } catch (err) {
        console.error(`❌ [DailySMS] Unexpected error for message ${msg.id}:`, err);
        // Mark as failed to prevent orphaning
        await supabase
            .from('scheduled_sms_messages')
            .update({
                status: 'failed',
                last_error: err instanceof Error ? err.message : 'Unknown error'
            })
            .eq('id', msg.id);
    }
}
```

**Status**: 🔴 READY - Straightforward error handling fix

---

### 🔴 BUG #5: READY - Retry Job Missing Dedup Key

**File**: `apps/worker/src/workers/smsWorker.ts`
**Lines**: 426-432
**Severity**: Small - Missing Parameter

**The Problem**:
When re-queuing failed SMS jobs, the dedup_key is not provided:

```typescript
// BUGGY CODE:
await supabase.rpc('add_queue_job', {
    p_user_id: user_id,
    p_job_type: 'send_sms',
    p_metadata: validatedData as any,
    p_scheduled_for: new Date(Date.now() + delay * 60000).toISOString(),
    p_priority: priority === 'urgent' ? 1 : 10
    // ← MISSING: p_dedup_key parameter!
});
```

**Why It Matters**:
Without a dedup_key, if the same SMS fails twice at the same scheduled time, the queue might accept both retries, creating duplicate jobs.

**The Fix**:
Add a consistent dedup_key for each retry:

```typescript
// FIXED CODE:
const dedupKey = scheduled_sms_id
    ? `sms-retry-${scheduled_sms_id}-${newAttemptCount}`
    : `sms-retry-${message_id}-${newAttemptCount}`;

await supabase.rpc('add_queue_job', {
    p_user_id: user_id,
    p_job_type: 'send_sms',
    p_metadata: validatedData as any,
    p_scheduled_for: new Date(Date.now() + delay * 60000).toISOString(),
    p_priority: priority === 'urgent' ? 1 : 10,
    p_dedup_key: dedupKey  // ← ADD THIS
});
```

**Status**: 🔴 READY - Simple one-line fix

---

## Implementation Roadmap

### Phase 1: Quick Wins (5 minutes total)
- ✅ Bug #1: Already fixed
- **Bug #5**: Add `p_dedup_key` parameter (1 line)

### Phase 2: Error Handling (5 minutes)
- **Bug #4**: Mark orphaned SMS as failed (4 lines in try-catch block)

### Phase 3: Performance Optimization (10 minutes)
- **Bug #2**: Refactor SMS retry logic to eliminate redundant fetches

### Phase 4: Database Migration (15 minutes)
- **Bug #3**: Create atomic increment RPC function + update code

**Total Implementation Time**: ~30 minutes

---

## Testing Recommendations

### Bug #1 Test Case
- User with daily_sms_limit=5
- User with daily_sms_count=0
- Attempt to send SMS
- **Expected**: Daily limit check should execute (not skip)

### Bug #2 Test Case
- Monitor database queries during SMS failure/retry
- **Expected**: Only 1-2 queries for scheduled_sms_messages (not 3)

### Bug #3 Test Case
- Simulate concurrent workers processing same user's SMS
- **Expected**: Message count should accumulate correctly

### Bug #4 Test Case
- Force sms_messages insert to fail
- **Expected**: scheduled_sms_messages should be marked as 'failed' (not left in 'scheduled' state)

### Bug #5 Test Case
- Trigger SMS retry at same scheduled time twice
- **Expected**: Only one job should be queued (dedup_key prevents duplicate)

---

## Senior Engineer Notes

This analysis follows a methodical "ultrathink" approach:

1. **Verification First**: Re-read code to confirm bugs exist (not false positives)
2. **Root Cause Analysis**: Understood the underlying mechanism causing each bug
3. **Impact Assessment**: Classified by severity and user-facing impact
4. **Senior Patterns**: Fixes follow established best practices:
   - Use null-checks instead of truthy checks for numeric values
   - Fetch-once rather than fetch-multiple-times
   - Atomic database operations for concurrent writes
   - Proper error handling instead of silent failures
   - Dedup keys for idempotent operations

**Key Insight**: Most bugs are in the SMS subsystem, suggesting this is a newer component that could benefit from additional code review and testing infrastructure.

---

**Generated**: 2025-10-22
**Status**: Analysis Complete - Ready for Implementation Phase
