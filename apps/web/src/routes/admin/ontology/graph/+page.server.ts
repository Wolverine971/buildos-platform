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

const ADMIN_GRAPH_PROJECT_LIMIT = 25;
const ADMIN_GRAPH_ENTITY_LIMIT = 300;
const ADMIN_GRAPH_EDGE_LIMIT = 1200;

const PROJECT_GRAPH_COLUMNS = [
	'id',
	'name',
	'description',
	'type_key',
	'state_key',
	'props',
	'start_at',
	'end_at',
	'next_step_short',
	'next_step_long',
	'next_step_source',
	'next_step_updated_at',
	'facet_context',
	'facet_scale',
	'facet_stage',
	'created_by',
	'created_at',
	'updated_at',
	'archived_at'
].join(', ');

const TASK_GRAPH_COLUMNS = [
	'id',
	'project_id',
	'type_key',
	'title',
	'description',
	'state_key',
	'priority',
	'props',
	'created_by',
	'created_at',
	'updated_at',
	'start_at',
	'completed_at',
	'due_at',
	'archived_at',
	'deleted_at'
].join(', ');

const DOCUMENT_GRAPH_COLUMNS = [
	'id',
	'project_id',
	'type_key',
	'title',
	'state_key',
	'description',
	'props',
	'children',
	'created_by',
	'created_at',
	'updated_at',
	'archived_at',
	'deleted_at'
].join(', ');

const PLAN_GRAPH_COLUMNS = [
	'id',
	'project_id',
	'type_key',
	'name',
	'plan',
	'description',
	'state_key',
	'props',
	'created_by',
	'created_at',
	'updated_at',
	'archived_at',
	'deleted_at'
].join(', ');

const GOAL_GRAPH_COLUMNS = [
	'id',
	'project_id',
	'type_key',
	'name',
	'goal',
	'description',
	'state_key',
	'target_date',
	'props',
	'created_by',
	'created_at',
	'updated_at',
	'completed_at',
	'archived_at',
	'deleted_at'
].join(', ');

const MILESTONE_GRAPH_COLUMNS = [
	'id',
	'project_id',
	'title',
	'type_key',
	'state_key',
	'due_at',
	'milestone',
	'description',
	'props',
	'created_by',
	'created_at',
	'updated_at',
	'completed_at',
	'archived_at',
	'deleted_at'
].join(', ');

const RISK_GRAPH_COLUMNS = [
	'id',
	'project_id',
	'title',
	'type_key',
	'probability',
	'impact',
	'state_key',
	'props',
	'created_by',
	'created_at',
	'updated_at',
	'mitigated_at',
	'archived_at',
	'deleted_at'
].join(', ');

const EDGE_GRAPH_COLUMNS = [
	'id',
	'src_id',
	'src_kind',
	'dst_id',
	'dst_kind',
	'rel',
	'props',
	'created_at',
	'project_id'
].join(', ');

function rowsAs<T>(rows: unknown): T[] {
	return Array.isArray(rows) ? (rows as T[]) : [];
}

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
		const projectsRes = await adminClient
			.from('onto_projects')
			.select(PROJECT_GRAPH_COLUMNS)
			.is('deleted_at', null)
			.order('updated_at', { ascending: false })
			.limit(ADMIN_GRAPH_PROJECT_LIMIT);

		if (projectsRes.error) throw projectsRes.error;

		const projects = rowsAs<OntoProject>(projectsRes.data);
		const projectIds = projects.map((project) => project.id).filter(Boolean);

		if (projectIds.length === 0) {
			const stats: GraphStats = {
				totalProjects: 0,
				activeProjects: 0,
				totalEdges: 0,
				totalTasks: 0,
				totalDocuments: 0,
				totalPlans: 0,
				totalGoals: 0,
				totalMilestones: 0,
				totalRisks: 0
			};

			return {
				projects: [],
				edges: [],
				tasks: [],
				documents: [],
				plans: [],
				goals: [],
				milestones: [],
				risks: [],
				stats,
				graphScope: {
					projectLimit: ADMIN_GRAPH_PROJECT_LIMIT,
					entityLimit: ADMIN_GRAPH_ENTITY_LIMIT,
					edgeLimit: ADMIN_GRAPH_EDGE_LIMIT,
					truncated: false
				},
				user: {
					id: user.id,
					email: dbUser.email ?? user.email,
					isAdmin: true
				}
			};
		}

		const [edgesRes, tasksRes, documentsRes, plansRes, goalsRes, milestonesRes, risksRes] =
			await Promise.all([
				adminClient
					.from('onto_edges')
					.select(EDGE_GRAPH_COLUMNS)
					.in('project_id', projectIds)
					.neq('src_kind', 'template')
					.neq('dst_kind', 'template')
					.order('created_at', { ascending: false })
					.limit(ADMIN_GRAPH_EDGE_LIMIT),
				adminClient
					.from('onto_tasks')
					.select(TASK_GRAPH_COLUMNS)
					.in('project_id', projectIds)
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
					.limit(ADMIN_GRAPH_ENTITY_LIMIT),
				adminClient
					.from('onto_documents')
					.select(DOCUMENT_GRAPH_COLUMNS)
					.in('project_id', projectIds)
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
					.limit(ADMIN_GRAPH_ENTITY_LIMIT),
				adminClient
					.from('onto_plans')
					.select(PLAN_GRAPH_COLUMNS)
					.in('project_id', projectIds)
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
					.limit(ADMIN_GRAPH_ENTITY_LIMIT),
				adminClient
					.from('onto_goals')
					.select(GOAL_GRAPH_COLUMNS)
					.in('project_id', projectIds)
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
					.limit(ADMIN_GRAPH_ENTITY_LIMIT),
				adminClient
					.from('onto_milestones')
					.select(MILESTONE_GRAPH_COLUMNS)
					.in('project_id', projectIds)
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
					.limit(ADMIN_GRAPH_ENTITY_LIMIT),
				adminClient
					.from('onto_risks')
					.select(RISK_GRAPH_COLUMNS)
					.in('project_id', projectIds)
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
					.limit(ADMIN_GRAPH_ENTITY_LIMIT)
			]);

		if (edgesRes.error) throw edgesRes.error;
		if (tasksRes.error) throw tasksRes.error;
		if (documentsRes.error) throw documentsRes.error;
		if (plansRes.error) throw plansRes.error;
		if (goalsRes.error) throw goalsRes.error;
		if (milestonesRes.error) throw milestonesRes.error;
		if (risksRes.error) throw risksRes.error;

		const edges = rowsAs<OntoEdge>(edgesRes.data);
		const tasks = rowsAs<OntoTask>(tasksRes.data);
		const documents = rowsAs<OntoDocument>(documentsRes.data);
		const plans = rowsAs<OntoPlan>(plansRes.data);
		const goals = rowsAs<OntoGoal>(goalsRes.data);
		const milestones = rowsAs<OntoMilestone>(milestonesRes.data);
		const risks = rowsAs<OntoRisk>(risksRes.data);

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

		const truncated =
			projects.length >= ADMIN_GRAPH_PROJECT_LIMIT ||
			edges.length >= ADMIN_GRAPH_EDGE_LIMIT ||
			tasks.length >= ADMIN_GRAPH_ENTITY_LIMIT ||
			documents.length >= ADMIN_GRAPH_ENTITY_LIMIT ||
			plans.length >= ADMIN_GRAPH_ENTITY_LIMIT ||
			goals.length >= ADMIN_GRAPH_ENTITY_LIMIT ||
			milestones.length >= ADMIN_GRAPH_ENTITY_LIMIT ||
			risks.length >= ADMIN_GRAPH_ENTITY_LIMIT;

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
			graphScope: {
				projectLimit: ADMIN_GRAPH_PROJECT_LIMIT,
				entityLimit: ADMIN_GRAPH_ENTITY_LIMIT,
				edgeLimit: ADMIN_GRAPH_EDGE_LIMIT,
				truncated
			},
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
