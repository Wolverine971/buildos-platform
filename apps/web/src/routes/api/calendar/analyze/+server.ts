import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CalendarAnalysisService } from '$lib/services/calendar-analysis.service';
import { CalendarService } from '$lib/services/calendar-service';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const session = await locals.auth();
		if (!session?.user) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		// Check if user has calendar connected
		const calendarService = CalendarService.getInstance();
		const hasCalendarConnection = await calendarService.hasValidConnection(session.user.id);

		if (!hasCalendarConnection) {
			return json(
				{
					success: false,
					error: 'No calendar connected. Please connect your Google Calendar first.'
				},
				{ status: 400 }
			);
		}

		const body = await request.json();
		const { daysBack = 30, daysForward = 60, calendarsToAnalyze } = body;

		// Validate input
		if (daysBack < 0 || daysBack > 365) {
			return json(
				{
					success: false,
					error: 'daysBack must be between 0 and 365'
				},
				{ status: 400 }
			);
		}

		if (daysForward < 0 || daysForward > 365) {
			return json(
				{
					success: false,
					error: 'daysForward must be between 0 and 365'
				},
				{ status: 400 }
			);
		}

		// Start calendar analysis
		const analysisService = CalendarAnalysisService.getInstance();
		const result = await analysisService.analyzeUserCalendar(session.user.id, {
			daysBack,
			daysForward,
			calendarsToAnalyze
		});

		return json({
			success: true,
			...result
		});
	} catch (error) {
		const errorLogger = ErrorLoggerService.getInstance();
		errorLogger.logError(error, {
			operation: 'calendar_analyze_endpoint',
			endpoint: 'POST /api/calendar/analyze'
		});

		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to analyze calendar'
			},
			{ status: 500 }
		);
	}
};

export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		const session = await locals.auth();
		if (!session?.user) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const analysisId = url.searchParams.get('analysisId');
		const analysisService = CalendarAnalysisService.getInstance();

		if (analysisId) {
			// Get specific analysis
			const history = await analysisService.getAnalysisHistory(session.user.id);
			const analysis = history.find((a) => a.id === analysisId);

			if (!analysis) {
				return json(
					{
						success: false,
						error: 'Analysis not found'
					},
					{ status: 404 }
				);
			}

			return json({
				success: true,
				analysis
			});
		} else {
			// Get analysis history
			const history = await analysisService.getAnalysisHistory(session.user.id);
			const calendarProjects = await analysisService.getCalendarProjects(session.user.id);

			return json({
				success: true,
				history,
				calendarProjects
			});
		}
	} catch (error) {
		const errorLogger = ErrorLoggerService.getInstance();
		errorLogger.logError(error, {
			operation: 'calendar_analyze_get_endpoint',
			endpoint: 'GET /api/calendar/analyze'
		});

		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to get analysis data'
			},
			{ status: 500 }
		);
	}
};
