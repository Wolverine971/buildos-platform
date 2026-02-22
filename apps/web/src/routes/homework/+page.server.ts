// apps/web/src/routes/homework/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Database } from '@buildos/shared-types';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';

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
	let actorId: string;
	try {
		actorId = await ensureActorId(supabase, user.id);
	} catch (error) {
		console.error('[Homework] Failed to resolve actor', error);
		return {
			runs: [] as HomeworkRunWithProjects[],
			projects: [] as ProjectRow[],
			error: 'Failed to load homework projects.'
		};
	}
	const { data, error } = await supabase
		.from('homework_runs')
		.select('*')
		.eq('user_id', user.id)
		.order('created_at', { ascending: false })
		.limit(50);

	// Load projects scoped to this user (owner or active member), excluding soft-deleted.
	const { data: memberRows, error: memberError } = await supabase
		.from('onto_project_members')
		.select('project_id')
		.eq('actor_id', actorId)
		.is('removed_at', null);

	if (memberError) {
		console.error('[Homework] Failed to load project memberships', memberError);
	}

	const memberProjectIds = Array.from(
		new Set((memberRows ?? []).map((row) => row.project_id).filter(Boolean))
	);

	const projectScopeFilter = memberProjectIds.length
		? `created_by.eq.${actorId},id.in.(${memberProjectIds.join(',')})`
		: `created_by.eq.${actorId}`;

	const { data: projects, error: projectsError } = await supabase
		.from('onto_projects')
		.select('id, name, type_key, state_key, created_at')
		.or(projectScopeFilter)
		.is('deleted_at', null)
		.order('created_at', { ascending: false })
		.limit(200);

	if (projectsError) {
		console.error('[Homework] Failed to load scoped projects', projectsError);
	}

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
