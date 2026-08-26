import { describe, expect, it } from 'vitest';
import type { DocumentMutationEvent } from '$lib/components/agent/agent-chat.types';
import { resolveDocumentAgentMutationAction } from './document-agent-mutation';

const event: DocumentMutationEvent = {
	entityKind: 'document',
	entityId: 'document-1',
	projectId: 'project-1',
	toolName: 'update_onto_document',
	turnId: 'turn-1'
};

describe('resolveDocumentAgentMutationAction', () => {
	it('refreshes a clean editor for its current document', () => {
		expect(
			resolveDocumentAgentMutationAction({
				event,
				projectId: 'project-1',
				documentId: 'document-1',
				hasUnsavedChanges: false,
				saveStatus: 'idle'
			})
		).toBe('refresh');
	});

	it('ignores another document or project', () => {
		expect(
			resolveDocumentAgentMutationAction({
				event,
				projectId: 'project-1',
				documentId: 'document-2',
				hasUnsavedChanges: false,
				saveStatus: 'idle'
			})
		).toBe('ignore');
		expect(
			resolveDocumentAgentMutationAction({
				event: { ...event, projectId: 'project-2' },
				projectId: 'project-1',
				documentId: 'document-1',
				hasUnsavedChanges: false,
				saveStatus: 'idle'
			})
		).toBe('ignore');
	});

	it('uses the conflict path instead of replacing dirty local content', () => {
		expect(
			resolveDocumentAgentMutationAction({
				event,
				projectId: 'project-1',
				documentId: 'document-1',
				hasUnsavedChanges: true,
				saveStatus: 'dirty'
			})
		).toBe('conflict');
	});

	it('closes a clean document deleted by the agent', () => {
		expect(
			resolveDocumentAgentMutationAction({
				event: { ...event, toolName: 'delete_onto_document' },
				projectId: 'project-1',
				documentId: 'document-1',
				hasUnsavedChanges: false,
				saveStatus: 'saved'
			})
		).toBe('close_deleted');
	});
});
