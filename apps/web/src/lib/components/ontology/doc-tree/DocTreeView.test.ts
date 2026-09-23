// apps/web/src/lib/components/ontology/doc-tree/DocTreeView.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { DocStructure, OntoDocument } from '$lib/types/onto-api';
import DocTreeView from './DocTreeView.svelte';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

function document(id: string, title: string, stateKey = 'active'): OntoDocument {
	return {
		id,
		project_id: PROJECT_ID,
		type_key: 'document',
		title,
		state_key: stateKey,
		content: null,
		props: {},
		created_by: '22222222-2222-4222-8222-222222222222',
		created_at: '2026-08-01T12:00:00.000Z',
		updated_at: '2026-08-14T12:00:00.000Z',
		deleted_at: null
	};
}

function renderTree({
	structure,
	documents,
	archived = [],
	maxInitialDepth = 1
}: {
	structure: DocStructure;
	documents: Record<string, OntoDocument>;
	archived?: OntoDocument[];
	maxInitialDepth?: number;
}) {
	return render(DocTreeView, {
		props: {
			projectId: PROJECT_ID,
			canEdit: false,
			onOpenDocument: vi.fn(),
			onCreateDocument: vi.fn(),
			initialStructure: structure,
			initialDocuments: documents,
			initialArchived: archived,
			maxInitialDepth,
			pollInterval: 0,
			enableDragDrop: false
		}
	});
}

describe('DocTreeView progressive disclosure', () => {
	beforeEach(() => localStorage.clear());

	afterEach(() => {
		cleanup();
		localStorage.clear();
	});

	it('applies parent document snapshots without remounting or losing expanded folders', async () => {
		const structure: DocStructure = {
			version: 1,
			root: [{ id: 'folder', order: 0, children: [{ id: 'child', order: 0 }] }]
		};
		const { rerender } = renderTree({
			structure,
			documents: {
				folder: document('folder', 'Folder'),
				child: document('child', 'Old title')
			}
		});
		await waitFor(() => expect(screen.getByText('Old title')).toBeInTheDocument());
		await rerender({
			initialStructure: {
				version: 2,
				root: [{ id: 'folder', order: 0, children: [{ id: 'new', order: 0 }] }]
			},
			initialDocuments: {
				folder: document('folder', 'Folder'),
				new: document('new', 'Created in chat')
			}
		});
		await waitFor(() => expect(screen.getByText('Created in chat')).toBeInTheDocument());
		expect(screen.queryByText('Old title')).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Collapse Folder' })).toBeInTheDocument();
		await rerender({
			initialDocuments: {
				folder: document('folder', 'Folder'),
				new: document('new', 'Renamed in chat')
			}
		});
		await waitFor(() => expect(screen.getByText('Renamed in chat')).toBeInTheDocument());
	});

	it('opens only the first folder level by default', async () => {
		const structure: DocStructure = {
			version: 1,
			root: [
				{
					id: 'research',
					order: 0,
					children: [
						{
							id: 'interviews',
							order: 0,
							children: [{ id: 'customer-notes', order: 0 }]
						}
					]
				}
			]
		};
		const documents = {
			research: document('research', 'Research'),
			interviews: document('interviews', 'Interviews'),
			'customer-notes': document('customer-notes', 'Customer notes')
		};

		renderTree({ structure, documents });

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Collapse Research' })).toBeInTheDocument();
		});
		expect(screen.getByRole('button', { name: 'Expand Interviews' })).toBeInTheDocument();
		expect(screen.queryByText('Customer notes')).not.toBeInTheDocument();
	});

	it('scopes cut/paste shortcuts to the tree and leaves text fields alone', async () => {
		render(DocTreeView, {
			props: {
				projectId: PROJECT_ID,
				canEdit: true,
				onOpenDocument: vi.fn(),
				onCreateDocument: vi.fn(),
				initialStructure: { version: 1, root: [{ id: 'brief', order: 0 }] },
				initialDocuments: { brief: document('brief', 'Brief') },
				initialArchived: [],
				pollInterval: 0,
				enableDragDrop: true
			}
		});
		const nodeButton = (await screen.findByText('Brief')).closest('button')!;
		const outsideInput = window.document.createElement('input');
		window.document.body.appendChild(outsideInput);
		try {
			// Cut outside the tree keeps native behavior (not prevented).
			expect(await fireEvent.keyDown(outsideInput, { key: 'x', ctrlKey: true })).toBe(true);

			await fireEvent.focus(nodeButton);
			expect(await fireEvent.keyDown(nodeButton, { key: 'x', ctrlKey: true })).toBe(false);

			// With a node cut, paste/undo in an outside text field still belongs to it.
			expect(await fireEvent.keyDown(outsideInput, { key: 'v', ctrlKey: true })).toBe(true);
			expect(await fireEvent.keyDown(outsideInput, { key: 'Escape' })).toBe(true);
		} finally {
			outsideInput.remove();
		}
	});

	it('keeps archived documents recoverable but collapsed by default', async () => {
		const archived = document('archived-plan', 'Archived launch plan', 'archived');
		renderTree({
			structure: { version: 1, root: [] },
			documents: {},
			archived: [archived]
		});

		const toggle = screen.getByRole('button', { name: 'Archived documents (1)' });
		expect(toggle).toHaveAttribute('aria-expanded', 'false');
		expect(screen.queryByText('Archived launch plan')).not.toBeInTheDocument();

		await fireEvent.click(toggle);
		expect(toggle).toHaveAttribute('aria-expanded', 'true');
		expect(screen.getByText('Archived launch plan')).toBeInTheDocument();
	});
});
