// apps/web/src/lib/server/tables/doc-tree-table-counts.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@buildos/shared-agent-ops/tables', () => ({
	isTableTypeKey: (key: unknown) =>
		typeof key === 'string' && (key === 'document.table' || key.startsWith('document.table.'))
}));

import { attachTableRowCounts } from './doc-tree-table-counts';

function supabaseReturning(rows: Array<{ id: string; row_count: unknown }>) {
	const calls: Array<{ select: string; ids: string[] }> = [];
	const supabase = {
		from: vi.fn(() => {
			let select = '';
			const chain: any = {
				select: (columns: string) => {
					select = columns;
					return chain;
				},
				eq: () => chain,
				in: (_column: string, ids: string[]) => {
					calls.push({ select, ids });
					return Promise.resolve({ data: rows, error: null });
				}
			};
			return chain;
		})
	};
	return { supabase: supabase as any, calls };
}

describe('attachTableRowCounts', () => {
	it('reads only the row-count JSON path for table docs that lack props', async () => {
		const { supabase, calls } = supabaseReturning([{ id: 't1', row_count: 42 }]);
		const documents: Record<string, any> = {
			t1: { id: 't1', type_key: 'document.table' },
			d1: { id: 'd1', type_key: 'document.default' }
		};
		await attachTableRowCounts(supabase, 'p1', [documents, [], []]);

		expect(calls).toEqual([{ select: 'id, row_count:props->table->row_count', ids: ['t1'] }]);
		expect(documents.t1.props).toEqual({ table: { row_count: 42 } });
		expect(documents.d1.props).toBeUndefined();
	});

	it('skips the query when there are no tables or counts are already present', async () => {
		const { supabase } = supabaseReturning([]);
		await attachTableRowCounts(supabase, 'p1', [
			{
				a: { id: 'a', type_key: 'document.default' },
				b: { id: 'b', type_key: 'document.table', props: { table: { row_count: 3 } } }
			},
			[],
			null
		]);
		expect(supabase.from).not.toHaveBeenCalled();
	});
});
