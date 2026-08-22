// packages/agentic-chat-runtime/src/loop/turn-intent.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildFastChatPendingTurnIntent,
	getWriteToolNamesForTurnIntent,
	readFastChatPendingTurnIntent,
	resolveFastChatTurnIntent
} from './turn-intent';

describe('retired lexical turn intent', () => {
	it('does not classify an explicit write command from message text', () => {
		expect(
			resolveFastChatTurnIntent({
				contextType: 'project',
				latestUserMessage: 'Create a task called Review chapter one.'
			})
		).toEqual({
			version: 1,
			requiresWrite: false,
			action: null,
			entityKind: 'unknown',
			operations: [],
			source: 'none',
			originalRequestText: null,
			originatingTurnRunId: null,
			clearPending: false
		});
	});

	it('does not copy or truncate long user messages into compatibility metadata', () => {
		const message = `${'I want to write the book that is my life. '.repeat(40)}ending`;
		expect(message.length).toBeGreaterThan(1_200);
		const intent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: message
		});
		expect(intent.requiresWrite).toBe(false);
		expect(intent.originalRequestText).toBeNull();
		expect(intent.operations).toEqual([]);
	});

	it('does not resume a legacy pending intent from conversational wording', () => {
		const pending = readFastChatPendingTurnIntent(
			{
				version: 1,
				requiresWrite: true,
				action: 'update',
				entityKind: 'task',
				operations: [{ action: 'update', entityKind: 'task' }],
				status: 'pending',
				contextType: 'project',
				projectId: 'project-1',
				originalRequestText: 'Update the task.',
				originatingTurnRunId: 'turn-1',
				updatedAt: '2026-08-22T00:00:00.000Z',
				expiresAt: '2026-08-23T00:00:00.000Z'
			},
			{ now: new Date('2026-08-22T12:00:00.000Z') }
		);
		expect(pending).not.toBeNull();
		expect(
			resolveFastChatTurnIntent({
				contextType: 'project',
				projectId: 'project-1',
				latestUserMessage: 'Go ahead.',
				pendingIntent: pending
			}).requiresWrite
		).toBe(false);
	});

	it('never creates new lexical pending-intent state', () => {
		expect(
			buildFastChatPendingTurnIntent({
				intent: {
					version: 1,
					requiresWrite: true,
					action: 'create',
					entityKind: 'document',
					operations: [{ action: 'create', entityKind: 'document' }],
					source: 'current_message',
					originalRequestText: 'Create a document.',
					originatingTurnRunId: null,
					clearPending: false
				},
				contextType: 'project'
			})
		).toBeNull();
	});

	it('keeps tool projection only for already-structured legacy snapshots', () => {
		expect(
			getWriteToolNamesForTurnIntent({
				version: 1,
				requiresWrite: true,
				action: 'organize',
				entityKind: 'document',
				operations: [{ action: 'organize', entityKind: 'document' }],
				source: 'current_message',
				originalRequestText: null,
				originatingTurnRunId: null,
				clearPending: false
			})
		).toEqual(['move_document_in_tree']);
	});
});
