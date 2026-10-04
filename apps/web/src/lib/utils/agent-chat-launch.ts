// apps/web/src/lib/utils/agent-chat-launch.ts
import { normalizeRedirectPath } from '$lib/utils/auth-redirect';

/**
 * Public "Try in BuildOS" links send people to `/?open=agent-chat&skill=<id>&prompt=<draft>`
 * (signed-out visitors get there through `/auth/register?redirect=...`). Navigation opens chat
 * with the draft on whatever page renders. These helpers let the server keep that launch alive
 * through signup and onboarding, and tag signups that started from one.
 */

const PLACEHOLDER_ORIGIN = 'https://buildos.invalid';
// Structured runtime skill id (`cold_email_offer_lab`, `parent.child`), never free text.
const SKILL_ID_PATTERN = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)*$/;
const MAX_SKILL_ID_LENGTH = 80;

export const SKILL_SIGNUP_SOURCE_PREFIX = 'skill:';

/**
 * True when the URL asks Navigation to open chat with something to say: `open=agent-chat` plus a
 * prompt or a skill (the same condition Navigation needs before it opens anything). A bare
 * `open=agent-chat` opens nothing, so it doesn't count.
 */
export function isAgentChatLaunch(params: URLSearchParams): boolean {
	if (params.get('open') !== 'agent-chat') return false;
	return Boolean(params.get('prompt')?.trim() || params.get('skill')?.trim());
}

/** The skill id when it has the runtime id shape; null for anything else. */
export function normalizeLaunchSkillId(value: string | null | undefined): string | null {
	const trimmed = value?.trim();
	if (!trimmed || trimmed.length > MAX_SKILL_ID_LENGTH) return null;
	return SKILL_ID_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * The skill a post-signup redirect launches, or null. Only same-origin relative paths count
 * (the same `normalizeRedirectPath` gate every auth redirect passes through).
 */
export function launchSkillIdFromRedirect(
	redirectTarget: string | null | undefined
): string | null {
	const safePath = normalizeRedirectPath(redirectTarget);
	if (!safePath) return null;
	const params = new URL(safePath, PLACEHOLDER_ORIGIN).searchParams;
	if (params.get('open') !== 'agent-chat') return null;
	return normalizeLaunchSkillId(params.get('skill'));
}

/** `users.signup_source` value for a signup that started from a skill's Try link. */
export function skillSignupSource(skillId: string): string {
	return `${SKILL_SIGNUP_SOURCE_PREFIX}${skillId}`;
}
