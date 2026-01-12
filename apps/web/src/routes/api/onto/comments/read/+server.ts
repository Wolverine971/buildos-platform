// apps/web/src/routes/api/onto/comments/read/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { logOntologyApiError } from '../../shared/error-logging';

export const POST: RequestHandler = async ({ request, locals }) => {
	const supabase = locals.supabase;
	const session = await locals.safeGetSession();

	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	let projectId: string | undefined;
	let entityType: string | undefined;
	let entityId: string | undefined;
	let rootId: string | undefined;

	try {
		const payload = await request.json();
		projectId = payload?.project_id;
		entityType = payload?.entity_type;
		entityId = payload?.entity_id;
		rootId = payload?.root_id;
		const lastReadCommentId = payload?.last_read_comment_id ?? null;

		if (!projectId || !entityType || !entityId || !rootId) {
			return ApiResponse.badRequest(
				'project_id, entity_type, entity_id, and root_id are required'
			);
		}

		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve actor'),
				endpoint: '/api/onto/comments/read',
				method: 'POST',
				userId: session.user.id,
				projectId,
				entityType,
				entityId,
				operation: 'comment_read_actor_resolve'
			});
			return ApiResponse.internalError(
				actorError || new Error('Failed to resolve actor'),
				'Failed to resolve user actor'
			);
		}

		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, is_public')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle();

		if (projectError) {
			await logOntologyApiError({
				supabase,
				error: projectError,
				endpoint: '/api/onto/comments/read',
				method: 'POST',
				userId: session.user.id,
				projectId,
				entityType,
				entityId,
				operation: 'comment_read_project_fetch',
				tableName: 'onto_projects'
			});
			return ApiResponse.databaseError(projectError);
		}

		if (!project) {
			return ApiResponse.notFound('Project');
		}

		if (!project.is_public) {
			const { data: hasAccess, error: accessError } = await supabase.rpc(
				'current_actor_has_project_access',
				{
					p_project_id: projectId,
					p_required_access: 'read'
				}
			);

			if (accessError) {
				await logOntologyApiError({
					supabase,
					error: accessError,
					endpoint: '/api/onto/comments/read',
					method: 'POST',
					userId: session.user.id,
					projectId,
					entityType,
					entityId,
					operation: 'comment_read_access_check'
				});
				return ApiResponse.error('Failed to check project access', 500);
			}

			if (!hasAccess) {
				return ApiResponse.forbidden('Access denied');
			}
		}

		const { data: rootComment, error: rootError } = await supabase
			.from('onto_comments')
			.select('id, project_id, entity_type, entity_id')
			.eq('id', rootId)
			.maybeSingle();

		if (rootError) {
			await logOntologyApiError({
				supabase,
				error: rootError,
				endpoint: '/api/onto/comments/read',
				method: 'POST',
				userId: session.user.id,
				projectId,
				entityType,
				entityId,
				operation: 'comment_read_root_fetch',
				tableName: 'onto_comments'
			});
			return ApiResponse.databaseError(rootError);
		}

		if (!rootComment) {
			return ApiResponse.notFound('Comment thread');
		}

		if (
			rootComment.project_id !== projectId ||
			rootComment.entity_type !== entityType ||
			rootComment.entity_id !== entityId
		) {
			return ApiResponse.badRequest('Thread does not match the target entity');
		}

		const timestamp = new Date().toISOString();
		const { error: upsertError } = await supabase.from('onto_comment_read_states').upsert(
			{
				project_id: projectId,
				entity_type: entityType,
				entity_id: entityId,
				root_id: rootId,
				actor_id: actorId,
				last_read_at: timestamp,
				last_read_comment_id: lastReadCommentId,
				updated_at: timestamp
			},
			{
				onConflict: 'project_id,entity_type,entity_id,root_id,actor_id'
			}
		);

		if (upsertError) {
			await logOntologyApiError({
				supabase,
				error: upsertError,
				endpoint: '/api/onto/comments/read',
				method: 'POST',
				userId: session.user.id,
				projectId,
				entityType,
				entityId,
				operation: 'comment_read_upsert',
				tableName: 'onto_comment_read_states'
			});
			return ApiResponse.databaseError(upsertError);
		}

		return ApiResponse.success({ read: true });
	} catch (error) {
		await logOntologyApiError({
			supabase,
			error,
			endpoint: '/api/onto/comments/read',
			method: 'POST',
			userId: session.user.id,
			projectId,
			entityType,
			entityId,
			operation: 'comment_read'
		});
		return ApiResponse.internalError(error, 'Failed to mark thread as read');
	}
};
