import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CalendarAnalysisService } from '$lib/services/calendar-analysis.service';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';

/**
 * Accept or reject a calendar analysis suggestion
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const session = await locals.auth();
		if (!session?.user) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const body = await request.json();
		const { suggestionId, action, modifications, reason } = body;

		// Validate input
		if (!suggestionId) {
			return json(
				{
					success: false,
					error: 'suggestionId is required'
				},
				{ status: 400 }
			);
		}

		if (!action || !['accept', 'reject', 'defer'].includes(action)) {
			return json(
				{
					success: false,
					error: 'action must be one of: accept, reject, defer'
				},
				{ status: 400 }
			);
		}

		const analysisService = CalendarAnalysisService.getInstance();
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
			return json(
				{
					success: false,
					error: result.errors?.[0] || 'Failed to process suggestion'
				},
				{ status: 400 }
			);
		}

		return json({
			success: true,
			message: `Suggestion ${action}ed successfully`,
			project: action === 'accept' ? result.data : undefined
		});
	} catch (error) {
		const errorLogger = ErrorLoggerService.getInstance();
		errorLogger.logError(error, {
			operation: 'calendar_suggestion_action',
			endpoint: 'POST /api/calendar/analyze/suggestions'
		});

		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to process suggestion'
			},
			{ status: 500 }
		);
	}
};

/**
 * Batch accept/reject multiple suggestions
 */
export const PATCH: RequestHandler = async ({ request, locals }) => {
	try {
		const session = await locals.auth();
		if (!session?.user) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const body = await request.json();
		const { suggestions } = body;

		if (!Array.isArray(suggestions) || suggestions.length === 0) {
			return json(
				{
					success: false,
					error: 'suggestions must be a non-empty array'
				},
				{ status: 400 }
			);
		}

		const analysisService = CalendarAnalysisService.getInstance();
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

		return json({
			success: true,
			message: `Processed ${successful} suggestion(s) successfully, ${failed} failed`,
			results
		});
	} catch (error) {
		const errorLogger = ErrorLoggerService.getInstance();
		errorLogger.logError(error, {
			operation: 'calendar_batch_suggestion_action',
			endpoint: 'PATCH /api/calendar/analyze/suggestions'
		});

		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to process suggestions'
			},
			{ status: 500 }
		);
	}
};
