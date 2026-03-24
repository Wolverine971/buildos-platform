// apps/web/src/routes/api/error-tracking/client/+server.ts
import type { RequestHandler } from './$types';
import { getRequestIdFromHeaders, logServerError } from '$lib/server/error-tracking';
import { sanitizeLogData } from '$lib/utils/logging-helpers';

type ClientErrorPayload = {
	kind?: unknown;
	error?: unknown;
	endpoint?: unknown;
	method?: unknown;
	url?: unknown;
	status?: unknown;
	statusText?: unknown;
	metadata?: unknown;
};

function normalizeKind(value: unknown): 'runtime' | 'fetch_network' {
	return value === 'fetch_network' ? 'fetch_network' : 'runtime';
}

function normalizeEndpoint(value: unknown): string {
	return typeof value === 'string' && value.trim() ? value.trim() : '/client';
}

function normalizeMethod(value: unknown): string {
	return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : 'CLIENT';
}

function normalizeStatus(value: unknown): number | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
	return value;
}

function buildClientError(payload: ClientErrorPayload, kind: 'runtime' | 'fetch_network'): Error {
	const candidate = payload.error;
	const fallbackMessage =
		kind === 'fetch_network' ? 'Client network request failed' : 'Client runtime error';

	if (candidate instanceof Error) {
		return candidate;
	}

	const error = new Error(fallbackMessage);

	if (candidate && typeof candidate === 'object') {
		const typedCandidate = candidate as {
			name?: unknown;
			message?: unknown;
			stack?: unknown;
		};
		if (typeof typedCandidate.name === 'string' && typedCandidate.name.trim()) {
			error.name = typedCandidate.name.trim();
		}
		if (typeof typedCandidate.message === 'string' && typedCandidate.message.trim()) {
			error.message = typedCandidate.message.trim();
		}
		if (typeof typedCandidate.stack === 'string' && typedCandidate.stack.trim()) {
			error.stack = typedCandidate.stack;
		}
		return error;
	}

	if (typeof candidate === 'string' && candidate.trim()) {
		error.message = candidate.trim();
	}

	return error;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	let payload: ClientErrorPayload;

	try {
		payload = (await request.json()) as ClientErrorPayload;
	} catch {
		return new Response(null, { status: 400 });
	}

	const kind = normalizeKind(payload.kind);
	const endpoint = normalizeEndpoint(payload.endpoint);
	const method = normalizeMethod(payload.method);
	const status = normalizeStatus(payload.status);
	const statusText = typeof payload.statusText === 'string' ? payload.statusText : undefined;
	const url = typeof payload.url === 'string' ? payload.url : undefined;
	const { user } = await locals.safeGetSession();

	await logServerError({
		error: buildClientError(payload, kind),
		endpoint,
		method,
		operation: kind === 'fetch_network' ? 'client_fetch_network' : 'client_runtime',
		userId: user?.id,
		requestId: getRequestIdFromHeaders(request.headers),
		severity: status !== undefined && status < 500 ? 'warning' : 'error',
		metadata: {
			source: 'client_runtime',
			reportKind: kind,
			clientUrl: url,
			status,
			statusText,
			clientMetadata:
				payload.metadata && typeof payload.metadata === 'object'
					? sanitizeLogData(payload.metadata as Record<string, unknown>)
					: undefined
		}
	});

	return new Response(null, { status: 204 });
};
