// apps/web/src/lib/components/ui/Toast.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toastService, type Toast as ToastData } from '$lib/stores/toast.store';
import Toast from './Toast.svelte';

class TestPointerEvent extends MouseEvent {
	readonly pointerId: number;
	readonly pointerType: string;

	constructor(type: string, init: PointerEventInit = {}) {
		super(type, init);
		this.pointerId = init.pointerId ?? 0;
		this.pointerType = init.pointerType ?? '';
	}
}

function toast(overrides: Partial<ToastData> = {}): ToastData {
	return {
		id: 'toast-1',
		message: 'Changes saved',
		type: 'success',
		duration: 0,
		dismissible: true,
		...overrides
	};
}

describe('Toast mobile interactions', () => {
	beforeEach(() => {
		vi.stubGlobal('PointerEvent', TestPointerEvent);
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('keeps the close control on the far right and dismisses the toast', async () => {
		const ondismiss = vi.fn();
		render(Toast, { props: { toast: toast(), ondismiss } });

		const closeButton = screen.getByRole('button', { name: 'Dismiss notification' });
		expect(closeButton).toHaveClass('toast-dismiss', 'absolute', 'right-2');

		await fireEvent.click(closeButton);

		expect(ondismiss).toHaveBeenCalledOnce();
		expect(ondismiss).toHaveBeenCalledWith('toast-1');
	});

	it.each([
		['left', 260, 120],
		['right', 60, 210]
	])('dismisses after a mobile swipe to the %s', async (_direction, startX, endX) => {
		vi.useFakeTimers();
		const ondismiss = vi.fn();
		render(Toast, { props: { toast: toast(), ondismiss } });
		const surface = screen.getByRole('status');
		Object.defineProperty(surface, 'offsetWidth', { configurable: true, value: 320 });

		await fireEvent.pointerDown(surface, {
			pointerId: 1,
			pointerType: 'touch',
			clientX: startX,
			clientY: 30
		});
		await fireEvent.pointerMove(surface, {
			pointerId: 1,
			pointerType: 'touch',
			clientX: endX,
			clientY: 34
		});
		await fireEvent.pointerUp(surface, {
			pointerId: 1,
			pointerType: 'touch',
			clientX: endX,
			clientY: 34
		});
		await vi.advanceTimersByTimeAsync(150);

		expect(ondismiss).toHaveBeenCalledWith('toast-1');
	});

	it('leaves the toast in place when the gesture is vertical', async () => {
		const ondismiss = vi.fn();
		render(Toast, { props: { toast: toast(), ondismiss } });
		const surface = screen.getByRole('status');

		await fireEvent.pointerDown(surface, {
			pointerId: 1,
			pointerType: 'touch',
			clientX: 120,
			clientY: 20
		});
		await fireEvent.pointerMove(surface, {
			pointerId: 1,
			pointerType: 'touch',
			clientX: 125,
			clientY: 90
		});

		// An unmoved toast carries no inline transform at all (no idle layer promotion).
		expect(surface.style.transform).toBe('');
		expect(ondismiss).not.toHaveBeenCalled();
	});
});

describe('Toast document change variant', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	const documentChange = {
		title: 'Launch plan',
		linesAdded: 2,
		linesRemoved: 1,
		hunks: [
			{
				old_start: 1,
				new_start: 1,
				lines: [
					{ kind: 'context' as const, text: '# Launch plan' },
					{ kind: 'remove' as const, text: 'Old scope.' },
					{ kind: 'add' as const, text: 'New scope.' },
					{ kind: 'add' as const, text: 'More scope.' }
				]
			}
		],
		hunksTruncated: true,
		documentHref: '/projects/p1?doc=d1',
		historyHref: '/projects/p1?entity=document&entity_id=d1'
	};

	it('shows "<title> updated" with +X −Y and expands the diff in place on click', async () => {
		const pause = vi.spyOn(toastService, 'pause');
		const resume = vi.spyOn(toastService, 'resume');
		render(Toast, {
			props: {
				toast: toast({
					message: 'Launch plan updated',
					duration: 5000,
					documentChange
				})
			}
		});

		const summary = screen.getByRole('button', { name: /Launch plan/ });
		expect(summary).toHaveTextContent('Launch plan');
		expect(summary).toHaveTextContent('updated');
		expect(summary).toHaveTextContent('+2');
		expect(summary).toHaveTextContent('−1');
		expect(summary).toHaveAttribute('aria-expanded', 'false');

		await fireEvent.click(summary);

		expect(summary).toHaveAttribute('aria-expanded', 'true');
		const diff = document.getElementById(summary.getAttribute('aria-controls')!);
		await waitFor(() => expect(diff).toHaveTextContent('More scope.'));
		expect(diff).toHaveTextContent('… more changes');
		expect(screen.getByRole('link', { name: /Open document/ })).toHaveAttribute(
			'href',
			'/projects/p1?doc=d1'
		);
		expect(pause).toHaveBeenCalledWith('toast-1');

		// An open diff holds the auto-dismiss timer even when the pointer leaves.
		await fireEvent.mouseLeave(screen.getByRole('status'));
		expect(resume).not.toHaveBeenCalled();
	});
});
