// apps/web/src/lib/components/ontology/DocumentModal.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DocumentModal from './DocumentModal.svelte';
import { EditorView } from '@codemirror/view';
import { createDocumentPatchV1 } from '@buildos/shared-agent-ops/ontology/document-patch';

const { toastWarningMock, toastSuccessMock } = vi.hoisted(() => ({
	toastWarningMock: vi.fn(),
	toastSuccessMock: vi.fn()
}));

vi.mock('$lib/stores/toast.store', () => ({
	toastService: {
		error: vi.fn(),
		success: toastSuccessMock,
		info: vi.fn(),
		warning: toastWarningMock
	}
}));

// Start the heavy dynamic import during collection so this test's behavioral
// timeout measures dock interaction/rendering instead of loaded-suite transform contention.
const agentChatModalModule = import('$lib/components/agent/AgentChatModal.svelte');

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

function documentResponse(id: string, title: string, stateKey = 'draft', content = ''): Response {
	return new Response(
		JSON.stringify({
			data: {
				document: {
					id,
					title,
					type_key: 'document.knowledge.research',
					state_key: stateKey,
					description: '',
					content,
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

	it('opens with the right details panel closed and resets it for the next modal session', async () => {
		const view = render(DocumentModal, {
			props: {
				projectId: 'project-1',
				isOpen: true
			}
		});

		const detailsPanel = document.getElementById('document-details-panel');
		const openButton = screen.getByRole('button', { name: 'Open details panel' });
		const tabPositioner = openButton.parentElement;
		const detailsContent = document.getElementById('document-details-content');
		expect(detailsPanel).toHaveAttribute('aria-hidden', 'true');
		expect(detailsPanel).toHaveProperty('inert', true);
		expect(detailsPanel).toHaveClass('lg:min-h-0', 'overflow-hidden');
		expect(detailsContent).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
		expect(openButton).toHaveAttribute('aria-expanded', 'false');
		expect(openButton.closest('.document-modal-header')).toBeNull();
		expect(tabPositioner).toHaveClass('right-0');

		await fireEvent.click(openButton);
		expect(detailsPanel).toHaveAttribute('aria-hidden', 'false');
		expect(detailsPanel).toHaveProperty('inert', false);
		expect(tabPositioner).toHaveClass('right-64');
		expect(screen.getByRole('button', { name: 'Close details panel' })).toHaveAttribute(
			'aria-expanded',
			'true'
		);

		await view.rerender({
			projectId: 'project-1',
			isOpen: false
		});
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		await view.rerender({
			projectId: 'project-1',
			isOpen: true
		});

		await waitFor(() => {
			expect(document.getElementById('document-details-panel')).toHaveAttribute(
				'aria-hidden',
				'true'
			);
			expect(screen.getByRole('button', { name: 'Open details panel' })).toHaveAttribute(
				'aria-expanded',
				'false'
			);
		});
	});

	it('reveals Details when a new document needs a title', async () => {
		render(DocumentModal, {
			props: {
				projectId: 'project-1',
				isOpen: true
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Create' }));

		expect(document.getElementById('document-details-panel')).toHaveAttribute(
			'aria-hidden',
			'false'
		);
		expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		expect(screen.getAllByText('Title is required').length).toBeGreaterThan(0);
	});

	it('shows Document Interact in the document header and opens its dock', async () => {
		await agentChatModalModule;
		const fetchMock = vi.fn((input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/documents/document-a/full')) {
				return Promise.resolve(documentResponse('document-a', 'Document A'));
			}
			if (url.includes('/api/onto/edges/linked?')) {
				return Promise.resolve(emptyLinkedEntitiesResponse());
			}
			return Promise.resolve(jsonResponse({ data: {} }));
		});
		vi.stubGlobal('fetch', fetchMock);

		render(DocumentModal, {
			props: {
				projectId: 'project-1',
				documentId: 'document-a',
				isOpen: true
			}
		});

		await waitFor(() => expect(screen.getByDisplayValue('Document A')).toBeInTheDocument());
		expect(screen.getAllByLabelText('Document title')).toHaveLength(1);
		expect(screen.queryByText('CONTENT')).not.toBeInTheDocument();
		const trigger = screen.getByRole('button', { name: 'Open Document Interact' });
		expect(trigger).toHaveAttribute('aria-expanded', 'false');

		await fireEvent.click(trigger);

		expect(trigger).toHaveAttribute('aria-expanded', 'true');
		expect(trigger).toHaveAccessibleName('Close Document Interact');
		const interactDock = screen.getByLabelText('Document interaction');
		expect(interactDock).toBeInTheDocument();
		expect(interactDock).toHaveAttribute('data-placement', 'inline');
		expect(interactDock).not.toHaveClass('absolute');
		expect(interactDock).not.toHaveClass('fixed');
		expect(interactDock).toHaveClass('h-[clamp(15rem,34dvh,24rem)]');

		await waitFor(
			() => {
				expect(screen.getByText('DOCUMENT CHAT')).toBeInTheDocument();
				expect(
					screen.getByText('Ask BuildOS to explain, rewrite, or update this document.')
				).toBeInTheDocument();
				expect(
					screen.getByPlaceholderText('Ask about or update this document...')
				).toBeInTheDocument();
			},
			{ timeout: 5_000 }
		);
		expect(screen.queryByRole('tab', { name: 'Chat' })).not.toBeInTheDocument();
		expect(screen.queryByRole('tab', { name: /^Steps/ })).not.toBeInTheDocument();
		expect(screen.queryByRole('tab', { name: /^Tools/ })).not.toBeInTheDocument();
		expect(screen.queryByRole('tab', { name: /^Changes/ })).not.toBeInTheDocument();
		expect(screen.queryByText(/New chat ·/i)).not.toBeInTheDocument();
		expect(
			screen.getByRole('button', { name: 'Close document interaction' })
		).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Open details panel' }));
		expect(document.getElementById('document-details-panel')).toHaveAttribute(
			'aria-hidden',
			'false'
		);
		expect(interactDock).toHaveAttribute('aria-hidden', 'false');
	}, 10_000);

	it('opens full agentic chat from the header with this document in focus', async () => {
		await agentChatModalModule;
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL) => {
				if (String(input).includes('/documents/document-a/full')) {
					return Promise.resolve(documentResponse('document-a', 'Document A'));
				}
				return Promise.resolve(jsonResponse({ data: {} }));
			})
		);
		const view = render(DocumentModal, {
			props: { projectId: 'project-1', documentId: 'document-a', isOpen: true }
		});
		await waitFor(() => expect(screen.getByDisplayValue('Document A')).toBeInTheDocument());
		const button = screen.getByRole('button', { name: 'Chat about this document' });
		expect(button.closest('.document-modal-header')).not.toBeNull();
		expect(button.querySelector('img')).toHaveAttribute('src', '/brain-bolt.webp');
		await fireEvent.click(button);
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Document A' })).toBeInTheDocument()
		);
		expect(screen.getByRole('button', { name: 'Clear focus' })).toBeInTheDocument();
		expect(screen.queryByLabelText('Document interaction')).not.toBeInTheDocument();
		await view.rerender({ projectId: 'project-1', documentId: 'document-a', isOpen: false });
		await waitFor(() =>
			expect(screen.queryByRole('button', { name: 'Clear focus' })).not.toBeInTheDocument()
		);
	}, 10_000);

	it('keeps conflicts paused through further typing and a failed explicit overwrite', async () => {
		const writes: Record<string, unknown>[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
				if (String(input).includes('/documents/document-a/full')) {
					return Promise.resolve(documentResponse('document-a', 'Document A'));
				}
				if (init?.method === 'PATCH') {
					writes.push(JSON.parse(String(init.body)));
					return Promise.resolve(
						jsonResponse({ error: 'Save failed' }, writes.length === 1 ? 409 : 500)
					);
				}
				return Promise.resolve(jsonResponse({ data: {} }));
			})
		);
		render(DocumentModal, {
			props: { projectId: 'project-1', documentId: 'document-a', isOpen: true }
		});
		await waitFor(() => expect(screen.getByDisplayValue('Document A')).toBeInTheDocument());
		await fireEvent.input(screen.getByLabelText('Document title'), {
			target: { value: 'My draft' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await waitFor(() => expect(screen.getByText(/autosave is paused/)).toBeInTheDocument());
		await fireEvent.input(screen.getByLabelText('Document title'), {
			target: { value: 'More local edits' }
		});
		await new Promise((resolve) => setTimeout(resolve, 2100));
		expect(writes).toHaveLength(1);
		expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
		expect(screen.getByDisplayValue('More local edits')).toBeInTheDocument();
		expect(screen.getByText(/autosave is paused/)).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Overwrite' }));
		await waitFor(() => expect(writes).toHaveLength(2));
		expect(writes[1]).not.toHaveProperty('expected_updated_at');
		await waitFor(() => expect(screen.getByText(/autosave is paused/)).toBeInTheDocument());
		await fireEvent.input(screen.getByLabelText('Document title'), {
			target: { value: 'Still my draft' }
		});
		await new Promise((resolve) => setTimeout(resolve, 2100));
		expect(writes).toHaveLength(2);
		expect(screen.getByDisplayValue('Still my draft')).toBeInTheDocument();
	}, 10_000);

	it('serializes autosaves and uses the returned timestamp without losing in-flight edits', async () => {
		const firstSave = deferred<Response>();
		const writes: Record<string, unknown>[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
				if (String(input).includes('/documents/document-a/full')) {
					return Promise.resolve(documentResponse('document-a', 'Document A'));
				}
				if (init?.method === 'PATCH') {
					writes.push(JSON.parse(String(init.body)));
					return writes.length === 1
						? firstSave.promise
						: Promise.resolve(
								jsonResponse({
									data: {
										document: {
											id: 'document-a',
											updated_at: '2026-01-03T00:00:00.000Z'
										}
									}
								})
							);
				}
				return Promise.resolve(jsonResponse({ data: {} }));
			})
		);
		render(DocumentModal, {
			props: { projectId: 'project-1', documentId: 'document-a', isOpen: true }
		});
		await waitFor(() => expect(screen.getByDisplayValue('Document A')).toBeInTheDocument());
		await fireEvent.input(screen.getByLabelText('Document title'), {
			target: { value: 'First edit' }
		});
		await waitFor(() => expect(writes).toHaveLength(1), { timeout: 3000 });
		await fireEvent.input(screen.getByLabelText('Document title'), {
			target: { value: 'Second edit' }
		});
		await new Promise((resolve) => setTimeout(resolve, 2100));
		expect(writes).toHaveLength(1);
		firstSave.resolve(
			jsonResponse({
				data: { document: { id: 'document-a', updated_at: '2026-01-02T00:00:00.000Z' } }
			})
		);
		await waitFor(() => expect(writes).toHaveLength(2));
		expect(writes[1]).toMatchObject({
			title: 'Second edit',
			expected_updated_at: '2026-01-02T00:00:00.000Z'
		});
		expect(screen.getByDisplayValue('Second edit')).toBeInTheDocument();
		expect(screen.queryByText(/autosave is paused/)).not.toBeInTheDocument();
	}, 10_000);

	it('reselects a conflicted passage with the instruction preserved and no old proposal', async () => {
		const content = '# Plan\n\nDraft this paragraph.\n\nKeep this context.';
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				if (url.includes('/documents/document-a/full'))
					return Promise.resolve(
						documentResponse('document-a', 'Document A', 'draft', content)
					);
				if (url.endsWith('/proposals') && init?.method === 'POST') {
					const body = JSON.parse(String(init.body));
					return Promise.resolve(
						jsonResponse({
							data: {
								proposal: {
									id: 'proposal-a',
									status: 'pending',
									instruction: body.instruction,
									conflict_reason: null,
									patch: createDocumentPatchV1({
										project_id: 'project-1',
										document_id: 'document-a',
										base_content: content,
										selections: [
											{
												op_id: 'op-1',
												from: body.selection_from,
												to: body.selection_to,
												replacement_markdown: 'Clear paragraph.'
											}
										]
									})
								}
							}
						})
					);
				}
				if (url.endsWith('/apply'))
					return Promise.resolve(
						jsonResponse({ error: 'The target changed', code: 'TARGET_CHANGED' }, 409)
					);
				return Promise.resolve(jsonResponse({ data: {} }));
			})
		);
		render(DocumentModal, {
			props: { projectId: 'project-1', documentId: 'document-a', isOpen: true }
		});
		await waitFor(() => expect(document.querySelector('.cm-content')).toBeInTheDocument());
		const editor = EditorView.findFromDOM(
			document.querySelector('.cm-content') as HTMLElement
		)!;
		editor.dispatch({ selection: { anchor: 8, head: 29 } });
		await fireEvent.click(
			screen.getByRole('button', { name: 'Ask the agent to revise selected text' })
		);
		await waitFor(() =>
			expect(screen.getByRole('textbox', { name: 'Proposal instruction' })).toHaveFocus()
		);
		await fireEvent.input(screen.getByRole('textbox', { name: 'Proposal instruction' }), {
			target: { value: 'Make it clearer' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Generate proposal' }));
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Apply proposal' })).toBeInTheDocument()
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Apply proposal' }));
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Select again' })).toBeInTheDocument()
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Select again' }));
		expect(
			screen.queryByRole('region', { name: 'Agent document proposal' })
		).not.toBeInTheDocument();
		expect(document.querySelector('.cm-content')).toHaveFocus();
		editor.dispatch({ selection: { anchor: 31, head: content.length } });
		await fireEvent.click(
			screen.getByRole('button', { name: 'Ask the agent to revise selected text' })
		);
		await waitFor(() =>
			expect(screen.getByRole('textbox', { name: 'Proposal instruction' })).toHaveValue(
				'Make it clearer'
			)
		);
		expect(screen.queryByRole('button', { name: 'Apply proposal' })).not.toBeInTheDocument();
		expect(screen.getByRole('region', { name: 'Agent document proposal' })).toHaveTextContent(
			'Keep this context.'
		);
	});

	it('waits for an in-flight save before opening the selected passage review', async () => {
		const save = deferred<Response>();
		const content = 'Draft this paragraph.';
		const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			if (String(input).includes('/documents/document-a/full'))
				return Promise.resolve(
					documentResponse('document-a', 'Document A', 'draft', content)
				);
			if (init?.method === 'PATCH') return save.promise;
			return Promise.resolve(jsonResponse({ data: {} }));
		});
		vi.stubGlobal('fetch', fetchMock);
		render(DocumentModal, {
			props: { projectId: 'project-1', documentId: 'document-a', isOpen: true }
		});
		await waitFor(() => expect(document.querySelector('.cm-content')).toBeInTheDocument());
		await fireEvent.input(screen.getByLabelText('Document title'), {
			target: { value: 'Updated title' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		const editor = EditorView.findFromDOM(
			document.querySelector('.cm-content') as HTMLElement
		)!;
		editor.dispatch({ selection: { anchor: 0, head: content.length } });
		await fireEvent.click(
			screen.getByRole('button', { name: 'Ask the agent to revise selected text' })
		);
		expect(
			screen.queryByRole('region', { name: 'Agent document proposal' })
		).not.toBeInTheDocument();
		save.resolve(
			jsonResponse({
				data: { document: { id: 'document-a', updated_at: '2026-01-02T00:00:00Z' } }
			})
		);
		await waitFor(() =>
			expect(
				screen.getByRole('textbox', { name: 'Proposal instruction' })
			).toBeInTheDocument()
		);
		expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(1);
	});

	it('locks all authored fields through apply and refresh, and surfaces history warnings honestly', async () => {
		const content = 'Draft this paragraph.';
		const appliedContent = 'Clear paragraph.';
		const apply = deferred<Response>();
		const reload = deferred<Response>();
		let loads = 0;
		const proposal = {
			id: 'proposal-a',
			status: 'pending',
			instruction: 'Clarify',
			conflict_reason: null,
			patch: createDocumentPatchV1({
				project_id: 'project-1',
				document_id: 'document-a',
				base_content: content,
				selections: [
					{
						op_id: 'op-1',
						from: 0,
						to: content.length,
						replacement_markdown: appliedContent
					}
				]
			})
		};
		const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.includes('/documents/document-a/full'))
				return ++loads === 1
					? Promise.resolve(
							documentResponse('document-a', 'Document A', 'draft', content)
						)
					: reload.promise;
			if (url.endsWith('/proposals') && init?.method === 'POST')
				return Promise.resolve(jsonResponse({ data: { proposal } }));
			if (url.endsWith('/apply')) return apply.promise;
			return Promise.resolve(jsonResponse({ data: {} }));
		});
		vi.stubGlobal('fetch', fetchMock);
		render(DocumentModal, {
			props: { projectId: 'project-1', documentId: 'document-a', isOpen: true }
		});
		await waitFor(() => expect(document.querySelector('.cm-content')).toBeInTheDocument());
		EditorView.findFromDOM(document.querySelector('.cm-content') as HTMLElement)!.dispatch({
			selection: { anchor: 0, head: content.length }
		});
		await fireEvent.click(
			screen.getByRole('button', { name: 'Ask the agent to revise selected text' })
		);
		await waitFor(() =>
			expect(
				screen.getByRole('textbox', { name: 'Proposal instruction' })
			).toBeInTheDocument()
		);
		await fireEvent.input(screen.getByRole('textbox', { name: 'Proposal instruction' }), {
			target: { value: 'Clarify' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Generate proposal' }));
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Apply proposal' })).toBeInTheDocument()
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Apply proposal' }));
		expect(screen.getByLabelText('Document title')).toBeDisabled();
		expect(screen.getByPlaceholderText('Short summary')).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Close modal' })).toBeDisabled();
		await fireEvent.submit(document.getElementById('document-modal-document-a')!);
		expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0);
		const warning = 'Saved, but version history could not be written.';
		apply.resolve(
			jsonResponse({
				data: { proposal: { ...proposal, status: 'applied' }, version_warning: warning }
			})
		);
		await waitFor(() => expect(loads).toBe(2));
		expect(screen.getByRole('button', { name: 'Close modal' })).toBeDisabled();
		reload.resolve(documentResponse('document-a', 'Document A', 'draft', appliedContent));
		await waitFor(() =>
			expect(document.querySelector('.cm-content')).toHaveTextContent(appliedContent)
		);
		expect(toastWarningMock).toHaveBeenCalledWith(warning);
		expect(toastSuccessMock).not.toHaveBeenCalledWith(
			'Proposal applied and added to version history.'
		);
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Close modal' })).not.toBeDisabled()
		);
		await waitFor(() => expect(document.querySelector('.cm-content')).toHaveFocus());
		const restoredSelection = EditorView.findFromDOM(
			document.querySelector('.cm-content') as HTMLElement
		)!.state.selection.main;
		expect({ from: restoredSelection.from, to: restoredSelection.to }).toEqual({
			from: 0,
			to: appliedContent.length
		});
	});

	it.each([false, true])(
		'checkpoints before version restore and keeps the editor locked through reload (history failure=%s)',
		async (historyFailure) => {
			const checkpoint = deferred<Response>();
			const restore = deferred<Response>();
			const reload = deferred<Response>();
			let loads = 0;
			const versions = [2, 1].map((number) => ({
				id: `v${number}`,
				number,
				created_by: 'actor-1',
				created_by_name: 'Editor',
				created_at: '2026-01-01T00:00:00Z',
				snapshot_hash: `hash-${number}`,
				window: null,
				change_count: 1,
				change_source: 'ui',
				is_merged: false,
				is_open: false,
				is_restore: false,
				restored_by_user_id: null,
				restore_of_version: null
			}));
			const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				if (url.includes('/documents/document-a/full')) {
					loads += 1;
					return loads === 1
						? Promise.resolve(
								documentResponse(
									'document-a',
									'Document A',
									'draft',
									'Current text'
								)
							)
						: reload.promise;
				}
				if (url.includes('/versions?'))
					return Promise.resolve(
						jsonResponse({
							data: { versions, total: 2, hasMore: false, nextCursor: null }
						})
					);
				if (url.endsWith('/versions/1/restore')) return restore.promise;
				if (url.includes('/logs?'))
					return Promise.resolve(
						jsonResponse({ data: { logs: [], total: 0, hasMore: false } })
					);
				if (url.endsWith('/versions/1'))
					return Promise.resolve(
						jsonResponse({
							data: {
								...versions[1],
								snapshot: {
									title: 'Earlier',
									content: 'Earlier text',
									description: '',
									state_key: 'draft'
								}
							}
						})
					);
				if (init?.method === 'PATCH') return checkpoint.promise;
				return Promise.resolve(jsonResponse({ data: {} }));
			});
			vi.stubGlobal('fetch', fetchMock);
			render(DocumentModal, {
				props: { projectId: 'project-1', documentId: 'document-a', isOpen: true }
			});
			await waitFor(() =>
				expect(document.querySelector('.cm-content')).toHaveTextContent('Current text')
			);
			const editor = EditorView.findFromDOM(
				document.querySelector('.cm-content') as HTMLElement
			)!;
			editor.dispatch({
				changes: { from: 0, to: editor.state.doc.length, insert: 'My unsaved edits' }
			});
			await fireEvent.click(screen.getByRole('tab', { name: 'History' }));
			await fireEvent.click(await screen.findByRole('button', { name: /^v1\b/i }));
			await fireEvent.click(
				await screen.findByRole('button', { name: 'Restore this version' })
			);
			await fireEvent.click(screen.getByRole('checkbox'));
			await fireEvent.click(
				screen.getByRole('button', { name: 'Restore Version', exact: true })
			);
			await waitFor(() =>
				expect(
					fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')
				).toHaveLength(1)
			);
			const saveRequest = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!;
			expect(JSON.parse(String(saveRequest[1]?.body))).toMatchObject({
				content: 'My unsaved edits',
				force_version: true
			});
			expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/restore'))).toBe(
				false
			);
			await fireEvent.submit(document.getElementById('document-modal-document-a')!);
			expect(
				fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')
			).toHaveLength(1);
			checkpoint.resolve(
				jsonResponse({
					data: {
						document: { id: 'document-a', updated_at: '2026-09-07T12:01:00Z' },
						versionWarning: historyFailure ? 'History unavailable' : null
					}
				})
			);
			if (historyFailure) {
				await screen.findByText(/current document could not be saved to history/i);
				expect(
					fetchMock.mock.calls.some(([input]) => String(input).endsWith('/restore'))
				).toBe(false);
				return;
			}
			await waitFor(() =>
				expect(
					fetchMock.mock.calls.some(([input]) => String(input).endsWith('/restore'))
				).toBe(true)
			);
			const restoreRequest = fetchMock.mock.calls.find(([input]) =>
				String(input).endsWith('/restore')
			)!;
			expect(JSON.parse(String(restoreRequest[1]?.body))).toEqual({
				expected_updated_at: '2026-09-07T12:01:00Z',
				expected_snapshot_hash: 'hash-1'
			});
			restore.resolve(
				jsonResponse({ data: { document: { id: 'document-a' }, version_warning: null } })
			);
			await waitFor(() => expect(loads).toBe(2));
			expect(screen.getByRole('button', { name: 'Close modal' })).toBeDisabled();
			reload.resolve(documentResponse('document-a', 'Earlier', 'draft', 'Earlier text'));
			await waitFor(() =>
				expect(document.querySelector('.cm-content')).toHaveTextContent('Earlier text')
			);
			await waitFor(() => expect(document.querySelector('.cm-content')).toHaveFocus());
			expect(
				screen.queryByRole('button', { name: 'Restore Version', exact: true })
			).not.toBeInTheDocument();
		}
	);

	it('portals the More actions menu above the modal clipping context', async () => {
		const fetchMock = vi.fn((input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/documents/document-a/full')) {
				return Promise.resolve(documentResponse('document-a', 'Document A'));
			}
			if (url.includes('/api/onto/edges/linked?')) {
				return Promise.resolve(emptyLinkedEntitiesResponse());
			}
			return Promise.resolve(jsonResponse({ data: {} }));
		});
		vi.stubGlobal('fetch', fetchMock);

		render(DocumentModal, {
			props: {
				projectId: 'project-1',
				documentId: 'document-a',
				isOpen: true
			}
		});

		await waitFor(() => expect(screen.getByDisplayValue('Document A')).toBeInTheDocument());
		await fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

		const menu = screen.getByRole('menu');
		expect(menu.parentElement).toBe(document.body);
		expect(screen.getByRole('menuitem', { name: 'Copy document URL' })).toBeVisible();
		expect(screen.getByRole('menuitem', { name: 'Open document page' })).toBeVisible();
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
		await waitFor(() => expect(screen.getByDisplayValue('Document B')).toBeInTheDocument());
		expect(onLoaded).toHaveBeenCalledTimes(1);

		// Simulate a transport that ignores abort and still resolves the obsolete request.
		documentA.resolve(documentResponse('document-a', 'Document A'));
		await waitFor(() => {
			expect(screen.getByDisplayValue('Document B')).toBeInTheDocument();
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

		await waitFor(() => expect(screen.getByDisplayValue('Document A')).toBeInTheDocument());
		await fireEvent.input(screen.getByLabelText('Document title'), {
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
		await waitFor(() => expect(screen.getByDisplayValue('Document B')).toBeInTheDocument());
		await fireEvent.input(screen.getByLabelText('Document title'), {
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

		expect(screen.getByDisplayValue('Document B edited')).toBeInTheDocument();
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
		expect(screen.getByDisplayValue('Document B edited')).toBeInTheDocument();
	});

	it('surfaces a version-history warning returned by a successful save', async () => {
		const warning =
			'Your change was saved, but this edit could not be added to version history.';
		const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.includes('/documents/document-a/full')) {
				return Promise.resolve(documentResponse('document-a', 'Document A'));
			}
			if (url === '/api/onto/documents/document-a' && init?.method === 'PATCH') {
				return Promise.resolve(
					jsonResponse({
						data: {
							document: {
								id: 'document-a',
								updated_at: '2026-01-02T00:00:00.000Z'
							},
							versionWarning: warning
						}
					})
				);
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

		render(DocumentModal, {
			props: {
				projectId: 'project-1',
				documentId: 'document-a',
				isOpen: true
			}
		});

		await waitFor(() => expect(screen.getByDisplayValue('Document A')).toBeInTheDocument());
		await fireEvent.input(screen.getByLabelText('Document title'), {
			target: { value: 'Document A edited' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(toastWarningMock).toHaveBeenCalledWith(warning));
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

		await waitFor(() => expect(screen.getByDisplayValue('Document A')).toBeInTheDocument());
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
		await waitFor(() => expect(screen.getByDisplayValue('Document B')).toBeInTheDocument());

		deleteA.resolve(jsonResponse({ data: { deleted: true } }));
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		expect(screen.getByDisplayValue('Document B')).toBeInTheDocument();
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

		await waitFor(() => expect(screen.getByDisplayValue('Document A')).toBeInTheDocument());
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
		await waitFor(() => expect(screen.getByDisplayValue('Document B')).toBeInTheDocument());
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

		expect(screen.getByDisplayValue('Document B')).toBeInTheDocument();
		expect(screen.getAllByText('/p/b-public').length).toBeGreaterThan(0);
		expect(screen.getByText('B Parent')).toBeInTheDocument();
		expect(screen.queryByText('/p/a-public')).not.toBeInTheDocument();
		expect(screen.queryByText('A Parent')).not.toBeInTheDocument();
		expect(screen.queryByText('99')).not.toBeInTheDocument();
	});
});
