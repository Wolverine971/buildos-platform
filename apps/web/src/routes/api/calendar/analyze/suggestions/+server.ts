// src/routes/api/calendar/analyze/suggestions/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { CalendarAnalysisService } from '$lib/services/calendar-analysis.service';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';

/**
 * Accept or reject a calendar analysis suggestion
 */
export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	try {
		const { session } = await safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized();
		}

		const body = await request.json();
		const { suggestionId, action, modifications, reason } = body;

		// Validate input
		if (!suggestionId) {
			return ApiResponse.badRequest('suggestionId is required');
		}

		if (!action || !['accept', 'reject', 'defer'].includes(action)) {
			return ApiResponse.validationError('action', 'must be one of: accept, reject, defer');
		}

		const analysisService = CalendarAnalysisService.getInstance(supabase);
		let result;

		switch (action) {
			case 'accept':
				result = await analysisService.acceptSuggestion(
					suggestionId,
					session.user.id,
					modifications
				);
				break;

			case 'reject':
				result = await analysisService.rejectSuggestion(
					suggestionId,
					session.user.id,
					reason
				);
				break;

			case 'defer':
				// Defer for later review (could be implemented later)
				result = await analysisService.rejectSuggestion(
					suggestionId,
					session.user.id,
					'Deferred for later'
				);
				break;

			default:
				throw new Error('Invalid action');
		}

		if (!result.success) {
			return ApiResponse.badRequest(result.errors?.[0] || 'Failed to process suggestion');
		}

		return ApiResponse.success(
			{ project: action === 'accept' ? result.data : undefined },
			`Suggestion ${action}ed successfully`
		);
	} catch (error) {
		const errorLogger = ErrorLoggerService.getInstance();
		errorLogger.logError(error, {
			operation: 'calendar_suggestion_action',
			endpoint: 'POST /api/calendar/analyze/suggestions'
		});

		return ApiResponse.internalError(
			error,
			error instanceof Error ? error.message : 'Failed to process suggestion'
		);
	}
};

/**
 * Batch accept/reject multiple suggestions
 */
export const PATCH: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	try {
		const { session } = await safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized();
		}

		const body = await request.json();
		const { suggestions } = body;

		if (!Array.isArray(suggestions) || suggestions.length === 0) {
			return ApiResponse.validationError('suggestions', 'must be a non-empty array');
		}

		const analysisService = CalendarAnalysisService.getInstance(supabase);
		const results = [];

		for (const suggestion of suggestions) {
			const { suggestionId, action, modifications, reason } = suggestion;

			try {
				let result;

				switch (action) {
					case 'accept':
						result = await analysisService.acceptSuggestion(
							suggestionId,
							session.user.id,
							modifications
						);
						break;

					case 'reject':
						result = await analysisService.rejectSuggestion(
							suggestionId,
							session.user.id,
							reason
						);
						break;

					default:
						result = { success: false, errors: ['Invalid action'] };
				}

				results.push({
					suggestionId,
					action,
					success: result.success,
					project: result.data,
					error: result.errors?.[0]
				});
			} catch (error) {
				results.push({
					suggestionId,
					action,
					success: false,
					error: error instanceof Error ? error.message : 'Failed to process'
				});
			}
		}

		const successful = results.filter((r) => r.success).length;
		const failed = results.filter((r) => !r.success).length;

		return ApiResponse.success(
			{ results },
			`Processed ${successful} suggestion(s) successfully, ${failed} failed`
		);
	} catch (error) {
		const errorLogger = ErrorLoggerService.getInstance();
		errorLogger.logError(error, {
			operation: 'calendar_batch_suggestion_action',
			endpoint: 'PATCH /api/calendar/analyze/suggestions'
		});

		return ApiResponse.internalError(
			error,
			error instanceof Error ? error.message : 'Failed to process suggestions'
		);
	}
};
