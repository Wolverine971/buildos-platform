// apps/web/src/lib/components/ontology/doc-tree/DocTreeContextMenu.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { EnrichedDocTreeNode } from '$lib/types/onto-api';
import DocTreeContextMenu from './DocTreeContextMenu.svelte';

const publicDocument: EnrichedDocTreeNode = {
	id: 'document-1',
	type: 'doc',
	order: 0,
	title: 'Public plan',
	description: null,
	state_key: 'active',
	type_key: 'document',
	has_content: true,
	created_at: '2026-07-18T12:00:00.000Z',
	updated_at: '2026-07-18T12:00:00.000Z',
	is_public: true,
	public_slug: 'public-plan',
	public_url_path: '/p/public-plan'
};

function renderMenu(canEdit: boolean) {
	const onAction = vi.fn();
	const onClose = vi.fn();
	render(DocTreeContextMenu, {
		props: {
			position: { x: 0, y: 0 },
			node: publicDocument,
			canEdit,
			onAction,
			onClose
		}
	});
	return { onAction, onClose };
}

describe('DocTreeContextMenu permissions', () => {
	afterEach(() => cleanup());

	it('keeps read actions while hiding mutation actions for viewers', () => {
		renderMenu(false);

		expect(screen.getByRole('menuitem', { name: 'Open' })).toBeInTheDocument();
		expect(screen.getByRole('menuitem', { name: 'Copy public link' })).toBeInTheDocument();
		expect(screen.getByRole('menuitem', { name: 'Open public page' })).toBeInTheDocument();
		expect(screen.queryByRole('menuitem', { name: 'Create child' })).not.toBeInTheDocument();
		expect(screen.queryByRole('menuitem', { name: 'Move to...' })).not.toBeInTheDocument();
		expect(screen.queryByRole('menuitem', { name: 'Archive' })).not.toBeInTheDocument();
		expect(
			screen.queryByRole('menuitem', { name: 'Manage public page...' })
		).not.toBeInTheDocument();
	});

	it('shows the full document action set to editors', () => {
		renderMenu(true);

		expect(screen.getByRole('menuitem', { name: 'Create child' })).toBeInTheDocument();
		expect(screen.getByRole('menuitem', { name: 'Move to...' })).toBeInTheDocument();
		expect(screen.getByRole('menuitem', { name: 'Archive' })).toBeInTheDocument();
		expect(screen.getByRole('menuitem', { name: 'Manage public page...' })).toBeInTheDocument();
	});

	it('focuses the first action and supports menu keyboard navigation', async () => {
		const { onClose } = renderMenu(true);
		const open = screen.getByRole('menuitem', { name: 'Open' });

		await waitFor(() => expect(open).toHaveFocus());

		await fireEvent.keyDown(open, { key: 'ArrowDown' });
		const createChild = screen.getByRole('menuitem', { name: 'Create child' });
		expect(createChild).toHaveFocus();

		await fireEvent.keyDown(createChild, { key: 'End' });
		const archive = screen.getByRole('menuitem', { name: 'Archive' });
		expect(archive).toHaveFocus();

		await fireEvent.keyDown(archive, { key: 'Home' });
		expect(open).toHaveFocus();

		await fireEvent.keyDown(open, { key: 'Escape' });
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
