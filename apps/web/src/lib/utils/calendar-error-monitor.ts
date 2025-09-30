// apps/web/src/lib/utils/calendar-error-monitor.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

export interface CalendarErrorSummary {
	totalErrors: number;
	deleteErrors: number;
	updateErrors: number;
	syncErrors: number;
	byUser: Record<string, number>;
	byProject: Record<string, number>;
	recentErrors: Array<{
		id: string;
		error_message: string;
		created_at: string;
		user_id: string;
		project_id: string;
		operation_type: string;
	}>;
}

export class CalendarErrorMonitor {
	constructor(private supabase: SupabaseClient<Database>) {}

	/**
	 * Get a summary of calendar-related errors
	 */
	async getCalendarErrorSummary(
		timeRange: 'day' | 'week' | 'month' = 'week'
	): Promise<CalendarErrorSummary> {
		const startDate = this.getStartDate(timeRange);

		// Get all calendar errors
		const { data: errors, error } = await this.supabase
			.from('error_logs')
			.select('*')
			.in('error_type', [
				'calendar_sync_error',
				'calendar_delete_error',
				'calendar_update_error'
			])
			.gte('created_at', startDate.toISOString())
			.order('created_at', { ascending: false });

		if (error || !errors) {
			console.error('Failed to fetch calendar errors:', error);
			return this.getEmptySummary();
		}

		// Aggregate data
		const summary: CalendarErrorSummary = {
			totalErrors: errors.length,
			deleteErrors: errors.filter((e) => e.error_type === 'calendar_delete_error').length,
			updateErrors: errors.filter((e) => e.error_type === 'calendar_update_error').length,
			syncErrors: errors.filter((e) => e.error_type === 'calendar_sync_error').length,
			byUser: {},
			byProject: {},
			recentErrors: errors.slice(0, 10).map((e) => ({
				id: e.id,
				error_message: e.error_message,
				created_at: e.created_at,
				user_id: e.user_id || '',
				project_id: e.project_id || '',
				operation_type: e.operation_type || ''
			}))
		};

		// Count by user
		errors.forEach((e) => {
			if (e.user_id) {
				summary.byUser[e.user_id] = (summary.byUser[e.user_id] || 0) + 1;
			}
			if (e.project_id) {
				summary.byProject[e.project_id] = (summary.byProject[e.project_id] || 0) + 1;
			}
		});

		return summary;
	}

	/**
	 * Get errors for a specific task
	 */
	async getTaskCalendarErrors(taskId: string): Promise<any[]> {
		const { data, error } = await this.supabase
			.from('error_logs')
			.select('*')
			.eq('record_id', taskId)
			.in('error_type', [
				'calendar_sync_error',
				'calendar_delete_error',
				'calendar_update_error'
			])
			.order('created_at', { ascending: false });

		if (error) {
			console.error('Failed to fetch task calendar errors:', error);
			return [];
		}

		return data || [];
	}

	/**
	 * Get errors for a specific user
	 */
	async getUserCalendarErrors(userId: string, limit: number = 50): Promise<any[]> {
		const { data, error } = await this.supabase
			.from('error_logs')
			.select('*')
			.eq('user_id', userId)
			.in('error_type', [
				'calendar_sync_error',
				'calendar_delete_error',
				'calendar_update_error'
			])
			.order('created_at', { ascending: false })
			.limit(limit);

		if (error) {
			console.error('Failed to fetch user calendar errors:', error);
			return [];
		}

		return data || [];
	}

	/**
	 * Check if there are recent calendar errors for a user
	 */
	async hasRecentCalendarErrors(userId: string, hoursBack: number = 24): Promise<boolean> {
		const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

		const { count, error } = await this.supabase
			.from('error_logs')
			.select('*', { count: 'exact', head: true })
			.eq('user_id', userId)
			.in('error_type', [
				'calendar_sync_error',
				'calendar_delete_error',
				'calendar_update_error'
			])
			.gte('created_at', cutoffTime);

		if (error) {
			console.error('Failed to check recent calendar errors:', error);
			return false;
		}

		return (count || 0) > 0;
	}

	/**
	 * Get most common calendar error patterns
	 */
	async getCommonErrorPatterns(limit: number = 10): Promise<
		Array<{
			pattern: string;
			count: number;
			example: string;
		}>
	> {
		const { data: errors, error } = await this.supabase
			.from('error_logs')
			.select('error_message, error_code')
			.in('error_type', [
				'calendar_sync_error',
				'calendar_delete_error',
				'calendar_update_error'
			])
			.order('created_at', { ascending: false })
			.limit(1000);

		if (error || !errors) {
			console.error('Failed to fetch error patterns:', error);
			return [];
		}

		// Group by error patterns
		const patterns = new Map<string, { count: number; example: string }>();

		errors.forEach((e) => {
			// Extract pattern from error message
			let pattern = e.error_message;

			// Remove specific IDs and values
			pattern = pattern.replace(/[a-f0-9-]{36}/gi, '{id}'); // UUIDs
			pattern = pattern.replace(/\d{4}-\d{2}-\d{2}/g, '{date}'); // Dates
			pattern = pattern.replace(/\d+/g, '{number}'); // Numbers

			if (!patterns.has(pattern)) {
				patterns.set(pattern, { count: 0, example: e.error_message });
			}
			patterns.get(pattern)!.count++;
		});

		// Sort by frequency and return top N
		return Array.from(patterns.entries())
			.sort((a, b) => b[1].count - a[1].count)
			.slice(0, limit)
			.map(([pattern, data]) => ({
				pattern,
				count: data.count,
				example: data.example
			}));
	}

	private getStartDate(timeRange: 'day' | 'week' | 'month'): Date {
		const now = new Date();
		switch (timeRange) {
			case 'day':
				return new Date(now.getTime() - 24 * 60 * 60 * 1000);
			case 'week':
				return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
			case 'month':
				return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
		}
	}

	private getEmptySummary(): CalendarErrorSummary {
		return {
			totalErrors: 0,
			deleteErrors: 0,
			updateErrors: 0,
			syncErrors: 0,
			byUser: {},
			byProject: {},
			recentErrors: []
		};
	}
}
