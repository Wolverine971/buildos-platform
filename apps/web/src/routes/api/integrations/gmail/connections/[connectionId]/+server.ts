// apps/web/src/routes/api/integrations/gmail/connections/[connectionId]/+server.ts
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { GmailOAuthError, GmailReadOAuthService } from '$lib/server/gmail-read-oauth.service';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';

const renameRequestSchema = z
	.object({
		accountLabel: z.string().trim().min(1).max(60)
	})
	.strict();

function memberErrorResponse(error: unknown): Response {
	if (error instanceof GmailOAuthError && error.code === 'connection_not_found') {
		return ApiResponse.error(error.message, HttpStatus.NOT_FOUND, 'GMAIL_CONNECTION_NOT_FOUND');
	}

	return ApiResponse.error(
		'Unable to update Gmail connection',
		HttpStatus.INTERNAL_SERVER_ERROR,
		'GMAIL_CONNECTION_UPDATE_FAILED'
	);
}

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const parsed = await parseJsonRequest(request, renameRequestSchema);
	if (!parsed.ok) return parsed.response;

	try {
		const service = new GmailReadOAuthService(createAdminSupabaseClient());
		await service.renameConnection(user.id, params.connectionId, parsed.data.accountLabel);
		return ApiResponse.success({ updated: true });
	} catch (error) {
		return memberErrorResponse(error);
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	try {
		const service = new GmailReadOAuthService(createAdminSupabaseClient());
		const result = await service.disconnectConnection(user.id, params.connectionId);
		return ApiResponse.success({ disconnected: true, ...result });
	} catch (error) {
		return memberErrorResponse(error);
	}
};
