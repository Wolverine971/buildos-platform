// apps/web/src/routes/tree-agent/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/auth/login');

	const sb = locals.supabase as any;
	const { data: runs } = await sb
		.from('tree_agent_runs')
		.select('*')
		.eq('user_id', user.id)
		.order('created_at', { ascending: false })
		.limit(50);

	return {
		runs: runs ?? []
	};
};
