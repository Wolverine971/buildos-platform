// apps/web/src/lib/server/gmail-relevance/config.ts

export const GMAIL_RELEVANCE_PHASE_A_ENABLED_ENV = 'GMAIL_RELEVANCE_PHASE_A_ENABLED';
export const GMAIL_RELEVANCE_PHASE_A_USER_IDS_ENV = 'GMAIL_RELEVANCE_PHASE_A_USER_IDS';
export const GMAIL_RELEVANCE_PHASE_A_REVIEW_ENABLED_ENV = 'GMAIL_RELEVANCE_PHASE_A_REVIEW_ENABLED';
export const GMAIL_RELEVANCE_PHASE_A_REVIEW_USER_IDS_ENV =
	'GMAIL_RELEVANCE_PHASE_A_REVIEW_USER_IDS';

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

/**
 * Slice 4 uses a separate default-off gate so enabling human review cannot make
 * the Slice 3 mailbox scan controls reachable again.
 */
export function isGmailRelevancePhaseAReviewUserAllowed(userId: string, source: EnvLike): boolean {
	const enabled = source[GMAIL_RELEVANCE_PHASE_A_REVIEW_ENABLED_ENV];
	if (!enabled || !['1', 'true', 'yes', 'on'].includes(enabled.trim().toLowerCase())) {
		return false;
	}
	const normalizedUserId = userId.trim();
	if (!normalizedUserId) return false;
	const allowlist = source[GMAIL_RELEVANCE_PHASE_A_REVIEW_USER_IDS_ENV];
	if (!allowlist) return false;
	return allowlist
		.split(',')
		.map((value) => value.trim())
		.filter((value) => value.length > 0 && value !== '*')
		.includes(normalizedUserId);
}
