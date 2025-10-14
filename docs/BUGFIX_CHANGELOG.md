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

### [2025-10-14] Bug: Svelte 5 runes mode syntax error in admin feature flags page

**Status**: Fixed
**Severity**: Small
**Affected Component**: Admin Feature Flags Page

**Symptoms**:

- Build fails with error: `Cannot use export let in runes mode — use $props() instead`
- Error location: `src/routes/admin/feature-flags/+page.svelte:6:1`
- Web app cannot build or deploy to Vercel

**Root Cause**:
The feature flags admin page was using old Svelte syntax (`export let data: PageData`) but the project is configured to use Svelte 5 runes mode. In runes mode, component props must be declared using the `$props()` rune instead of the `export let` syntax. While the rest of the file was already using runes syntax (`$state` on lines 8-9), line 6 was still using the deprecated prop declaration syntax.

**Fix Applied**:
Converted the prop declaration from old Svelte syntax to Svelte 5 runes syntax:

- Changed `export let data: PageData;` to `let { data }: { data: PageData } = $props();`

**Files Changed**:

- `apps/web/src/routes/admin/feature-flags/+page.svelte:6` - Converted export let to $props() rune

**Manual Verification**:

1. Run `pnpm build --filter=@buildos/web` - build should complete without runes mode errors
2. Navigate to `/admin/feature-flags` page - page should load without errors
3. Test feature flag toggle functionality - toggles should work correctly
4. Verify no console errors related to component props

**Related Documentation**:

- `/apps/web/CLAUDE.md` - Documents Svelte 5 runes syntax requirements
- `/docs/BUGFIX_CHANGELOG.md` - This entry

**Cross-references**:

- BuildOS convention: All web app components must use Svelte 5 runes syntax (`$state`, `$derived`, `$effect`, `$props`)
- See `/apps/web/CLAUDE.md` section "Important Patterns > Svelte 5 Runes"

**Confidence**: High - Error is explicit, fix is straightforward, build confirms resolution

**Fixed By**: Claude

---

### [2025-10-13] Bug: Incomplete timezone centralization migration causing TypeScript errors

**Status**: Fixed
**Severity**: Small
**Affected Component**: Worker Service - Scheduler & Brief Generation

**Symptoms**:

- Worker service fails TypeScript typecheck with 11 errors
- All errors related to accessing `timezone` property on `user_brief_preferences` and `user_sms_preferences` tables
- Error message: `Property 'timezone' does not exist on type 'SelectQueryError<"column 'timezone' does not exist on 'user_*_preferences'.">'.`
- Worker cannot build or deploy to Railway

**Root Cause**:
The timezone centralization migration (documented as "100% COMPLETE" in `/thoughts/shared/research/2025-10-13_timezone-centralization-COMPLETE.md`) was actually incomplete. While the database schema was successfully updated to use `users.timezone` as the single source of truth and TypeScript types were regenerated correctly, several code locations in the worker service were missed during the migration and still referenced the deprecated `preference.timezone` fields:

1. `scheduler.ts:428` - `calculateNextRunTime()` read from `preference.timezone`
2. `scheduler.ts:641` - SELECT query included non-existent `timezone` column from `user_sms_preferences`
3. `index.ts:172` - `/queue/brief` endpoint read from `user_brief_preferences.timezone`
4. `briefGenerator.ts:83` - `generateDailyBrief()` read from `user_brief_preferences.timezone`

**Fix Applied**:
Updated all remaining code to consistently fetch timezone from `users.timezone` table:

1. Modified `calculateNextRunTime()` to accept optional `userTimezone` parameter instead of reading from preference object
2. Removed `timezone` from SELECT query on `user_sms_preferences` table
3. Updated `/queue/brief` endpoint to fetch timezone from `users` table (combined with existing user validation query)
4. Updated `generateDailyBrief()` to fetch timezone from `users` table instead of `user_brief_preferences`
5. Removed outdated type assertion comments that claimed types hadn't been regenerated

**Files Changed**:

- `apps/worker/src/scheduler.ts:428-433` - Added `userTimezone` parameter to `calculateNextRunTime()`
- `apps/worker/src/scheduler.ts:285-289` - Pass timezone from map when calling `calculateNextRunTime()`
- `apps/worker/src/scheduler.ts:641` - Removed `timezone` from SELECT query
- `apps/worker/src/scheduler.ts:675-680` - Removed type assertion comments
- `apps/worker/src/index.ts:153-165` - Combined user validation and timezone fetch into single query
- `apps/worker/src/workers/brief/briefGenerator.ts:77-83` - Fetch timezone from `users` table

**Manual Verification**:

1. Run `cd apps/worker && pnpm typecheck` - should pass without timezone-related errors
2. Test brief scheduling: Update user timezone via UI, verify brief scheduled at correct time in user's timezone
3. Test SMS reminders: Verify SMS scheduled using correct timezone from users table
4. Check worker logs: Confirm "Fetching from users.timezone" pattern in scheduler logs
5. Verify batch fetching: Confirm scheduler uses single batch query for all user timezones (performance optimization)

**Related Documentation**:

- `/thoughts/shared/research/2025-10-13_timezone-centralization-COMPLETE.md` - Updated to note incomplete worker migration
- `/apps/worker/src/scheduler.ts` - Now fully migrated to centralized timezone
- `/docs/BUGFIX_CHANGELOG.md` - This entry

**Cross-references**:

- Research: `/thoughts/shared/research/2025-10-13_timezone-centralization-COMPLETE.md` (claimed complete but was incomplete)
- Initial analysis: `/thoughts/shared/research/2025-10-13_04-55-45_overlapping-notification-preferences-analysis.md`
- Migration: `/supabase/migrations/20251013_centralize_timezone_to_users_table.sql`
- Schema: `/packages/shared-types/src/database.schema.ts:1198` - `users.timezone` column definition

**Confidence**: High - All code paths now consistently use `users.timezone`, TypeScript validation passes, pattern matches the documented migration approach

**Fixed By**: Claude

---

### [2025-10-13] Bug: SQL syntax error in timezone column drop migration

**Status**: Fixed
**Severity**: Small
**Affected Component**: Database Migrations

**Symptoms**:

- Migration `20251013_drop_deprecated_timezone_columns.sql` fails with syntax error: `ERROR: 42601: syntax error at or near "RAISE" LINE 101`
- Migration cannot execute, blocking cleanup of deprecated timezone columns
- Error message indicates RAISE NOTICE statements are in invalid context

**Root Cause**:
PostgreSQL requires `RAISE` statements (including `RAISE NOTICE`) to be executed within PL/pgSQL procedural blocks (`DO $$ ... END $$` or functions), not in plain SQL. The migration file had standalone `RAISE NOTICE` statements in Phase 3 (lines 101-117) and in the success messages section (lines 162-165) that were outside of DO blocks, violating PostgreSQL syntax rules.

**Fix Applied**:
Wrapped all standalone `RAISE NOTICE` statements in `DO $$ BEGIN ... END $$` blocks to provide the required PL/pgSQL context:

1. Phase 3 column drop notifications (5 RAISE statements) - each wrapped in individual DO blocks
2. Final success messages (4 RAISE statements) - wrapped in single DO block

**Files Changed**:

- `supabase/migrations/20251013_drop_deprecated_timezone_columns.sql:101-136` - Wrapped Phase 3 RAISE NOTICE statements in DO blocks
- `supabase/migrations/20251013_drop_deprecated_timezone_columns.sql:181-187` - Wrapped success message RAISE NOTICE statements in DO block

**Manual Verification**:

1. Run the migration using `pnpm supabase migration up` or Supabase CLI
2. Verify migration executes successfully without syntax errors
3. Check migration output shows all RAISE NOTICE messages (backup status, column drop confirmations, success messages)
4. Confirm timezone columns are successfully dropped from: `user_brief_preferences`, `user_sms_preferences`, `user_calendar_preferences`, `user_notification_preferences`
5. Verify `users.timezone` column remains intact as single source of truth

**Related Documentation**:

- `/supabase/migrations/20251013_drop_deprecated_timezone_columns.sql` - The fixed migration file
- `/docs/BUGFIX_CHANGELOG.md` - This entry

**Cross-references**:

- Research: `/thoughts/shared/research/2025-10-13_timezone-centralization-COMPLETE.md`
- Related migration: `supabase/migrations/20251013_centralize_timezone_to_users_table.sql`
- Architecture context: Part of timezone centralization effort to use `users.timezone` as single source of truth

**Confidence**: High - Fix directly addresses PostgreSQL syntax requirements, and pattern is used correctly elsewhere in the same migration file

**Fixed By**: Claude

---

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
