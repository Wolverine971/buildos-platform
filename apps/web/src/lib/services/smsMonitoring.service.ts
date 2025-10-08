// apps/web/src/lib/services/smsMonitoring.service.ts
/**
 * SMS Monitoring Service
 *
 * Client-side service for fetching SMS metrics and alerts from dashboard APIs
 */

import { getSupabase } from '$lib/supabaseClient';

export interface DailyMetric {
	metric_date: string;
	scheduled_count: number;
	sent_count: number;
	delivered_count: number;
	failed_count: number;
	cancelled_count: number;
	avg_delivery_time_ms: number;
	llm_success_count: number;
	template_fallback_count: number;
	total_llm_cost_usd: number;
	delivery_rate_percent: number;
	llm_success_rate_percent: number;
	active_users: number;
}

export interface TodayMetric extends DailyMetric {
	health: {
		delivery_healthy: boolean;
		llm_healthy: boolean;
		overall_healthy: boolean;
	};
}

export interface MetricsSummary {
	today: TodayMetric | null;
	week: {
		totals: {
			scheduled: number;
			sent: number;
			delivered: number;
			failed: number;
			cancelled: number;
			llmCost: number;
			llmSuccess: number;
			templateFallback: number;
		};
		delivery_rate_percent: number;
		llm_success_rate_percent: number;
		avg_daily_cost_usd: string;
	};
	alerts: {
		unresolved_count: number;
		has_critical: boolean;
		recent: Alert[];
	};
	health: {
		delivery_healthy: boolean;
		llm_healthy: boolean;
		alerts_healthy: boolean;
		overall_healthy: boolean;
		status: 'healthy' | 'degraded' | 'critical';
	};
}

export interface UserMetric {
	metric_date: string;
	scheduled_count: number;
	sent_count: number;
	delivered_count: number;
	failed_count: number;
	llm_cost_usd: number;
	delivery_rate: number;
}

export interface UserMetricsResponse {
	metrics: UserMetric[];
	summary: {
		total_scheduled: number;
		total_sent: number;
		total_delivered: number;
		total_failed: number;
		delivery_rate_percent: number;
		total_llm_cost_usd: string;
		days: number;
	};
}

export interface Alert {
	id: string;
	alert_type: string;
	severity: 'critical' | 'warning' | 'info';
	triggered_at: string;
	resolved_at: string | null;
	metric_value: number;
	threshold_value: number;
	message: string;
	notification_channel: string;
	notification_sent: boolean;
}

export class SMSMonitoringService {
	private baseUrl = '/api/sms/metrics';

	/**
	 * Get comprehensive dashboard summary
	 */
	async getSummary(): Promise<MetricsSummary> {
		const response = await fetch(`${this.baseUrl}/summary`, {
			headers: await this.getAuthHeaders()
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch summary: ${response.statusText}`);
		}

		const result = await response.json();
		return result.data;
	}

	/**
	 * Get daily metrics for date range
	 */
	async getDailyMetrics(startDate: string, endDate?: string): Promise<DailyMetric[]> {
		const params = new URLSearchParams({ start_date: startDate });
		if (endDate) {
			params.append('end_date', endDate);
		}

		const response = await fetch(`${this.baseUrl}/daily?${params}`, {
			headers: await this.getAuthHeaders()
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch daily metrics: ${response.statusText}`);
		}

		const result = await response.json();
		return result.data;
	}

	/**
	 * Get today's metrics snapshot
	 */
	async getTodayMetrics(): Promise<TodayMetric | null> {
		const response = await fetch(`${this.baseUrl}/today`, {
			headers: await this.getAuthHeaders()
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch today's metrics: ${response.statusText}`);
		}

		const result = await response.json();
		return result.data;
	}

	/**
	 * Get user-specific metrics
	 */
	async getUserMetrics(userId?: string, days: number = 30): Promise<UserMetricsResponse> {
		const params = new URLSearchParams({ days: days.toString() });
		if (userId) {
			params.append('user_id', userId);
		}

		const response = await fetch(`${this.baseUrl}/user?${params}`, {
			headers: await this.getAuthHeaders()
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch user metrics: ${response.statusText}`);
		}

		const result = await response.json();
		return result.data;
	}

	/**
	 * Get unresolved alerts
	 */
	async getUnresolvedAlerts(limit: number = 50): Promise<Alert[]> {
		const params = new URLSearchParams({
			type: 'unresolved',
			limit: limit.toString()
		});

		const response = await fetch(`${this.baseUrl}/alerts?${params}`, {
			headers: await this.getAuthHeaders()
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch alerts: ${response.statusText}`);
		}

		const result = await response.json();
		return result.data;
	}

	/**
	 * Get alert history
	 */
	async getAlertHistory(
		startDate: string,
		endDate?: string,
		limit: number = 50
	): Promise<Alert[]> {
		const params = new URLSearchParams({
			type: 'history',
			start_date: startDate,
			limit: limit.toString()
		});
		if (endDate) {
			params.append('end_date', endDate);
		}

		const response = await fetch(`${this.baseUrl}/alerts?${params}`, {
			headers: await this.getAuthHeaders()
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch alert history: ${response.statusText}`);
		}

		const result = await response.json();
		return result.data;
	}

	/**
	 * Resolve an alert
	 */
	async resolveAlert(alertId: string): Promise<void> {
		const response = await fetch(`${this.baseUrl}/alerts`, {
			method: 'POST',
			headers: {
				...(await this.getAuthHeaders()),
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ alert_id: alertId })
		});

		if (!response.ok) {
			throw new Error(`Failed to resolve alert: ${response.statusText}`);
		}
	}

	/**
	 * Get authentication headers
	 */
	private async getAuthHeaders(): Promise<Record<string, string>> {
		const supabase = getSupabase();
		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (session?.access_token) {
			return {
				Authorization: `Bearer ${session.access_token}`
			};
		}

		return {};
	}
}

// Export singleton instance
export const smsMonitoringService = new SMSMonitoringService();
