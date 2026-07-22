// apps/web/src/routes/api/integrations/gmail/messages/get/+server.ts
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { GmailReadGateway } from '$lib/server/gmail-read-gateway';
import { checkGmailReadRateLimit } from '$lib/server/gmail-read-rate-limit';
import { gmailReadErrorResponse, noStore } from '$lib/server/gmail-read-route-response';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';

const getMessageRequestSchema = z
	.object({
		connectionId: z.string().uuid(),
		messageId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/)
	})
	.strict();

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return noStore(ApiResponse.unauthorized());

	const parsed = await parseJsonRequest(request, getMessageRequestSchema);
	if (!parsed.ok) return noStore(parsed.response);

	const rateLimit = checkGmailReadRateLimit({
		userId: user.id,
		connectionIds: [parsed.data.connectionId],
		operation: 'get'
	});
	if (!rateLimit.allowed) {
		const response = ApiResponse.error(
			'Too many Gmail message reads. Wait a moment and try again.',
			HttpStatus.TOO_MANY_REQUESTS,
			'GMAIL_READ_RATE_LIMITED'
		);
		response.headers.set('Retry-After', String(rateLimit.retryAfterSeconds));
		return noStore(response, rateLimit.headers);
	}

	try {
		const gateway = new GmailReadGateway(createAdminSupabaseClient());
		const result = await gateway.getMessage({
			userId: user.id,
			connectionId: parsed.data.connectionId,
			messageId: parsed.data.messageId
		});
		return noStore(ApiResponse.success(result), rateLimit.headers);
	} catch (error) {
		return gmailReadErrorResponse(error);
	}
};
