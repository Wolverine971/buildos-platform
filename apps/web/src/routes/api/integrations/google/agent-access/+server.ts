// apps/web/src/routes/api/integrations/google/agent-access/+server.ts
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { createGoogleAgentOAuthService } from '$lib/server/google-agent-oauth';
import { GoogleAgentOAuthError } from '@buildos/shared-agent-ops/google/google-agent-oauth';

const inputSchema = z
	.object({
		kind: z.enum(['gmail', 'calendar', 'calendar_legacy']),
		connectionId: z.string().uuid().optional()
	})
	.strict()
	.refine(
		(value) => value.kind === 'calendar_legacy' || !!value.connectionId,
		'Select a connected Google account'
	);
function failure(error: unknown): Response {
	const response =
		error instanceof GoogleAgentOAuthError
			? ApiResponse.error(
					error.message,
					error.code === 'connection_not_found'
						? 404
						: error.code === 'not_configured'
							? 503
							: 400,
					error.code
				)
			: ApiResponse.error('Unable to manage Google agent access', 500);
	response.headers.set('Cache-Control', 'no-store');
	return response;
}
const handle: RequestHandler = async ({ request, url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized();
	// SvelteKit's form CSRF guard doesn't cover JSON endpoints.
	if (request.method !== 'GET' && request.headers.get('origin') !== url.origin)
		return ApiResponse.error('Invalid request origin', 403);
	const parsed =
		request.method === 'GET'
			? inputSchema.safeParse(Object.fromEntries(url.searchParams))
			: await parseJsonRequest(request, inputSchema);
	if ('ok' in parsed && !parsed.ok) return parsed.response;
	if ('success' in parsed && !parsed.success)
		return ApiResponse.badRequest('Select a connected Google account');
	const input = parsed.data!;
	const target = {
		userId: user.id,
		kind: input.kind,
		connectionId: input.connectionId ?? user.id
	};
	try {
		const service = createGoogleAgentOAuthService();
		const result =
			request.method === 'GET'
				? await service.status(target)
				: request.method === 'DELETE'
					? await service.disconnect(target).then(() => ({ disabled: true }))
					: {
							url: await service.createAuthorizationUrl(
								target,
								`${url.origin}/auth/google/agent/callback`
							)
						};
		const response = ApiResponse.success(result);
		response.headers.set('Cache-Control', 'no-store');
		return response;
	} catch (error) {
		return failure(error);
	}
};
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
