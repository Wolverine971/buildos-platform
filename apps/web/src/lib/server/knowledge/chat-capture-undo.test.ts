// apps/web/src/lib/server/knowledge/chat-capture-undo.test.ts
import { describe, expect, it } from 'vitest';
import { undoChatKnowledgeCapture, type ChatKnowledgeUndoReceipt } from './chat-capture-undo';

type Row = Record<string, any>;

/** Just enough of the Supabase query builder for the undo's filtered updates, reads and deletes. */
function fakeAdmin(tables: Record<string, Row[]>, failOn?: { table: string; op: string }) {
	return {
		from(table: string) {
			const filters: Array<(row: Row) => boolean> = [];
			let op: 'select' | 'update' | 'delete' = 'select';
			let patch: Row = {};
			let limit = Infinity;
			const query: any = {
				select: () => query,
				update: (next: Row) => ((op = 'update'), (patch = next), query),
				delete: () => ((op = 'delete'), query),
				eq: (col: string, value: unknown) => (filters.push((r) => r[col] === value), query),
				neq: (col: string, value: unknown) => (
					filters.push((r) => r[col] !== value),
					query
				),
				in: (col: string, values: unknown[]) => (
					filters.push((r) => values.includes(r[col])),
					query
				),
				is: (col: string, value: unknown) => (filters.push((r) => r[col] === value), query),
				limit: (n: number) => ((limit = n), query),
				then(ok: (v: { data: Row[] | null; error: unknown }) => unknown) {
					if (failOn && failOn.table === table && failOn.op === op)
						return Promise.resolve({ data: null, error: new Error('boom') }).then(ok);
					const rows = (tables[table] ??= []);
					const hit = rows.filter((r) => filters.every((f) => f(r)));
					if (op === 'update') hit.forEach((r) => Object.assign(r, patch));
					if (op === 'delete') tables[table] = rows.filter((r) => !hit.includes(r));
					return Promise.resolve({ data: hit.slice(0, limit), error: null }).then(ok);
				}
			};
			return query;
		}
	};
}

const USER = 'u1';
const FACT = '11111111-1111-4111-8111-111111111111';
const SOURCE = '22222222-2222-4222-8222-222222222222';

function receipt(): ChatKnowledgeUndoReceipt {
	return {
		fact_ids: [FACT],
		restore: [],
		summaries: [],
		link_ids: [],
		source_ids: [SOURCE],
		created_entity_ids: []
	};
}

describe('undoChatKnowledgeCapture', () => {
	it('settles as undone when a retry finds the facts already retracted by a failed attempt', async () => {
		const tables: Record<string, Row[]> = {
			knowledge_facts: [{ id: FACT, owner_user_id: USER, status: 'active' }],
			knowledge_sources: [{ id: SOURCE, owner_user_id: USER }]
		};
		// First attempt: facts retracted, then deleting the sources fails.
		await expect(
			undoChatKnowledgeCapture({
				admin: fakeAdmin(tables, { table: 'knowledge_sources', op: 'delete' }),
				userId: USER,
				receipt: receipt()
			})
		).rejects.toThrow('boom');
		expect(tables.knowledge_facts![0]!.status).toBe('retracted');

		// The retry finishes the job and reports the knowledge as undone.
		const outcome = await undoChatKnowledgeCapture({
			admin: fakeAdmin(tables),
			userId: USER,
			receipt: receipt()
		});
		expect(outcome).toBe('retracted');
		expect(tables.knowledge_sources).toEqual([]);
	});

	it("reports nothing to undo for facts that aren't the user's", async () => {
		const tables: Record<string, Row[]> = {
			knowledge_facts: [{ id: FACT, owner_user_id: 'someone-else', status: 'active' }]
		};
		const outcome = await undoChatKnowledgeCapture({
			admin: fakeAdmin(tables),
			userId: USER,
			receipt: receipt()
		});
		expect(outcome).toBe('none');
		expect(tables.knowledge_facts![0]!.status).toBe('active');
	});
});
