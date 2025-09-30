// src/routes/api/calendar/analyze/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { CalendarAnalysisService } from '$lib/services/calendar-analysis.service';
import { CalendarService } from '$lib/services/calendar-service';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	try {
		const { session } = await safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized();
		}

		// Check if user has calendar connected
		const calendarService = new CalendarService(supabase);
		const hasCalendarConnection = await calendarService.hasValidConnection(session.user.id);

		if (!hasCalendarConnection) {
			return ApiResponse.badRequest(
				'No calendar connected. Please connect your Google Calendar first.'
			);
		}

		const body = await request.json();
		const { daysBack = 30, daysForward = 60, calendarsToAnalyze } = body;

		// Validate input
		if (daysBack < 0 || daysBack > 365) {
			return ApiResponse.validationError('daysBack', 'must be between 0 and 365');
		}

		if (daysForward < 0 || daysForward > 365) {
			return ApiResponse.validationError('daysForward', 'must be between 0 and 365');
		}

		// Start calendar analysis
		const analysisService = CalendarAnalysisService.getInstance(supabase);
		const result = await analysisService.analyzeUserCalendar(session.user.id, {
			daysBack,
			daysForward,
			calendarsToAnalyze
		});

		return ApiResponse.success(result);
	} catch (error) {
		const errorLogger = ErrorLoggerService.getInstance(supabase);
		errorLogger.logError(error, {
			operation: 'calendar_analyze_endpoint',
			endpoint: 'POST /api/calendar/analyze'
		});

		return ApiResponse.internalError(
			error,
			error instanceof Error ? error.message : 'Failed to analyze calendar'
		);
	}
};

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	try {
		const { session } = await safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized();
		}

		const analysisId = url.searchParams.get('analysisId');
		const analysisService = CalendarAnalysisService.getInstance(supabase);

		if (analysisId) {
			// Get specific analysis
			const history = await analysisService.getAnalysisHistory(session.user.id);
			const analysis = history.find((a) => a.id === analysisId);

			if (!analysis) {
				return ApiResponse.notFound('Analysis');
			}

			return ApiResponse.success({ analysis });
		} else {
			// Get analysis history
			const history = await analysisService.getAnalysisHistory(session.user.id);
			const calendarProjects = await analysisService.getCalendarProjects(session.user.id);

			return ApiResponse.success({ history, calendarProjects });
		}
	} catch (error) {
		const errorLogger = ErrorLoggerService.getInstance();
		errorLogger.logError(error, {
			operation: 'calendar_analyze_get_endpoint',
			endpoint: 'GET /api/calendar/analyze'
		});

		return ApiResponse.internalError(
			error,
			error instanceof Error ? error.message : 'Failed to get analysis data'
		);
	}
};
