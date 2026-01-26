// apps/web/src/routes/homework/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Database } from '@buildos/shared-types';

type HomeworkRunRow = Database['public']['Tables']['homework_runs']['Row'];
type ProjectRow = Database['public']['Tables']['onto_projects']['Row'];

export interface HomeworkRunWithProjects extends HomeworkRunRow {
	project_names: string[];
}

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

	// Load projects the user can access (membership)
	const { data: projects } = await supabase
		.from('onto_projects')
		.select('id, name, type_key, state_key, created_at')
		.order('created_at', { ascending: false })
		.limit(200);

	if (error) {
		console.error('[Homework] Failed to load runs', error);
		return {
			runs: [] as HomeworkRunWithProjects[],
			projects: (projects ?? []) as ProjectRow[],
			error: 'Failed to load homework runs.'
		};
	}

	// Create a map of project IDs to names for quick lookup
	const projectMap = new Map<string, string>();
	for (const project of projects ?? []) {
		projectMap.set(project.id, project.name);
	}

	// Enrich runs with project names
	const runsWithProjects: HomeworkRunWithProjects[] = (data ?? []).map((run) => {
		const projectNames: string[] = [];
		if (run.project_ids && Array.isArray(run.project_ids)) {
			for (const pid of run.project_ids) {
				const name = projectMap.get(pid);
				if (name) {
					projectNames.push(name);
				}
			}
		}
		return {
			...run,
			project_names: projectNames
		};
	});

	return {
		runs: runsWithProjects,
		projects: (projects ?? []) as ProjectRow[],
		error: null
	};
};
