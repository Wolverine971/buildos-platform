// apps/web/src/lib/server/route-error.ts
import type { RequestEvent } from '@sveltejs/kit';
import type { ErrorSeverity } from '$lib/types/error-logging';
import { ApiResponse, ErrorCode, HttpStatus } from '$lib/utils/api-response';
import {
	getClientIpFromHeaders,
	getRequestIdFromHeaders,
	getUserAgentFromHeaders,
	logServerError
} from '$lib/server/error-tracking';

type RouteErrorBaseOptions = {
	operation: string;
	userId?: string | null;
	projectId?: string | null;
	severity?: ErrorSeverity;
	metadata?: Record<string, unknown>;
};

export type LogRouteErrorOptions = RouteErrorBaseOptions & {
	status?: number;
};

export type RouteErrorResponseOptions = RouteErrorBaseOptions & {
	message?: string;
	status?: number;
	code?: string;
	details?: unknown;
};

export function getRouteRequestId(event: RequestEvent): string | undefined {
	return getRequestIdFromHeaders(event.request.headers);
}

export async function logRouteError(
	event: RequestEvent,
	error: unknown,
	options: LogRouteErrorOptions
): Promise<void> {
	await logServerError({
		error,
		endpoint: event.url.pathname,
		method: event.request.method,
		operation: options.operation,
		userId: options.userId ?? event.locals.user?.id,
		projectId: options.projectId,
		requestId: getRouteRequestId(event),
		userAgent: getUserAgentFromHeaders(event.request.headers),
		ipAddress: getClientIpFromHeaders(event.request.headers),
		severity: options.severity,
		metadata: {
			routeId: event.route.id ?? null,
			params: event.params,
			status: options.status,
			...(options.metadata ?? {})
		}
	});
}

export async function routeErrorResponse(
	event: RequestEvent,
	error: unknown,
	options: RouteErrorResponseOptions
): Promise<Response> {
	const status = options.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
	const message = options.message ?? 'Internal server error';

	await logRouteError(event, error, {
		operation: options.operation,
		userId: options.userId,
		projectId: options.projectId,
		severity: options.severity ?? (status >= 500 ? 'error' : 'warning'),
		status,
		metadata: options.metadata
	});

	return ApiResponse.error(
		message,
		status,
		options.code ?? ErrorCode.INTERNAL_ERROR,
		options.details,
		{ requestId: getRouteRequestId(event) }
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object';
}

export async function routeDatabaseErrorResponse(
	event: RequestEvent,
	error: unknown,
	options: Omit<RouteErrorResponseOptions, 'status' | 'code' | 'message'> & {
		message?: string;
	}
): Promise<Response> {
	if (isRecord(error) && error.code === '23505') {
		return ApiResponse.conflict(options.message ?? 'Resource already exists');
	}

	if (isRecord(error) && error.code === 'PGRST116') {
		return ApiResponse.notFound();
	}

	return routeErrorResponse(event, error, {
		...options,
		message: options.message ?? 'Database operation failed',
		status: HttpStatus.INTERNAL_SERVER_ERROR,
		code: ErrorCode.DATABASE_ERROR
	});
}
