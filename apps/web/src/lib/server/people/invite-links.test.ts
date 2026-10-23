// apps/web/src/lib/server/people/invite-links.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: { PRIVATE_SUPABASE_SERVICE_KEY: 'test-secret' } }));
vi.mock('$env/static/public', () => ({ PUBLIC_APP_URL: 'https://build-os.com' }));
vi.mock('$app/environment', () => ({ dev: false }));

import {
	deriveInviteLinkToken,
	hashInviteToken,
	INVITE_LINK_TOKEN_SHAPE,
	inviteLinkForOwner,
	newInviteLink,
	readInviteLinkDays,
	readInviteLinkPreview,
	readInviteLinkSettings
} from './invite-links';

const LINK_ID = '22222222-2222-4222-8222-222222222222';

describe('invite link tokens', () => {
	it('derives the same 32-character token for a link, and a different one per link or secret', () => {
		const token = deriveInviteLinkToken(LINK_ID, 'secret-a');
		expect(token).toMatch(INVITE_LINK_TOKEN_SHAPE);
		expect(deriveInviteLinkToken(LINK_ID, 'secret-a')).toBe(token);
		expect(deriveInviteLinkToken(LINK_ID, 'secret-b')).not.toBe(token);
		expect(deriveInviteLinkToken('33333333-3333-4333-8333-333333333333', 'secret-a')).not.toBe(
			token
		);
	});

	it('refuses to make tokens without the server secret', () => {
		expect(() => deriveInviteLinkToken(LINK_ID, '')).toThrow();
	});

	it('makes a new link whose stored hash matches its token', () => {
		const link = newInviteLink();
		expect(link.token).toBe(deriveInviteLinkToken(link.id));
		expect(link.tokenHash).toBe(hashInviteToken(link.token));
		expect(link.tokenHash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('gives the owner a /join URL rebuilt from the id', () => {
		const settings = readInviteLinkSettings({
			id: LINK_ID,
			role_key: 'editor',
			agent_access: 'write',
			expires_at: '2026-10-30T12:00:00.000Z',
			join_count: 3
		});
		expect(settings).not.toBeNull();
		const owner = inviteLinkForOwner(settings!, 'https://build-os.com');
		expect(owner.url).toBe(`https://build-os.com/join/${deriveInviteLinkToken(LINK_ID)}`);
		expect(owner).toMatchObject({ role_key: 'editor', agent_access: 'write', join_count: 3 });
	});
});

describe('readers', () => {
	it('accepts 1 to 30 whole days only', () => {
		expect(readInviteLinkDays(7)).toBe(7);
		expect(readInviteLinkDays('30')).toBe(30);
		expect(readInviteLinkDays(0)).toBeNull();
		expect(readInviteLinkDays(31)).toBeNull();
		expect(readInviteLinkDays(1.5)).toBeNull();
		expect(readInviteLinkDays('soon')).toBeNull();
	});

	it('reads previews and treats anything odd as not found', () => {
		expect(readInviteLinkPreview({ status: 'reset' })).toEqual({ status: 'reset' });
		expect(readInviteLinkPreview({ status: 'active' })).toEqual({ status: 'not_found' });
		expect(readInviteLinkPreview(null)).toEqual({ status: 'not_found' });
		expect(
			readInviteLinkPreview({
				status: 'active',
				project_name: '9takes',
				inviter_name: '  ',
				role_key: 'admin',
				agent_access: 'everything'
			})
		).toMatchObject({
			status: 'active',
			project_name: '9takes',
			inviter_name: null,
			role_key: 'viewer',
			agent_access: 'read',
			already_member: false
		});
	});
});
