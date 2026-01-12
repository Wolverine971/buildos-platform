// apps/web/src/routes/admin/ontology/graph/+page.server.ts
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type {
	GraphStats,
	OntoDocument,
	OntoEdge,
	OntoGoal,
	OntoMilestone,
	OntoPlan,
	OntoProject,
	OntoRisk,
	OntoTask
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
		const [
			projectsRes,
			edgesRes,
			tasksRes,
			documentsRes,
			plansRes,
			goalsRes,
			milestonesRes,
			risksRes
		] = await Promise.all([
			adminClient.from('onto_projects').select('*'),
			adminClient.from('onto_edges').select('*'),
			adminClient.from('onto_tasks').select('*'),
			adminClient.from('onto_documents').select('*'),
			adminClient.from('onto_plans').select('*'),
			adminClient.from('onto_goals').select('*'),
			adminClient.from('onto_milestones').select('*'),
			adminClient.from('onto_risks').select('*')
		]);

		if (projectsRes.error) throw projectsRes.error;
		if (edgesRes.error) throw edgesRes.error;
		if (tasksRes.error) throw tasksRes.error;
		if (documentsRes.error) throw documentsRes.error;
		if (plansRes.error) throw plansRes.error;
		if (goalsRes.error) throw goalsRes.error;
		if (milestonesRes.error) throw milestonesRes.error;
		if (risksRes.error) throw risksRes.error;

		const projects = (projectsRes.data ?? []) as OntoProject[];
		const edges = ((edgesRes.data ?? []) as OntoEdge[]).filter(
			(edge) => edge.src_kind !== 'template' && edge.dst_kind !== 'template'
		);
		const tasks = (tasksRes.data ?? []) as OntoTask[];
		const documents = (documentsRes.data ?? []) as OntoDocument[];
		const plans = (plansRes.data ?? []) as OntoPlan[];
		const goals = (goalsRes.data ?? []) as OntoGoal[];
		const milestones = (milestonesRes.data ?? []) as OntoMilestone[];
		const risks = (risksRes.data ?? []) as OntoRisk[];

		const stats: GraphStats = {
			totalProjects: projects.length,
			activeProjects: projects.filter((project) => project.state_key === 'active').length,
			totalEdges: edges.length,
			totalTasks: tasks.length,
			totalDocuments: documents.length,
			totalPlans: plans.length,
			totalGoals: goals.length,
			totalMilestones: milestones.length,
			totalRisks: risks.length
		};

		return {
			projects,
			edges,
			tasks,
			documents,
			plans,
			goals,
			milestones,
			risks,
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
