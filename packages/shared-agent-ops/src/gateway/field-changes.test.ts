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

	it('shows the part of a long text that changed, never the same text on both sides', () => {
		const opening = 'The same opening sentence, repeated so the edit lands far in. '.repeat(5);
		const [change] = buildFieldChanges(
			{ description: `${opening}Ship on Friday.` },
			{ description: `${opening}Ship on Monday.` }
		);
		expect(change?.clipped).toBe(true);
		expect(change?.before).not.toBe(change?.after);
		expect(String(change?.before)).toMatch(/^….*Friday\.$/);
		expect(String(change?.after)).toMatch(/^….*Monday\.$/);
		expect(String(change?.after).length).toBeLessThan(170);
	});

	it('keeps the opening when a long text changed near its start', () => {
		const tail = ' and the rest of a long description'.repeat(8);
		const [change] = buildFieldChanges(
			{ description: `Draft${tail}` },
			{ description: `Final${tail}` }
		);
		expect(String(change?.before).startsWith('Draft')).toBe(true);
		expect(String(change?.after).startsWith('Final')).toBe(true);
	});

	it('reports body text, risk scoring, type and facets', () => {
		expect(
			buildFieldChanges(
				{
					goal: 'Launch',
					impact: 'low',
					probability: 0.2,
					type_key: 'risk.a',
					facet_stage: null
				},
				{
					goal: 'Launch in Q1',
					impact: 'high',
					probability: 0.6,
					type_key: 'risk.b',
					facet_stage: 'build'
				}
			).map((change) => change.field)
		).toEqual(['goal', 'impact', 'probability', 'type_key', 'facet_stage']);
	});

	it('compares a field only when both rows carry it', () => {
		// The row read before the write did not select the column: unknown, not "was empty".
		expect(buildFieldChanges({ name: 'A' }, { name: 'A', facet_scale: 'small' })).toEqual([]);
	});

	it('leaves out fields the caller reports another way', () => {
		expect(
			buildFieldChanges(
				{ title: 'Notes', content: 'old body' },
				{ title: 'Notes v2', content: 'new body' },
				{ skip: ['content'] }
			)
		).toEqual([{ field: 'title', before: 'Notes', after: 'Notes v2' }]);
	});
});
