// packages/shared-agent-ops/src/calendar/google-calendar-scopes.ts
// The Google Calendar permissions BuildOS asks for. Both connect flows (legacy single-account
// and multi-account) request this one list, so the consent screen and grant checks never drift.

/**
 * Broad scope requested before October 2026. Grants made under it stay valid: it is a superset
 * of GOOGLE_CALENDAR_SCOPES, so existing connections never have to reconnect.
 */
export const GOOGLE_CALENDAR_LEGACY_FULL_SCOPE = 'https://www.googleapis.com/auth/calendar';

/**
 * Narrow scopes requested for every new Calendar connection (method coverage per Google's
 * v3 reference "Authorization" sections):
 * - calendar.events: events list/get/insert/patch/update/delete and events.watch (sync).
 * - calendar.events.freebusy: freebusy.query for availability and overdue-task rescheduling.
 * - calendar.calendarlist.readonly: calendarList.list/get to show the calendars a user can pick.
 * - calendar.app.created: calendars.insert/patch/delete and calendarList.patch (color) for the
 *   project calendars BuildOS creates. Calendars the user links keep their Google name/color.
 */
export const GOOGLE_CALENDAR_SCOPES = [
	'https://www.googleapis.com/auth/calendar.events',
	'https://www.googleapis.com/auth/calendar.events.freebusy',
	'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
	'https://www.googleapis.com/auth/calendar.app.created'
] as const;

function toScopeList(scopes: readonly string[] | string | null | undefined): string[] {
	const values = typeof scopes === 'string' ? scopes.split(/\s+/) : (scopes ?? []);
	return values.map((scope) => scope.trim()).filter(Boolean);
}

/**
 * Required Calendar scopes missing from a grant. Google's consent screen lets people untick
 * individual permissions, so a successful authorization can still be partial.
 */
export function getMissingGoogleCalendarScopes(
	granted: readonly string[] | string | null | undefined
): string[] {
	const grantedScopes = new Set(toScopeList(granted));
	if (grantedScopes.has(GOOGLE_CALENDAR_LEGACY_FULL_SCOPE)) return [];
	return GOOGLE_CALENDAR_SCOPES.filter((scope) => !grantedScopes.has(scope));
}

/** True when a grant covers everything BuildOS Calendar needs (full legacy or narrow set). */
export function hasRequiredGoogleCalendarScopes(
	granted: readonly string[] | string | null | undefined
): boolean {
	return getMissingGoogleCalendarScopes(granted).length === 0;
}

type GoogleApiErrorShape = {
	code?: unknown;
	status?: unknown;
	errors?: Array<{ reason?: unknown }>;
	response?: {
		status?: unknown;
		data?: {
			error?: {
				errors?: Array<{ reason?: unknown }>;
				details?: Array<{ reason?: unknown }>;
			};
		};
	};
};

function googleErrorStatus(error: GoogleApiErrorShape): number | null {
	const raw = error.response?.status ?? error.status ?? error.code;
	const status = typeof raw === 'string' ? Number(raw) : raw;
	return typeof status === 'number' && Number.isFinite(status) ? status : null;
}

/**
 * True when Google refused a calendar-property change because BuildOS may not manage that
 * calendar: a 403 for insufficient scope (calendar.app.created covers only calendars BuildOS
 * created) or a 404 for a calendar the narrow grant cannot see. Rate-limit 403s do not match.
 */
export function isGoogleCalendarUnmanagedCalendarError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const record = error as GoogleApiErrorShape;
	const status = googleErrorStatus(record);
	if (status === 404) return true;
	if (status !== 403) return false;
	const reasons = [
		...(record.errors ?? []),
		...(record.response?.data?.error?.errors ?? []),
		...(record.response?.data?.error?.details ?? [])
	].map((entry) => entry?.reason);
	return reasons.some(
		(reason) =>
			reason === 'insufficientPermissions' || reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT'
	);
}

/**
 * Applies a Google-side name/color change to a project calendar. Calendars BuildOS did not
 * create are skipped under the narrow grant; callers still save the change in BuildOS.
 * Returns false when the change was skipped for that reason.
 */
export async function applyGoogleCalendarPropertyChange(
	change: () => Promise<unknown>
): Promise<boolean> {
	try {
		await change();
		return true;
	} catch (error) {
		if (isGoogleCalendarUnmanagedCalendarError(error)) return false;
		throw error;
	}
}
