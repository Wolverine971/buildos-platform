// apps/web/src/routes/api/today/suggestions/keep/+server.ts
// "Keep" on a suggestion the brief repeats every morning: Today stops listing it for two weeks.
// DELETE undoes it.
import type { RequestHandler } from './$types';
import { formatInTimeZone } from 'date-fns-tz';
import { ApiResponse } from '$lib/utils/api-response';
import { resolveTimezone } from '$lib/server/today-feed.service';

const KEEP_DAYS = 14;

async function readTaskId(request: Request): Promise<string | null> {
	const body = (await request.json().catch(() => null)) as { task_id?: unknown } | null;
	return typeof body?.task_id === 'string' && body.task_id.length <= 64 ? body.task_id : null;
}

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized('Unauthorized');
	const taskId = await readTaskId(request);
	if (!taskId) return ApiResponse.badRequest('task_id is required');

	// The task must be one the person can see (RLS on onto_tasks).
	const { data: task } = await supabase
		.from('onto_tasks')
		.select('id')
		.eq('id', taskId)
		.maybeSingle();
	if (!task) return ApiResponse.notFound('Task');

	const timezone = await resolveTimezone(supabase, user.id, user.timezone);
	const keptUntil = formatInTimeZone(
		new Date(Date.now() + KEEP_DAYS * 24 * 60 * 60 * 1000),
		timezone,
		'yyyy-MM-dd'
	);
	const { error } = await supabase
		.from('today_kept_suggestions')
		.upsert({ user_id: user.id, task_id: taskId, kept_until: keptUntil });
	if (error) return ApiResponse.internalError(error, 'Could not keep that suggestion');
	return ApiResponse.success({ task_id: taskId, kept_until: keptUntil });
};

export const DELETE: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized('Unauthorized');
	const taskId = await readTaskId(request);
	if (!taskId) return ApiResponse.badRequest('task_id is required');
	const { error } = await supabase
		.from('today_kept_suggestions')
		.delete()
		.eq('user_id', user.id)
		.eq('task_id', taskId);
	if (error) return ApiResponse.internalError(error, 'Could not undo that');
	return ApiResponse.success({ task_id: taskId });
};
