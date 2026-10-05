// apps/web/src/lib/utils/return-refresh.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onReturnAfterAway } from './return-refresh';

describe('onReturnAfterAway', () => {
	let stop: (() => void) | null = null;
	afterEach(() => stop?.());

	function setup(awayMs = 60_000) {
		let clock = 0;
		const onReturn = vi.fn();
		stop = onReturnAfterAway(onReturn, { awayMs, now: () => clock });
		return {
			onReturn,
			advance: (ms: number) => (clock += ms)
		};
	}

	it('ignores a quick alt-tab and a focus with no blur before it', () => {
		const { onReturn, advance } = setup();
		window.dispatchEvent(new Event('focus'));
		window.dispatchEvent(new Event('blur'));
		advance(5_000);
		window.dispatchEvent(new Event('focus'));
		expect(onReturn).not.toHaveBeenCalled();
	});

	it('refreshes once after a real absence, counted from when the page was left', () => {
		const { onReturn, advance } = setup();
		window.dispatchEvent(new Event('blur'));
		advance(30_000);
		// A second leave event (the tab hidden too) keeps the first departure time.
		Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
		document.dispatchEvent(new Event('visibilitychange'));
		advance(40_000);
		Object.defineProperty(document, 'visibilityState', {
			value: 'visible',
			configurable: true
		});
		document.dispatchEvent(new Event('visibilitychange'));
		window.dispatchEvent(new Event('focus'));
		expect(onReturn).toHaveBeenCalledTimes(1);
	});

	it('stops listening once stopped', () => {
		const { onReturn, advance } = setup(10);
		stop?.();
		stop = null;
		window.dispatchEvent(new Event('blur'));
		advance(100);
		window.dispatchEvent(new Event('focus'));
		expect(onReturn).not.toHaveBeenCalled();
	});
});
