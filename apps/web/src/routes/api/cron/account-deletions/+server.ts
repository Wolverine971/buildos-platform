// apps/web/src/routes/api/cron/account-deletions/+server.ts
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
	alertOverdueAccountDeletions,
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
		const overdueDeletions = await alertOverdueAccountDeletions();
		const unhealthy = deletion.failed > 0 || overdueDeletions > 0;

		await admin.from('cron_logs').insert({
			job_name: 'account_deletions',
			status: unhealthy ? 'error' : 'success',
			error_message: unhealthy
				? `${deletion.failed} deletion(s) failed this run; ${overdueDeletions} request(s) more than 24h past their scheduled time`
				: null,
			message: `Claimed ${deletion.claimed}; completed ${deletion.completed}; failed ${deletion.failed}; removed ${deletion.storageObjectsRemoved} storage object(s), ${deletion.gmailConnectionsDeleted} Gmail connection(s), ${deletion.calendarConnectionsDeleted} Calendar connection(s), and ${deletion.calendarLegacyTokensDeleted} legacy Calendar token row(s); confirmed ${deletion.gmailRemoteRevocationsSucceeded} Gmail revocation(s), ${deletion.gmailRemoteRevocationsUnconfirmed} unconfirmed; confirmed ${deletion.calendarRemoteRevocationsSucceeded} Calendar revocation(s), ${deletion.calendarRemoteRevocationsUnconfirmed} unconfirmed; PostHog persons deleted ${deletion.posthogPersonsDeleted}, skipped ${deletion.posthogDeletionsSkipped}, failed ${deletion.posthogDeletionsFailed}; ${overdueDeletions} overdue; retried ${billing.processed} billing cancellation(s); deleted ${expiredAcceptanceIntents} expired acceptance intent(s).`,
			executed_at: executedAt
		});

		return ApiResponse.success({
			billing,
			deletion,
			overdueDeletions,
			expiredAcceptanceIntents
		});
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
