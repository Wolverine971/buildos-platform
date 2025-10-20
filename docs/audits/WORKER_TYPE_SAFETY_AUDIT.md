# Worker Type Safety Audit Report

## Executive Summary

This audit identified **15+ significant type safety issues** in the `/apps/worker` service that could lead to runtime errors, data corruption, and unpredictable behavior. The issues range from unsafe type assertions to missing null checks on database fields that are nullable according to the schema.

## Key Findings

### Critical Issues (Will cause runtime errors)

#### 1. Unsafe Type Assertion on `user.timezone`

**File**: `/apps/worker/src/workers/brief/briefWorker.ts` (line 52)
**Severity**: HIGH - Type casting bypasses null safety

```typescript
// Current (UNSAFE):
let timezone = (user as any)?.timezone || job.data.timezone || "UTC";

// Issue:
// - `timezone` field exists in `users` table (schema line 1293)
// - Type is `string` (non-nullable) but `user` might be null or partial
// - `(user as any)` bypasses type checking entirely
// - If user fetch failed, user is undefined and this accesses undefined.timezone
```

**Similar Issues**:

- `/apps/worker/src/workers/daily SmsWorker.ts` (line 71)
- `/apps/worker/src/scheduler.ts` (multiple locations)
- `/apps/worker/src/lib/utils/smsPreferenceChecks.ts` (line 84)

#### 2. Accessing `.metadata` Without Type Safety

**File**: `/apps/worker/src/workers/brief/briefWorker.ts` (lines 127-138)
**Severity**: HIGH - Metadata field is `Json | null` but treated as typed object

```typescript
// Current (UNSAFE):
const metadata = pb.metadata as any;
return sum + (metadata?.todays_task_count || 0);

// Issue:
// - Database schema: `project_daily_briefs.metadata: Json | null` (line 732)
// - Code casts to `any`, losing all type information
// - Accesses properties without validation: `metadata?.todays_task_count`
// - If metadata is null or missing this field, defaults to 0 (silent failure)
// - Multiple count fields accessed: todays_task_count, overdue_task_count, upcoming_task_count, etc.
```

**Occurrences**: Found in 3 different files across 20+ lines

#### 3. Unpacking Nested Relations Without Type Checks

**File**: `/apps/worker/src/workers/brief/emailWorker.ts` (line 52)
**Severity**: HIGH - Unsafe nested object access

```typescript
// Current:
.select("*, email_recipients(*)")
// Then later:
email.email_recipients?.length  // Line 70

// Issue:
// - Database type `email_recipients` is a nested array type
// - Schema shows `email_recipients` optional in relation
// - No validation that the select expansion succeeded
// - If fetch failed, could access undefined array
```

#### 4. Payload Field Access Without Existence Checks

**File**: `/apps/worker/src/workers/notification/emailAdapter.ts` (lines 191, 234, 258)
**Severity**: HIGH - Accessing `.data?.brief_id` which may not exist

```typescript
// Current (UNSAFE):
if (eventType === "brief.completed" && delivery.payload.data?.brief_id) {
  // Line 196: Directly accesses delivery.payload.data.brief_id
  .eq("id", delivery.payload.data.brief_id)  // Could be undefined!

  // Line 234:
  delivery.payload.data?.brief_date || new Date().toISOString()

  // Line 258:
  href="https://build-os.com/daily-briefs/${delivery.payload.data.brief_id}"
}

// Issue:
// - Checks `delivery.payload.data?.brief_id` exists before using it
// - BUT then accesses `delivery.payload.data.brief_id` directly without the ?. operator
// - If data exists but brief_id is undefined, query fails
// - Unsafe template string interpolation with possibly undefined value
```

#### 5. SMS Adapter Metadata Casting

**File**: `/apps/worker/src/workers/notification/smsAdapter.ts` (lines 220-234)
**Severity**: HIGH - Multiple `as any` casts on metadata

```typescript
// Current:
const metadata = pb.metadata as any;
return sum + (metadata?.todays_task_count || 0);

// Repeated 3 times in fetchFreshBriefCounts() without type safety
```

---

### High Priority Issues (Will cause silent failures or incorrect behavior)

#### 6. Missing Null Checks on Database Selection

**File**: `/apps/worker/src/workers/brief/briefGenerator.ts` (lines 78-84)
**Severity**: MEDIUM-HIGH - Assumes user exists but select was partial

```typescript
const { data: user } = await supabase
  .from("users")
  .select("timezone") // Only selecting timezone field
  .eq("user_id", userId)
  .single();

// Issue:
// - `select("timezone")` means other fields are undefined
// - Later: `user?.timezone || "UTC"` - but what if user is null entirely?
// - No error check on query result
// - Should validate user exists before accessing
```

#### 7. Template Data Access Without Type Validation

**File**: `/apps/worker/src/workers/brief/emailWorker.ts` (lines 73-76)
**Severity**: MEDIUM-HIGH - Casting template_data to any and accessing without checks

```typescript
// Current:
const templateData = email.template_data as Record<string, any> | null;
const briefId = templateData?.brief_id;

// Issue:
// - `template_data` is `Json | null` in schema (line 413)
// - If templateData is null, briefId is undefined
// - Later: Line 78-79 checks `if (!briefId || !userId)` - but too late, might be undefined
// - No validation that templateData has expected structure
```

#### 8. Assuming Optional Schema Fields Exist

**File**: `/apps/worker/src/workers/smsWorker.ts` (lines 86-90)
**Severity**: MEDIUM - Nested select assumes relation exists

```typescript
.select("*, user_sms_preferences!inner(*)")

// Issue:
// - Schema: `user_sms_preferences` is optional relation
// - `!inner` means INNER JOIN - if no preferences, query fails silently or returns null
// - Later code at lines 92-96 doesn't properly validate before accessing
```

#### 9. Undefined Payload Data Structure

**File**: `/apps/worker/src/workers/notification/emailAdapter.ts` (line 61-70)
**Severity**: MEDIUM - Template accesses payload fields without existence check

```typescript
// Current:
<title>${payload.title}</title>
<h1>${payload.title}</h1>
<div>${payload.body}</div>
<a href="${payload.action_url}">

// Issue:
// - No guarantee payload has `title`, `body`, or `action_url`
// - `action_url` is optional field but used in template string without fallback
// - If missing, generates `href="undefined"` links
// - formatEmailTemplate() has conditional checks for some fields but not title/body
```

#### 10. SMS Message Payload Field Access

**File**: `/apps/worker/src/workers/notification/smsAdapter.ts` (lines 134-150)
**Severity**: MEDIUM - Accessing optional fields with OR chains

```typescript
// Current:
vars.user_email = flatPayload.user_email || "unknown";
vars.todays_task_count = flatPayload.todays_task_count || 0;
vars.brief_date = flatPayload.brief_date || "today";

// Issue:
// - `flatPayload` is `any` type (line 117)
// - Multiple optional fields accessed, all with defaults
// - But no validation that payload structure matches expected types
// - `todays_task_count` should be number but no type check
```

---

### Medium Priority Issues (Code smell, potential bugs)

#### 11. Type-Unsafe Metadata in Daily Brief Generation

**File**: `/apps/worker/src/workers/brief/briefGenerator.ts` (lines 226-231)
**Severity**: MEDIUM - Multiple optional field accesses chained

```typescript
// Current:
(brief) => brief.metadata?.todays_task_count > 0,

// Then:
(sum, brief) => sum + (brief.metadata?.todays_task_count || 0),

// Issue:
// - First use: `brief.metadata?.todays_task_count > 0` - compares possibly undefined to 0
// - Type: Could be number | undefined | null
// - Should explicitly validate before numeric comparison
// - Repeats 5 times: todays, overdue, upcoming, next_seven_days, recently_completed
```

#### 12. Implicit `any` Type for Job Data

**File**: `/apps/worker/src/workers/smsWorker.ts` (line 57)
**Severity**: MEDIUM - Function accepts untyped job data

```typescript
export async function processSMSJob(job: LegacyJob<any>) {
  const { message_id, phone_number, message, priority, scheduled_sms_id } = job.data;

// Issue:
// - `any` type bypasses all type checking
// - Destructuring assumes fields exist but could fail at runtime
// - No validation that job.data has required fields
```

#### 13. Optional Preference Fields Without Null Checks

**File**: `/apps/worker/src/workers/brief/briefWorker.ts` (lines 100-110)
**Severity**: MEDIUM - Assumes optional fields exist when fetching

```typescript
.from("user_sms_preferences")
  .select("phone_number, phone_verified, opted_out")

// Later:
if (!smsPrefs?.phone_number) { ... }
if (!smsPrefs?.phone_verified) { ... }

// Issue:
// - Schema: all these are `boolean | null` or `string | null` (lines 1249-1272)
// - Code uses `!` negation which treats undefined same as false
// - Should explicitly check `=== null` or `!== true`
```

#### 14. Event Start Time Validation Insufficient

**File**: `/apps/worker/src/workers/dailySmsWorker.ts` (lines 195-199)
**Severity**: MEDIUM - String field checked for existence but not format

```typescript
if (!event.event_start) {
  continue;
}
if (!event.event_start.includes("T")) {
  // This suggests event_start should be ISO string
}

// Issue:
// - Schema: `event_start: string | null` (line 1026)
// - Should validate ISO 8601 format, not just check `includes("T")`
// - `event_start` could be invalid date string like "2025-99-99"
```

#### 15. JSON Field Type Casting Issues

**File**: `/apps/worker/src/lib/supabase.ts` (lines 77, 89, 94)
**Severity**: MEDIUM - Duplicate local type definitions conflict with shared types

```typescript
// Local definitions in worker:
export interface ProjectDailyBrief {
  metadata: any | null; // Line 77
}

// Actual database schema:
metadata: Json | null; // Line 732 in database.schema.ts

// Issue:
// - Using `any` instead of `Json` type from shared-types
// - Local types don't match database.schema.ts
// - Should import from @buildos/shared-types instead
```

---

## Database Schema vs Code Mismatches

### Fields Accessed Without Null Safety

| Field                                 | Schema Type         | Code Access Pattern                                    | File              | Line |
| ------------------------------------- | ------------------- | ------------------------------------------------------ | ----------------- | ---- |
| `users.timezone`                      | `string` (non-null) | `(user as any)?.timezone`                              | briefWorker.ts    | 52   |
| `project_daily_briefs.metadata`       | `Json \| null`      | `metadata.todays_task_count`                           | briefWorker.ts    | 127  |
| `emails.template_data`                | `Json \| null`      | `templateData?.brief_id`                               | emailWorker.ts    | 73   |
| `email_recipients.*`                  | Multiple fields     | `email.email_recipients?.length`                       | emailWorker.ts    | 70   |
| `user_sms_preferences.phone_verified` | `boolean \| null`   | `!smsPrefs?.phone_verified`                            | dailySmsWorker.ts | 93   |
| `task_calendar_events.event_start`    | `string \| null`    | `!event.event_start`                                   | dailySmsWorker.ts | 196  |
| `notification_deliveries.payload`     | `Json` (non-null)   | `delivery.payload.data?.brief_id`                      | emailAdapter.ts   | 191  |
| `daily_briefs.llm_analysis`           | `string \| null`    | `brief.llm_analysis \|\| brief.summary_content`        | emailAdapter.ts   | 213  |
| `user_notification_preferences`       | `boolean` fields    | `notificationPrefs?.should_email_daily_brief ?? false` | briefWorker.ts    | 100  |

---

## Type Imports and Recommendations

### Current Issues with Type Imports

1. **Duplicate Type Definitions**: `/apps/worker/src/lib/supabase.ts` defines local types instead of importing from `@buildos/shared-types`
   - Should import: `Database`, `NotificationDelivery`, etc.
   - Currently re-implementing schema manually

2. **Missing Type Exports from shared-types**:
   - `Json` type not consistently used
   - Need stronger `NotificationPayload` type (currently `Record<string, any>`)

### Recommended Fixes

```typescript
// ❌ BEFORE (Current unsafe pattern):
let timezone = (user as any)?.timezone || job.data.timezone || "UTC";
const metadata = pb.metadata as any;
const briefId = templateData?.brief_id;

// ✅ AFTER (Type-safe):
if (!user) throw new Error("User not found");
const timezone = user.timezone;

// Metadata typing:
interface ProjectBriefMetadata {
  todays_task_count?: number;
  overdue_task_count?: number;
  upcoming_task_count?: number;
  next_seven_days_task_count?: number;
  recently_completed_count?: number;
}
const metadata = pb.metadata as ProjectBriefMetadata | null;
if (!metadata?.todays_task_count) return 0;
```

---

## Summary of Issues by Severity

| Severity     | Count | Impact                              |
| ------------ | ----- | ----------------------------------- |
| **Critical** | 5     | Runtime crashes, data loss          |
| **High**     | 5     | Silent failures, incorrect behavior |
| **Medium**   | 5     | Code smell, potential bugs          |
| **Total**    | 15+   | Major type safety problems          |

## Recommendations

### Immediate (Week 1)

1. Remove all `as any` type assertions on database objects
2. Add explicit null checks after `select()` queries
3. Create proper TypeScript interfaces for `metadata` fields

### Short-term (Week 2-3)

1. Import `Database` type from `@buildos/shared-types`
2. Remove duplicate type definitions in supabase.ts
3. Add runtime validation for optional fields using type guards
4. Replace `(user as any)?.field` pattern with proper null checks

### Long-term

1. Enable TypeScript strict mode (`"strict": true` in tsconfig.json)
2. Add pre-commit hooks to check for `as any` patterns
3. Implement unit tests for null/undefined field handling
4. Create shared error handling patterns for Supabase queries
