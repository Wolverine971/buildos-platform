// apps/web/src/routes/admin/ontology/graph/+page.server.ts
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type {
	GraphStats,
	OntoDocument,
	OntoEdge,
	OntoOutput,
	OntoProject,
	OntoTask,
	OntoTemplate
} from '$lib/components/ontology/graph/lib/graph.types';

export const load: PageServerLoad = async ({ locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		throw redirect(303, '/auth/login');
	}

	const { data: dbUser, error: dbUserError } = await supabase
		.from('users')
		.select('is_admin, email')
		.eq('id', user.id)
		.single();

	if (dbUserError) {
		console.error('[Admin][Ontology Graph] Failed to verify admin user:', dbUserError);
		throw error(500, 'Unable to verify admin access');
	}

	if (!dbUser?.is_admin) {
		throw redirect(303, '/');
	}

	const adminClient = createAdminSupabaseClient();

	try {
		const [templatesRes, projectsRes, edgesRes, tasksRes, outputsRes, documentsRes] =
			await Promise.all([
				adminClient.from('onto_templates').select('*').eq('status', 'active'),
				adminClient.from('onto_projects').select('*'),
				adminClient.from('onto_edges').select('*'),
				adminClient.from('onto_tasks').select('*'),
				adminClient.from('onto_outputs').select('*'),
				adminClient.from('onto_documents').select('*')
			]);

		if (templatesRes.error) throw templatesRes.error;
		if (projectsRes.error) throw projectsRes.error;
		if (edgesRes.error) throw edgesRes.error;
		if (tasksRes.error) throw tasksRes.error;
		if (outputsRes.error) throw outputsRes.error;
		if (documentsRes.error) throw documentsRes.error;

		const templates = (templatesRes.data ?? []) as OntoTemplate[];
		const projects = (projectsRes.data ?? []) as OntoProject[];
		const edges = (edgesRes.data ?? []) as OntoEdge[];
		const tasks = (tasksRes.data ?? []) as OntoTask[];
		const outputs = (outputsRes.data ?? []) as OntoOutput[];
		const documents = (documentsRes.data ?? []) as OntoDocument[];

		const stats: GraphStats = {
			totalTemplates: templates.length,
			totalProjects: projects.length,
			activeProjects: projects.filter((project) => project.state_key === 'active').length,
			totalEdges: edges.length,
			totalTasks: tasks.length,
			totalOutputs: outputs.length,
			totalDocuments: documents.length
		};

		return {
			templates,
			projects,
			edges,
			tasks,
			outputs,
			documents,
			stats,
			user: {
				id: user.id,
				email: dbUser.email ?? user.email,
				isAdmin: true
			}
		};
	} catch (err) {
		console.error('[Admin][Ontology Graph] Failed to load ontology data:', err);
		throw error(500, 'Failed to load ontology data');
	}
};
