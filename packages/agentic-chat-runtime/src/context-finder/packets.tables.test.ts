// packages/agentic-chat-runtime/src/context-finder/packets.tables.test.ts
//
// BuildOS Tables (2026-10-04): a table document's context-finder packet carries
// its row count and column names (from props.table), not headings parsed from
// the generated row projection.
import { describe, expect, it } from 'vitest';
import { buildContextFinderEntities } from './packets';

describe('context-finder table packets', () => {
	it('describes a table by rows and columns, and a note by its headings', () => {
		const entities = buildContextFinderEntities({
			project: { id: 'p1', name: 'Job hunt' },
			documents: [
				{
					id: 't1',
					title: 'Job applications',
					description: 'Every application and where it stands',
					type_key: 'document.table',
					content: '| Company | Status |\n| --- | --- |\n| Stripe | Applied |',
					table: {
						row_count: 42,
						columns: [{ name: 'Company' }, { name: 'Status' }, { name: 'Salary' }]
					},
					updated_at: '2026-10-04T00:00:00Z'
				},
				{
					id: 'd1',
					title: 'Interview notes',
					type_key: 'document.note',
					content: '# Interview notes\n\n## Stripe\n\nGood call.',
					updated_at: '2026-10-03T00:00:00Z'
				}
			],
			tasks: [],
			goals: [],
			plans: [],
			milestones: [],
			risks: []
		});
		const table = entities.find((entity) => entity.id === 't1')!;
		expect(table.packet).toMatchObject({
			kind: 'document',
			title: 'Job applications',
			type: 'document.table',
			table: { rows: 42, columns: ['Company', 'Status', 'Salary'] }
		});
		expect(table.sections).toEqual([]);
		const note = entities.find((entity) => entity.id === 'd1')!;
		expect((note.packet as Record<string, unknown>).table).toBeUndefined();
	});
});
