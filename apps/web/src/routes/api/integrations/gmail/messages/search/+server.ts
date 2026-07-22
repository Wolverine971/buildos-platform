// apps/web/src/routes/api/integrations/gmail/messages/search/+server.ts
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { GmailReadGateway } from '$lib/server/gmail-read-gateway';
import { checkGmailReadRateLimit } from '$lib/server/gmail-read-rate-limit';
import { gmailReadErrorResponse, noStore } from '$lib/server/gmail-read-route-response';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';

const searchRequestSchema = z
	.object({
		connectionIds: z.array(z.string().uuid()).min(1).max(5),
		query: z.string().trim().min(1).max(300),
		maxResults: z.number().int().min(1).max(20).optional()
	})
	.strict()
	.refine((value) => new Set(value.connectionIds).size === value.connectionIds.length, {
		message: 'Select unique Gmail accounts',
		path: ['connectionIds']
	});

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return noStore(ApiResponse.unauthorized());

	const parsed = await parseJsonRequest(request, searchRequestSchema);
	if (!parsed.ok) return noStore(parsed.response);

	const rateLimit = checkGmailReadRateLimit({
		userId: user.id,
		connectionIds: parsed.data.connectionIds,
		operation: 'search'
	});
	if (!rateLimit.allowed) {
		const response = ApiResponse.error(
			'Too many Gmail searches. Wait a moment and try again.',
			HttpStatus.TOO_MANY_REQUESTS,
			'GMAIL_READ_RATE_LIMITED'
		);
		response.headers.set('Retry-After', String(rateLimit.retryAfterSeconds));
		return noStore(response, rateLimit.headers);
	}

	try {
		const gateway = new GmailReadGateway(createAdminSupabaseClient());
		const result = await gateway.searchMessages({
			userId: user.id,
			connectionIds: parsed.data.connectionIds,
			query: parsed.data.query,
			maxResults: parsed.data.maxResults
		});
		return noStore(ApiResponse.success(result), rateLimit.headers);
	} catch (error) {
		return gmailReadErrorResponse(error);
	}
};
