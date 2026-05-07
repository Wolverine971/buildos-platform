// apps/web/src/routes/api/cron/reactivation-sequence/+server.ts

export const config = {
	maxDuration: 60
};

import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { PRIVATE_CRON_SECRET } from '$env/static/private';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { RetargetingPilotService } from '$lib/server/retargeting-pilot.service';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { isAuthorizedCronRequest } from '$lib/utils/security';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ request, url }) => {
	if (!isAuthorizedCronRequest(request, [env.CRON_SECRET, PRIVATE_CRON_SECRET])) {
		return ApiResponse.unauthorized();
	}

	const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '50', 10);
	const limit = Number.isFinite(limitParam) ? limitParam : 50;
	const supabase = createAdminSupabaseClient();
	const service = new RetargetingPilotService(supabase);
	const errorLogger = ErrorLoggerService.getInstance(supabase);

	try {
		const summary = await service.processDueSends({ limit });

		await supabase.from('cron_logs').insert({
			job_name: 'reactivation_sequence',
			status: summary.counts.failed > 0 ? 'partial_success' : 'success',
			message: `Claimed ${summary.claimed}, sent ${summary.counts.sent}, skipped ${summary.counts.skipped}, failed ${summary.counts.failed}`,
			error_message:
				summary.counts.failed > 0
					? summary.results
							.filter((result) => result.status === 'failed')
							.slice(0, 10)
							.map((result) => `${result.email}: ${result.reason}`)
							.join(' | ')
					: null,
			executed_at: new Date().toISOString()
		});

		return ApiResponse.success(summary);
	} catch (error) {
		await errorLogger.logError(error, {
			endpoint: '/api/cron/reactivation-sequence',
			httpMethod: 'GET',
			operationType: 'reactivation_sequence_process'
		});

		await supabase.from('cron_logs').insert({
			job_name: 'reactivation_sequence',
			status: 'error',
			error_message: error instanceof Error ? error.message : 'Unknown error',
			executed_at: new Date().toISOString()
		});

		return ApiResponse.internalError(error, 'Failed to process reactivation sequence cron');
	}
};
