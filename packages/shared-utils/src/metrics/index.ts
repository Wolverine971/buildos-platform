// packages/shared-utils/src/metrics/index.ts
/**
 * SMS Metrics Module
 *
 * Shared services for SMS metrics tracking and alerting across the BuildOS platform.
 * Used by both web app (for dashboards) and worker (for recording events).
 */

export {
	SMSMetricsService,
	smsMetricsService,
	type SMSMetrics,
	type DailyMetricsSummary,
	type UserMetrics
} from './smsMetrics.service';

export {
	SMSAlertsService,
	smsAlertsService,
	type AlertThreshold,
	type Alert
} from './smsAlerts.service';
