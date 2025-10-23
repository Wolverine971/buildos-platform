-- ============================================================================
-- AUTH SCHEMA DIAGNOSTIC QUERY
-- Purpose: Check the current state of Supabase auth schema to diagnose
--          "column provider does not exist" error during user registration
-- Date: 2025-10-22
-- Issue: AuthApiError: Database error saving new user
-- ============================================================================

-- 1. Check if auth schema exists
SELECT
    schema_name,
    schema_owner,
    CASE
        WHEN schema_name = 'auth' THEN 'Auth schema exists ✓'
        ELSE 'Auth schema missing ✗'
    END as status
FROM information_schema.schemata
WHERE schema_name = 'auth';

-- 2. List all tables in auth schema
SELECT
    table_name,
    CASE
        WHEN table_name IN ('users', 'identities', 'sessions', 'refresh_tokens', 'audit_log_entries', 'schema_migrations')
        THEN 'Core table ✓'
        ELSE 'Additional table'
    END as table_type
FROM information_schema.tables
WHERE table_schema = 'auth'
ORDER BY
    CASE
        WHEN table_name = 'users' THEN 1
        WHEN table_name = 'identities' THEN 2
        ELSE 3
    END,
    table_name;

-- 3. Check columns in auth.users table
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default,
    CASE
        WHEN column_name IN ('id', 'email', 'encrypted_password', 'created_at', 'updated_at')
        THEN 'Core column ✓'
        WHEN column_name = 'provider'
        THEN '⚠️ PROVIDER COLUMN FOUND IN USERS'
        ELSE 'Additional column'
    END as column_status
FROM information_schema.columns
WHERE table_schema = 'auth'
    AND table_name = 'users'
ORDER BY ordinal_position;

-- 4. Check columns in auth.identities table (THIS IS WHERE PROVIDER SHOULD BE!)
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default,
    CASE
        WHEN column_name = 'provider'
        THEN '✓ PROVIDER COLUMN EXISTS'
        WHEN column_name IN ('id', 'user_id', 'identity_data', 'provider_id', 'created_at', 'updated_at')
        THEN 'Core column ✓'
        ELSE 'Additional column'
    END as column_status
FROM information_schema.columns
WHERE table_schema = 'auth'
    AND table_name = 'identities'
ORDER BY ordinal_position;

-- 5. Check for any custom modifications to auth schema
SELECT
    event_object_table as table_name,
    trigger_name,
    event_manipulation as trigger_event,
    action_timing as trigger_timing,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'auth'
ORDER BY event_object_table, trigger_name;

-- 6. Check for any views or functions that might be affected
SELECT
    routine_name,
    routine_type,
    data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'auth'
    AND routine_name LIKE '%provider%'
ORDER BY routine_type, routine_name;

-- 7. Check if there are any constraints referencing 'provider'
SELECT
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'auth'
    AND (kcu.column_name = 'provider' OR tc.constraint_name LIKE '%provider%')
ORDER BY tc.table_name, tc.constraint_name;

-- 8. Quick check: Does auth.identities have the provider column?
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'auth'
        AND table_name = 'identities'
        AND column_name = 'provider'
    ) THEN
        RAISE NOTICE '✅ auth.identities.provider column EXISTS';
    ELSE
        RAISE WARNING '❌ auth.identities.provider column is MISSING - THIS IS THE PROBLEM!';
    END IF;

    -- Also check auth.users (it shouldn't have provider)
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'auth'
        AND table_name = 'users'
        AND column_name = 'provider'
    ) THEN
        RAISE WARNING '⚠️ auth.users.provider column exists (unusual - provider should be in identities table)';
    ELSE
        RAISE NOTICE '✅ auth.users.provider column correctly does not exist (provider should be in identities)';
    END IF;
END $$;

-- 9. Summary: Expected vs Actual Schema
SELECT
    'auth.identities' as table_name,
    'provider' as column_name,
    'text' as expected_type,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'provider'
        ) THEN 'EXISTS ✓'
        ELSE 'MISSING ✗ - THIS IS THE BUG!'
    END as status
UNION ALL
SELECT
    'auth.identities',
    'provider_id',
    'text',
    CASE
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'provider_id'
        ) THEN 'EXISTS ✓'
        ELSE 'MISSING ✗'
    END
UNION ALL
SELECT
    'auth.users',
    'email',
    'text',
    CASE
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email'
        ) THEN 'EXISTS ✓'
        ELSE 'MISSING ✗'
    END;

-- ============================================================================
-- DIAGNOSIS COMPLETE
--
-- If auth.identities.provider column is missing, run the fix migration:
-- /apps/web/supabase/migrations/20251022_fix_auth_identities_provider.sql
-- ============================================================================