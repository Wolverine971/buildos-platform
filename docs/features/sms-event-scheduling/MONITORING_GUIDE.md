# SMS Event Scheduling - Monitoring & Alerting Guide

**Phase:** 6.2 (Monitoring & Metrics)
**Status:** ✅ Complete
**Last Updated:** 2025-10-08

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Setup Guide](#setup-guide)
- [Metrics Reference](#metrics-reference)
- [Alert Configuration](#alert-configuration)
- [API Endpoints](#api-endpoints)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

---

## Overview

The SMS Event Scheduling monitoring system provides comprehensive observability through:

- **Metrics Collection**: Operational, performance, quality, and cost metrics
- **Alert System**: Threshold-based alerting for critical failures
- **Dashboard APIs**: RESTful endpoints for building monitoring dashboards
- **Multi-channel Notifications**: Slack, PagerDuty, and Email integration

### Key Features

- ✅ Non-blocking metrics tracking (doesn't disrupt core SMS functionality)
- ✅ Materialized views for fast dashboard queries
- ✅ Configurable alert thresholds with cooldown periods
- ✅ Hourly automated monitoring and view refresh
- ✅ Historical metrics and alert tracking
- ✅ User-level and system-wide metrics

---

## Architecture

### Data Flow

```
SMS Workers → Metrics Service → Database → Materialized View
                    ↓
              Metrics API → Dashboard
                    ↓
         Alerts Service → Notification Channels
```

### Components

1. **SMSMetricsService** (`apps/worker/src/lib/services/smsMetrics.service.ts`)
   - Records metrics to `sms_metrics` table
   - Aggregates data via materialized views
   - Provides query methods for dashboard

2. **SMSAlertsService** (`apps/worker/src/lib/services/smsAlerts.service.ts`)
   - Checks thresholds against current metrics
   - Sends notifications via Slack/PagerDuty/Email
   - Manages alert history and resolution

3. **Scheduler** (`apps/worker/src/scheduler.ts`)
   - Runs hourly alert checks
   - Refreshes materialized views
   - Logs results for audit trail

4. **API Endpoints** (`apps/web/src/routes/api/sms/metrics/`)
   - Exposes metrics to frontend
   - Provides alert management interface

---

## Setup Guide

### 1. Database Migration

The metrics system requires a database migration. Ensure it's been applied:

```bash
# Check if migration exists
psql $DATABASE_URL -c "SELECT * FROM sms_metrics LIMIT 1;"

# If not applied, run migration
psql $DATABASE_URL < apps/web/supabase/migrations/20251008_sms_metrics_monitoring.sql
```

**Migration includes:**

- `sms_metrics` table
- `sms_metrics_daily` materialized view
- `sms_alert_thresholds` table with defaults
- `sms_alert_history` table
- RPC functions for atomic operations

### 2. Environment Variables

Add notification channel credentials to your `.env`:

```bash
# Slack Integration (recommended for warnings)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# PagerDuty Integration (recommended for critical alerts)
PAGERDUTY_INTEGRATION_KEY=your_pagerduty_integration_key

# Email notifications (future enhancement)
# SMTP_HOST=smtp.gmail.com
# SMTP_USER=your-email@gmail.com
# SMTP_PASSWORD=your-app-password
```

#### Getting Slack Webhook URL

1. Go to https://api.slack.com/apps
2. Create a new app (or select existing)
3. Navigate to "Incoming Webhooks"
4. Activate Incoming Webhooks
5. "Add New Webhook to Workspace"
6. Select channel (e.g., `#sms-alerts`)
7. Copy webhook URL to `.env`

#### Getting PagerDuty Integration Key

1. Go to PagerDuty → Services → Your Service
2. Navigate to "Integrations" tab
3. Add Integration → "Events API V2"
4. Copy Integration Key to `.env`

### 3. Verify Scheduler

Ensure the scheduler is running and hourly alerts are enabled:

```bash
# Check worker logs
tail -f /var/log/worker.log | grep "SMS Alerts"

# You should see hourly:
# 🚨 [SMS Alerts] Starting hourly alert check...
# ✅ [SMS Alerts] Alert check completed successfully
```

### 4. Test Alert System

Trigger a test alert to verify notification channels:

```bash
# Manually trigger alert check (development only)
curl -X POST http://localhost:3001/api/test/trigger-alert-check

# Or via Supabase SQL
SELECT * FROM check_sms_alerts();
```

---

## Metrics Reference

### Operational Metrics

| Metric            | Description                | Unit  | Tracking Points         |
| ----------------- | -------------------------- | ----- | ----------------------- |
| `scheduled_count` | SMS scheduled for delivery | count | `dailySmsWorker.ts`     |
| `sent_count`      | SMS sent to Twilio         | count | `smsWorker.ts`          |
| `delivered_count` | SMS confirmed delivered    | count | Twilio webhook          |
| `failed_count`    | SMS failed to send/deliver | count | `smsWorker.ts`, webhook |
| `cancelled_count` | SMS cancelled before send  | count | `smsWorker.ts`          |

### Performance Metrics

| Metric                   | Description                 | Unit         | Calculation              |
| ------------------------ | --------------------------- | ------------ | ------------------------ |
| `avg_delivery_time_ms`   | Time from send to delivery  | milliseconds | `delivered_at - sent_at` |
| `avg_generation_time_ms` | LLM message generation time | milliseconds | LLM response time        |

### Quality Metrics

| Metric                    | Description                      | Unit       | Target         |
| ------------------------- | -------------------------------- | ---------- | -------------- |
| `llm_success_count`       | Messages generated by LLM        | count      | > 50% of total |
| `template_fallback_count` | Messages using template fallback | count      | < 50% of total |
| `delivery_success_rate`   | % of sent messages delivered     | percentage | > 90%          |
| `llm_success_rate`        | % of LLM vs template             | percentage | > 50%          |

### Cost Metrics

| Metric         | Description          | Unit | Notes              |
| -------------- | -------------------- | ---- | ------------------ |
| `llm_cost_usd` | LLM generation costs | USD  | Per message        |
| `sms_cost_usd` | Twilio SMS costs     | USD  | Future enhancement |

### Engagement Metrics

| Metric                   | Description                    | Unit  | Use Case                 |
| ------------------------ | ------------------------------ | ----- | ------------------------ |
| `opt_out_count`          | Users opted out                | count | User satisfaction        |
| `quiet_hours_skip_count` | Messages skipped (quiet hours) | count | Feature effectiveness    |
| `daily_limit_hit_count`  | Users hitting daily limit      | count | Throttling effectiveness |

---

## Alert Configuration

### Default Alert Thresholds

Configured in `sms_alert_thresholds` table:

| Alert Type                | Threshold | Operator | Severity | Channel   | Cooldown |
| ------------------------- | --------- | -------- | -------- | --------- | -------- |
| `delivery_rate_critical`  | 90%       | `<`      | critical | PagerDuty | 60 min   |
| `llm_failure_critical`    | 50%       | `>`      | critical | PagerDuty | 30 min   |
| `llm_cost_spike_warning`  | 2.0x      | `>`      | warning  | Slack     | 120 min  |
| `opt_out_rate_warning`    | 10%       | `>`      | warning  | Slack     | 240 min  |
| `daily_limit_hit_warning` | 20%       | `>`      | warning  | Slack     | 180 min  |

### Modifying Alert Thresholds

Update thresholds via SQL:

```sql
-- Update delivery rate critical threshold
UPDATE sms_alert_thresholds
SET threshold_value = 85.0  -- Lower to 85%
WHERE alert_type = 'delivery_rate_critical';

-- Disable an alert temporarily
UPDATE sms_alert_thresholds
SET enabled = false
WHERE alert_type = 'llm_cost_spike_warning';

-- Change notification channel
UPDATE sms_alert_thresholds
SET notification_channel = 'slack'
WHERE alert_type = 'delivery_rate_critical';

-- Adjust cooldown period
UPDATE sms_alert_thresholds
SET cooldown_minutes = 120  -- 2 hours
WHERE alert_type = 'llm_failure_critical';
```

### Adding Custom Alerts

```sql
-- Add new alert type (requires code update for logic)
INSERT INTO sms_alert_thresholds (
  alert_type,
  threshold_value,
  comparison_operator,
  severity,
  notification_channel,
  cooldown_minutes
) VALUES (
  'custom_metric_alert',
  100.0,
  '>',
  'warning',
  'slack',
  60
);
```

**Note:** Custom alert logic must be added to `SMSAlertsService.checkThreshold()` method.

---

## API Endpoints

### Base URL

```
https://build-os.com/api/sms/metrics
```

All endpoints require authentication (Bearer token or session cookie).

### GET `/daily`

Get daily aggregated metrics for a date range.

**Query Parameters:**

- `start_date` (required): Start date (YYYY-MM-DD)
- `end_date` (optional): End date (YYYY-MM-DD), defaults to start_date

**Example:**

```bash
curl "https://build-os.com/api/sms/metrics/daily?start_date=2025-10-01&end_date=2025-10-08" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "metric_date": "2025-10-08",
      "scheduled_count": 150,
      "sent_count": 145,
      "delivered_count": 138,
      "failed_count": 7,
      "delivery_rate_percent": 95.17,
      "llm_success_count": 120,
      "template_fallback_count": 25,
      "llm_success_rate_percent": 82.76,
      "active_users": 42
    }
  ],
  "date_range": {
    "start": "2025-10-01",
    "end": "2025-10-08"
  }
}
```

### GET `/user`

Get user-specific metrics.

**Query Parameters:**

- `user_id` (optional): User ID, defaults to current user
- `days` (optional): Number of days to look back (1-365), default 30

**Example:**

```bash
curl "https://build-os.com/api/sms/metrics/user?days=7" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "metrics": [
      /* daily metrics */
    ],
    "summary": {
      "total_scheduled": 25,
      "total_sent": 24,
      "total_delivered": 23,
      "total_failed": 1,
      "delivery_rate_percent": 95.83,
      "total_llm_cost_usd": "0.0012",
      "days": 7
    }
  },
  "user_id": "user-uuid"
}
```

### GET `/today`

Get today's metrics snapshot (quick overview).

**Example:**

```bash
curl "https://build-os.com/api/sms/metrics/today" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "metric_date": "2025-10-08",
    "scheduled_count": 150,
    "sent_count": 145,
    "delivered_count": 138,
    "delivery_rate_percent": 95.17,
    "llm_success_rate_percent": 82.76,
    "active_users": 42,
    "health": {
      "delivery_healthy": true,
      "llm_healthy": true,
      "overall_healthy": true
    }
  }
}
```

### GET `/summary`

Get comprehensive dashboard summary (today + 7-day trends + alerts).

**Example:**

```bash
curl "https://build-os.com/api/sms/metrics/summary" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "today": {
      /* today's metrics */
    },
    "week": {
      "totals": {
        "scheduled": 1050,
        "sent": 1020,
        "delivered": 975,
        "failed": 45,
        "llmCost": 0.0084
      },
      "delivery_rate_percent": 95.59,
      "llm_success_rate_percent": 81.25,
      "avg_daily_cost_usd": "0.0012"
    },
    "alerts": {
      "unresolved_count": 0,
      "has_critical": false,
      "recent": []
    },
    "health": {
      "delivery_healthy": true,
      "llm_healthy": true,
      "alerts_healthy": true,
      "overall_healthy": true,
      "status": "healthy"
    }
  },
  "timestamp": "2025-10-08T15:30:00.000Z"
}
```

### GET `/alerts`

Get alert history or unresolved alerts.

**Query Parameters:**

- `type` (optional): `unresolved` (default) or `history`
- `limit` (optional): Number of alerts (1-200), default 50
- `start_date` (required for history): Start date (YYYY-MM-DD)
- `end_date` (optional for history): End date (YYYY-MM-DD)

**Examples:**

```bash
# Get unresolved alerts
curl "https://build-os.com/api/sms/metrics/alerts?type=unresolved" \
  -H "Authorization: Bearer $TOKEN"

# Get alert history
curl "https://build-os.com/api/sms/metrics/alerts?type=history&start_date=2025-10-01&end_date=2025-10-08" \
  -H "Authorization: Bearer $TOKEN"
```

### POST `/alerts`

Resolve an alert.

**Body:**

```json
{
  "alert_id": "alert-uuid"
}
```

**Example:**

```bash
curl -X POST "https://build-os.com/api/sms/metrics/alerts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"alert_id": "alert-uuid"}'
```

---

## Troubleshooting

### Metrics Not Appearing

**Symptom:** API returns empty data or no metrics for today.

**Diagnosis:**

```sql
-- Check if metrics table has data
SELECT COUNT(*), MAX(created_at) FROM sms_metrics;

-- Check if materialized view is up to date
SELECT metric_date, last_refreshed FROM sms_metrics_daily
ORDER BY metric_date DESC LIMIT 1;
```

**Solutions:**

1. Verify metrics tracking is integrated in workers
2. Check worker logs for metric recording errors
3. Manually refresh materialized view:

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY sms_metrics_daily;
```

### Alerts Not Firing

**Symptom:** Thresholds exceeded but no notifications.

**Diagnosis:**

```bash
# Check scheduler logs
tail -f /var/log/worker.log | grep "SMS Alerts"

# Check alert thresholds are enabled
psql $DATABASE_URL -c "SELECT * FROM sms_alert_thresholds WHERE enabled = true;"

# Check for cooldown
psql $DATABASE_URL -c "
  SELECT alert_type, last_triggered_at,
    NOW() - last_triggered_at AS time_since_trigger
  FROM sms_alert_thresholds;
"
```

**Solutions:**

1. Verify environment variables for Slack/PagerDuty
2. Check cooldown periods haven't suppressed alerts
3. Test notification channels manually
4. Review alert threshold logic in `SMSAlertsService.checkThreshold()`

### Slack Notifications Failing

**Symptom:** `SLACK_WEBHOOK_URL not configured` warnings in logs.

**Solutions:**

1. Verify webhook URL is set in `.env`
2. Test webhook directly:

```bash
curl -X POST $SLACK_WEBHOOK_URL \
  -H 'Content-Type: application/json' \
  -d '{"text":"Test message from SMS monitoring"}'
```

3. Check Slack app permissions and webhook validity

### High LLM Costs

**Symptom:** `llm_cost_spike_warning` alert triggered.

**Diagnosis:**

```sql
-- Check daily LLM costs
SELECT metric_date, SUM(metric_value) as daily_cost
FROM sms_metrics
WHERE metric_type = 'llm_cost_usd'
AND metric_date >= CURRENT_DATE - 30
GROUP BY metric_date
ORDER BY metric_date DESC;

-- Check per-user costs
SELECT user_id, SUM(metric_value) as user_cost
FROM sms_metrics
WHERE metric_type = 'llm_cost_usd'
AND metric_date >= CURRENT_DATE - 7
GROUP BY user_id
ORDER BY user_cost DESC
LIMIT 10;
```

**Solutions:**

1. Review LLM model pricing (DeepSeek should be ~$0.14/1M tokens)
2. Check for message generation loops
3. Consider increasing fallback threshold
4. Review user event volume (users with many events)

### Delivery Rate Dropping

**Symptom:** `delivery_rate_critical` alert triggered.

**Diagnosis:**

```sql
-- Check failed message errors
SELECT twilio_error_code, twilio_error_message, COUNT(*)
FROM sms_messages
WHERE status = 'failed'
AND created_at >= CURRENT_DATE
GROUP BY twilio_error_code, twilio_error_message
ORDER BY COUNT(*) DESC;

-- Check delivery by hour
SELECT DATE_TRUNC('hour', sent_at) as hour,
  COUNT(*) as sent,
  SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered
FROM sms_messages
WHERE sent_at >= CURRENT_DATE
GROUP BY hour
ORDER BY hour DESC;
```

**Solutions:**

1. Review Twilio error codes for patterns
2. Check for invalid phone numbers
3. Verify Twilio account status and balance
4. Review carrier-specific issues (AT&T, Verizon, etc.)

---

## Best Practices

### Monitoring Strategy

1. **Dashboard Review (Daily)**
   - Check `/summary` endpoint for overall health
   - Review 7-day trends for anomalies
   - Investigate any unresolved alerts

2. **Deep Dive (Weekly)**
   - Review delivery rate trends
   - Analyze LLM success rate and costs
   - Check user engagement metrics (opt-outs, quiet hours)

3. **Optimization (Monthly)**
   - Tune alert thresholds based on historical data
   - Review materialized view refresh timing
   - Optimize metrics collection performance

### Alert Tuning

- **Start Conservative**: Begin with loose thresholds, tighten based on baseline
- **Avoid Alert Fatigue**: Use cooldown periods to prevent spam
- **Severity Hierarchy**: Critical → PagerDuty, Warning → Slack, Info → Email
- **Document Baselines**: Track normal ranges for each metric

### Performance Optimization

1. **Materialized View Refresh**
   - Runs hourly via scheduler
   - Use `CONCURRENTLY` to avoid table locks
   - Monitor refresh time: `SELECT last_refreshed FROM sms_metrics_daily`

2. **Metrics Retention**

   ```sql
   -- Archive old metrics (older than 90 days)
   DELETE FROM sms_metrics
   WHERE metric_date < CURRENT_DATE - 90;
   ```

3. **Index Optimization**
   ```sql
   -- Check index usage
   SELECT schemaname, tablename, indexname, idx_scan
   FROM pg_stat_user_indexes
   WHERE tablename = 'sms_metrics'
   ORDER BY idx_scan;
   ```

### Security Considerations

- **RLS Policies**: Users can only view their own metrics
- **Service Role**: Metrics API uses service role for aggregates
- **Webhook Security**: Validate Twilio signatures
- **API Rate Limiting**: Implement rate limits on metrics endpoints

---

## Support & Resources

- **SMS Implementation Docs**: `/docs/features/sms-event-scheduling/`
- **Phase 6 Plan**: `/docs/features/sms-event-scheduling/PHASE_6_PLAN.md`
- **Implementation Status**: `/docs/features/sms-event-scheduling/IMPLEMENTATION_STATUS.md`
- **Integration Tests**: `/apps/worker/tests/integration/sms/`

**Questions?** Contact the BuildOS platform team or refer to the [SMS Event Scheduling README](./README.md).
