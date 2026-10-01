// apps/web/src/lib/components/ontology/doc-tree/useDragDrop.test.ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { EnrichedDocTreeNode } from '$lib/types/onto-api';
import { createDragDropState } from './useDragDrop.svelte';

function node(id: string, overrides: Partial<EnrichedDocTreeNode> = {}): EnrichedDocTreeNode {
	return {
		id,
		type: 'doc',
		order: 0,
		depth: 0,
		path: [id],
		title: id,
		description: null,
		state_key: 'draft',
		type_key: 'document.default',
		has_content: false,
		created_at: '2026-09-30T00:00:00.000Z',
		updated_at: '2026-09-30T00:00:00.000Z',
		is_public: false,
		public_status: 'not_public',
		public_slug: null,
		public_url_path: null,
		...overrides
	};
}

describe('drop inside an explicit target', () => {
	function setup() {
		const nodes = [node('shared'), node('brief')];
		const onMove = vi.fn(async () => ({ success: true }));
		const drag = createDragDropState({
			onMove,
			getNodeElement: () => null,
			getNodeById: (id) => nodes.find((n) => n.id === id) ?? null,
			getParentId: () => null,
			getNodeIndex: (id) => nodes.findIndex((n) => n.id === id),
			getDescendantIds: () => new Set<string>(),
			isPinned: (id) => id === 'shared'
		});
		return { drag, nodes, onMove };
	}

	it('drops into an empty folder at once, without the hover-to-nest wait', async () => {
		const { drag, nodes, onMove } = setup();
		drag.startDrag(nodes[1]!, document.createElement('div'), 0, 0);
		drag.setDropInside(nodes[0]!);
		expect(drag.state.dropZone).toMatchObject({
			type: 'inside',
			targetId: 'shared',
			parentId: 'shared',
			position: 0
		});
		expect(drag.state.isValidDrop).toBe(true);
		await drag.endDrag();
		expect(onMove).toHaveBeenCalledWith('brief', 'shared', 0);
	});

	it('does nothing outside a drag and still refuses invalid drops', () => {
		const { drag, nodes } = setup();
		drag.setDropInside(nodes[0]!);
		expect(drag.state.dropZone).toBeNull();
		drag.startDrag(nodes[1]!, document.createElement('div'), 0, 0);
		drag.setDropInside(nodes[1]!);
		expect(drag.state.isValidDrop).toBe(false);
		drag.cancelDrag();
	});
});
