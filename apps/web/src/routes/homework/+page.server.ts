// apps/web/src/routes/homework/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Database } from '@buildos/shared-types';

type HomeworkRunRow = Database['public']['Tables']['homework_runs']['Row'];

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		throw redirect(303, '/auth/login');
	}

	const supabase = locals.supabase;
	const { data, error } = await supabase
		.from('homework_runs')
		.select('*')
		.eq('user_id', user.id)
		.order('created_at', { ascending: false })
		.limit(50);

	if (error) {
		console.error('[Homework] Failed to load runs', error);
		return {
			runs: [] as HomeworkRunRow[],
			error: 'Failed to load homework runs.'
		};
	}

	return {
		runs: (data ?? []) as HomeworkRunRow[],
		error: null
	};
};
