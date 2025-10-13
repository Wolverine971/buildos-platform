# Bugfix Changelog

This document tracks all bugs fixed in the BuildOS platform, including root causes, solutions, and cross-references to related documentation and code.

**Purpose**: To maintain a historical record of bugs and their fixes, enabling future developers and AI agents to understand past issues and avoid similar problems.

**Format**: Each entry includes the date, bug description, root cause, fix details, affected files, and links to related documentation.

**Ordering**: Most recent fixes first (reverse chronological).

---

## How to Add an Entry

When fixing a bug, add a new entry at the TOP of this file using this template:

```markdown
### [YYYY-MM-DD] Bug: [Short Description]

**Status**: Fixed
**Severity**: [Small / Medium / Large]
**Affected Component**: [Feature/Component Name]

**Symptoms**:

- [Observable symptom 1]
- [Observable symptom 2]

**Root Cause**:
[Clear explanation of what was actually wrong and why it happened]

**Fix Applied**:
[Description of the solution implemented]

**Files Changed**:

- `path/to/file1.ts:line` - [what was changed]
- `path/to/file2.ts:line` - [what was changed]

**Manual Verification**:

1. [Step to verify fix works]
2. [Edge case to test]

**Related Documentation**:

- [Link to feature doc if updated]
- [Link to architecture doc if relevant]
- [Link to related bugfixes]

**Cross-references**:

- [Any related specs, ADRs, or design docs]

**Confidence**: [High/Medium/Low - how confident we are this is the complete fix]

**Fixed By**: [Claude / Human name]

---
```

## Bugfixes

<!-- Add new bugfix entries below this line, MOST RECENT FIRST -->

### Example: [2025-10-13] Bug: Notification preferences not being respected for daily SMS

**Status**: Fixed
**Severity**: Medium
**Affected Component**: Notification System (Worker)

**Symptoms**:

- Users receiving SMS notifications even when they've disabled them
- Notification preferences table shows correct settings but they're not applied
- Only affects daily brief SMS, email notifications work correctly

**Root Cause**:
The SMS adapter in the worker service was checking `user.notification_enabled` instead of the more specific `user_notification_preferences.sms_enabled` field. This meant the global notification toggle was being checked, but not the SMS-specific preference.

**Fix Applied**:
Updated `/apps/worker/src/workers/notification/smsAdapter.ts` to:

1. Query `user_notification_preferences` table for SMS-specific settings
2. Check both `notification_enabled` AND `sms_enabled` before sending
3. Added preference checking logic to `shouldSendSMS()` function

**Files Changed**:

- `apps/worker/src/workers/notification/smsAdapter.ts:45-67` - Added SMS preference checking
- `apps/worker/src/workers/notification/preferenceChecker.ts:1-89` - Created new preference checker utility
- `packages/shared-types/src/database.schema.ts:1031` - Verified `user_notification_preferences` schema

**Manual Verification**:

1. Disable SMS notifications for a test user in the preferences UI
2. Trigger a daily brief job for that user
3. Verify no SMS is sent (check Twilio logs)
4. Re-enable SMS notifications
5. Trigger another daily brief
6. Verify SMS is sent

**Related Documentation**:

- `/apps/worker/docs/features/notifications/README.md` - Updated with preference checking flow
- `/apps/web/docs/features/notifications/README.md` - Added cross-reference to worker implementation
- `/docs/BUGFIX_CHANGELOG.md` - This entry

**Cross-references**:

- Research: `/thoughts/shared/research/2025-10-13_04-55-45_overlapping-notification-preferences-analysis.md`
- Feature spec: `/apps/web/docs/features/notifications/NOTIFICATION_PREFERENCES_SPEC.md`

**Confidence**: High - Fix directly addresses the root cause and covers all SMS sending paths

**Fixed By**: Claude

---

<!-- Add additional bugfix entries below, maintaining reverse chronological order -->
