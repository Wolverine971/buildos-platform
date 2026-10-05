// apps/web/src/lib/server/tables/doc-tree-table-counts.ts
//
// The doc tree's metadata path (get_project_document_tree_metadata) returns no
// props, so table nodes would lose `props.table.row_count`. When the payload has
// table documents without props, read just their row counts (one small query
// pulling a single JSON path, never the rows) and attach them as
// `props.table.row_count`. Projects without tables pay nothing.
import { isTableTypeKey } from '@buildos/shared-agent-ops/tables';

type Supabase = App.Locals['supabase'];
type TreeDocument = { id: string; type_key?: string | null; props?: unknown };

function hasTableRowCount(props: unknown): boolean {
	if (!props || typeof props !== 'object') return false;
	const table = (props as Record<string, unknown>).table;
	return Boolean(table && typeof table === 'object' && 'row_count' in table);
}

export async function attachTableRowCounts(
	supabase: Supabase,
	projectId: string,
	groups: Array<Record<string, TreeDocument> | TreeDocument[] | null | undefined>
): Promise<void> {
	const missing = new Map<string, TreeDocument[]>();
	for (const group of groups) {
		if (!group) continue;
		const docs = Array.isArray(group) ? group : Object.values(group);
		for (const doc of docs) {
			if (!doc || !isTableTypeKey(doc.type_key) || hasTableRowCount(doc.props)) continue;
			const list = missing.get(doc.id) ?? [];
			list.push(doc);
			missing.set(doc.id, list);
		}
	}
	if (missing.size === 0) return;

	const { data, error } = await supabase
		.from('onto_documents')
		.select('id, row_count:props->table->row_count')
		.eq('project_id', projectId)
		.in('id', [...missing.keys()]);
	if (error || !Array.isArray(data)) return; // counts are decoration; never fail the tree

	for (const entry of data as unknown as Array<{ id: string; row_count: unknown }>) {
		const count = Number(entry.row_count);
		if (!Number.isFinite(count)) continue;
		for (const doc of missing.get(entry.id) ?? []) {
			const props =
				doc.props && typeof doc.props === 'object'
					? (doc.props as Record<string, unknown>)
					: {};
			const table =
				props.table && typeof props.table === 'object'
					? (props.table as Record<string, unknown>)
					: {};
			doc.props = { ...props, table: { ...table, row_count: count } };
		}
	}
}
