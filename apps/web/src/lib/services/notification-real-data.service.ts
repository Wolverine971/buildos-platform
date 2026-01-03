// apps/web/src/lib/services/notification-real-data.service.ts
/**
 * Notification Real Data Service
 *
 * Loads real user data for populating notification test payloads
 */

import type { EventType } from '@buildos/shared-types';

export interface RealDataResult {
	payload: Record<string, any>;
	message?: string;
}

export class NotificationRealDataService {
	/**
	 * Load real data for a specific user and event type
	 */
	async loadRealData(userId: string, eventType: EventType): Promise<RealDataResult> {
		const response = await fetch(`/api/admin/notifications/real-data/${userId}/${eventType}`);

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || 'Failed to load real data');
		}

		const data = await response.json();
		return {
			payload: data.data,
			message: data.message
		};
	}

	/**
	 * Check if real data is available for an event type
	 */
	canLoadRealData(eventType: EventType): boolean {
		const supportedTypes: EventType[] = [
			'brief.completed',
			'brief.failed',
			'brain_dump.processed',
			'task.due_soon',
			'project.phase_scheduled',
			'calendar.sync_failed',
			'user.signup',
			'user.trial_expired'
		];
		return supportedTypes.includes(eventType);
	}

	/**
	 * Get a friendly message about what real data will be loaded
	 */
	getRealDataDescription(eventType: EventType): string {
		switch (eventType) {
			case 'brief.completed':
				return "Loads data from user's most recent daily brief";
			case 'brief.failed':
				return "Uses user's timezone and current date";
			case 'brain_dump.processed':
				return "Loads data from user's most recent processed brain dump";
			case 'task.due_soon':
				return "Loads user's next upcoming task";
			case 'project.phase_scheduled':
				return "Loads data from user's most recent scheduled phase plan";
			case 'calendar.sync_failed':
				return "Loads data from user's last calendar sync error";
			case 'user.signup':
				return "Loads user's signup information";
			case 'user.trial_expired':
				return "Loads user's trial expiration date";
			default:
				return 'Real data not available for this event type';
		}
	}
}

export const notificationRealDataService = new NotificationRealDataService();
