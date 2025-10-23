---
title: 'Monitoring and Observability Best Practices Audit'
date: 2025-10-23
status: completed
tags: [monitoring, observability, infrastructure, audit]
---

# Monitoring and Observability Best Practices Audit

**Date:** 2025-10-23
**Scope:** BuildOS Platform (Web App + Worker Service)
**Purpose:** Research existing monitoring and observability practices, identify gaps, and provide recommendations

## Executive Summary

BuildOS has implemented **custom monitoring infrastructure** with strong domain-specific coverage (SMS metrics, error logging) but lacks **industry-standard APM tools** and **comprehensive observability**. The platform has good foundations in logging and metrics collection but would benefit from professional monitoring tools for production reliability.

### Key Findings

✅ **Strengths:**

- Custom error logging system with database persistence
- Domain-specific SMS metrics tracking
- Structured logging package with correlation IDs
- Basic performance monitoring utilities
- Health check endpoints on both services

❌ **Gaps:**

- No external error tracking (Sentry, Bugsnag)
- No APM tools (New Relic, DataDog, Dynatrace)
- No Web Vitals tracking (CLS, FID, LCP)
- Limited database query performance monitoring
- No distributed tracing
- No uptime monitoring service

---

## 1. Error Tracking

### Current Implementation

#### ✅ Custom Error Logger Service

**Location:** `apps/web/src/lib/services/errorLogger.service.ts`

**Features:**

- Database-backed error logging to `error_logs` table
- Error categorization (brain_dump, API, database, validation, LLM, calendar)
- Severity levels (critical, error, warning, info)
- Rich context capture (user ID, project ID, request ID, browser info)
- LLM metadata tracking (provider, model, tokens, cost)
- Error resolution tracking with notes
- Aggregated error summaries and trends

**Specialized Error Types:**

```typescript
type ErrorType =
	| 'brain_dump_processing'
	| 'api_error'
	| 'database_error'
	| 'validation_error'
	| 'llm_error'
	| 'calendar_sync_error'
	| 'calendar_delete_error'
	| 'calendar_update_error'
	| 'unknown';
```

**Example Usage:**

```typescript
// Brain dump errors with LLM metadata
await errorLogger.logBrainDumpError(error, brainDumpId, {
	provider: 'openai',
	model: 'gpt-4',
	totalTokens: 1500
});

// Calendar errors with context
await errorLogger.logCalendarError(error, 'delete', taskId, userId, {
	calendarEventId: eventId,
	reason: 'Task completed'
});
```

**Admin Dashboard:**

- Error viewing and filtering: `apps/web/src/routes/admin/errors/+page.server.ts`
- API endpoints for error management: `apps/web/src/routes/api/admin/errors/+server.ts`

#### ✅ Error Boundary Component

**Location:** `apps/web/src/lib/components/ErrorBoundary.svelte`

**Features:**

- Graceful error UI fallback
- Optional error details display
- Reset functionality
- Integration with custom error reporter (extensible)

**Limitations:**

```javascript
// Expects global window.errorReporter (not implemented)
if (typeof window !== 'undefined' && (window as any).errorReporter) {
  (window as any).errorReporter.report(error, { component: name });
}
```

#### ✅ Server-Side Error Handling

**Web App:** `apps/web/src/hooks.server.ts`

```typescript
export const handleError: HandleServerError = ({ error, event }) => {
	const errorId = Math.random().toString(36).substr(2, 9);

	if (dev) {
		// Detailed logging in dev
		console.error(`[${errorId}] Server error:`, {
			message: error?.message,
			url: event.url.pathname,
			method: event.request.method,
			userId: event.locals.user?.id
		});
	} else {
		// Minimal logging in production
		console.error(`[${errorId}] Error on ${event.url.pathname}:`, error?.message);
	}

	return { message: error?.message || 'Something went wrong', errorId };
};
```

**Worker Service:** `apps/worker/src/index.ts`

```typescript
// Global error handlers for process-level errors
process.on('uncaughtException', (error) => {
	console.error('🚨 CRITICAL: Uncaught Exception', error);
	queue.stop();
	process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
	console.error('🚨 CRITICAL: Unhandled Rejection', reason);
	queue.stop();
	process.exit(1);
});
```

### ❌ Missing: External Error Tracking

**No implementation found for:**

- Sentry (most popular)
- Bugsnag
- Rollbar
- Raygun
- Airbrake

**Impact:**

- No centralized error dashboard across deployments
- No automatic error grouping/deduplication
- No release tracking and deploy markers
- No source map support for minified code
- No performance impact analysis
- No user session replay
- No stack trace enhancement

**Recommendation Priority:** **HIGH**

---

## 2. Logging

### Current Implementation

#### ✅ Shared Logging Package

**Location:** `packages/shared-utils/src/logging/`

**Features:**

- Structured logging with log levels (debug, info, warn, error, fatal)
- Context propagation (user IDs, correlation IDs, request IDs)
- Multiple outputs (console, database, HTTP)
- Child loggers for namespacing
- Environment-aware configuration
- Emoji categorization for visual scanning

**Architecture:**

```typescript
// Creating a logger
const logger = createLogger('worker:brief', supabase, {
	minLevel: 'info',
	enableConsole: true,
	enableDatabase: true,
	enableHttp: false,
	httpEndpoint: process.env.LOG_HTTP_URL,
	httpToken: process.env.LOG_HTTP_TOKEN
});

// Usage
logger.info('Processing brief', { userId, briefId });
logger.error('Brief failed', error, { userId }, { duration_ms: 1500 });
```

**Log Context Types:**

```typescript
interface LogContext {
	// User & entity IDs
	userId?: string;
	projectId?: string;
	brainDumpId?: string;
	taskId?: string;
	briefId?: string;
	notificationEventId?: string;
	notificationDeliveryId?: string;
	jobId?: string;

	// Request tracking
	requestId?: string;
	correlationId?: string;
	sessionId?: string;

	// Notification-specific
	eventType?: string;
	channel?: 'push' | 'email' | 'sms' | 'in_app';
}
```

**Database Logging:**

- Logs to `notification_logs` table for correlation tracking
- Supports querying logs by correlation ID, user ID, notification ID
- Useful for debugging notification flows across web and worker

**HTTP Logging (Extensible):**

- Ready for BetterStack, Axiom, Logtail, etc.
- Environment variables: `LOG_HTTP_URL`, `LOG_HTTP_TOKEN`
- Non-blocking async logging

#### ✅ Correlation ID Support

**Location:** `packages/shared-utils/src/logging/correlation.ts`

**Features:**

- Generate unique correlation IDs
- Create correlation context for distributed tracing
- Extract and inject correlation context across services

**Usage Pattern:**

```typescript
// Generate correlation ID
const correlationId = generateCorrelationId();

// Create context
const context = createCorrelationContext(correlationId, userId);

// Use in logger
logger.info('Processing request', context);
```

#### Console Logging Patterns

**Current State:** Heavy use of `console.log()` throughout codebase (321+ files)

**Examples:**

```typescript
// Worker
console.log(`📝 API: Queued brief for user ${userId}, job ${job.queue_job_id}`);
console.log(`🚀 Application starting...`);
console.log(`📊 Queue dashboard: http://localhost:${PORT}/queue/stats`);

// Web app
console.log(`[PerformanceMonitor] ${name}: ${duration.toFixed(2)}ms`);
console.error('Failed to log error to database:', insertError);
```

**Pros:**

- Easy to understand in development
- Emoji categorization for quick scanning

**Cons:**

- No log levels (can't filter production noise)
- No structured data for parsing
- Difficult to aggregate across services

### ❌ Missing: Dedicated Logging Infrastructure

**No implementation found for:**

- Winston (Node.js standard)
- Pino (high-performance JSON logger)
- Bunyan (structured logging)
- Log4js

**Impact:**

- No log rotation
- No log compression
- No log archival strategy
- Limited log filtering in production
- No automatic log shipping to aggregation services

**Recommendation Priority:** **MEDIUM**

---

## 3. Performance Monitoring

### Current Implementation

#### ✅ Custom Performance Monitor

**Location:** `apps/web/src/lib/utils/performance-monitor.ts`

**Features:**

- Timer-based performance tracking
- Memory snapshot collection (Chrome only)
- Threshold warnings for slow operations
- Performance summaries
- Monitor/monitorAsync wrapper functions

**Thresholds:**

```typescript
const thresholds: Record<string, number> = {
	'page-initialization': 3000, // 3 seconds
	'component-loading': 1000, // 1 second
	'store-operation': 500, // 500ms
	'data-loading': 2000, // 2 seconds
	navigation: 1500 // 1.5 seconds
};
```

**Usage:**

```typescript
// Manual timing
performanceMonitor.startTimer('data-fetch', { endpoint: '/api/projects' });
// ... operation ...
performanceMonitor.endTimer('data-fetch');

// Wrapper function
const result = await performanceMonitor.monitorAsync('brief-generation', async () =>
	generateBrief(userId)
);
```

**Memory Monitoring:**

```typescript
// Takes memory snapshot (Chrome performance.memory API)
performanceMonitor.takeMemorySnapshot('navigation', '/projects');

// Snapshot includes:
// - heapUsed
// - heapTotal
// - timestamp
// - url
// - action
```

**Activation:**

- Auto-enabled in development
- Manual enable in production via localStorage: `performance-monitor = true`

#### ✅ Performance Optimization Utilities

**Location:** `apps/web/src/lib/utils/performance-optimization.ts`

**Features:**

- Debounce/throttle functions
- Memoization utility
- Virtual scrolling helper
- Image lazy loading observer
- Bundle impact analyzer

**Example - Virtual Scrolling:**

```typescript
const scroller = createVirtualScroller(600, 50); // container 600px, items 50px
const { startIndex, endIndex } = scroller.getVisibleRange(scrollTop, 1000);
```

#### ✅ Component Optimization Utilities

**Location:** `apps/web/src/lib/utils/componentOptimization.ts`

**Features:**

- Lazy component loading patterns
- Intersection observer utilities
- Viewport detection

### ❌ Missing: APM Tools

**No implementation found for:**

- New Relic
- DataDog APM
- Dynatrace
- AppDynamics
- Elastic APM

**Impact:**

- No automatic transaction tracing
- No database query performance tracking
- No external API call monitoring
- No slow query detection
- No anomaly detection
- No baseline performance metrics

### ❌ Missing: Web Vitals Tracking

**No implementation found for:**

- Core Web Vitals (CLS, FID/INP, LCP)
- First Contentful Paint (FCP)
- Time to First Byte (TTFB)
- web-vitals library integration

**Impact:**

- No real user monitoring (RUM)
- No performance budgets
- No regression detection
- No Google Search ranking optimization

**Recommendation Priority:** **HIGH** for APM, **MEDIUM** for Web Vitals

---

## 4. Health Checks & Metrics

### Current Implementation

#### ✅ Worker Service Health Check

**Location:** `apps/worker/src/index.ts`
**Endpoint:** `GET /health`

**Response:**

```json
{
	"status": "healthy",
	"timestamp": "2025-10-23T12:00:00.000Z",
	"service": "daily-brief-worker",
	"queue": "supabase",
	"stats": {
		"pending": 5,
		"processing": 2,
		"completed": 1523,
		"failed": 12
	}
}
```

**Features:**

- Queue statistics with 5-second timeout
- Always returns healthy (resilient to stats failures)
- Railway/Docker ready

**Queue Stats Endpoint:**
**Endpoint:** `GET /queue/stats`

```json
{
	"stats": {
		"pending": 5,
		"processing": 2,
		"completed": 1523,
		"failed": 12,
		"delayed": 0,
		"active": 2
	}
}
```

**Stale Jobs Monitoring:**
**Endpoint:** `GET /queue/stale-stats?thresholdHours=24`

```json
{
	"thresholdHours": 24,
	"staleCount": 3,
	"stalePending": 2,
	"staleProcessing": 1,
	"message": "Found 3 stale job(s) that can be cleaned up"
}
```

#### ✅ Web App Health Check

**Location:** `apps/web/src/routes/api/health/+server.ts`
**Endpoint:** `GET /api/health`

**Response:**

```json
{
	"status": "ok",
	"timestamp": "2025-10-23T12:00:00.000Z",
	"authenticated": true,
	"userId": "uuid-here"
}
```

**Limitations:**

- Only checks auth state
- No database connectivity check
- No dependency health checks
- No memory/CPU metrics

#### ✅ SMS Metrics Service

**Location:** `packages/shared-utils/src/metrics/smsMetrics.service.ts`

**Comprehensive SMS monitoring:**

```typescript
interface SMSMetrics {
	// Operational metrics
	scheduled_count: number;
	sent_count: number;
	delivered_count: number;
	failed_count: number;
	cancelled_count: number;

	// Performance metrics
	avg_delivery_time_ms: number;
	avg_generation_time_ms: number;

	// Quality metrics
	llm_success_count: number;
	template_fallback_count: number;
	delivery_success_rate: number;
	llm_success_rate: number;

	// Cost metrics
	llm_cost_usd: number;
	sms_cost_usd: number;

	// User engagement
	opt_out_count: number;
	quiet_hours_skip_count: number;
	daily_limit_hit_count: number;
}
```

**Features:**

- Materialized views for fast dashboard queries
- Daily/hourly metric aggregation
- User-specific metrics tracking
- Cost tracking per user
- Delivery rate calculations
- LLM success rate monitoring

**API Endpoints:**

```
GET /api/sms/metrics/summary   - Overall summary
GET /api/sms/metrics/today     - Today's metrics
GET /api/sms/metrics/daily     - Daily breakdown
GET /api/sms/metrics/alerts    - Alert history
```

**Database Tables:**

- `sms_metrics` - Raw metric events
- `sms_metrics_daily` - Materialized view (refreshed hourly)
- `sms_alert_thresholds` - Alert configuration
- `sms_alert_history` - Alert tracking

### ❌ Missing: External Monitoring

**No implementation found for:**

- Uptime Robot
- Pingdom
- Better Uptime
- StatusCake
- Checkly

**Impact:**

- No external uptime monitoring
- No multi-region health checks
- No SSL certificate monitoring
- No status page for users
- No incident alerting

### ❌ Missing: Prometheus/Grafana

**No metrics exposition for:**

- Request rates
- Error rates
- Latency percentiles (p50, p95, p99)
- Database connection pool
- Memory/CPU usage
- Custom business metrics

**Recommendation Priority:** **MEDIUM** for external monitoring, **LOW** for Prometheus/Grafana

---

## 5. Database Monitoring

### Current Implementation

#### ✅ Supabase Client Configuration

**Location:** `packages/supabase-client/src/index.ts`

**Features:**

- Service role client (bypasses RLS for workers)
- Browser client (PKCE auth flow)
- Server client (cookie-based SSR)
- Clear documentation on when to use each

**Connection Pooling:**

- Managed by Supabase (PgBouncer)
- No custom connection pool configuration
- Auto-refresh tokens disabled for server/service clients

#### ✅ Query Performance Patterns

**RPC Functions for Performance:**

- `add_queue_job` - Atomic job insertion
- `claim_pending_jobs` - Batch job claiming
- `get_sms_daily_metrics` - Pre-aggregated metrics
- `refresh_sms_metrics_daily` - Materialized view refresh

**Materialized Views:**

- `sms_metrics_daily` - Pre-aggregated SMS metrics
- Refreshed hourly via scheduler

**Performance Documentation:**

- `apps/web/docs/technical/performance/projects-route-optimization-report.md`
- `apps/web/thoughts/shared/research/2025-09-18_00-55-35_expensive-queries-rpc-conversion.md`

### ❌ Missing: Query Performance Monitoring

**No implementation found for:**

- pg_stat_statements analysis
- Slow query logging
- Query execution time tracking
- Index usage monitoring
- Connection pool metrics
- Lock monitoring
- Vacuum/autovacuum tracking

**No tooling for:**

- Query EXPLAIN analysis
- Query plan visualization
- N+1 query detection
- Database load monitoring

**Recommendation Priority:** **MEDIUM**

---

## Monitoring Gaps Summary

### Critical Gaps (Implement First)

1. **External Error Tracking (Sentry)**
    - **Impact:** Production errors invisible without manual log review
    - **Effort:** 1-2 hours
    - **Value:** Immediate visibility into production issues

2. **APM Tool (New Relic/DataDog)**
    - **Impact:** No transaction tracing, slow query detection, or performance baselines
    - **Effort:** 4-8 hours
    - **Value:** Comprehensive performance insights

3. **Web Vitals Tracking**
    - **Impact:** No real user performance monitoring
    - **Effort:** 2-3 hours
    - **Value:** User experience metrics, SEO benefits

### Important Gaps (Implement Soon)

4. **Uptime Monitoring (Better Uptime)**
    - **Impact:** No external health checks or incident alerts
    - **Effort:** 1-2 hours
    - **Value:** Proactive downtime detection

5. **Enhanced Health Checks**
    - **Impact:** Limited visibility into service dependencies
    - **Effort:** 2-4 hours
    - **Value:** Better operational awareness

6. **Structured Logging Migration**
    - **Impact:** Difficult log aggregation and filtering
    - **Effort:** 4-8 hours
    - **Value:** Better debugging, easier log analysis

### Nice-to-Have Gaps (Future)

7. **Database Query Monitoring**
    - **Impact:** Slow queries undetected until user complaints
    - **Effort:** 4-6 hours
    - **Value:** Query optimization opportunities

8. **Prometheus + Grafana**
    - **Impact:** No custom metrics dashboards
    - **Effort:** 8-16 hours
    - **Value:** Custom visualization, historical trends

9. **Distributed Tracing (OpenTelemetry)**
    - **Impact:** Difficult to trace requests across web/worker boundary
    - **Effort:** 8-12 hours
    - **Value:** Full request lifecycle visibility

---

## Recommendations

### Phase 1: Quick Wins (Week 1)

**1. Add Sentry for Error Tracking**

```bash
# Install
pnpm add @sentry/sveltekit @sentry/node

# Web app: hooks.client.ts + hooks.server.ts
import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  integrations: [new Sentry.BrowserTracing()]
});

# Worker: index.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1
});
```

**2. Add Web Vitals Tracking**

```bash
# Install
pnpm add web-vitals

# Create: apps/web/src/lib/analytics/web-vitals.ts
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

function sendToAnalytics({ name, delta, id }) {
  // Send to analytics endpoint
  fetch('/api/analytics/vitals', {
    method: 'POST',
    body: JSON.stringify({ name, delta, id })
  });
}

getCLS(sendToAnalytics);
getFID(sendToAnalytics);
getFCP(sendToAnalytics);
getLCP(sendToAnalytics);
getTTFB(sendToAnalytics);
```

**3. Add Better Uptime Monitoring**

- Sign up: https://betteruptime.com
- Add monitors:
    - `https://build-os.com` (every 3 min)
    - `https://build-os.com/api/health` (every 5 min)
    - `https://worker.build-os.com/health` (every 5 min)
- Configure PagerDuty/Slack alerts

### Phase 2: Foundation (Week 2-3)

**4. Migrate to Structured Logging (Pino)**

```typescript
// Replace console.log with pino logger
import pino from 'pino';

const logger = pino({
	level: process.env.LOG_LEVEL || 'info',
	transport: {
		target: 'pino-pretty',
		options: { colorize: true }
	}
});

// Usage
logger.info({ userId, briefId }, 'Processing brief');
logger.error({ err, userId }, 'Brief generation failed');
```

**5. Enhanced Health Checks**

```typescript
// apps/web/src/routes/api/health/+server.ts
export const GET: RequestHandler = async ({ locals }) => {
	const health = {
		status: 'healthy',
		timestamp: new Date().toISOString(),
		checks: {
			database: await checkDatabase(),
			auth: await checkAuth(locals),
			storage: await checkStorage(),
			worker: await checkWorkerService()
		}
	};

	const allHealthy = Object.values(health.checks).every((c) => c.healthy);

	return json(health, {
		status: allHealthy ? 200 : 503
	});
};
```

**6. Add APM Tool**

**Option A: New Relic (Comprehensive)**

```bash
pnpm add newrelic

# newrelic.js config
# apps/web/newrelic.js
# apps/worker/newrelic.js
```

**Option B: DataDog (Best-in-class)**

```bash
pnpm add dd-trace

# Initialize early
require('dd-trace').init({
  service: 'buildos-web',
  env: process.env.NODE_ENV
});
```

### Phase 3: Advanced (Month 2)

**7. Database Query Monitoring**

```sql
-- Enable pg_stat_statements
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Query to find slow queries
SELECT
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;
```

**8. Custom Metrics Dashboard**

- Set up Prometheus exporters
- Create Grafana dashboards
- Track custom business metrics

**9. Distributed Tracing**

```typescript
// OpenTelemetry setup
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
	instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()]
});
```

---

## Cost Estimates

### Free Tier Options

- **Sentry:** 5K errors/month free
- **Better Uptime:** 10 monitors free
- **New Relic:** 100 GB/month free
- **DataDog:** 14-day trial, then paid

### Recommended Budget

**Starter (Months 1-3):**

- Sentry: $26/month (Team plan)
- Better Uptime: Free
- **Total: ~$30/month**

**Production (Months 4+):**

- Sentry: $26/month
- Better Uptime: $18/month (Pro)
- New Relic or DataDog: $100-300/month
- **Total: ~$150-350/month**

---

## Conclusion

BuildOS has **strong domain-specific monitoring** (SMS metrics, error logging) but lacks **industry-standard observability tools**. The platform is ready for production use but would significantly benefit from:

1. **Sentry** for error tracking (immediate need)
2. **APM tool** for performance insights (high value)
3. **Web Vitals** for user experience metrics (quick win)
4. **Uptime monitoring** for operational awareness (low effort, high value)

The custom monitoring infrastructure provides a solid foundation, but external tools will provide critical visibility, alerting, and debugging capabilities essential for production SaaS operations.

---

## Files Analyzed

### Error Tracking

- `apps/web/src/lib/services/errorLogger.service.ts`
- `apps/web/src/lib/types/error-logging.ts`
- `apps/web/src/lib/components/ErrorBoundary.svelte`
- `apps/web/src/hooks.server.ts`
- `apps/web/src/hooks.client.ts`
- `apps/web/src/routes/admin/errors/+page.server.ts`
- `apps/web/src/routes/api/admin/errors/+server.ts`

### Logging

- `packages/shared-utils/src/logging/logger.ts`
- `packages/shared-utils/src/logging/types.ts`
- `packages/shared-utils/src/logging/correlation.ts`
- `packages/shared-utils/src/logging/index.ts`

### Performance

- `apps/web/src/lib/utils/performance-monitor.ts`
- `apps/web/src/lib/utils/performance-optimization.ts`
- `apps/web/src/lib/utils/componentOptimization.ts`

### Health & Metrics

- `apps/worker/src/index.ts` (health endpoint)
- `apps/web/src/routes/api/health/+server.ts`
- `packages/shared-utils/src/metrics/smsMetrics.service.ts`
- `packages/shared-utils/src/metrics/smsAlerts.service.ts`
- `packages/shared-utils/src/metrics/types.ts`
- `apps/web/src/routes/api/sms/metrics/`

### Database

- `packages/supabase-client/src/index.ts`
- `apps/web/docs/technical/performance/projects-route-optimization-report.md`
