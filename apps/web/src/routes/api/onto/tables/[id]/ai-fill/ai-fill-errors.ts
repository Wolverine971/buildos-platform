// apps/web/src/routes/api/onto/tables/[id]/ai-fill/ai-fill-errors.ts
// TableAiFillError → ApiResponse for the ai-fill endpoints. Expected outcomes (already
// filling, nothing to fill, not a question column) answer 4xx with `code`, so the grid can
// show the message as is; database and queue failures fall through to the route's 500.
import { ApiResponse } from '$lib/utils/api-response';
import type { TableAiFillErrorCode } from '@buildos/shared-agent-ops/tables';

const STATUS: Partial<Record<TableAiFillErrorCode, number>> = {
	TABLE_NOT_FOUND: 404,
	ROW_NOT_FOUND: 404,
	RUN_NOT_FOUND: 404,
	NOT_A_TABLE: 400,
	COLUMN_NOT_FOUND: 400,
	NOT_A_QUESTION_COLUMN: 400,
	UNSUPPORTED_COLUMN_TYPE: 400,
	VALIDATION_ERROR: 400,
	RUN_ACTIVE: 409,
	NOTHING_TO_FILL: 409
};

export function tableAiFillErrorResponse(error: unknown): Response | null {
	if (!(error instanceof Error) || error.name !== 'TableAiFillError') return null;
	const code = (error as Error & { code?: TableAiFillErrorCode }).code;
	const status = code ? STATUS[code] : undefined;
	if (!status) return null;
	const details = (error as Error & { details?: unknown }).details;
	return ApiResponse.error(error.message, status, code, details ?? undefined);
}
