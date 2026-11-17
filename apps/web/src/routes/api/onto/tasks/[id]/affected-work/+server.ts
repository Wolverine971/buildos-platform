import type { RequestHandler } from './$types';
import { isValidUUID } from '@buildos/shared-types';
import { ApiResponse } from '$lib/utils/api-response';

function boundedInteger(raw: string | null, fallback: number, maximum: number): number | null {
	if (raw === null) return fallback;
	// Structured URL parameter validation, never natural-language classification.
	if (!/^\d+$/.test(raw)) return null;
	const value = Number(raw);
	return Number.isSafeInteger(value) && value >= 1 && value <= maximum ? value : null;
}

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) return ApiResponse.unauthorized('Authentication required');
	if (!params.id || !isValidUUID(params.id)) return ApiResponse.badRequest('Invalid task ID');

	const maxDepth = boundedInteger(url.searchParams.get('max_depth'), 3, 6);
	const maxTasks = boundedInteger(url.searchParams.get('max_tasks'), 50, 100);
	if (maxDepth === null || maxTasks === null) {
		return ApiResponse.badRequest('max_depth must be 1–6 and max_tasks must be 1–100');
	}

	try {
		// Use the caller's session, not the admin client. The invoker function keeps
		// RLS active and checks project membership before traversing any edges.
		const { data, error } = await locals.supabase.rpc('onto_task_affected_work', {
			p_task_id: params.id,
			p_max_depth: maxDepth,
			p_max_tasks: maxTasks
		});
		if (error) {
			if (error.code === '42501') return ApiResponse.forbidden('Access denied');
			console.error('[Affected work] Query failed', { code: error.code });
			return ApiResponse.error(
				'Affected work is temporarily unavailable. Please try again.',
				503
			);
		}
		if (data === null) return ApiResponse.notFound('Task');
		const response = ApiResponse.success(data);
		response.headers.set('Cache-Control', 'private, no-store');
		return response;
	} catch {
		return ApiResponse.error(
			'Affected work is temporarily unavailable. Please try again.',
			503
		);
	}
};
