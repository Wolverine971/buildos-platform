// src/lib/utils/api-client.ts
import { browser } from '$app/environment';

export interface ApiResponse<T = any> {
	success: boolean;
	data?: T;
	error?: string;
	message?: string;
	warnings?: Array<{ message: string; type: string }>;
}

export class ApiError extends Error {
	constructor(
		message: string,
		public status: number,
		public data?: any
	) {
		super(message);
		this.name = 'ApiError';
	}
}

export abstract class ApiClient {
	protected async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
		if (!browser && !options.headers?.['x-server-request']) {
			throw new Error('API calls from server-side code must include x-server-request header');
		}

		const defaultHeaders: HeadersInit = {
			'Content-Type': 'application/json',
			...options.headers
		};

		try {
			const response = await fetch(endpoint, {
				...options,
				headers: defaultHeaders
			});

			// Handle non-JSON responses
			const contentType = response.headers.get('content-type');
			if (!contentType?.includes('application/json')) {
				if (!response.ok) {
					throw new ApiError(`Request failed: ${response.statusText}`, response.status);
				}
				return response as any;
			}

			const data = await response.json();

			// Handle error responses
			if (!response.ok) {
				throw new ApiError(
					data.error || data.message || `Request failed: ${response.status}`,
					response.status,
					data
				);
			}

			// Return data directly if it's already in the expected format
			// or if it has a success wrapper
			return data;
		} catch (error) {
			// Re-throw ApiError instances
			if (error instanceof ApiError) {
				throw error;
			}

			// Handle network errors
			if (error instanceof TypeError && error.message.includes('fetch')) {
				throw new ApiError('Network error - please check your connection', 0);
			}

			// Handle other errors
			throw new ApiError(
				error instanceof Error ? error.message : 'An unexpected error occurred',
				0
			);
		}
	}

	protected async get<T>(endpoint: string, options?: RequestInit): Promise<T> {
		return this.request<T>(endpoint, {
			...options,
			method: 'GET'
		});
	}

	protected async post<T>(endpoint: string, data?: any, options?: RequestInit): Promise<T> {
		return this.request<T>(endpoint, {
			...options,
			method: 'POST',
			body: data ? JSON.stringify(data) : undefined
		});
	}

	protected async put<T>(endpoint: string, data?: any, options?: RequestInit): Promise<T> {
		return this.request<T>(endpoint, {
			...options,
			method: 'PUT',
			body: data ? JSON.stringify(data) : undefined
		});
	}

	protected async patch<T>(endpoint: string, data?: any, options?: RequestInit): Promise<T> {
		return this.request<T>(endpoint, {
			...options,
			method: 'PATCH',
			body: data ? JSON.stringify(data) : undefined
		});
	}

	protected async delete<T>(endpoint: string, data?: any, options?: RequestInit): Promise<T> {
		return this.request<T>(endpoint, {
			...options,
			method: 'DELETE',
			body: data ? JSON.stringify(data) : undefined
		});
	}
}

// Utility function for handling API responses in a consistent way
export function handleApiResponse<T>(response: ApiResponse<T>): {
	data: T | null;
	error: string | null;
	warnings: string[];
} {
	if (response.success && response.data) {
		return {
			data: response.data,
			error: null,
			warnings: response.warnings?.map((w) => w.message) || []
		};
	}

	return {
		data: null,
		error: response.error || response.message || 'An error occurred',
		warnings: response.warnings?.map((w) => w.message) || []
	};
}

// Utility function for creating consistent API responses (for server-side)
export function createApiResponse<T>(
	data?: T,
	error?: string,
	warnings?: Array<{ message: string; type: string }>
): ApiResponse<T> {
	if (error) {
		return {
			success: false,
			error,
			warnings
		};
	}

	return {
		success: true,
		data,
		warnings
	};
}
