// apps/web/src/lib/components/notifications/types/agent-run/ChangeSetReview.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import ChangeSetReview from './ChangeSetReview.svelte';
import type { ChangeSet } from '@buildos/shared-types';

const { loadAiInboxCountMock, toastWarningMock, toastErrorMock, notifyDataMutationMock } =
	vi.hoisted(() => ({
		loadAiInboxCountMock: vi.fn(),
		toastWarningMock: vi.fn(),
		toastErrorMock: vi.fn(),
		notifyDataMutationMock: vi.fn()
	}));

vi.mock('$lib/stores/toast.store', () => ({
	toastService: {
		error: toastErrorMock,
		info: vi.fn(),
		success: vi.fn(),
		warning: toastWarningMock
	}
}));

vi.mock('$lib/stores/projectDataMutations', () => ({
	notifyDataMutation: notifyDataMutationMock
}));

vi.mock('$lib/stores/aiInboxCount.store', () => ({
	loadAiInboxCount: loadAiInboxCountMock
}));

const changeSet: ChangeSet = {
	run_id: 'run-1',
	status: 'pending',
	created_at: '2026-07-03T12:00:00.000Z',
	changes: [
		{
			id: 'change-1',
			op: 'onto.task.update',
			entity_type: 'task',
			entity_id: 'task-1',
			action: 'update',
			before: { title: 'Old title', project_id: 'project-1' },
			after: { title: 'New title', project_id: 'project-1' },
			rationale: 'Keep the task current.'
		}
	]
};

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

describe('ChangeSetReview', () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('keeps failed changes in the review without closing it or opening chat', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				jsonResponse(200, {
					success: true,
					data: {
						applied: 0,
						failed: 1,
						rejected: 0
					}
				})
			)
		);
		const onChat = vi.fn();
		const onApplied = vi.fn();

		render(ChangeSetReview, {
			props: {
				runId: 'run-1',
				changeSet,
				onChat,
				onApplied
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Apply 1 change' }));

		await screen.findByRole('alert');
		expect(onApplied).not.toHaveBeenCalled();
		expect(loadAiInboxCountMock).toHaveBeenCalledWith({ force: true });
		expect(onChat).not.toHaveBeenCalled();
		expect(screen.getByRole('alert')).toHaveTextContent('1 could not be applied');
	});
	it('starts accepting in one click and prevents duplicate requests while saving', async () => {
		let resolveCommit!: (response: Response) => void;
		const fetchMock = vi.fn(
			(_url: RequestInfo | URL, _init?: RequestInit) =>
				new Promise<Response>((resolve) => {
					resolveCommit = resolve;
				})
		);
		vi.stubGlobal('fetch', fetchMock);
		const onApplied = vi.fn();
		const onApplying = vi.fn();
		render(ChangeSetReview, {
			props: { runId: 'run-1', changeSet, onApplied, onApplying, acceptLabel: 'Accept' }
		});
		expect(screen.getAllByRole('button', { name: /Accept/ })).toHaveLength(1);
		expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Accept 1 change' }));
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({
			decisions: [{ change_id: 'change-1', decision: 'approved' }]
		});
		expect(onApplying).toHaveBeenCalledWith(true);
		expect(screen.getByRole('status')).toHaveTextContent('Applying changes');
		const saving = screen.getByRole('button', { name: 'Applying…' });
		expect(saving).toBeDisabled();
		await fireEvent.click(saving);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		resolveCommit(jsonResponse(200, { data: { applied: 1, rejected: 0, failed: 0 } }));
		await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
		expect(onApplying).toHaveBeenLastCalledWith(false);
	});

	it('dismisses a single change directly', async () => {
		const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
			jsonResponse(200, { data: { applied: 0, rejected: 1, failed: 0 } })
		);
		vi.stubGlobal('fetch', fetchMock);
		const onApplied = vi.fn();
		render(ChangeSetReview, {
			props: { runId: 'run-1', changeSet, onApplied, dismissLabel: 'Dismiss' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
		await waitFor(() => expect(onApplied).toHaveBeenCalledOnce());
		expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({
			decisions: [{ change_id: 'change-1', decision: 'rejected' }]
		});
	});

	it('uses explicit selection for batches and only applies included changes', async () => {
		const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
			jsonResponse(200, { data: { applied: 1, rejected: 1, failed: 0 } })
		);
		vi.stubGlobal('fetch', fetchMock);
		const batch: ChangeSet = {
			...changeSet,
			changes: [...changeSet.changes, { ...changeSet.changes[0]!, id: 'change-2' }]
		};
		render(ChangeSetReview, { props: { runId: 'run-1', changeSet: batch } });
		await fireEvent.click(
			screen.getByRole('checkbox', { name: 'Include change 2: Update task' })
		);
		expect(fetchMock).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Apply 1 change' }));
		expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({
			decisions: [
				{ change_id: 'change-1', decision: 'approved' },
				{ change_id: 'change-2', decision: 'rejected' }
			]
		});
	});

	it('keeps the proposal and allows retry after a request failure', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(503, { error: 'Please try again' }))
			.mockResolvedValueOnce(
				jsonResponse(200, { data: { applied: 1, rejected: 0, failed: 0 } })
			);
		vi.stubGlobal('fetch', fetchMock);
		const onApplied = vi.fn();
		render(ChangeSetReview, { props: { runId: 'run-1', changeSet, onApplied } });
		await fireEvent.click(screen.getByRole('button', { name: 'Apply 1 change' }));
		expect(await screen.findByRole('alert')).toHaveTextContent('Please try again');
		expect(onApplied).not.toHaveBeenCalled();
		expect(screen.getByText('New title')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Apply 1 change' }));
		await waitFor(() => expect(onApplied).toHaveBeenCalledOnce());
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('refreshes successful changes and shows the actual failure details on partial commits', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
				jsonResponse(200, {
					data: {
						applied: 1,
						rejected: 0,
						failed: 1,
						change_set: {
							...changeSet,
							changes: [
								{
									...changeSet.changes[0]!,
									error: 'Document changed since this proposal was created.'
								}
							]
						}
					}
				})
			)
		);
		const onApplied = vi.fn();
		render(ChangeSetReview, { props: { runId: 'run-1', changeSet, onApplied } });
		await fireEvent.click(screen.getByRole('button', { name: 'Apply 1 change' }));
		expect(
			await screen.findByText('Document changed since this proposal was created.')
		).toBeInTheDocument();
		expect(notifyDataMutationMock).toHaveBeenCalledWith(
			expect.objectContaining({ totalMutations: 1, affectedProjectIds: ['project-1'] })
		);
		expect(onApplied).not.toHaveBeenCalled();
		expect(screen.queryByRole('button', { name: /Apply/ })).not.toBeInTheDocument();
	});
	it('still reports a failed save after the review is closed', async () => {
		let resolveCommit!: (response: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise<Response>((resolve) => {
						resolveCommit = resolve;
					})
			)
		);
		const view = render(ChangeSetReview, { props: { runId: 'run-1', changeSet } });
		await fireEvent.click(screen.getByRole('button', { name: 'Apply 1 change' }));
		view.unmount();
		resolveCommit(jsonResponse(503, { error: 'Save failed. Please retry.' }));
		await waitFor(() =>
			expect(toastErrorMock).toHaveBeenCalledWith('Save failed. Please retry.')
		);
	});

	it('joins the pending save when a review is reopened instead of accepting twice', async () => {
		let resolveCommit!: (response: Response) => void;
		const fetchMock = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					resolveCommit = resolve;
				})
		);
		vi.stubGlobal('fetch', fetchMock);
		const view = render(ChangeSetReview, { props: { runId: 'run-1', changeSet } });
		await fireEvent.click(screen.getByRole('button', { name: 'Apply 1 change' }));
		view.unmount();
		render(ChangeSetReview, { props: { runId: 'run-1', changeSet } });
		try {
			expect(screen.getByRole('button', { name: 'Applying…' })).toBeDisabled();
			expect(fetchMock).toHaveBeenCalledOnce();
		} finally {
			resolveCommit(jsonResponse(503, { error: 'Please retry' }));
		}
		expect(await screen.findByRole('alert')).toHaveTextContent('Please retry');
	});

	it('shares one save and one data refresh across two open review surfaces', async () => {
		let resolveCommit!: (response: Response) => void;
		const fetchMock = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					resolveCommit = resolve;
				})
		);
		vi.stubGlobal('fetch', fetchMock);
		const firstApplied = vi.fn();
		const secondApplied = vi.fn();
		const first = render(ChangeSetReview, {
			props: { runId: 'run-1', changeSet, onApplied: firstApplied }
		});
		const second = render(ChangeSetReview, {
			props: { runId: 'run-1', changeSet, onApplied: secondApplied }
		});
		await fireEvent.click(
			within(first.container).getByRole('button', { name: 'Apply 1 change' })
		);
		expect(within(second.container).getByRole('button', { name: 'Applying…' })).toBeDisabled();
		resolveCommit(jsonResponse(200, { data: { applied: 1, rejected: 0, failed: 0 } }));
		await waitFor(() => {
			expect(firstApplied).toHaveBeenCalledOnce();
			expect(secondApplied).toHaveBeenCalledOnce();
		});
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(loadAiInboxCountMock).toHaveBeenCalledOnce();
		expect(notifyDataMutationMock).toHaveBeenCalledOnce();
	});

	it.each(['network', 'malformed response'])(
		'does not report success after a %s failure and permits checking again',
		async (failure) => {
			const fetchMock = vi.fn();
			if (failure === 'network')
				fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
			else fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { applied: 1 } }));
			fetchMock.mockResolvedValueOnce(
				jsonResponse(200, { data: { applied: 1, rejected: 0, failed: 0 } })
			);
			vi.stubGlobal('fetch', fetchMock);
			const onApplied = vi.fn();
			render(ChangeSetReview, { props: { runId: 'run-1', changeSet, onApplied } });
			await fireEvent.click(screen.getByRole('button', { name: 'Apply 1 change' }));
			expect(await screen.findByRole('alert')).toHaveTextContent(
				'Could not confirm the changes'
			);
			expect(onApplied).not.toHaveBeenCalled();
			expect(notifyDataMutationMock).not.toHaveBeenCalled();
			await fireEvent.click(screen.getByRole('button', { name: 'Apply 1 change' }));
			await waitFor(() => expect(onApplied).toHaveBeenCalledOnce());
			expect(fetchMock).toHaveBeenCalledTimes(2);
		}
	);
});
