// apps/web/src/lib/utils/keyboard-avoiding.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initKeyboardAvoiding } from './keyboard-avoiding';

vi.mock('$app/environment', () => ({
	browser: true
}));

type VisualViewportListener = (event: Event) => void;

const visualViewportListeners = new Map<string, Set<VisualViewportListener>>();

function installVisualViewport({ height, offsetTop = 0 }: { height: number; offsetTop?: number }) {
	visualViewportListeners.clear();

	Object.defineProperty(window, 'innerHeight', {
		configurable: true,
		value: 900
	});

	Object.defineProperty(window, 'visualViewport', {
		configurable: true,
		value: {
			height,
			offsetTop,
			addEventListener: vi.fn((type: string, listener: VisualViewportListener) => {
				const listeners = visualViewportListeners.get(type) ?? new Set();
				listeners.add(listener);
				visualViewportListeners.set(type, listeners);
			}),
			removeEventListener: vi.fn((type: string, listener: VisualViewportListener) => {
				visualViewportListeners.get(type)?.delete(listener);
			})
		} as unknown as VisualViewport
	});
}

function dispatchVisualViewportEvent(type: string) {
	for (const listener of visualViewportListeners.get(type) ?? []) {
		listener(new Event(type));
	}
}

function tick() {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('initKeyboardAvoiding', () => {
	beforeEach(() => {
		document.documentElement.style.removeProperty('--keyboard-height');
		installVisualViewport({ height: 700 });
	});

	afterEach(() => {
		document.body.replaceChildren();
		document.documentElement.style.removeProperty('--keyboard-height');
		vi.restoreAllMocks();
	});

	it('does not treat visual viewport chrome as keyboard height without focused text input', () => {
		const element = document.createElement('div');
		const cleanup = initKeyboardAvoiding({ element });

		dispatchVisualViewportEvent('resize');

		expect(document.documentElement.style.getPropertyValue('--keyboard-height')).toBe('0px');
		cleanup();
	});

	it('sets keyboard height when an editable field is focused', () => {
		const element = document.createElement('div');
		const input = document.createElement('textarea');
		document.body.append(input);
		input.focus();

		const cleanup = initKeyboardAvoiding({ element });
		dispatchVisualViewportEvent('resize');

		expect(document.documentElement.style.getPropertyValue('--keyboard-height')).toBe('200px');
		cleanup();
	});

	it('clears keyboard height after focus leaves the editable field', async () => {
		const element = document.createElement('div');
		const input = document.createElement('input');
		document.body.append(input);
		input.focus();

		const cleanup = initKeyboardAvoiding({ element });
		dispatchVisualViewportEvent('resize');
		expect(document.documentElement.style.getPropertyValue('--keyboard-height')).toBe('200px');

		input.blur();
		await tick();

		expect(document.documentElement.style.getPropertyValue('--keyboard-height')).toBe('0px');
		cleanup();
	});
});
