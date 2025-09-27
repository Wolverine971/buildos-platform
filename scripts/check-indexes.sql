-- check-indexes.sql
-- Script to check all existing indexes in your Supabase database
-- Run this in your Supabase SQL editor

-- Method 1: List all indexes on your main tables (BASIC - This should work)
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
    AND tablename IN (
        'tasks', 'projects', 'phases', 'phase_tasks', 
        'brain_dumps', 'daily_briefs', 'notes',
        'users', 'user_calendar_tokens', 'user_calendar_preferences',
        'recurring_task_instances', 'task_calendar_events',
        'customer_subscriptions', 'emails', 'email_logs',
        'project_synthesis'
    )
ORDER BY tablename, indexname;

-- Method 2: Alternative basic query for indexes
SELECT 
    n.nspname AS schema_name,
    t.relname AS table_name,
    i.relname AS index_name,
    pg_get_indexdef(i.oid) AS index_definition
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_namespace n ON t.relnamespace = n.oid
WHERE n.nspname = 'public'
    AND t.relname IN (
        'tasks', 'projects', 'phases', 'phase_tasks', 
        'brain_dumps', 'daily_briefs', 'notes',
        'users', 'user_calendar_tokens', 'user_calendar_preferences',
        'recurring_task_instances', 'task_calendar_events',
        'customer_subscriptions', 'emails', 'email_logs',
        'project_synthesis'
    )
ORDER BY t.relname, i.relname;

-- Method 3: Simple table and index info
SELECT 
    tablename,
    indexname,
    CASE 
        WHEN indexdef LIKE '%UNIQUE%' THEN 'UNIQUE'
        WHEN indexdef LIKE '%btree%' THEN 'BTREE'
        WHEN indexdef LIKE '%gin%' THEN 'GIN'
        WHEN indexdef LIKE '%gist%' THEN 'GIST'
        ELSE 'OTHER'
    END as index_type,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
    AND tablename IN ('tasks', 'projects', 'brain_dumps', 'recurring_task_instances')
ORDER BY tablename, indexname;