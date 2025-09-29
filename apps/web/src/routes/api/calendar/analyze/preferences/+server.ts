import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CalendarAnalysisService } from '$lib/services/calendar-analysis.service';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';

/**
 * Get user's calendar analysis preferences
 */
export const GET: RequestHandler = async ({ locals }) => {
	try {
		const session = await locals.auth();
		if (!session?.user) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const analysisService = CalendarAnalysisService.getInstance();
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

		return json({
			success: true,
			preferences: preferences || defaultPreferences
		});
	} catch (error) {
		const errorLogger = ErrorLoggerService.getInstance();
		errorLogger.logError(error, {
			operation: 'get_calendar_preferences',
			endpoint: 'GET /api/calendar/analyze/preferences'
		});

		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to get preferences'
			},
			{ status: 500 }
		);
	}
};

/**
 * Update user's calendar analysis preferences
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const session = await locals.auth();
		if (!session?.user) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const body = await request.json();

		// Validate preference values
		if (body.minimum_confidence_to_show !== undefined) {
			const confidence = body.minimum_confidence_to_show;
			if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
				return json(
					{
						success: false,
						error: 'minimum_confidence_to_show must be a number between 0 and 1'
					},
					{ status: 400 }
				);
			}
		}

		if (body.auto_accept_confidence !== undefined) {
			const confidence = body.auto_accept_confidence;
			if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
				return json(
					{
						success: false,
						error: 'auto_accept_confidence must be a number between 0 and 1'
					},
					{ status: 400 }
				);
			}
		}

		if (body.analysis_frequency !== undefined) {
			const validFrequencies = ['manual', 'weekly', 'monthly'];
			if (!validFrequencies.includes(body.analysis_frequency)) {
				return json(
					{
						success: false,
						error: `analysis_frequency must be one of: ${validFrequencies.join(', ')}`
					},
					{ status: 400 }
				);
			}
		}

		if (body.minimum_attendees !== undefined) {
			const attendees = body.minimum_attendees;
			if (typeof attendees !== 'number' || attendees < 0 || attendees > 100) {
				return json(
					{
						success: false,
						error: 'minimum_attendees must be a number between 0 and 100'
					},
					{ status: 400 }
				);
			}
		}

		// Update preferences
		const analysisService = CalendarAnalysisService.getInstance();
		const result = await analysisService.updatePreferences(session.user.id, body);

		if (!result.success) {
			return json(
				{
					success: false,
					error: result.errors?.[0] || 'Failed to update preferences'
				},
				{ status: 400 }
			);
		}

		return json({
			success: true,
			message: 'Preferences updated successfully'
		});
	} catch (error) {
		const errorLogger = ErrorLoggerService.getInstance();
		errorLogger.logError(error, {
			operation: 'update_calendar_preferences',
			endpoint: 'POST /api/calendar/analyze/preferences'
		});

		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to update preferences'
			},
			{ status: 500 }
		);
	}
};
