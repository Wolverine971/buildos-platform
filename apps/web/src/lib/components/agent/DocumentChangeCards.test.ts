// apps/web/src/lib/components/agent/DocumentChangeCards.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { summarizeDocumentChange } from '@buildos/shared-agent-ops/ontology/document-edits';
import { toastService } from '$lib/stores/toast.store';
import DocumentChangeCards from './DocumentChangeCards.svelte';
import { buildDocumentChangeCards } from './document-change-cards';

const BEFORE = '# Launch plan\n\nIntro.\n\n## Scope\n\nOld scope.\n';
const AFTER = BEFORE.replace('Old scope.', 'New scope.\nMore scope.');

function card(overrides: { revertPatch?: null } = {}) {
	const summary = summarizeDocumentChange({
		project_id: 'project-1',
		document_id: 'document-1',
		title: 'Launch plan',
		before: BEFORE,
		after: AFTER
	})!;
	const receipt = overrides.revertPatch === null ? { ...summary, revert_patch: null } : summary;
	return buildDocumentChangeCards([receipt])[0]!;
}

function respond(status: number, body: unknown) {
	return vi.fn(
		async () =>
			new Response(JSON.stringify(body), {
				status,
				headers: { 'Content-Type': 'application/json' }
			})
	);
}

describe('DocumentChangeCards', () => {
	beforeEach(() => {
		toastService.clear();
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		toastService.clear();
	});

	it('shows the title and +X −Y stats, and expands the diff inline', async () => {
		render(DocumentChangeCards, { changes: [card()] });

		expect(screen.getByText('Launch plan')).toBeInTheDocument();
		expect(screen.getByText('+2')).toBeInTheDocument();
		expect(screen.getByText('−1')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /Open document/ })).toHaveAttribute(
			'href',
			'/projects/project-1?doc=document-1'
		);

		const toggle = screen.getByRole('button', { name: /Launch plan/, expanded: false });
		expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await fireEvent.click(toggle);

		expect(toggle).toHaveAttribute('aria-expanded', 'true');
		const diff = document.getElementById(toggle.getAttribute('aria-controls')!);
		// Paired lines split into word-level spans, so match on the region's text.
		expect(diff).toHaveTextContent('Old scope.');
		expect(diff).toHaveTextContent('New scope.');
		expect(diff).toHaveTextContent('More scope.');
	});

	it('undoes in one click, shows "Undone", confirms with a toast, and reports it', async () => {
		const fetchMock = respond(200, {
			success: true,
			data: { document: { id: 'document-1', content: BEFORE }, already_undone: false }
		});
		vi.stubGlobal('fetch', fetchMock);
		const toastSpy = vi.spyOn(toastService, 'success');
		const onUndone = vi.fn();
		const change = card();
		render(DocumentChangeCards, { changes: [change], onUndone });

		await fireEvent.click(screen.getByRole('button', { name: 'Undo the edit to Launch plan' }));

		await waitFor(() => expect(onUndone).toHaveBeenCalledTimes(1));
		expect(onUndone).toHaveBeenCalledWith(change, { id: 'document-1', content: BEFORE });
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/onto/documents/document-1/revert-change',
			expect.objectContaining({ method: 'POST' })
		);
		expect(screen.getByRole('status')).toHaveTextContent('Undone');
		expect(screen.queryByRole('button', { name: /Undo the edit/ })).toBeNull();
		expect(toastSpy).toHaveBeenCalledWith('Undid the edit to “Launch plan”');
	});

	it('explains a conflict inline and offers version history instead of Undo', async () => {
		vi.stubGlobal(
			'fetch',
			respond(409, { success: false, error: 'changed', code: 'BASE_TEXT_CHANGED' })
		);
		const onUndone = vi.fn();
		render(DocumentChangeCards, { changes: [card()], onUndone });

		await fireEvent.click(screen.getByRole('button', { name: 'Undo the edit to Launch plan' }));

		const alert = await screen.findByRole('alert');
		expect(alert).toHaveTextContent(/changed since/);
		expect(screen.queryByRole('button', { name: /Undo the edit/ })).toBeNull();
		expect(screen.getByRole('link', { name: /Open version history/ })).toHaveAttribute(
			'href',
			'/projects/project-1?entity=document&entity_id=document-1'
		);
		expect(onUndone).not.toHaveBeenCalled();
	});

	it('offers only version history when the change was too large to carry Undo', () => {
		render(DocumentChangeCards, { changes: [card({ revertPatch: null })] });

		expect(screen.queryByRole('button', { name: /Undo the edit/ })).toBeNull();
		expect(screen.getByText(/too large for one-click Undo/)).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /Open version history/ })).toBeInTheDocument();
	});

	it('renders a card already undone in this session without an Undo button', () => {
		render(DocumentChangeCards, { changes: [{ ...card(), undone: true }] });

		expect(screen.getByRole('status')).toHaveTextContent('Undone');
		expect(screen.queryByRole('button', { name: /Undo the edit/ })).toBeNull();
	});
});
