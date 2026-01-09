// apps/web/src/routes/api/visitors/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, parseRequestBody } from '$lib/utils/api-response';

export const POST: RequestHandler = async ({
	request,
	getClientAddress,
	locals: { supabase, safeGetSession }
}) => {
	try {
		const { user } = await safeGetSession();
		// Parse request body
		const body = await parseRequestBody<{ visitor_id: string }>(request);

		if (!body || !body.visitor_id || typeof body.visitor_id !== 'string') {
			return ApiResponse.validationError('visitor_id', 'Invalid visitor_id');
		}

		const { visitor_id } = body;

		// Get client IP address
		const ip_address = getClientAddress();

		// Get user agent
		const user_agent = request.headers.get('user-agent') || 'unknown';

		if (user_agent.includes('screenshot')) {
			return ApiResponse.success(null, 'Skipped Vercel');
		}

		// Insert visitor data with conflict handling (one per day per visitor)
		const { error } = await supabase.from('visitors').insert({
			visitor_id,
			ip_address,
			user_agent
		});

		if (user?.id) {
			const { error: userUpdateError } = await supabase
				.from('users')
				.update({
					last_visit: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.eq('id', user?.id);

			if (userUpdateError) {
				console.error(userUpdateError);
			}
		}

		// If there's a conflict (visitor already tracked today), that's expected
		if (error) {
			// Check if it's a unique constraint violation (expected for same visitor same day)
			if (error.code === '23505') {
				// Unique constraint violation - visitor already tracked today
				return ApiResponse.success(null, 'Visitor already tracked today');
			}

			// Other database errors
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success(null, 'Visitor tracked successfully');
	} catch (error) {
		console.error('Error in visitor tracking:', error);
		return ApiResponse.internalError(error);
	}
};
