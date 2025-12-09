<!-- apps/web/docs/technical/deployment/runbooks/database-recovery.md -->

# Database Recovery Procedures

> **Purpose**: Procedures for diagnosing and recovering from database issues in BuildOS (Supabase PostgreSQL)
>
> **Severity**: Critical - Affects all application functionality
>
> **Last Updated**: September 26, 2025

## 🚨 Emergency Response (< 5 minutes)

### 1. Assess Database Status

```bash
# Test basic database connectivity
psql $DATABASE_URL -c "SELECT 1;"

# Check Supabase project status
curl -s -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  "https://$SUPABASE_PROJECT_REF.supabase.co/rest/v1/" | jq '.'

# Verify from application
curl -s https://your-app.vercel.app/api/health/database
```

### 2. Identify Issue Type

```sql
-- Quick health check queries
SELECT version(); -- PostgreSQL version
SELECT current_database(); -- Current database
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'; -- Table count
```

### 3. Check Recent Activity

```sql
-- Active connections
SELECT count(*) as active_connections,
       state,
       application_name
FROM pg_stat_activity
WHERE state != 'idle'
GROUP BY state, application_name;

-- Long-running queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
  AND state != 'idle';
```

## 🔍 Database Issue Types

### Type 1: Connection Pool Exhaustion

**Symptoms**:

- "too many connections" errors
- Application timeouts
- Cannot establish new connections

**Diagnosis**:

```sql
-- Check connection limits and usage
SELECT setting FROM pg_settings WHERE name = 'max_connections';

SELECT count(*) as current_connections,
       max_val,
       round(count(*) * 100.0 / max_val::numeric, 2) as percent_used
FROM pg_stat_activity,
     (SELECT setting::int as max_val FROM pg_settings WHERE name = 'max_connections') s;

-- Check connections by application
SELECT application_name,
       state,
       count(*) as connection_count
FROM pg_stat_activity
GROUP BY application_name, state
ORDER BY connection_count DESC;
```

**Immediate Recovery**:

```sql
-- Kill idle connections (use carefully!)
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
  AND query_start < now() - interval '30 minutes'
  AND application_name NOT LIKE 'psql%';

-- Kill long-running queries
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state != 'idle'
  AND query_start < now() - interval '10 minutes'
  AND query NOT LIKE '%pg_stat_activity%';
```

**Application-Level Fix**:

```typescript
// Update Supabase client configuration
const supabase = createClient(url, key, {
	db: {
		schema: 'public'
	},
	auth: {
		autoRefreshToken: true,
		persistSession: false // Important for server-side usage
	},
	global: {
		headers: { 'x-my-custom-header': 'buildos' }
	}
});

// Implement connection pooling
class DatabasePool {
	private connections: Map<string, any> = new Map();
	private maxConnections = 10;

	async getConnection(userId: string) {
		if (this.connections.size >= this.maxConnections) {
			// Reuse existing connection or wait
			const oldestKey = this.connections.keys().next().value;
			const connection = this.connections.get(oldestKey);
			this.connections.delete(oldestKey);
			this.connections.set(userId, connection);
			return connection;
		}

		const connection = createClient(
			process.env.SUPABASE_URL!,
			process.env.SUPABASE_SERVICE_KEY!
		);
		this.connections.set(userId, connection);
		return connection;
	}
}
```

### Type 2: Performance Degradation

**Symptoms**:

- Slow query responses
- High CPU/memory usage
- Query timeouts

**Diagnosis**:

```sql
-- Check for missing indexes
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE schemaname = 'public'
  AND n_distinct > 100
  AND correlation < 0.1;

-- Identify slow queries
SELECT query,
       mean_exec_time,
       calls,
       total_exec_time,
       mean_exec_time * calls as total_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check table sizes
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
       pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY size_bytes DESC;

-- Analyze query performance
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT * FROM brain_dumps
WHERE user_id = 'some-user-id'
ORDER BY created_at DESC;
```

**Performance Recovery**:

```sql
-- Add missing indexes for common queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brain_dumps_user_created
ON brain_dumps(user_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_user_status
ON projects(user_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_project_status
ON tasks(project_id, status);

-- Update table statistics
ANALYZE brain_dumps;
ANALYZE projects;
ANALYZE tasks;

-- Vacuum large tables if needed (during maintenance window)
VACUUM (ANALYZE, VERBOSE) brain_dumps;
```

### Type 3: Data Corruption

**Symptoms**:

- Constraint violation errors
- Data inconsistencies
- Unexpected query results

**Diagnosis**:

```sql
-- Check for constraint violations
SELECT conname, conrelid::regclass
FROM pg_constraint
WHERE NOT convalidated;

-- Check for orphaned records
SELECT 'tasks without projects' as issue, count(*) as count
FROM tasks t
LEFT JOIN projects p ON t.project_id = p.id
WHERE p.id IS NULL
UNION ALL
SELECT 'projects without users', count(*)
FROM projects p
LEFT JOIN users u ON p.user_id = u.id
WHERE u.id IS NULL;

-- Check for duplicate primary keys (shouldn't exist but worth checking)
SELECT id, count(*)
FROM projects
GROUP BY id
HAVING count(*) > 1;
```

**Data Recovery**:

```sql
-- Fix orphaned tasks
UPDATE tasks
SET project_id = NULL
WHERE project_id NOT IN (SELECT id FROM projects);

-- Clean up invalid data
DELETE FROM brain_dumps
WHERE created_at > NOW()
   OR user_id NOT IN (SELECT id FROM users);

-- Restore referential integrity
ALTER TABLE tasks VALIDATE CONSTRAINT tasks_project_id_fkey;
ALTER TABLE projects VALIDATE CONSTRAINT projects_user_id_fkey;
```

### Type 4: Row Level Security Issues

**Symptoms**:

- Users seeing other users' data
- Permission denied errors
- RLS policy conflicts

**Diagnosis**:

```sql
-- Check RLS status
SELECT schemaname, tablename, rowsecurity, forcerowsecurity
FROM pg_tables
WHERE schemaname = 'public';

-- Review RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Test RLS as specific user
SET ROLE authenticated;
SET request.jwt.claims.sub = 'test-user-id';
SELECT count(*) FROM projects; -- Should only see user's projects
RESET ROLE;
```

**RLS Recovery**:

```sql
-- Ensure RLS is enabled on all user tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_dumps ENABLE ROW LEVEL SECURITY;

-- Recreate essential RLS policies
DROP POLICY IF EXISTS "Users can view own data" ON users;
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can manage own projects" ON projects;
CREATE POLICY "Users can manage own projects" ON projects
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage project tasks" ON tasks;
CREATE POLICY "Users can manage project tasks" ON tasks
  FOR ALL USING (
    auth.uid() IN (
      SELECT user_id FROM projects WHERE id = tasks.project_id
    )
  );
```

## 💾 Backup & Recovery Procedures

### Immediate Backup Creation

```bash
# Create manual backup before major recovery operations
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# For large databases, use compressed backup
pg_dump $DATABASE_URL | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Backup specific tables
pg_dump $DATABASE_URL -t public.projects -t public.tasks > critical_tables_backup.sql
```

### Point-in-Time Recovery (Supabase)

```bash
# Supabase provides automated backups, but you can request point-in-time recovery
# Contact Supabase support for production database restoration

# For development, you can restore from a backup
psql $DATABASE_URL < backup_20250926_120000.sql
```

### Data Export for Critical Tables

```sql
-- Export critical data to CSV for manual recovery
COPY (
  SELECT id, user_id, name, description, status, created_at
  FROM projects
  WHERE created_at > NOW() - INTERVAL '30 days'
) TO '/tmp/recent_projects.csv' WITH CSV HEADER;

COPY (
  SELECT id, project_id, title, description, status, created_at
  FROM tasks
  WHERE created_at > NOW() - INTERVAL '30 days'
) TO '/tmp/recent_tasks.csv' WITH CSV HEADER;
```

## 🔧 Preventive Maintenance

### Daily Health Checks

```sql
-- Create a daily health check procedure
CREATE OR REPLACE FUNCTION daily_health_check()
RETURNS TABLE(check_name text, status text, details text) AS $$
BEGIN
  -- Connection check
  RETURN QUERY SELECT 'connection_count'::text,
    CASE WHEN count(*) < 80 THEN 'healthy' ELSE 'warning' END,
    'Current connections: ' || count(*)::text
  FROM pg_stat_activity;

  -- Table size check
  RETURN QUERY SELECT 'large_tables'::text,
    CASE WHEN max(pg_total_relation_size(oid)) < 1000000000 THEN 'healthy' ELSE 'warning' END,
    'Largest table: ' || pg_size_pretty(max(pg_total_relation_size(oid)))
  FROM pg_class WHERE relkind = 'r';

  -- Lock check
  RETURN QUERY SELECT 'locks'::text,
    CASE WHEN count(*) < 10 THEN 'healthy' ELSE 'warning' END,
    'Active locks: ' || count(*)::text
  FROM pg_locks WHERE NOT granted;
END;
$$ LANGUAGE plpgsql;

-- Run the health check
SELECT * FROM daily_health_check();
```

### Weekly Maintenance

```sql
-- Update table statistics (run during low-traffic periods)
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE 'ANALYZE ' || rec.tablename;
  END LOOP;
END $$;

-- Check for bloated tables
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
  AND pg_total_relation_size(schemaname||'.'||tablename) > 100000000 -- > 100MB
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Monitoring Setup

```typescript
// Application-level database monitoring
async function monitorDatabaseHealth() {
	try {
		const start = Date.now();

		// Test basic connectivity
		const { data: connectionTest } = await supabase.from('users').select('count').limit(1);

		const duration = Date.now() - start;

		// Log metrics
		await supabase.from('system_metrics').insert({
			metric_name: 'database_response_time',
			value: duration,
			timestamp: new Date().toISOString()
		});

		// Alert if response time > 2 seconds
		if (duration > 2000) {
			await sendSlackAlert(`⚠️ Database response time: ${duration}ms`);
		}
	} catch (error) {
		await sendSlackAlert(`🚨 Database connectivity error: ${error.message}`);
	}
}

// Run every 5 minutes
setInterval(monitorDatabaseHealth, 5 * 60 * 1000);
```

## 🔗 Related Resources

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Supabase Connection Recovery](/docs/technical/deployment/runbooks/supabase-connection-recovery.md)
- [Performance Troubleshooting](/docs/technical/deployment/runbooks/performance-issues.md)
- [Incident Response Template](/docs/technical/deployment/runbooks/incident-response.md)

## 📞 Escalation Contacts

- **Supabase Support**: support@supabase.io (include project reference)
- **DBA Consultant**: [If you have one]
- **Internal Team**: #engineering Slack channel

## 📝 Post-Recovery Checklist

- [ ] Verify all core functionality works
- [ ] Run data integrity checks
- [ ] Update monitoring thresholds
- [ ] Document lessons learned
- [ ] Review and update backup procedures
- [ ] Schedule preventive maintenance if needed
- [ ] Communicate resolution to stakeholders
