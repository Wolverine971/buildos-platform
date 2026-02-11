// apps/web/src/lib/utils/braindump-validation.ts
/**
 * Unified validation service for brain dump API endpoints
 * Ensures consistent validation rules across all endpoints
 */

import { SSEResponse } from './sse-response';
import { ApiResponse, ErrorCode } from './api-response';
import { CONTENT_LENGTH } from '$lib/constants/brain-dump-thresholds';
import type { DisplayedBrainDumpQuestion, BrainDumpOptions } from '$lib/types/brain-dump';

export interface BrainDumpValidationConfig {
	/** Whether project ID is required */
	requireProjectId?: boolean;
	/** Whether to enforce content length limits */
	enforceContentLength?: boolean;
	/** Type of braindump for validation */
	type?: 'short' | 'long' | 'any';
	/** Whether questions are required */
	requireQuestions?: boolean;
}

export interface ValidationResult {
	isValid: boolean;
	error?: Response;
	validatedData?: {
		content: string;
		selectedProjectId?: string;
		brainDumpId?: string;
		displayedQuestions?: DisplayedBrainDumpQuestion[];
		options?: BrainDumpOptions;
		autoAccept?: boolean;
	};
}

/**
 * Validates brain dump request data with consistent rules
 */
export class BrainDumpValidator {
	/**
	 * Validate brain dump request with unified rules
	 */
	static async validate(
		requestBody: any,
		config: BrainDumpValidationConfig = {}
	): Promise<ValidationResult> {
		const {
			requireProjectId = false,
			enforceContentLength = true,
			type = 'any',
			requireQuestions = false
		} = config;

		// Extract and validate content
		const content = requestBody?.content;
		if (!content || typeof content !== 'string' || content.trim().length === 0) {
			return {
				isValid: false,
				error: SSEResponse.badRequest('Content is required and must be a non-empty string')
			};
		}

		const trimmedContent = content.trim();

		// Validate content length based on type
		if (enforceContentLength) {
			const validationResult = this.validateContentLength(trimmedContent, type);
			if (!validationResult.isValid) {
				return validationResult;
			}
		}

		// Validate project ID requirement
		const selectedProjectId = requestBody?.selectedProjectId;
		if (requireProjectId && !selectedProjectId) {
			return {
				isValid: false,
				error: SSEResponse.badRequest('Project ID is required for this operation')
			};
		}

		// Validate project ID format if provided
		if (selectedProjectId && typeof selectedProjectId !== 'string') {
			return {
				isValid: false,
				error: SSEResponse.badRequest('Project ID must be a string')
			};
		}

		// Validate questions if required
		const displayedQuestions = this.sanitizeDisplayedQuestions(requestBody?.displayedQuestions);
		if (requireQuestions && (!displayedQuestions || displayedQuestions.length === 0)) {
			return {
				isValid: false,
				error: SSEResponse.badRequest('Questions array is required')
			};
		}

		// Validate brain dump ID if provided
		const brainDumpId = requestBody?.brainDumpId;
		if (brainDumpId && typeof brainDumpId !== 'string') {
			return {
				isValid: false,
				error: SSEResponse.badRequest('Brain dump ID must be a string')
			};
		}

		// Extract options safely
		const options = this.sanitizeOptions(requestBody?.options);
		const autoAccept = this.extractAutoAccept(requestBody?.options);

		return {
			isValid: true,
			validatedData: {
				content: trimmedContent,
				selectedProjectId,
				brainDumpId,
				displayedQuestions,
				options,
				autoAccept
			}
		};
	}

	/**
	 * Validate content length based on type
	 */
	private static validateContentLength(
		content: string,
		type: 'short' | 'long' | 'any'
	): ValidationResult {
		const length = content.length;

		// Check absolute maximum
		if (length > CONTENT_LENGTH.MAX) {
			return {
				isValid: false,
				error: SSEResponse.badRequest(
					`Content exceeds maximum allowed length of ${CONTENT_LENGTH.MAX} characters`
				)
			};
		}

		switch (type) {
			case 'short':
				if (length > CONTENT_LENGTH.SHORT_MAX) {
					return {
						isValid: false,
						error: SSEResponse.badRequest(
							`Content too long for short braindump. Maximum ${CONTENT_LENGTH.SHORT_MAX} characters, received ${length}`
						)
					};
				}
				break;

			case 'long':
				if (length < CONTENT_LENGTH.LONG_MIN) {
					return {
						isValid: false,
						error: SSEResponse.badRequest(
							`Content too short for long braindump. Minimum ${CONTENT_LENGTH.LONG_MIN} characters, received ${length}`
						)
					};
				}
				break;

			case 'any':
				// No specific length validation for 'any' type
				break;
		}

		return { isValid: true };
	}

	/**
	 * Determine brain dump type based on content length
	 */
	static determineBrainDumpType(content: string): 'short' | 'long' {
		return content.length < CONTENT_LENGTH.SHORT_MAX ? 'short' : 'long';
	}

	/**
	 * Validate for short brain dump endpoint
	 */
	static async validateShort(requestBody: any): Promise<ValidationResult> {
		return this.validate(requestBody, {
			requireProjectId: true, // Short always requires project
			enforceContentLength: true,
			type: 'short',
			requireQuestions: false
		});
	}

	/**
	 * Validate for long brain dump endpoint
	 */
	static async validateLong(requestBody: any): Promise<ValidationResult> {
		return this.validate(requestBody, {
			requireProjectId: false, // Long optionally requires project
			enforceContentLength: true,
			type: 'long',
			requireQuestions: false
		});
	}

	/**
	 * Validate for dual processing endpoint
	 */
	static async validateDual(requestBody: any): Promise<ValidationResult> {
		// Dual processing should never require a project ID
		// The frontend determines whether to use dual vs short processing
		// based on both content length AND whether it's a new project.
		// If the frontend chose dual processing, trust that decision.
		return this.validate(requestBody, {
			requireProjectId: false, // Dual processing can handle both new and existing projects
			enforceContentLength: true,
			type: 'any', // Allow any length for dual processing
			requireQuestions: false
		});
	}

	/**
	 * Create consistent error response for regular API endpoints
	 */
	static createApiError(message: string, code?: string): Response {
		return ApiResponse.error(message, 400, code || ErrorCode.INVALID_REQUEST);
	}

	private static sanitizeDisplayedQuestions(
		value: unknown
	): DisplayedBrainDumpQuestion[] | undefined {
		if (!Array.isArray(value)) {
			return undefined;
		}

		const sanitized = value.filter((item): item is DisplayedBrainDumpQuestion => {
			if (!item || typeof item !== 'object') {
				return false;
			}

			const { id, question } = item as { id?: unknown; question?: unknown };
			return typeof id === 'string' && typeof question === 'string';
		});

		return sanitized.length > 0 ? sanitized : undefined;
	}

	private static sanitizeOptions(value: unknown): BrainDumpOptions | undefined {
		if (!value || typeof value !== 'object') {
			return undefined;
		}

		const options = value as Record<string, unknown>;
		const sanitized: BrainDumpOptions = {};

		if (typeof options.autoExecute === 'boolean') {
			sanitized.autoExecute = options.autoExecute;
		}

		if (typeof options.streamResults === 'boolean') {
			sanitized.streamResults = options.streamResults;
		}

		if (typeof options.useDualProcessing === 'boolean') {
			sanitized.useDualProcessing = options.useDualProcessing;
		}

		if (typeof options.retryAttempts === 'number') {
			sanitized.retryAttempts = options.retryAttempts;
		}

		return Object.keys(sanitized).length > 0 ? sanitized : undefined;
	}

	private static extractAutoAccept(value: unknown): boolean {
		if (!value || typeof value !== 'object') {
			return false;
		}

		return (value as Record<string, unknown>).autoAccept === true;
	}

	/**
	 * Create consistent success response for regular API endpoints
	 */
	static createApiSuccess<T>(data: T, message?: string): Response {
		return ApiResponse.success(data, message);
	}
}

// Export validation rules for client-side use
export const VALIDATION_RULES = {
	content: {
		required: true,
		minLength: 1,
		maxLength: CONTENT_LENGTH.MAX
	},
	projectId: {
		required: {
			short: true,
			long: false,
			dual: 'conditional' // Based on content length
		}
	},
	questions: {
		required: false,
		type: 'array'
	}
} as const;
