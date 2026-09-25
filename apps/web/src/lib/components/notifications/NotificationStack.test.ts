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

function renderStack(count: number) {
	const items = Array.from({ length: count }, (_, index) => genericNotification(index + 1));
	const notifications = new Map<string, Notification>(items.map((item) => [item.id, item]));
	const stack = items.map((item) => item.id);
	return render(NotificationStack, { props: { stack, notifications, expandedId: null } });
}

describe('NotificationStack', () => {
	afterEach(cleanup);

	it('folds 2+ notifications into a deck showing only the newest tile', async () => {
		renderStack(6);

		expect(screen.getByText('Notification 6')).toBeInTheDocument();
		expect(screen.queryByText('Notification 1')).not.toBeInTheDocument();

		const toggle = screen.getByRole('button', { name: '6 updates' });
		expect(toggle).toHaveAttribute('aria-expanded', 'false');
		expect(toggle).toHaveAttribute('aria-controls', 'notification-stack-list');
	});

	it('expands every tile into the scrollable column and collapses back', async () => {
		renderStack(6);

		await fireEvent.click(screen.getByRole('button', { name: '6 updates' }));
		const list = document.getElementById('notification-stack-list');
		for (let index = 1; index <= 6; index += 1) {
			expect(list).toHaveTextContent(`Notification ${index}`);
		}

		const collapse = screen.getByRole('button', { name: 'Show less' });
		expect(collapse).toHaveAttribute('aria-expanded', 'true');

		await fireEvent.click(collapse);
		expect(screen.queryByText('Notification 1')).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: '6 updates' })).toHaveAttribute(
			'aria-expanded',
			'false'
		);
	});

	it('keeps a lone tile visible and lets the phone toggle stay open', async () => {
		renderStack(1);

		expect(screen.getByText('Notification 1')).toBeInTheDocument();
		const toggle = screen.getByRole('button', { name: '1 update' });
		expect(toggle).toHaveClass('sm:hidden');

		await fireEvent.click(toggle);
		expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
			'aria-expanded',
			'true'
		);
	});
});
