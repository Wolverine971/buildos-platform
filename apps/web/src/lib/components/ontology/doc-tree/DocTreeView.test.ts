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
