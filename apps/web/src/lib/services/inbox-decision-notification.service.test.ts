// apps/web/src/lib/services/inbox-decision-notification.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadAiInboxCountMock, notificationUpdateMock, toastErrorMock, toastSuccessMock } =
	vi.hoisted(() => ({
		loadAiInboxCountMock: vi.fn(),
		notificationUpdateMock: vi.fn(),
		toastErrorMock: vi.fn(),
		toastSuccessMock: vi.fn()
	}));

vi.mock('$lib/stores/aiInboxCount.store', () => ({
	loadAiInboxCount: loadAiInboxCountMock
}));

vi.mock('$lib/stores/notification.store', () => ({
	notificationStore: {
		add: vi.fn(() => 'notification-1'),
		remove: vi.fn(),
		update: notificationUpdateMock
	}
}));

vi.mock('$lib/stores/toast.store', () => ({
	toastService: {
		error: toastErrorMock,
		info: vi.fn(),
		success: toastSuccessMock
	}
}));

import {
	completeInboxDecisionNotification,
	failInboxDecisionNotification
} from './inbox-decision-notification.service';

describe('inbox decision count refresh', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('refreshes the shared count after a successful decision', () => {
		completeInboxDecisionNotification('notification-1', 'Applied');

		expect(toastSuccessMock).toHaveBeenCalledWith('Applied');
		expect(loadAiInboxCountMock).toHaveBeenCalledWith({ force: true });
	});

	it('refreshes the shared count after a failed optimistic decision', () => {
		failInboxDecisionNotification('notification-1', 'Could not apply');

		expect(toastErrorMock).toHaveBeenCalledWith('Could not apply');
		expect(loadAiInboxCountMock).toHaveBeenCalledWith({ force: true });
	});
});
