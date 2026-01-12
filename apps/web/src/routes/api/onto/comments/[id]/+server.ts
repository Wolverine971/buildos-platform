// apps/web/src/routes/api/onto/comments/[id]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { logOntologyApiError } from '../../shared/error-logging';
import { handleCommentMentions } from '../comment-mentions';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const supabase = locals.supabase;
	const session = await locals.safeGetSession();

	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	try {
		const payload = await request.json();
		const bodyText = (payload?.body || '').toString().trim();

		if (!bodyText) {
			return ApiResponse.badRequest('Comment body is required');
		}

		if (bodyText.length > 10000) {
			return ApiResponse.validationError('body', 'Comment body exceeds 10,000 characters');
		}

		const { data: comment, error: commentError } = await supabase
			.from('onto_comments')
			.select(
				`
				id,
				project_id,
				entity_type,
				entity_id,
				root_id,
				created_by,
				deleted_at,
				project:onto_projects!inner(
					id,
					name,
					is_public,
					created_by
				)
			`
			)
			.eq('id', params.id)
			.maybeSingle();

		if (commentError) {
			await logOntologyApiError({
				supabase,
				error: commentError,
				endpoint: `/api/onto/comments/${params.id}`,
				method: 'PATCH',
				userId: session.user.id,
				operation: 'comments_fetch',
				tableName: 'onto_comments'
			});
			return ApiResponse.databaseError(commentError);
		}

		if (!comment) {
			return ApiResponse.notFound('Comment');
		}

		if (comment.deleted_at) {
			return ApiResponse.badRequest('Deleted comments cannot be edited');
		}

		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve actor'),
				endpoint: `/api/onto/comments/${params.id}`,
				method: 'PATCH',
				userId: session.user.id,
				projectId: comment.project_id,
				entityType: comment.entity_type,
				entityId: comment.entity_id,
				operation: 'comments_actor_resolve'
			});
			return ApiResponse.internalError(
				actorError || new Error('Failed to resolve actor'),
				'Failed to resolve user actor'
			);
		}

		if (comment.created_by !== actorId) {
			const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin');
			if (adminError) {
				await logOntologyApiError({
					supabase,
					error: adminError,
					endpoint: `/api/onto/comments/${params.id}`,
					method: 'PATCH',
					userId: session.user.id,
					projectId: comment.project_id,
					entityType: comment.entity_type,
					entityId: comment.entity_id,
					operation: 'comments_admin_check'
				});
				return ApiResponse.error('Failed to verify permissions', 500);
			}

			if (!isAdmin) {
				return ApiResponse.forbidden('Only the author can edit this comment');
			}
		}

		const { data: updated, error: updateError } = await supabase
			.from('onto_comments')
			.update({ body: bodyText })
			.eq('id', params.id)
			.select(
				`
				id,
				project_id,
				entity_type,
				entity_id,
				parent_id,
				root_id,
				body,
				body_format,
				metadata,
				created_by,
				created_at,
				updated_at,
				edited_at,
				deleted_at,
				author:onto_actors(
					id,
					name,
					user_id,
					kind
				)
			`
			)
			.single();

		if (updateError || !updated) {
			await logOntologyApiError({
				supabase,
				error: updateError || new Error('Failed to update comment'),
				endpoint: `/api/onto/comments/${params.id}`,
				method: 'PATCH',
				userId: session.user.id,
				projectId: comment.project_id,
				entityType: comment.entity_type,
				entityId: comment.entity_id,
				operation: 'comments_update',
				tableName: 'onto_comments'
			});
			return ApiResponse.databaseError(updateError || new Error('Failed to update comment'));
		}

		const { data: existingMentions, error: mentionsError } = await supabase
			.from('onto_comment_mentions')
			.select('mentioned_user_id')
			.eq('comment_id', params.id);

		if (mentionsError) {
			console.error('[Comments PATCH] Failed to load existing mentions:', mentionsError);
		}

		await handleCommentMentions({
			supabase,
			body: bodyText,
			project: comment.project,
			comment: {
				id: updated.id,
				root_id: updated.root_id,
				entity_type: updated.entity_type,
				entity_id: updated.entity_id
			},
			author: {
				userId: session.user.id,
				name: updated.author?.name || 'Someone'
			},
			existingMentionUserIds: (existingMentions ?? []).map(
				(mention) => mention.mentioned_user_id
			)
		});

		return ApiResponse.success({ comment: updated });
	} catch (error) {
		await logOntologyApiError({
			supabase,
			error,
			endpoint: `/api/onto/comments/${params.id}`,
			method: 'PATCH',
			userId: session.user.id,
			operation: 'comments_patch'
		});
		return ApiResponse.internalError(error, 'Failed to update comment');
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const supabase = locals.supabase;
	const session = await locals.safeGetSession();

	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	try {
		const { data: comment, error: commentError } = await supabase
			.from('onto_comments')
			.select('id, project_id, entity_type, entity_id, created_by, deleted_at')
			.eq('id', params.id)
			.maybeSingle();

		if (commentError) {
			await logOntologyApiError({
				supabase,
				error: commentError,
				endpoint: `/api/onto/comments/${params.id}`,
				method: 'DELETE',
				userId: session.user.id,
				operation: 'comments_fetch',
				tableName: 'onto_comments'
			});
			return ApiResponse.databaseError(commentError);
		}

		if (!comment) {
			return ApiResponse.notFound('Comment');
		}

		if (comment.deleted_at) {
			return ApiResponse.success({ deleted: true });
		}

		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve actor'),
				endpoint: `/api/onto/comments/${params.id}`,
				method: 'DELETE',
				userId: session.user.id,
				projectId: comment.project_id,
				entityType: comment.entity_type,
				entityId: comment.entity_id,
				operation: 'comments_actor_resolve'
			});
			return ApiResponse.internalError(
				actorError || new Error('Failed to resolve actor'),
				'Failed to resolve user actor'
			);
		}

		if (comment.created_by !== actorId) {
			const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin');
			if (adminError) {
				await logOntologyApiError({
					supabase,
					error: adminError,
					endpoint: `/api/onto/comments/${params.id}`,
					method: 'DELETE',
					userId: session.user.id,
					projectId: comment.project_id,
					entityType: comment.entity_type,
					entityId: comment.entity_id,
					operation: 'comments_admin_check'
				});
				return ApiResponse.error('Failed to verify permissions', 500);
			}

			if (!isAdmin) {
				return ApiResponse.forbidden('Only the author can delete this comment');
			}
		}

		const { error: updateError } = await supabase
			.from('onto_comments')
			.update({ deleted_at: new Date().toISOString() })
			.eq('id', params.id);

		if (updateError) {
			await logOntologyApiError({
				supabase,
				error: updateError,
				endpoint: `/api/onto/comments/${params.id}`,
				method: 'DELETE',
				userId: session.user.id,
				projectId: comment.project_id,
				entityType: comment.entity_type,
				entityId: comment.entity_id,
				operation: 'comments_soft_delete',
				tableName: 'onto_comments'
			});
			return ApiResponse.databaseError(updateError);
		}

		return ApiResponse.success({ deleted: true });
	} catch (error) {
		await logOntologyApiError({
			supabase,
			error,
			endpoint: `/api/onto/comments/${params.id}`,
			method: 'DELETE',
			userId: session.user.id,
			operation: 'comments_delete'
		});
		return ApiResponse.internalError(error, 'Failed to delete comment');
	}
};
