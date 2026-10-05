// apps/web/src/routes/api/onto/tables/[id]/export.csv/+server.ts
/**
 * GET /api/onto/tables/[id]/export.csv — the table as a CSV download.
 *
 * Raw protocol response (not ApiResponse). `tableToCsv` neutralizes formula
 * injection; a UTF-8 BOM keeps Excel from mangling non-ASCII text.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { logOntologyApiError } from '../../../shared/error-logging';
import { requireTableAccess, tableErrorResponse } from '$lib/server/tables/table-api';
import { csvContentDisposition } from '$lib/server/tables/table-export';
import { tableToCsv } from '@buildos/shared-agent-ops/tables';

const UTF8_BOM = '\uFEFF';

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const access = await requireTableAccess({
			locals,
			tableId: params.id,
			requiredAccess: 'read',
			method: 'GET',
			endpoint: `/api/onto/tables/${params.id}/export.csv`
		});
		if (!access.ok) return access.response;

		const { table } = access;
		const csv = tableToCsv(table.schema, table.rows);
		return new Response(csv.startsWith(UTF8_BOM) ? csv : `${UTF8_BOM}${csv}`, {
			status: 200,
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': csvContentDisposition(table.document.title),
				'Cache-Control': 'private, no-store',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	} catch (error) {
		const mapped = tableErrorResponse(error);
		if (mapped) return mapped;
		console.error('[Tables API] Unexpected export error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/tables/${params.id}/export.csv`,
			method: 'GET',
			entityType: 'document',
			entityId: params.id,
			operation: 'table_export_csv'
		});
		return ApiResponse.internalError(error, 'Failed to export table');
	}
};
