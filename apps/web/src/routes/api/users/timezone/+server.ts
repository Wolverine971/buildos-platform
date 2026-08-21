// apps/web/src/routes/api/users/timezone/+server.ts
//
// Auto-populates `users.timezone` (the centralized timezone source of truth,
// see ../calendar-preferences) from the browser. The agentic prompt clock
// renders the user's local date from this column; without it every US user
// chatting after ~20:00 local was told it was already tomorrow (UTC).
//
// Only a null/'UTC' stored value is treated as "unset" and replaced — a zone
// the user deliberately chose elsewhere is never overwritten here.
import type { RequestHandler } from './$types';
import { ApiResponse, requireAuth } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { isValidIanaTimezone } from '$lib/services/agentic-chat/tools/core/executors/calendar-datetime';
import { z } from 'zod';

const timezoneSyncSchema = z.object({ timezone: z.string().trim().min(1).max(64) }).strict();

const UNSET_TIMEZONES = new Set([null, '', 'UTC', 'Etc/UTC']);

export const POST: RequestHandler = async ({ request, locals }) => {
	const auth = await requireAuth(locals);
	if ('error' in auth && auth.error) return auth.error;
	const { user } = auth;

	const parsed = await parseJsonRequest(request, timezoneSyncSchema);
	if (!parsed.ok) return parsed.response;
	const { timezone } = parsed.data;

	if (!isValidIanaTimezone(timezone)) {
		return ApiResponse.validationError('timezone', 'Expected a valid IANA timezone name');
	}

	const { data: row, error: readError } = await locals.supabase
		.from('users')
		.select('timezone')
		.eq('id', user.id)
		.maybeSingle();
	if (readError) {
		return ApiResponse.databaseError(readError);
	}

	const stored = typeof row?.timezone === 'string' ? row.timezone.trim() : null;
	if (!UNSET_TIMEZONES.has(stored)) {
		// A deliberately set zone wins; report it back so the client knows.
		return ApiResponse.success({ timezone: stored, updated: false });
	}
	if (UNSET_TIMEZONES.has(timezone)) {
		return ApiResponse.success({ timezone: stored ?? 'UTC', updated: false });
	}

	const { error: updateError } = await locals.supabase
		.from('users')
		.update({ timezone })
		.eq('id', user.id);
	if (updateError) {
		return ApiResponse.databaseError(updateError);
	}

	return ApiResponse.success({ timezone, updated: true });
};
