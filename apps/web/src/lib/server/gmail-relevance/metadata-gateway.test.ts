// apps/web/src/lib/server/gmail-relevance/metadata-gateway.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	GmailRelevanceMetadataGateway,
	GmailRelevanceMetadataGatewayError
} from './metadata-gateway';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222';
const WINDOW_START = '2026-06-21T00:00:00.000Z';
const WINDOW_END = '2026-07-21T00:00:00.000Z';

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(value), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
		...init
	});
}

describe('GmailRelevanceMetadataGateway', () => {
	it('compiles the fixed inbox+sent window query and lists one 100-message page', async () => {
		const oauthService = { getAuthorizedReadAccessToken: vi.fn().mockResolvedValue('token') };
		const providerFetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
			const url = new URL(String(input));
			expect(url.pathname).toBe('/gmail/v1/users/me/messages');
			expect(url.searchParams.get('q')).toBe(
				'{in:inbox in:sent} -in:spam -in:trash -in:drafts after:1782000000 before:1784592000'
			);
			expect(url.searchParams.get('maxResults')).toBe('100');
			expect(url.searchParams.get('includeSpamTrash')).toBe('false');
			expect(url.searchParams.get('fields')).toBe('messages(id,threadId),nextPageToken');
			expect(init).toMatchObject({ method: 'GET', redirect: 'error' });
			return jsonResponse({
				messages: [{ id: 'synthetic_message', threadId: 'synthetic_thread' }],
				nextPageToken: 'synthetic_page_2'
			});
		});
		const gateway = new GmailRelevanceMetadataGateway({} as never, {
			oauthService,
			providerFetch
		});

		await expect(
			gateway.listPage({
				user_id: USER_ID,
				connection_id: CONNECTION_ID,
				window_start: WINDOW_START,
				window_end: WINDOW_END
			})
		).resolves.toEqual({
			messages: [
				{
					provider_message_id: 'synthetic_message',
					provider_thread_id: 'synthetic_thread'
				}
			],
			next_page_token: 'synthetic_page_2'
		});
		expect(oauthService.getAuthorizedReadAccessToken).toHaveBeenCalledOnce();
	});

	it('gets only allowlisted metadata with at most four concurrent calls and reauthorizes each', async () => {
		let active = 0;
		let maxActive = 0;
		const oauthService = { getAuthorizedReadAccessToken: vi.fn().mockResolvedValue('token') };
		const providerFetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
			active += 1;
			maxActive = Math.max(maxActive, active);
			await Promise.resolve();
			const url = new URL(String(input));
			const id = decodeURIComponent(url.pathname.split('/').at(-1)!);
			expect(url.searchParams.get('format')).toBe('metadata');
			expect(url.searchParams.get('fields')).toBe(
				'id,threadId,internalDate,labelIds,snippet,payload/headers'
			);
			expect(url.searchParams.getAll('metadataHeaders')).toEqual([
				'From',
				'To',
				'Cc',
				'Bcc',
				'Subject'
			]);
			expect(url.search).not.toMatch(/format=(full|raw)/i);
			expect(init?.method).toBe('GET');
			active -= 1;
			return jsonResponse({
				id,
				threadId: `thread_${id}`,
				internalDate: '1784592000000',
				labelIds: ['INBOX'],
				snippet: '<b>invented preview</b>',
				payload: {
					headers: [
						{ name: 'From', value: 'sender@invented.test' },
						{ name: 'Subject', value: `status ${id}` }
					]
				}
			});
		});
		const gateway = new GmailRelevanceMetadataGateway({} as never, {
			oauthService,
			providerFetch
		});
		const ids = Array.from({ length: 9 }, (_, index) => `synthetic_${index + 1}`);
		const result = await gateway.getMetadataBatch({
			user_id: USER_ID,
			connection_id: CONNECTION_ID,
			provider_message_ids: ids
		});

		expect(result.messages).toHaveLength(9);
		expect(maxActive).toBeLessThanOrEqual(4);
		expect(oauthService.getAuthorizedReadAccessToken).toHaveBeenCalledTimes(9);
	});

	it('starts zero provider calls when immediate authorization is denied', async () => {
		const providerFetch = vi.fn();
		const gateway = new GmailRelevanceMetadataGateway({} as never, {
			oauthService: {
				getAuthorizedReadAccessToken: vi.fn().mockRejectedValue(new Error('denied'))
			},
			providerFetch
		});

		await expect(
			gateway.getMetadataBatch({
				user_id: USER_ID,
				connection_id: CONNECTION_ID,
				provider_message_ids: ['synthetic_message']
			})
		).rejects.toMatchObject<GmailRelevanceMetadataGatewayError>({
			code: 'provider_rejected'
		});
		expect(providerFetch).not.toHaveBeenCalled();
	});

	it('rejects oversized batches, duplicate IDs, malformed cursors, and large responses', async () => {
		const oauthService = { getAuthorizedReadAccessToken: vi.fn().mockResolvedValue('token') };
		const gateway = new GmailRelevanceMetadataGateway({} as never, {
			oauthService,
			providerFetch: vi.fn().mockResolvedValue(
				new Response('{}', {
					status: 200,
					headers: { 'content-length': String(256 * 1024 + 1) }
				})
			)
		});

		await expect(
			gateway.getMetadataBatch({
				user_id: USER_ID,
				connection_id: CONNECTION_ID,
				provider_message_ids: Array.from({ length: 51 }, (_, index) => `id_${index}`)
			})
		).rejects.toMatchObject({ code: 'invalid_request' });
		await expect(
			gateway.getMetadataBatch({
				user_id: USER_ID,
				connection_id: CONNECTION_ID,
				provider_message_ids: ['duplicate', 'duplicate']
			})
		).rejects.toMatchObject({ code: 'invalid_request' });
		await expect(
			gateway.listPage({
				user_id: USER_ID,
				connection_id: CONNECTION_ID,
				window_start: WINDOW_START,
				window_end: WINDOW_END,
				page_token: 'bad\nvalue'
			})
		).rejects.toMatchObject({ code: 'invalid_request' });
		await expect(
			gateway.listPage({
				user_id: USER_ID,
				connection_id: CONNECTION_ID,
				window_start: WINDOW_START,
				window_end: WINDOW_END
			})
		).rejects.toMatchObject({ code: 'provider_response_too_large' });
	});
});
