// apps/web/src/lib/components/ontology/doc-tree/DocTreeNode.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { EnrichedDocTreeNode } from '$lib/types/onto-api';
import DocTreeNode from './DocTreeNode.svelte';

function createNode(overrides: Partial<EnrichedDocTreeNode> = {}): EnrichedDocTreeNode {
	return {
		id: 'document-1',
		type: 'doc',
		order: 0,
		depth: 0,
		path: [],
		title: 'Project plan',
		description: null,
		state_key: 'active',
		type_key: 'document',
		has_content: true,
		created_at: '2026-07-19T12:00:00.000Z',
		updated_at: '2026-07-19T12:00:00.000Z',
		is_public: false,
		public_slug: null,
		public_url_path: null,
		...overrides
	};
}

function renderNode(node: EnrichedDocTreeNode) {
	const onToggleExpand = vi.fn();
	const onOpenDocument = vi.fn();
	const onContextMenu = vi.fn();

	const result = render(DocTreeNode, {
		props: {
			node,
			expandedIds: new Set<string>(),
			onToggleExpand,
			onOpenDocument,
			onContextMenu,
			canDrag: false
		}
	});

	return { ...result, onToggleExpand, onOpenDocument, onContextMenu };
}

describe('DocTreeNode control quality', () => {
	afterEach(() => cleanup());

	it('opens the action menu from the standard keyboard shortcut', async () => {
		const node = createNode();
		const { onContextMenu } = renderNode(node);

		await fireEvent.keyDown(screen.getByRole('button', { name: /Project plan/ }), {
			key: 'F10',
			shiftKey: true
		});

		expect(onContextMenu).toHaveBeenCalledTimes(1);
		expect(onContextMenu.mock.calls[0]?.[1]).toEqual(node);
	});

	it('keeps folder expansion separate from document opening', async () => {
		const { container, onToggleExpand, onOpenDocument } = renderNode(
			createNode({
				id: 'folder-1',
				type: 'folder',
				title: 'Research',
				has_content: false,
				children: []
			})
		);

		expect(container.querySelector('button button')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Expand Research' }));

		expect(onToggleExpand).toHaveBeenCalledWith('folder-1');
		expect(onOpenDocument).not.toHaveBeenCalled();
	});
});
