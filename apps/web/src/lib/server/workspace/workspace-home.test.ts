// apps/web/src/lib/server/workspace/workspace-home.test.ts
import { describe, expect, it } from 'vitest';
import { ABOUT_YOU_TYPE_KEY } from '@buildos/shared-agent-ops/ontology/about-you';
import { loadWorkspaceHome } from './workspace.service';

const WORKSPACE_ID = 'workspace-1';

type Filter = [string, string, unknown];

/** Each read answers by its own filters, so the About you read and the loose-doc read
 * can be told apart; every read's filters are kept for the assertions. */
function sessionWith(options: { aboutYou: boolean }) {
	const reads: { table: string; filters: Filter[] }[] = [];
	const from = (table: string) => {
		const filters: Filter[] = [];
		reads.push({ table, filters });
		const query: Record<string, unknown> = {};
		for (const op of ['eq', 'neq', 'is']) {
			query[op] = (column: string, value: unknown) => {
				filters.push([op, column, value]);
				return query;
			};
		}
		for (const op of ['select', 'order', 'limit']) query[op] = () => query;
		const result = () => {
			if (table === 'onto_projects') return { data: { doc_structure: null }, error: null };
			if (table !== 'onto_documents') return { data: [], error: null, count: 0 };
			const asksAboutYou = filters.some(
				([op, column, value]) =>
					op === 'eq' && column === 'type_key' && value === ABOUT_YOU_TYPE_KEY
			);
			if (asksAboutYou) {
				return {
					data: options.aboutYou
						? [{ id: 'about-1', updated_at: '2026-10-22T12:00:00.000Z' }]
						: [],
					error: null
				};
			}
			return {
				data: [
					{
						id: 'note-1',
						title: 'Pricing thought',
						type_key: 'document.note',
						content: 'Pricing thought\nCharge per seat?',
						description: null,
						created_at: '2026-10-21T12:00:00.000Z',
						updated_at: '2026-10-21T12:00:00.000Z'
					}
				],
				error: null,
				count: 1
			};
		};
		query.maybeSingle = () => Promise.resolve(result());
		query.then = (resolve: (value: unknown) => unknown) => resolve(result());
		return query;
	};
	return { session: { from } as never, reads };
}

describe('loadWorkspaceHome', () => {
	it('returns the About you note on its own, never as a loose item or in the counts', async () => {
		const { session, reads } = sessionWith({ aboutYou: true });

		const home = await loadWorkspaceHome(session, WORKSPACE_ID);

		expect(home.aboutYou).toEqual({ id: 'about-1', updated_at: '2026-10-22T12:00:00.000Z' });
		expect(home.items.map((item) => item.id)).toEqual(['note-1']);
		expect(home.totals).toEqual({ notes: 1, docs: 0, tasks: 0 });
		const looseDocRead = reads.find(
			(read) =>
				read.table === 'onto_documents' &&
				!read.filters.some(([op, column]) => op === 'eq' && column === 'type_key')
		);
		expect(looseDocRead?.filters).toContainEqual(['neq', 'type_key', ABOUT_YOU_TYPE_KEY]);
	});

	it('has no About you row until BuildOS writes the note', async () => {
		const { session } = sessionWith({ aboutYou: false });

		const home = await loadWorkspaceHome(session, WORKSPACE_ID);

		expect(home.aboutYou).toBeNull();
		expect(home.items).toHaveLength(1);
	});
});
