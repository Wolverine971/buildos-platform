// apps/web/src/lib/components/agent/PendingChangeStrip.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import PendingChangeStrip from './PendingChangeStrip.svelte';

const VIEW = {
	key: 'turn-1@2026-09-30T02:03:22.856Z',
	createdAt: '2026-09-30T02:03:22.856Z',
	items: [
		'Update plan "Launch"',
		'Update goal "Q4 pipeline"',
		'Archive 6 docs',
		'Complete 2 tasks'
	]
};

afterEach(() => cleanup());

describe('PendingChangeStrip', () => {
	it('lists what is owed, folds the tail, and wires both choices', async () => {
		const onDismiss = vi.fn();
		const onFinish = vi.fn();
		render(PendingChangeStrip, { view: VIEW, onDismiss, onFinish });

		expect(screen.getByText("Didn't finish from earlier")).toBeTruthy();
		const strip = screen.getByTestId('pending-change-strip');
		expect(strip.textContent).toContain(
			'Update plan "Launch" · Update goal "Q4 pipeline" · Archive 6 docs'
		);
		expect(strip.textContent).not.toContain('Complete 2 tasks');

		await fireEvent.click(screen.getByText('+1 more'));
		expect(strip.textContent).toContain('Complete 2 tasks');

		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Finish it' }));
		expect(onDismiss).toHaveBeenCalledOnce();
		expect(onFinish).toHaveBeenCalledOnce();
	});

	it('waits while a reply runs, and holds Finish it while images are attached', () => {
		const { unmount } = render(PendingChangeStrip, {
			view: VIEW,
			disabled: true,
			onDismiss: vi.fn(),
			onFinish: vi.fn()
		});
		expect(screen.getByRole('button', { name: 'Dismiss' }).hasAttribute('disabled')).toBe(true);
		expect(screen.getByRole('button', { name: 'Finish it' }).hasAttribute('disabled')).toBe(
			true
		);
		unmount();

		render(PendingChangeStrip, {
			view: VIEW,
			finishDisabled: true,
			onDismiss: vi.fn(),
			onFinish: vi.fn()
		});
		expect(screen.getByRole('button', { name: 'Dismiss' }).hasAttribute('disabled')).toBe(
			false
		);
		expect(screen.getByRole('button', { name: 'Finish it' }).hasAttribute('disabled')).toBe(
			true
		);
	});
});
