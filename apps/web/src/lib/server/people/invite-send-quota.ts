// apps/web/src/lib/server/people/invite-send-quota.ts
/**
 * Limits on project invite emails. Invites go out from dj@build-os.com with user-chosen project
 * and inviter names, so without a limit any account could use them to send unlimited email to
 * any address (security audit 2026-11-05).
 *
 * The count comes from onto_project_invites itself, so it holds across server instances: a new
 * invite is a row created in the window, and a resend re-mints the row with expires_at set to
 * now + INVITE_EXPIRY_DAYS, so expires_at - INVITE_EXPIRY_DAYS is when it was last sent. The
 * inviter's own session can read the invites of projects they administer, which is enough.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const INVITE_EXPIRY_DAYS = 7;
export const INVITE_SENDS_PER_DAY = 30;
export const INVITE_RESEND_COOLDOWN_MINUTES = 60;

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_MS = INVITE_EXPIRY_DAYS * DAY_MS;

export type InviteSendDecision =
	| { ok: true }
	| { ok: false; message: string; retryAfterSeconds: number };

/** When this invite's email last went out, from its current expiry. */
export function lastInviteSendAt(expiresAt: string): number {
	return new Date(expiresAt).getTime() - EXPIRY_MS;
}

/** A resend of the same invite waits an hour after the last send. */
export function checkInviteResendCooldown(
	expiresAt: string,
	now: number = Date.now()
): InviteSendDecision {
	const readyAt = lastInviteSendAt(expiresAt) + INVITE_RESEND_COOLDOWN_MINUTES * 60 * 1000;
	if (Number.isFinite(readyAt) && readyAt > now) {
		return {
			ok: false,
			message: 'This invite was sent in the last hour. Try again later.',
			retryAfterSeconds: Math.ceil((readyAt - now) / 1000)
		};
	}
	return { ok: true };
}

/** At most INVITE_SENDS_PER_DAY invite emails (new or resent) per inviter in 24 hours. */
export async function checkInviteDailyQuota(
	client: SupabaseClient,
	actorId: string,
	now: number = Date.now()
): Promise<InviteSendDecision> {
	const since = new Date(now - DAY_MS).toISOString();
	const resentSince = new Date(now - DAY_MS + EXPIRY_MS).toISOString();
	const { count, error } = await client
		.from('onto_project_invites')
		.select('id', { count: 'exact', head: true })
		.eq('invited_by_actor_id', actorId)
		.or(`created_at.gte.${since},expires_at.gte.${resentSince}`);
	if (error) throw error;
	if ((count ?? 0) >= INVITE_SENDS_PER_DAY) {
		return {
			ok: false,
			message: `You've sent ${INVITE_SENDS_PER_DAY} invites in the last day. Try again tomorrow.`,
			retryAfterSeconds: 60 * 60
		};
	}
	return { ok: true };
}
