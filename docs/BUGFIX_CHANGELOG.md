# Bugfix Changelog

This document tracks all bugs fixed in the BuildOS platform, organized chronologically with the most recent fixes first.

## Format

Each entry includes:

- **Date**: When the fix was implemented
- **Bug ID/Title**: Short description
- **Severity**: Critical, High, Medium, or Low
- **Root Cause**: What caused the bug
- **Fix Description**: How it was fixed
- **Files Changed**: List of modified/added files
- **Related Docs**: Links to relevant documentation
- **Cross-references**: Links to related specs, code, or issues

---

## 2025-10-22 - Layout & Header Inconsistency: History & Time-Blocks Pages

**Severity**: LOW

### Root Cause

The `/history` and `/time-blocks` pages used different CSS utility classes for both container width/padding AND page header styling compared to the standard patterns used by the `/` and `/projects` pages. This occurred because:

1. Pages were likely implemented by different developers at different times
2. No documented standard layout or typography pattern existed
3. Standards evolved but older pages weren't updated

**Layout Issues:**

**Standard Container Pattern** (from `/` and `/projects`):

- Container: `max-w-7xl` (1280px width)
- Horizontal padding: `px-3 sm:px-4 md:px-6 lg:px-8`
- Vertical padding: `py-4 sm:py-6 md:py-8`

**Deviations Found**:

- `/history`: Used `max-w-6xl` (1152px), missing responsive padding breakpoints
- `/time-blocks`: Used `max-w-5xl` (1024px), different padding structure entirely

**Header Issues:**

**Standard Header Pattern** (from `/projects`):

- Size: `text-2xl sm:text-3xl` (responsive sizing)
- Weight: `font-bold`
- Colors: `text-gray-900 dark:text-white`
- Spacing: `mb-1 sm:mb-2 tracking-tight`

**Deviations Found**:

- `/history`: Used `text-3xl` (no responsive sizing, always large)
- `/time-blocks`: Used `text-xl sm:text-2xl font-semibold` (too small, wrong weight, used slate colors instead of gray)

**Impact**: Users experienced visual jarring when navigating between pages due to different page widths, inconsistent spacing, and varying header sizes. Inconsistent UX made the app feel less polished and unprofessional.

### Fix Description

Updated both pages to use the standard layout and header patterns:

**Container Layout Fixes:**

**`/history` page** (`apps/web/src/routes/history/+page.svelte:452`):

- Changed container from `max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8`
- To: `max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8`

**`/time-blocks` page** (`apps/web/src/routes/time-blocks/+page.svelte:170`):

- Changed container from `max-w-5xl flex-col gap-4 px-3 py-6 sm:px-4 sm:py-8 lg:gap-5 lg:px-6`
- To: `max-w-7xl flex-col gap-4 px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8 lg:gap-5`

**Header Typography Fixes:**

**`/history` page** (`apps/web/src/routes/history/+page.svelte:457`):

- Changed `<h1>` from `text-3xl font-bold text-gray-900 dark:text-white flex items-center`
- To: `text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center mb-1 sm:mb-2 tracking-tight`
- Also updated subtitle from `text-gray-600 dark:text-gray-400 mt-2` to `text-sm sm:text-base text-gray-600 dark:text-gray-400` (responsive sizing)

**`/time-blocks` page** (`apps/web/src/routes/time-blocks/+page.svelte:173-178`):

- Changed `<h1>` from `text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 sm:text-2xl`
- To: `text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 sm:mb-2 tracking-tight`
- Updated subtitle from `text-sm text-slate-600 dark:text-slate-300 sm:text-base` to `text-sm sm:text-base text-gray-600 dark:text-gray-400` (standardized colors)

All other CSS classes preserved. Layout and typography now match main page and projects page exactly.

### Files Changed

**Modified** (2 files):

1. `/apps/web/src/routes/history/+page.svelte` - Container (line 452), header (line 457), and subtitle (line 461) updated
2. `/apps/web/src/routes/time-blocks/+page.svelte` - Container (line 170), header (line 173), and subtitle (line 178) updated

**Total Changes**: 6 lines modified (3 per file)

### Testing

**Manual Verification Steps**:

**Layout Consistency:**

1. Navigate to `/` (main page) - observe page width and padding
2. Navigate to `/projects` - verify width/padding matches main page
3. Navigate to `/history` - verify width/padding now matches (should be wider than before)
4. Navigate to `/time-blocks` - verify width/padding now matches (should be wider than before)
5. Test on different screen sizes (mobile, tablet, desktop) to verify responsive padding
6. Verify no layout shift or content overflow on any page

**Header Typography Consistency:** 7. Compare header sizes across all pages:

- On mobile (< 640px): All headers should be `text-2xl`
- On larger screens (≥ 640px): All headers should be `text-3xl`

8. Verify all headers use `font-bold` (not `font-semibold`)
9. Check header spacing is consistent (`mb-1 sm:mb-2 tracking-tight`)
10. Verify subtitle text is responsive (`text-sm sm:text-base`)

**Expected Result**: All four pages should have consistent width (1280px max), identical responsive padding, and uniform header typography across all breakpoints, creating a cohesive and professional user experience.

### Related Documentation

- **Web App Structure**: `/apps/web/CLAUDE.md`
- **Component Standards**: `/apps/web/docs/technical/components/`
- **Design System**: Future documentation should define standard layout patterns

### Cross-References

- **Main Page**: `/apps/web/src/routes/+page.svelte:620` - Standard layout reference
- **Projects Page**: `/apps/web/src/routes/projects/+page.svelte:620` - Standard layout reference
- **History Page**: `/apps/web/src/routes/history/+page.svelte:452` - Fixed container
- **Time-Blocks Page**: `/apps/web/src/routes/time-blocks/+page.svelte:170` - Fixed container

### Recommendations

1. **Document Standard Layout**: Create a design system doc defining standard page container patterns
2. **Component Library**: Consider creating a reusable `PageContainer` component to enforce consistency
3. **Linting**: Add ESLint/Stylelint rules to detect non-standard layout patterns
4. **Code Review**: Include layout consistency checks in PR review process

---

## 2025-10-22 - SMS Retry Job Validation Failure & Database Schema Mismatch

**Severity**: HIGH

### Root Cause

Two separate but related bugs causing SMS job failures in the worker:

1. **Incomplete Retry Metadata**: When Twilio webhook received a failed SMS status and attempted to retry, it created a queue job with incomplete metadata. The retry job only included `message_id` and retry tracking fields, but `validateSMSJobData()` requires `message_id`, `phone_number`, `message`, and `user_id`. This caused immediate validation failure: `Invalid SMS job data: user_id is required and must be string`.

2. **Database Schema Mismatch**: The `fail_queue_job()` database function attempted to set `failed_at = NOW()` in the `queue_jobs` table, but this column doesn't exist in the schema. The table only has `completed_at`, `started_at`, and `processed_at`. This caused a secondary error: `column "failed_at" of relation "queue_jobs" does not exist`.

**Why This Happens**: When a retry job fails validation in the worker, it triggers the error handling flow which calls `fail_queue_job()`, exposing both bugs sequentially.

**Impact**: SMS retries failed immediately upon validation, and error handling also failed due to schema mismatch. This prevented automatic recovery from transient SMS failures.

### Fix Description

**Bug #1 Fix - Complete Retry Metadata**:

- Added database query to fetch full SMS message data before creating retry job
- Query retrieves: `id`, `user_id`, `phone_number`, `message_content`, `priority`
- Retry job metadata now includes all required fields that `validateSMSJobData()` expects
- Also includes `scheduled_sms_id` if the message is linked to a scheduled SMS

**Bug #2 Fix - Database Function**:

- Created migration `20251022_fix_fail_queue_job_column.sql`
- Replaced `fail_queue_job()` function to use `completed_at` instead of `failed_at`
- Failed jobs now correctly mark completion time using existing schema
- Maintains backward compatibility with retry logic and exponential backoff

### Files Changed

**Modified** (1 file):

1. `/apps/web/src/routes/api/webhooks/twilio/status/+server.ts:306-358` - Added SMS data fetch before retry, fixed metadata structure

**Created** (1 file):

1. `/apps/web/supabase/migrations/20251022_fix_fail_queue_job_column.sql` - Fixed database function to use correct column

**Total Changes**: ~55 lines modified/added

### Testing

**Manual Verification Steps**:

1. Trigger an SMS failure via Twilio webhook (simulate carrier error)
2. Verify retry job is queued with complete metadata (`message_id`, `phone_number`, `message`, `user_id`)
3. Verify the job processes without validation errors in worker logs
4. Check that failed jobs are marked correctly in `queue_jobs` table (status='failed', `completed_at` set)
5. Verify exponential backoff retry logic still works correctly
6. Confirm no database errors in worker logs

### Related Documentation

- **Worker Architecture**: `/apps/worker/CLAUDE.md`
- **SMS Worker**: `/apps/worker/src/workers/smsWorker.ts`
- **Queue Validation**: `/apps/worker/src/workers/shared/queueUtils.ts:191-244`
- **Twilio Integration**: `/packages/twilio-service/docs/implementation/`
- **Queue System Flow**: `/docs/architecture/diagrams/QUEUE-SYSTEM-FLOW.md`

### Cross-References

- **Worker Service**: `/apps/worker/` (Node.js + Express + BullMQ)
- **Web App Webhook**: `/apps/web/src/routes/api/webhooks/twilio/status/+server.ts`
- **Database Schema**: `/packages/shared-types/src/database.schema.ts`
- **SMS Job Data Interface**: `/apps/worker/src/workers/shared/queueUtils.ts:58-65`
- **Database Migration**: `/apps/web/supabase/migrations/20251022_fix_fail_queue_job_column.sql`

---

## 2025-10-21 - Modal Click-Outside & Notification Null Error

**Severity**: MEDIUM

### Root Cause

Two related issues in modal components:

1. **Null Error**: Event handlers in `NotificationModal.svelte` and `CalendarAnalysisModalContent.svelte` attempted to access `notification.id` without null checks. During component lifecycle (unmounting or when notification removed from store), the `notification` prop could become null before event handlers were cleaned up, causing `Cannot read properties of null (reading 'id')` errors.

2. **Click-Outside Behavior**: Multiple modal components explicitly set `closeOnBackdrop={false}`, preventing users from closing modals by clicking outside them, which was inconsistent with user expectations.

### Fix Description

**Null Error Fix**:

- Added null checks to `handleMinimize()` and `handleDismiss()` functions
- Added console warnings for debugging when handlers are called without valid notification
- Pattern: `if (!notification?.id) { console.warn(...); return; }`

**Click-Outside Fix**:

- Changed `closeOnBackdrop={false}` to `closeOnBackdrop={true}` in 7 modal components
- Changed `persistent={!showCancelButton}` to `persistent={false}` in ProcessingModal
- Changed `closeOnEscape={showCancelButton}` to `closeOnEscape={true}` in ProcessingModal
- All modals now close when clicking outside or pressing Escape

### Files Changed

**Modified** (8 files):

1. `/apps/web/src/lib/components/notifications/NotificationModal.svelte:107-112` - Added null check in `handleMinimize()`
2. `/apps/web/src/lib/components/notifications/types/calendar-analysis/CalendarAnalysisModalContent.svelte:22-27,46,90` - Added null check + click-outside (2 modals)
3. `/apps/web/src/lib/components/calendar/CalendarTaskEditModal.svelte:136` - Enabled click-outside
4. `/apps/web/src/lib/components/calendar/CalendarAnalysisResults.svelte:1166-1167` - Enabled click-outside and escape
5. `/apps/web/src/lib/components/notifications/types/brain-dump/BrainDumpModalContent.svelte:602` - Enabled click-outside
6. `/apps/web/src/lib/components/brain-dump/ProcessingModal.svelte:181-183` - Enabled click-outside, escape, removed persistent
7. `/apps/web/src/lib/components/project/TaskMoveConfirmationModal.svelte:131` - Enabled click-outside
8. `/docs/BUGFIX_CHANGELOG.md` - This file

**Total Changes**: ~20 lines modified

### Testing

**Manual Verification Steps**:

1. ✅ Notification modals no longer throw console errors when minimize button is clicked
2. ✅ CalendarAnalysisModalContent closes when clicking outside (both processing and results states)
3. ✅ CalendarTaskEditModal closes when clicking outside
4. ✅ CalendarAnalysisResults closes when clicking outside
5. ✅ BrainDumpModalContent (notification) closes when clicking outside
6. ✅ ProcessingModal closes when clicking outside
7. ✅ TaskMoveConfirmationModal closes when clicking outside
8. ✅ All modals close when pressing Escape

### Related Documentation

- **Notification System**: `/apps/web/src/lib/components/notifications/README.md`
- **Modal Component**: `/apps/web/src/lib/components/ui/Modal.svelte`
- **Web App CLAUDE.md**: `/apps/web/CLAUDE.md`

### Cross-References

**Code**:

- Notification store: `/apps/web/src/lib/stores/notification.store.ts`
- Modal base component: `/apps/web/src/lib/components/ui/Modal.svelte:15-60` (click-outside logic)
- NotificationModal: `/apps/web/src/lib/components/notifications/NotificationModal.svelte:107-112`

**Design Pattern**:

All modals now follow consistent behavior:

- `closeOnBackdrop={true}` (default) - Close on outside click
- `closeOnEscape={true}` (default) - Close on Escape key
- `persistent={false}` (default) - Allow closing via backdrop/escape

---

## 2025-10-21 - LLM Prompt Injection Vulnerability

**Severity**: HIGH

**Related Security Audit**: `/thoughts/shared/research/2025-10-21_00-00-00_input-validation-security-audit.md` (Finding #4)

### Root Cause

User input was directly interpolated into LLM prompts without sanitization, creating a vulnerability where malicious users could inject prompt manipulation commands (e.g., "SYSTEM: Ignore all previous instructions") to bypass security controls or manipulate AI behavior.

**Vulnerable Pattern**:

```typescript
// BEFORE (Vulnerable):
const prompt = `Analyze this braindump:\n\n${brainDump}`; // Direct interpolation
```

**Attack Surface**:

- Brain dump processing (`/api/braindumps/stream/+server.ts`)
- Email generation (admin feature: `/api/admin/emails/generate/+server.ts`)

### Fix Description

Implemented a **two-stage prompt injection detection system**:

**Stage 1: Regex Pattern Detection**

- Fast regex scanning for suspicious patterns (system overrides, instruction manipulation, prompt extraction, delimiter abuse)
- Categorized by severity: High, Medium, Low
- Context-aware to avoid false positives (e.g., "brain dump" is legitimate)

**Stage 2: LLM-Powered Validation**

- For high-severity patterns OR multiple medium-severity patterns, validate with an LLM security analyzer
- Uses secure prompt structure with clear boundaries between system instructions and user data
- LLM determines if content is malicious or benign despite trigger words

**Additional Protections**:

- Rate limiting: 3 flagged attempts per hour triggers temporary block
- Comprehensive logging to `security_logs` table for review
- Admin dashboard at `/admin/security` to review flagged attempts
- Hybrid failure mode: Block on high-severity if LLM validation fails, allow on low-severity

### Implementation Details

**Decision Points** (All resolved):

1. **LLM Validation Failure**: Hybrid approach - block high-severity, allow low-severity
2. **Severity Threshold**: Call LLM for high severity OR multiple medium severity
3. **User Feedback**: Minimal ("could not be processed") to not educate attackers
4. **Rate Limiting**: 3 attempts in 1 hour
5. **Database Schema**: New dedicated `security_logs` table

**System Architecture**:

```
User Input → Regex Scan → [Match?]
                              ↓ Yes
                    [High or Multiple Medium?]
                              ↓ Yes
                       LLM Validation
                              ↓
                    [Malicious?] → Block + Log
                              ↓ No
                       Allow + Log (False Positive)
```

### Files Changed

**Created** (9 files):

1. `/apps/web/supabase/migrations/20251021_create_security_logs.sql` - Database schema
2. `/apps/web/src/lib/utils/prompt-injection-detector.ts` - Core detection system (~350 lines)
3. `/apps/web/src/lib/utils/__tests__/prompt-injection-detector.test.ts` - Unit tests (~430 lines)
4. `/apps/web/src/lib/utils/__tests__/brain-dump-integration-security.test.ts` - Integration tests (~230 lines)
5. `/apps/web/src/routes/admin/security/+page.svelte` - Admin dashboard (~380 lines)
6. `/apps/web/src/routes/admin/security/+page.server.ts` - Server load function
7. `/apps/web/src/routes/api/admin/security/logs/+server.ts` - API endpoint for logs
8. `/docs/SECURITY.md` - Security documentation
9. `/docs/BUGFIX_CHANGELOG.md` - This file

**Modified** (2 files):

1. `/apps/web/src/lib/utils/braindump-processor.ts` - Added security checks before LLM processing (~100 lines added)
2. `/apps/web/src/routes/api/braindumps/stream/+server.ts` - Enhanced error handling (~20 lines modified)

**Total Code**: ~1,600 lines added

### Testing

**Unit Tests**:

- 25+ test cases covering high/medium/low severity patterns
- False positive prevention (legitimate use of "system", "role", etc.)
- Edge cases (empty content, very long content, multiple patterns)
- LLM validation parsing and failure modes

**Integration Tests**:

- End-to-end brain dump security flow
- Rate limiting enforcement
- Security logging verification
- Hybrid failure mode testing

**Manual Verification Steps**:

1. ✅ Legitimate brain dumps pass through without issues
2. ✅ Obvious injection attempts ("SYSTEM: Ignore instructions") are blocked
3. ✅ Edge cases (legitimate "system" in technical context) are allowed
4. ✅ LLM validation correctly identifies context
5. ✅ Rate limiting blocks after 3 flagged attempts
6. ✅ Admin dashboard displays all security logs
7. ✅ False positives are logged for review

### Performance Impact

- **Negligible cost increase**: ~$0.0001 per LLM validation (gpt-4o-mini)
- **Minimal latency**: Regex check is <1ms, LLM validation ~500ms (only for suspicious content)
- **Expected volume**: If 1% of brain dumps trigger patterns, ~1 validation/day for 100 dumps/day
- **Monthly cost**: ~$0.003 with gpt-4o-mini, ~$0.0003 with deepseek-chat

### Related Documentation

- **Security Audit**: `/thoughts/shared/research/2025-10-21_00-00-00_input-validation-security-audit.md`
- **Security Documentation**: `/docs/SECURITY.md`
- **Brain Dump Docs**: `/apps/web/docs/features/brain-dump/README.md`
- **Prompt Templates**: `/apps/web/docs/prompts/brain-dump/**/*.md`

### Cross-References

**Code**:

- `PromptInjectionDetector` class: `/apps/web/src/lib/utils/prompt-injection-detector.ts`
- Brain dump processor integration: `/apps/web/src/lib/utils/braindump-processor.ts:379-475`
- Admin security dashboard: `/apps/web/src/routes/admin/security/+page.svelte`

**Database**:

- `security_logs` table: See migration file for schema
- Indexes: `user_id`, `event_type`, `created_at`, `was_blocked`
- RLS policies: Admin-only read access

**API Endpoints**:

- Security logs API: `/api/admin/security/logs/+server.ts`
- Brain dump stream: `/api/braindumps/stream/+server.ts`

### Future Improvements

Potential enhancements to consider:

1. Machine learning model for pattern detection (reduce LLM validation costs)
2. User reputation system (trusted users skip validation)
3. Automated pattern tuning based on false positive rate
4. Integration with external threat intelligence
5. Real-time alerting for high-severity incidents

---

Last updated: 2025-10-21
