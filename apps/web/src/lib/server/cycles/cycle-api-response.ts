// apps/web/src/lib/server/cycles/cycle-api-response.ts
import { ApiResponse } from '$lib/utils/api-response';
import { CycleServiceError } from './cycle-service';

export function cycleApiErrorResponse(error: unknown, fallback: string): Response {
	if (error instanceof CycleServiceError) {
		return ApiResponse.error(error.message, error.status, error.code, error.details);
	}
	return ApiResponse.internalError(error, fallback);
}
