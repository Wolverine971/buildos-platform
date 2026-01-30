// apps/web/src/routes/api/onto/projects/[id]/doc-tree/+server.ts
/**
 * GET /api/onto/projects/[id]/doc-tree
 * PATCH /api/onto/projects/[id]/doc-tree
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	getDocTree,
	updateDocStructure,
	collectDocIds,
	type ChangeType
} from '$lib/services/ontology/doc-structure.service';
import type { DocStructure, DocTreeNode } from '$lib/types/onto';
import { logOntologyApiError } from '../../../shared/error-logging';

const VALID_CHANGE_TYPES = new Set<ChangeType>([
	'create',
	'move',
	'delete',
	'reorder',
	'reorganize'
]);

type ValidationResult = { ok: true } | { ok: false; message: string };

function validateNodeShape(node: DocTreeNode, seen: Set<string>): ValidationResult {
	if (!node || typeof node !== 'object') {
		return { ok: false, message: 'Invalid node entry' };
	}
	if (!node.id || typeof node.id !== 'string') {
		return { ok: false, message: 'Each node must include a valid id' };
	}
	if (seen.has(node.id)) {
		return { ok: false, message: `Duplicate document id in structure: ${node.id}` };
	}
	seen.add(node.id);
	if (node.type !== undefined && node.type !== 'folder' && node.type !== 'doc') {
		return { ok: false, message: `Invalid node type for ${node.id}` };
	}
	if (typeof node.order !== 'number' || !Number.isInteger(node.order) || node.order < 0) {
		return { ok: false, message: `Invalid order for ${node.id}` };
	}
	if (node.children !== undefined && !Array.isArray(node.children)) {
		return { ok: false, message: `children must be an array for ${node.id}` };
	}
	if (Array.isArray(node.children)) {
		for (const child of node.children) {
			const childResult = validateNodeShape(child, seen);
			if (!childResult.ok) return childResult;
		}
	}
	return { ok: true };
}

function validateStructure(structure: DocStructure): ValidationResult {
	if (!structure || typeof structure !== 'object') {
		return { ok: false, message: 'Invalid structure payload' };
	}
	if (typeof structure.version !== 'number' || !Number.isInteger(structure.version)) {
		return { ok: false, message: 'structure.version must be an integer' };
	}
	if (!Array.isArray(structure.root)) {
		return { ok: false, message: 'structure.root must be an array' };
	}
	const seen = new Set<string>();
	for (const node of structure.root) {
		const result = validateNodeShape(node, seen);
		if (!result.ok) return result;
	}
	return { ok: true };
}

export const GET: RequestHandler = async ({ params, locals, url }) => {
	try {
		const { user } = await locals.safeGetSession();
		const { id } = params;

		if (!id) {
			return ApiResponse.badRequest('Project ID required');
		}

		const supabase = locals.supabase;

		if (user) {
			const actorResult = await supabase.rpc('ensure_actor_for_user', { p_user_id: user.id });
			if (actorResult.error || !actorResult.data) {
				console.error('[Doc Tree API] Failed to resolve actor', actorResult.error);
				await logOntologyApiError({
					supabase,
					error: actorResult.error || new Error('Failed to resolve user actor'),
					endpoint: `/api/onto/projects/${id}/doc-tree`,
					method: 'GET',
					userId: user.id,
					projectId: id,
					entityType: 'project',
					operation: 'doc_tree_actor_resolve'
				});
				return ApiResponse.error('Failed to resolve user actor', 500);
			}
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: id,
				p_required_access: 'read'
			}
		);

		if (accessError) {
			console.error('[Doc Tree API] Failed to check access', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/projects/${id}/doc-tree`,
				method: 'GET',
				userId: user?.id,
				projectId: id,
				entityType: 'project',
				operation: 'doc_tree_access_check'
			});
			return ApiResponse.error('Failed to check project access', 500);
		}

		if (!hasAccess) {
			return user
				? ApiResponse.forbidden('You do not have permission to access this project')
				: ApiResponse.notFound('Project');
		}

		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id')
			.eq('id', id)
			.is('deleted_at', null)
			.single();

		if (projectError || !project) {
			if (projectError) {
				await logOntologyApiError({
					supabase,
					error: projectError,
					endpoint: `/api/onto/projects/${id}/doc-tree`,
					method: 'GET',
					userId: user?.id,
					projectId: id,
					entityType: 'project',
					operation: 'doc_tree_project_fetch',
					tableName: 'onto_projects'
				});
			}
			return ApiResponse.notFound('Project');
		}

		const includeContentParam = url.searchParams.get('include_content');
		const includeContent =
			includeContentParam === null
				? true
				: includeContentParam === 'true' || includeContentParam === '1';

		const { structure, documents, unlinked } = await getDocTree(supabase, id, {
			includeContent
		});

		return ApiResponse.success({ structure, documents, unlinked });
	} catch (error) {
		console.error('[Doc Tree API] Unexpected GET error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/projects/${params.id ?? ''}/doc-tree`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			projectId: params.id,
			entityType: 'project',
			operation: 'doc_tree_get'
		});
		return ApiResponse.internalError(error, 'Failed to load document tree');
	}
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	try {
		const session = await locals.safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const { id } = params;
		if (!id) {
			return ApiResponse.badRequest('Project ID required');
		}

		const body = await request.json().catch(() => null);
		if (!body || typeof body !== 'object') {
			return ApiResponse.badRequest('Invalid request body');
		}

		const structure = (body as any).structure as DocStructure | undefined;
		const changeTypeInput = (body as any).change_type as string | undefined;
		const changeType: ChangeType = VALID_CHANGE_TYPES.has(changeTypeInput as ChangeType)
			? (changeTypeInput as ChangeType)
			: 'reorganize';

		if (!structure) {
			return ApiResponse.badRequest('structure is required');
		}

		const structureValidation = validateStructure(structure);
		if (!structureValidation.ok) {
			return ApiResponse.badRequest(structureValidation.message);
		}

		const supabase = locals.supabase;

		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Doc Tree API] Failed to resolve actor:', actorError);
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/projects/${id}/doc-tree`,
				method: 'PATCH',
				userId: session.user.id,
				projectId: id,
				entityType: 'project',
				operation: 'doc_tree_actor_resolve'
			});
			return ApiResponse.internalError(
				actorError || new Error('Failed to resolve user actor'),
				'Failed to resolve user identity'
			);
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: id,
				p_required_access: 'write'
			}
		);

		if (accessError) {
			console.error('[Doc Tree API] Failed to check access', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/projects/${id}/doc-tree`,
				method: 'PATCH',
				userId: session.user.id,
				projectId: id,
				entityType: 'project',
				operation: 'doc_tree_access_check'
			});
			return ApiResponse.error('Failed to check project access', 500);
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('You do not have permission to modify this project');
		}

		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id')
			.eq('id', id)
			.is('deleted_at', null)
			.single();

		if (projectError || !project) {
			if (projectError) {
				await logOntologyApiError({
					supabase,
					error: projectError,
					endpoint: `/api/onto/projects/${id}/doc-tree`,
					method: 'PATCH',
					userId: session.user.id,
					projectId: id,
					entityType: 'project',
					operation: 'doc_tree_project_fetch',
					tableName: 'onto_projects'
				});
			}
			return ApiResponse.notFound('Project');
		}

		// Validate referenced document ids belong to the project and are active
		const structureIds = Array.from(collectDocIds(structure.root));
		if (structureIds.length > 0) {
			const { data: docs, error: docsError } = await supabase
				.from('onto_documents')
				.select('id')
				.eq('project_id', id)
				.in('id', structureIds)
				.is('deleted_at', null);

			if (docsError) {
				await logOntologyApiError({
					supabase,
					error: docsError,
					endpoint: `/api/onto/projects/${id}/doc-tree`,
					method: 'PATCH',
					userId: session.user.id,
					projectId: id,
					entityType: 'document',
					operation: 'doc_tree_docs_fetch',
					tableName: 'onto_documents'
				});
				return ApiResponse.databaseError(docsError);
			}

			const activeDocIds = new Set((docs || []).map((doc) => doc.id));
			const invalidIds = structureIds.filter((docId) => !activeDocIds.has(docId));

			if (invalidIds.length > 0) {
				const preview = invalidIds.slice(0, 20);
				return ApiResponse.badRequest(
					`Structure includes documents not in this project: ${preview.join(', ')}`,
					{
						invalid_ids: preview,
						count: invalidIds.length
					}
				);
			}
		}

		let updated: DocStructure;
		try {
			updated = await updateDocStructure(supabase, id, structure, changeType, actorId);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (message.startsWith('Structure version conflict')) {
				return ApiResponse.error(message, 409);
			}
			throw err;
		}

		return ApiResponse.success({ structure: updated });
	} catch (error) {
		console.error('[Doc Tree API] Unexpected PATCH error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/projects/${params.id ?? ''}/doc-tree`,
			method: 'PATCH',
			userId: (await locals.safeGetSession()).user?.id,
			projectId: params.id,
			entityType: 'project',
			operation: 'doc_tree_update'
		});
		return ApiResponse.internalError(error, 'Failed to update document tree');
	}
};
