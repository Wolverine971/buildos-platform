// packages/agentic-chat-runtime/src/tools/ontology-task-documents.ts
// Phase 4 Slice 18 S3-T8: task workspace document reads.

import { isValidUUID } from '@buildos/shared-types';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import { AgenticChatDetailReadQueryError } from './ontology-detail-reads';

export const TASK_DOCUMENT_REL = 'task_has_document';

export interface SharedListTaskDocumentsArgs {
	task_id: string;
}

export type TaskDocumentLink = {
	document: Record<string, any>;
	edge: Record<string, any>;
};

export type TaskDocumentsPayload = {
	documents: TaskDocumentLink[];
	scratch_pad: TaskDocumentLink | null;
};

export class AgenticChatTaskDocumentsQueryError extends Error {
	readonly name = 'AgenticChatTaskDocumentsQueryError';
	readonly stage: 'edges' | 'documents';
	readonly cause: unknown;
	readonly projectId: string;
	readonly code?: string;

	constructor(stage: 'edges' | 'documents', cause: unknown, projectId: string) {
		const message =
			cause instanceof Error
				? cause.message
				: typeof (cause as { message?: unknown } | null)?.message === 'string'
					? String((cause as { message: string }).message)
					: `Failed to load task ${stage}`;
		super(message);
		this.stage = stage;
		this.cause = cause;
		this.projectId = projectId;
		const code = (cause as { code?: unknown } | null)?.code;
		if (typeof code === 'string') this.code = code;
	}
}

function isScratchLink(link: TaskDocumentLink): boolean {
	const props = link.edge.props;
	return Boolean(
		props &&
			typeof props === 'object' &&
			!Array.isArray(props) &&
			(props as Record<string, unknown>).role === 'scratch'
	);
}

/** Load linked task documents after task/project access has already been established. */
export async function loadTaskDocumentLinks(
	client: AgenticChatSharedReadContextV1['client'],
	input: { taskId: string; projectId: string }
): Promise<TaskDocumentsPayload> {
	const db = client as any;
	const { data: edges, error: edgeError } = await db
		.from('onto_edges')
		.select('*')
		.eq('project_id', input.projectId)
		.eq('src_kind', 'task')
		.eq('src_id', input.taskId)
		.eq('rel', TASK_DOCUMENT_REL)
		.eq('dst_kind', 'document')
		.order('created_at', { ascending: true });
	if (edgeError) {
		throw new AgenticChatTaskDocumentsQueryError('edges', edgeError, input.projectId);
	}
	if (!Array.isArray(edges) || edges.length === 0) {
		return { documents: [], scratch_pad: null };
	}

	const documentIds = edges
		.map((edge) => edge.dst_id)
		.filter((id): id is string => typeof id === 'string');
	const { data: documents, error: documentError } = await db
		.from('onto_documents')
		.select('*')
		.eq('project_id', input.projectId)
		.in('id', documentIds)
		.is('deleted_at', null);
	if (documentError) {
		throw new AgenticChatTaskDocumentsQueryError('documents', documentError, input.projectId);
	}

	const documentMap = new Map<string, Record<string, any>>();
	for (const document of documents ?? []) {
		if (typeof document?.id === 'string') documentMap.set(document.id, document);
	}

	const combined = edges.flatMap((edge) => {
		const document = documentMap.get(edge.dst_id);
		return document ? [{ document, edge } satisfies TaskDocumentLink] : [];
	});
	return {
		documents: combined,
		scratch_pad: combined.find(isScratchLink) ?? null
	};
}

export async function listTaskDocuments(
	context: AgenticChatSharedReadContextV1,
	args: SharedListTaskDocumentsArgs
): Promise<TaskDocumentsPayload & { message: string }> {
	if (!args.task_id) throw new Error('task_id is required for list_task_documents');
	if (!isValidUUID(args.task_id)) throw new Error('Invalid task_id: expected UUID');

	const { data: taskRef, error: taskError } = await (context.client as any)
		.from('onto_tasks')
		.select('id, project_id')
		.eq('id', args.task_id)
		.maybeSingle();
	if (taskError) throw new AgenticChatDetailReadQueryError('onto_tasks', taskError);
	if (!taskRef?.project_id) throw new Error('Task not found');

	await context.access.assertProjectAccess(taskRef.project_id, 'read');
	const payload = await loadTaskDocumentLinks(context.client, {
		taskId: args.task_id,
		projectId: taskRef.project_id
	});
	return {
		...payload,
		message: `Found ${payload.documents.length} documents linked to this task.`
	};
}
