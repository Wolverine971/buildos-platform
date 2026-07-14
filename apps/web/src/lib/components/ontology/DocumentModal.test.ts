// apps/web/src/lib/components/ontology/DocumentModal.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DocumentModal from './DocumentModal.svelte';

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

function documentResponse(id: string, title: string): Response {
	return new Response(
		JSON.stringify({
			data: {
				document: {
					id,
					title,
					type_key: 'document.knowledge.research',
					state_key: 'draft',
					description: '',
					content: '',
					props: {},
					created_at: '2026-01-01T00:00:00.000Z',
					updated_at: '2026-01-01T00:00:00.000Z'
				}
			}
		}),
		{ status: 200, headers: { 'content-type': 'application/json' } }
	);
}

function emptyLinkedEntitiesResponse(): Response {
	return new Response(
		JSON.stringify({
			data: {
				linkedEntities: {
					tasks: [],
					plans: [],
					goals: [],
					milestones: [],
					documents: [],
					risks: [],
					events: [],
					requirements: []
				}
			}
		}),
		{ status: 200, headers: { 'content-type': 'application/json' } }
	);
}

describe('DocumentModal document loading', () => {
	beforeEach(() => {
		Object.defineProperty(window, 'scrollTo', {
			configurable: true,
			writable: true,
			value: vi.fn()
		});
		Object.defineProperty(Element.prototype, 'animate', {
			configurable: true,
			writable: true,
			value: vi.fn(() => ({
				cancel: vi.fn(),
				commitStyles: vi.fn(),
				finished: Promise.resolve(),
				play: vi.fn()
			}))
		});
		Object.defineProperty(HTMLElement.prototype, 'checkVisibility', {
			configurable: true,
			writable: true,
			value: vi.fn(() => true)
		});
		Object.defineProperty(window, 'requestIdleCallback', {
			configurable: true,
			writable: true,
			value: vi.fn(() => 1)
		});
		Object.defineProperty(window, 'cancelIdleCallback', {
			configurable: true,
			writable: true,
			value: vi.fn()
		});
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('keeps the latest document when an obsolete request ignores abort and resolves last', async () => {
		const documentA = deferred<Response>();
		const documentB = deferred<Response>();
		const requestSignals = new Map<string, AbortSignal | undefined>();
		const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			requestSignals.set(url, init?.signal ?? undefined);

			if (url.includes('/documents/document-a/')) return documentA.promise;
			if (url.includes('/documents/document-b/')) return documentB.promise;
			if (url.includes('/api/onto/edges/linked?')) {
				return Promise.resolve(emptyLinkedEntitiesResponse());
			}

			return Promise.resolve(
				new Response(JSON.stringify({ data: {} }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
			);
		});
		vi.stubGlobal('fetch', fetchMock);
		const onLoaded = vi.fn();
		const onClose = vi.fn();

		const view = render(DocumentModal, {
			props: {
				projectId: 'project-1',
				documentId: 'document-a',
				isOpen: true,
				onClose,
				onLoaded
			}
		});

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith(
				'/api/onto/documents/document-a/full?include_linked=false',
				expect.objectContaining({ signal: expect.any(AbortSignal) })
			)
		);

		await view.rerender({
			projectId: 'project-1',
			documentId: 'document-b',
			isOpen: true,
			onClose,
			onLoaded
		});

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith(
				'/api/onto/documents/document-b/full?include_linked=false',
				expect.objectContaining({ signal: expect.any(AbortSignal) })
			)
		);
		expect(
			requestSignals.get('/api/onto/documents/document-a/full?include_linked=false')?.aborted
		).toBe(true);

		documentB.resolve(documentResponse('document-b', 'Document B'));
		await waitFor(() => expect(screen.getAllByDisplayValue('Document B')).toHaveLength(2));
		expect(onLoaded).toHaveBeenCalledTimes(1);

		// Simulate a transport that ignores abort and still resolves the obsolete request.
		documentA.resolve(documentResponse('document-a', 'Document A'));
		await waitFor(() => {
			expect(screen.getAllByDisplayValue('Document B')).toHaveLength(2);
			expect(screen.queryAllByDisplayValue('Document A')).toHaveLength(0);
			expect(onLoaded).toHaveBeenCalledTimes(1);
		});
	});

	it('cancels the active document request when the modal closes', async () => {
		const pendingDocument = deferred<Response>();
		let requestSignal: AbortSignal | undefined;
		const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
			requestSignal = init?.signal ?? undefined;
			return pendingDocument.promise;
		});
		vi.stubGlobal('fetch', fetchMock);
		const onLoaded = vi.fn();
		const onClose = vi.fn();

		render(DocumentModal, {
			props: {
				projectId: 'project-1',
				documentId: 'document-a',
				isOpen: true,
				onClose,
				onLoaded
			}
		});

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		await fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));

		expect(requestSignal?.aborted).toBe(true);
		expect(onClose).toHaveBeenCalledTimes(1);

		pendingDocument.resolve(documentResponse('document-a', 'Document A'));
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		expect(onLoaded).not.toHaveBeenCalled();
	});

	it('cancels the active document request when the component unmounts', async () => {
		const pendingDocument = deferred<Response>();
		let requestSignal: AbortSignal | undefined;
		vi.stubGlobal(
			'fetch',
			vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
				requestSignal = init?.signal ?? undefined;
				return pendingDocument.promise;
			})
		);

		const view = render(DocumentModal, {
			props: {
				projectId: 'project-1',
				documentId: 'document-a',
				isOpen: true
			}
		});

		await waitFor(() => expect(requestSignal).toBeDefined());
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		view.unmount();

		expect(requestSignal?.aborted).toBe(true);
	});
});
