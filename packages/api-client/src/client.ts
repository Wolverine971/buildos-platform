// packages/api-client/src/client.ts
/**
 * Transport core: bearer auth, the `ApiResponseBody` envelope, query building,
 * JSON vs. multipart bodies, and one error type. Runs on React Native (Hermes),
 * browsers and Node with nothing but global `fetch`.
 */
import type { ApiResponseBody, ApiWarning } from '@buildos/shared-types';
import { API_CLIENT_CONTRACT_VERSION, API_CONTRACT_HEADER } from './contract';
import { BuildOsApiError, toNetworkError } from './errors';

export type QueryPrimitive = string | number | boolean | null | undefined;
/** `undefined`/`null` values are dropped; arrays repeat the key (`a=1&a=2`). */
export type QueryParams = Record<string, QueryPrimitive | QueryPrimitive[]>;

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type BuildOsRequestInit = {
	/** Defaults to GET, or POST when a body is present. */
	method?: HttpMethod;
	/**
	 * Plain objects/arrays are JSON-encoded with `content-type: application/json`.
	 * `FormData`, `Blob`, `ArrayBuffer`, `URLSearchParams`, strings and streams pass
	 * through untouched so uploads keep their own content type (and boundary).
	 */
	body?: unknown;
	query?: QueryParams;
	headers?: Record<string, string>;
	signal?: AbortSignal | null;
};

/** Per-call extras every endpoint wrapper accepts as its last argument. */
export type RequestOptions = Pick<BuildOsRequestInit, 'signal' | 'headers'>;

export type BuildOsResponseMeta<T> = {
	data: T;
	warnings: ApiWarning[];
	timestamp: string;
	message?: string;
	status: number;
};

export type BuildOsClientOptions = {
	/** Origin of the SvelteKit app, e.g. `https://build-os.com`. Trailing slashes are removed. */
	baseUrl: string;
	/** Supabase access token for the signed-in person, or null when signed out. */
	getAccessToken: () => Promise<string | null> | string | null;
	/** Injectable for tests or `expo/fetch`. Defaults to the global `fetch`. */
	fetch?: typeof fetch;
	/** Called once per 401 response before the error is thrown. */
	onUnauthorized?: (error: BuildOsApiError) => void | Promise<void>;
	/** Sent on every request, e.g. `{ 'X-BuildOS-Client': 'ios/1.0.0' }`. */
	defaultHeaders?: Record<string, string>;
};

export interface BuildOsHttp {
	readonly baseUrl: string;
	/** Unwrapped envelope `data`. Throws `BuildOsApiError` on `!success` or non-2xx. */
	request<T>(path: string, init?: BuildOsRequestInit): Promise<T>;
	/** Same as `request`, plus the envelope's warnings, timestamp and message. */
	requestWithMeta<T>(path: string, init?: BuildOsRequestInit): Promise<BuildOsResponseMeta<T>>;
	/**
	 * The `Response` untouched, for streaming or non-JSON endpoints. Auth headers are
	 * still sent, and any non-2xx status throws `BuildOsApiError` (with the parsed
	 * envelope when there is one) before the response is returned.
	 */
	raw(path: string, init?: BuildOsRequestInit): Promise<Response>;
}

export function normalizeBaseUrl(baseUrl: string): string {
	return baseUrl.trim().replace(/\/+$/, '');
}

export function buildQueryString(query?: QueryParams): string {
	if (!query) return '';
	const parts: string[] = [];
	for (const key of Object.keys(query)) {
		const value = query[key];
		const values = Array.isArray(value) ? value : [value];
		for (const item of values) {
			if (item === undefined || item === null) continue;
			parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
		}
	}
	return parts.length > 0 ? `?${parts.join('&')}` : '';
}

export function buildUrl(baseUrl: string, path: string, query?: QueryParams): string {
	const normalizedPath = path.startsWith('/') ? path : `/${path}`;
	const queryString = buildQueryString(query);
	if (!queryString) return `${baseUrl}${normalizedPath}`;
	const joiner = normalizedPath.includes('?') ? '&' : '?';
	return `${baseUrl}${normalizedPath}${joiner}${queryString.slice(1)}`;
}

function isPassThroughBody(body: unknown): body is BodyInit {
	if (typeof body === 'string') return true;
	if (typeof FormData !== 'undefined' && body instanceof FormData) return true;
	if (typeof Blob !== 'undefined' && body instanceof Blob) return true;
	if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return true;
	if (typeof ArrayBuffer !== 'undefined') {
		if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return true;
	}
	if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) return true;
	return false;
}

function lowerCaseKeys(headers?: Record<string, string>): Record<string, string> {
	const out: Record<string, string> = {};
	if (!headers) return out;
	for (const key of Object.keys(headers)) {
		out[key.toLowerCase()] = headers[key] as string;
	}
	return out;
}

function isEnvelope(body: unknown): body is ApiResponseBody<unknown> {
	return (
		typeof body === 'object' &&
		body !== null &&
		typeof (body as { success?: unknown }).success === 'boolean'
	);
}

function isAbortError(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		(error as { name?: unknown }).name === 'AbortError'
	);
}

async function readBody(response: Response): Promise<unknown> {
	let text = '';
	try {
		text = await response.text();
	} catch {
		return undefined;
	}
	if (!text) return undefined;
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text;
	}
}

function errorFromResponse(status: number, body: unknown): BuildOsApiError {
	const record =
		typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
	const message =
		(typeof record?.error === 'string' && record.error) ||
		(typeof record?.message === 'string' && record.message) ||
		`Request failed with status ${status}`;
	return new BuildOsApiError({
		status,
		message,
		code: typeof record?.code === 'string' ? record.code : undefined,
		details: record?.details,
		body
	});
}

export function createBuildOsHttp(options: BuildOsClientOptions): BuildOsHttp {
	const baseUrl = normalizeBaseUrl(options.baseUrl);
	// Call the global through `globalThis` so browsers do not throw "Illegal invocation".
	const fetchImpl: typeof fetch =
		options.fetch ?? ((input, init) => globalThis.fetch(input, init));
	const defaultHeaders = lowerCaseKeys(options.defaultHeaders);

	async function send(
		path: string,
		init: BuildOsRequestInit,
		extraHeaders: Record<string, string>
	): Promise<Response> {
		const token = await Promise.resolve(options.getAccessToken());
		const headers: Record<string, string> = {
			[API_CONTRACT_HEADER]: String(API_CLIENT_CONTRACT_VERSION),
			...defaultHeaders,
			...extraHeaders,
			...lowerCaseKeys(init.headers)
		};
		if (token) headers.authorization = `Bearer ${token}`;

		let body: BodyInit | undefined;
		if (init.body !== undefined && init.body !== null) {
			if (isPassThroughBody(init.body)) {
				body = init.body;
			} else {
				body = JSON.stringify(init.body);
				if (!headers['content-type']) headers['content-type'] = 'application/json';
			}
		}

		const method: HttpMethod = init.method ?? (body !== undefined ? 'POST' : 'GET');

		try {
			return await fetchImpl(buildUrl(baseUrl, path, init.query), {
				method,
				headers,
				body,
				signal: init.signal ?? undefined,
				// Bearer only: the phone never holds the web session cookie.
				credentials: 'omit'
			});
		} catch (error) {
			// A caller's own abort is not a network failure; let it surface as-is.
			if (isAbortError(error)) throw error;
			throw toNetworkError(error);
		}
	}

	async function fail(error: BuildOsApiError): Promise<BuildOsApiError> {
		if (error.isUnauthorized() && options.onUnauthorized) {
			try {
				await options.onUnauthorized(error);
			} catch {
				// The original 401 is the error the caller needs.
			}
		}
		return error;
	}

	async function requestWithMeta<T>(
		path: string,
		init: BuildOsRequestInit = {}
	): Promise<BuildOsResponseMeta<T>> {
		const response = await send(path, init, { accept: 'application/json' });
		const body = await readBody(response);
		const envelope = isEnvelope(body) ? body : null;

		if (response.ok && (!envelope || envelope.success)) {
			return {
				data: (envelope ? envelope.data : body) as T,
				warnings: envelope?.warnings ?? [],
				timestamp: envelope?.timestamp ?? new Date().toISOString(),
				message: envelope?.message,
				status: response.status
			};
		}

		throw await fail(errorFromResponse(response.status, body));
	}

	async function request<T>(path: string, init?: BuildOsRequestInit): Promise<T> {
		const result = await requestWithMeta<T>(path, init);
		return result.data;
	}

	async function raw(path: string, init: BuildOsRequestInit = {}): Promise<Response> {
		const response = await send(path, init, {});
		if (!response.ok) {
			const body = await readBody(response);
			throw await fail(errorFromResponse(response.status, body));
		}
		return response;
	}

	return { baseUrl, request, requestWithMeta, raw };
}
