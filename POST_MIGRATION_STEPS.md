# Post-Migration Steps

After running the database migration, you need to regenerate the TypeScript types to resolve the type errors.

## 1. Run the Migrations (Two Parts)

Due to PostgreSQL's requirement that new enum values be committed before use, this migration is split into two parts:

```bash
cd apps/web

# Part 1: Add enum value (this commits the new enum value)
supabase migration up --file 20250930_add_email_brief_job_type_part1.sql

# Part 2: Add constraints, indexes, and functions (uses the committed enum value)
supabase migration up --file 20250930_add_email_brief_job_type_part2.sql

# OR run both with db push (Supabase handles the transaction separation):
supabase db push
```

**Why two parts?**
PostgreSQL requires enum values to be committed in a separate transaction before they can be used in constraints or other DDL statements.

## 2. Regenerate TypeScript Types

After the migration adds `generate_brief_email` to the `queue_type` enum, regenerate the TypeScript types:

```bash
cd apps/web
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/database.types.ts

# Or if using local:
npx supabase gen types typescript --local > src/lib/database.types.ts
```

This will update `src/lib/database.types.ts` to include `'generate_brief_email'` in the queue_type enum.

## 3. Verify Type Errors Are Resolved

```bash
# From monorepo root
pnpm typecheck

# Should now pass without the previous errors:
# ✓ src/worker.ts:152 - "generate_brief_email" is now valid
# ✓ All type errors resolved
```

## 4. Update shared-types package (if needed)

The `@buildos/shared-types` package will automatically pick up the new enum value from the regenerated database types since it references `Database['public']['Enums']['queue_type']`.

## 5. Deploy Worker

```bash
cd apps/worker
pnpm build
pnpm start
# Or deploy to Railway/your hosting platform
```

## Expected Type Changes

After regeneration, `apps/web/src/lib/database.types.ts` should contain:

```typescript
queue_type:
  | 'generate_daily_brief'
  | 'generate_phases'
  | 'sync_calendar'
  | 'process_brain_dump'
  | 'send_email'
  | 'update_recurring_tasks'
  | 'cleanup_old_data'
  | 'onboarding_analysis'
  | 'send_sms'
  | 'generate_brief_email'  // ← NEW
  | 'other';
```

This will cascade through:

- `@buildos/shared-types` (via Database type reference)
- `@buildos/worker` (imports from shared-types)
- All queue-related code

## Verification Checklist

- [ ] Migration applied successfully
- [ ] Database types regenerated
- [ ] `pnpm typecheck` passes without errors
- [ ] Worker service deployed
- [ ] Test brief generation creates email job
- [ ] Test email job is processed successfully
- [ ] Monitor `brief_email_stats` view for delivery metrics
