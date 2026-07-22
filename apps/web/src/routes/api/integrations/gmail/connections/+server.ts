// apps/web/src/routes/api/integrations/gmail/connections/+server.ts
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { GmailOAuthError, GmailReadOAuthService } from '$lib/server/gmail-read-oauth.service';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';

const connectRequestSchema = z
	.object({
		connectionId: z.string().uuid().nullable().optional(),
		redirectPath: z.string().max(500).optional()
	})
	.strict();

function gmailErrorResponse(error: unknown): Response {
	if (error instanceof GmailOAuthError) {
		switch (error.code) {
			case 'not_configured':
				return ApiResponse.error(
					'Gmail read-only connections are not available yet',
					HttpStatus.SERVICE_UNAVAILABLE,
					'GMAIL_NOT_CONFIGURED'
				);
			case 'connection_not_found':
				return ApiResponse.error(
					error.message,
					HttpStatus.NOT_FOUND,
					'GMAIL_CONNECTION_NOT_FOUND'
				);
			case 'connection_limit_exceeded':
				return ApiResponse.error(
					error.message,
					HttpStatus.CONFLICT,
					'GMAIL_CONNECTION_LIMIT'
				);
			default:
				return ApiResponse.error(
					'Unable to manage Gmail connections',
					HttpStatus.INTERNAL_SERVER_ERROR,
					'GMAIL_CONNECTION_FAILED'
				);
		}
	}

	return ApiResponse.error(
		'Unable to manage Gmail connections',
		HttpStatus.INTERNAL_SERVER_ERROR,
		'GMAIL_CONNECTION_FAILED'
	);
}

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	try {
		const service = new GmailReadOAuthService(createAdminSupabaseClient());
		return ApiResponse.success(await service.listConnections(user.id), undefined, {
			public: false,
			maxAge: 0,
			mustRevalidate: true
		});
	} catch (error) {
		return gmailErrorResponse(error);
	}
};

export const POST: RequestHandler = async ({ request, locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const parsed = await parseJsonRequest(request, connectRequestSchema);
	if (!parsed.ok) return parsed.response;

	try {
		const service = new GmailReadOAuthService(createAdminSupabaseClient());
		const authorizationUrl = await service.createAuthorizationUrl({
			userId: user.id,
			redirectUri: `${url.origin}/auth/google/gmail-read/callback`,
			redirectPath: parsed.data.redirectPath ?? '/profile?tab=email&gmail=1',
			connectionId: parsed.data.connectionId ?? null
		});

		return ApiResponse.success({ authorizationUrl, readOnly: true as const });
	} catch (error) {
		return gmailErrorResponse(error);
	}
};
