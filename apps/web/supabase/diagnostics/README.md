<!-- apps/web/supabase/diagnostics/README.md -->

# Supabase Diagnostics

This folder contains diagnostic queries for troubleshooting Supabase database issues.

## Files

### check_auth_schema.sql

**Purpose**: Diagnose missing columns in the Supabase auth schema, specifically the `provider` column in `auth.identities` table.

**When to use**:

- Registration fails with "column provider does not exist" error
- Auth-related operations fail with schema errors
- After Supabase migrations or updates

**How to use**:

1. Go to Supabase Dashboard SQL Editor
2. Copy and paste the entire SQL file contents
3. Run the query
4. Check results for any "MISSING ✗" indicators
5. If provider column is missing, run the fix migration

**Related fix**: `/apps/web/supabase/migrations/20251022_fix_auth_identities_provider.sql`

## How to Run Diagnostics

### Option 1: Supabase Dashboard (Recommended)

1. Navigate to: https://app.supabase.com/project/[your-project-id]/sql/new
2. Copy the SQL from the diagnostic file
3. Paste and run in the SQL editor
4. Review the results

### Option 2: Node.js Script

```bash
node apps/web/scripts/check-auth-schema.js
```

Note: This script has limited functionality and mainly provides instructions.

### Option 3: psql Command Line

If you have direct database access:

```bash
psql [DATABASE_URL] -f apps/web/supabase/diagnostics/check_auth_schema.sql
```

## Common Issues

### Missing provider column in auth.identities

- **Symptom**: Registration fails with "column provider does not exist"
- **Diagnostic**: Run `check_auth_schema.sql`
- **Fix**: Run migration `/apps/web/supabase/migrations/20251022_fix_auth_identities_provider.sql`

## Documentation

- Bug details: `/docs/BUGFIX_CHANGELOG.md` (search for "Auth Schema Missing Provider Column")
- Registration endpoint: `/apps/web/src/routes/api/auth/register/+server.ts`
