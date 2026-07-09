// apps/web/src/lib/services/agentic-chat-v2/turn-intent.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildFastChatPendingTurnIntent,
	getWriteToolNamesForTurnIntent,
	readFastChatPendingTurnIntent,
	resolveFastChatTurnIntent
} from './turn-intent';

describe('resolveFastChatTurnIntent', () => {
	it('classifies the first incident turn as a document create', () => {
		const intent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage:
				'I want to work on this. Please create a document I can give to Claude or ChatGPT that outlines what I need to do so they can do this for me.'
		});

		expect(intent).toMatchObject({
			requiresWrite: true,
			action: 'create',
			entityKind: 'document',
			source: 'current_message'
		});
		expect(getWriteToolNamesForTurnIntent(intent)).toEqual(['create_onto_document']);
	});

	it('inherits a pending document create for the exact follow-up', () => {
		const firstIntent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: 'Please create a document with the implementation brief.'
		});
		const pendingIntent = buildFastChatPendingTurnIntent({
			intent: firstIntent,
			contextType: 'project',
			projectId: 'project-1',
			turnRunId: 'turn-1',
			now: new Date('2026-07-09T16:00:00.000Z')
		});
		const intent = resolveFastChatTurnIntent({
			contextType: 'project',
			projectId: 'project-1',
			latestUserMessage: 'Okay, keep going and make the thing. Make the document.',
			pendingIntent
		});

		expect(intent).toMatchObject({
			requiresWrite: true,
			action: 'create',
			entityKind: 'document',
			source: 'pending_continuation',
			originatingTurnRunId: 'turn-1'
		});
	});

	it('does not inherit a pending mutation from another project', () => {
		const pendingIntent = buildFastChatPendingTurnIntent({
			intent: resolveFastChatTurnIntent({
				contextType: 'project',
				latestUserMessage: 'Create a document.'
			}),
			contextType: 'project',
			projectId: 'project-1'
		});
		const intent = resolveFastChatTurnIntent({
			contextType: 'project',
			projectId: 'project-2',
			latestUserMessage: 'Okay, keep going.',
			pendingIntent
		});

		expect(intent).toMatchObject({ requiresWrite: false, source: 'none' });
	});

	it('maps native goal mutations to a direct write tool', () => {
		const intent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: 'Create a goal for the launch.'
		});

		expect(intent).toMatchObject({ requiresWrite: true, entityKind: 'goal' });
		expect(getWriteToolNamesForTurnIntent(intent)).toEqual(['create_onto_goal']);
	});

	it('keeps read-only update requests out of mutation routing', () => {
		const intent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: 'Update me on the document status.'
		});

		expect(intent.requiresWrite).toBe(false);
	});

	it('clears a pending intent when the user abandons it', () => {
		const pendingIntent = buildFastChatPendingTurnIntent({
			intent: resolveFastChatTurnIntent({
				contextType: 'project',
				latestUserMessage: 'Create a document.'
			}),
			contextType: 'project',
			now: new Date('2026-07-09T16:00:00.000Z')
		});
		const intent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: 'Never mind, drop it.',
			pendingIntent
		});

		expect(intent).toMatchObject({ requiresWrite: false, clearPending: true });
	});

	it('does not abandon pending work merely because the message contains stop', () => {
		const pendingIntent = buildFastChatPendingTurnIntent({
			intent: resolveFastChatTurnIntent({
				contextType: 'project',
				latestUserMessage: 'Create a document.'
			}),
			contextType: 'project'
		});
		const intent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: 'When do I stop researching?',
			pendingIntent
		});

		expect(intent).toMatchObject({ requiresWrite: false, clearPending: false });
	});
});

describe('readFastChatPendingTurnIntent', () => {
	it('rejects expired pending state', () => {
		const pending = buildFastChatPendingTurnIntent({
			intent: resolveFastChatTurnIntent({
				contextType: 'project',
				latestUserMessage: 'Create a document.'
			}),
			contextType: 'project',
			now: new Date('2026-07-09T16:00:00.000Z')
		});

		expect(
			readFastChatPendingTurnIntent(pending, {
				now: new Date('2026-07-11T16:00:00.000Z')
			})
		).toBeNull();
	});
});
