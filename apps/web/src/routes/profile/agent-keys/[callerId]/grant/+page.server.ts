// apps/web/src/routes/profile/agent-keys/[callerId]/grant/+page.server.ts
//
// One-click project grant for a connected agent. Agents link here from a
// `project_not_granted_to_connector` denial; the signed-in owner decides.
import { error as kitError, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	CallerProvisioningError,
	CallerProvisioningService
} from '$lib/server/agent-call/caller-provisioning.service';

function loginRedirect(url: URL): never {
	throw redirect(303, `/auth/login?redirect=${encodeURIComponent(url.pathname + url.search)}`);
}

export const load: PageServerLoad = async ({ locals: { safeGetSession }, params, url }) => {
	const { user } = await safeGetSession();
	if (!user) loginRedirect(url);

	const requestedProjectId = url.searchParams.get('project');
	try {
		const service = new CallerProvisioningService();
		return {
			requestedProjectId,
			grant: await service.getProjectGrantContextForUser(
				user.id,
				params.callerId,
				requestedProjectId
			)
		};
	} catch (error) {
		if (error instanceof CallerProvisioningError) {
			throw kitError(error.status, error.message);
		}
		console.error('Failed to load connector grant page:', error);
		throw kitError(500, 'Failed to load connector access');
	}
};

export const actions: Actions = {
	grant: async ({ locals: { safeGetSession }, params, request, url }) => {
		const { user } = await safeGetSession();
		if (!user) loginRedirect(url);

		const formData = await request.formData();
		const projectIds = formData
			.getAll('project_id')
			.filter((value): value is string => typeof value === 'string');
		try {
			const result = await new CallerProvisioningService().grantProjectsForUser(
				user.id,
				params.callerId,
				projectIds
			);
			return { outcome: 'granted' as const, count: result.granted_project_ids.length };
		} catch (error) {
			if (error instanceof CallerProvisioningError) {
				return fail(error.status, { error: error.message });
			}
			console.error('Failed to grant connector project access:', error);
			return fail(500, { error: 'Failed to grant project access' });
		}
	},

	all: async ({ locals: { safeGetSession }, params, url }) => {
		const { user } = await safeGetSession();
		if (!user) loginRedirect(url);

		try {
			await new CallerProvisioningService().switchToAllProjectsForUser(
				user.id,
				params.callerId
			);
			return { outcome: 'switched' as const, count: 0 };
		} catch (error) {
			if (error instanceof CallerProvisioningError) {
				return fail(error.status, { error: error.message });
			}
			console.error('Failed to switch connector to all projects:', error);
			return fail(500, { error: 'Failed to update connector access' });
		}
	}
};
