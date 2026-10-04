// apps/web/src/lib/server/consolidation/consolidation-http.ts
// Shared request plumbing for /api/consolidation routes.
import { ApiResponse } from '$lib/utils/api-response';
import { OrganizeError } from '$lib/server/organize/organize-service';
import { ConsolidationError } from './consolidation.service';

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
	try {
		const parsed: unknown = await request.json();
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

export function consolidationFailure(error: unknown, fallback: string) {
	if (error instanceof ConsolidationError || error instanceof OrganizeError)
		return ApiResponse.error(error.message, error.status);
	return ApiResponse.internalError(error, fallback);
}
