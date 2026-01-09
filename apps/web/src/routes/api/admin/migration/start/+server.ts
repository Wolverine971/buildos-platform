// apps/web/src/routes/api/admin/migration/start/+server.ts
// POST /api/admin/migration/start - Start a migration run
// Supports: specific projects, all projects for a user, or platform-wide
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { OntologyMigrationOrchestrator } from '$lib/services/ontology/ontology-migration-orchestrator';
import { MigrationStatsService } from '$lib/services/ontology/migration-stats.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const payload = await request.json().catch(() => ({}));

	// Target selection (mutually exclusive)
	let projectIds: string[] | undefined = Array.isArray(payload?.projectIds)
		? (payload.projectIds as string[])
		: undefined;
	const userId = typeof payload?.userId === 'string' ? payload.userId : undefined;
	const isPlatformWide = !projectIds?.length && !userId;

	// Options
	const includeArchived = Boolean(payload?.includeArchived);
	const skipAlreadyMigrated = payload?.skipAlreadyMigrated !== false; // Default: true
	const skipCompletedTasks = payload?.skipCompletedTasks !== false; // Default: true
	const dryRun = Boolean(payload?.dryRun);
	const orgId = typeof payload?.orgId === 'string' ? (payload.orgId as string) : null;

	// Concurrency controls with max caps
	const projectConcurrency = Math.min(Number(payload?.projectConcurrency) || 3, 10);
	const phaseConcurrency = Math.min(Number(payload?.phaseConcurrency) || 5, 15);
	const taskConcurrency = Math.min(Number(payload?.taskConcurrency) || 5, 20);
	const eventConcurrency = Math.min(Number(payload?.eventConcurrency) || 10, 30);

	// LLM controls
	const skipLLMClassification = Boolean(payload?.skipLLMClassification);
	// Reserved for future use with LLM token budgeting
	const _maxTokenBudget =
		typeof payload?.maxTokenBudget === 'number' ? payload.maxTokenBudget : undefined;

	// Use admin client to bypass RLS
	const supabase = createAdminSupabaseClient();
	const statsService = new MigrationStatsService(supabase);

	try {
		// For platform-wide migrations, acquire lock
		let lockAcquired = false;
		if (isPlatformWide && !dryRun) {
			const lockResult = await statsService.acquireLock(
				crypto.randomUUID(), // Temporary runId for lock
				user.id,
				60 // 60 minutes
			);

			if (!lockResult.acquired) {
				const existingLock = lockResult.existingLock;
				return ApiResponse.error(
					`Platform migration already in progress. Locked by ${existingLock?.lockedByEmail ?? existingLock?.lockedBy ?? 'unknown'} until ${existingLock?.expiresAt ?? 'unknown'}`,
					409
				);
			}
			lockAcquired = true;
		}

		// If userId provided, fetch all projects for that user
		// Note: projects table has no deleted_at column
		if (userId && !projectIds?.length) {
			const { data: userProjects, error: projectsError } = await supabase
				.from('projects')
				.select('id')
				.eq('user_id', userId);

			if (projectsError) {
				throw new Error(`Failed to fetch projects for user: ${projectsError.message}`);
			}

			projectIds = (userProjects ?? []).map((p) => p.id);

			if (!projectIds.length) {
				return ApiResponse.success({
					runId: null,
					batchId: null,
					status: 'completed',
					totalProjects: 0,
					message: 'No projects found for user'
				});
			}
		}

		// If platform-wide, fetch all projects (with optional archived filter)
		// Note: projects table has no deleted_at column
		if (isPlatformWide && !projectIds?.length) {
			let query = supabase.from('projects').select('id');

			if (!includeArchived) {
				query = query.neq('status', 'archived');
			}

			const { data: allProjects, error: projectsError } = await query;

			if (projectsError) {
				throw new Error(`Failed to fetch platform projects: ${projectsError.message}`);
			}

			projectIds = (allProjects ?? []).map((p) => p.id);

			if (!projectIds.length) {
				return ApiResponse.success({
					runId: null,
					batchId: null,
					status: 'completed',
					totalProjects: 0,
					message: 'No projects found on platform'
				});
			}
		}

		// Filter out already migrated projects if skipAlreadyMigrated is true
		if (skipAlreadyMigrated && projectIds?.length) {
			const { data: mappings } = await supabase
				.from('legacy_entity_mappings')
				.select('legacy_id')
				.eq('legacy_table', 'projects')
				.in('legacy_id', projectIds);

			const migratedIds = new Set((mappings ?? []).map((m) => m.legacy_id));
			projectIds = projectIds.filter((id) => !migratedIds.has(id));

			if (!projectIds.length) {
				return ApiResponse.success({
					runId: null,
					batchId: null,
					status: 'completed',
					totalProjects: 0,
					message: 'All projects already migrated'
				});
			}
		}

		const orchestrator = new OntologyMigrationOrchestrator(supabase);
		const result = await orchestrator.start({
			projectIds,
			includeArchived,
			batchSize: projectIds?.length ?? 10, // Use full list, no artificial cap
			dryRun,
			initiatedBy: user.id,
			orgId,
			skipCompletedTasks,
			projectConcurrency,
			phaseConcurrency,
			taskConcurrency,
			eventConcurrency
		});

		// Release platform lock if acquired (on success - lock will auto-expire on failure)
		if (lockAcquired && result.runId) {
			await statsService.releaseLock(result.runId).catch((err) => {
				console.warn('[Migration] Failed to release lock:', err);
			});
		}

		// Refresh stats after migration
		if (!dryRun) {
			await statsService.refreshStats().catch((err) => {
				console.warn('[Migration] Failed to refresh stats:', err);
			});
		}

		return ApiResponse.success({
			...result,
			totalProjects: projectIds?.length ?? 0,
			lockAcquired,
			estimatedTokens: skipLLMClassification ? 0 : undefined
		});
	} catch (error) {
		console.error('[Migration] Start failed', error);
		return ApiResponse.internalError(error, 'Failed to start migration run');
	}
};
