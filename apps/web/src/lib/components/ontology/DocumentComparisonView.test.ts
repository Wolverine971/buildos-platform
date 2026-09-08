// apps/web/src/lib/components/ontology/DocumentComparisonView.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DocumentComparisonView from './DocumentComparisonView.svelte';

vi.mock('$lib/utils/ontology-client-logger', () => ({ logOntologyClientError: vi.fn() }));
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}
function version(number: number, content: string) {
	return new Response(
		JSON.stringify({
			data: {
				id: `v${number}`,
				number,
				created_by_name: 'Editor',
				created_at: '2026-09-07T12:00:00Z',
				window: null,
				snapshot: { title: 'Notes', description: null, content, state_key: 'draft' }
			}
		})
	);
}
const props = {
	documentId: 'doc-a',
	projectId: 'project-a',
	fromVersionNumber: 1,
	toVersionNumber: 'current' as const,
	latestVersionNumber: 3,
	currentDocument: {
		title: 'Notes',
		description: null,
		content: 'Current notes',
		state_key: 'draft'
	},
	onExit: vi.fn(),
	onNavigate: vi.fn()
};

describe('DocumentComparisonView', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal('fetch', vi.fn());
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('isolates snapshot caches between documents with the same version numbers', async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce(version(1, 'Document A content'))
			.mockResolvedValueOnce(version(1, 'Document B content'));
		const view = render(DocumentComparisonView, { props });
		await screen.findByText('Document A content');
		await view.rerender({ ...props, documentId: 'doc-b' });
		await screen.findByText('Document B content');
		expect(screen.queryByText('Document A content')).not.toBeInTheDocument();
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(vi.mocked(fetch).mock.calls[1]![0]).toBe('/api/onto/documents/doc-b/versions/1');
	});

	it('ignores an aborted response before it can poison the cache or replace a newer comparison', async () => {
		const pending = deferred<Response>();
		vi.mocked(fetch)
			.mockReturnValueOnce(pending.promise)
			.mockResolvedValueOnce(version(2, 'Second version'))
			.mockResolvedValueOnce(version(1, 'Fresh first version'));
		const view = render(DocumentComparisonView, { props });
		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
		const signal = vi.mocked(fetch).mock.calls[0]![1]!.signal;
		await view.rerender({ ...props, fromVersionNumber: 2 });
		await screen.findByText('Second version');
		expect(signal?.aborted).toBe(true);
		pending.resolve(version(1, 'Obsolete first version'));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(screen.queryByText('Obsolete first version')).not.toBeInTheDocument();
		await view.rerender(props);
		await screen.findByText('Fresh first version');
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it('reuses sealed history but reloads the newest snapshot on return and explicit refresh', async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce(version(3, 'Open revision before'))
			.mockResolvedValueOnce(version(1, 'Sealed revision'))
			.mockResolvedValueOnce(version(3, 'Open revision after'))
			.mockResolvedValueOnce(version(3, 'Explicitly refreshed revision'));
		const view = render(DocumentComparisonView, { props: { ...props, fromVersionNumber: 3 } });
		await screen.findByText('Open revision before');
		await view.rerender(props);
		await screen.findByText('Sealed revision');
		await view.rerender({ ...props, fromVersionNumber: 3 });
		await screen.findByText('Open revision after');
		await view.rerender({ ...props, fromVersionNumber: 3, refreshKey: 1 });
		await screen.findByText('Explicitly refreshed revision');
		await view.rerender({ ...props, refreshKey: 1 });
		await screen.findByText('Sealed revision');
		expect(fetch).toHaveBeenCalledTimes(4);
	});

	it('updates the Current side when the editor changes without another history request', async () => {
		vi.mocked(fetch).mockResolvedValue(version(1, 'Baseline'));
		const view = render(DocumentComparisonView, { props });
		await screen.findByText('Current notes');
		await view.rerender({
			...props,
			currentDocument: { ...props.currentDocument, content: 'Updated editor notes' }
		});
		await screen.findByText('Updated editor notes');
		expect(screen.queryByText('Current notes')).not.toBeInTheDocument();
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('fetches both sides together and shows missing snapshots as an error', async () => {
		const first = deferred<Response>();
		vi.mocked(fetch)
			.mockReturnValueOnce(first.promise)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ data: { number: 2, snapshot: null } }))
			);
		render(DocumentComparisonView, { props: { ...props, toVersionNumber: 2 } });
		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
		await screen.findByText('Version 2 has no available snapshot');
		first.resolve(version(1, 'Late first version'));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(screen.queryByText('Late first version')).not.toBeInTheDocument();
	});

	it('scopes keyboard navigation and Escape to the comparison region', async () => {
		vi.mocked(fetch).mockResolvedValue(version(1, 'Baseline'));
		render(DocumentComparisonView, { props });
		await screen.findByText('Baseline');
		const region = screen.getByRole('region', { name: 'Document version comparison' });
		expect(region).toHaveFocus();
		await fireEvent.keyDown(window, { key: 'ArrowRight' });
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(props.onNavigate).not.toHaveBeenCalled();
		expect(props.onExit).not.toHaveBeenCalled();
		await fireEvent.keyDown(region, { key: 'ArrowRight' });
		expect(props.onNavigate).toHaveBeenCalledWith(2, 'current');
		const outerKeydown = vi.fn();
		window.addEventListener('keydown', outerKeydown);
		await fireEvent.keyDown(region, { key: 'Escape' });
		expect(props.onExit).toHaveBeenCalledOnce();
		expect(outerKeydown).not.toHaveBeenCalled();
		window.removeEventListener('keydown', outerKeydown);
	});
});
