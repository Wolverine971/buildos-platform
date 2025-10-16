# Bugfix Changelog

This document tracks significant bug fixes across the BuildOS platform. Entries are listed in reverse chronological order (most recent first).

---

## 2025-10-16: Fixed SMS Event Reminder Timing Context Bug

**Issue**: Scheduled SMS event reminders displayed incorrect timing information (e.g., "Webinar in 10 hrs" when the message was sent 30 minutes before the event).

**Root Cause**: The LLM message generator calculated "time until event" from the current time (midnight, when the daily SMS job runs) instead of from the actual message send time (e.g., 9:30 AM for a 10:00 AM event with 30-minute lead time).

**Impact**: All scheduled SMS event reminders had misleading timing context, potentially confusing users about when their events actually start relative to receiving the notification.

**Fix**: Updated `smsMessageGenerator.ts` to calculate the send time (`event.startTime - leadTimeMinutes`) and use that as the reference point for the "time until event" calculation.

**Files Changed**:

- `apps/worker/src/lib/services/smsMessageGenerator.ts` (lines 10, 72-80)

**Example**:

- Event: 10:00 AM
- Lead time: 30 minutes
- Send time: 9:30 AM
- **Before**: Message said "Webinar in 10 hrs" (calculated from midnight)
- **After**: Message says "Webinar in 30 mins" (calculated from send time)

**Related Documentation**:

- SMS Event Scheduling: `/thoughts/shared/research/2025-10-13_04-55-45_daily-sms-scheduling-flow-investigation.md`
- Worker Service: `/apps/worker/CLAUDE.md`

**Date Fixed**: 2025-10-16
**Fixed By**: Claude Code
**Severity**: Medium (misleading user experience, but non-critical)
**Status**: ✅ Fixed

---

## Template for Future Entries

```markdown
## YYYY-MM-DD: [Brief Title]

**Issue**: [What was the bug?]

**Root Cause**: [Why did it happen?]

**Impact**: [Who/what was affected?]

**Fix**: [What was changed?]

**Files Changed**:

- `path/to/file.ts` (lines X-Y)
- `path/to/another.ts` (lines A-B)

**Related Documentation**:

- [Link to relevant docs]

**Date Fixed**: YYYY-MM-DD
**Fixed By**: [Developer name]
**Severity**: [Critical/High/Medium/Low]
**Status**: ✅ Fixed / 🔄 In Progress / ⚠️ Partially Fixed
```
