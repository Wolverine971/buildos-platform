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
