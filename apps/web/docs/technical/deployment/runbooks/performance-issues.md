# Performance Troubleshooting Guide

> **Purpose**: Procedures for diagnosing and resolving performance issues in BuildOS
>
> **Scope**: Application performance, API response times, database queries, and user experience
>
> **Last Updated**: September 26, 2025

## 🚨 Performance Triage (< 5 minutes)

### 1. Quick Performance Check
```bash
# Check Vercel function performance
vercel logs --filter="duration" --limit=20

# Test API response times
time curl -s https://your-app.vercel.app/api/health

# Check database response time
time psql $DATABASE_URL -c "SELECT 1;"

# Monitor real-time metrics
curl -s https://your-app.vercel.app/api/metrics/performance
```

### 2. Identify Performance Category

#### Frontend Performance Issues
- **Symptoms**: Slow page loads, UI lag, large bundle sizes
- **Check**: Browser DevTools, Lighthouse scores, bundle analysis

#### API Performance Issues
- **Symptoms**: Slow API responses, timeouts, high latency
- **Check**: Vercel function logs, response times, cold starts

#### Database Performance Issues
- **Symptoms**: Slow queries, connection timeouts, high CPU
- **Check**: Query execution times, connection counts, index usage

#### External Service Issues
- **Symptoms**: OpenAI/Google/Stripe API slowness
- **Check**: External service status, rate limiting, network latency

## 🔍 Frontend Performance Diagnostics

### Bundle Size Analysis
```bash
# Analyze bundle size
npm run build
npx bundlesize

# Check for large dependencies
npx webpack-bundle-analyzer .next/static/chunks/*.js

# Lighthouse audit
npx lighthouse https://your-app.vercel.app --output=json --output-path=./lighthouse-report.json
```

### Common Frontend Issues & Fixes

#### 1. Large JavaScript Bundles
```typescript
// ❌ Problem: Importing entire libraries
import * as _ from 'lodash';
import moment from 'moment';

// ✅ Solution: Use tree shaking and lighter alternatives
import { debounce } from 'lodash-es';
import { formatDistanceToNow } from 'date-fns';

// Dynamic imports for large components
const BrainDumpModal = lazy(() => import('./BrainDumpModal.svelte'));
```

#### 2. Unoptimized Images
```typescript
// ❌ Problem: Large unoptimized images
<img src="/large-image.png" alt="..." />

// ✅ Solution: Use Vercel Image Optimization
<Image
  src="/large-image.png"
  alt="..."
  width={800}
  height={600}
  priority={false}
  placeholder="blur"
/>
```

#### 3. Inefficient Svelte Components
```svelte
<!-- ❌ Problem: No reactivity optimization -->
<script>
  let projects = [];
  let filteredProjects = projects.filter(p => p.status === 'active');
</script>

<!-- ✅ Solution: Use Svelte 5 runes efficiently -->
<script>
  let projects = $state([]);
  let filteredProjects = $derived(
    projects.filter(p => p.status === 'active')
  );
</script>
```

## 🖥️ API Performance Diagnostics

### Response Time Analysis
```bash
# Check function execution times
vercel logs --filter="Duration" --limit=50 | grep -E "Duration: [0-9]+ms"

# Identify slow endpoints
vercel logs --filter="brain-dump" --filter="Duration" --limit=20

# Check for cold starts
vercel logs --filter="Cold Boot" --limit=10
```

### Common API Performance Issues

#### 1. Cold Start Optimization
```typescript
// ❌ Problem: Heavy imports causing cold starts
import { OpenAI } from 'openai';
import { GoogleAuth } from 'google-auth-library';
import Stripe from 'stripe';

// ✅ Solution: Lazy load heavy dependencies
const getOpenAI = () => import('openai').then(mod => new mod.OpenAI({
  apiKey: process.env.OPENAI_API_KEY
}));

const getStripe = () => import('stripe').then(mod => new mod.default(
  process.env.STRIPE_SECRET_KEY!
));
```

#### 2. Database Connection Pooling
```typescript
// ❌ Problem: Creating new connections per request
export async function POST(request: Request) {
  const supabase = createClient(url, key); // New connection each time
  // ...
}

// ✅ Solution: Reuse connections
let globalSupabase: SupabaseClient | null = null;

function getSupabaseClient() {
  if (!globalSupabase) {
    globalSupabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
      {
        auth: { persistSession: false }
      }
    );
  }
  return globalSupabase;
}
```

#### 3. Inefficient Data Fetching
```typescript
// ❌ Problem: N+1 query pattern
async function getProjectsWithTasks(userId: string) {
  const projects = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId);

  for (const project of projects.data || []) {
    project.tasks = await supabase
      .from('tasks')
      .select('*')
      .eq('project_id', project.id); // N+1 queries!
  }
}

// ✅ Solution: Single query with joins
async function getProjectsWithTasks(userId: string) {
  const { data } = await supabase
    .from('projects')
    .select(`
      *,
      tasks (
        id,
        title,
        status,
        created_at
      )
    `)
    .eq('user_id', userId);

  return data;
}
```

## 🗄️ Database Performance Diagnostics

### Query Performance Analysis
```sql
-- Enable query logging (if needed)
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_min_duration_statement = 1000; -- Log queries > 1 second

-- Find slow queries
SELECT query,
       mean_exec_time,
       calls,
       total_exec_time,
       rows,
       100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check for missing indexes
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE schemaname = 'public'
  AND n_distinct > 100
  AND correlation < 0.1;

-- Analyze specific slow query
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT p.*, t.count as task_count
FROM projects p
LEFT JOIN (
  SELECT project_id, count(*) as count
  FROM tasks
  GROUP BY project_id
) t ON p.id = t.project_id
WHERE p.user_id = 'user-id-here'
ORDER BY p.created_at DESC;
```

### Database Optimization Actions

#### 1. Add Strategic Indexes
```sql
-- Common query patterns in BuildOS
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brain_dumps_user_created
ON brain_dumps(user_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_user_status
ON projects(user_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_project_status
ON tasks(project_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_user_due_date
ON tasks(user_id, due_date) WHERE due_date IS NOT NULL;

-- Composite index for brain dump processing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brain_dumps_processing
ON brain_dumps(status, created_at) WHERE status IN ('processing', 'queued');
```

#### 2. Optimize Common Queries
```sql
-- ❌ Slow: Counting all tasks for each project
SELECT p.*,
       (SELECT count(*) FROM tasks WHERE project_id = p.id) as task_count
FROM projects p
WHERE user_id = $1;

-- ✅ Fast: Single query with LEFT JOIN
SELECT p.id, p.name, p.description,
       COALESCE(t.task_count, 0) as task_count
FROM projects p
LEFT JOIN (
  SELECT project_id, count(*) as task_count
  FROM tasks
  GROUP BY project_id
) t ON p.id = t.project_id
WHERE p.user_id = $1;
```

#### 3. Connection Pool Configuration
```typescript
// Optimize Supabase client for performance
const supabase = createClient(url, key, {
  db: {
    schema: 'public',
  },
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  global: {
    headers: {
      'x-client-info': 'buildos-server'
    }
  }
});

// Use read replicas for heavy read operations
const supabaseRead = createClient(readReplicaUrl, key, {
  // Same config but pointing to read replica
});
```

## 🌐 External Service Performance

### OpenAI API Optimization
```typescript
// ❌ Problem: Sequential API calls
async function processBrainDump(content: string) {
  const context = await openai.chat.completions.create({...}); // 2-3 seconds
  const tasks = await openai.chat.completions.create({...});   // 2-3 seconds
  return { context, tasks }; // Total: 4-6 seconds
}

// ✅ Solution: Parallel processing
async function processBrainDump(content: string) {
  const [context, tasks] = await Promise.all([
    openai.chat.completions.create({...}),
    openai.chat.completions.create({...})
  ]); // Total: 2-3 seconds
  return { context, tasks };
}

// ✅ Even better: Streaming responses
async function processBrainDumpStream(content: string) {
  const stream = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content }],
    stream: true
  });

  for await (const chunk of stream) {
    // Send incremental updates to UI
    yield chunk.choices[0]?.delta?.content || '';
  }
}
```

### Calendar API Optimization
```typescript
// ❌ Problem: Multiple API calls
async function syncCalendarEvents(calendarId: string) {
  const events = await calendar.events.list({ calendarId });
  for (const event of events.data.items || []) {
    await updateLocalEvent(event); // Multiple DB calls
  }
}

// ✅ Solution: Batch operations
async function syncCalendarEvents(calendarId: string) {
  const events = await calendar.events.list({
    calendarId,
    maxResults: 100,
    timeMin: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  });

  // Batch database updates
  const updates = events.data.items?.map(event => ({
    google_event_id: event.id,
    title: event.summary,
    start_time: event.start?.dateTime,
    end_time: event.end?.dateTime,
    updated_at: new Date().toISOString()
  })) || [];

  await supabase.from('calendar_events').upsert(updates);
}
```

## 📊 Performance Monitoring

### Real-time Metrics Collection
```typescript
// Performance monitoring middleware
export async function performanceMiddleware(request: Request, handler: Function) {
  const start = Date.now();
  const url = new URL(request.url);

  try {
    const response = await handler(request);
    const duration = Date.now() - start;

    // Log performance metrics
    await supabase.from('performance_metrics').insert({
      endpoint: url.pathname,
      method: request.method,
      duration_ms: duration,
      status: response.status,
      timestamp: new Date().toISOString()
    });

    // Alert on slow responses
    if (duration > 5000) {
      await sendSlackAlert(`🐌 Slow response: ${url.pathname} took ${duration}ms`);
    }

    return response;
  } catch (error) {
    const duration = Date.now() - start;

    await supabase.from('performance_metrics').insert({
      endpoint: url.pathname,
      method: request.method,
      duration_ms: duration,
      status: 500,
      error: error.message,
      timestamp: new Date().toISOString()
    });

    throw error;
  }
}
```

### Performance Dashboard Queries
```sql
-- API response time percentiles (last 24 hours)
SELECT
  endpoint,
  count(*) as requests,
  round(avg(duration_ms)) as avg_ms,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms)) as p50_ms,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)) as p95_ms,
  round(percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms)) as p99_ms
FROM performance_metrics
WHERE timestamp > now() - interval '24 hours'
  AND status = 200
GROUP BY endpoint
ORDER BY p95_ms DESC;

-- Error rate by endpoint
SELECT
  endpoint,
  count(*) as total_requests,
  count(*) FILTER (WHERE status >= 400) as error_count,
  round(100.0 * count(*) FILTER (WHERE status >= 400) / count(*), 2) as error_rate_percent
FROM performance_metrics
WHERE timestamp > now() - interval '24 hours'
GROUP BY endpoint
HAVING count(*) > 10
ORDER BY error_rate_percent DESC;
```

### Automated Performance Alerts
```typescript
// Daily performance report
async function generatePerformanceReport() {
  const slowEndpoints = await supabase
    .from('performance_metrics')
    .select('endpoint, avg(duration_ms) as avg_duration')
    .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .group('endpoint')
    .having('avg(duration_ms) > 2000');

  if (slowEndpoints.data?.length > 0) {
    const report = slowEndpoints.data
      .map(ep => `${ep.endpoint}: ${ep.avg_duration}ms`)
      .join('\n');

    await sendSlackAlert(`📊 Daily Performance Report:\nSlow endpoints (>2s):\n${report}`);
  }
}

// Run daily at 9 AM
```

## 🛠️ Performance Optimization Checklist

### Frontend Optimizations
- [ ] Bundle size analysis completed
- [ ] Images optimized and using Next.js Image component
- [ ] Unnecessary re-renders eliminated
- [ ] Large components lazy-loaded
- [ ] Critical CSS inlined
- [ ] Service Worker implemented for caching

### API Optimizations
- [ ] Database connection pooling implemented
- [ ] N+1 queries eliminated
- [ ] Appropriate indexes created
- [ ] External API calls optimized/cached
- [ ] Cold start optimizations applied
- [ ] Response compression enabled

### Database Optimizations
- [ ] Query execution plans reviewed
- [ ] Missing indexes identified and created
- [ ] Table statistics updated
- [ ] Connection limits appropriate
- [ ] Slow query logging enabled
- [ ] Regular VACUUM/ANALYZE scheduled

### Monitoring & Alerting
- [ ] Performance metrics collection in place
- [ ] Alerting thresholds configured
- [ ] Dashboard for performance tracking
- [ ] Regular performance reviews scheduled

## 🔗 Related Resources

- [Database Recovery Procedures](/docs/technical/deployment/runbooks/database-recovery.md)
- [Supabase Connection Recovery](/docs/technical/deployment/runbooks/supabase-connection-recovery.md)
- [OpenAI Rate Limiting](/docs/technical/deployment/runbooks/openai-rate-limiting.md)
- [Incident Response Template](/docs/technical/deployment/runbooks/incident-response.md)

## 📞 Escalation Contacts

- **Performance Expert**: [Team member responsible for performance]
- **Database Administrator**: [If available]
- **Infrastructure Team**: #engineering Slack channel

## 📝 Post-Optimization Checklist

- [ ] Performance improvements verified
- [ ] Metrics showing improvement
- [ ] No regressions introduced
- [ ] Documentation updated
- [ ] Team informed of changes
- [ ] Monitoring thresholds adjusted if needed