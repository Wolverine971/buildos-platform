// src/routes/api/admin/errors/[id]/resolve/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, parseRequestBody } from '$lib/utils/api-response';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';

export const POST: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	// Check admin role
	const { data: userData } = await supabase
		.from('users')
		.select('is_admin')
		.eq('id', user.id)
		.single();

	if (!userData || !userData.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const { id } = params;
	const body = await parseRequestBody(request);
	const { notes } = body || {};

	// Get error logger
	const errorLogger = ErrorLoggerService.getInstance(supabase);

	// Resolve the error
	const success = await errorLogger.resolveError(id, user.id, notes);

	if (!success) {
		return ApiResponse.internalError('Failed to resolve error');
	}

	return ApiResponse.success({
		message: 'Error resolved successfully'
	});
};
