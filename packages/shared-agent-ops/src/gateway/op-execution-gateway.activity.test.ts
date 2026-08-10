import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	resolveEntityMentionUserIdsMock,
	notifyEntityMentionsAddedMock,
	notifyTaskAssignmentAddedMock,
	logUpdateAsyncMock
} = vi.hoisted(() => ({
	resolveEntityMentionUserIdsMock: vi.fn(),
	notifyEntityMentionsAddedMock: vi.fn(),
	notifyTaskAssignmentAddedMock: vi.fn(),
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
	logCreateAsync: vi.fn(async () => undefined),
	logUpdateAsync: logUpdateAsyncMock
}));

import { syncUpdatedTaskSideEffects } from './op-execution-gateway.activity';

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
