// apps/web/src/lib/server/error-tracking.ts
import type { ErrorSeverity } from '$lib/types/error-logging';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
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
		const supabase = createAdminSupabaseClient();
		const logger = ErrorLoggerService.getInstance(supabase as any);
		const metadata = sanitizeLogData({
			source: 'server_runtime',
			...(context.metadata ?? {})
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
				metadata
			},
			context.severity
		);
	} catch (loggingError) {
		console.error('[ServerErrorTracking] Failed to persist error:', loggingError);
	}
}
