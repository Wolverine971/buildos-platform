// apps/web/src/lib/types/api-responses.ts
/**
 * Type definitions for API responses
 *
 * All API endpoints should return responses in this format for consistency.
 * The local ApiResponse utility class generates these structures.
 */

import type { ChatSession, ChatMessage } from '@buildos/shared-types';

/**
 * Standard success response format
 */
export interface ApiSuccessResponse<T = any> {
	success: true;
	data?: T;
	message?: string;
}

/**
 * Standard error response format
 */
export interface ApiErrorResponse {
	error: string;
	code?: string;
	details?: any;
}

/**
 * Union type for all API responses
 */
export type ApiResponseType<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Type guard to check if response is a success
 */
export function isApiSuccess<T>(response: ApiResponseType<T>): response is ApiSuccessResponse<T> {
	return 'success' in response && response.success === true;
}

/**
 * Type guard to check if response is an error
 */
export function isApiError(response: ApiResponseType): response is ApiErrorResponse {
	return 'error' in response;
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
