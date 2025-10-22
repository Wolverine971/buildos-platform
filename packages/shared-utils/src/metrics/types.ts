// packages/shared-utils/src/metrics/types.ts
/**
 * SMS Metrics Type Definitions
 *
 * These types extend the base Database schema with SMS metrics-specific tables and RPCs.
 * These tables exist in the database but may not be in the auto-generated types yet.
 */

// SMS Metrics table row
export interface SMSMetricsRow {
	id: string;
	user_id: string | null;
	metric_date: string;
	metric_hour: number | null;
	metric_type: string;
	metric_value: number;
	metadata: Record<string, any>;
	created_at: string;
	updated_at: string;
}

// SMS Alert Thresholds table row
export interface SMSAlertThresholdsRow {
	id: string;
	alert_type: string;
	threshold_value: number;
	comparison_operator: '<' | '>' | '<=' | '>=' | '=';
	severity: 'critical' | 'warning' | 'info';
	notification_channel: 'pagerduty' | 'slack' | 'email';
	enabled: boolean;
	cooldown_minutes: number;
	last_triggered_at: string | null;
	created_at: string;
	updated_at: string;
}

// SMS Alert History table row
export interface SMSAlertHistoryRow {
	id: string;
	alert_type: string;
	severity: string;
	metric_value: number;
	threshold_value: number;
	message: string;
	notification_channel: string;
	notification_sent: boolean;
	triggered_at: string;
	resolved_at: string | null;
	created_at: string;
	updated_at: string;
}

// RPC function parameters
export interface RecordSMSMetricParams {
	p_metric_date: string;
	p_metric_hour: number | null;
	p_user_id: string;
	p_metric_type: string;
	p_metric_value: number;
	p_metadata: Record<string, any>;
}

export interface GetSMSDailyMetricsParams {
	p_start_date: string;
	p_end_date: string;
}

export interface GetUserSMSMetricsParams {
	p_user_id: string;
	p_days: number;
}
