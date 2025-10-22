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
