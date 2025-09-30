// apps/web/src/lib/services/base/api-service.ts
import { parseApiResponse } from '$lib/utils/api-client-helpers';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { supabase } from '$lib/supabase';

export interface ServiceResponse<T = any> {
	success: boolean;
	warnings?: string[];
	errors?: string[];
	data?: T;
	message?: string;
}

export abstract class ApiService {
	protected baseUrl: string;
	protected errorLogger: ErrorLoggerService | null = null;

	constructor(baseUrl: string) {
		this.baseUrl = baseUrl;
		// Initialize error logger using the existing Supabase client
		try {
			if (supabase) {
				this.errorLogger = ErrorLoggerService.getInstance(supabase);
			}
		} catch (e) {
			// Silently fail if we can't initialize error logger
			console.warn('Could not initialize error logger in ApiService:', e);
		}
	}

	/**
	 * Make a GET request
	 */
	protected async get<T = any>(
		endpoint: string,
		params?: Record<string, string>
	): Promise<ServiceResponse<T>> {
		try {
			const url = new URL(`${this.baseUrl}${endpoint}`, window.location.origin);
			if (params) {
				Object.entries(params).forEach(([key, value]) => {
					url.searchParams.append(key, value);
				});
			}

			const response = await fetch(url.toString());
			const result = await parseApiResponse(response);

			if (result?.success && result.data) {
				return {
					success: true,
					data: result.data as T,
					warnings: result.warnings
				};
			}

			return {
				success: false,
				errors: result?.errors || ['Request failed']
			};
		} catch (error) {
			return this.handleError(error, endpoint, 'GET');
		}
	}

	/**
	 * Make a POST request
	 */
	protected async post<T = any>(
		endpoint: string,
		body: any,
		options?: RequestInit
	): Promise<ServiceResponse<T>> {
		try {
			const response = await fetch(`${this.baseUrl}${endpoint}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...options?.headers
				},
				body: JSON.stringify(body),
				...options
			});

			const result = await parseApiResponse(response);

			if (result?.success) {
				return {
					success: true,
					data: result.data as T,
					warnings: result.warnings
				};
			}

			return {
				success: false,
				errors: result?.errors || ['Request failed']
			};
		} catch (error) {
			return this.handleError(error, endpoint, 'POST');
		}
	}

	/**
	 * Make a PUT request
	 */
	protected async put<T = any>(
		endpoint: string,
		body: any,
		options?: RequestInit
	): Promise<ServiceResponse<T>> {
		try {
			const response = await fetch(`${this.baseUrl}${endpoint}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					...options?.headers
				},
				body: JSON.stringify(body),
				...options
			});

			const result = await parseApiResponse(response);

			if (result?.success && result.data) {
				return {
					success: true,
					data: result.data as T,
					warnings: result.warnings
				};
			}

			return {
				success: false,
				errors: result?.errors || ['Request failed']
			};
		} catch (error) {
			return this.handleError(error, endpoint, 'PUT');
		}
	}

	/**
	 * Make a PATCH request
	 */
	protected async patch<T = any>(
		endpoint: string,
		body: any,
		options?: RequestInit
	): Promise<ServiceResponse<T>> {
		try {
			const response = await fetch(`${this.baseUrl}${endpoint}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					...options?.headers
				},
				body: JSON.stringify(body),
				...options
			});

			const result = await parseApiResponse(response);

			if (result?.success && result.data) {
				return {
					success: true,
					data: result.data as T,
					warnings: result.warnings
				};
			}

			return {
				success: false,
				errors: result?.errors || ['Request failed']
			};
		} catch (error) {
			return this.handleError(error, endpoint, 'PATCH');
		}
	}

	/**
	 * Make a DELETE request
	 */
	protected async delete<T = any>(
		endpoint: string,
		options?: RequestInit
	): Promise<ServiceResponse<T>> {
		try {
			const response = await fetch(`${this.baseUrl}${endpoint}`, {
				method: 'DELETE',
				...options
			});

			const result = await parseApiResponse(response);

			if (result?.success) {
				return {
					success: true,
					data: result.data as T,
					message: result.message,
					warnings: result.warnings
				};
			}

			return {
				success: false,
				errors: result?.errors || ['Request failed']
			};
		} catch (error) {
			return this.handleError(error, endpoint, 'DELETE');
		}
	}

	/**
	 * Handle errors consistently
	 */
	protected async handleError(
		error: unknown,
		endpoint?: string,
		method?: string
	): Promise<ServiceResponse> {
		console.error('API Error:', error);

		// Log to error logger if available
		if (this.errorLogger) {
			try {
				await this.errorLogger.logAPIError(
					error,
					endpoint || this.baseUrl,
					method || 'UNKNOWN',
					undefined,
					{ errorContext: 'API Service Error' }
				);
			} catch (logError) {
				console.error('Failed to log error:', logError);
			}
		}

		if (error instanceof Error) {
			// Network errors
			if (error.message.includes('Failed to fetch')) {
				return {
					success: false,
					errors: ['Network error. Please check your connection.']
				};
			}

			return {
				success: false,
				errors: [error.message]
			};
		}

		return {
			success: false,
			errors: ['An unexpected error occurred']
		};
	}

	/**
	 * Build query parameters
	 */
	protected buildQueryParams(params: Record<string, any>): string {
		const searchParams = new URLSearchParams();

		Object.entries(params).forEach(([key, value]) => {
			if (value !== undefined && value !== null) {
				searchParams.append(key, String(value));
			}
		});

		const queryString = searchParams.toString();
		return queryString ? `?${queryString}` : '';
	}
}
