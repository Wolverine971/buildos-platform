// apps/web/src/routes/api/onto/comments/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { logOntologyApiError } from '../shared/error-logging';
import { handleCommentMentions } from './comment-mentions';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export const GET: RequestHandler = async ({ request, locals }) => {
	const supabase = locals.supabase;
	const session = await locals.safeGetSession();
	const url = new URL(request.url);

	const projectId = url.searchParams.get('project_id');
	const entityType = url.searchParams.get('entity_type');
	const entityId = url.searchParams.get('entity_id');
	const rootId = url.searchParams.get('root_id');
	const includeDeleted = url.searchParams.get('include_deleted') === 'true';

	const limit = Math.min(
		Math.max(Number(url.searchParams.get('limit')) || DEFAULT_LIMIT, 1),
		MAX_LIMIT
	);
	const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

	if (!projectId || !entityType || !entityId) {
		return ApiResponse.badRequest('project_id, entity_type, and entity_id are required');
	}

	try {
		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, name, is_public, created_by')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle();

		if (projectError) {
			await logOntologyApiError({
				supabase,
				error: projectError,
				endpoint: '/api/onto/comments',
				method: 'GET',
				projectId,
				entityType,
				entityId,
				operation: 'comments_project_fetch',
				tableName: 'onto_projects'
			});
			return ApiResponse.databaseError(projectError);
		}

		if (!project) {
			return ApiResponse.notFound('Project');
		}

		let actorId: string | null = null;
		let hasAccess = false;

		if (session?.user) {
			const { data: resolvedActorId, error: actorError } = await supabase.rpc(
				'ensure_actor_for_user',
				{
					p_user_id: session.user.id
				}
			);

			if (actorError || !resolvedActorId) {
				console.error('[Comments GET] Failed to resolve actor:', actorError);
				if (!project.is_public) {
					await logOntologyApiError({
						supabase,
						error: actorError || new Error('Failed to resolve actor'),
						endpoint: '/api/onto/comments',
						method: 'GET',
						userId: session.user.id,
						projectId,
						entityType,
						entityId,
						operation: 'comments_actor_resolve'
					});
					return ApiResponse.internalError(
						actorError || new Error('Failed to resolve actor'),
						'Failed to resolve user actor'
					);
				}
			} else {
				actorId = resolvedActorId;
				const { data: access, error: accessError } = await supabase.rpc(
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
						endpoint: '/api/onto/comments',
						method: 'GET',
						userId: session.user.id,
						projectId,
						entityType,
						entityId,
						operation: 'comments_access_check'
					});
					return ApiResponse.error('Failed to check project access', 500);
				}

				hasAccess = Boolean(access);
			}
		}

		if (!project.is_public && !hasAccess) {
			return ApiResponse.forbidden('Access denied');
		}

		let query = supabase
			.from('onto_comments')
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
			.eq('project_id', projectId)
			.eq('entity_type', entityType)
			.eq('entity_id', entityId);

		if (rootId) {
			query = query.eq('root_id', rootId);
		}

		if (!includeDeleted) {
			query = query.is('deleted_at', null);
		}

		const rangeEnd = offset + limit - 1;
		const { data: comments, error } = await query
			.order('root_id', { ascending: true })
			.order('created_at', { ascending: true })
			.range(offset, rangeEnd);

		if (error) {
			await logOntologyApiError({
				supabase,
				error,
				endpoint: '/api/onto/comments',
				method: 'GET',
				projectId,
				entityType,
				entityId,
				operation: 'comments_fetch',
				tableName: 'onto_comments'
			});
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success({
			comments: comments ?? [],
			actorId
		});
	} catch (error) {
		await logOntologyApiError({
			supabase,
			error,
			endpoint: '/api/onto/comments',
			method: 'GET',
			projectId: projectId ?? undefined,
			entityType: entityType ?? undefined,
			entityId: entityId ?? undefined,
			operation: 'comments_get'
		});
		return ApiResponse.internalError(error, 'Failed to fetch comments');
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const supabase = locals.supabase;
	const session = await locals.safeGetSession();

	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	let projectId: string | undefined;
	let entityType: string | undefined;
	let entityId: string | undefined;

	try {
		const payload = await request.json();
		projectId = payload?.project_id;
		entityType = (payload?.entity_type || '').toString().toLowerCase();
		entityId = payload?.entity_id;
		const parentId = payload?.parent_id ?? null;
		const bodyText = (payload?.body || '').toString().trim();

		if (!projectId || !entityType || !entityId) {
			return ApiResponse.badRequest('project_id, entity_type, and entity_id are required');
		}

		if (!bodyText) {
			return ApiResponse.badRequest('Comment body is required');
		}

		if (bodyText.length > 10000) {
			return ApiResponse.validationError('body', 'Comment body exceeds 10,000 characters');
		}

		if (entityType === 'project' && entityId !== projectId) {
			return ApiResponse.badRequest('Project comments must use entity_id = project_id');
		}

		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, name, is_public, created_by')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle();

		if (projectError) {
			await logOntologyApiError({
				supabase,
				error: projectError,
				endpoint: '/api/onto/comments',
				method: 'POST',
				userId: session.user.id,
				projectId,
				entityType,
				entityId,
				operation: 'comments_project_fetch',
				tableName: 'onto_projects'
			});
			return ApiResponse.databaseError(projectError);
		}

		if (!project) {
			return ApiResponse.notFound('Project');
		}

		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve actor'),
				endpoint: '/api/onto/comments',
				method: 'POST',
				userId: session.user.id,
				projectId,
				entityType,
				entityId,
				operation: 'comments_actor_resolve'
			});
			return ApiResponse.internalError(
				actorError || new Error('Failed to resolve actor'),
				'Failed to resolve user actor'
			);
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: projectId,
				p_required_access: 'write'
			}
		);

		if (accessError) {
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: '/api/onto/comments',
				method: 'POST',
				userId: session.user.id,
				projectId,
				entityType,
				entityId,
				operation: 'comments_access_check'
			});
			return ApiResponse.error('Failed to check project access', 500);
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('Access denied');
		}

		const { data: targetValid, error: validateError } = await supabase.rpc(
			'onto_comment_validate_target',
			{
				p_project_id: projectId,
				p_entity_type: entityType,
				p_entity_id: entityId
			}
		);

		if (validateError) {
			await logOntologyApiError({
				supabase,
				error: validateError,
				endpoint: '/api/onto/comments',
				method: 'POST',
				userId: session.user.id,
				projectId,
				entityType,
				entityId,
				operation: 'comments_validate_target'
			});
			return ApiResponse.error('Failed to validate comment target', 500);
		}

		if (!targetValid) {
			return ApiResponse.badRequest('Invalid comment target');
		}

		// Generate comment ID upfront (needed for root_id on top-level comments)
		const commentId = crypto.randomUUID();

		// Determine root_id for threaded comments
		let rootId: string;
		if (parentId) {
			// If replying to a comment, look up the parent to get root_id
			const { data: parentComment, error: parentError } = await supabase
				.from('onto_comments')
				.select('id, root_id')
				.eq('id', parentId)
				.eq('project_id', projectId)
				.eq('entity_type', entityType)
				.eq('entity_id', entityId)
				.is('deleted_at', null)
				.single();

			if (parentError || !parentComment) {
				return ApiResponse.badRequest('Parent comment not found');
			}

			// Use parent's root_id (parent is already in a thread) or parent's id (parent is the root)
			rootId = parentComment.root_id ?? parentComment.id;
		} else {
			// Top-level comment: root_id is the comment's own ID
			rootId = commentId;
		}

		const { data: comment, error } = await supabase
			.from('onto_comments')
			.insert({
				id: commentId,
				project_id: projectId,
				entity_type: entityType,
				entity_id: entityId,
				parent_id: parentId,
				root_id: rootId,
				body: bodyText,
				created_by: actorId
			})
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

		if (error || !comment) {
			await logOntologyApiError({
				supabase,
				error: error || new Error('Comment creation failed'),
				endpoint: '/api/onto/comments',
				method: 'POST',
				userId: session.user.id,
				projectId,
				entityType,
				entityId,
				operation: 'comments_insert',
				tableName: 'onto_comments'
			});
			return ApiResponse.databaseError(error || new Error('Failed to create comment'));
		}

		await handleCommentMentions({
			supabase,
			body: bodyText,
			project,
			comment: {
				id: comment.id,
				root_id: comment.root_id,
				entity_type: comment.entity_type,
				entity_id: comment.entity_id
			},
			author: {
				userId: session.user.id,
				name: comment.author?.name || 'Someone'
			}
		});

		return ApiResponse.created({ comment });
	} catch (error) {
		await logOntologyApiError({
			supabase,
			error,
			endpoint: '/api/onto/comments',
			method: 'POST',
			userId: session.user.id,
			projectId,
			entityType,
			entityId,
			operation: 'comments_create'
		});
		return ApiResponse.internalError(error, 'Failed to create comment');
	}
};
