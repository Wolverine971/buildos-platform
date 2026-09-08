// apps/web/src/lib/components/ontology/DocumentVersionHistoryPanel.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import DocumentVersionHistoryPanel from './DocumentVersionHistoryPanel.svelte';

vi.mock('$lib/utils/ontology-client-logger', () => ({ logOntologyClientError: vi.fn() }));

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}
function list(rows: ReturnType<typeof versionRow>[], hasMore = false) {
	return okJson({
		data: {
			versions: rows,
			total: rows.length,
			hasMore,
			nextCursor: hasMore ? rows.at(-1)!.number : null
		}
	});
}

function okJson(payload: Record<string, unknown>) {
	return Promise.resolve({
		ok: true,
		status: 200,
		json: async () => payload
	} as Response);
}

function versionRow(number: number, overrides: Record<string, unknown> = {}) {
	return {
		id: `version-${number}`,
		number,
		created_by: 'user-1',
		created_by_name: 'DJ Wayne',
		created_at: `2026-05-21T12:0${number}:00.000Z`,
		snapshot_hash: `hash-${number}`,
		window: null,
		change_count: 1,
		change_source: 'api',
		is_merged: false,
		is_open: false,
		is_restore: false,
		restored_by_user_id: null,
		restore_of_version: null,
		...overrides
	};
}

describe('DocumentVersionHistoryPanel', () => {
	afterEach(cleanup);
	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn((input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/onto/documents/document-1/versions?')) {
				return okJson({
					data: {
						versions: [versionRow(4), versionRow(3)],
						total: 2,
						hasMore: false,
						nextCursor: null
					}
				});
			}

			return Promise.resolve({
				ok: false,
				status: 404,
				json: async () => ({ error: `Unhandled ${url}` })
			} as Response);
		});
	});

	it('opens inline comparison when a version row is clicked', async () => {
		const onCompareRequested = vi.fn();

		render(DocumentVersionHistoryPanel, {
			props: {
				documentId: 'document-1',
				projectId: 'project-1',
				onCompareRequested
			}
		});

		const versionThree = await screen.findByRole('button', { name: /v3/i });
		await fireEvent.click(versionThree);

		await waitFor(() => {
			expect(onCompareRequested).toHaveBeenCalledWith(3, 4);
		});
	});
	it('ignores old-document results even when the server finishes after cancellation', async () => {
		const pending = deferred<Response>();
		vi.mocked(fetch)
			.mockReturnValueOnce(pending.promise)
			.mockImplementationOnce(() => list([versionRow(8)]));
		const view = render(DocumentVersionHistoryPanel, {
			props: { documentId: 'document-1', projectId: 'project-1' }
		});
		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
		const signal = vi.mocked(fetch).mock.calls[0]![1]!.signal;
		await view.rerender({ documentId: 'document-2', projectId: 'project-1' });
		await screen.findByRole('button', { name: /v8/ });
		expect(signal?.aborted).toBe(true);
		pending.resolve(await list([versionRow(4)]));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(screen.queryByRole('button', { name: /v4/ })).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: /v8/ })).toBeInTheDocument();
	});

	it('cancels pagination when the time filter changes, without duplicate filter requests', async () => {
		const pending = deferred<Response>();
		vi.mocked(fetch)
			.mockImplementationOnce(() => list([versionRow(4)], true))
			.mockReturnValueOnce(pending.promise)
			.mockImplementationOnce(() => list([versionRow(7)]));
		render(DocumentVersionHistoryPanel, {
			props: { documentId: 'document-1', projectId: 'project-1' }
		});
		await fireEvent.click(await screen.findByRole('button', { name: 'Show older versions' }));
		const signal = vi.mocked(fetch).mock.calls[1]![1]!.signal;
		await fireEvent.click(screen.getByRole('button', { name: 'Toggle filters' }));
		await fireEvent.click(screen.getByRole('button', { name: '24h' }));
		await screen.findByRole('button', { name: /v7/ });
		expect(signal?.aborted).toBe(true);
		pending.resolve(await list([versionRow(2)], true));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(screen.queryByRole('button', { name: /v2/ })).not.toBeInTheDocument();
		expect(
			screen.queryByRole('button', { name: 'Show older versions' })
		).not.toBeInTheDocument();
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it('requires selecting a refreshed snapshot again before restore', async () => {
		const onRestoreRequested = vi.fn();
		const view = render(DocumentVersionHistoryPanel, {
			props: {
				documentId: 'document-1',
				projectId: 'project-1',
				isAdmin: true,
				onRestoreRequested
			}
		});
		await fireEvent.click(await screen.findByRole('button', { name: /v3/ }));
		expect(screen.getByRole('button', { name: 'Restore this version' })).toBeInTheDocument();
		vi.mocked(fetch).mockImplementationOnce(() =>
			list([versionRow(4), versionRow(3, { snapshot_hash: 'refreshed-hash' })])
		);
		await view.component.refresh();
		await waitFor(() =>
			expect(
				screen.queryByRole('button', { name: 'Restore this version' })
			).not.toBeInTheDocument()
		);
		await fireEvent.click(screen.getByRole('button', { name: /v3/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Restore this version' }));
		expect(onRestoreRequested).toHaveBeenCalledWith(
			expect.objectContaining({ snapshot_hash: 'refreshed-hash' }),
			4
		);
	});

	it('aborts pending loads when the panel is removed', async () => {
		const pending = deferred<Response>();
		vi.mocked(fetch).mockReturnValueOnce(pending.promise);
		const view = render(DocumentVersionHistoryPanel, {
			props: { documentId: 'document-1', projectId: 'project-1' }
		});
		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
		const signal = vi.mocked(fetch).mock.calls[0]![1]!.signal;
		view.unmount();
		expect(signal?.aborted).toBe(true);
		pending.resolve(await list([versionRow(4)]));
	});
});
