// apps/web/src/lib/components/agent/agent-chat-step-outcomes.test.ts
import { describe, expect, it } from 'vitest';
import { deriveStepSettlements } from './agent-chat-step-outcomes';
import type { ActivityEntry, ThinkingBlockMessage, UIMessage } from './agent-chat.types';

const DOC = '44444444-4444-4444-8444-444444444444';
const PROJECT = '11111111-1111-4111-8111-111111111111';

function documentEdit(id: string, documentId = DOC): ActivityEntry {
	return {
		id,
		content: '',
		timestamp: new Date(),
		activityType: 'tool_call',
		status: 'completed',
		toolCallId: id,
		metadata: {
			toolName: 'update_onto_document',
			result: {
				document_change: {
					version: 1,
					document_id: documentId,
					project_id: PROJECT,
					before_hash: 'a',
					after_hash: 'b',
					lines_added: 2,
					lines_removed: 1,
					hunks: []
				}
			}
		}
	};
}

function block(id: string, activities: ActivityEntry[]): ThinkingBlockMessage {
	return {
		id,
		type: 'thinking_block',
		content: '',
		timestamp: new Date(),
		activities,
		status: 'completed',
		isCollapsed: true
	} as ThinkingBlockMessage;
}

const user = (id: string): UIMessage => ({ id, type: 'user', content: 'x', timestamp: new Date() });

function changes(id: string, undone: boolean, documentId = DOC): UIMessage {
	return {
		id,
		type: 'document_changes',
		content: '',
		timestamp: new Date(),
		data: { changes: [{ id: `${documentId}:b`, documentId, projectId: PROJECT, undone }] }
	};
}

describe('deriveStepSettlements', () => {
	it('marks a document edit undone once its change card was undone, in that turn only', () => {
		const messages = [
			user('u1'),
			block('b1', [documentEdit('s1')]),
			changes('c1', true),
			user('u2'),
			block('b2', [documentEdit('s2')]),
			changes('c2', false)
		];
		const settled = deriveStepSettlements(messages);
		expect(settled.get('b1')).toEqual({ s1: { state: 'undone', label: 'Undone' } });
		expect(settled.has('b2')).toBe(false);
	});

	it('leaves a saved edit alone and ignores steps that failed', () => {
		const failed = { ...documentEdit('s1'), status: 'failed' as const };
		expect(
			deriveStepSettlements([user('u1'), block('b1', [failed]), changes('c1', true)]).size
		).toBe(0);
		expect(
			deriveStepSettlements([
				user('u1'),
				block('b1', [documentEdit('s1')]),
				changes('c1', false)
			]).size
		).toBe(0);
	});

	it('only settles the document whose card was undone', () => {
		const other = '55555555-5555-4555-8555-555555555555';
		const settled = deriveStepSettlements([
			user('u1'),
			block('b1', [documentEdit('s1'), documentEdit('s2', other)]),
			changes('c1', true, other)
		]);
		expect(settled.get('b1')).toEqual({ s2: { state: 'undone', label: 'Undone' } });
	});
});
