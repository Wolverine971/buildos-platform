// apps/web/src/routes/api/onto/projects/[id]/start-here/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import {
	requireCurrentActorProjectAccess,
	requireOntologyActor
} from '$lib/server/ontology-api-access';
import { queueProjectContextSnapshot } from '$lib/server/project-context-snapshot.service';
import { ensureProjectStartHereDocument } from '@buildos/shared-agent-ops/ontology/start-here.service';
import { isProjectOperationalState } from '@buildos/shared-agent-ops/ontology/onto';
import {
	createOrMergeDocumentVersion,
	toDocumentSnapshot
} from '$lib/services/ontology/versioning.service';

/**
 * Seed the canonical START HERE document for an existing project and queue its
 * first managed status/map refresh. Repeated calls return the existing
 * canonical document instead of creating another one.
 */
export const POST: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	const projectId = params.id;
	if (!projectId || !isValidUUID(projectId)) {
		return ApiResponse.badRequest('Invalid project ID');
	}

	const audit = {
		endpoint: `/api/onto/projects/${projectId}/start-here`,
		method: 'POST',
		entityType: 'project',
		projectId,
		consoleLabel: 'Start Here API'
	};
	const actorResult = await requireOntologyActor({
		supabase: locals.supabase,
		user,
		audit,
		operation: 'start_here_actor_resolve'
	});
	if (!actorResult.ok) return actorResult.response;

	const accessResult = await requireCurrentActorProjectAccess({
		supabase: locals.supabase,
		actor: actorResult.actor,
		projectId,
		requiredAccess: 'write',
		audit,
		operation: 'start_here_access_check',
		forbiddenMessage: 'You do not have permission to create project memory'
	});
	if (!accessResult.ok) return accessResult.response;

	const { data: project, error: projectError } = await locals.supabase
		.from('onto_projects')
		.select('name, description, state_key, deleted_at, archived_at')
		.eq('id', projectId)
		.maybeSingle();
	if (projectError) return ApiResponse.databaseError(projectError);
	if (!project || project.deleted_at || project.archived_at) {
		return ApiResponse.notFound('Project');
	}
	if (!isProjectOperationalState(project.state_key)) {
		return ApiResponse.conflict(
			'Project memory can only be seeded while a project is planning or active'
		);
	}

	const ensured = await ensureProjectStartHereDocument({
		supabase: locals.supabase,
		projectId,
		actorId: actorResult.actor.actorId,
		projectName: project.name,
		projectDescription: project.description
	});
	if (!ensured.ok) {
		return ApiResponse.internalError(ensured.error, 'Failed to create project memory');
	}
	if (ensured.skipped || !ensured.document) {
		return ApiResponse.conflict('Project memory is unavailable for this project');
	}

	let versionRecorded: boolean | null = ensured.created ? false : null;
	if (ensured.created) {
		try {
			await createOrMergeDocumentVersion({
				supabase: locals.supabase,
				documentId: ensured.document.id,
				actorId: actorResult.actor.actorId,
				snapshot: toDocumentSnapshot(ensured.document),
				changeSource: 'start_here_recovery'
			});
			versionRecorded = true;
		} catch (error) {
			console.warn('[Start Here API] Initial version write failed:', error);
		}
	}

	const refresh = await queueProjectContextSnapshot({
		projectId,
		userId: user.id,
		reason: ensured.created ? 'start_here_recovery' : 'start_here_refresh_requested',
		force: true
	});
	const responseData = {
		document: ensured.document,
		created: ensured.created,
		version_recorded: versionRecorded,
		refresh_queued: refresh.queued,
		refresh_job_id: refresh.jobId ?? null
	};

	return ensured.created
		? ApiResponse.created(responseData, 'Project memory created')
		: ApiResponse.success(responseData, 'Project memory already exists');
};
