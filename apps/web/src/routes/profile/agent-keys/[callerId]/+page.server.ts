// apps/web/src/routes/profile/agent-keys/[callerId]/+page.server.ts
import { error as kitError, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	CallerProvisioningError,
	CallerProvisioningService
} from '$lib/server/agent-call/caller-provisioning.service';

export const load: PageServerLoad = async ({ locals: { safeGetSession }, params, url }) => {
	const { user } = await safeGetSession();
	if (!user) {
		throw redirect(303, '/auth/login');
	}

	try {
		const service = new CallerProvisioningService();
		return {
			usageDetail: await service.getUsageDetailForUser(user.id, params.callerId, {
				range: url.searchParams.get('range')
			})
		};
	} catch (error) {
		if (error instanceof CallerProvisioningError) {
			throw kitError(error.status, error.message);
		}

		console.error('Failed to load agent caller usage detail:', error);
		throw kitError(500, 'Failed to load agent usage detail');
	}
};
