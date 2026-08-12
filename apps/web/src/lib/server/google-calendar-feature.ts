// apps/web/src/lib/server/google-calendar-feature.ts
export const MULTI_CALENDAR_ENABLED_ENV = 'PRIVATE_MULTI_CALENDAR_CONNECTIONS_ENABLED';
export const MULTI_CALENDAR_USER_IDS_ENV = 'PRIVATE_MULTI_CALENDAR_CONNECTIONS_USER_IDS';

type EnvLike = Record<string, string | undefined>;

function isEnabled(value: string | undefined): boolean {
	return Boolean(value && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase()));
}

/**
 * Multi-account Calendar is guarded by both a server flag and an exact-user allowlist.
 * Wildcards are deliberately ignored so an environment-variable mistake cannot expose the
 * connection flow to every user before source-aware runtime paths are complete.
 */
export function isMultiCalendarUserAllowed(userId: string, source: EnvLike): boolean {
	if (!isEnabled(source[MULTI_CALENDAR_ENABLED_ENV])) return false;
	const normalizedUserId = userId.trim();
	if (!normalizedUserId) return false;

	const rawAllowlist = source[MULTI_CALENDAR_USER_IDS_ENV];
	if (!rawAllowlist) return false;

	return rawAllowlist
		.split(',')
		.map((value) => value.trim())
		.filter((value) => value.length > 0 && value !== '*')
		.includes(normalizedUserId);
}
