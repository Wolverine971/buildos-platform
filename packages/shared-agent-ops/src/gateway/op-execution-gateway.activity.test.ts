// packages/shared-agent-ops/src/gateway/op-execution-gateway.activity.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	resolveEntityMentionUserIdsMock,
	notifyEntityMentionsAddedMock,
	notifyTaskAssignmentAddedMock,
	logCreateAsyncMock,
	logUpdateAsyncMock
} = vi.hoisted(() => ({
	resolveEntityMentionUserIdsMock: vi.fn(),
	notifyEntityMentionsAddedMock: vi.fn(),
	notifyTaskAssignmentAddedMock: vi.fn(),
	logCreateAsyncMock: vi.fn(async () => undefined),
	logUpdateAsyncMock: vi.fn(async () => undefined)
}));

vi.mock('../ops/entity-mention-notification.service', () => ({
	resolveEntityMentionUserIds: resolveEntityMentionUserIdsMock,
	notifyEntityMentionsAdded: notifyEntityMentionsAddedMock
}));
vi.mock('../ops/task-assignment-notification.service', () => ({
	notifyTaskAssignmentAdded: notifyTaskAssignmentAddedMock
}));
vi.mock('../ops/async-activity-logger', () => ({
	logCreateAsync: logCreateAsyncMock,
	logUpdateAsync: logUpdateAsyncMock
}));

import {
	syncCreatedTaskSideEffects,
	syncUpdatedTaskSideEffects
} from './op-execution-gateway.activity';

describe('syncCreatedTaskSideEffects assignment coalescing', () => {
	it('attributes internal worker activity to chat_session_id without an external call session', async () => {
		vi.clearAllMocks();
		resolveEntityMentionUserIdsMock.mockResolvedValue([]);
		notifyTaskAssignmentAddedMock.mockResolvedValue({ recipientUserIds: [] });
		notifyEntityMentionsAddedMock.mockResolvedValue({ notifiedUserIds: [] });

		await syncCreatedTaskSideEffects({
			context: {
				admin: {},
				userId: 'user-actor',
				chatSessionId: 'chat-session-1',
				scope: { mode: 'read_write' }
			},
			project: {
				id: 'project-1',
				name: 'Launch plan',
				owner_actor_id: 'actor-owner'
			} as never,
			actorId: 'actor-owner',
			task: { id: 'task-1', title: 'New task', state_key: 'todo' }
		});

		expect(logCreateAsyncMock).toHaveBeenCalledWith(
			expect.anything(),
			'project-1',
			'task',
			'task-1',
			expect.anything(),
			'user-actor',
			'agent_call',
			'chat-session-1',
			undefined
		);
	});

	it('sends assignment before mentions and records the create activity', async () => {
		vi.clearAllMocks();
		resolveEntityMentionUserIdsMock.mockResolvedValue(['user-assigned', 'user-mentioned']);
		notifyTaskAssignmentAddedMock.mockResolvedValue({ recipientUserIds: ['user-assigned'] });
		notifyEntityMentionsAddedMock.mockResolvedValue({ notifiedUserIds: ['user-mentioned'] });

		await syncCreatedTaskSideEffects({
			context: {
				admin: {},
				userId: 'user-actor',
				scope: { mode: 'read_write' }
			},
			project: {
				id: 'project-1',
				name: 'Launch plan',
				owner_actor_id: 'actor-owner'
			} as never,
			actorId: 'actor-owner',
			task: {
				id: 'task-1',
				title: 'New task',
				description: 'Tagged users',
				state_key: 'todo'
			},
			addedAssigneeActorIds: ['actor-assigned']
		});

		expect(notifyTaskAssignmentAddedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				addedAssigneeActorIds: ['actor-assigned'],
				coalescedMentionUserIds: ['user-assigned', 'user-mentioned']
			})
		);
		expect(notifyEntityMentionsAddedMock).toHaveBeenCalledWith(
			expect.objectContaining({ skipUserIds: ['user-assigned'] })
		);
		expect(notifyTaskAssignmentAddedMock.mock.invocationCallOrder[0]).toBeLessThan(
			notifyEntityMentionsAddedMock.mock.invocationCallOrder[0] ?? Infinity
		);
		expect(logCreateAsyncMock).toHaveBeenCalledOnce();
	});
});

describe('syncUpdatedTaskSideEffects assignment coalescing', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resolveEntityMentionUserIdsMock.mockResolvedValue(['user-assigned', 'user-mentioned']);
		notifyTaskAssignmentAddedMock.mockResolvedValue({
			recipientUserIds: ['user-assigned']
		});
		notifyEntityMentionsAddedMock.mockResolvedValue({ notifiedUserIds: ['user-mentioned'] });
	});

	it('sends assignment first and suppresses its duplicate mention', async () => {
		await syncUpdatedTaskSideEffects({
			context: {
				admin: {},
				userId: 'user-actor',
				scope: { mode: 'read_write' }
			},
			project: {
				id: 'project-1',
				name: 'Launch plan',
				owner_actor_id: 'actor-owner'
			} as never,
			actorId: 'actor-owner',
			existingTask: {
				id: 'task-1',
				title: 'Old title',
				description: 'Old description',
				state_key: 'todo',
				props: {}
			},
			updatedTask: {
				id: 'task-1',
				title: 'New title',
				description: 'Tagged users',
				state_key: 'todo',
				props: {}
			},
			changedArgs: { assignee_handles: ['@sam'] },
			addedAssigneeActorIds: ['actor-assigned']
		});

		expect(notifyTaskAssignmentAddedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				addedAssigneeActorIds: ['actor-assigned'],
				coalescedMentionUserIds: ['user-assigned', 'user-mentioned']
			})
		);
		expect(notifyEntityMentionsAddedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				mentionedUserIds: ['user-assigned', 'user-mentioned'],
				skipUserIds: ['user-assigned']
			})
		);
		expect(notifyTaskAssignmentAddedMock.mock.invocationCallOrder[0]).toBeLessThan(
			notifyEntityMentionsAddedMock.mock.invocationCallOrder[0] ?? Infinity
		);
		expect(logUpdateAsyncMock).toHaveBeenCalledOnce();
	});
});

describe('calendar side-effect switch and receipt', () => {
	function baseParams(overrides: Record<string, unknown> = {}) {
		return {
			context: {
				admin: {},
				userId: 'user-actor',
				scope: { mode: 'read_write' },
				...((overrides.context as Record<string, unknown>) ?? {})
			},
			project: {
				id: 'project-1',
				name: 'Launch plan',
				owner_actor_id: 'actor-owner'
			} as never,
			actorId: 'actor-owner',
			...overrides
		};
	}

	beforeEach(() => {
		vi.clearAllMocks();
		resolveEntityMentionUserIdsMock.mockResolvedValue([]);
		notifyEntityMentionsAddedMock.mockResolvedValue({ notifiedUserIds: [] });
	});

	it('reports the events a create actually synced', async () => {
		const syncTaskEvents = vi.fn(async () => ({
			events: [
				{
					id: 'event-1',
					title: 'Due: Ship',
					start_at: '2026-09-19T03:29:59.000Z',
					end_at: '2026-09-19T03:59:59.000Z'
				}
			],
			removed_event_count: 0
		}));

		const receipt = await syncCreatedTaskSideEffects(
			baseParams({
				context: { taskSync: { syncTaskEvents } },
				task: { id: 'task-1', title: 'Ship', state_key: 'todo' }
			}) as never
		);

		expect(syncTaskEvents).toHaveBeenCalledOnce();
		expect(receipt).toEqual({
			calendar_sync: 'synced',
			calendar_events: [
				{
					id: 'event-1',
					title: 'Due: Ship',
					start_at: '2026-09-19T03:29:59.000Z',
					end_at: '2026-09-19T03:59:59.000Z'
				}
			]
		});
	});

	it('skips every calendar effect on create when calendarSync is none', async () => {
		const syncTaskEvents = vi.fn(async () => ({ events: [], removed_event_count: 0 }));

		const receipt = await syncCreatedTaskSideEffects(
			baseParams({
				context: { taskSync: { syncTaskEvents } },
				task: { id: 'task-1', title: 'Ship', state_key: 'todo' },
				calendarSync: 'none'
			}) as never
		);

		expect(syncTaskEvents).not.toHaveBeenCalled();
		expect(receipt).toEqual({ calendar_sync: 'skipped' });
		// The rest of the create side effects still run.
		expect(logCreateAsyncMock).toHaveBeenCalledOnce();
	});

	it('reports failed rather than silently claiming nothing happened', async () => {
		const syncTaskEvents = vi.fn(async () => {
			throw new Error('calendar down');
		});
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		const receipt = await syncCreatedTaskSideEffects(
			baseParams({
				context: { taskSync: { syncTaskEvents } },
				task: { id: 'task-1', title: 'Ship', state_key: 'todo' }
			}) as never
		);

		expect(receipt).toEqual({ calendar_sync: 'failed' });
	});

	it('skips update sync when calendarSync is none even for a scheduling edit', async () => {
		const syncTaskEvents = vi.fn(async () => ({ events: [], removed_event_count: 0 }));

		const receipt = await syncUpdatedTaskSideEffects(
			baseParams({
				context: { taskSync: { syncTaskEvents } },
				existingTask: { id: 'task-1', title: 'Ship', state_key: 'todo', props: {} },
				updatedTask: { id: 'task-1', title: 'Ship', state_key: 'todo', props: {} },
				changedArgs: { due_at: '2026-09-18' },
				calendarSync: 'none'
			}) as never
		);

		expect(syncTaskEvents).not.toHaveBeenCalled();
		expect(receipt).toEqual({ calendar_sync: 'skipped' });
		expect(logUpdateAsyncMock).toHaveBeenCalledOnce();
	});

	it('reports unchanged when no update field requires event reconciliation', async () => {
		const syncTaskEvents = vi.fn(async () => ({ events: [], removed_event_count: 0 }));

		const receipt = await syncUpdatedTaskSideEffects(
			baseParams({
				context: { taskSync: { syncTaskEvents } },
				existingTask: { id: 'task-1', title: 'Ship', state_key: 'todo', props: {} },
				updatedTask: { id: 'task-1', title: 'Ship', state_key: 'todo', props: {} },
				changedArgs: { priority: 1 }
			}) as never
		);

		expect(syncTaskEvents).not.toHaveBeenCalled();
		expect(receipt).toEqual({ calendar_sync: 'unchanged' });
	});
});
