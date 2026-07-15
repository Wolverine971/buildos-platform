// apps/web/src/lib/components/agent/WorkPanel.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import WorkPanel from './WorkPanel.svelte';

vi.mock('$lib/services/agentRunsRealtime.service', async () => {
	const { writable } = await import('svelte/store');
	return {
		agentRunsStore: writable(new Map()),
		isActiveAgentRunStatus: () => false
	};
});

vi.mock('$lib/stores/workRunsStore', async () => {
	const { writable } = await import('svelte/store');
	return {
		workRunsStore: writable(new Map()),
		workRunsLoading: writable(false),
		loadWorkRuns: vi.fn().mockResolvedValue(undefined),
		mergeWorkRuns: vi.fn()
	};
});

vi.mock('$lib/stores/agentOperativesStore', async () => {
	const { writable } = await import('svelte/store');
	return {
		agentOperativesLoading: writable(false),
		agentOperativesStore: writable(new Map()),
		loadAgentOperatives: vi.fn().mockResolvedValue(undefined),
		mergeAgentOperatives: vi.fn(),
		removeAgentOperative: vi.fn()
	};
});

describe('WorkPanel accessibility contract', () => {
	let trigger: HTMLButtonElement;

	beforeEach(() => {
		trigger = document.createElement('button');
		trigger.textContent = 'Open work';
		document.body.appendChild(trigger);
		trigger.focus();
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		});
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
		vi.stubGlobal('scrollTo', vi.fn());
		Object.defineProperty(Element.prototype, 'animate', {
			configurable: true,
			writable: true,
			value: vi.fn(() => {
				let finishHandler: ((event: AnimationPlaybackEvent) => void) | null = null;
				return {
					cancel: vi.fn(),
					commitStyles: vi.fn(),
					currentTime: 0,
					finished: Promise.resolve(),
					play: vi.fn(),
					get onfinish() {
						return finishHandler;
					},
					set onfinish(handler: ((event: AnimationPlaybackEvent) => void) | null) {
						finishHandler = handler;
						if (handler)
							window.setTimeout(() => handler({} as AnimationPlaybackEvent), 0);
					}
				};
			})
		});
	});

	afterEach(() => {
		cleanup();
		trigger.remove();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('uses modal semantics, closes with Escape, and releases the inert background', async () => {
		let view: ReturnType<typeof render>;
		const onClose = vi.fn();
		view = render(WorkPanel, { props: { open: true, onClose } });

		const dialog = await screen.findByRole('dialog', { name: 'Agent work' });
		expect(dialog).toHaveAttribute('aria-modal', 'true');
		expect(trigger).toHaveAttribute('inert');

		await fireEvent.keyDown(window, { key: 'Escape' });

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		await view.rerender({ open: false, onClose });
		await waitFor(() =>
			expect(screen.queryByRole('dialog', { name: 'Agent work' })).toBeNull()
		);
		expect(trigger).not.toHaveAttribute('inert');
	});
});
