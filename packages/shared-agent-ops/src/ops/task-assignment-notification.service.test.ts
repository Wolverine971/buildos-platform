import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createTrackedInAppNotificationMock } = vi.hoisted(() => ({
	createTrackedInAppNotificationMock: vi.fn()
}));

vi.mock('./tracked-in-app-notification.service', () => ({
	createTrackedInAppNotification: createTrackedInAppNotificationMock
}));

import { notifyTaskAssignmentAdded } from './task-assignment-notification.service';

describe('notifyTaskAssignmentAdded', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		createTrackedInAppNotificationMock.mockResolvedValue({ success: true });
	});

	it('coalesces assignment and mention delivery while excluding the acting user', async () => {
		const supabase = {
			from: vi.fn(() => ({
				select: vi.fn(() => ({
					in: vi.fn(async () => ({
						data: [
							{ id: 'actor-assignee', user_id: 'user-assignee' },
							{ id: 'actor-self', user_id: 'user-actor' }
						],
						error: null
					}))
				}))
			}))
		};
		const notificationSupabase = { from: vi.fn() };

		await expect(
			notifyTaskAssignmentAdded({
				supabase: supabase as never,
				notificationSupabase: notificationSupabase as never,
				projectId: 'project-1',
				projectName: 'Launch plan',
				taskId: 'task-1',
				taskTitle: 'Write launch copy',
				actorUserId: 'user-actor',
				actorDisplayName: 'BuildOS agent',
				addedAssigneeActorIds: ['actor-assignee', 'actor-self'],
				coalescedMentionUserIds: ['user-assignee']
			})
		).resolves.toEqual({ recipientUserIds: ['user-assignee'] });

		expect(createTrackedInAppNotificationMock).toHaveBeenCalledOnce();
		expect(createTrackedInAppNotificationMock).toHaveBeenCalledWith(
			expect.objectContaining({
				supabase: notificationSupabase,
				recipientUserId: 'user-assignee',
				eventType: 'task.assigned',
				actionUrl: '/projects/project-1/tasks/task-1',
				data: expect.objectContaining({ coalesced_from_mention: true })
			})
		);
	});
});
