// apps/web/src/lib/components/table-surfaces/make-live-table.ts
//
// "Make live table": lift one markdown table out of a document into a real
// table (a child document of that document) and return the document body with
// the markdown block replaced by an embed. The caller saves the new body with
// its own save path (reader autosave, modal save, page save).
import { findMarkdownTables, type LoadedTable } from '@buildos/shared-agent-ops/tables';
import { createTable } from '$lib/components/tables/table-client';
import { liftedTableTitle, matchMarkdownTable, replaceRangeWithEmbed } from './table-surface-utils';

export type MakeLiveTableRequest = {
	projectId: string;
	documentId: string;
	documentTitle: string;
	content: string;
	/** Ordinal of the rendered <table> the user clicked. */
	renderedIndex: number;
	/** Header cells of the rendered <table>, to verify the match. */
	renderedHeaders: string[];
};

export type MakeLiveTableResult = { table: LoadedTable; content: string; warnings: string[] };

export class MakeLiveTableError extends Error {}

export async function makeLiveTable(request: MakeLiveTableRequest): Promise<MakeLiveTableResult> {
	const found = findMarkdownTables(request.content);
	const index = matchMarkdownTable(found, request.renderedIndex, request.renderedHeaders);
	const block = index >= 0 ? found[index] : undefined;
	if (!block) {
		throw new MakeLiveTableError(
			"Couldn't find that table in the document text. Edit the document and try again."
		);
	}

	const { table, warnings } = await createTable({
		project_id: request.projectId,
		title: liftedTableTitle(request.documentTitle, index, found.length),
		markdown: request.content.slice(block.start, block.end),
		parent_id: request.documentId,
		source: {
			kind: 'markdown',
			origin_entity: { kind: 'document', id: request.documentId }
		}
	});

	return {
		table,
		content: replaceRangeWithEmbed(request.content, block, table.document.id),
		warnings
	};
}
