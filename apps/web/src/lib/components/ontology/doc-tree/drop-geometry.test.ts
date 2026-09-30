// apps/web/src/lib/components/ontology/doc-tree/drop-geometry.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildDropZone,
	detectZoneType,
	effectiveDropPosition,
	validateDrop,
	type DropTreeAccess
} from './drop-geometry';

const tree: DropTreeAccess = {
	getParentId: () => 'parent',
	getNodeIndex: (id) => (id === 'source' ? 1 : 3),
	getDescendantIds: () => new Set(['child'])
};

describe('shared drop geometry', () => {
	it('preserves the old 30/70 split, including exact boundaries and outside coordinates', () => {
		for (const height of [0, 24, 44, 101]) {
			for (const y of [-1, 0, height * 0.3, height * 0.5, height * 0.7, height, height + 1]) {
				const legacy = y < height * 0.3 ? 'before' : y > height * 0.7 ? 'after' : 'inside';
				expect(detectZoneType(y, height)).toBe(legacy);
			}
		}
	});
	it('uses sibling indices before/after and appends inside', () => {
		const node = { id: 'target', children: ['a', 'b'] };
		expect(buildDropZone('before', node, tree)).toMatchObject({
			parentId: 'parent',
			position: 3
		});
		expect(buildDropZone('after', node, tree)).toMatchObject({
			parentId: 'parent',
			position: 4
		});
		expect(buildDropZone('inside', node, tree)).toMatchObject({
			parentId: 'target',
			position: 2
		});
	});
	it('keeps the legacy same-parent adjustment and no-op checks', () => {
		for (let index = 0; index < 10; index++)
			for (let drop = 0; drop < 11; drop++) {
				const old = index < drop ? drop - 1 : drop;
				expect(effectiveDropPosition(drop, true, index)).toBe(old);
				expect(effectiveDropPosition(drop, false, index)).toBe(drop);
				expect(
					validateDrop(
						'source',
						{ type: 'before', parentId: 'parent', targetId: 'target', position: drop },
						{ ...tree, getNodeIndex: () => index }
					).valid
				).toBe(old !== index);
			}
	});
	it('rejects self, descendants, pinned nodes, and ancestors containing pinned nodes', () => {
		const drop = {
			type: 'inside' as const,
			targetId: 'target',
			parentId: 'other',
			position: 0
		};
		expect(validateDrop('source', { ...drop, targetId: 'source' }, tree).valid).toBe(false);
		expect(validateDrop('source', { ...drop, parentId: 'child' }, tree).valid).toBe(false);
		expect(
			validateDrop('source', drop, { ...tree, isPinned: (id) => id === 'source' }).valid
		).toBe(false);
		expect(
			validateDrop('source', drop, { ...tree, isPinned: (id) => id === 'child' }).valid
		).toBe(false);
		expect(validateDrop('source', drop, tree).valid).toBe(true);
	});
});
