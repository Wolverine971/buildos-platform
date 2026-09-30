// apps/web/src/routes/profile/agent-keys/[callerId]/requests/+page.server.ts
import { error, fail, redirect } from '@sveltejs/kit';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type { Actions, PageServerLoad } from './$types';
import { z } from 'zod';
export const load: PageServerLoad = async ({ locals, params, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) redirect(303, '/auth/login');
	const admin: any = createAdminSupabaseClient();
	const { data: caller } = await admin
		.from('external_agent_callers')
		.select('id,caller_key,provider,metadata,policy,permission_requests_enabled')
		.eq('id', params.callerId)
		.eq('user_id', user.id)
		.maybeSingle();
	if (!caller) error(404, 'Connection not found');
	const { data: feature } = await admin
		.from('agent_permission_feature')
		.select('enabled,epoch')
		.eq('id', true)
		.maybeSingle();
	let query = admin
		.from('agent_permission_requests')
		.select('id,status,capability,created_at,expires_at,epoch,project_id')
		.eq('caller_id', caller.id)
		.eq('user_id', user.id)
		.order('created_at', { ascending: false })
		.order('id', { ascending: false })
		.limit(30);
	const cursor = z
		.object({ before: z.string().datetime({ offset: true }), id: z.string().uuid() })
		.safeParse({
			before: url.searchParams.get('before'),
			id: url.searchParams.get('before_id')
		});
	if (cursor.success)
		query = query.or(
			`created_at.lt.${cursor.data.before},and(created_at.eq.${cursor.data.before},id.lt.${cursor.data.id})`
		);
	const [{ data: requests, error: requestError }, { data: grants }] = await Promise.all([
		query,
		admin
			.from('agent_permission_grants')
			.select('id,project_id,capability,grant_id')
			.eq('caller_id', caller.id)
			.eq('user_id', user.id)
			.eq('epoch', feature?.epoch ?? 0)
			.is('revoked_at', null)
	]);
	if (requestError) error(503, 'Permission requests are not available yet');
	return {
		caller,
		enabled: feature?.enabled ?? false,
		grants: feature?.enabled ? (grants ?? []) : [],
		requests: (requests ?? []).map((r: any) => ({
			...r,
			status:
				r.status === 'pending'
					? !feature?.enabled || feature.epoch !== r.epoch
						? 'canceled'
						: Date.parse(r.expires_at) <= Date.now()
							? 'expired'
							: 'pending'
					: r.status
		}))
	};
};
export const actions: Actions = {
	default: async ({ locals, params, request, url }) => {
		const { user } = await locals.safeGetSession();
		if (!user) redirect(303, '/auth/login');
		if (request.headers.get('origin') !== url.origin)
			return fail(403, { error: 'Invalid origin' });
		const form = await request.formData();
		const { error: err } = await (locals.supabase as any).rpc('control_agent_permissions', {
			p_caller: params.callerId,
			p_action: form.get('action'),
			p_grant: form.get('grant_id') || null
		});
		if (err) return fail(400, { error: err.message });
		return { success: true };
	}
};
