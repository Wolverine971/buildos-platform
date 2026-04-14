// apps/web/src/lib/services/agentic-chat/tools/libri/client.ts
import { createHash } from 'node:crypto';
import { env } from '$env/dynamic/private';
import type {
	LibriLibraryQueryAction,
	LibriLibraryQueryToolResult,
	LibriResourceType,
	LibriResolveJob,
	LibriResolveToolResult,
	LibriResolverRequest,
	LibriResolverStatus,
	LibriResponseDepth,
	QueryLibriLibraryArgs,
	ResolveLibriResourceArgs
} from './types';
import { isLibriIntegrationEnabled } from './config';

const DEFAULT_TIMEOUT_MS = 10000;
const RESOLVER_PATH = '/api/v1/resolve';
const LIBRARY_PATH_PREFIX = '/api/v1/library';
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

type QueryLibriLibraryOptions = ResolveLibriResourceOptions;

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

function libraryConfigurationError(code = 'LIBRI_NOT_CONFIGURED'): LibriLibraryQueryToolResult {
	const message =
		code === 'LIBRI_DISABLED'
			? 'Libri integration is disabled for this BuildOS environment.'
			: CONFIGURATION_ERROR_MESSAGE;

	return {
		status: 'configuration_error',
		code,
		message
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

function buildApiUrl(baseUrl: string, endpointPath = RESOLVER_PATH): string | null {
	try {
		const normalized = baseUrl.replace(/\/+$/, '');
		const url = new URL(normalized);
		const pathname = url.pathname.replace(/\/+$/, '');
		const cleanEndpoint = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
		const endpointWithoutApiPrefix = cleanEndpoint.replace(/^\/api\/v1/, '');
		url.pathname = pathname.endsWith('/api/v1')
			? `${pathname}${endpointWithoutApiPrefix}`
			: cleanEndpoint;
		url.search = '';
		url.hash = '';
		return url.toString();
	} catch {
		return null;
	}
}

function appendQueryParam(url: URL, key: string, value: unknown): void {
	if (value === undefined || value === null) return;
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (trimmed) url.searchParams.set(key, trimmed);
		return;
	}
	if (typeof value === 'number' && Number.isFinite(value)) {
		url.searchParams.set(key, String(Math.floor(value)));
		return;
	}
	if (typeof value === 'boolean') {
		url.searchParams.set(key, value ? 'true' : 'false');
		return;
	}
	if (Array.isArray(value) && value.length > 0) {
		const items = value.filter(
			(item): item is string => typeof item === 'string' && item.trim()
		);
		if (items.length) url.searchParams.set(key, Array.from(new Set(items)).join(','));
	}
}

function clampLimit(value: unknown): number | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
	return Math.min(Math.max(Math.floor(value), 1), 100);
}

function normalizeLibraryAction(value: unknown): LibriLibraryQueryAction | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim() as LibriLibraryQueryAction;
	const allowed = new Set<LibriLibraryQueryAction>([
		'overview',
		'search',
		'search_books',
		'list_book_categories',
		'list_books_by_category',
		'list_authors',
		'get_author',
		'list_videos',
		'search_videos'
	]);
	return allowed.has(normalized) ? normalized : null;
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

function buildLibraryInfo(params: {
	endpoint: string;
	action: LibriLibraryQueryAction;
	appBaseUrl?: string;
	now: () => Date;
}): LibriLibraryQueryToolResult['info'] {
	return {
		provider: 'libri',
		endpoint: params.endpoint,
		action: params.action,
		app_base_url: params.appBaseUrl,
		fetched_at: params.now().toISOString()
	};
}

function libraryEndpointForAction(action: LibriLibraryQueryAction): string {
	switch (action) {
		case 'overview':
			return `${LIBRARY_PATH_PREFIX}/overview`;
		case 'search':
			return `${LIBRARY_PATH_PREFIX}/search`;
		case 'search_books':
		case 'list_books_by_category':
			return `${LIBRARY_PATH_PREFIX}/books`;
		case 'list_book_categories':
			return `${LIBRARY_PATH_PREFIX}/categories`;
		case 'list_authors':
		case 'get_author':
			return `${LIBRARY_PATH_PREFIX}/authors`;
		case 'list_videos':
		case 'search_videos':
			return `${LIBRARY_PATH_PREFIX}/videos`;
	}
}

function buildLibraryUrl(
	baseUrl: string,
	args: QueryLibriLibraryArgs
):
	| { url: string; endpoint: string; action: LibriLibraryQueryAction }
	| LibriLibraryQueryToolResult {
	const action = normalizeLibraryAction(args.action);
	if (!action) {
		return {
			status: 'needs_input',
			code: 'ACTION_REQUIRED',
			message: 'A valid Libri library query action is required.'
		};
	}

	const endpoint = libraryEndpointForAction(action);
	const rawUrl = buildApiUrl(baseUrl, endpoint);
	if (!rawUrl) return libraryConfigurationError('LIBRI_INVALID_BASE_URL');

	const url = new URL(rawUrl);
	const query = normalizeOptionalString(args.query);
	const category = normalizeOptionalString(args.category);
	const limit = clampLimit(args.limit);

	switch (action) {
		case 'search':
			if (!query) {
				return {
					status: 'needs_input',
					code: 'QUERY_REQUIRED',
					message: 'A search query is required for Libri library search.',
					action
				};
			}
			appendQueryParam(url, 'q', query);
			appendQueryParam(url, 'types', args.types);
			break;
		case 'search_books':
			if (!query) {
				return {
					status: 'needs_input',
					code: 'QUERY_REQUIRED',
					message: 'A book search query is required.',
					action
				};
			}
			appendQueryParam(url, 'q', query);
			break;
		case 'list_books_by_category':
			if (!category) {
				return {
					status: 'needs_input',
					code: 'CATEGORY_REQUIRED',
					message: 'A category or genre is required to list Libri books by category.',
					action
				};
			}
			appendQueryParam(url, 'category', category);
			appendQueryParam(url, 'sort', 'coverage');
			break;
		case 'get_author':
			if (!query) {
				return {
					status: 'needs_input',
					code: 'QUERY_REQUIRED',
					message: 'An author/person name is required.',
					action
				};
			}
			appendQueryParam(url, 'q', query);
			appendQueryParam(url, 'includeBooks', true);
			appendQueryParam(url, 'bookLimit', 10);
			if (!limit) appendQueryParam(url, 'limit', 1);
			break;
		case 'list_authors':
			appendQueryParam(url, 'q', query);
			appendQueryParam(url, 'includeBooks', args.response_depth === 'detail');
			appendQueryParam(url, 'bookLimit', args.response_depth === 'detail' ? 5 : undefined);
			break;
		case 'search_videos':
			if (!query) {
				return {
					status: 'needs_input',
					code: 'QUERY_REQUIRED',
					message: 'A YouTube video search query is required.',
					action
				};
			}
			appendQueryParam(url, 'q', query);
			break;
		case 'list_book_categories':
			appendQueryParam(url, 'includeBooks', args.response_depth === 'detail');
			break;
		case 'overview':
		case 'list_videos':
			appendQueryParam(url, 'q', query);
			break;
	}

	appendQueryParam(url, 'limit', limit);
	return { url: url.toString(), endpoint: `GET ${endpoint}`, action };
}

function normalizeLibraryPayload(params: {
	payload: unknown;
	action: LibriLibraryQueryAction;
	endpoint: string;
	appBaseUrl?: string;
	now: () => Date;
	query?: string;
	category?: string;
}): LibriLibraryQueryToolResult {
	const { payload, action, endpoint, appBaseUrl, now, query, category } = params;
	if (!isRecord(payload)) {
		return {
			status: 'error',
			code: 'LIBRI_INVALID_RESPONSE',
			message: 'Libri returned an invalid library query response.',
			action,
			query,
			category,
			info: buildLibraryInfo({ endpoint, action, appBaseUrl, now })
		};
	}

	const payloadStatus = typeof payload.status === 'string' ? payload.status : 'ok';
	const status: 'ok' | 'needs_input' = payloadStatus === 'needs_input' ? 'needs_input' : 'ok';
	return {
		status,
		message:
			typeof payload.message === 'string'
				? payload.message
				: status === 'needs_input'
					? 'Libri needs more input for this library query.'
					: 'Libri library query completed.',
		action,
		query,
		category,
		data: payload,
		info: buildLibraryInfo({ endpoint, action, appBaseUrl, now })
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

export async function queryLibriLibrary(
	args: QueryLibriLibraryArgs,
	options: QueryLibriLibraryOptions = {}
): Promise<LibriLibraryQueryToolResult> {
	if (!isLibriIntegrationEnabled(options.env)) {
		return libraryConfigurationError('LIBRI_DISABLED');
	}

	const config = readConfig(options.env);
	if (!config.apiBaseUrl || !config.apiKey) {
		return libraryConfigurationError();
	}

	const built = buildLibraryUrl(config.apiBaseUrl, args);
	if ('status' in built) {
		return built;
	}

	const fetcher = options.fetchFn ?? fetch;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const now = options.now ?? (() => new Date());
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	const query = normalizeOptionalString(args.query);
	const category = normalizeOptionalString(args.category);

	try {
		const response = await fetcher(built.url, {
			method: 'GET',
			headers: {
				Accept: 'application/json',
				Authorization: `Bearer ${config.apiKey}`
			},
			signal: controller.signal
		});

		if (response.status === 404) {
			return {
				status: 'resolver_unavailable',
				code: 'LIBRI_LIBRARY_API_UNAVAILABLE',
				message:
					'Libri library query endpoint is not available at the configured base URL.',
				action: built.action,
				query,
				category,
				http_status: response.status,
				info: buildLibraryInfo({
					endpoint: built.endpoint,
					action: built.action,
					appBaseUrl: config.appBaseUrl,
					now
				})
			};
		}

		if (!response.ok) {
			const payload = await parseJsonResponse(response);
			const error = extractErrorPayload(payload);
			return {
				status: 'error',
				code:
					error.code ??
					(response.status === 401 || response.status === 403
						? 'LIBRI_AUTH_FAILED'
						: 'LIBRI_LIBRARY_QUERY_FAILED'),
				message: error.message
					? redactSecret(error.message, config.apiKey)
					: `Libri library query failed with HTTP ${response.status}.`,
				action: built.action,
				query,
				category,
				http_status: response.status,
				info: buildLibraryInfo({
					endpoint: built.endpoint,
					action: built.action,
					appBaseUrl: config.appBaseUrl,
					now
				})
			};
		}

		const payload = await parseJsonResponse(response);
		return normalizeLibraryPayload({
			payload,
			action: built.action,
			endpoint: built.endpoint,
			appBaseUrl: config.appBaseUrl,
			now,
			query,
			category
		});
	} catch (error) {
		const isAbort =
			error instanceof Error &&
			(error.name === 'AbortError' || error.message === 'AbortError');
		return {
			status: 'error',
			code: isAbort ? 'LIBRI_TIMEOUT' : 'LIBRI_NETWORK_ERROR',
			message: isAbort
				? 'Libri library query timed out.'
				: redactSecret(
						error instanceof Error ? error.message : String(error),
						config.apiKey
					),
			action: built.action,
			query,
			category,
			info: buildLibraryInfo({
				endpoint: built.endpoint,
				action: built.action,
				appBaseUrl: config.appBaseUrl,
				now
			})
		};
	} finally {
		clearTimeout(timeout);
	}
}
