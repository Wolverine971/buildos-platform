// apps/web/src/routes/admin/migration/users/[userId]/+page.server.ts
// User detail view - data loader
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { MigrationErrorService } from '$lib/services/ontology/migration-error.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

interface ProjectMigrationInfo {
	id: string;
	name: string;
	status: string;
	createdAt: string;
	updatedAt: string;
	isMigrated: boolean;
	ontoId: string | null;
	taskCount: number;
	migratedTaskCount: number;
	failedTaskCount: number;
	phaseCount: number;
	migratedPhaseCount: number;
}

interface UserInfo {
	id: string;
	email: string;
	name: string | null;
	avatarUrl: string | null;
}

interface UserMigrationSummary {
	totalProjects: number;
	migratedProjects: number;
	pendingProjects: number;
	failedProjects: number;
	totalTasks: number;
	migratedTasks: number;
	totalPhases: number;
	migratedPhases: number;
	percentComplete: number;
	lastMigrationAt: string | null;
}

export const load: PageServerLoad = async ({ params, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		throw redirect(303, '/auth/login');
	}

	if (!user.is_admin) {
		throw error(403, 'Admin access required');
	}

	const userId = params.userId;
	if (!userId) {
		throw error(400, 'User ID is required');
	}

	const supabase = createAdminSupabaseClient();

	// Get user info from user_migration_stats view (includes avatar_url from auth metadata)
	const { data: targetUser, error: userError } = await supabase
		.from('user_migration_stats')
		.select('user_id, email, name, avatar_url')
		.eq('user_id', userId)
		.single();

	if (userError || !targetUser) {
		throw error(404, 'User not found');
	}

	const userInfo: UserInfo = {
		id: targetUser.user_id ?? userId,
		email: targetUser.email ?? '',
		name: targetUser.name,
		avatarUrl: targetUser.avatar_url
	};

	// Get user's projects (projects table has no deleted_at column)
	const { data: projects, error: projectsError } = await supabase
		.from('projects')
		.select('id, name, status, created_at, updated_at')
		.eq('user_id', userId)
		.order('created_at', { ascending: false });

	if (projectsError) {
		throw error(500, `Failed to load projects: ${projectsError.message}`);
	}

	const projectIds = (projects ?? []).map((p) => p.id);

	// Get migration mappings for projects
	const { data: projectMappings } = await supabase
		.from('legacy_entity_mappings')
		.select('legacy_id, onto_id')
		.eq('legacy_table', 'projects')
		.in('legacy_id', projectIds.length > 0 ? projectIds : ['__none__']);

	const projectMappingMap = new Map((projectMappings ?? []).map((m) => [m.legacy_id, m.onto_id]));

	// Get task counts per project
	const { data: taskCounts } = await supabase
		.from('tasks')
		.select('project_id')
		.in('project_id', projectIds.length > 0 ? projectIds : ['__none__'])
		.is('deleted_at', null);

	const taskCountMap = new Map<string, number>();
	for (const task of taskCounts ?? []) {
		if (task.project_id) {
			taskCountMap.set(task.project_id, (taskCountMap.get(task.project_id) ?? 0) + 1);
		}
	}

	// Get task IDs for migration check
	const { data: allTasks } = await supabase
		.from('tasks')
		.select('id, project_id')
		.in('project_id', projectIds.length > 0 ? projectIds : ['__none__'])
		.is('deleted_at', null);

	const taskIdsByProject = new Map<string, string[]>();
	for (const task of allTasks ?? []) {
		if (task.project_id) {
			const arr = taskIdsByProject.get(task.project_id) ?? [];
			arr.push(task.id);
			taskIdsByProject.set(task.project_id, arr);
		}
	}

	// Get migrated task mappings
	const allTaskIds = (allTasks ?? []).map((t) => t.id);
	const { data: taskMappings } = await supabase
		.from('legacy_entity_mappings')
		.select('legacy_id')
		.eq('legacy_table', 'tasks')
		.in('legacy_id', allTaskIds.length > 0 ? allTaskIds : ['__none__']);

	const migratedTaskIds = new Set((taskMappings ?? []).map((m) => m.legacy_id));

	// Get failed task counts per project
	const { data: failedTasks } = await supabase
		.from('migration_log')
		.select('legacy_id')
		.eq('entity_type', 'task')
		.eq('status', 'failed')
		.eq('user_id', userId);

	const failedTaskIds = new Set((failedTasks ?? []).map((t) => t.legacy_id));

	// Get phase counts per project (phases table has no deleted_at column)
	const { data: phaseCounts } = await supabase
		.from('phases')
		.select('project_id')
		.in('project_id', projectIds.length > 0 ? projectIds : ['__none__']);

	const phaseCountMap = new Map<string, number>();
	for (const phase of phaseCounts ?? []) {
		phaseCountMap.set(phase.project_id, (phaseCountMap.get(phase.project_id) ?? 0) + 1);
	}

	// Get phase IDs for migration check
	const { data: allPhases } = await supabase
		.from('phases')
		.select('id, project_id')
		.in('project_id', projectIds.length > 0 ? projectIds : ['__none__']);

	const phaseIdsByProject = new Map<string, string[]>();
	for (const phase of allPhases ?? []) {
		const arr = phaseIdsByProject.get(phase.project_id) ?? [];
		arr.push(phase.id);
		phaseIdsByProject.set(phase.project_id, arr);
	}

	// Get migrated phase mappings
	const allPhaseIds = (allPhases ?? []).map((p) => p.id);
	const { data: phaseMappings } = await supabase
		.from('legacy_entity_mappings')
		.select('legacy_id')
		.eq('legacy_table', 'phases')
		.in('legacy_id', allPhaseIds.length > 0 ? allPhaseIds : ['__none__']);

	const migratedPhaseIds = new Set((phaseMappings ?? []).map((m) => m.legacy_id));

	// Build project info
	const projectInfos: ProjectMigrationInfo[] = (projects ?? []).map((p) => {
		const taskIds = taskIdsByProject.get(p.id) ?? [];
		const migratedTaskCount = taskIds.filter((id) => migratedTaskIds.has(id)).length;
		const failedTaskCount = taskIds.filter((id) => failedTaskIds.has(id)).length;

		const phaseIds = phaseIdsByProject.get(p.id) ?? [];
		const migratedPhaseCount = phaseIds.filter((id) => migratedPhaseIds.has(id)).length;

		return {
			id: p.id,
			name: p.name,
			status: p.status,
			createdAt: p.created_at,
			updatedAt: p.updated_at,
			isMigrated: projectMappingMap.has(p.id),
			ontoId: projectMappingMap.get(p.id) ?? null,
			taskCount: taskCountMap.get(p.id) ?? 0,
			migratedTaskCount,
			failedTaskCount,
			phaseCount: phaseCountMap.get(p.id) ?? 0,
			migratedPhaseCount
		};
	});

	// Calculate summary
	const summary: UserMigrationSummary = {
		totalProjects: projectInfos.length,
		migratedProjects: projectInfos.filter((p) => p.isMigrated).length,
		pendingProjects: projectInfos.filter((p) => !p.isMigrated).length,
		failedProjects: 0, // Would need separate query for failed project migrations
		totalTasks: projectInfos.reduce((sum, p) => sum + p.taskCount, 0),
		migratedTasks: projectInfos.reduce((sum, p) => sum + p.migratedTaskCount, 0),
		totalPhases: projectInfos.reduce((sum, p) => sum + p.phaseCount, 0),
		migratedPhases: projectInfos.reduce((sum, p) => sum + p.migratedPhaseCount, 0),
		percentComplete:
			projectInfos.length > 0
				? Math.round(
						(projectInfos.filter((p) => p.isMigrated).length / projectInfos.length) *
							100
					)
				: 0,
		lastMigrationAt: null // Would need to query from mappings
	};

	// Get errors for this user
	const errorService = new MigrationErrorService(supabase);
	const errorsData = await errorService.getErrors({
		userId,
		limit: 10,
		sortBy: 'createdAt',
		sortOrder: 'desc'
	});

	return {
		user: userInfo,
		projects: projectInfos,
		summary,
		errors: errorsData.errors,
		errorCounts: errorsData.categoryCounts
	};
};
