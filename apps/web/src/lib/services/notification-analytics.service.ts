/**
 * Notification Analytics Service
 *
 * Provides methods for fetching notification analytics data for admin dashboard
 */

export type Timeframe = '24h' | '7d' | '30d' | '90d';

export interface AnalyticsOverview {
	total_sent: number;
	delivery_success_rate: number;
	avg_open_rate: number;
	avg_click_rate: number;
	trend_vs_previous_period: {
		sent: number;
		success_rate: number;
		open_rate: number;
		click_rate: number;
	};
}

export interface ChannelMetrics {
	channel: string;
	total_sent: number;
	delivered: number;
	opened: number;
	clicked: number;
	failed: number;
	success_rate: number;
	open_rate: number;
	click_rate: number;
	avg_delivery_time_ms: number;
}

export interface EventMetrics {
	event_type: string;
	total_events: number;
	total_deliveries: number;
	unique_subscribers: number;
	avg_delivery_time_seconds: number;
	open_rate: number;
	click_rate: number;
}

export interface TimelineDataPoint {
	time_bucket: string;
	sent: number;
	delivered: number;
	opened: number;
	clicked: number;
	failed: number;
}

export interface FailedDelivery {
	delivery_id: string;
	event_id: string;
	event_type: string;
	channel: string;
	recipient_user_id: string;
	recipient_email: string;
	last_error: string;
	attempts: number;
	max_attempts: number;
	created_at: string;
	failed_at: string;
}

export interface SubscriptionInfo {
	user_id: string;
	email: string;
	name: string | null;
	subscribed_events: string[];
	push_enabled: boolean;
	email_enabled: boolean;
	sms_enabled: boolean;
	in_app_enabled: boolean;
	last_notification_sent: string | null;
}

export interface SMSStats {
	total_users_with_phone: number;
	users_phone_verified: number;
	users_sms_enabled: number;
	users_opted_out: number;
	phone_verification_rate: number;
	sms_adoption_rate: number;
	opt_out_rate: number;
	total_sms_sent_24h: number;
	sms_delivery_rate_24h: number;
	avg_sms_delivery_time_seconds: number;
}

export class NotificationAnalyticsService {
	/**
	 * Get overview metrics
	 */
	async getOverview(timeframe: Timeframe = '7d'): Promise<AnalyticsOverview> {
		const response = await fetch(
			`/api/admin/notifications/analytics/overview?timeframe=${timeframe}`
		);

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || 'Failed to fetch overview analytics');
		}

		const data = await response.json();
		return data.data;
	}

	/**
	 * Get channel performance metrics
	 */
	async getChannelPerformance(timeframe: Timeframe = '7d'): Promise<ChannelMetrics[]> {
		const response = await fetch(
			`/api/admin/notifications/analytics/channels?timeframe=${timeframe}`
		);

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || 'Failed to fetch channel performance');
		}

		const data = await response.json();
		return data.data.channels;
	}

	/**
	 * Get event type breakdown
	 */
	async getEventBreakdown(timeframe: Timeframe = '30d'): Promise<EventMetrics[]> {
		const response = await fetch(
			`/api/admin/notifications/analytics/events?timeframe=${timeframe}`
		);

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || 'Failed to fetch event breakdown');
		}

		const data = await response.json();
		return data.data.events;
	}

	/**
	 * Get delivery timeline
	 */
	async getTimeline(
		timeframe: Timeframe = '7d',
		granularity?: 'hour' | 'day'
	): Promise<TimelineDataPoint[]> {
		const params = new URLSearchParams({ timeframe });
		if (granularity) params.append('granularity', granularity);

		const response = await fetch(`/api/admin/notifications/analytics/timeline?${params}`);

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || 'Failed to fetch timeline');
		}

		const data = await response.json();
		return data.data.timeline;
	}

	/**
	 * Get recent failures
	 */
	async getFailures(timeframe: Timeframe = '24h', limit: number = 50): Promise<FailedDelivery[]> {
		const response = await fetch(
			`/api/admin/notifications/analytics/failures?timeframe=${timeframe}&limit=${limit}`
		);

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || 'Failed to fetch failures');
		}

		const data = await response.json();
		return data.data.failures;
	}

	/**
	 * Get active subscriptions
	 */
	async getSubscriptions(): Promise<SubscriptionInfo[]> {
		const response = await fetch('/api/admin/notifications/analytics/subscriptions');

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || 'Failed to fetch subscriptions');
		}

		const data = await response.json();
		return data.data.subscriptions;
	}

	/**
	 * Get SMS-specific statistics
	 */
	async getSMSStats(): Promise<SMSStats> {
		const response = await fetch('/api/admin/notifications/analytics/sms-stats');

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || 'Failed to fetch SMS statistics');
		}

		const data = await response.json();
		return data.data;
	}
}

export const notificationAnalyticsService = new NotificationAnalyticsService();
