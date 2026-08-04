// apps/web/src/lib/server/gmail-connection-health.test.ts
import { describe, expect, it, vi } from 'vitest';
import { GmailOAuthError } from './gmail-read-oauth.service';
import { checkGmailConnectionHealth } from './gmail-connection-health';

function queryResult(data: unknown[]) {
	const query: any = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		is: vi.fn(() => query),
		or: vi.fn(() => query),
		order: vi.fn(() => query),
		limit: vi.fn(() => query),
		in: vi.fn(() => query),
		then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
			Promise.resolve({ data, error: null }).then(resolve, reject)
	};
	return query;
}

describe('checkGmailConnectionHealth', () => {
	it('refreshes due accounts and counts revoked grants as reconnect-required', async () => {
		const credentials = queryResult([
			{
				connection_id: 'connection-1',
				access_token_expires_at: '2026-08-03T16:01:00.000Z',
				refresh_token_expires_at: null
			},
			{
				connection_id: 'connection-2',
				access_token_expires_at: '2026-08-03T17:02:00.000Z',
				refresh_token_expires_at: '2026-08-03T15:59:59.000Z'
			}
		]);
		const connections = queryResult([
			{ id: 'connection-1', user_id: 'user-1' },
			{ id: 'connection-2', user_id: 'user-2' }
		]);
		const admin = {
			from: vi.fn((table: string) =>
				table === 'email_connection_credentials' ? credentials : connections
			)
		} as any;
		const oauthService = {
			getAuthorizedReadAccessToken: vi
				.fn()
				.mockResolvedValueOnce('fresh-token')
				.mockRejectedValueOnce(
					new GmailOAuthError('reconnect_required', 'Reconnect required')
				)
		};

		const result = await checkGmailConnectionHealth(admin, {
			now: new Date('2026-08-03T16:00:00.000Z'),
			oauthService
		});

		expect(result).toEqual({
			candidates: 2,
			checked: 2,
			refreshed: 1,
			reconnectRequired: 1,
			transientFailures: 0,
			hasMore: false
		});
		expect(oauthService.getAuthorizedReadAccessToken).toHaveBeenCalledWith(
			'user-1',
			'connection-1',
			{ forceRefresh: true }
		);
		expect(oauthService.getAuthorizedReadAccessToken).toHaveBeenCalledWith(
			'user-2',
			'connection-2',
			{ forceRefresh: true }
		);
		expect(credentials.or).toHaveBeenCalledWith(
			'access_token_expires_at.is.null,access_token_expires_at.lte.2026-08-03T16:05:00.000Z,refresh_token_expires_at.lte.2026-08-03T16:00:00.000Z'
		);
	});
});
