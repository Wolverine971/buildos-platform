// apps/web/src/lib/utils/auth-profile.test.ts
import { describe, expect, it } from 'vitest';
import { getAuthUserCreatedAt, inferAuthUserJustCreated } from '$lib/utils/auth-profile';

describe('auth-profile utilities', () => {
	it('preserves the auth account creation timestamp for repaired public profiles', () => {
		expect(
			getAuthUserCreatedAt({
				created_at: '2026-04-07T14:53:16.030Z'
			} as any)
		).toBe('2026-04-07T14:53:16.030Z');
	});

	it('treats a first-time auth callback as a new user when auth timestamps match', () => {
		expect(
			inferAuthUserJustCreated({
				app_metadata: { provider: 'google' },
				created_at: '2026-04-07T14:53:16.030Z',
				last_sign_in_at: '2026-04-07T14:53:16.900Z',
				identities: [
					{
						provider: 'google',
						created_at: '2026-04-07T14:53:16.030Z',
						last_sign_in_at: '2026-04-07T14:53:16.900Z'
					}
				]
			} as any)
		).toBe(true);
	});

	it('does not treat an existing auth account with a repaired public profile as a new user', () => {
		expect(
			inferAuthUserJustCreated({
				app_metadata: { provider: 'google' },
				created_at: '2026-04-01T09:00:00.000Z',
				last_sign_in_at: '2026-04-07T14:53:16.030Z',
				identities: [
					{
						provider: 'google',
						created_at: '2026-04-01T09:00:00.000Z',
						last_sign_in_at: '2026-04-07T14:53:16.030Z'
					}
				]
			} as any)
		).toBe(false);
	});
});
