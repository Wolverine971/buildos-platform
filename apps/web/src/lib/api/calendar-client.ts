// src/lib/api/calendar-client.ts

import { toastService } from '$lib/stores/toast.store';

export class CalendarAPIError extends Error {
	constructor(
		message: string,
		public statusCode: number = 500,
		public requiresAuth: boolean = false
	) {
		super(message);
		this.name = 'CalendarAPIError';
	}
}

/**
 * Calendar API utility for interacting with the calendar process endpoint
 */
export class CalendarAPI {
	private readonly baseUrl = '/api/calendar/process';

	/**
	 * Make a request to the calendar process endpoint
	 */
	private async request<T = any>(method: string, params?: any): Promise<T> {
		try {
			const response = await fetch(this.baseUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					method,
					params
				})
			});

			const data = await response.json();

			// Handle API response format
			if (!response.ok || !data.success) {
				// Check for specific error types
				if (response.status === 401) {
					toastService.error('Please log in to access calendar features');
					throw new CalendarAPIError('Unauthorized', 401);
				}

				if (response.status === 403 || data.message?.includes('not connected')) {
					toastService.warning(
						'Please connect your Google Calendar to use this feature',
						{
							duration: 8000
						}
					);
					throw new CalendarAPIError(data.message || 'Calendar not connected', 403, true);
				}

				if (response.status === 429) {
					toastService.warning(
						'Calendar API limit reached. Please try again in a few minutes.'
					);
					throw new CalendarAPIError(data.message || 'Rate limit exceeded', 429);
				}

				throw new CalendarAPIError(
					data.message || 'Calendar operation failed',
					response.status
				);
			}

			return data.data;
		} catch (error) {
			// Re-throw CalendarAPIError
			if (error instanceof CalendarAPIError) {
				throw error;
			}

			// Handle network errors
			console.error('Calendar API request failed:', error);
			toastService.error('Failed to connect to calendar service');
			throw new CalendarAPIError(error instanceof Error ? error.message : 'Network error', 0);
		}
	}

	/**
	 * Check if calendar is connected
	 */
	async hasValidConnection(): Promise<boolean> {
		try {
			const result = await this.request<{ connected: boolean }>('hasValidConnection');
			return result.connected;
		} catch {
			return false;
		}
	}

	/**
	 * Disconnect calendar
	 */
	async disconnectCalendar(): Promise<void> {
		await this.request('disconnectCalendar');
		toastService.success('Calendar disconnected successfully');
	}

	/**
	 * Get calendar events
	 */
	async getCalendarEvents(params?: {
		calendarId?: string;
		timeMin?: string;
		timeMax?: string;
		maxResults?: number;
		q?: string;
		timeZone?: string;
	}): Promise<any> {
		return this.request('getCalendarEvents', params);
	}

	/**
	 * Find available time slots
	 */
	async findAvailableSlots(params: {
		timeMin: string;
		timeMax: string;
		duration_minutes?: number;
		calendarId?: string;
		preferred_hours?: number[];
		timeZone?: string;
	}): Promise<any> {
		return this.request('findAvailableSlots', params);
	}

	/**
	 * Schedule a task to calendar
	 */
	async scheduleTask(params: {
		task_id: string;
		start_time: string;
		duration_minutes?: number;
		calendar_id?: string;
		description?: string;
		color_id?: string;
		timeZone?: string;
		recurrence_pattern?: string;
		recurrence_ends?: string;
	}): Promise<any> {
		return this.request('scheduleTask', params);
	}

	/**
	 * Update calendar event
	 */
	async updateCalendarEvent(params: {
		event_id: string;
		calendar_id?: string;
		start_time?: string;
		end_time?: string;
		summary?: string;
		description?: string;
		location?: string;
		timeZone?: string;
		recurrence?: string[] | null;
		update_scope?: 'all' | 'single' | 'future';
		instance_date?: string;
	}): Promise<any> {
		return this.request('updateCalendarEvent', params);
	}

	/**
	 * Delete calendar event
	 */
	async deleteCalendarEvent(params: {
		event_id: string;
		calendar_id?: string;
		send_notifications?: boolean;
	}): Promise<any> {
		return this.request('deleteCalendarEvent', params);
	}

	/**
	 * Get upcoming tasks
	 */
	async getUpcomingTasks(params?: { days_ahead?: number }): Promise<any> {
		return this.request('getUpcomingTasks', params);
	}

	/**
	 * Bulk delete calendar events
	 */
	async bulkDeleteCalendarEvents(
		events: Array<{
			id: string;
			calendar_event_id: string;
			calendar_id?: string;
		}>,
		options?: { batchSize?: number; reason?: string }
	): Promise<any> {
		return this.request('bulkDeleteCalendarEvents', { events, options });
	}

	/**
	 * Bulk schedule tasks
	 */
	async bulkScheduleTasks(
		tasks: Array<{
			task_id: string;
			start_time: string;
			duration_minutes?: number;
			description?: string;
			timeZone?: string;
		}>,
		options?: { batchSize?: number }
	): Promise<any> {
		return this.request('bulkScheduleTasks', { tasks, options });
	}

	/**
	 * Bulk update calendar events
	 */
	async bulkUpdateCalendarEvents(
		updates: Array<{
			event_id: string;
			calendar_id?: string;
			start_time?: string;
			end_time?: string;
			summary?: string;
			description?: string;
			timeZone?: string;
		}>,
		options?: { batchSize?: number }
	): Promise<any> {
		return this.request('bulkUpdateCalendarEvents', { updates, options });
	}
}

// Export singleton instance
export const calendarAPI = new CalendarAPI();
