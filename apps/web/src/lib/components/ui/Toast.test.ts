// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Toast as ToastData } from '$lib/stores/toast.store';
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
