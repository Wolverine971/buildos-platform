// apps/web/src/routes/profile/agent-keys/[callerId]/grant/+page.server.ts
//
// One-click access for a connected agent. Agents link here from a refusal the person
// can clear themselves (tasker 140): a project this connection hasn't been given
// (`?project=`), or changes it isn't allowed to make yet (`?project=&need=write`).
// The signed-in person decides. Nothing here rotates a key.
import { error as kitError, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	CallerProvisioningError,
	CallerProvisioningService
} from '$lib/server/agent-call/caller-provisioning.service';
import { getSecurityEventLogOptions } from '$lib/server/security-event-logger';
import { sendPeopleRequestReceivedEmail } from '$lib/server/people/people-emails';
import { isValidUUID } from '$lib/utils/operations/validation-utils';

function loginRedirect(url: URL): never {
	throw redirect(303, `/auth/login?redirect=${encodeURIComponent(url.pathname + url.search)}`);
}

function failFrom(error: unknown, fallback: string) {
	if (error instanceof CallerProvisioningError) {
		const reason =
			error.data && typeof error.data === 'object'
				? (error.data as { reason?: unknown }).reason
				: null;
		return fail(error.status, {
			error: error.message,
			reconnect: reason === 'reconnect_to_allow_changes'
		});
	}
	console.error(`${fallback}:`, error);
	return fail(500, { error: fallback, reconnect: false });
}

export const load: PageServerLoad = async ({ locals: { safeGetSession }, params, url }) => {
	const { user } = await safeGetSession();
	if (!user) loginRedirect(url);

	const requestedProjectId = url.searchParams.get('project');
	const need = url.searchParams.get('need') === 'write' ? 'write' : null;
	try {
		const service = new CallerProvisioningService();
		return {
			requestedProjectId,
			need,
			grant: await service.getProjectGrantContextForUser(
				user.id,
				params.callerId,
				requestedProjectId,
				{ need }
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
	grant: async ({ locals: { safeGetSession }, params, request, url, platform }) => {
		const { user } = await safeGetSession();
		if (!user) loginRedirect(url);

		const formData = await request.formData();
		const projectIds = formData
			.getAll('project_id')
			.filter((value): value is string => typeof value === 'string');
		const service = new CallerProvisioningService(
			undefined,
			getSecurityEventLogOptions(platform)
		);
		try {
			const result = await service.grantProjectsForUser(user.id, params.callerId, projectIds);
			// "Also let it into projects shared with me later", ticked next to a shared project.
			if (formData.get('include_shared') === 'on') {
				await service.setIncludeSharedProjectsForUser(user.id, params.callerId, true);
			}
			return { outcome: 'granted' as const, count: result.granted_project_ids.length };
		} catch (error) {
			return failFrom(error, 'Failed to grant project access');
		}
	},

	all: async ({ locals: { safeGetSession }, params, url, platform }) => {
		const { user } = await safeGetSession();
		if (!user) loginRedirect(url);

		try {
			await new CallerProvisioningService(
				undefined,
				getSecurityEventLogOptions(platform)
			).switchToAllProjectsForUser(user.id, params.callerId);
			return { outcome: 'switched' as const, count: 0 };
		} catch (error) {
			return failFrom(error, 'Failed to update connector access');
		}
	},

	allowWrites: async ({ locals: { safeGetSession }, params, request, url, platform }) => {
		const { user } = await safeGetSession();
		if (!user) loginRedirect(url);

		const formData = await request.formData();
		const rawProjectId = formData.get('project_id');
		const projectId = typeof rawProjectId === 'string' && rawProjectId ? rawProjectId : null;
		const service = new CallerProvisioningService(
			undefined,
			getSecurityEventLogOptions(platform)
		);
		try {
			await service.allowWritesForUser(user.id, params.callerId, projectId);
			// The link can come before the project was ever given to this connection.
			if (projectId && formData.get('also_grant') === 'true') {
				await service.grantProjectsForUser(user.id, params.callerId, [projectId]);
			}
			return { outcome: 'writes_allowed' as const, count: 0 };
		} catch (error) {
			return failFrom(error, 'Failed to allow changes');
		}
	},

	// The owner's setting is in the way: ask them from here, as the person (not the agent).
	// The request names this connection, so approval also lets it into the project.
	askOwner: async ({ locals: { safeGetSession, supabase }, params, request, url }) => {
		const { user } = await safeGetSession();
		if (!user) loginRedirect(url);

		const formData = await request.formData();
		const projectId = formData.get('project_id');
		const need = formData.get('need');
		if (typeof projectId !== 'string' || !isValidUUID(projectId)) {
			return fail(400, { error: 'Unknown project', reconnect: false });
		}
		if (!isValidUUID(params.callerId)) {
			return fail(404, { error: 'Unknown connection', reconnect: false });
		}
		const { data, error } = await (supabase as any).rpc('create_project_upgrade_request', {
			p_project_ids: [projectId],
			p_need: need === 'agents_write' || need === 'edit' ? need : 'agents_read',
			p_for_caller_id: params.callerId
		});
		if (error) {
			console.error('Failed to ask the project owner:', error);
			return fail(500, { error: 'Could not send the request. Try again.', reconnect: false });
		}
		const outcome = (data ?? {}) as {
			status?: unknown;
			request_id?: unknown;
			already_pending?: unknown;
		};
		if (
			outcome.status === 'pending' &&
			typeof outcome.request_id === 'string' &&
			outcome.already_pending !== true
		) {
			await sendPeopleRequestReceivedEmail(outcome.request_id);
		}
		return {
			outcome: 'asked' as const,
			count: 0,
			askStatus: typeof outcome.status === 'string' ? outcome.status : 'unknown'
		};
	},

	sharedProjects: async ({ locals: { safeGetSession }, params, request, url, platform }) => {
		const { user } = await safeGetSession();
		if (!user) loginRedirect(url);

		const formData = await request.formData();
		const enabled = formData.get('enabled') === 'true';
		try {
			await new CallerProvisioningService(
				undefined,
				getSecurityEventLogOptions(platform)
			).setIncludeSharedProjectsForUser(user.id, params.callerId, enabled);
			return {
				outcome: enabled ? ('shared_on' as const) : ('shared_off' as const),
				count: 0
			};
		} catch (error) {
			return failFrom(error, 'Failed to update connector access');
		}
	}
};
