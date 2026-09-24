// packages/shared-agent-ops/src/email/gmail-read-gateway.test.ts
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

	it('force-refreshes once when Gmail rejects an otherwise unexpired access token', async () => {
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
		const oauthService = {
			getAuthorizedReadAccessToken: vi
				.fn()
				.mockResolvedValueOnce('stale-token')
				.mockResolvedValue('refreshed-token')
		};
		const providerFetch = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ error: 'invalidCredentials' }, { status: 401 }))
			.mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'm1', threadId: 't1' }] }))
			.mockResolvedValueOnce(jsonResponse(metadataMessage('m1', 't1', 1_754_000_000_000)));
		const gateway = new GmailReadGateway(admin, { oauthService, providerFetch });

		const result = await gateway.searchMessages({
			userId: 'user-1',
			connectionIds: [connectionId],
			query: 'newer_than:7d'
		});

		expect(result.accounts[0]).toEqual(
			expect.objectContaining({ status: 'success', messageCount: 1 })
		);
		expect(oauthService.getAuthorizedReadAccessToken).toHaveBeenNthCalledWith(
			2,
			'user-1',
			connectionId,
			{ forceRefresh: true }
		);
		expect(providerFetch).toHaveBeenCalledTimes(3);
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

	it('removes invisible format padding from provider headers and snippets', async () => {
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
		const providerFetch = vi.fn(async (input: URL | RequestInfo) => {
			if (String(input).includes('/messages?')) {
				return jsonResponse({ messages: [{ id: 'm1', threadId: 't1' }] });
			}
			return jsonResponse({
				id: 'm1',
				threadId: 't1',
				internalDate: '1754000000000',
				snippet: `Payment failed${'\u200c'.repeat(200)} please update`,
				payload: {
					headers: [
						{
							name: 'From',
							value: `Sender${'\u200b'.repeat(100)} <sender@example.com>`
						},
						{ name: 'Subject', value: `Invoice${'\u2060'.repeat(100)} update` }
					]
				}
			});
		});
		const gateway = new GmailReadGateway(admin, {
			oauthService: { getAuthorizedReadAccessToken: vi.fn().mockResolvedValue('token') },
			providerFetch,
			now: () => new Date('2026-07-22T18:00:00.000Z')
		});

		const result = await gateway.searchMessages({
			userId: 'user-1',
			connectionIds: [connectionId],
			query: 'newer_than:1d',
			maxResults: 1
		});

		expect(result.messages[0]).toMatchObject({
			subject: 'Invoice update',
			from: 'Sender <sender@example.com>',
			snippet: 'Payment failed please update'
		});
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

describe('GmailReadGateway.scanInboxWindow', () => {
	const connectionId = '11111111-1111-4111-8111-111111111111';
	const activeConnection: Connection = {
		id: connectionId,
		email_address: 'dj@example.com',
		account_label: 'DJ',
		status: 'active',
		read_enabled: true
	};

	function scanMessage(id: string) {
		return {
			...metadataMessage(id, `t-${id}`, 1_758_700_000_000),
			labelIds: ['INBOX', 'CATEGORY_PERSONAL'],
			payload: {
				headers: [
					{ name: 'From', value: 'Sender <sender@example.com>' },
					{ name: 'To', value: 'dj@example.com' },
					{ name: 'Subject', value: `Subject ${id}` }
				]
			}
		};
	}

	/** Message ids requested by one Gmail batch body, in order. */
	function batchedIds(init?: RequestInit): string[] {
		return [
			...String(init?.body).matchAll(/GET \/gmail\/v1\/users\/me\/messages\/([^?]+)\?/g)
		].map((match) => match[1]!);
	}

	function multipartResponse(
		parts: Array<{ contentId: string; status: number; body: string }>
	): Response {
		const boundary = 'batch_test_boundary';
		const body =
			parts
				.map((part) =>
					[
						`--${boundary}`,
						'Content-Type: application/http',
						`Content-ID: <response-${part.contentId}>`,
						'',
						`HTTP/1.1 ${part.status} STATUS`,
						'Content-Type: application/json; charset=UTF-8',
						'',
						part.body,
						''
					].join('\r\n')
				)
				.join('') + `--${boundary}--\r\n`;
		return new Response(body, {
			status: 200,
			headers: { 'Content-Type': `multipart/mixed; boundary=${boundary}` }
		});
	}

	function scanFetch(options: {
		listed: string[];
		nextPageToken?: string;
		/** Items that fail inside a batch and again when read singly. */
		failIds?: string[];
		/** Per-item status inside a batch only; single reads succeed. */
		batchItemStatus?: Record<string, number>;
		/** Status for every batch request as a whole. */
		batchStatus?: number;
	}) {
		return vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
			const url = new URL(String(input));
			if (url.pathname === '/batch/gmail/v1') {
				if (options.batchStatus) return new Response('{}', { status: options.batchStatus });
				return multipartResponse(
					batchedIds(init).map((id, index) => {
						const status = options.failIds?.includes(id)
							? 500
							: (options.batchItemStatus?.[id] ?? 200);
						return {
							contentId: `m${index}`,
							status,
							body: status === 200 ? JSON.stringify(scanMessage(id)) : '{}'
						};
					})
				);
			}
			if (url.pathname.endsWith('/messages')) {
				return jsonResponse({
					messages: options.listed.map((id) => ({ id, threadId: `t-${id}` })),
					...(options.nextPageToken ? { nextPageToken: options.nextPageToken } : {})
				});
			}
			const id = url.pathname.split('/').pop()!;
			if (options.failIds?.includes(id)) return new Response('{}', { status: 500 });
			return jsonResponse(scanMessage(id));
		});
	}

	function scanParams() {
		return {
			userId: 'user-1',
			connectionId,
			afterEpochSeconds: 1,
			beforeEpochSeconds: 2,
			maxResults: 200
		};
	}

	it('builds the Gmail query from the window bounds only and fetches only unskipped messages', async () => {
		const { admin, auditInsert } = createAdmin([activeConnection]);
		const oauthService = { getAuthorizedReadAccessToken: vi.fn().mockResolvedValue('token') };
		const providerFetch = scanFetch({ listed: ['m1', 'm2', 'm3'], nextPageToken: 'more' });
		const gateway = new GmailReadGateway(admin, { oauthService, providerFetch });
		const skipFetch = vi.fn(async () => new Set(['m2']));

		const result = await gateway.scanInboxWindow({
			userId: 'user-1',
			connectionId,
			afterEpochSeconds: 1_758_672_000,
			beforeEpochSeconds: 1_758_758_400,
			maxResults: 100,
			skipFetch
		});

		const listUrl = new URL(String(providerFetch.mock.calls[0]![0]));
		expect(listUrl.searchParams.get('q')).toBe('in:inbox after:1758672000 before:1758758400');
		expect(listUrl.searchParams.get('maxResults')).toBe('100');
		expect(skipFetch).toHaveBeenCalledWith(['m1', 'm2', 'm3']);
		expect(providerFetch).toHaveBeenCalledTimes(2); // list + one batch
		expect(batchedIds(providerFetch.mock.calls[1]![1])).toEqual(['m1', 'm3']);
		expect(result.account.status).toBe('success');
		expect(result.listedMessageIds).toEqual(['m1', 'm2', 'm3']);
		expect(result.truncated).toBe(true);
		expect(result.messages.map((message) => message.messageId)).toEqual(['m1', 'm3']);
		expect(result.messages[0]).toMatchObject({
			to: 'dj@example.com',
			labelIds: ['INBOX', 'CATEGORY_PERSONAL'],
			snippet: 'Safe preview'
		});
		expect(oauthService.getAuthorizedReadAccessToken).toHaveBeenCalledOnce();
		expect(auditInsert).toHaveBeenCalledWith(
			expect.objectContaining({
				operation: 'gmail.messages.scan',
				outcome: 'success',
				metadata: expect.objectContaining({
					listedCount: 3,
					fetchedCount: 2,
					skippedCount: 1
				})
			})
		);
	});

	it('drops a message whose read fails instead of failing the account', async () => {
		const { admin } = createAdmin([activeConnection]);
		const oauthService = { getAuthorizedReadAccessToken: vi.fn().mockResolvedValue('token') };
		const gateway = new GmailReadGateway(admin, {
			oauthService,
			providerFetch: scanFetch({ listed: ['m1', 'm2'], failIds: ['m2'] })
		});

		const result = await gateway.scanInboxWindow({
			userId: 'user-1',
			connectionId,
			afterEpochSeconds: 1,
			beforeEpochSeconds: 2,
			maxResults: 50
		});

		expect(result.account.status).toBe('success');
		expect(result.messages.map((message) => message.messageId)).toEqual(['m1']);
		expect(result.failedMessageCount).toBe(1);
	});

	it('reports an account as unavailable when every read fails', async () => {
		const { admin } = createAdmin([activeConnection]);
		const oauthService = { getAuthorizedReadAccessToken: vi.fn().mockResolvedValue('token') };
		const gateway = new GmailReadGateway(admin, {
			oauthService,
			providerFetch: scanFetch({ listed: ['m1'], failIds: ['m1'] })
		});

		const result = await gateway.scanInboxWindow({
			userId: 'user-1',
			connectionId,
			afterEpochSeconds: 1,
			beforeEpochSeconds: 2,
			maxResults: 50
		});

		expect(result.account.status).toBe('unavailable');
		expect(result.messages).toEqual([]);
	});

	it('refreshes the token once after a 401 on the list call', async () => {
		const { admin } = createAdmin([activeConnection]);
		const oauthService = {
			getAuthorizedReadAccessToken: vi
				.fn()
				.mockResolvedValueOnce('stale')
				.mockResolvedValueOnce('fresh')
		};
		const inner = scanFetch({ listed: ['m1'] });
		const providerFetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
			const auth = (init?.headers as Record<string, string>).Authorization;
			if (auth === 'Bearer stale') return new Response('{}', { status: 401 });
			return inner(input, init);
		});
		const gateway = new GmailReadGateway(admin, { oauthService, providerFetch });

		const result = await gateway.scanInboxWindow({
			userId: 'user-1',
			connectionId,
			afterEpochSeconds: 1,
			beforeEpochSeconds: 2,
			maxResults: 50
		});

		expect(result.account.status).toBe('success');
		expect(oauthService.getAuthorizedReadAccessToken).toHaveBeenLastCalledWith(
			'user-1',
			connectionId,
			{ forceRefresh: true }
		);
	});

	it('reads 120 messages in three batch requests of at most 50, keeping list order', async () => {
		const { admin, auditInsert } = createAdmin([activeConnection]);
		const oauthService = { getAuthorizedReadAccessToken: vi.fn().mockResolvedValue('token') };
		const listed = Array.from({ length: 120 }, (_, index) => `m${index}`);
		const providerFetch = scanFetch({ listed });
		const gateway = new GmailReadGateway(admin, { oauthService, providerFetch });

		const result = await gateway.scanInboxWindow(scanParams());

		const batchCalls = providerFetch.mock.calls.filter(
			([input]) => new URL(String(input)).pathname === '/batch/gmail/v1'
		);
		expect(batchCalls.map(([, init]) => batchedIds(init).length)).toEqual([50, 50, 20]);
		expect(providerFetch).toHaveBeenCalledTimes(4); // list + 3 batches, no single reads
		const [, firstBatchInit] = batchCalls[0]!;
		expect(firstBatchInit).toMatchObject({ method: 'POST', redirect: 'error' });
		expect((firstBatchInit!.headers as Record<string, string>)['Content-Type']).toMatch(
			/^multipart\/mixed; boundary=/
		);
		expect(String(firstBatchInit!.body)).toContain(
			'format=metadata&fields=id%2CthreadId%2CinternalDate%2Csnippet%2ClabelIds%2Cpayload%2Fheaders&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date'
		);
		expect(result.messages.map((message) => message.messageId)).toEqual(listed);
		expect(auditInsert).toHaveBeenCalledWith(
			expect.objectContaining({
				outcome: 'success',
				metadata: expect.objectContaining({ fetchedCount: 120, singleReadCount: 0 })
			})
		);
	});

	it('re-reads throttled batch items singly and drops deleted ones', async () => {
		const { admin, auditInsert } = createAdmin([activeConnection]);
		const oauthService = { getAuthorizedReadAccessToken: vi.fn().mockResolvedValue('token') };
		const providerFetch = scanFetch({
			listed: ['m1', 'm2', 'm3'],
			batchItemStatus: { m2: 429, m3: 404 }
		});
		const gateway = new GmailReadGateway(admin, { oauthService, providerFetch });

		const result = await gateway.scanInboxWindow(scanParams());

		expect(result.account.status).toBe('success');
		expect(result.messages.map((message) => message.messageId)).toEqual(['m1', 'm2']);
		expect(result.failedMessageCount).toBe(0);
		const singleReads = providerFetch.mock.calls
			.map(([input]) => new URL(String(input)).pathname)
			.filter((pathname) => /\/messages\/m\d+$/.test(pathname));
		expect(singleReads).toEqual(['/gmail/v1/users/me/messages/m2']);
		expect(auditInsert).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: expect.objectContaining({ singleReadCount: 1 })
			})
		);
	});

	it('falls back to single reads when Google rejects a whole batch', async () => {
		const { admin } = createAdmin([activeConnection]);
		const oauthService = { getAuthorizedReadAccessToken: vi.fn().mockResolvedValue('token') };
		const providerFetch = scanFetch({ listed: ['m1', 'm2'], batchStatus: 503 });
		const gateway = new GmailReadGateway(admin, { oauthService, providerFetch });

		const result = await gateway.scanInboxWindow(scanParams());

		expect(result.account.status).toBe('success');
		expect(result.messages.map((message) => message.messageId)).toEqual(['m1', 'm2']);
		expect(providerFetch).toHaveBeenCalledTimes(4); // list + batch + 2 single reads
	});

	it('refreshes the token once when a batch item comes back 401', async () => {
		const { admin } = createAdmin([activeConnection]);
		const oauthService = {
			getAuthorizedReadAccessToken: vi
				.fn()
				.mockResolvedValueOnce('stale')
				.mockResolvedValueOnce('fresh')
		};
		const stale = scanFetch({ listed: ['m1'], batchItemStatus: { m1: 401 } });
		const fresh = scanFetch({ listed: ['m1'] });
		const providerFetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
			const auth = (init?.headers as Record<string, string>).Authorization;
			return auth === 'Bearer stale' ? stale(input, init) : fresh(input, init);
		});
		const gateway = new GmailReadGateway(admin, { oauthService, providerFetch });

		const result = await gateway.scanInboxWindow(scanParams());

		expect(result.account.status).toBe('success');
		expect(result.messages.map((message) => message.messageId)).toEqual(['m1']);
		expect(oauthService.getAuthorizedReadAccessToken).toHaveBeenCalledTimes(2);
	});

	it('treats a window whose listed mail was all deleted as empty, not unavailable', async () => {
		const { admin } = createAdmin([activeConnection]);
		const oauthService = { getAuthorizedReadAccessToken: vi.fn().mockResolvedValue('token') };
		const gateway = new GmailReadGateway(admin, {
			oauthService,
			providerFetch: scanFetch({ listed: ['m1'], batchItemStatus: { m1: 404 } })
		});

		const result = await gateway.scanInboxWindow(scanParams());

		expect(result.account.status).toBe('success');
		expect(result.messages).toEqual([]);
	});

	it('does not call Google for a reconnect-required account', async () => {
		const { admin } = createAdmin([{ ...activeConnection, status: 'reconnect_required' }]);
		const oauthService = { getAuthorizedReadAccessToken: vi.fn() };
		const providerFetch = vi.fn();
		const gateway = new GmailReadGateway(admin, { oauthService, providerFetch });

		const result = await gateway.scanInboxWindow({
			userId: 'user-1',
			connectionId,
			afterEpochSeconds: 1,
			beforeEpochSeconds: 2,
			maxResults: 50
		});

		expect(result.account.status).toBe('reconnect_required');
		expect(providerFetch).not.toHaveBeenCalled();
	});
});
