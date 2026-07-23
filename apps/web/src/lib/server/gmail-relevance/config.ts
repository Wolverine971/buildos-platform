// apps/web/src/lib/server/gmail-relevance/config.ts

export const GMAIL_RELEVANCE_PHASE_A_ENABLED_ENV = 'GMAIL_RELEVANCE_PHASE_A_ENABLED';
export const GMAIL_RELEVANCE_PHASE_A_USER_IDS_ENV = 'GMAIL_RELEVANCE_PHASE_A_USER_IDS';

type EnvLike = Record<string, string | undefined>;

export function isGmailRelevancePhaseAEnabled(source: EnvLike): boolean {
	const raw = source[GMAIL_RELEVANCE_PHASE_A_ENABLED_ENV];
	if (!raw) return false;
	return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

/**
 * Phase A is both globally disabled by default and exact-user allowlisted.
 * Wildcards are intentionally unsupported so a deployment flag alone cannot
 * expose mailbox-derived work to every user.
 */
export function isGmailRelevancePhaseAUserAllowed(userId: string, source: EnvLike): boolean {
	if (!isGmailRelevancePhaseAEnabled(source)) return false;
	const normalizedUserId = userId.trim();
	if (!normalizedUserId) return false;

	const rawAllowlist = source[GMAIL_RELEVANCE_PHASE_A_USER_IDS_ENV];
	if (!rawAllowlist) return false;

	return rawAllowlist
		.split(',')
		.map((value) => value.trim())
		.filter((value) => value.length > 0 && value !== '*')
		.includes(normalizedUserId);
}
