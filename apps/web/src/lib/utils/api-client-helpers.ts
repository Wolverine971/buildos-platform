// apps/web/src/lib/utils/api-client-helpers.ts
import type { ApiResponse as SharedApiResponse } from '@buildos/shared-types';

export interface ClientResponse<T = any> {
	success: boolean;
	data?: T;
	error?: string;
	errors?: string[];
	warnings?: string[];
	message?: string;
	code?: string;
	details?: any;
}

function normalizeWarnings(rawWarnings: unknown): string[] | undefined {
	if (!Array.isArray(rawWarnings)) return undefined;

	return rawWarnings
		.map((warning) => {
			if (typeof warning === 'string') return warning;
			if (warning && typeof warning === 'object' && 'message' in warning) {
				const message = (warning as { message?: unknown }).message;
				return typeof message === 'string' ? message : null;
			}
			return null;
		})
		.filter((warning): warning is string => Boolean(warning));
}

function extractErrorCode(payload: Record<string, unknown>): string | undefined {
	if (typeof payload.code === 'string') return payload.code;

	const errorInfo = payload.errorInfo;
	if (errorInfo && typeof errorInfo === 'object' && 'code' in errorInfo) {
		const code = (errorInfo as { code?: unknown }).code;
		return typeof code === 'string' ? code : undefined;
	}

	return undefined;
}

function extractErrorDetails(payload: Record<string, unknown>): unknown {
	if ('details' in payload) return payload.details;

	const errorInfo = payload.errorInfo;
	if (errorInfo && typeof errorInfo === 'object' && 'details' in errorInfo) {
		return (errorInfo as { details?: unknown }).details;
	}

	return undefined;
}

export function extractApiErrorMessage(payload: unknown, fallback = 'Request failed'): string {
	if (!payload || typeof payload !== 'object') return fallback;
	const record = payload as Record<string, unknown>;

	if (typeof record.error === 'string' && record.error.trim()) {
		return record.error;
	}

	if (record.error && typeof record.error === 'object' && 'message' in record.error) {
		const nestedMessage = (record.error as { message?: unknown }).message;
		if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
			return nestedMessage;
		}
	}

	if (typeof record.message === 'string' && record.message.trim()) {
		return record.message;
	}

	if (record.errorInfo && typeof record.errorInfo === 'object' && 'message' in record.errorInfo) {
		const structuredMessage = (record.errorInfo as { message?: unknown }).message;
		if (typeof structuredMessage === 'string' && structuredMessage.trim()) {
			return structuredMessage;
		}
	}

	return fallback;
}

/**
 * Parse API response with standardized format
 * Enforces the canonical response envelope: { success, data?, error?, message?, ... }.
 */
export async function parseApiResponse<T = any>(response: Response): Promise<ClientResponse<T>> {
	try {
		const parsed = (await response.json()) as unknown;
		if (!parsed || typeof parsed !== 'object') {
			return {
				success: false,
				error: 'Invalid API response contract'
			};
		}

		const result = parsed as SharedApiResponse<T> & Record<string, unknown>;
		if (typeof result.success !== 'boolean') {
			return {
				success: false,
				error: 'Invalid API response contract'
			};
		}

		if (result.success) {
			return {
				success: true,
				data: result.data,
				message: typeof result.message === 'string' ? result.message : undefined,
				warnings: normalizeWarnings(result.warnings)
			};
		}

		const errors =
			Array.isArray(result.errors) &&
			result.errors.every((error) => typeof error === 'string')
				? (result.errors as string[])
				: undefined;

		return {
			success: false,
			error: extractApiErrorMessage(result, `Request failed with status ${response.status}`),
			errors,
			warnings: normalizeWarnings(result.warnings),
			message: typeof result.message === 'string' ? result.message : undefined,
			code: extractErrorCode(result),
			details: extractErrorDetails(result)
		};
	} catch (error) {
		// Failed to parse JSON
		return {
			success: false,
			error: 'Failed to parse server response',
			details: error
		};
	}
}

/**
 * Make API request with standardized error handling
 */
export async function apiRequest<T = any>(
	url: string,
	options?: RequestInit
): Promise<ClientResponse<T>> {
	try {
		const response = await fetch(url, {
			headers: {
				'Content-Type': 'application/json',
				...options?.headers
			},
			...options
		});

		return parseApiResponse<T>(response);
	} catch (error) {
		// Network error
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Network error occurred',
			code: 'NETWORK_ERROR'
		};
	}
}

/**
 * Ensure an API response succeeded, throwing with a helpful message otherwise.
 * Returns the parsed `ClientResponse` so callers can inspect `data`, `message`, etc.
 */
export async function requireApiSuccess<T = any>(
	response: Response,
	fallbackMessage = 'Request failed'
): Promise<ClientResponse<T>> {
	const result = await parseApiResponse<T>(response);

	if (!result.success) {
		throw new Error(result.error || result.message || fallbackMessage);
	}

	return result;
}

/**
 * Convenience helper for endpoints that always return a payload in `data`.
 * Throws if the response failed or if the payload is missing.
 */
export async function requireApiData<T = any>(
	response: Response,
	fallbackMessage = 'Request failed'
): Promise<T> {
	const result = await requireApiSuccess<T>(response, fallbackMessage);

	if (result.data === undefined) {
		throw new Error(fallbackMessage);
	}

	return result.data;
}
