// apps/web/src/routes/homework/runs/[id]/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Database } from '@buildos/shared-types';

type HomeworkRunRow = Database['public']['Tables']['homework_runs']['Row'];
type HomeworkIterationRow = Database['public']['Tables']['homework_run_iterations']['Row'];
type HomeworkEventRow = Database['public']['Tables']['homework_run_events']['Row'];

export const load: PageServerLoad = async ({ locals, params }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		throw redirect(303, '/auth/login');
	}

	const supabase = locals.supabase;
	const runId = params.id;

	const { data: run, error: runError } = await supabase
		.from('homework_runs')
		.select('*')
		.eq('id', runId)
		.eq('user_id', user.id)
		.single();

	if (runError || !run) {
		throw redirect(303, '/homework');
	}

	const { data: iterations } = await supabase
		.from('homework_run_iterations')
		.select('*')
		.eq('run_id', runId)
		.order('iteration', { ascending: false })
		.limit(50);

	const { data: events } = await supabase
		.from('homework_run_events')
		.select('*')
		.eq('run_id', runId)
		.order('seq', { ascending: false })
		.limit(200);

	return {
		run: run as HomeworkRunRow,
		iterations: (iterations ?? []) as HomeworkIterationRow[],
		events: (events ?? []) as HomeworkEventRow[]
	};
};
