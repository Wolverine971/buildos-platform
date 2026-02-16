// apps/web/src/lib/types/api-responses.ts
/**
 * Type definitions for API responses
 *
 * All API endpoints should return responses in this format for consistency.
 * The local ApiResponse utility class generates these structures.
 */

import type {
	ApiResponse as SharedApiResponse,
	ChatSession,
	ChatMessage
} from '@buildos/shared-types';

/**
 * Standard success response format
 */
export type ApiSuccessResponse<T = unknown> = SharedApiResponse<T> & { success: true };

/**
 * Standard error response format
 */
export type ApiErrorResponse = SharedApiResponse<never> & { success: false };

/**
 * Union type for all API responses
 */
export type ApiResponseType<T = unknown> = SharedApiResponse<T>;

/**
 * Type guard to check if response is a success
 */
export function isApiSuccess<T>(response: ApiResponseType<T>): response is ApiSuccessResponse<T> {
	return response.success === true;
}

/**
 * Type guard to check if response is an error
 */
export function isApiError(response: ApiResponseType): response is ApiErrorResponse {
	return response.success === false;
}

// Specific response types for chat endpoints

export interface ChatSessionsResponse {
	sessions: ChatSession[];
}

export interface ChatSessionResponse {
	session: ChatSession & { messages?: ChatMessage[] };
}

export interface ChatTitleResponse {
	title: string;
}

export interface ChatCompressionResponse {
	compressed: boolean;
	metadata?: any;
	compressionId?: string;
	tokensSaved?: number;
	reason?: string;
}

export interface ChatCompressionHistoryResponse {
	history: any[];
}
