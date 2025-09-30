# Migration Quick Start Guide

## The Error You Got

```
ERROR: 55P04: unsafe use of new value "generate_brief_email" of enum type queue_type
HINT: New enum values must be committed before they can be used.
```

## Why This Happens

PostgreSQL requires enum values to be committed in a **separate transaction** before they can be used in constraints, indexes, or other DDL statements.

## The Solution

The migration has been split into **two parts**:

1. **Part 1**: Adds the enum value (must be committed first)
2. **Part 2**: Uses the enum value in constraints and other objects

## How to Run

### Option 1: Automatic (Recommended)

```bash
cd apps/web
supabase db push
```

Supabase CLI automatically handles the transaction separation when pushing multiple migration files.

### Option 2: Manual (If needed)

```bash
cd apps/web

# Run part 1 (adds enum)
supabase migration up --file 20250930_add_email_brief_job_type_part1.sql

# Run part 2 (uses enum)
supabase migration up --file 20250930_add_email_brief_job_type_part2.sql
```

## After Migration

```bash
# Regenerate TypeScript types
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/database.types.ts

# Verify types are correct
cd ../..
pnpm typecheck

# Should now pass without errors ✅
```

## Files Created

- ✅ `20250930_add_email_brief_job_type_part1.sql` - Adds enum value
- ✅ `20250930_add_email_brief_job_type_part2.sql` - Adds infrastructure
- ❌ `20250930_add_email_brief_job_type.sql` - DELETED (was causing the error)

## Verification

After running both parts, verify with:

```sql
-- Check enum value exists
SELECT enumlabel FROM pg_enum WHERE enumtypid = 'queue_type'::regtype;
-- Should include 'generate_brief_email'

-- Check constraint was updated
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'valid_job_metadata';
-- Should reference 'generate_brief_email'

-- Check indexes exist
SELECT indexname FROM pg_indexes WHERE tablename = 'emails';
-- Should include idx_emails_category_template_data and idx_emails_status_category

-- Check functions exist
SELECT proname FROM pg_proc WHERE proname LIKE '%brief_email%';
-- Should include get_pending_brief_emails and get_brief_email_status
```

## Complete Deployment Checklist

- [ ] Run migrations (`supabase db push`)
- [ ] Regenerate types (`npx supabase gen types typescript`)
- [ ] Verify typecheck passes (`pnpm typecheck`)
- [ ] Deploy worker (`pnpm build && deploy`)
- [ ] Test brief generation
- [ ] Verify email jobs are queued
- [ ] Monitor `brief_email_stats` view

## Need Help?

See detailed documentation in:

- `POST_MIGRATION_STEPS.md` - Complete step-by-step guide
- `IMPLEMENTATION_COMPLETE.md` - Full implementation summary
- `apps/worker/PHASE2_REVISED_IMPLEMENTATION.md` - Technical details
