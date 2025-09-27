// src/lib/utils/api-response.ts
import { json } from '@sveltejs/kit';
import { createHash } from 'crypto';

// Standard error response format
export interface ApiError {
	error: string;
	code?: string;
	details?: any;
}

// Standard success response format
export interface ApiSuccess<T = any> {
	success: true;
	data?: T;
	message?: string;
}

// Cache configuration interface
export interface CacheConfig {
	maxAge?: number; // in seconds, default 300 (5 minutes)
	public?: boolean; // public vs private cache, default true
	staleWhileRevalidate?: number; // SWR time in seconds
	mustRevalidate?: boolean; // force revalidation
}

// Common HTTP status codes
export const HttpStatus = {
	OK: 200,
	CREATED: 201,
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	REQUEST_TIMEOUT: 408,
	CONFLICT: 409,
	UNPROCESSABLE_ENTITY: 422,
	TOO_MANY_REQUESTS: 429,
	INTERNAL_SERVER_ERROR: 500,
	SERVICE_UNAVAILABLE: 503
} as const;

// Common error codes for better client handling
export const ErrorCode = {
	// Authentication errors
	UNAUTHORIZED: 'UNAUTHORIZED',
	FORBIDDEN: 'FORBIDDEN',
	SESSION_EXPIRED: 'SESSION_EXPIRED',

	// Validation errors
	INVALID_REQUEST: 'INVALID_REQUEST',
	MISSING_FIELD: 'MISSING_FIELD',
	INVALID_FIELD: 'INVALID_FIELD',

	// Resource errors
	NOT_FOUND: 'NOT_FOUND',
	ALREADY_EXISTS: 'ALREADY_EXISTS',

	// Operation errors
	OPERATION_FAILED: 'OPERATION_FAILED',
	RATE_LIMITED: 'RATE_LIMITED',
	TIMEOUT: 'TIMEOUT',

	// System errors
	INTERNAL_ERROR: 'INTERNAL_ERROR',
	DATABASE_ERROR: 'DATABASE_ERROR',
	SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE'
} as const;

// Helper function to generate ETag from data
function generateETag(data: any): string {
	const hash = createHash('md5');
	hash.update(JSON.stringify(data));
	return `"${hash.digest('hex')}"`;
}

// Helper function to build cache control header
function buildCacheControl(config: CacheConfig): string {
	const parts: string[] = [];

	if (config.public !== false) {
		parts.push('public');
	} else {
		parts.push('private');
	}

	if (config.maxAge !== undefined) {
		parts.push(`max-age=${config.maxAge}`);
	}

	if (config.staleWhileRevalidate !== undefined) {
		parts.push(`stale-while-revalidate=${config.staleWhileRevalidate}`);
	}

	if (config.mustRevalidate) {
		parts.push('must-revalidate');
	}

	return parts.join(', ');
}

export class ApiResponse {
	// Success responses with optional caching
	static success<T = any>(data?: T, message?: string, cacheConfig?: CacheConfig) {
		const response = json<ApiSuccess<T>>({
			success: true,
			data,
			message
		});

		if (cacheConfig) {
			response.headers.set('Cache-Control', buildCacheControl(cacheConfig));
			if (data) {
				response.headers.set('ETag', generateETag(data));
			}
		}

		return response;
	}

	static created<T = any>(data?: T, message?: string, cacheConfig?: CacheConfig) {
		const response = json<ApiSuccess<T>>(
			{
				success: true,
				data,
				message
			},
			{ status: HttpStatus.CREATED }
		);

		if (cacheConfig) {
			response.headers.set('Cache-Control', buildCacheControl(cacheConfig));
			if (data) {
				response.headers.set('ETag', generateETag(data));
			}
		}

		return response;
	}

	// Helper method for cacheable responses
	static cached<T = any>(
		data?: T,
		message?: string,
		maxAge: number = 300,
		options?: Partial<CacheConfig>
	) {
		return this.success(data, message, { maxAge, ...options });
	}

	// Error responses
	static error(
		message: string,
		status: number = HttpStatus.INTERNAL_SERVER_ERROR,
		code?: string,
		details?: any
	) {
		return json<ApiError>(
			{
				error: message,
				code,
				details
			},
			{ status }
		);
	}

	// Common error responses
	static badRequest(message: string = 'Invalid request', details?: any) {
		return this.error(message, HttpStatus.BAD_REQUEST, ErrorCode.INVALID_REQUEST, details);
	}

	static unauthorized(message: string = 'Unauthorized') {
		return this.error(message, HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED);
	}

	static sessionRequired(message: string = 'Authentication required') {
		return this.error(message, HttpStatus.UNAUTHORIZED, ErrorCode.SESSION_EXPIRED);
	}

	static forbidden(message: string = 'Forbidden') {
		return this.error(message, HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN);
	}

	static notFound(resource: string = 'Resource') {
		return this.error(`${resource} not found`, HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
	}

	static conflict(message: string = 'Resource already exists') {
		return this.error(message, HttpStatus.CONFLICT, ErrorCode.ALREADY_EXISTS);
	}

	static validationError(field: string, message: string) {
		return this.error(
			`Validation error: ${message}`,
			HttpStatus.UNPROCESSABLE_ENTITY,
			ErrorCode.INVALID_FIELD,
			{ field }
		);
	}

	static internalError(error: unknown, message: string = 'Internal server error') {
		// Log the actual error for debugging
		console.error('Internal error:', error);

		// Don't expose internal error details to client
		return this.error(message, HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_ERROR);
	}

	static databaseError(error: any) {
		console.error('Database error:', error);

		// Handle specific Supabase/PostgreSQL errors
		if (error.code === '23505') {
			return this.conflict('Resource already exists');
		}
		if (error.code === 'PGRST116') {
			return this.notFound();
		}

		return this.error(
			'Database operation failed',
			HttpStatus.INTERNAL_SERVER_ERROR,
			ErrorCode.DATABASE_ERROR
		);
	}

	static timeout(message: string = 'Operation timed out') {
		return this.error(message, HttpStatus.REQUEST_TIMEOUT, ErrorCode.TIMEOUT);
	}
}

// Helper to validate required fields
export function validateRequiredFields(
	data: any,
	fields: string[]
): { valid: boolean; missing?: string } {
	for (const field of fields) {
		if (!data[field]) {
			return { valid: false, missing: field };
		}
	}
	return { valid: true };
}

// Helper to safely parse JSON request body
export async function parseRequestBody<T = any>(request: Request): Promise<T | null> {
	try {
		return await request.json();
	} catch {
		return null;
	}
}

// Helper to ensure authenticated user for API endpoints
export async function requireAuth(locals: App.Locals) {
	const { session, user } = await locals.safeGetSession();

	if (!session) {
		return { error: ApiResponse.sessionRequired() };
	}

	if (!user) {
		// Have session but no user record - this is an edge case
		console.error('User has session but no user record:', session.user.id);
		return {
			error: ApiResponse.unauthorized(
				'Account setup incomplete. Please try logging in again.'
			)
		};
	}

	return { user };
}

// Helper to handle conditional requests (304 Not Modified)
export function handleConditionalRequest(request: Request, data: any): Response | null {
	const ifNoneMatch = request.headers.get('if-none-match');

	if (ifNoneMatch && data) {
		const currentETag = generateETag(data);

		// Check if ETags match (remove quotes for comparison)
		const clientETag = ifNoneMatch.replace(/"/g, '');
		const serverETag = currentETag.replace(/"/g, '');

		if (clientETag === serverETag) {
			return new Response(null, {
				status: 304,
				headers: {
					ETag: currentETag,
					'Cache-Control': 'public, max-age=300'
				}
			});
		}
	}

	return null;
}
