// packages/shared-agent-ops/src/ops/entity-mention-notification.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createTrackedInAppNotificationMock } = vi.hoisted(() => ({
	createTrackedInAppNotificationMock: vi.fn()
}));

vi.mock('./tracked-in-app-notification.service', () => ({
	createTrackedInAppNotification: createTrackedInAppNotificationMock
}));

import { notifyEntityMentionsAdded } from './entity-mention-notification.service';

describe('notifyEntityMentionsAdded', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		createTrackedInAppNotificationMock.mockResolvedValue({ success: true });
	});

	it('links document mentions directly to the mentioned document', async () => {
		await notifyEntityMentionsAdded({
			supabase: {} as any,
			projectId: 'project-1',
			projectName: 'Launch plan',
			entityType: 'document',
			entityId: 'document-1',
			entityTitle: 'Messaging notes',
			actorUserId: 'user-actor',
			actorDisplayName: 'DJ',
			mentionedUserIds: ['user-recipient'],
			source: 'manual_ping'
		});

		expect(createTrackedInAppNotificationMock).toHaveBeenCalledWith(
			expect.objectContaining({
				recipientUserId: 'user-recipient',
				actionUrl: '/projects/project-1/documents/document-1'
			})
		);
	});

	it('keeps task mentions linked to the task workspace', async () => {
		await notifyEntityMentionsAdded({
			supabase: {} as any,
			projectId: 'project-1',
			entityType: 'task',
			entityId: 'task-1',
			actorUserId: 'user-actor',
			actorDisplayName: 'DJ',
			mentionedUserIds: ['user-recipient']
		});

		expect(createTrackedInAppNotificationMock).toHaveBeenCalledWith(
			expect.objectContaining({
				actionUrl: '/projects/project-1/tasks/task-1'
			})
		);
	});
});
