// apps/web/src/routes/profile/agent-keys/[callerId]/requests/[requestId]/+page.server.ts
import { error, fail, redirect } from '@sveltejs/kit';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type { AgentPermissionRequest } from '@buildos/shared-types';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals, params }) => {
	const { user } = await locals.safeGetSession();
	if (!user) redirect(303, '/auth/login');
	const admin: any = createAdminSupabaseClient();
	const { data: row } = await admin
		.from('agent_permission_requests')
		.select('*')
		.eq('id', params.requestId)
		.eq('caller_id', params.callerId)
		.eq('user_id', user.id)
		.maybeSingle();
	if (!row) error(404, 'Request not found');
	const { data: canRead } = await locals.supabase.rpc('current_actor_has_project_member_access', {
		p_project_id: row.project_id,
		p_required_access: 'read'
	});
	if (!canRead) error(403, 'Project access is no longer available');
	const [{ data: caller }, { data: project }, { data: feature }] = await Promise.all([
		admin
			.from('external_agent_callers')
			.select('caller_key,provider,metadata')
			.eq('id', params.callerId)
			.maybeSingle(),
		admin.from('onto_projects').select('name').eq('id', row.project_id).maybeSingle(),
		admin.from('agent_permission_feature').select('enabled,epoch').eq('id', true).maybeSingle()
	]);
	if (row.status === 'pending' && (!feature?.enabled || row.epoch !== feature.epoch))
		row.status = 'canceled';
	else if (row.status === 'pending' && Date.parse(row.expires_at) <= Date.now())
		row.status = 'expired';
	return {
		request: row as AgentPermissionRequest,
		caller,
		projectName: project?.name ?? 'Project'
	};
};
export const actions: Actions = {
	default: async ({ locals, params, request, url }) => {
		const { user } = await locals.safeGetSession();
		if (!user) redirect(303, '/auth/login');
		if (request.headers.get('origin') !== url.origin)
			return fail(403, { error: 'Invalid origin' });
		const form = await request.formData();
		if (
			typeof form.get('digest') !== 'string' ||
			!['once', 'always', 'deny'].includes(String(form.get('decision')))
		)
			return fail(400, { error: 'Choose a decision for the reviewed change' });
		// The owner session is essential: never use the service-role client for this RPC.
		const { data, error: err } = await (locals.supabase as any).rpc(
			'decide_agent_permission_request',
			{
				p_id: params.requestId,
				p_digest: form.get('digest'),
				p_decision: form.get('decision')
			}
		);
		if (err) return fail(409, { error: err.message });
		if (data.status === 'applied') {
			try {
				await (createAdminSupabaseClient() as any).rpc('maintain_agent_permission_work', {
					p_request: params.requestId,
					p_batch_size: 1
				});
			} catch {
				/* Durable work is retried by maintenance. */
			}
		}
		return { status: data.status };
	}
};
