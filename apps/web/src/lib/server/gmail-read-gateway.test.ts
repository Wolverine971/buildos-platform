// apps/web/src/lib/server/gmail-read-gateway.test.ts
import { describe, expect, it, vi } from 'vitest';
import { GmailReadGateway, GmailReadGatewayError } from './gmail-read-gateway';

type Connection = {
	id: string;
	email_address: string;
	account_label: string;
	status: 'active' | 'reconnect_required' | 'disabled' | 'error';
	read_enabled: boolean;
};

function createAdmin(connections: Connection[]) {
	const auditInsert = vi.fn().mockResolvedValue({ error: null });
	const connectionQuery: any = {
		select: vi.fn(() => connectionQuery),
		eq: vi.fn(() => connectionQuery),
		in: vi.fn(() => connectionQuery),
		is: vi.fn(() => connectionQuery),
		then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
			Promise.resolve({ data: connections, error: null }).then(resolve, reject)
	};
	const admin = {
		from: vi.fn((table: string) =>
			table === 'email_access_audit_events' ? { insert: auditInsert } : connectionQuery
		)
	} as any;
	return { admin, auditInsert };
}

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(value), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
		...init
	});
}

function metadataMessage(id: string, threadId: string, timestamp: number) {
	return {
		id,
		threadId,
		internalDate: String(timestamp),
		snippet: '<b>Safe</b> preview',
		payload: {
			headers: [
				{ name: 'From', value: 'Sender <sender@example.com>' },
				{ name: 'Subject', value: `Subject ${id}` }
			]
		}
	};
}

describe('GmailReadGateway', () => {
	it('rejects a connection that does not belong to the authenticated user before Google is called', async () => {
		const { admin } = createAdmin([]);
		const oauthService = { getAuthorizedReadAccessToken: vi.fn() };
		const providerFetch = vi.fn();
		const gateway = new GmailReadGateway(admin, { oauthService, providerFetch });

		await expect(
			gateway.searchMessages({
				userId: 'user-1',
				connectionIds: ['11111111-1111-4111-8111-111111111111'],
				query: 'from:trusted@example.com'
			})
		).rejects.toMatchObject<GmailReadGatewayError>({ code: 'connection_not_found' });
		expect(oauthService.getAuthorizedReadAccessToken).not.toHaveBeenCalled();
		expect(providerFetch).not.toHaveBeenCalled();
	});

	it('searches multiple accounts with visible provenance and tolerates a reconnect-required account', async () => {
		const activeId = '11111111-1111-4111-8111-111111111111';
		const reconnectId = '22222222-2222-4222-8222-222222222222';
		const { admin, auditInsert } = createAdmin([
			{
				id: activeId,
				email_address: 'buildos@example.com',
				account_label: 'BuildOS',
				status: 'active',
				read_enabled: true
			},
			{
				id: reconnectId,
				email_address: 'cadre@example.com',
				account_label: 'Cadre',
				status: 'reconnect_required',
				read_enabled: true
			}
		]);
		const oauthService = {
			getAuthorizedReadAccessToken: vi.fn().mockResolvedValue('read-access-token')
		};
		const providerFetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
			const url = new URL(String(input));
			expect(url.origin).toBe('https://gmail.googleapis.com');
			expect(init?.method).toBe('GET');
			if (url.pathname.endsWith('/messages')) {
				return jsonResponse({ messages: [{ id: 'm1', threadId: 't1' }] });
			}
			return jsonResponse(metadataMessage('m1', 't1', 1_754_000_000_000));
		});
		const gateway = new GmailReadGateway(admin, {
			oauthService,
			providerFetch,
			now: () => new Date('2026-07-22T18:00:00.000Z')
		});

		const result = await gateway.searchMessages({
			userId: 'user-1',
			connectionIds: [activeId, reconnectId],
			query: 'newer_than:7d',
			maxResults: 10
		});

		expect(result.readOnly).toBe(true);
		expect(result.messages).toEqual([
			expect.objectContaining({
				connectionId: activeId,
				accountLabel: 'BuildOS',
				emailAddress: 'buildos@example.com',
				messageId: 'm1',
				snippet: 'Safe preview'
			})
		]);
		expect(result.accounts).toEqual([
			expect.objectContaining({ connectionId: activeId, status: 'success', messageCount: 1 }),
			expect.objectContaining({
				connectionId: reconnectId,
				status: 'reconnect_required',
				messageCount: 0
			})
		]);
		expect(oauthService.getAuthorizedReadAccessToken).toHaveBeenCalledOnce();
		expect(auditInsert).toHaveBeenCalledWith(
			expect.objectContaining({
				operation: 'gmail.messages.search',
				metadata: { resultCount: 1, hasMore: false, page: 0 }
			})
		);
	});

	it('treats a successful list response with no selected fields as an empty result', async () => {
		const connectionId = '11111111-1111-4111-8111-111111111111';
		const { admin, auditInsert } = createAdmin([
			{
				id: connectionId,
				email_address: 'buildos@example.com',
				account_label: 'BuildOS',
				status: 'active',
				read_enabled: true
			}
		]);
		const gateway = new GmailReadGateway(admin, {
			oauthService: { getAuthorizedReadAccessToken: vi.fn().mockResolvedValue('token') },
			providerFetch: vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
			now: () => new Date('2026-07-22T18:00:00.000Z')
		});

		const result = await gateway.searchMessages({
			userId: 'user-1',
			connectionIds: [connectionId],
			query: 'after:2099/01/01'
		});

		expect(result.messages).toEqual([]);
		expect(result.accounts).toEqual([
			expect.objectContaining({ connectionId, status: 'success', messageCount: 0 })
		]);
		expect(auditInsert).toHaveBeenCalledWith(
			expect.objectContaining({
				operation: 'gmail.messages.search',
				outcome: 'success',
				metadata: { resultCount: 0, hasMore: false, page: 0 }
			})
		);
	});

	it('continues one account with a bound cursor and returns only the next account cursor', async () => {
		const connectionId = '11111111-1111-4111-8111-111111111111';
		const { admin, auditInsert } = createAdmin([
			{
				id: connectionId,
				email_address: 'buildos@example.com',
				account_label: 'BuildOS',
				status: 'active',
				read_enabled: true
			}
		]);
		const consume = vi.fn().mockReturnValue({ pageToken: 'provider-page-2', page: 1 });
		const issue = vi.fn().mockReturnValue('encrypted-page-3');
		const providerFetch = vi.fn(async (input: URL | RequestInfo) => {
			const url = new URL(String(input));
			if (url.pathname.endsWith('/messages')) {
				expect(url.searchParams.get('pageToken')).toBe('provider-page-2');
				return jsonResponse({
					messages: [{ id: 'm2', threadId: 't2' }],
					nextPageToken: 'provider-page-3'
				});
			}
			return jsonResponse(metadataMessage('m2', 't2', 1_754_000_000_000));
		});
		const gateway = new GmailReadGateway(admin, {
			oauthService: { getAuthorizedReadAccessToken: vi.fn().mockResolvedValue('token') },
			providerFetch,
			cursorCodec: { consume, issue } as any,
			now: () => new Date('2026-07-22T20:00:00.000Z')
		});

		const result = await gateway.searchMessages({
			userId: 'user-1',
			connectionIds: [connectionId],
			query: 'newer_than:7d',
			cursor: 'encrypted-page-2'
		});

		expect(consume).toHaveBeenCalledWith(
			expect.objectContaining({
				cursor: 'encrypted-page-2',
				userId: 'user-1',
				connectionId,
				query: 'newer_than:7d'
			})
		);
		expect(issue).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				connectionId,
				query: 'newer_than:7d',
				pageToken: 'provider-page-3',
				page: 2
			})
		);
		expect(result.accounts).toEqual([
			expect.objectContaining({
				connectionId,
				messageCount: 1,
				hasMore: true,
				nextCursor: 'encrypted-page-3'
			})
		]);
		expect(auditInsert).toHaveBeenCalledWith(
			expect.objectContaining({
				operation: 'gmail.messages.search',
				metadata: { resultCount: 1, hasMore: true, page: 1 }
			})
		);
	});

	it('blocks an invalid account cursor before requesting an access token or calling Google', async () => {
		const connectionId = '11111111-1111-4111-8111-111111111111';
		const { admin, auditInsert } = createAdmin([
			{
				id: connectionId,
				email_address: 'buildos@example.com',
				account_label: 'BuildOS',
				status: 'active',
				read_enabled: true
			}
		]);
		const oauthService = { getAuthorizedReadAccessToken: vi.fn() };
		const providerFetch = vi.fn();
		const gateway = new GmailReadGateway(admin, {
			oauthService,
			providerFetch,
			cursorCodec: {
				consume: vi.fn(() => {
					throw new Error('invalid cursor');
				}),
				issue: vi.fn()
			} as any
		});

		await expect(
			gateway.searchMessages({
				userId: 'user-1',
				connectionIds: [connectionId],
				query: 'newer_than:7d',
				cursor: 'forged-cursor'
			})
		).rejects.toMatchObject<GmailReadGatewayError>({ code: 'invalid_request' });
		expect(oauthService.getAuthorizedReadAccessToken).not.toHaveBeenCalled();
		expect(providerFetch).not.toHaveBeenCalled();
		expect(auditInsert).toHaveBeenCalledWith(
			expect.objectContaining({
				connection_id: connectionId,
				operation: 'gmail.messages.paginate',
				outcome: 'blocked',
				reason_code: 'invalid_cursor'
			})
		);
	});

	it('returns only sanitized plain text, never provider HTML or attachment content', async () => {
		const connectionId = '11111111-1111-4111-8111-111111111111';
		const { admin, auditInsert } = createAdmin([
			{
				id: connectionId,
				email_address: 'buildos@example.com',
				account_label: 'BuildOS',
				status: 'active',
				read_enabled: true
			}
		]);
		const html = [
			'<style>.hidden{display:none}</style>',
			'<script>stealSecrets()</script>',
			'<p>Hello <strong>DJ</strong></p>',
			'<img src="https://tracker.example/pixel.gif">',
			'<form action="https://evil.example"><input value="send"></form>'
		].join('');
		const providerFetch = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
			expect(init?.method).toBe('GET');
			return jsonResponse({
				id: 'm1',
				threadId: 't1',
				internalDate: '1754000000000',
				snippet: 'Hello DJ',
				payload: {
					mimeType: 'multipart/mixed',
					headers: [
						{ name: 'From', value: 'Sender <sender@example.com>' },
						{ name: 'To', value: 'DJ <buildos@example.com>' },
						{ name: 'Subject', value: 'Safe message' }
					],
					parts: [
						{
							mimeType: 'text/html',
							body: { data: Buffer.from(html).toString('base64url') }
						},
						{
							mimeType: 'application/pdf',
							filename: 'private.pdf',
							body: { attachmentId: 'attachment-1', size: 999 }
						}
					]
				}
			});
		});
		const gateway = new GmailReadGateway(admin, {
			oauthService: { getAuthorizedReadAccessToken: vi.fn().mockResolvedValue('token') },
			providerFetch,
			now: () => new Date('2026-07-22T18:00:00.000Z')
		});

		const result = await gateway.getMessage({
			userId: 'user-1',
			connectionId,
			messageId: 'm1'
		});

		expect(result.readOnly).toBe(true);
		expect(result.bodyText).toContain('Hello DJ');
		expect(result.bodyText).not.toContain('<');
		expect(result.bodyText).not.toContain('stealSecrets');
		expect(result.bodyText).not.toContain('tracker.example');
		expect(result.hasUnsupportedAttachments).toBe(true);
		expect(auditInsert).toHaveBeenCalledWith(
			expect.objectContaining({
				operation: 'gmail.messages.get',
				metadata: expect.objectContaining({ hasUnsupportedAttachments: true })
			})
		);
	});

	it('rejects an oversized provider response before parsing message content', async () => {
		const connectionId = '11111111-1111-4111-8111-111111111111';
		const { admin } = createAdmin([
			{
				id: connectionId,
				email_address: 'buildos@example.com',
				account_label: 'BuildOS',
				status: 'active',
				read_enabled: true
			}
		]);
		const providerFetch = vi.fn().mockResolvedValue(
			new Response('{}', {
				status: 200,
				headers: { 'Content-Length': String(3 * 1024 * 1024) }
			})
		);
		const gateway = new GmailReadGateway(admin, {
			oauthService: { getAuthorizedReadAccessToken: vi.fn().mockResolvedValue('token') },
			providerFetch
		});

		await expect(
			gateway.getMessage({ userId: 'user-1', connectionId, messageId: 'm1' })
		).rejects.toMatchObject<GmailReadGatewayError>({ code: 'provider_response_too_large' });
	});
});
