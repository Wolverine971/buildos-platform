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

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function documentResponse(id: string, title: string, stateKey = 'draft'): Response {
	return new Response(
		JSON.stringify({
			data: {
				document: {
					id,
					title,
					type_key: 'document.knowledge.research',
					state_key: stateKey,
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

function publicPageResponse(slug: string): Response {
	return jsonResponse({
		data: {
			publicPage: {
				id: `public-${slug}`,
				slug,
				slug_base: slug,
				url_path: `/p/${slug}`,
				title: `${slug} title`,
				public_status: 'live',
				visibility: 'public',
				noindex: false,
				live_sync_enabled: true,
				is_live_public: true,
				is_listed_public: true
			}
		}
	});
}

function docTreeResponse(parentId: string, parentTitle: string, documentId: string): Response {
	return jsonResponse({
		data: {
			structure: {
				version: 1,
				root: [
					{
						id: parentId,
						order: 0,
						children: [{ id: documentId, order: 0, children: [] }]
					}
				]
			},
			documents: {
				[parentId]: { id: parentId, title: parentTitle },
				[documentId]: { id: documentId, title: documentId }
			}
		}
	});
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

	it('keeps save continuations scoped to the document that started them', async () => {
		const saveA = deferred<Response>();
		const saveB = deferred<Response>();
		const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.includes('/documents/document-a/full')) {
				return Promise.resolve(documentResponse('document-a', 'Document A'));
			}
			if (url.includes('/documents/document-b/full')) {
				return Promise.resolve(documentResponse('document-b', 'Document B'));
			}
			if (url === '/api/onto/documents/document-a' && init?.method === 'PATCH') {
				return saveA.promise;
			}
			if (url === '/api/onto/documents/document-b' && init?.method === 'PATCH') {
				return saveB.promise;
			}
			if (url.includes('/api/onto/edges/linked?')) {
				return Promise.resolve(emptyLinkedEntitiesResponse());
			}
			if (url.includes('/api/onto/assets?')) {
				return Promise.resolve(jsonResponse({ data: { assets: [] } }));
			}
			return Promise.resolve(jsonResponse({ data: {} }));
		});
		vi.stubGlobal('fetch', fetchMock);
		const onSaved = vi.fn();
		const onClose = vi.fn();

		const view = render(DocumentModal, {
			props: {
				projectId: 'project-1',
				documentId: 'document-a',
				isOpen: true,
				onSaved,
				onClose
			}
		});

		await waitFor(() => expect(screen.getAllByDisplayValue('Document A')).toHaveLength(2));
		await fireEvent.input(screen.getAllByLabelText('Document title')[0], {
			target: { value: 'Document A edited' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith(
				'/api/onto/documents/document-a',
				expect.objectContaining({ method: 'PATCH' })
			)
		);

		await view.rerender({
			projectId: 'project-1',
			documentId: 'document-b',
			isOpen: true,
			onSaved,
			onClose
		});
		await waitFor(() => expect(screen.getAllByDisplayValue('Document B')).toHaveLength(2));
		await fireEvent.input(screen.getAllByLabelText('Document title')[0], {
			target: { value: 'Document B edited' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith(
				'/api/onto/documents/document-b',
				expect.objectContaining({ method: 'PATCH' })
			)
		);

		saveA.resolve(
			jsonResponse({
				data: {
					document: {
						id: 'document-a',
						updated_at: '2026-01-02T00:00:00.000Z'
					}
				}
			})
		);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		expect(screen.getAllByDisplayValue('Document B edited')).toHaveLength(2);
		expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
		expect(onSaved).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();

		saveB.resolve(
			jsonResponse({
				data: {
					document: {
						id: 'document-b',
						updated_at: '2026-01-03T00:00:00.000Z'
					}
				}
			})
		);
		await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
		expect(screen.getAllByDisplayValue('Document B edited')).toHaveLength(2);
	});

	it('does not close a replacement document when an obsolete delete resolves', async () => {
		const deleteA = deferred<Response>();
		const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.includes('/documents/document-a/full')) {
				return Promise.resolve(documentResponse('document-a', 'Document A', 'archived'));
			}
			if (url.includes('/documents/document-b/full')) {
				return Promise.resolve(documentResponse('document-b', 'Document B'));
			}
			if (url === '/api/onto/documents/document-a' && init?.method === 'DELETE') {
				return deleteA.promise;
			}
			if (url.includes('/api/onto/edges/linked?')) {
				return Promise.resolve(emptyLinkedEntitiesResponse());
			}
			return Promise.resolve(jsonResponse({ data: {} }));
		});
		vi.stubGlobal('fetch', fetchMock);
		const onDeleted = vi.fn();
		const onClose = vi.fn();

		const view = render(DocumentModal, {
			props: {
				projectId: 'project-1',
				documentId: 'document-a',
				isOpen: true,
				onDeleted,
				onClose
			}
		});

		await waitFor(() => expect(screen.getAllByDisplayValue('Document A')).toHaveLength(2));
		await fireEvent.click(screen.getByText('Delete Permanently').closest('button')!);
		await waitFor(() =>
			expect(screen.getByText('Delete archived document')).toBeInTheDocument()
		);
		await fireEvent.click(screen.getByText('Delete permanently').closest('button')!);
		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith(
				'/api/onto/documents/document-a',
				expect.objectContaining({ method: 'DELETE' })
			)
		);

		await view.rerender({
			projectId: 'project-1',
			documentId: 'document-b',
			isOpen: true,
			onDeleted,
			onClose
		});
		await waitFor(() => expect(screen.getAllByDisplayValue('Document B')).toHaveLength(2));

		deleteA.resolve(jsonResponse({ data: { deleted: true } }));
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		expect(screen.getAllByDisplayValue('Document B')).toHaveLength(2);
		expect(onDeleted).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
	});

	it('ignores obsolete deferred comments, public-page, and tree responses', async () => {
		const idleCallbacks: IdleRequestCallback[] = [];
		Object.defineProperty(window, 'requestIdleCallback', {
			configurable: true,
			writable: true,
			value: vi.fn((callback: IdleRequestCallback) => {
				idleCallbacks.push(callback);
				return idleCallbacks.length;
			})
		});
		const runIdleCallbacks = () => {
			for (const callback of idleCallbacks.splice(0)) {
				callback({
					didTimeout: false,
					timeRemaining: () => 50
				});
			}
		};

		const commentsA = deferred<Response>();
		const commentsB = deferred<Response>();
		const publicPageA = deferred<Response>();
		const publicPageB = deferred<Response>();
		const treeA = deferred<Response>();
		const treeB = deferred<Response>();
		const fetchMock = vi.fn((input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/documents/document-a/full')) {
				return Promise.resolve(documentResponse('document-a', 'Document A'));
			}
			if (url.includes('/documents/document-b/full')) {
				return Promise.resolve(documentResponse('document-b', 'Document B'));
			}
			if (url.startsWith('/api/onto/comments?')) {
				return url.includes('project_id=project-a') ? commentsA.promise : commentsB.promise;
			}
			if (url === '/api/onto/documents/document-a/public-page') {
				return publicPageA.promise;
			}
			if (url === '/api/onto/documents/document-b/public-page') {
				return publicPageB.promise;
			}
			if (url === '/api/onto/projects/project-a/doc-tree?include_content=false') {
				return treeA.promise;
			}
			if (url === '/api/onto/projects/project-b/doc-tree?include_content=false') {
				return treeB.promise;
			}
			if (url.includes('/api/onto/edges/linked?')) {
				return Promise.resolve(emptyLinkedEntitiesResponse());
			}
			return Promise.resolve(jsonResponse({ data: {} }));
		});
		vi.stubGlobal('fetch', fetchMock);

		const view = render(DocumentModal, {
			props: {
				projectId: 'project-a',
				documentId: 'document-a',
				isOpen: true
			}
		});

		await waitFor(() => expect(screen.getAllByDisplayValue('Document A')).toHaveLength(2));
		expect(idleCallbacks.length).toBeGreaterThanOrEqual(3);
		runIdleCallbacks();
		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(
				'/api/onto/documents/document-a/public-page',
				expect.objectContaining({ signal: expect.any(AbortSignal) })
			);
			expect(fetchMock).toHaveBeenCalledWith(
				'/api/onto/projects/project-a/doc-tree?include_content=false',
				expect.objectContaining({ signal: expect.any(AbortSignal) })
			);
		});

		await view.rerender({
			projectId: 'project-b',
			documentId: 'document-b',
			isOpen: true
		});
		await waitFor(() => expect(screen.getAllByDisplayValue('Document B')).toHaveLength(2));
		expect(idleCallbacks.length).toBeGreaterThanOrEqual(3);
		runIdleCallbacks();

		commentsB.resolve(jsonResponse({ data: { count: 2 } }));
		publicPageB.resolve(publicPageResponse('b-public'));
		treeB.resolve(docTreeResponse('parent-b', 'B Parent', 'document-b'));
		await waitFor(() => {
			expect(screen.getAllByText('/p/b-public').length).toBeGreaterThan(0);
			expect(screen.getByText('B Parent')).toBeInTheDocument();
		});

		commentsA.resolve(jsonResponse({ data: { count: 99 } }));
		publicPageA.resolve(publicPageResponse('a-public'));
		treeA.resolve(docTreeResponse('parent-a', 'A Parent', 'document-a'));
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		expect(screen.getAllByDisplayValue('Document B')).toHaveLength(2);
		expect(screen.getAllByText('/p/b-public').length).toBeGreaterThan(0);
		expect(screen.getByText('B Parent')).toBeInTheDocument();
		expect(screen.queryByText('/p/a-public')).not.toBeInTheDocument();
		expect(screen.queryByText('A Parent')).not.toBeInTheDocument();
		expect(screen.queryByText('99')).not.toBeInTheDocument();
	});
});
