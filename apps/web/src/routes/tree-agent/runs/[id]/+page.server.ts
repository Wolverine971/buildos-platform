// apps/web/src/routes/tree-agent/runs/[id]/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/auth/login');

	const runId = params.id;
	const sb = locals.supabase as any;

	const { data: run, error: runError } = await sb
		.from('tree_agent_runs')
		.select('*')
		.eq('id', runId)
		.eq('user_id', user.id)
		.single();

	if (runError || !run) throw redirect(303, '/tree-agent');

	const { data: events } = await sb
		.from('tree_agent_events')
		.select('*')
		.eq('run_id', runId)
		.order('seq', { ascending: false })
		.limit(200);

	let projectsMap: Record<string, { id: string; name: string }> | undefined;
	const contextProjectId = run?.metrics?.context?.project_id;
	if (contextProjectId) {
		const { data: projects } = await sb
			.from('onto_projects')
			.select('id,name')
			.in('id', [contextProjectId]);
		if (projects && projects.length > 0) {
			projectsMap = Object.fromEntries(projects.map((project: any) => [project.id, project]));
		}
	}

	return {
		run,
		events: events ?? [],
		projectsMap
	};
};
