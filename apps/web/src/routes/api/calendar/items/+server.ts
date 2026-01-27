// apps/web/src/routes/api/calendar/items/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

const parseBoolean = (value: string | null, defaultValue: boolean): boolean => {
	if (value === null || value === undefined) return defaultValue;
	if (value === 'true' || value === '1') return true;
	if (value === 'false' || value === '0') return false;
	return defaultValue;
};

const parseProjectIds = (value: string | null): string[] | null => {
	if (!value) return null;
	try {
		const parsed = JSON.parse(value);
		if (Array.isArray(parsed)) {
			return parsed.filter((entry) => typeof entry === 'string');
		}
	} catch {
		// fall through to comma parsing
	}

	const items = value
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);

	return items.length > 0 ? items : null;
};

export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	const start = url.searchParams.get('start');
	const end = url.searchParams.get('end');

	if (!start || !end) {
		return ApiResponse.badRequest('start and end are required');
	}

	const includeEvents = parseBoolean(url.searchParams.get('include_events'), true);
	const includeTaskRange = parseBoolean(url.searchParams.get('include_task_range'), true);
	const includeTaskStart = parseBoolean(url.searchParams.get('include_task_start'), true);
	const includeTaskDue = parseBoolean(url.searchParams.get('include_task_due'), true);

	const projectIds = parseProjectIds(url.searchParams.get('project_ids'));
	const limitParam = url.searchParams.get('limit');
	const limit = limitParam ? Number.parseInt(limitParam, 10) : null;

	try {
		const { data, error } = await supabase.rpc('list_calendar_items', {
			p_start: start,
			p_end: end,
			p_include_events: includeEvents,
			p_include_task_range: includeTaskRange,
			p_include_task_start: includeTaskStart,
			p_include_task_due: includeTaskDue,
			p_project_ids: projectIds,
			p_limit: Number.isFinite(limit) ? limit : null
		});

		if (error) {
			console.error('[CalendarItems] RPC error:', error);
			return ApiResponse.internalError(error, 'Failed to load calendar items');
		}

		return ApiResponse.success({ items: data ?? [] });
	} catch (err) {
		console.error('[CalendarItems] Failed to load calendar items:', err);
		return ApiResponse.internalError(err, 'Failed to load calendar items');
	}
};
