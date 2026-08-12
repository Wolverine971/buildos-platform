// apps/web/src/lib/services/gmail-oauth.client.test.ts
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	GMAIL_OAUTH_COMPLETE_MESSAGE,
	gmailOAuthErrorMessage,
	startGmailOAuth
} from './gmail-oauth.client';

function apiResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify({ success: status < 400, data }), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('startGmailOAuth', () => {
	it('resolves only after popup completion and server-side connection verification', async () => {
		const assign = vi.fn();
		const popup = {
			document: { title: '', body: { textContent: '' } },
			location: { assign },
			closed: false,
			close: vi.fn(function (this: { closed: boolean }) {
				this.closed = true;
			})
		};
		vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				apiResponse({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth' })
			)
			.mockResolvedValueOnce(
				apiResponse({
					available: true,
					maxConnections: 5,
					readOnly: true,
					connections: [
						{
							id: '11111111-1111-4111-8111-111111111111',
							emailAddress: 'work@example.com',
							displayName: 'DJ Wayne',
							accountLabel: 'Work',
							status: 'active',
							readEnabled: true,
							connectedAt: '2026-08-03T16:00:00.000Z',
							lastVerifiedAt: '2026-08-03T16:01:00.000Z',
							lastUsedAt: null,
							capabilities: [{ capability: 'read', status: 'enabled' }]
						}
					]
				})
			);
		vi.stubGlobal('fetch', fetchMock);

		const completion = startGmailOAuth({
			connectionId: '11111111-1111-4111-8111-111111111111',
			emailAddress: 'work@example.com'
		});
		await vi.waitFor(() => expect(assign).toHaveBeenCalledOnce());
		expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
			method: 'POST',
			body: JSON.stringify({
				connectionId: '11111111-1111-4111-8111-111111111111',
				emailAddress: 'work@example.com',
				redirectPath: '/auth/google/gmail-read/complete'
			})
		});

		window.dispatchEvent(
			new MessageEvent('message', {
				origin: window.location.origin,
				source: popup as unknown as MessageEventSource,
				data: {
					type: GMAIL_OAUTH_COMPLETE_MESSAGE,
					success: true,
					connectionId: '11111111-1111-4111-8111-111111111111',
					error: null
				}
			})
		);

		await expect(completion).resolves.toEqual(
			expect.objectContaining({
				id: '11111111-1111-4111-8111-111111111111',
				status: 'active',
				readEnabled: true
			})
		);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(popup.close).toHaveBeenCalledOnce();
	});

	it('maps scope mismatch to a user-facing recovery message', () => {
		expect(gmailOAuthErrorMessage('scope_mismatch')).toBe(
			'Google did not return the required read-only permission'
		);
	});
});
