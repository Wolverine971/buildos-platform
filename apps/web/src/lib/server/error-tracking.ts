// apps/web/src/lib/server/error-tracking.ts
import type { ErrorSeverity } from '$lib/types/error-logging';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { getErrorStatus, shouldPersistGenericErrorEvent } from '$lib/utils/error-observability';
import { sanitizeLogData } from '$lib/utils/logging-helpers';

export type ServerErrorTrackingContext = {
	error: unknown;
	endpoint: string;
	method: string;
	operation: string;
	userId?: string | null;
	projectId?: string | null;
	requestId?: string;
	severity?: ErrorSeverity;
	metadata?: Record<string, unknown>;
};

export function getRequestIdFromHeaders(headers: Headers): string | undefined {
	return (
		headers.get('x-request-id') ||
		headers.get('x-vercel-id') ||
		headers.get('x-amzn-trace-id') ||
		undefined
	);
}

export async function logServerError(context: ServerErrorTrackingContext): Promise<void> {
	try {
		const metadata = (context.metadata ?? {}) as Record<string, unknown>;
		const metadataStatus = metadata.status;
		const status =
			typeof metadataStatus === 'number' && Number.isFinite(metadataStatus)
				? metadataStatus
				: getErrorStatus(context.error);
		const routeId =
			typeof metadata.routeId === 'string' || metadata.routeId === null
				? (metadata.routeId as string | null)
				: undefined;

		if (
			!shouldPersistGenericErrorEvent({
				operation: context.operation,
				pathname: context.endpoint,
				status,
				routeId
			})
		) {
			return;
		}

		const supabase = createAdminSupabaseClient();
		const logger = ErrorLoggerService.getInstance(supabase as any);
		const sanitizedMetadata = sanitizeLogData({
			source: 'server_runtime',
			...metadata
		}) as Record<string, unknown>;

		await logger.logError(
			context.error,
			{
				userId: context.userId ?? undefined,
				projectId: context.projectId ?? undefined,
				endpoint: context.endpoint,
				httpMethod: context.method,
				requestId: context.requestId,
				operationType: context.operation,
				metadata: sanitizedMetadata
			},
			context.severity
		);
	} catch (loggingError) {
		console.error('[ServerErrorTracking] Failed to persist error:', loggingError);
	}
}
