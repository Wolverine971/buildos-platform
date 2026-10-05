// packages/shared-agent-ops/src/calendar/google-calendar-feature.ts
export const MULTI_CALENDAR_ENABLED_ENV = 'PRIVATE_MULTI_CALENDAR_CONNECTIONS_ENABLED';
export const MULTI_CALENDAR_USER_IDS_ENV = 'PRIVATE_MULTI_CALENDAR_CONNECTIONS_USER_IDS';
export const MULTI_CALENDAR_ALL_USERS_ENV = 'PRIVATE_MULTI_CALENDAR_CONNECTIONS_ALL_USERS';
export const MULTI_CALENDAR_EXCLUDED_USER_IDS_ENV =
	'PRIVATE_MULTI_CALENDAR_CONNECTIONS_EXCLUDED_USER_IDS';

type EnvLike = Record<string, string | undefined>;

function isEnabled(value: string | undefined): boolean {
	return Boolean(value && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase()));
}

function parseUserIds(value: string | undefined): string[] {
	return (value ?? '')
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0 && entry !== '*');
}

/**
 * Multi-account Calendar (dedicated Calendar OAuth client) is guarded by a server flag plus
 * either an exact-user allowlist or the explicit all-users switch. Wildcards are deliberately
 * ignored so an environment-variable typo cannot expose the flow to every user; rolling out to
 * everyone requires the separately named all-users switch.
 *
 * Under the all-users switch, the excluded list keeps users who still hold only a legacy
 * single-account grant on the legacy runtime until their grant is migrated. The exact allowlist
 * always wins over the exclusion so canary users never fall back.
 */
export function isMultiCalendarUserAllowed(userId: string, source: EnvLike): boolean {
	if (!isEnabled(source[MULTI_CALENDAR_ENABLED_ENV])) return false;
	const normalizedUserId = userId.trim();
	if (!normalizedUserId) return false;

	if (parseUserIds(source[MULTI_CALENDAR_USER_IDS_ENV]).includes(normalizedUserId)) return true;
	if (!isEnabled(source[MULTI_CALENDAR_ALL_USERS_ENV])) return false;

	return !parseUserIds(source[MULTI_CALENDAR_EXCLUDED_USER_IDS_ENV]).includes(normalizedUserId);
}
