// apps/web/src/routes/api/admin/errors/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import type { ErrorType, ErrorSeverity } from '$lib/types/error-logging';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
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

	// Parse query parameters
	const severity = url.searchParams.get('severity') as ErrorSeverity | null;
	const errorType = url.searchParams.get('type') as ErrorType | null;
	const resolved = url.searchParams.get('resolved');
	const userId = url.searchParams.get('userId');
	const projectId = url.searchParams.get('projectId');
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = parseInt(url.searchParams.get('limit') || '50');

	// Get error logger
	const errorLogger = ErrorLoggerService.getInstance(supabase);

	// Build filters
	const filters: any = {};
	if (severity) filters.severity = severity;
	if (errorType) filters.errorType = errorType;
	if (resolved !== null) filters.resolved = resolved === 'true';
	if (userId) filters.userId = userId;
	if (projectId) filters.projectId = projectId;

	// Fetch errors and summary
	const [errors, summary] = await Promise.all([
		errorLogger.getRecentErrors(limit, filters),
		errorLogger.getErrorSummary()
	]);

	return ApiResponse.success({
		errors,
		summary,
		pagination: {
			page,
			limit,
			hasMore: errors.length === limit
		}
	});
};
