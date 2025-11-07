// apps/web/src/lib/utils/api-client-helpers.ts
import type { ApiError, ApiSuccess } from './api-response';

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

/**
 * Parse API response with standardized format
 * Handles both old format (direct data or { error }) and new format ({ success, data, error })
 */
export async function parseApiResponse<T = any>(response: Response): Promise<ClientResponse<T>> {
	try {
		const result = await response.json();

		// Handle new standardized format
		if ('success' in result) {
			if (result.success) {
				return {
					success: true,
					data: result.data,
					message: result.message,
					warnings: result.warnings
				};
			} else {
				return {
					success: false,
					error: result.error || 'Request failed',
					errors: result.errors,
					warnings: result.warnings,
					message: result.message,
					code: result.code,
					details: result.details
				};
			}
		}

		// Handle old format for backward compatibility
		if (response.ok) {
			// Old success format - direct data
			return {
				success: true,
				data: result
			};
		} else {
			// Old error format - { error: string }
			return {
				success: false,
				error: result.error || `Request failed with status ${response.status}`,
				errors: result.errors,
				code: result.code,
				details: result.details
			};
		}
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
