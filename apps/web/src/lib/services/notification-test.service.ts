// apps/web/src/lib/services/notification-test.service.ts
/**
 * Notification Test Service
 *
 * Provides methods for testing notifications via admin dashboard test bed
 */

import type { EventType, NotificationChannel } from '@buildos/shared-types';

export interface TestNotificationRequest {
	event_type: EventType;
	payload: Record<string, any>;
	recipient_user_ids: string[];
	channels: NotificationChannel[];
}

export interface TestNotificationResult {
	event_id: string;
	deliveries: Array<{
		id: string;
		channel: NotificationChannel;
		recipient_user_id: string;
		status: string;
		last_error?: string;
	}>;
}

export interface TestHistoryItem {
	event_id: string;
	event_type: EventType;
	created_at: string;
	recipient_count: number;
	channel_count: number;
	channels: NotificationChannel[];
	deliveries: Array<{
		delivery_id: string;
		channel: NotificationChannel;
		recipient_email: string;
		status: string;
		error?: string;
	}>;
}

export interface TestHistoryResult {
	tests: TestHistoryItem[];
	total_count: number;
}

export interface RecipientSearchResult {
	id: string;
	email: string;
	name: string | null;
	is_admin: boolean;
	has_push_subscription: boolean;
	has_phone: boolean;
	is_subscribed_to_event?: boolean;
}

export class NotificationTestService {
	/**
	 * Send test notification
	 */
	async sendTest(options: TestNotificationRequest): Promise<TestNotificationResult> {
		const response = await fetch('/api/admin/notifications/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...options, test_mode: true })
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || 'Failed to send test notification');
		}

		const data = await response.json();
		return data.data;
	}

	/**
	 * Get test history
	 */
	async getHistory(limit: number = 20, offset: number = 0): Promise<TestHistoryResult> {
		const response = await fetch(
			`/api/admin/notifications/test/history?limit=${limit}&offset=${offset}`
		);

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || 'Failed to fetch test history');
		}

		const data = await response.json();
		return data.data;
	}

	/**
	 * Search for recipients
	 */
	async searchRecipients(query: string, eventType?: EventType): Promise<RecipientSearchResult[]> {
		const params = new URLSearchParams({ q: query });
		if (eventType) params.append('event_type', eventType);

		const response = await fetch(`/api/admin/notifications/recipients/search?${params}`);

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || 'Failed to search recipients');
		}

		const data = await response.json();
		return data.data.users;
	}

	/**
	 * Retry failed delivery
	 */
	async retryDelivery(deliveryId: string): Promise<void> {
		const response = await fetch(`/api/admin/notifications/deliveries/${deliveryId}/retry`, {
			method: 'POST'
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || 'Failed to retry delivery');
		}
	}

	/**
	 * Resend notification (new delivery)
	 */
	async resendDelivery(deliveryId: string): Promise<void> {
		const response = await fetch(`/api/admin/notifications/deliveries/${deliveryId}/resend`, {
			method: 'POST'
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || 'Failed to resend delivery');
		}
	}
}

export const notificationTestService = new NotificationTestService();
