// apps/web/src/lib/components/notifications/NotificationStack.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import NotificationStack from './NotificationStack.svelte';
import type { GenericNotification, Notification } from '$lib/types/notification.types';

function genericNotification(index: number): GenericNotification {
	return {
		id: `notification-${index}`,
		type: 'generic',
		status: 'idle',
		createdAt: index,
		updatedAt: index,
		isMinimized: true,
		isPersistent: false,
		autoCloseMs: null,
		data: { title: `Notification ${index}`, subtitle: `Preview ${index}` },
		progress: { type: 'indeterminate' },
		actions: {}
	};
}

describe('NotificationStack', () => {
	afterEach(cleanup);

	it('lets pointer and keyboard users reveal and collapse older notifications', async () => {
		const items = Array.from({ length: 6 }, (_, index) => genericNotification(index + 1));
		const notifications = new Map<string, Notification>(items.map((item) => [item.id, item]));
		const stack = items.map((item) => item.id);

		render(NotificationStack, {
			props: { stack, notifications, expandedId: null }
		});

		expect(screen.queryByText('Notification 1')).not.toBeInTheDocument();
		const reveal = screen.getByRole('button', { name: 'Show 1 older notification' });
		expect(reveal).toHaveAttribute('aria-expanded', 'false');

		await fireEvent.click(reveal);
		expect(screen.getByText('Notification 1')).toBeInTheDocument();
		const collapse = screen.getByRole('button', { name: 'Show newest 5' });
		expect(collapse).toHaveAttribute('aria-expanded', 'true');

		await fireEvent.click(collapse);
		expect(screen.queryByText('Notification 1')).not.toBeInTheDocument();
	});
});
