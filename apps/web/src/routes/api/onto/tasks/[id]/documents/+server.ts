// apps/web/src/routes/api/onto/tasks/[id]/documents/+server.ts
/**
 * GET  /api/onto/tasks/[id]/documents  - List documents linked to a task workspace
 * POST /api/onto/tasks/[id]/documents  - Create/link a document to the task workspace
 *
 * Documents are linked via onto_edges with rel = 'task_has_document'. We reuse the existing
 * onto_documents table (FSM state_key, props, etc.) and avoid schema changes by capturing
 * workspace-specific metadata inside the edge props (role, handed_off, etc.).
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { DOCUMENT_STATES } from '$lib/types/onto';
import type { Json, Database } from '@buildos/shared-types';
import { ensureTaskAccess, TASK_DOCUMENT_REL } from '../../task-document-helpers';
import { normalizeDocumentStateInput } from '../../../shared/document-state';

type OntoEdge = Database['public']['Tables']['onto_edges']['Row'];

// Type guard for edge props with role
function hasRole(props: Json): props is { role: string; [key: string]: Json | undefined } {
	return typeof props === 'object' && props !== null && !Array.isArray(props) && 'role' in props;
}

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const session = await locals.safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const taskId = params.id;
		if (!taskId) {
			return ApiResponse.badRequest('Task ID is required');
		}

		const access = await ensureTaskAccess(locals, taskId, session.user.id);

		if ('error' in access) {
			return access.error;
		}

		const supabase = locals.supabase;

		const { data: edges, error: edgeError } = await supabase
			.from('onto_edges')
			.select('*')
			.eq('src_kind', 'task')
			.eq('src_id', taskId)
			.eq('rel', TASK_DOCUMENT_REL)
			.order('created_at', { ascending: true });

		if (edgeError) {
			console.error('[TaskDoc API] Failed to fetch edges:', edgeError);
			return ApiResponse.databaseError(edgeError);
		}

		if (!edges?.length) {
			return ApiResponse.success({ documents: [], scratch_pad: null });
		}

		const documentIds = edges.map((edge) => edge.dst_id);

		const { data: documents, error: docError } = await supabase
			.from('onto_documents')
			.select('*')
			.in('id', documentIds)
			.is('deleted_at', null);

		if (docError) {
			console.error('[TaskDoc API] Failed to fetch documents:', docError);
			return ApiResponse.databaseError(docError);
		}

		const documentMap = new Map<string, Record<string, unknown>>();
		for (const doc of documents ?? []) {
			documentMap.set(doc.id as string, doc);
		}

		const combined = edges
			.map((edge) => {
				const document = documentMap.get(edge.dst_id);
				if (!document) return null;
				return { document, edge };
			})
			.filter((item): item is { document: Record<string, unknown>; edge: OntoEdge } =>
				Boolean(item)
			);

		const scratchPad =
			combined.find(
				(item) => hasRole(item.edge.props) && item.edge.props.role === 'scratch'
			) ?? null;

		return ApiResponse.success({
			documents: combined,
			scratch_pad: scratchPad
		});
	} catch (error) {
		console.error('[TaskDoc API] Unexpected GET error:', error);
		return ApiResponse.internalError(error, 'Failed to load task documents');
	}
};

type DocumentCreatePayload = {
	title?: string;
	type_key?: string;
	state_key?: string;
	role?: string;
	body_markdown?: string;
	content?: string;
	description?: string;
	props?: Record<string, unknown>;
	document_id?: string;
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	try {
		const session = await locals.safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const taskId = params.id;
		if (!taskId) {
			return ApiResponse.badRequest('Task ID is required');
		}

		const body = (await request.json().catch(() => null)) as DocumentCreatePayload | null;
		if (!body || typeof body !== 'object') {
			return ApiResponse.badRequest('Invalid request body');
		}

		const access = await ensureTaskAccess(locals, taskId, session.user.id);

		if ('error' in access) {
			return access.error;
		}

		const { task, project, actorId } = access;
		const supabase = locals.supabase;

		const {
			document_id,
			title,
			type_key,
			state_key,
			role = 'deliverable',
			body_markdown,
			content,
			description,
			props = {}
		} = body;

		let document: Record<string, any> | null = null;

		const hasStateInput = Object.prototype.hasOwnProperty.call(body, 'state_key');
		const normalizedState = normalizeDocumentStateInput(state_key);

		if (hasStateInput && !normalizedState) {
			return ApiResponse.badRequest(
				`state_key must be one of: ${DOCUMENT_STATES.join(', ')}`
			);
		}

		if (document_id) {
			const { data: existingDoc, error: existingError } = await supabase
				.from('onto_documents')
				.select('*')
				.eq('id', document_id)
				.is('deleted_at', null)
				.single();

			if (existingError || !existingDoc) {
				return ApiResponse.notFound('Document');
			}

			if (existingDoc.project_id !== project.id) {
				return ApiResponse.forbidden('Document must belong to the same project');
			}

			document = existingDoc;
		} else {
			const docTitle = title?.trim() || `${task.title ?? 'Task'} Document`;
			const docType = type_key?.trim() || 'document.task.scratch';
			const docState = normalizedState ?? 'draft';
			// Prefer content param, fall back to body_markdown for backwards compatibility
			const normalizedContent =
				typeof content === 'string'
					? content
					: typeof body_markdown === 'string'
						? body_markdown
						: null;
			const normalizedDescription = typeof description === 'string' ? description : null;
			// Store body_markdown in props for backwards compatibility during migration
			const mergedProps = {
				...(props ?? {}),
				...(normalizedContent ? { body_markdown: normalizedContent } : {})
			};

			const { data: insertedDoc, error: insertError } = await supabase
				.from('onto_documents')
				.insert({
					project_id: project.id,
					title: docTitle,
					type_key: docType,
					state_key: docState,
					content: normalizedContent,
					description: normalizedDescription,
					props: mergedProps,
					created_by: actorId
				})
				.select('*')
				.single();

			if (insertError || !insertedDoc) {
				console.error('[TaskDoc API] Failed to create document:', insertError);
				return ApiResponse.databaseError(insertError);
			}

			document = insertedDoc;

			// Ensure project → document edge exists for downstream consumers
			const { error: projectEdgeError } = await supabase.from('onto_edges').insert({
				project_id: project.id,
				src_kind: 'project',
				src_id: project.id,
				rel: 'has_document',
				dst_kind: 'document',
				dst_id: document.id,
				props: {}
			});

			if (projectEdgeError) {
				console.error(
					'[TaskDoc API] Failed to insert project has_document edge:',
					projectEdgeError
				);
			}
		}

		if (!document) {
			return ApiResponse.internalError(
				new Error('Failed to resolve document'),
				'Unable to create document'
			);
		}

		const edgeProps: Record<string, unknown> = {
			role,
			origin_task_id: taskId,
			created_at: new Date().toISOString(),
			created_by: actorId
		};

		// Insert task → document edge
		const { error: edgeError } = await supabase.from('onto_edges').insert({
			project_id: project.id,
			src_kind: 'task',
			src_id: taskId,
			rel: TASK_DOCUMENT_REL,
			dst_kind: 'document',
			dst_id: document.id,
			props: edgeProps as Json
		});

		if (edgeError) {
			console.error('[TaskDoc API] Failed to insert task_has_document edge:', edgeError);
			return ApiResponse.databaseError(edgeError);
		}

		return ApiResponse.success({
			document,
			edge: {
				src_kind: 'task',
				src_id: taskId,
				dst_kind: 'document',
				dst_id: document.id,
				rel: TASK_DOCUMENT_REL,
				props: edgeProps
			}
		});
	} catch (error) {
		console.error('[TaskDoc API] Unexpected POST error:', error);
		return ApiResponse.internalError(error, 'Failed to create task document');
	}
};
