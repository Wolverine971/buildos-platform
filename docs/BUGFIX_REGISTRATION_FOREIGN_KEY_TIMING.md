# Registration Foreign Key Timing Bug Fix

## Issue Summary

**Date:** 2025-10-22
**Severity:** Critical - Prevented all new user registrations
**Root Cause:** Foreign key constraint violation due to trigger timing issue

## The Problem

User registration was failing with a cascade of errors:

1. **Initial Error:** `column 'provider' does not exist`
    - Function querying wrong table (auth.users instead of auth.identities)

2. **Second Error:** `record 'new' has no field 'referral_source'`
    - Reference to non-existent column in users table

3. **Critical Error:** `foreign key constraint 'notification_events_actor_user_id_fkey' violated`
    - The actual blocking issue - foreign key timing problem

## Root Cause Analysis

### The Core Issue: Foreign Key Timing

The `notification_events` table has a foreign key constraint:

```sql
actor_user_id UUID REFERENCES auth.users(id)
```

The problem:

- The `handle_new_user_trial()` function was a **BEFORE INSERT** trigger
- In BEFORE INSERT, the user doesn't exist in `auth.users` yet
- Trying to insert into `notification_events` with `actor_user_id = NEW.id` fails
- PostgreSQL rejects the insert due to foreign key violation

### Why It Manifested Now

The notification tables existed in the database all along, but the foreign key constraints were only enforced when the trigger tried to insert data referencing a user that didn't exist yet.

## The Solution

Split the single BEFORE INSERT trigger into two separate triggers:

### 1. BEFORE INSERT Trigger

```sql
CREATE FUNCTION set_user_trial_period()
-- Sets trial period
-- Can modify NEW record
-- User doesn't exist in database yet
```

### 2. AFTER INSERT Trigger

```sql
CREATE FUNCTION notify_user_signup()
-- Sends notifications
-- User now exists in auth.users
-- Foreign key constraints satisfied
```

## Implementation Details

### Migration Applied

**File:** `/apps/web/supabase/migrations/20251022_fix_foreign_key_constraint_timing.sql`

This migration:

1. Drops the problematic combined trigger
2. Creates two separate trigger functions
3. Fixes the provider query (auth.identities not auth.users)
4. Removes the non-existent referral_source field
5. Adds comprehensive error handling

### Key Code Changes

```sql
-- BEFORE: Failed because user doesn't exist yet
CREATE TRIGGER on_user_created_trial
  BEFORE INSERT ON users
  EXECUTE FUNCTION handle_new_user_trial(); -- Tried to insert notification

-- AFTER: Works because of proper timing
CREATE TRIGGER before_user_insert_set_trial
  BEFORE INSERT ON users
  EXECUTE FUNCTION set_user_trial_period(); -- Only modifies NEW

CREATE TRIGGER after_user_insert_notify
  AFTER INSERT ON users
  EXECUTE FUNCTION notify_user_signup(); -- User exists, FK works
```

## Verification

After applying the fix, new user registrations work correctly with:

- ✅ Trial period set automatically (14 days)
- ✅ Subscription status set to 'trialing'
- ✅ Notifications created without foreign key violations
- ✅ All error cases handled gracefully

## Lessons Learned

### 1. Trigger Timing Matters

**BEFORE INSERT triggers:**

- Can modify the NEW record
- User doesn't exist in database yet
- Cannot safely reference with foreign keys

**AFTER INSERT triggers:**

- Cannot modify the record
- User exists in database
- Safe for foreign key references

### 2. Foreign Key Constraints

Always consider timing when inserting records with foreign key relationships in triggers. The referenced record must exist before the referencing record.

### 3. Error Handling

Comprehensive error handling ensures core functionality (user registration) succeeds even if auxiliary features (notifications) fail.

## Prevention

1. **Trigger Design:** Always split triggers when you need both record modification and foreign key references
2. **Testing:** Include trigger testing in registration tests
3. **Documentation:** Document trigger dependencies and timing requirements
4. **Error Boundaries:** Wrap non-critical operations in try-catch blocks

## Files Changed

- **Kept:** `/apps/web/supabase/migrations/20251022_fix_foreign_key_constraint_timing.sql` (the working fix)
- **Removed:** 8 stale migration files from failed approaches
- **Created:** This documentation file

## Resolution Status

✅ **RESOLVED** - Registration now works correctly with proper trigger timing

---

_This fix demonstrates the importance of understanding PostgreSQL trigger execution order and foreign key constraint timing._
