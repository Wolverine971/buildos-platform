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

	const { data: workspaceDocs } = await supabase
		.from('onto_documents')
		.select('id, title, type_key, state_key, project_id, props, updated_at, created_at')
		.contains('props', { homework_run_id: runId })
		.order('created_at', { ascending: true });

	const { data: workspaceEdges } = await supabase
		.from('onto_edges')
		.select('id, src_id, dst_id, rel, props')
		.contains('props', { homework_run_id: runId });

	const { data: scratchpad } = await supabase
		.from('onto_documents')
		.select('id, title, content')
		.contains('props', { homework_run_id: runId, doc_role: 'scratchpad' })
		.order('updated_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	const { data: executorPads } = await supabase
		.from('onto_documents')
		.select('id, title, content, props, updated_at, created_at')
		.contains('props', { homework_run_id: runId, doc_role: 'scratchpad_exec' })
		.order('updated_at', { ascending: false })
		.limit(50);

	return {
		run: run as HomeworkRunRow,
		iterations: (iterations ?? []) as HomeworkIterationRow[],
		events: (events ?? []) as HomeworkEventRow[],
		workspaceDocs: workspaceDocs ?? [],
		workspaceEdges: workspaceEdges ?? [],
		scratchpad: scratchpad ?? null,
		executorPads: executorPads ?? []
	};
};
