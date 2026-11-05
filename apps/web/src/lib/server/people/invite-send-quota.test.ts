// apps/web/src/lib/server/people/invite-send-quota.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	INVITE_EXPIRY_DAYS,
	INVITE_SENDS_PER_DAY,
	checkInviteDailyQuota,
	checkInviteResendCooldown
} from './invite-send-quota';

const NOW = Date.parse('2026-11-05T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const expiryAfterSendAt = (sentAt: number) =>
	new Date(sentAt + INVITE_EXPIRY_DAYS * DAY).toISOString();

describe('checkInviteResendCooldown', () => {
	it('refuses a resend within the hour after the last send', () => {
		const decision = checkInviteResendCooldown(expiryAfterSendAt(NOW - 5 * 60 * 1000), NOW);
		expect(decision.ok).toBe(false);
		if (!decision.ok) expect(decision.retryAfterSeconds).toBe(55 * 60);
	});

	it('allows a resend an hour later', () => {
		expect(checkInviteResendCooldown(expiryAfterSendAt(NOW - 61 * 60 * 1000), NOW).ok).toBe(
			true
		);
	});
});

describe('checkInviteDailyQuota', () => {
	function admin(count: number) {
		const query = {
			select: vi.fn(() => query),
			eq: vi.fn(() => query),
			or: vi.fn(async () => ({ count, error: null }))
		};
		return { client: { from: vi.fn(() => query) } as any, query };
	}

	it('counts new and re-sent invites by this inviter in the last 24 hours', async () => {
		const { client, query } = admin(3);
		expect((await checkInviteDailyQuota(client, 'actor-1', NOW)).ok).toBe(true);
		expect(query.eq).toHaveBeenCalledWith('invited_by_actor_id', 'actor-1');
		expect(query.or).toHaveBeenCalledWith(
			`created_at.gte.${new Date(NOW - DAY).toISOString()},expires_at.gte.${new Date(NOW - DAY + INVITE_EXPIRY_DAYS * DAY).toISOString()}`
		);
	});

	it('refuses at the daily limit', async () => {
		const { client } = admin(INVITE_SENDS_PER_DAY);
		expect((await checkInviteDailyQuota(client, 'actor-1', NOW)).ok).toBe(false);
	});
});
