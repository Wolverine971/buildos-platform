// packages/api-client/src/endpoints/tables.ts
import type { BuildOsHttp, RequestOptions } from '../client';
import type { TableRevertChangeRequest, TableRevertChangeResponse } from '../types';

const encode = encodeURIComponent;

export function createTableEndpoints(http: BuildOsHttp) {
	return {
		/**
		 * POST /api/onto/tables/[id]/revert-change: one-click Undo of an agent table write.
		 * Send one receipt, or every receipt of a card (the server folds them newest first so
		 * "add a column, then fill it" reverts as a unit). 409 means the table moved on since
		 * (`error.code` is one of TABLE_UNDO_CONFLICT_CODES).
		 */
		revertChange: (tableId: string, body: TableRevertChangeRequest, options?: RequestOptions) =>
			http.request<TableRevertChangeResponse>(
				`/api/onto/tables/${encode(tableId)}/revert-change`,
				{ method: 'POST', body, ...options }
			)
	};
}

export type TableEndpoints = ReturnType<typeof createTableEndpoints>;
