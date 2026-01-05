<!-- docs/architecture/decisions/ADR-001-user-level-notification-preferences.md -->

# ADR-001: User-Level Notification Preferences with event_type='user'

**Date**: 2025-10-13
**Status**: Accepted
**Context**: Daily Brief Notification Refactor
**Related Documents**:

- `/thoughts/shared/research/2025-10-13_06-00-00_daily-brief-notification-refactor-plan.md`
- Migration: `/supabase/migrations/20251013_refactor_daily_brief_notification_prefs.sql`

**Update (2026-02-05):** `user_notification_preferences` is now one row per user (no `event_type` column), and explicit opt-in is enforced. This ADR remains as historical context for the 2025-10-13 refactor.

## Context

During the daily brief notification refactor, we needed to separate:

1. **Brief generation timing** (when briefs are created)
2. **Notification delivery preferences** (how users are notified)

The `user_notification_preferences` table was originally designed for event-based notifications with a composite primary key of `(user_id, event_type)`. We needed to add user-level preferences for daily brief delivery (email/SMS) that apply globally rather than per-event.

### Problem Statement

How should we store user-level notification preferences in a table designed for event-based notifications?

### Original Table Design

```sql
CREATE TABLE user_notification_preferences (
  user_id UUID REFERENCES users(id),
  event_type TEXT NOT NULL,
  email_enabled BOOLEAN,
  sms_enabled BOOLEAN,
  push_enabled BOOLEAN,
  in_app_enabled BOOLEAN,
  -- ... other fields
  PRIMARY KEY (user_id, event_type)
);
```

Event types like `'brief.completed'`, `'task.due'`, etc. control how specific events notify users.

### New Requirements

Add columns for user-level daily brief delivery:

- `should_email_daily_brief` - Global toggle for receiving daily brief emails
- `should_sms_daily_brief` - Global toggle for receiving daily brief SMS

These are **not** event-specific - they apply to all daily briefs regardless of which events trigger them.

## Decision

**Use `event_type='user'` for user-level notification preferences.**

User-level daily brief preferences will be stored as a special row with `event_type='user'`, distinct from event-specific preferences.

### Implementation

```sql
-- User-level preferences (ONE row per user)
INSERT INTO user_notification_preferences (
  user_id,
  event_type,
  should_email_daily_brief,
  should_sms_daily_brief
) VALUES (
  'user-123',
  'user',  -- Special event_type for user-level prefs
  true,
  false
);

-- Event-specific preferences (multiple rows per user)
INSERT INTO user_notification_preferences (
  user_id,
  event_type,
  push_enabled,
  in_app_enabled
) VALUES (
  'user-123',
  'brief.completed',  -- Event-specific preferences
  true,
  true
);
```

### Query Pattern

All code querying user-level preferences MUST filter by `event_type='user'`:

```typescript
// ✅ CORRECT - Filters by event_type
const { data: notificationPrefs } = await supabase
	.from('user_notification_preferences')
	.select('should_email_daily_brief, should_sms_daily_brief')
	.eq('user_id', userId)
	.eq('event_type', 'user') // REQUIRED
	.single();

// ❌ INCORRECT - Missing filter, .single() will fail with multiple rows
const { data: notificationPrefs } = await supabase
	.from('user_notification_preferences')
	.select('should_email_daily_brief, should_sms_daily_brief')
	.eq('user_id', userId)
	.single(); // Error: multiple rows returned
```

## Alternatives Considered

### Alternative 1: Create Separate `user_daily_brief_preferences` Table

**Approach**: New table specifically for user-level daily brief preferences.

**Pros**:

- Clear separation of concerns
- No special event_type value needed
- Simpler queries (no event_type filter required)

**Cons**:

- Another table to manage
- Fragments notification preferences across multiple tables
- Harder to query "all notification preferences for a user"
- More complex for future user-level preferences

**Rejected**: Would fragment notification system, making it harder to manage and query comprehensively.

### Alternative 2: Use `event_type=NULL` for User-Level Preferences

**Approach**: Use NULL event_type to indicate user-level preferences.

**Pros**:

- Semantically indicates "no specific event"
- Don't need to reserve a special string value

**Cons**:

- NULL values can be confusing and error-prone
- Harder to query (need `IS NULL` checks)
- Can't enforce NOT NULL constraint on event_type
- NULLs have different sorting/filtering behavior

**Rejected**: NULL values add complexity and reduce clarity.

### Alternative 3: Overload Existing Event Types

**Approach**: Use existing event types like `'brief.completed'` for user-level preferences.

**Pros**:

- No schema changes needed
- Reuse existing columns

**Cons**:

- Conflates user-level and event-specific preferences
- Cannot distinguish "I want email for briefs" from "I want email notifications when events happen"
- Led to duplicate UI controls and user confusion
- Same row trying to serve two different purposes

**Rejected**: This was the original design that caused the problems we're fixing.

### Alternative 4: Add `is_user_level` Boolean Column

**Approach**: Add a boolean flag to distinguish user-level from event-specific rows.

**Pros**:

- Explicit distinction
- Can still use event_type for categorization

**Cons**:

- Additional column needed
- Two-column composite key becomes more complex
- Queries need to check both event_type AND is_user_level
- More complex validation logic

**Rejected**: Adds unnecessary complexity when `event_type='user'` achieves the same goal.

## Consequences

### Positive

1. **Single Source of Truth**: All notification preferences in one table
2. **Clear Separation**: User-level (`event_type='user'`) vs event-specific preferences
3. **Composite Key Works**: Primary key `(user_id, event_type)` naturally enforces one user-level row per user
4. **Future-Proof**: Can add more user-level preference columns without schema changes
5. **Queryable**: Easy to fetch all preferences for a user with single query
6. **Type-Safe**: `event_type` remains NOT NULL with clear semantic meaning

### Negative

1. **Query Requirement**: All code must remember to filter by `event_type='user'` (forgot this in initial implementation)
2. **Special Value**: `'user'` is a reserved event_type value that must be documented
3. **Potential Confusion**: Developers might forget the event_type filter (mitigated by code reviews)

### Mitigation Strategies

1. **Code Documentation**: All queries must include comments explaining the event_type filter
2. **Helper Functions**: Create service methods that encapsulate the correct query pattern
3. **Testing**: Include tests that verify event_type filtering works correctly
4. **Code Review**: Check for missing event_type filters in all preference queries

### Breaking Changes

None. Migration adds new columns and preserves old data for rollback.

### Migration Path

1. Add new columns with defaults
2. Migrate existing `email_daily_brief` data to new columns
3. Mark old column as deprecated
4. Update all code to use new columns with event_type filter
5. (Future) Drop old column after validation period

## Lessons Learned

### Post-Implementation Bug Fixes

Three worker files initially omitted the `.eq("event_type", "user")` filter, causing `.single()` to fail when users had multiple preference rows. This was caught during implementation review and fixed:

- `/apps/worker/src/workers/brief/briefWorker.ts:102`
- `/apps/worker/src/workers/brief/emailWorker.ts:95`
- `/apps/worker/src/lib/services/email-sender.ts:127`

**Lesson**: When using composite keys with special values, create helper functions to ensure correct query patterns are used consistently.

### UI Confusion

Initial implementation showed duplicate email/SMS toggles because the UI treated event-specific and user-level preferences as separate concerns without clear labels. Fixed by:

1. Renaming sections clearly ("Daily Brief Notifications" vs "Additional Notification Channels")
2. Removing duplicate toggles from event-specific section
3. Only showing user-level toggles in the daily brief section

**Lesson**: When adding new preference types, review all UI locations where preferences are displayed to avoid duplication.

## Related Decisions

- **ADR-002** (future): SMS notification channel design and phone verification requirements
- **ADR-003** (future): Event-based notification system architecture

## References

- Migration: `/supabase/migrations/20251013_refactor_daily_brief_notification_prefs.sql`
- Research: `/thoughts/shared/research/2025-10-13_06-00-00_daily-brief-notification-refactor-plan.md`
- Worker Implementation: `/apps/worker/src/workers/brief/briefWorker.ts`
- Web API: `/apps/web/src/routes/api/notification-preferences/+server.ts`
- UI Component: `/apps/web/src/lib/components/settings/NotificationPreferences.svelte`

## Decision Authority

- **Proposed By**: Claude Code (AI Agent)
- **Reviewed By**: User (Anna Wayne)
- **Decision Date**: 2025-10-13
- **Implementation Date**: 2025-10-13
- **Status**: Accepted and Implemented

---

**Last Updated**: 2025-10-13
**ADR Status**: Accepted ✅
**Implementation Status**: Completed with post-implementation bug fixes ✅
