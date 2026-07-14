// apps/web/src/lib/components/notifications/NotificationModal.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import NotificationModal from './NotificationModal.svelte';
import type { GenericNotification } from '$lib/types/notification.types';

const { removeMock, minimizeMock } = vi.hoisted(() => ({
	removeMock: vi.fn(),
	minimizeMock: vi.fn()
}));

vi.mock('$lib/stores/notification.store', () => ({
	notificationStore: {
		remove: removeMock,
		minimize: minimizeMock
	}
}));

function notification(status: GenericNotification['status']): GenericNotification {
	return {
		id: 'notification-1',
		type: 'generic',
		status,
		createdAt: Date.now(),
		updatedAt: Date.now(),
		isMinimized: false,
		isPersistent: false,
		autoCloseMs: null,
		data: {
			title: status === 'processing' ? 'Preparing update' : 'Update complete',
			message: 'Everything is ready.'
		},
		progress: { type: 'indeterminate', message: 'Preparing…' },
		actions: {}
	};
}

describe('NotificationModal fallback close behavior', () => {
	beforeEach(() => {
		Element.prototype.animate = vi.fn(() => {
			let finishHandler: ((event: AnimationPlaybackEvent) => void) | null = null;
			const animation = {
				cancel: vi.fn(),
				currentTime: 0,
				effect: null,
				finished: Promise.resolve(),
				playState: 'finished',
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				get onfinish() {
					return finishHandler;
				},
				set onfinish(handler: ((event: AnimationPlaybackEvent) => void) | null) {
					finishHandler = handler;
					if (handler) window.setTimeout(() => handler({} as AnimationPlaybackEvent), 0);
				}
			};
			return animation as unknown as Animation;
		});
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
			window.setTimeout(() => callback(0), 0)
		);
		vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
		vi.stubGlobal('scrollTo', vi.fn());
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('dismisses a completed fallback notification from the close button', async () => {
		render(NotificationModal, { props: { notification: notification('success') } });

		await screen.findByRole('heading', { name: 'Update complete' });
		await fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

		await waitFor(() => expect(removeMock).toHaveBeenCalledWith('notification-1'));
		expect(minimizeMock).not.toHaveBeenCalled();
	});

	it('minimizes ongoing fallback work from the close button', async () => {
		render(NotificationModal, { props: { notification: notification('processing') } });

		await screen.findByRole('heading', { name: 'Preparing update' });
		await fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

		await waitFor(() => expect(minimizeMock).toHaveBeenCalledWith('notification-1'));
		expect(removeMock).not.toHaveBeenCalled();
	});
});
