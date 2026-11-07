// packages/shared-agent-ops/src/gateway/field-changes.test.ts
import { describe, expect, it } from 'vitest';
import { buildFieldChanges } from './field-changes';

describe('buildFieldChanges', () => {
	it('lists the shown fields that moved, before → after', () => {
		const before = {
			title: 'Sign lease',
			due_at: '2026-11-04T00:00:00+00:00',
			priority: 2,
			props: { a: 1 }
		};
		const after = {
			title: 'Sign lease',
			due_at: '2026-11-09T00:00:00+00:00',
			priority: 1,
			props: { a: 2 }
		};
		expect(buildFieldChanges(before, after)).toEqual([
			{ field: 'priority', before: 2, after: 1 },
			{
				field: 'due_at',
				before: '2026-11-04T00:00:00+00:00',
				after: '2026-11-09T00:00:00+00:00'
			}
		]);
	});

	it('treats a cleared value as null and clips long text', () => {
		const long = 'x'.repeat(400);
		const changes = buildFieldChanges(
			{ due_at: '2026-11-04T00:00:00+00:00', description: 'short' },
			{ due_at: null, description: long }
		);
		expect(changes[0]).toEqual({
			field: 'due_at',
			before: '2026-11-04T00:00:00+00:00',
			after: null
		});
		expect(changes[1]?.clipped).toBe(true);
		expect(String(changes[1]?.after).length).toBeLessThan(170);
	});

	it('returns nothing without both rows', () => {
		expect(buildFieldChanges(null, { title: 'a' })).toEqual([]);
	});
});
