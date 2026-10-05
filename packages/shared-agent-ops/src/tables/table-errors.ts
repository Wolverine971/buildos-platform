// packages/shared-agent-ops/src/tables/table-errors.ts
// The one error type every Tables service throws (docs/specs/tables/CONTRACT.md).
// Lives in its own file so the browser entry can export it without pulling in
// the Supabase-backed repository. `table-repository.ts` re-exports it.
import type { TableErrorCode } from './table-types';

export class TableServiceError extends Error {
	readonly code: TableErrorCode;
	readonly details?: unknown;

	constructor(code: TableErrorCode, message: string, details?: unknown) {
		super(message);
		this.name = 'TableServiceError';
		this.code = code;
		if (details !== undefined) this.details = details;
	}
}

export function isTableServiceError(error: unknown): error is TableServiceError {
	return error instanceof TableServiceError;
}
