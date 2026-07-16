export const config = {
	maxDuration: 300
};

import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { PRIVATE_CRON_SECRET } from '$env/static/private';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';
import { isAuthorizedCronRequest } from '$lib/utils/security';
import {
	processDueAccountDeletions,
	retryPendingDeletionSubscriptionCancellations
} from '$lib/server/account-deletion';
import { deleteExpiredLegalAcceptanceIntents } from '$lib/server/legal-acceptance';

export const GET: RequestHandler = async ({ request }) => {
	if (!isAuthorizedCronRequest(request, [env.CRON_SECRET, PRIVATE_CRON_SECRET])) {
		return ApiResponse.unauthorized();
	}

	const admin = createAdminSupabaseClient();
	const executedAt = new Date().toISOString();

	try {
		const expiredAcceptanceIntents = await deleteExpiredLegalAcceptanceIntents();
		const billing = await retryPendingDeletionSubscriptionCancellations();
		const deletion = await processDueAccountDeletions();

		await admin.from('cron_logs').insert({
			job_name: 'account_deletions',
			status: 'success',
			message: `Claimed ${deletion.claimed}; completed ${deletion.completed}; failed ${deletion.failed}; removed ${deletion.storageObjectsRemoved} storage object(s); retried ${billing.processed} billing cancellation(s); deleted ${expiredAcceptanceIntents} expired acceptance intent(s).`,
			executed_at: executedAt
		});

		return ApiResponse.success({ billing, deletion, expiredAcceptanceIntents });
	} catch (error) {
		console.error('Account deletion cron error:', error);
		await admin.from('cron_logs').insert({
			job_name: 'account_deletions',
			status: 'error',
			error_message: error instanceof Error ? error.message : String(error),
			executed_at: executedAt
		});
		return ApiResponse.internalError(error, 'Failed to process account deletions');
	}
};
