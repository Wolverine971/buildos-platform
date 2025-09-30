// src/routes/api/calendar/analyze/preferences/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { CalendarAnalysisService } from '$lib/services/calendar-analysis.service';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';

/**
 * Get user's calendar analysis preferences
 */
export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	try {
		const { session } = await safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized();
		}

		const analysisService = CalendarAnalysisService.getInstance(supabase);
		const preferences = await analysisService.getPreferences(session.user.id);

		// Return default preferences if none exist
		const defaultPreferences = {
			user_id: session.user.id,
			auto_analyze_on_connect: false,
			analysis_frequency: 'manual',
			exclude_declined_events: true,
			exclude_tentative_events: false,
			exclude_all_day_events: false,
			exclude_personal_events: true,
			minimum_attendees: 0,
			minimum_confidence_to_show: 0.6,
			auto_accept_confidence: 0.9,
			create_tasks_from_events: true
		};

		return ApiResponse.success({
			preferences: preferences || defaultPreferences
		});
	} catch (error) {
		const errorLogger = ErrorLoggerService.getInstance();
		errorLogger.logError(error, {
			operation: 'get_calendar_preferences',
			endpoint: 'GET /api/calendar/analyze/preferences'
		});

		return ApiResponse.internalError(
			error,
			error instanceof Error ? error.message : 'Failed to get preferences'
		);
	}
};

/**
 * Update user's calendar analysis preferences
 */
export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	try {
		const { session } = await safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized();
		}

		const body = await request.json();

		// Validate preference values
		if (body.minimum_confidence_to_show !== undefined) {
			const confidence = body.minimum_confidence_to_show;
			if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
				return ApiResponse.validationError(
					'minimum_confidence_to_show',
					'must be a number between 0 and 1'
				);
			}
		}

		if (body.auto_accept_confidence !== undefined) {
			const confidence = body.auto_accept_confidence;
			if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
				return ApiResponse.validationError(
					'auto_accept_confidence',
					'must be a number between 0 and 1'
				);
			}
		}

		if (body.analysis_frequency !== undefined) {
			const validFrequencies = ['manual', 'weekly', 'monthly'];
			if (!validFrequencies.includes(body.analysis_frequency)) {
				return ApiResponse.validationError(
					'analysis_frequency',
					`must be one of: ${validFrequencies.join(', ')}`
				);
			}
		}

		if (body.minimum_attendees !== undefined) {
			const attendees = body.minimum_attendees;
			if (typeof attendees !== 'number' || attendees < 0 || attendees > 100) {
				return ApiResponse.validationError(
					'minimum_attendees',
					'must be a number between 0 and 100'
				);
			}
		}

		// Update preferences
		const analysisService = CalendarAnalysisService.getInstance(supabase);
		const result = await analysisService.updatePreferences(session.user.id, body);

		if (!result.success) {
			return ApiResponse.badRequest(result.errors?.[0] || 'Failed to update preferences');
		}

		return ApiResponse.success(undefined, 'Preferences updated successfully');
	} catch (error) {
		const errorLogger = ErrorLoggerService.getInstance();
		errorLogger.logError(error, {
			operation: 'update_calendar_preferences',
			endpoint: 'POST /api/calendar/analyze/preferences'
		});

		return ApiResponse.internalError(
			error,
			error instanceof Error ? error.message : 'Failed to update preferences'
		);
	}
};
