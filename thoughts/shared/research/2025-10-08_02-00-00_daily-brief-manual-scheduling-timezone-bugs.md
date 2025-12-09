---
date: 2025-10-08T02:00:00-07:00
researcher: Claude (Sonnet 4.5)
git_commit: d2b0decf96ed0c0e03dbf9ea92b57b6ddd3abb47
branch: main
repository: buildos-platform
topic: 'Daily Brief Manual Scheduling - Timezone Bug Investigation'
tags: [research, daily-briefs, timezone, bugs, manual-scheduling]
status: complete
last_updated: 2025-10-08
last_updated_by: Claude (Sonnet 4.5)
path: thoughts/shared/research/2025-10-08_02-00-00_daily-brief-manual-scheduling-timezone-bugs.md
---

# Research: Daily Brief Manual Scheduling - Timezone Bug Investigation

**Date**: 2025-10-08T02:00:00-07:00
**Researcher**: Claude (Sonnet 4.5)
**Git Commit**: `d2b0decf96ed0c0e03dbf9ea92b57b6ddd3abb47`
**Branch**: `main`
**Repository**: buildos-platform

## Research Question

When manually scheduling a daily brief, are dates being calculated correctly in the user's timezone?

## Summary

**Critical Bug Found**: The web app manual scheduling endpoint (`/api/daily-briefs/generate`) calculates the target date using **UTC time** instead of the **user's timezone**, causing date mismatches when users trigger briefs near midnight in their local timezone.

**Secondary Issue**: The worker API endpoint has a minor timezone resolution inconsistency that could lead to brief date calculation using the wrong timezone in edge cases.

## Detailed Findings

### 1. Critical Bug: Web App Endpoint Uses UTC Instead of User Timezone

**File**: `/apps/web/src/routes/api/daily-briefs/generate/+server.ts`
**Location**: Line 26

**Current Code**:

```typescript
const targetDate = briefDate || new Date().toISOString().split('T')[0];
```

**Problem**:

- This calculates the date in **UTC time**, not the user's timezone
- When a user in PST (UTC-8) manually schedules a brief at **11:00 PM PST**, the code sees it as **7:00 AM UTC the next day**
- Result: User gets tomorrow's brief instead of today's brief

**Impact**:

- Users near midnight in negative UTC offset timezones (PST, MST, EST, etc.) will get the wrong brief date
- Brief will contain tasks for the wrong day
- User will be confused why their "today's brief" shows tomorrow's content

**Example Scenario**:

```
User timezone: America/Los_Angeles (PST, UTC-8)
User local time: 2025-10-08 11:00 PM PST
UTC time: 2025-10-09 07:00 AM UTC

Current behavior:
  targetDate = "2025-10-09" (WRONG - should be 2025-10-08)

Expected behavior:
  Convert to user's timezone first
  targetDate = "2025-10-08" (CORRECT)
```

**Recommended Fix**:

```typescript
// Import timezone utilities
import { getCurrentDateInTimezone } from '$lib/utils/timezone';

// Get user's timezone from preferences
const { data: preferences } = await supabase
	.from('user_brief_preferences')
	.select('timezone')
	.eq('user_id', userId)
	.single();

const userTimezone = preferences?.timezone || 'UTC';

// Calculate target date in user's timezone
const targetDate = briefDate || getCurrentDateInTimezone(userTimezone);
```

---

### 2. Secondary Issue: Worker API Timezone Resolution Inconsistency

**File**: `/apps/worker/src/index.ts`
**Location**: Lines 126-131 vs Line 152

**Problem**:
When calculating `targetBriefDate` for force regenerate, the timezone resolution order is inconsistent:

**Line 126-131** (force regenerate date calculation):

```typescript
const targetBriefDate =
	requestedBriefDate ||
	format(utcToZonedTime(new Date(), requestedTimezone || 'UTC'), 'yyyy-MM-dd');
```

Uses: `requestedTimezone || "UTC"`

**Line 152** (final timezone resolution):

```typescript
const timezone = requestedTimezone || preferences?.timezone || 'UTC';
```

Uses: `requestedTimezone || preferences?.timezone || "UTC"`

**Impact**:

- If `requestedTimezone` is NOT provided, the force regenerate calculation uses `"UTC"` while the actual job uses `preferences?.timezone`
- This could cause a date mismatch if user preferences have a non-UTC timezone
- Edge case: User in timezone ahead of UTC might cancel the wrong date's brief

**Example Scenario**:

```
User timezone preference: "Asia/Tokyo" (UTC+9)
requestedTimezone: undefined (not provided)
Current UTC time: 2025-10-08 18:00 UTC

Force regenerate calculation:
  Uses: "UTC"
  targetBriefDate = "2025-10-08"

Actual job timezone:
  Uses: preferences.timezone = "Asia/Tokyo"
  briefDate = "2025-10-09" (because 18:00 UTC = 03:00+9 next day)

Result: Cancels brief for 2025-10-08, but creates brief for 2025-10-09
```

**Recommended Fix**:

```typescript
// Fetch user preferences BEFORE force regenerate calculation
const { data: preferences } = await supabase
	.from('user_brief_preferences')
	.select('timezone')
	.eq('user_id', userId)
	.single();

const timezone = requestedTimezone || preferences?.timezone || 'UTC';

// Use consistent timezone for both calculations
if (forceRegenerate) {
	const targetBriefDate =
		requestedBriefDate ||
		format(
			utcToZonedTime(new Date(), timezone), // Use resolved timezone
			'yyyy-MM-dd'
		);

	// ... rest of cancellation logic
}
```

---

### 3. Known Issue: Timezone Validation Missing

**Reference**: `/thoughts/shared/research/2025-09-27_22-11-17_daily-brief-system-analysis.md`

**Problem**:

- No validation for invalid timezone strings before passing to `date-fns-tz`
- Invalid timezones crash the system with `date-fns-tz` errors
- No fallback mechanism for malformed timezone data

**Impact**:

- System crashes if database contains invalid timezone strings
- User-provided timezones could break scheduling

**Mitigation**:
The worker does have validation in `briefWorker.ts` lines 21-29:

```typescript
function isValidTimezone(timezone: string): boolean {
	try {
		getTimezoneOffset(timezone, new Date());
		return true;
	} catch (error) {
		return false;
	}
}
```

**Recommended**:

- Add this validation to ALL endpoints that accept timezone parameters
- Add validation to the web app endpoint before using timezone

---

### 4. Proper Timezone Handling in Automatic Scheduling

**File**: `/apps/worker/src/scheduler.ts`
**Location**: Lines 448-471 (`calculateDailyRunTime`)

**Good Pattern Found**:

```typescript
function calculateDailyRunTime(
	now: Date,
	hours: number,
	minutes: number,
	seconds: number,
	timezone: string
): Date {
	// Step 1: Convert current UTC time to user's timezone
	const nowInUserTz = utcToZonedTime(now, timezone);

	// Step 2: Set target time in user's timezone
	let targetInUserTz = setHours(nowInUserTz, hours);
	targetInUserTz = setMinutes(targetInUserTz, minutes);
	targetInUserTz = setSeconds(targetInUserTz, seconds);
	targetInUserTz.setMilliseconds(0);

	// Step 3: Handle day rollover if time has passed
	if (isBefore(targetInUserTz, nowInUserTz)) {
		targetInUserTz = addDays(targetInUserTz, 1);
	}

	// Step 4: Convert back to UTC for storage
	return zonedTimeToUtc(targetInUserTz, timezone);
}
```

**Why This Works**:

1. Always converts to user timezone first
2. Performs all date/time calculations in user's local time
3. Converts back to UTC for storage
4. No date boundary issues

**This pattern should be applied to manual scheduling endpoints.**

---

## Code References

### Critical Bug

- `/apps/web/src/routes/api/daily-briefs/generate/+server.ts:26` - Uses UTC instead of user timezone

### Secondary Issue

- `/apps/worker/src/index.ts:126-131` - Inconsistent timezone resolution (force regenerate)
- `/apps/worker/src/index.ts:152` - Correct timezone resolution (main flow)

### Good Patterns

- `/apps/worker/src/scheduler.ts:448-471` - Correct timezone handling pattern
- `/apps/worker/src/workers/brief/briefWorker.ts:21-29` - Timezone validation
- `/apps/worker/src/scheduler.ts:52-55` - Correct brief date calculation

### Utility Functions

- `/apps/web/src/lib/utils/timezone.ts:45-60` - `getCurrentDateInTimezone()` helper
- `/apps/web/src/lib/utils/date-utils.ts:515-520` - `getTodayInUserTimezone()` helper

---

## Architecture Insights

### Timezone Handling Pattern (Correct)

The system follows this pattern for timezone-aware operations:

```
UTC → User Timezone → Calculate → UTC
```

1. **Input**: Always stored in UTC (`TIMESTAMPTZ`)
2. **Process**: Convert to user timezone using `utcToZonedTime()`
3. **Calculate**: Perform date/time logic in user's local time
4. **Output**: Convert back to UTC using `zonedTimeToUtc()`
5. **Store**: Save as UTC in database

### Brief Date Storage Convention

**Important**: `brief_date` is stored as `YYYY-MM-DD` in the **user's timezone**, not UTC.

**From**: `/thoughts/shared/research/2025-10-05_21-31-45_daily-brief-notification-system-research.md`

> **IMPORTANT NOTE**: `brief_date` is "Always in user's timezone (not UTC!)"

This means:

- A user in Tokyo (UTC+9) gets a brief for "2025-10-09"
- A user in LA (UTC-8) gets a brief for "2025-10-08"
- Even though both briefs are generated at the same UTC moment

### Default Timezone Inconsistencies

Different preference tables have different default timezones:

| Table                           | Default Timezone        | Set By        |
| ------------------------------- | ----------------------- | ------------- |
| `user_brief_preferences`        | `'UTC'`                 | API endpoint  |
| `user_calendar_preferences`     | `'America/New_York'`    | API endpoint  |
| `user_sms_preferences`          | `'America/Los_Angeles'` | SQL migration |
| `user_notification_preferences` | `'UTC'`                 | SQL migration |

**Recommendation**: Standardize default timezone across all preference tables, or always detect from browser on first use.

---

## Testing Recommendations

### Test Case 1: Midnight Edge Case (PST)

```typescript
// User in PST at 11:59 PM
const userTimezone = 'America/Los_Angeles';
const userLocalTime = '2025-10-08T23:59:00-07:00'; // 11:59 PM PST
const utcTime = '2025-10-09T06:59:00Z'; // Next day UTC

// Expected: briefDate should be "2025-10-08" (user's today)
// Bug: Currently returns "2025-10-09" (user's tomorrow)
```

### Test Case 2: Timezone Ahead of UTC (Tokyo)

```typescript
// User in Tokyo at 2:00 AM
const userTimezone = 'Asia/Tokyo';
const userLocalTime = '2025-10-09T02:00:00+09:00'; // 2 AM JST
const utcTime = '2025-10-08T17:00:00Z'; // Previous day UTC

// Expected: briefDate should be "2025-10-09" (user's today)
// Bug: Currently returns "2025-10-08" (user's yesterday)
```

### Test Case 3: No Timezone Preference

```typescript
// User has no timezone preference set
const userPreferences = { timezone: null };
const requestedTimezone = undefined;

// Expected: Should default to UTC
// Secondary Bug: force regenerate might use different default
```

---

## Related Research

- `/thoughts/shared/research/2025-10-08_00-36-37_daily-brief-worker-scheduling-patterns.md` - Timezone-aware scheduling patterns
- `/thoughts/shared/research/2025-10-05_21-31-45_daily-brief-notification-system-research.md` - Brief date storage convention
- `/thoughts/shared/research/2025-09-27_22-11-17_daily-brief-system-analysis.md` - Known timezone validation bug

---

## Recommended Fixes

### Priority 1: Fix Web App Endpoint (Critical)

**File**: `/apps/web/src/routes/api/daily-briefs/generate/+server.ts`

```typescript
// Add at top of file
import { getCurrentDateInTimezone } from '$lib/utils/timezone';

// In POST handler, replace line 26
export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const body = await parseRequestBody(request);
	const { briefDate, forceRegenerate = false, streaming = false, background = false } = body;
	const userId = user.id;

	// NEW: Fetch user timezone
	const { data: preferences } = await supabase
		.from('user_brief_preferences')
		.select('timezone')
		.eq('user_id', userId)
		.single();

	const userTimezone = preferences?.timezone || 'UTC';

	// NEW: Calculate target date in user's timezone
	const targetDate = briefDate || getCurrentDateInTimezone(userTimezone);

	// ... rest of handler
};
```

### Priority 2: Fix Worker API Consistency (Medium)

**File**: `/apps/worker/src/index.ts`

```typescript
app.post('/queue/brief', async (req, res) => {
	// ... validation code ...

	// MOVED: Get user's timezone preference EARLIER
	const { data: preferences } = await supabase
		.from('user_brief_preferences')
		.select('timezone')
		.eq('user_id', userId)
		.single();

	// CONSISTENT: Use same timezone resolution everywhere
	const timezone = requestedTimezone || preferences?.timezone || 'UTC';

	// NOW: Use resolved timezone for force regenerate
	if (forceRegenerate) {
		const targetBriefDate =
			requestedBriefDate ||
			format(
				utcToZonedTime(new Date(), timezone), // Use resolved timezone
				'yyyy-MM-dd'
			);

		// ... cancellation logic ...
	}

	// ... rest of endpoint ...
});
```

### Priority 3: Add Timezone Validation (Low)

**File**: `/apps/web/src/routes/api/daily-briefs/generate/+server.ts`

```typescript
// Add validation function
function isValidTimezone(timezone: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: timezone });
		return true;
	} catch {
		return false;
	}
}

// Use in handler
const userTimezone = preferences?.timezone || 'UTC';
if (!isValidTimezone(userTimezone)) {
	console.warn(`Invalid timezone "${userTimezone}" for user ${userId}, falling back to UTC`);
	userTimezone = 'UTC';
}
```

---

## Open Questions

1. **Should we standardize default timezones across all preference tables?**
    - Currently: UTC, America/New_York, America/Los_Angeles
    - Recommendation: Always detect from browser, fallback to UTC

2. **Should we prompt users to set timezone during onboarding?**
    - Currently: No timezone selection in onboarding flow
    - Browser detection happens silently on first use

3. **How should we handle timezone changes for scheduled briefs?**
    - If user changes timezone, should we reschedule pending jobs?
    - Currently: Preference API cancels pending jobs on update

4. **Should brief_date always be in user timezone?**
    - Current: Yes, by convention
    - Pro: Intuitive for users
    - Con: Makes querying by date more complex

---

## Summary Table: Timezone Bugs

| Bug                                      | Severity     | File                                                       | Line         | Impact                           | Fix Priority |
| ---------------------------------------- | ------------ | ---------------------------------------------------------- | ------------ | -------------------------------- | ------------ |
| Web endpoint uses UTC for date           | **Critical** | `apps/web/src/routes/api/daily-briefs/generate/+server.ts` | 26           | Wrong brief date near midnight   | **P1**       |
| Worker timezone resolution inconsistency | Medium       | `apps/worker/src/index.ts`                                 | 126-131, 152 | Edge case: wrong date cancelled  | **P2**       |
| Missing timezone validation              | Low          | Multiple files                                             | N/A          | System crash on invalid timezone | **P3**       |
| Inconsistent default timezones           | Low          | Multiple tables                                            | N/A          | Confusing user experience        | **P4**       |

---

## Conclusion

The BuildOS daily brief system has **one critical timezone bug** in manual scheduling that causes users to get the wrong brief date when triggering near midnight in their local timezone. The fix is straightforward: fetch the user's timezone preference and use it to calculate the target date instead of using UTC.

The automatic scheduling system (cron-based) properly handles timezones and can serve as a reference implementation for the manual scheduling endpoints.

**Next Steps**:

1. Apply the recommended fix to `/apps/web/src/routes/api/daily-briefs/generate/+server.ts`
2. Add timezone validation to all user-facing timezone inputs
3. Add test cases for midnight edge cases in different timezones
4. Consider standardizing default timezones across preference tables
