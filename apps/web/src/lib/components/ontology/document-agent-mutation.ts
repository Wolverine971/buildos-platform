import type { DocumentMutationEvent } from '$lib/components/agent/agent-chat.types';

export type DocumentAgentMutationAction = 'ignore' | 'refresh' | 'conflict' | 'close_deleted';

export function resolveDocumentAgentMutationAction(params: {
	event: DocumentMutationEvent;
	projectId: string;
	documentId: string | null;
	hasUnsavedChanges: boolean;
	saveStatus: 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';
}): DocumentAgentMutationAction {
	const { event, projectId, documentId, hasUnsavedChanges, saveStatus } = params;
	if (!documentId || event.entityKind !== 'document' || event.entityId !== documentId) {
		return 'ignore';
	}
	if (event.projectId && event.projectId !== projectId) return 'ignore';

	if (
		hasUnsavedChanges ||
		saveStatus === 'dirty' ||
		saveStatus === 'saving' ||
		saveStatus === 'conflict'
	) {
		return 'conflict';
	}

	return event.toolName === 'delete_onto_document' ? 'close_deleted' : 'refresh';
}
