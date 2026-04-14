// apps/web/src/lib/services/agentic-chat/tools/libri/client.ts
import { createHash } from 'node:crypto';
import { env } from '$env/dynamic/private';
import type {
	LibriResourceType,
	LibriResolveJob,
	LibriResolveToolResult,
	LibriResolverRequest,
	LibriResolverStatus,
	LibriResponseDepth,
	ResolveLibriResourceArgs
} from './types';
import { isLibriIntegrationEnabled } from './config';

const DEFAULT_TIMEOUT_MS = 10000;
const RESOLVER_PATH = '/api/v1/resolve';
const CONFIGURATION_ERROR_MESSAGE = 'Libri is not configured for this BuildOS environment.';
const SUPPORTED_TYPES = new Set<LibriResourceType>(['person']);
const RESOLVER_STATUSES = new Set<LibriResolverStatus>([
	'found',
	'queued',
	'pending',
	'needs_input',
	'error'
]);

interface LibriClientEnv {
	[key: string]: string | undefined;
	LIBRI_API_BASE_URL?: string;
	LIBRI_API_KEY?: string;
	LIBRI_APP_BASE_URL?: string;
}

interface ResolveLibriResourceOptions {
	fetchFn?: typeof fetch;
	env?: LibriClientEnv;
	sessionId?: string;
	timeoutMs?: number;
	now?: () => Date;
}

interface LibriClientConfig {
	apiBaseUrl?: string;
	apiKey?: string;
	appBaseUrl?: string;
}

function normalizeOptionalString(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length ? trimmed : undefined;
}

function readConfig(source: LibriClientEnv = env): LibriClientConfig {
	return {
		apiBaseUrl: normalizeOptionalString(source.LIBRI_API_BASE_URL),
		apiKey: normalizeOptionalString(source.LIBRI_API_KEY),
		appBaseUrl: normalizeOptionalString(source.LIBRI_APP_BASE_URL)
	};
}

function configurationError(code = 'LIBRI_NOT_CONFIGURED'): LibriResolveToolResult {
	const message =
		code === 'LIBRI_DISABLED'
			? 'Libri integration is disabled for this BuildOS environment.'
			: CONFIGURATION_ERROR_MESSAGE;

	return {
		status: 'configuration_error',
		code,
		message,
		results: [],
		job: null
	};
}

function normalizeResponseDepth(value?: LibriResponseDepth): LibriResponseDepth {
	if (value === 'hit_only' || value === 'summary' || value === 'detail') return value;
	return 'summary';
}

function normalizeTypes(types?: LibriResourceType[]): LibriResourceType[] {
	if (!types?.length) return ['person'];
	const filtered = types.filter((type) => SUPPORTED_TYPES.has(type));
	return filtered.length ? Array.from(new Set(filtered)) : [];
}

function buildApiUrl(baseUrl: string): string | null {
	try {
		const normalized = baseUrl.replace(/\/+$/, '');
		const url = new URL(normalized);
		const pathname = url.pathname.replace(/\/+$/, '');
		url.pathname = pathname.endsWith('/api/v1') ? `${pathname}/resolve` : RESOLVER_PATH;
		url.search = '';
		url.hash = '';
		return url.toString();
	} catch {
		return null;
	}
}

function stableIdempotencyKey(request: LibriResolverRequest): string {
	const hash = createHash('sha256')
		.update(
			JSON.stringify({
				query: request.query.toLowerCase().replace(/\s+/g, ' ').trim(),
				types: request.types,
				enqueueIfMissing: request.enqueueIfMissing
			})
		)
		.digest('hex')
		.slice(0, 32);
	return `buildos-libri-resolve-${hash}`;
}

function redactSecret(text: string, apiKey?: string): string {
	let redacted = text;
	if (apiKey) {
		redacted = redacted.split(apiKey).join('[redacted]');
	}
	return redacted.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]');
}

async function parseJsonResponse(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

function extractErrorPayload(payload: unknown): { code?: string; message?: string } {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
	const record = payload as Record<string, unknown>;
	const nested = record.error;
	if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
		const error = nested as Record<string, unknown>;
		return {
			code: typeof error.code === 'string' ? error.code : undefined,
			message: typeof error.message === 'string' ? error.message : undefined
		};
	}
	return {
		code: typeof record.code === 'string' ? record.code : undefined,
		message: typeof record.message === 'string' ? record.message : undefined
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeJob(value: unknown): LibriResolveJob | null {
	if (!isRecord(value)) return null;
	return value as LibriResolveJob;
}

function normalizeResolverPayload(params: {
	payload: unknown;
	request: LibriResolverRequest;
	appBaseUrl?: string;
	now: () => Date;
}): LibriResolveToolResult {
	const { payload, request, appBaseUrl, now } = params;
	if (!isRecord(payload)) {
		return {
			status: 'error',
			code: 'LIBRI_INVALID_RESPONSE',
			message: 'Libri returned an invalid resolver response.',
			query: request.query,
			results: [],
			job: null,
			info: buildInfo(request, appBaseUrl, now)
		};
	}

	const status = payload.status;
	if (typeof status !== 'string' || !RESOLVER_STATUSES.has(status as LibriResolverStatus)) {
		return {
			status: 'error',
			code: 'LIBRI_INVALID_RESPONSE',
			message: 'Libri returned a resolver response with an unknown status.',
			query: request.query,
			results: [],
			job: null,
			info: buildInfo(request, appBaseUrl, now)
		};
	}

	return {
		status: status as LibriResolverStatus,
		code: typeof payload.code === 'string' ? payload.code : undefined,
		message:
			typeof payload.message === 'string'
				? payload.message
				: defaultMessageForStatus(status as LibriResolverStatus),
		query: typeof payload.query === 'string' ? payload.query : request.query,
		resourceKey:
			typeof payload.resourceKey === 'string' || payload.resourceKey === null
				? payload.resourceKey
				: undefined,
		results: Array.isArray(payload.results) ? payload.results : [],
		job: normalizeJob(payload.job),
		info: buildInfo(request, appBaseUrl, now)
	};
}

function defaultMessageForStatus(status: LibriResolverStatus): string {
	switch (status) {
		case 'found':
			return 'Found existing Libri resource.';
		case 'queued':
			return 'Libri queued enrichment for this resource.';
		case 'pending':
			return 'Libri enrichment is already in progress.';
		case 'needs_input':
			return 'Libri needs more input to resolve this resource.';
		case 'error':
		default:
			return 'Libri could not resolve this resource.';
	}
}

function buildInfo(
	request: LibriResolverRequest,
	appBaseUrl: string | undefined,
	now: () => Date
): LibriResolveToolResult['info'] {
	return {
		provider: 'libri',
		endpoint: 'POST /api/v1/resolve',
		response_depth: request.responseDepth,
		types: request.types,
		app_base_url: appBaseUrl,
		fetched_at: now().toISOString()
	};
}

function buildRequest(
	args: ResolveLibriResourceArgs,
	sessionId: string | undefined
): LibriResolverRequest | LibriResolveToolResult {
	const query = normalizeOptionalString(args.query);
	if (!query) {
		return {
			status: 'needs_input',
			code: 'QUERY_REQUIRED',
			message: 'A person name is required for Libri resolution.',
			results: [],
			job: null
		};
	}

	const types = normalizeTypes(args.types);
	if (!types.length) {
		return {
			status: 'error',
			code: 'UNSUPPORTED_LIBRI_RESOURCE_TYPE',
			message: 'This BuildOS Libri integration currently supports person resolution only.',
			query,
			results: [],
			job: null
		};
	}

	const projectId = normalizeOptionalString(args.project_id);
	const reason = normalizeOptionalString(args.reason);

	return {
		query,
		types,
		enqueueIfMissing: args.enqueue_if_missing ?? true,
		responseDepth: normalizeResponseDepth(args.response_depth),
		source: {
			system: 'buildos',
			contextType: projectId ? 'project' : 'global',
			projectId,
			sessionId: normalizeOptionalString(sessionId),
			reason
		}
	};
}

export async function resolveLibriResource(
	args: ResolveLibriResourceArgs,
	options: ResolveLibriResourceOptions = {}
): Promise<LibriResolveToolResult> {
	if (!isLibriIntegrationEnabled(options.env)) {
		return configurationError('LIBRI_DISABLED');
	}

	const config = readConfig(options.env);
	if (!config.apiBaseUrl || !config.apiKey) {
		return configurationError();
	}

	const request = buildRequest(args, options.sessionId);
	if ('status' in request) {
		return request;
	}

	const url = buildApiUrl(config.apiBaseUrl);
	if (!url) {
		return configurationError('LIBRI_INVALID_BASE_URL');
	}

	const fetcher = options.fetchFn ?? fetch;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const now = options.now ?? (() => new Date());
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetcher(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${config.apiKey}`,
				'Idempotency-Key': stableIdempotencyKey(request)
			},
			body: JSON.stringify(request),
			signal: controller.signal
		});

		if (response.status === 404) {
			return {
				status: 'resolver_unavailable',
				code: 'LIBRI_RESOLVER_UNAVAILABLE',
				message: 'Libri resolver endpoint is not available at the configured base URL.',
				query: request.query,
				results: [],
				job: null,
				http_status: response.status,
				info: buildInfo(request, config.appBaseUrl, now)
			};
		}

		if (!response.ok) {
			const payload = await parseJsonResponse(response);
			const error = extractErrorPayload(payload);
			const message = error.message
				? redactSecret(error.message, config.apiKey)
				: `Libri resolver request failed with HTTP ${response.status}.`;
			return {
				status: 'error',
				code:
					error.code ??
					(response.status === 401 || response.status === 403
						? 'LIBRI_AUTH_FAILED'
						: 'LIBRI_REQUEST_FAILED'),
				message,
				query: request.query,
				results: [],
				job: null,
				http_status: response.status,
				info: buildInfo(request, config.appBaseUrl, now)
			};
		}

		const payload = await parseJsonResponse(response);
		return normalizeResolverPayload({
			payload,
			request,
			appBaseUrl: config.appBaseUrl,
			now
		});
	} catch (error) {
		const isAbort =
			error instanceof Error &&
			(error.name === 'AbortError' || error.message === 'AbortError');
		return {
			status: 'error',
			code: isAbort ? 'LIBRI_TIMEOUT' : 'LIBRI_NETWORK_ERROR',
			message: isAbort
				? 'Libri resolver request timed out.'
				: redactSecret(
						error instanceof Error ? error.message : String(error),
						config.apiKey
					),
			query: request.query,
			results: [],
			job: null,
			info: buildInfo(request, config.appBaseUrl, now)
		};
	} finally {
		clearTimeout(timeout);
	}
}
