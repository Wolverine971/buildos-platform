#!/usr/bin/env tsx

/**
 * Generate monitoring and metrics documentation from Vercel Analytics and system configurations
 * Documents performance metrics, error tracking, and operational insights
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

interface MetricDefinition {
	name: string;
	description: string;
	type: 'counter' | 'gauge' | 'histogram' | 'timer';
	unit: string;
	source: 'vercel' | 'supabase' | 'openai' | 'custom';
	alertThresholds?: {
		warning: number;
		critical: number;
	};
}

interface Dashboard {
	name: string;
	description: string;
	metrics: string[];
	url?: string;
}

class MonitoringDocumentationGenerator {
	private readonly outputDir = 'docs/technical/deployment';
	private readonly metrics: MetricDefinition[] = [];
	private readonly dashboards: Dashboard[] = [];

	async generate(): Promise<void> {
		console.log('📊 Generating monitoring documentation...');
		await this.ensureOutputDirectory();
		await this.defineMetrics();
		await this.defineDashboards();
		await this.generateMonitoringOverview();
		await this.generateMetricsReference();
		await this.generateAlertsGuide();
		await this.generateRunbooks();

		console.log('✅ Generated monitoring documentation');
	}

	private async ensureOutputDirectory(): Promise<void> {
		if (!existsSync(this.outputDir)) {
			await mkdir(this.outputDir, { recursive: true });
		}

		const runbooksDir = join(this.outputDir, 'runbooks');
		if (!existsSync(runbooksDir)) {
			await mkdir(runbooksDir, { recursive: true });
		}
	}

	private defineMetrics(): void {
		this.metrics.push(
			// Performance Metrics
			{
				name: 'page_load_time',
				description: 'Time taken to load pages',
				type: 'histogram',
				unit: 'milliseconds',
				source: 'vercel',
				alertThresholds: { warning: 2000, critical: 5000 }
			},
			{
				name: 'core_web_vitals_lcp',
				description: 'Largest Contentful Paint - time to render largest content element',
				type: 'histogram',
				unit: 'milliseconds',
				source: 'vercel',
				alertThresholds: { warning: 2500, critical: 4000 }
			},
			{
				name: 'core_web_vitals_fid',
				description:
					'First Input Delay - time from first user interaction to browser response',
				type: 'histogram',
				unit: 'milliseconds',
				source: 'vercel',
				alertThresholds: { warning: 100, critical: 300 }
			},
			{
				name: 'core_web_vitals_cls',
				description: 'Cumulative Layout Shift - visual stability metric',
				type: 'gauge',
				unit: 'score',
				source: 'vercel',
				alertThresholds: { warning: 0.1, critical: 0.25 }
			},

			// Brain Dump Metrics
			{
				name: 'brain_dump_processing_time',
				description: 'Time taken to process a brain dump from start to completion',
				type: 'histogram',
				unit: 'seconds',
				source: 'custom',
				alertThresholds: { warning: 30, critical: 60 }
			},
			{
				name: 'brain_dump_success_rate',
				description: 'Percentage of brain dumps that complete successfully',
				type: 'gauge',
				unit: 'percentage',
				source: 'custom',
				alertThresholds: { warning: 95, critical: 90 }
			},
			{
				name: 'brain_dump_daily_count',
				description: 'Number of brain dumps processed per day',
				type: 'counter',
				unit: 'count',
				source: 'custom'
			},

			// OpenAI API Metrics
			{
				name: 'openai_api_latency',
				description: 'Response time for OpenAI API calls',
				type: 'histogram',
				unit: 'milliseconds',
				source: 'openai',
				alertThresholds: { warning: 10000, critical: 30000 }
			},
			{
				name: 'openai_token_usage',
				description: 'Total tokens consumed per request',
				type: 'histogram',
				unit: 'tokens',
				source: 'openai'
			},
			{
				name: 'openai_cost_daily',
				description: 'Daily spend on OpenAI API',
				type: 'counter',
				unit: 'dollars',
				source: 'openai',
				alertThresholds: { warning: 50, critical: 100 }
			},

			// Database Metrics
			{
				name: 'database_query_time',
				description: 'Average database query execution time',
				type: 'histogram',
				unit: 'milliseconds',
				source: 'supabase',
				alertThresholds: { warning: 1000, critical: 5000 }
			},
			{
				name: 'database_connection_count',
				description: 'Number of active database connections',
				type: 'gauge',
				unit: 'connections',
				source: 'supabase',
				alertThresholds: { warning: 80, critical: 95 }
			},
			{
				name: 'realtime_subscriptions',
				description: 'Number of active Supabase realtime subscriptions',
				type: 'gauge',
				unit: 'subscriptions',
				source: 'supabase'
			},

			// Calendar Integration Metrics
			{
				name: 'calendar_sync_success_rate',
				description: 'Percentage of successful calendar sync operations',
				type: 'gauge',
				unit: 'percentage',
				source: 'custom',
				alertThresholds: { warning: 98, critical: 95 }
			},
			{
				name: 'calendar_webhook_processing_time',
				description: 'Time to process incoming calendar webhooks',
				type: 'histogram',
				unit: 'milliseconds',
				source: 'custom',
				alertThresholds: { warning: 1000, critical: 5000 }
			},

			// Error Metrics
			{
				name: 'error_rate_4xx',
				description: 'Rate of 4xx client errors',
				type: 'gauge',
				unit: 'percentage',
				source: 'vercel',
				alertThresholds: { warning: 5, critical: 10 }
			},
			{
				name: 'error_rate_5xx',
				description: 'Rate of 5xx server errors',
				type: 'gauge',
				unit: 'percentage',
				source: 'vercel',
				alertThresholds: { warning: 1, critical: 5 }
			},

			// Business Metrics
			{
				name: 'daily_active_users',
				description: 'Number of users who performed any action in a day',
				type: 'gauge',
				unit: 'users',
				source: 'custom'
			},
			{
				name: 'project_creation_rate',
				description: 'Number of new projects created daily',
				type: 'counter',
				unit: 'projects',
				source: 'custom'
			},
			{
				name: 'user_retention_7day',
				description: '7-day user retention rate',
				type: 'gauge',
				unit: 'percentage',
				source: 'custom'
			}
		);
	}

	private defineDashboards(): void {
		this.dashboards.push(
			{
				name: 'Performance Overview',
				description: 'Core Web Vitals and page performance metrics',
				metrics: [
					'page_load_time',
					'core_web_vitals_lcp',
					'core_web_vitals_fid',
					'core_web_vitals_cls'
				],
				url: 'https://vercel.com/analytics'
			},
			{
				name: 'Brain Dump Analytics',
				description: 'Monitoring brain dump processing performance and success rates',
				metrics: [
					'brain_dump_processing_time',
					'brain_dump_success_rate',
					'brain_dump_daily_count'
				]
			},
			{
				name: 'OpenAI Usage',
				description: 'AI processing costs and performance',
				metrics: ['openai_api_latency', 'openai_token_usage', 'openai_cost_daily']
			},
			{
				name: 'Database Health',
				description: 'Supabase database performance and connections',
				metrics: [
					'database_query_time',
					'database_connection_count',
					'realtime_subscriptions'
				],
				url: 'https://supabase.com/dashboard/project/_/logs'
			},
			{
				name: 'Error Monitoring',
				description: 'Application errors and failure rates',
				metrics: ['error_rate_4xx', 'error_rate_5xx']
			},
			{
				name: 'Business Metrics',
				description: 'User engagement and product usage',
				metrics: ['daily_active_users', 'project_creation_rate', 'user_retention_7day']
			}
		);
	}

	private async generateMonitoringOverview(): Promise<void> {
		const content = `# BuildOS Monitoring & Observability

*Comprehensive monitoring setup for BuildOS performance, reliability, and business metrics*

## Overview

BuildOS uses a multi-layered monitoring approach to ensure system reliability and optimal user experience:

- **Performance**: Vercel Analytics for Core Web Vitals and page performance
- **Infrastructure**: Supabase monitoring for database and realtime performance
- **AI Processing**: OpenAI API usage and cost tracking
- **Business**: Custom metrics for user engagement and feature usage
- **Errors**: Comprehensive error tracking and alerting

## Quick Links

- [Vercel Analytics Dashboard](https://vercel.com/analytics) - Performance and Web Vitals
- [Supabase Dashboard](https://supabase.com/dashboard/project/_/logs) - Database and API logs
- [Metrics Reference](./metrics-reference.md) - Complete list of tracked metrics
- [Alerts Guide](./alerts-guide.md) - Alert thresholds and response procedures
- [Runbooks](./runbooks/) - Incident response procedures

## Key Performance Indicators (KPIs)

### User Experience
- **Page Load Time**: < 2s (warning), < 5s (critical)
- **Core Web Vitals**: LCP < 2.5s, FID < 100ms, CLS < 0.1
- **Error Rate**: < 1% server errors, < 5% client errors

### Feature Performance
- **Brain Dump Success Rate**: > 95%
- **Brain Dump Processing Time**: < 30s average
- **Calendar Sync Success**: > 98%

### Business Health
- **Daily Active Users**: Trending upward
- **7-day Retention**: > 40%
- **Project Creation Rate**: Consistent growth

### Cost Management
- **OpenAI Daily Cost**: < $50 (warning), < $100 (critical)
- **Supabase Usage**: Within plan limits

## Monitoring Stack

### 1. Vercel Analytics
- **Purpose**: Frontend performance monitoring
- **Metrics**: Core Web Vitals, page views, user sessions
- **Access**: Vercel dashboard
- **Cost**: Included with Vercel Pro plan

### 2. Vercel Speed Insights
- **Purpose**: Real User Monitoring (RUM)
- **Metrics**: Real-world performance data
- **Integration**: Built into SvelteKit app
- **Cost**: Included with Vercel Pro plan

### 3. Supabase Monitoring
- **Purpose**: Database and API monitoring
- **Metrics**: Query performance, connection counts, realtime subscriptions
- **Access**: Supabase dashboard
- **Cost**: Included with Supabase plan

### 4. Custom Application Metrics
- **Purpose**: Business and feature-specific metrics
- **Implementation**: Custom tracking in application code
- **Storage**: Supabase database tables
- **Visualization**: Custom dashboards

## Dashboards

${this.dashboards
	.map(
		(dashboard) => `### ${dashboard.name}

${dashboard.description}

**Metrics**: ${dashboard.metrics.join(', ')}
${dashboard.url ? `**URL**: ${dashboard.url}` : ''}
`
	)
	.join('\n')}

## Alert Channels

### Critical Alerts
- **Email**: team@buildos.com
- **Slack**: #alerts channel
- **Response Time**: 15 minutes

### Warning Alerts
- **Email**: Daily digest
- **Slack**: #monitoring channel
- **Response Time**: 2 hours

## Incident Response

1. **Detection**: Automated alerts trigger notification
2. **Assessment**: On-call engineer assesses severity
3. **Response**: Follow appropriate runbook procedure
4. **Resolution**: Fix implemented and verified
5. **Post-Mortem**: Document lessons learned

## Monitoring Best Practices

1. **Proactive Monitoring**: Set alerts before issues impact users
2. **Meaningful Alerts**: Only alert on actionable issues
3. **Baseline Establishment**: Track normal operating ranges
4. **Regular Review**: Weekly monitoring health checks
5. **Documentation**: Keep runbooks updated

---

*Last updated: ${new Date().toISOString()}*
*Monitored metrics: ${this.metrics.length}*
*Active dashboards: ${this.dashboards.length}*
`;

		await writeFile(join(this.outputDir, 'monitoring.md'), content);
	}

	private async generateMetricsReference(): Promise<void> {
		const groupedMetrics = this.groupMetricsBySource();

		const content = `# Metrics Reference

*Complete reference for all BuildOS monitoring metrics*

## Metrics by Source

${Object.entries(groupedMetrics)
	.map(([source, metrics]) => {
		const sourceTitle = source.charAt(0).toUpperCase() + source.slice(1);
		return `### ${sourceTitle} Metrics

| Metric | Type | Unit | Description | Warning | Critical |
|--------|------|------|-------------|---------|----------|
${metrics
	.map((m) => {
		const warning = m.alertThresholds?.warning || '-';
		const critical = m.alertThresholds?.critical || '-';
		return `| ${m.name} | ${m.type} | ${m.unit} | ${m.description} | ${warning} | ${critical} |`;
	})
	.join('\n')}
`;
	})
	.join('\n')}

## Metric Types

### Counter
Metrics that only increase over time (e.g., total requests, errors).

### Gauge
Metrics that can go up and down (e.g., memory usage, active connections).

### Histogram
Metrics that track distribution of values (e.g., response times, request sizes).

### Timer
Metrics that measure duration (e.g., processing time, latency).

## Collection Methods

### Vercel Analytics
- **Collection**: Automatic via Vercel platform
- **Retention**: 30 days (Pro plan)
- **Export**: CSV download available
- **API**: Vercel Analytics API for programmatic access

### Supabase Monitoring
- **Collection**: Built-in to Supabase platform
- **Retention**: Based on plan (up to 30 days)
- **Access**: Dashboard and SQL queries
- **API**: Supabase Management API

### Custom Application Metrics
- **Collection**: Manual instrumentation in code
- **Storage**: Supabase database tables
- **Retention**: Indefinite (managed by us)
- **Query**: SQL via Supabase client

## Implementation Examples

### Tracking Brain Dump Success Rate

\`\`\`typescript
// In brain dump processing service
async function processBrainDump(input: string) {
  const startTime = Date.now();

  try {
    const result = await processWithAI(input);

    // Record success
    await recordMetric('brain_dump_success_rate', 1);
    await recordMetric('brain_dump_processing_time', Date.now() - startTime);

    return result;
  } catch (error) {
    // Record failure
    await recordMetric('brain_dump_success_rate', 0);
    throw error;
  }
}
\`\`\`

### Tracking OpenAI Usage

\`\`\`typescript
// In OpenAI service wrapper
async function callOpenAI(prompt: string) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }]
  });

  // Record usage metrics
  const tokens = response.usage?.total_tokens || 0;
  const cost = calculateCost(tokens, 'gpt-4');

  await recordMetric('openai_token_usage', tokens);
  await recordMetric('openai_cost_daily', cost);

  return response;
}
\`\`\`

### Custom Metric Recording

\`\`\`typescript
// Utility function for recording metrics
async function recordMetric(
  metricName: string,
  value: number,
  tags?: Record<string, string>
) {
  await supabase
    .from('metrics')
    .insert({
      name: metricName,
      value,
      tags,
      timestamp: new Date().toISOString()
    });
}
\`\`\`

## Query Examples

### Daily Brain Dump Volume

\`\`\`sql
SELECT
  date_trunc('day', timestamp) as date,
  count(*) as brain_dumps
FROM metrics
WHERE name = 'brain_dump_daily_count'
  AND timestamp >= current_date - interval '30 days'
GROUP BY date_trunc('day', timestamp)
ORDER BY date;
\`\`\`

### Average Processing Time by Day

\`\`\`sql
SELECT
  date_trunc('day', timestamp) as date,
  avg(value) as avg_processing_time_ms
FROM metrics
WHERE name = 'brain_dump_processing_time'
  AND timestamp >= current_date - interval '7 days'
GROUP BY date_trunc('day', timestamp)
ORDER BY date;
\`\`\`

---

*Total metrics: ${this.metrics.length}*
*Last updated: ${new Date().toISOString()}*
`;

		await writeFile(join(this.outputDir, 'metrics-reference.md'), content);
	}

	private groupMetricsBySource(): Record<string, MetricDefinition[]> {
		const grouped: Record<string, MetricDefinition[]> = {};

		for (const metric of this.metrics) {
			if (!grouped[metric.source]) {
				grouped[metric.source] = [];
			}
			grouped[metric.source].push(metric);
		}

		return grouped;
	}

	private async generateAlertsGuide(): Promise<void> {
		const alertingMetrics = this.metrics.filter((m) => m.alertThresholds);

		const content = `# Alerts Guide

*Alert thresholds, escalation procedures, and response guidelines*

## Alert Severity Levels

### Critical (P0)
- **Response Time**: 15 minutes
- **Escalation**: Immediate phone/SMS notification
- **Impact**: Service completely unavailable or severely degraded
- **Examples**: 5xx error rate > 5%, brain dump success rate < 90%

### Warning (P1)
- **Response Time**: 2 hours during business hours
- **Escalation**: Email and Slack notification
- **Impact**: Performance degraded but service functional
- **Examples**: Page load time > 2s, OpenAI cost > $50/day

## Alerting Metrics

${alertingMetrics
	.map(
		(m) => `### ${m.name}

**Description**: ${m.description}
**Warning Threshold**: ${m.alertThresholds!.warning} ${m.unit}
**Critical Threshold**: ${m.alertThresholds!.critical} ${m.unit}
**Response**: See [${m.name} runbook](./runbooks/${m.name.replace(/_/g, '-')}.md)
`
	)
	.join('\n')}

## Alert Channels

### Slack Integration
- **Channel**: #alerts (critical), #monitoring (warnings)
- **Bot**: BuildOS Monitor Bot
- **Format**: Structured alert messages with context

### Email Notifications
- **Recipients**: team@buildos.com, on-call engineer
- **Format**: Detailed alert with links to dashboards
- **Frequency**: Immediate for critical, daily digest for warnings

### Webhook Integration
- **Endpoint**: /api/webhooks/alerts
- **Purpose**: Custom alert handling and escalation
- **Security**: HMAC signature validation

## Alert Response Procedures

### 1. Alert Received
- Check alert severity and affected systems
- Verify alert legitimacy (not false positive)
- Acknowledge alert to stop escalation

### 2. Initial Assessment (5 minutes)
- Check system dashboards for current state
- Identify potential root cause
- Determine if immediate action required

### 3. Investigation (15 minutes)
- Follow appropriate runbook procedure
- Gather additional context from logs
- Identify scope of impact

### 4. Resolution
- Implement fix based on runbook
- Monitor metrics for improvement
- Update stakeholders on progress

### 5. Post-Incident
- Document timeline and resolution
- Update runbooks if needed
- Schedule post-mortem if critical

## Alert Suppression

### Planned Maintenance
- Suppress alerts during scheduled maintenance
- Notify team in advance
- Document maintenance window

### False Positives
- Investigate root cause of false alert
- Adjust thresholds if necessary
- Update alert logic

### Noise Reduction
- Group related alerts together
- Implement alert dependencies
- Use intelligent alerting windows

## Escalation Matrix

| Time | Action | Contact |
|------|--------|---------|
| 0 min | Initial alert | On-call engineer |
| 15 min | No response | Engineering manager |
| 30 min | No resolution | CTO |
| 60 min | Major incident | All stakeholders |

## Common Alert Scenarios

### High Error Rate
1. Check Vercel function logs
2. Verify database connectivity
3. Check third-party service status
4. Implement circuit breaker if needed

### Slow Response Times
1. Check database query performance
2. Verify OpenAI API latency
3. Check Vercel function cold starts
4. Scale resources if needed

### OpenAI Cost Spike
1. Check usage patterns for anomalies
2. Verify no runaway processes
3. Implement rate limiting if needed
4. Consider model downgrade temporarily

### Database Connection Issues
1. Check Supabase dashboard
2. Verify connection pool settings
3. Check for long-running queries
4. Restart connections if needed

## Alert Testing

### Monthly Tests
- Verify alert delivery to all channels
- Test escalation procedures
- Confirm runbook accuracy
- Update contact information

### Alert Simulation
\`\`\`bash
# Test critical alert
curl -X POST /api/test/alert \\
  -H "Content-Type: application/json" \\
  -d '{"severity": "critical", "metric": "error_rate_5xx"}'

# Test warning alert
curl -X POST /api/test/alert \\
  -H "Content-Type: application/json" \\
  -d '{"severity": "warning", "metric": "page_load_time"}'
\`\`\`

---

*Alert-enabled metrics: ${alertingMetrics.length}*
*Last updated: ${new Date().toISOString()}*
`;

		await writeFile(join(this.outputDir, 'alerts-guide.md'), content);
	}

	private async generateRunbooks(): Promise<void> {
		const runbooks = [
			{
				name: 'incident-response',
				title: 'Incident Response',
				content: this.generateIncidentResponseRunbook()
			},
			{
				name: 'database-recovery',
				title: 'Database Recovery',
				content: this.generateDatabaseRecoveryRunbook()
			},
			{
				name: 'performance-issues',
				title: 'Performance Issues',
				content: this.generatePerformanceIssuesRunbook()
			},
			{
				name: 'openai-api-issues',
				title: 'OpenAI API Issues',
				content: this.generateOpenAIIssuesRunbook()
			},
			{
				name: 'calendar-sync-failures',
				title: 'Calendar Sync Failures',
				content: this.generateCalendarSyncRunbook()
			}
		];

		for (const runbook of runbooks) {
			const filePath = join(this.outputDir, 'runbooks', `${runbook.name}.md`);
			await writeFile(filePath, runbook.content);
		}

		// Generate runbooks index
		const indexContent = `# Operational Runbooks

*Step-by-step procedures for common operational issues*

## Available Runbooks

${runbooks.map((r) => `- [${r.title}](./${r.name}.md) - Procedures for handling ${r.title.toLowerCase()}`).join('\n')}

## Using Runbooks

1. **Identify the Issue**: Use monitoring dashboards to understand the problem
2. **Select Runbook**: Choose the most relevant runbook based on symptoms
3. **Follow Steps**: Execute steps in order, documenting actions taken
4. **Escalate if Needed**: Contact next level if issue persists
5. **Post-Incident**: Update runbook with lessons learned

## Runbook Maintenance

- Review quarterly for accuracy
- Update after incidents with new learnings
- Test procedures during maintenance windows
- Keep contact information current

---

*Last updated: ${new Date().toISOString()}*
`;

		await writeFile(join(this.outputDir, 'runbooks', 'README.md'), indexContent);
	}

	private generateIncidentResponseRunbook(): string {
		return `# Incident Response Runbook

## Overview
This runbook provides step-by-step procedures for responding to critical incidents in BuildOS.

## Severity Classification

### P0 - Critical
- Service completely unavailable
- Data loss or corruption
- Security breach
- Response time: 15 minutes

### P1 - High
- Major functionality unavailable
- Significant performance degradation
- Response time: 2 hours

### P2 - Medium
- Minor functionality issues
- Some users affected
- Response time: Next business day

## Response Procedures

### 1. Incident Detection (0-5 minutes)
- [ ] Alert received via monitoring system
- [ ] Verify incident legitimacy
- [ ] Classify severity level
- [ ] Create incident ticket in GitHub Issues

### 2. Initial Response (5-15 minutes)
- [ ] Acknowledge alert to stop escalation
- [ ] Notify team via Slack #alerts channel
- [ ] Begin investigation using relevant runbook
- [ ] Document timeline in incident ticket

### 3. Investigation (15-30 minutes)
- [ ] Check system dashboards for anomalies
- [ ] Review recent deployments or changes
- [ ] Examine error logs and metrics
- [ ] Identify root cause or immediate workaround

### 4. Resolution
- [ ] Implement fix or workaround
- [ ] Monitor metrics for improvement
- [ ] Verify fix with affected functionality
- [ ] Update incident ticket with resolution

### 5. Communication
- [ ] Update stakeholders on status
- [ ] Communicate resolution to users if needed
- [ ] Schedule post-mortem for P0/P1 incidents

### 6. Post-Incident
- [ ] Complete incident timeline
- [ ] Conduct post-mortem meeting
- [ ] Update runbooks and documentation
- [ ] Implement preventive measures

## Contact Information

### On-Call Rotation
- **Primary**: Engineering team rotation
- **Secondary**: Engineering manager
- **Escalation**: CTO

### External Contacts
- **Vercel Support**: Via dashboard
- **Supabase Support**: Via dashboard
- **OpenAI Support**: platform.openai.com/support

## Common Commands

### Check system status
\`\`\`bash
# Check Vercel deployment status
vercel ls --scope=buildos

# Check database connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"
\`\`\`

### Emergency procedures
\`\`\`bash
# Rollback latest deployment
vercel rollback --yes

# Restart all functions
vercel env ls
\`\`\`

---

*Last updated: ${new Date().toISOString()}*
`;
	}

	private generateDatabaseRecoveryRunbook(): string {
		return `# Database Recovery Runbook

## Overview
Procedures for recovering from database-related incidents in BuildOS.

## Common Database Issues

### Connection Exhaustion
**Symptoms**: "too many connections" errors, slow queries
**Investigation**:
- [ ] Check connection count in Supabase dashboard
- [ ] Review connection pool settings
- [ ] Identify long-running queries

**Resolution**:
- [ ] Kill long-running queries if safe
- [ ] Restart application to reset connection pool
- [ ] Increase connection limits if needed

### Slow Query Performance
**Symptoms**: High database query times, timeouts
**Investigation**:
- [ ] Check slow query log in Supabase
- [ ] Analyze query execution plans
- [ ] Check for missing indexes

**Resolution**:
- [ ] Add missing indexes
- [ ] Optimize problematic queries
- [ ] Consider query caching

### RLS Policy Issues
**Symptoms**: Permission denied errors, unexpected data access
**Investigation**:
- [ ] Review recent RLS policy changes
- [ ] Test policies with affected user roles
- [ ] Check auth token validity

**Resolution**:
- [ ] Fix RLS policy configuration
- [ ] Update application auth handling
- [ ] Verify user permissions

## Recovery Procedures

### Point-in-Time Recovery
1. **Assessment**:
   - [ ] Determine extent of data loss
   - [ ] Identify recovery point objective (RPO)
   - [ ] Check available backups in Supabase

2. **Recovery**:
   - [ ] Create new database from backup
   - [ ] Update connection strings
   - [ ] Verify data integrity
   - [ ] Resume normal operations

### Schema Migration Issues
1. **Rollback**:
   - [ ] Identify problematic migration
   - [ ] Create rollback migration
   - [ ] Test rollback in staging
   - [ ] Execute rollback in production

2. **Data Repair**:
   - [ ] Assess data corruption
   - [ ] Write repair scripts
   - [ ] Execute with caution
   - [ ] Verify data consistency

## Monitoring Queries

\`\`\`sql
-- Check active connections
SELECT count(*) FROM pg_stat_activity;

-- Find slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check table sizes
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
\`\`\`

## Prevention

- Regular backup verification
- Monitor query performance
- Implement connection pooling
- Use appropriate indexes
- Regular database maintenance

---

*Last updated: ${new Date().toISOString()}*
`;
	}

	private generatePerformanceIssuesRunbook(): string {
		return `# Performance Issues Runbook

## Overview
Procedures for diagnosing and resolving performance issues in BuildOS.

## Performance Monitoring

### Key Metrics to Check
- [ ] Page load times via Vercel Analytics
- [ ] Core Web Vitals (LCP, FID, CLS)
- [ ] API response times
- [ ] Database query performance
- [ ] OpenAI API latency

### Tools and Dashboards
- Vercel Analytics dashboard
- Vercel Speed Insights
- Supabase performance tab
- Browser DevTools Performance tab

## Common Performance Issues

### Slow Page Loads
**Symptoms**: Page load times > 2 seconds
**Investigation**:
- [ ] Check Vercel function cold starts
- [ ] Analyze bundle size and loading
- [ ] Review database query performance
- [ ] Check third-party API calls

**Resolution**:
- [ ] Optimize bundle size with code splitting
- [ ] Implement caching strategies
- [ ] Optimize database queries
- [ ] Add loading states and lazy loading

### High Core Web Vitals
**Symptoms**: LCP > 2.5s, FID > 100ms, CLS > 0.1
**Investigation**:
- [ ] Identify largest contentful paint element
- [ ] Check for layout shifts
- [ ] Measure input delay sources

**Resolution**:
- [ ] Optimize images and fonts
- [ ] Preload critical resources
- [ ] Fix layout shift causes
- [ ] Optimize JavaScript execution

### Database Performance
**Symptoms**: Slow queries, high response times
**Investigation**:
- [ ] Check query execution plans
- [ ] Review missing indexes
- [ ] Analyze query patterns

**Resolution**:
- [ ] Add appropriate indexes
- [ ] Optimize query structure
- [ ] Implement query caching
- [ ] Consider read replicas

### OpenAI API Latency
**Symptoms**: Brain dump processing > 30 seconds
**Investigation**:
- [ ] Check OpenAI API status
- [ ] Review prompt size and complexity
- [ ] Analyze token usage patterns

**Resolution**:
- [ ] Optimize prompt engineering
- [ ] Implement request batching
- [ ] Add timeout handling
- [ ] Consider model alternatives

## Optimization Techniques

### Frontend Optimization
\`\`\`javascript
// Code splitting
const LazyComponent = lazy(() => import('./HeavyComponent.svelte'));

// Image optimization
<img src="/api/image?url={imageUrl}&w=800&q=75" alt="Optimized" />

// Preload critical resources
<link rel="preload" href="/critical.css" as="style" />
\`\`\`

### API Optimization
\`\`\`typescript
// Response caching
export async function GET({ setHeaders }) {
  setHeaders({
    'cache-control': 'max-age=300' // 5 minutes
  });
  // ...
}

// Database query optimization
const projects = await supabase
  .from('projects')
  .select('id, name, description') // Only needed fields
  .limit(20)
  .order('created_at', { ascending: false });
\`\`\`

## Performance Testing

### Load Testing
\`\`\`bash
# Using wrk for load testing
wrk -t12 -c400 -d30s https://buildos.com/api/projects

# Using curl for API testing
curl -w "@curl-format.txt" -o /dev/null -s https://buildos.com/api/brain-dumps
\`\`\`

### Monitoring Setup
\`\`\`typescript
// Performance monitoring in app
import { trackWebVital } from '$lib/analytics';

trackWebVital('LCP', (metric) => {
  console.log('LCP:', metric.value);
});
\`\`\`

## Escalation Criteria

- Page load times consistently > 5 seconds
- Core Web Vitals failing for > 25% of users
- API response times > 10 seconds
- Database query times > 5 seconds
- User complaints about performance

---

*Last updated: ${new Date().toISOString()}*
`;
	}

	private generateOpenAIIssuesRunbook(): string {
		return `# OpenAI API Issues Runbook

## Overview
Procedures for handling OpenAI API-related issues in BuildOS brain dump processing.

## Common Issues

### API Rate Limiting
**Symptoms**: HTTP 429 errors, "rate limit exceeded"
**Investigation**:
- [ ] Check OpenAI dashboard for usage limits
- [ ] Review recent request volume
- [ ] Identify request patterns

**Resolution**:
- [ ] Implement exponential backoff
- [ ] Add request queuing
- [ ] Consider upgrading API plan
- [ ] Optimize request frequency

### High Latency
**Symptoms**: Brain dump processing > 30 seconds
**Investigation**:
- [ ] Check OpenAI API status page
- [ ] Analyze prompt length and complexity
- [ ] Review model choice (GPT-4 vs GPT-3.5)

**Resolution**:
- [ ] Optimize prompt engineering
- [ ] Switch to faster model if appropriate
- [ ] Implement timeout handling
- [ ] Add progress indicators

### Cost Spikes
**Symptoms**: Daily costs > $50, unexpected usage
**Investigation**:
- [ ] Check token usage patterns
- [ ] Review recent brain dump volume
- [ ] Identify potential runaway processes

**Resolution**:
- [ ] Implement usage caps
- [ ] Add cost monitoring alerts
- [ ] Optimize prompts for efficiency
- [ ] Consider model downgrade

### API Errors
**Symptoms**: HTTP 4xx/5xx errors from OpenAI
**Investigation**:
- [ ] Check error response details
- [ ] Verify API key validity
- [ ] Review request format

**Resolution**:
- [ ] Fix request formatting
- [ ] Implement proper error handling
- [ ] Add retry logic with backoff
- [ ] Update API keys if needed

## Monitoring Commands

\`\`\`bash
# Check recent OpenAI usage
curl -H "Authorization: Bearer $OPENAI_API_KEY" \\
  https://api.openai.com/v1/usage

# Test API connectivity
curl -H "Authorization: Bearer $OPENAI_API_KEY" \\
  https://api.openai.com/v1/models
\`\`\`

## Error Handling Implementation

\`\`\`typescript
async function callOpenAIWithRetry(prompt: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        timeout: 30000 // 30 second timeout
      });

      return response;
    } catch (error) {
      if (error.status === 429 && attempt < maxRetries) {
        // Rate limit - exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (error.status >= 500 && attempt < maxRetries) {
        // Server error - retry
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      throw error;
    }
  }
}
\`\`\`

## Cost Optimization

### Token Usage Optimization
- Use shorter, more focused prompts
- Implement prompt caching where possible
- Consider GPT-3.5-turbo for simpler tasks
- Remove unnecessary context from prompts

### Usage Monitoring
\`\`\`typescript
// Track usage per request
interface OpenAIMetrics {
  tokens: number;
  cost: number;
  latency: number;
  model: string;
}

async function trackOpenAIUsage(metrics: OpenAIMetrics) {
  await supabase.from('ai_usage_metrics').insert({
    tokens: metrics.tokens,
    cost: metrics.cost,
    latency: metrics.latency,
    model: metrics.model,
    timestamp: new Date().toISOString()
  });
}
\`\`\`

## Fallback Strategies

### Model Degradation
1. GPT-4 (primary) → GPT-3.5-turbo (fallback)
2. Reduce prompt complexity
3. Break down complex requests

### Alternative Processing
1. Queue requests for later processing
2. Provide partial results
3. Allow manual intervention

## Emergency Procedures

### API Outage
- [ ] Check OpenAI status page
- [ ] Enable maintenance mode for brain dumps
- [ ] Queue requests for later processing
- [ ] Communicate to users via status page

### Cost Emergency
- [ ] Implement immediate usage caps
- [ ] Switch to cheaper model
- [ ] Disable non-essential AI features
- [ ] Alert finance team

---

*Last updated: ${new Date().toISOString()}*
`;
	}

	private generateCalendarSyncRunbook(): string {
		return `# Calendar Sync Failures Runbook

## Overview
Procedures for diagnosing and fixing Google Calendar integration issues.

## Common Issues

### Authentication Failures
**Symptoms**: OAuth errors, expired tokens
**Investigation**:
- [ ] Check Google OAuth token expiry
- [ ] Verify client credentials
- [ ] Review recent permission changes

**Resolution**:
- [ ] Refresh OAuth tokens
- [ ] Re-authenticate user if needed
- [ ] Update client credentials
- [ ] Check OAuth scopes

### Webhook Failures
**Symptoms**: Missing calendar updates, sync delays
**Investigation**:
- [ ] Check webhook endpoint status
- [ ] Review webhook registration
- [ ] Verify HMAC signatures

**Resolution**:
- [ ] Re-register webhooks
- [ ] Fix endpoint issues
- [ ] Update webhook URLs
- [ ] Verify SSL certificates

### Sync Inconsistencies
**Symptoms**: Events missing or duplicated
**Investigation**:
- [ ] Compare BuildOS vs Google Calendar
- [ ] Check sync timestamps
- [ ] Review conflict resolution

**Resolution**:
- [ ] Perform full resync
- [ ] Fix conflict resolution logic
- [ ] Update sync algorithms
- [ ] Clean up duplicates

### Rate Limiting
**Symptoms**: HTTP 429 from Google Calendar API
**Investigation**:
- [ ] Check API quota usage
- [ ] Review request patterns
- [ ] Identify quota limits

**Resolution**:
- [ ] Implement request batching
- [ ] Add exponential backoff
- [ ] Optimize API calls
- [ ] Request quota increase

## Diagnostic Commands

\`\`\`bash
# Test Google Calendar API
curl -H "Authorization: Bearer $GOOGLE_ACCESS_TOKEN" \\
  "https://www.googleapis.com/calendar/v3/calendars/primary"

# Check webhook status
curl -X GET "https://buildos.com/api/webhooks/calendar/status"
\`\`\`

## Sync Recovery Procedures

### Full Resync
\`\`\`typescript
// Force full calendar resync
async function performFullResync(userId: string, projectId: string) {
  // 1. Get all events from Google Calendar
  const googleEvents = await getGoogleCalendarEvents(projectId);

  // 2. Get all tasks from BuildOS
  const buildosTasks = await getBuildOSTasks(projectId);

  // 3. Compare and reconcile
  const reconciliation = compareEvents(googleEvents, buildosTasks);

  // 4. Apply changes
  await applyReconciliation(reconciliation);

  // 5. Update sync timestamp
  await updateLastSyncTime(projectId);
}
\`\`\`

### Webhook Re-registration
\`\`\`typescript
// Re-register calendar webhooks
async function reregisterWebhooks(calendarId: string) {
  // 1. Stop existing webhook
  await stopCalendarWebhook(calendarId);

  // 2. Create new webhook
  const webhook = await google.calendar('v3').events.watch({
    calendarId,
    requestBody: {
      id: generateWebhookId(),
      type: 'web_hook',
      address: 'https://buildos.com/api/webhooks/calendar'
    }
  });

  // 3. Store webhook details
  await storeWebhookDetails(webhook.data);
}
\`\`\`

## Error Handling

### Authentication Errors
\`\`\`typescript
async function handleCalendarAuth(error: any, userId: string) {
  if (error.code === 401) {
    // Token expired - refresh
    const newTokens = await refreshGoogleTokens(userId);
    if (newTokens) {
      return retry();
    } else {
      // Need re-authentication
      await markCalendarDisconnected(userId);
      await notifyUserReauth(userId);
    }
  }
}
\`\`\`

### Rate Limiting
\`\`\`typescript
async function handleRateLimit(error: any) {
  if (error.code === 429) {
    const retryAfter = error.headers['retry-after'] || 60;
    await delay(retryAfter * 1000);
    return retry();
  }
}
\`\`\`

## Monitoring

### Sync Health Checks
- Daily sync success rate > 98%
- Webhook delivery success > 99%
- Authentication failure rate < 1%
- Average sync latency < 30 seconds

### Alert Conditions
- Sync failures > 5% for 10 minutes
- Webhook delivery failures > 10 in 5 minutes
- Authentication failures > 3 for single user
- Sync latency > 60 seconds average

## Prevention

### Regular Maintenance
- Monitor API quota usage
- Refresh tokens before expiry
- Validate webhook endpoints
- Clean up orphaned data

### Best Practices
- Implement proper error handling
- Use exponential backoff for retries
- Log all sync operations
- Provide user feedback on sync status

---

*Last updated: ${new Date().toISOString()}*
`;
	}
}

async function main() {
	const generator = new MonitoringDocumentationGenerator();
	await generator.generate();
}

if (require.main === module) {
	main().catch(console.error);
}
