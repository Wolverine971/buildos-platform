// apps/web/src/routes/api/cron/welcome-sequence/+server.ts
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { PRIVATE_CRON_SECRET } from '$env/static/private';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { isAuthorizedCronRequest } from '$lib/utils/security';
import { ApiResponse } from '$lib/utils/api-response';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { WelcomeSequenceService } from '$lib/server/welcome-sequence.service';

function summarizeWelcomeSequenceErrors(
	errors: Array<{ userId: string; error: string }>
): string | null {
	if (errors.length === 0) {
		return null;
	}

	return errors
		.slice(0, 10)
		.map((entry) => `${entry.userId}: ${entry.error}`)
		.join(' | ')
		.slice(0, 1000);
}

export const GET: RequestHandler = async ({ request }) => {
	if (!isAuthorizedCronRequest(request, [env.CRON_SECRET, PRIVATE_CRON_SECRET])) {
		return ApiResponse.unauthorized();
	}

	const supabase = createAdminSupabaseClient();
	const service = new WelcomeSequenceService(supabase);
	const errorLogger = ErrorLoggerService.getInstance(supabase);

	try {
		const summary = await service.processDueSequences();
		const summarizedErrors = summarizeWelcomeSequenceErrors(summary.errors);

		for (const entry of summary.errors.slice(0, 25)) {
			console.error('Welcome sequence user processing failed:', entry);
			await errorLogger.logError(new Error(entry.error), {
				userId: entry.userId,
				endpoint: '/api/cron/welcome-sequence',
				httpMethod: 'GET',
				operationType: 'welcome_sequence_process_user',
				metadata: {
					jobName: 'welcome_sequence',
					failedUserId: entry.userId
				}
			});
		}

		await supabase.from('cron_logs').insert({
			job_name: 'welcome_sequence',
			status: summary.errors.length > 0 ? 'partial_success' : 'success',
			message: `Claimed ${summary.claimed}, evaluated ${summary.evaluated} welcome sequences, sent ${summary.sent}, skipped ${summary.skipped}, deferred ${summary.deferred}, retried ${summary.retried}, errored ${summary.errored}, completed ${summary.completed}, cancelled ${summary.cancelled}, suppressed ${summary.suppressed}`,
			error_message: summarizedErrors,
			executed_at: new Date().toISOString()
		});

		return ApiResponse.success(summary);
	} catch (error) {
		console.error('Welcome sequence cron error:', error);
		await errorLogger.logError(error, {
			endpoint: '/api/cron/welcome-sequence',
			httpMethod: 'GET',
			operationType: 'welcome_sequence_process'
		});

		await supabase.from('cron_logs').insert({
			job_name: 'welcome_sequence',
			status: 'error',
			error_message: error instanceof Error ? error.message : 'Unknown error',
			executed_at: new Date().toISOString()
		});

		return ApiResponse.internalError(error, 'Failed to process welcome sequence cron');
	}
};
