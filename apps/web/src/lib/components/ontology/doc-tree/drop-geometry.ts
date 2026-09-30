// apps/web/src/lib/components/ontology/doc-tree/drop-geometry.ts
// Pure drop rules shared by the document tree and the Organize planner.
export type DropZoneType = 'before' | 'after' | 'inside';

export interface DropZone {
	type: DropZoneType;
	targetId: string;
	parentId: string | null;
	position: number;
}

export interface DropTreeAccess {
	getParentId: (id: string) => string | null;
	getNodeIndex: (id: string) => number;
	getDescendantIds: (id: string) => Set<string>;
	isPinned?: (id: string) => boolean;
}

export function detectZoneType(relativeY: number, nodeHeight: number): DropZoneType {
	if (relativeY < nodeHeight * 0.3) return 'before';
	if (relativeY > nodeHeight * 0.7) return 'after';
	return 'inside';
}

export function buildDropZone(
	type: DropZoneType,
	target: { id: string; children?: unknown[] },
	tree: Pick<DropTreeAccess, 'getParentId' | 'getNodeIndex'>
): DropZone {
	return {
		type,
		targetId: target.id,
		parentId: type === 'inside' ? target.id : tree.getParentId(target.id),
		position:
			type === 'inside'
				? (target.children?.length ?? 0)
				: tree.getNodeIndex(target.id) + (type === 'after' ? 1 : 0)
	};
}

/** A drop position is measured before removing the dragged row. */
export function effectiveDropPosition(
	position: number,
	sameParent: boolean,
	originalIndex: number
): number {
	return sameParent && originalIndex < position ? position - 1 : position;
}

export function containsPinnedNode(id: string, tree: DropTreeAccess): boolean {
	if (!tree.isPinned) return false;
	return tree.isPinned(id) || [...tree.getDescendantIds(id)].some(tree.isPinned);
}

export function validateDrop(
	draggedId: string,
	drop: DropZone,
	tree: DropTreeAccess
): { valid: boolean; reason?: string } {
	if (containsPinnedNode(draggedId, tree)) {
		return { valid: false, reason: 'This folder is pinned to the project' };
	}
	if (drop.parentId === draggedId || drop.targetId === draggedId) {
		return { valid: false, reason: 'Cannot drop onto itself' };
	}
	if (drop.parentId && tree.getDescendantIds(draggedId).has(drop.parentId)) {
		return { valid: false, reason: 'Cannot move into its own contents' };
	}
	if (drop.parentId === tree.getParentId(draggedId)) {
		const index = tree.getNodeIndex(draggedId);
		if (effectiveDropPosition(drop.position, true, index) === index) {
			return { valid: false, reason: 'Already in this position' };
		}
	}
	return { valid: true };
}
