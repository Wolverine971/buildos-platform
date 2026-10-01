// apps/web/src/lib/components/organize/organize-api.test.ts
import { describe, expect, it } from 'vitest';
import { historySchema, movedItemsLine } from './organize-api';

describe('movedItemsLine', () => {
	it('names what moved, with child docs and the rest counted', () => {
		expect(movedItemsLine([{ kind: 'document', title: 'Research', child_count: 1 }], 1)).toBe(
			'Research + 1 child doc'
		);
		expect(
			movedItemsLine(
				[
					{ kind: 'document', title: 'Research', child_count: 3 },
					{ kind: 'task', title: 'Call Redline', child_count: 0 },
					{ kind: 'document', title: 'Offer', child_count: 0 }
				],
				5
			)
		).toBe('Research + 3 child docs · Call Redline · Offer · +2 more');
	});

	it('shows nothing when no moved item is readable', () => {
		expect(movedItemsLine([], 4)).toBeNull();
		expect(movedItemsLine(undefined, undefined)).toBeNull();
	});

	it('accepts history from servers that do not name items yet', () => {
		const parsed = historySchema.safeParse({ batches: [] });
		expect(parsed.success).toBe(true);
	});
});
