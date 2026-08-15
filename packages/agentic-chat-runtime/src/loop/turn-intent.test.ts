// packages/agentic-chat-runtime/src/loop/turn-intent.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildFastChatPendingTurnIntent,
	getAutonomousWriteToolNamesForTurnIntent,
	getWriteToolNamesForTurnIntent,
	readFastChatPendingTurnIntent,
	resolveFastChatTurnIntent,
	shouldBypassDomainSensingForTurnIntent,
	turnIntentRequestsTaskScheduling
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

	it('classifies a pronoun-based help request to organize named documents', () => {
		const intent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage:
				"This project's documents are a mess — loose notes, raw meeting dumps, half-baked ideas, all " +
				'piled at the top level. Help me get it organized into something sensible.'
		});

		expect(intent).toMatchObject({
			requiresWrite: true,
			action: 'organize',
			entityKind: 'document',
			operations: [{ action: 'organize', entityKind: 'document' }],
			source: 'current_message'
		});
		expect(getWriteToolNamesForTurnIntent(intent)).toEqual(['move_document_in_tree']);
	});

	it('does not treat a descriptive organized state as a new mutation request', () => {
		const intent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: 'The documents are organized into sensible groups.'
		});

		expect(intent).toMatchObject({ requiresWrite: false, source: 'none' });
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

	it('does not reinterpret a written project status update as project creation', () => {
		const intent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: 'Write a project status update for the team.'
		});

		expect(intent).toMatchObject({ requiresWrite: false, operations: [] });
	});

	it('maps archive to update rather than physical deletion', () => {
		const intent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: 'Archive the document.'
		});

		expect(intent.operations).toEqual([{ action: 'update', entityKind: 'document' }]);
		expect(getWriteToolNamesForTurnIntent(intent)).toEqual(['update_onto_document']);
	});

	it('does not delete an entity when the user removes one of its properties', () => {
		const intent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: 'Remove the label from the task.'
		});

		expect(intent.operations).toEqual([{ action: 'update', entityKind: 'task' }]);
		expect(getWriteToolNamesForTurnIntent(intent)).toEqual(['update_onto_task']);
	});

	it('does not mistake an entity name containing a property word for property removal', () => {
		const intent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: 'Delete the Content task.'
		});

		expect(intent.operations).toEqual([{ action: 'delete', entityKind: 'task' }]);
		expect(getAutonomousWriteToolNamesForTurnIntent(intent)).toEqual([]);
	});

	it('maps relationship removal to unlink rather than entity deletion', () => {
		const intent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: 'Delete the document link from the task.'
		});

		expect(intent.operations).toEqual([{ action: 'unlink', entityKind: 'unknown' }]);
		expect(getWriteToolNamesForTurnIntent(intent)).toEqual(['unlink_onto_edge']);
		expect(getAutonomousWriteToolNamesForTurnIntent(intent)).toEqual([]);
	});

	it('maps link and unlink to relationship tools', () => {
		const linkIntent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: 'Link the task to the goal.'
		});
		const unlinkIntent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: 'Unlink the task from the goal.'
		});

		expect(getWriteToolNamesForTurnIntent(linkIntent)).toEqual(['link_onto_entities']);
		expect(getWriteToolNamesForTurnIntent(unlinkIntent)).toEqual(['unlink_onto_edge']);
		expect(getAutonomousWriteToolNamesForTurnIntent(unlinkIntent)).toEqual([]);
	});

	it('keeps every operation in a compound task and document request', () => {
		const intent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: 'Mark the task done and create a document for the handoff.'
		});

		expect(intent.operations).toEqual([
			{ action: 'update', entityKind: 'task' },
			{ action: 'create', entityKind: 'document' }
		]);
		expect(getWriteToolNamesForTurnIntent(intent)).toEqual([
			'update_onto_task',
			'create_onto_document'
		]);
	});

	it('treats an explicit replacement as new work instead of pending continuation', () => {
		const pendingIntent = buildFastChatPendingTurnIntent({
			intent: resolveFastChatTurnIntent({
				contextType: 'project',
				latestUserMessage: 'Create a document.'
			}),
			contextType: 'project'
		});
		const intent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: 'Make this a task instead.',
			pendingIntent
		});

		expect(intent).toMatchObject({
			source: 'current_message',
			entityKind: 'task',
			operations: [{ action: 'create', entityKind: 'task' }]
		});
	});

	it('does not autonomously materialize physical delete tools', () => {
		const intent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: 'Delete the document.'
		});

		expect(getWriteToolNamesForTurnIntent(intent)).toEqual(['delete_onto_document']);
		expect(getAutonomousWriteToolNamesForTurnIntent(intent)).toEqual([]);
	});

	it('keeps content-producing document and plan creates eligible for domain sensing', () => {
		const documentIntent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: 'Create a marketing strategy document.'
		});
		const planIntent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: 'Create a usability research plan.'
		});
		const taskIntent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: 'Create a task.'
		});

		expect(shouldBypassDomainSensingForTurnIntent(documentIntent)).toBe(false);
		expect(shouldBypassDomainSensingForTurnIntent(planIntent)).toBe(false);
		expect(shouldBypassDomainSensingForTurnIntent(taskIntent)).toBe(true);
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

describe('turnIntentRequestsTaskScheduling', () => {
	const intentFor = (message: string) =>
		resolveFastChatTurnIntent({ contextType: 'project', latestUserMessage: message });

	it('detects the 2026-07-31 incident message ("push it to friday" shape)', () => {
		const intent = intentFor(
			"push the beta list email thing to friday, i'm not gonna get to it before then"
		);
		expect(intent.requiresWrite).toBe(true);
		expect(turnIntentRequestsTaskScheduling(intent)).toBe(true);
	});

	it('detects explicit reschedule verbs', () => {
		expect(turnIntentRequestsTaskScheduling(intentFor('postpone the review task'))).toBe(true);
		expect(
			turnIntentRequestsTaskScheduling(intentFor('please defer that until next week'))
		).toBe(true);
	});

	it('detects a relative shift without a named day', () => {
		expect(turnIntentRequestsTaskScheduling(intentFor('push the launch task out a week'))).toBe(
			true
		);
	});

	it('detects due-date phrasing', () => {
		expect(
			turnIntentRequestsTaskScheduling(
				intentFor('change the due date on that task to monday')
			)
		).toBe(true);
	});

	it('ignores non-scheduling task updates', () => {
		expect(
			turnIntentRequestsTaskScheduling(intentFor('rename the review task to "Final review"'))
		).toBe(false);
		expect(turnIntentRequestsTaskScheduling(intentFor('mark the review task as done'))).toBe(
			false
		);
	});

	it('ignores the progress idiom and containment moves', () => {
		expect(
			turnIntentRequestsTaskScheduling(intentFor('move forward with the review task'))
		).toBe(false);
		expect(
			turnIntentRequestsTaskScheduling(
				intentFor('move the review task out of the launch project')
			)
		).toBe(false);
	});

	it('ignores document organization moves', () => {
		expect(
			turnIntentRequestsTaskScheduling(
				intentFor('move the pricing doc into the strategy folder')
			)
		).toBe(false);
	});

	it('ignores read-only turns entirely', () => {
		expect(turnIntentRequestsTaskScheduling(intentFor('what is due this friday?'))).toBe(false);
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
