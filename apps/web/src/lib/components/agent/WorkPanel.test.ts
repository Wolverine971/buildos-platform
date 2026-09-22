// apps/web/src/lib/components/agent/WorkPanel.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import WorkPanel from './WorkPanel.svelte';
import { workRunsStore } from '$lib/stores/workRunsStore';
import type { AgentRunRow } from '$lib/services/agentRunsRealtime.service';
import { loadAiInboxCount } from '$lib/stores/aiInboxCount.store';

vi.mock('$lib/stores/toast.store', () => ({
	toastService: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }
}));
vi.mock('$lib/stores/aiInboxCount.store', () => ({ loadAiInboxCount: vi.fn() }));
vi.mock('$lib/stores/projectDataMutations', () => ({ notifyDataMutation: vi.fn() }));

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
		workRunsStore.set(new Map());
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

	it('keeps the next review open when a save from the previous review finishes', async () => {
		const runs = ['first', 'second'].map(
			(id) =>
				({
					id,
					label: `${id} review`,
					goal: 'Update task title',
					status: 'proposal_ready',
					context_type: 'project',
					project_id: 'project-1',
					project: { id: 'project-1', name: 'Test project' },
					trigger: 'chat',
					scope_mode: 'read_write',
					review_required: true,
					created_at: '2026-09-21T12:00:00Z',
					updated_at: '2026-09-21T12:00:00Z',
					change_set: {
						run_id: id,
						status: 'pending',
						created_at: '2026-09-21T12:00:00Z',
						changes: [
							{
								id: `${id}-change`,
								op: 'onto.task.update',
								action: 'update',
								entity_type: 'task',
								before: { title: `${id} task` },
								after: { title: `${id} updated` },
								rationale: 'Apply the reviewed task title.'
							}
						]
					}
				}) as unknown as AgentRunRow
		);
		workRunsStore.set(new Map(runs.map((run) => [run.id, run])));
		let resolveCommit!: (response: Response) => void;
		const fetchMock = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					resolveCommit = resolve;
				})
		);
		vi.stubGlobal('fetch', fetchMock);
		render(WorkPanel, { props: { open: true } });
		await fireEvent.click(
			screen.getByRole('button', { name: /Open Test project: Update task · first updated/ })
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Accept 1 change' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		await fireEvent.click(
			await screen.findByRole('button', {
				name: /Open Test project: Update task · second updated/
			})
		);
		expect(screen.getByText('second updated')).toBeInTheDocument();
		resolveCommit(
			new Response(JSON.stringify({ data: { applied: 1, rejected: 0, failed: 0 } }), {
				status: 200
			})
		);
		await waitFor(() => expect(loadAiInboxCount).toHaveBeenCalledWith({ force: true }));
		await waitFor(() => expect(screen.queryByText('first updated')).not.toBeInTheDocument());
		await waitFor(() => expect(screen.getByText('second updated')).toBeInTheDocument());
		expect(screen.getByRole('button', { name: 'Accept 1 change' })).toBeEnabled();
		expect(fetchMock).toHaveBeenCalledTimes(1);
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
