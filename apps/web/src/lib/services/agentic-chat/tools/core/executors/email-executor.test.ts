// apps/web/src/lib/services/agentic-chat/tools/core/executors/email-executor.test.ts
import { describe, expect, it, vi } from 'vitest';
import { EmailExecutor, type EmailExecutorDeps } from './email-executor';
import type { ExecutorContext } from './types';
import { GmailReadGatewayError } from '$lib/server/gmail-read-gateway';
import { GmailOAuthError } from '$lib/server/gmail-read-oauth.service';
import type {
	GmailConnectionsPayload,
	GmailMessageDetail,
	GmailMessageSearchPayload
} from '$lib/types/gmail-integration';
import { configureEmailRuntimeEnv } from '../../email';

const ACTIVE_ID = '11111111-1111-4111-8111-111111111111';
const RECONNECT_ID = '22222222-2222-4222-8222-222222222222';

// Mock admin client follows the `as any` pattern from gmail-read-gateway.test.ts —
// the executor only touches it to construct the (injected) gateway/oauth service,
// so a minimal stub is sufficient here.
function createContext(userId: string): ExecutorContext {
	const admin = {
		from: vi.fn(() => admin)
	} as any;
	return {
		supabase: admin,
		userId,
		fetchFn: vi.fn() as unknown as typeof fetch,
		getAdminSupabase: () => admin
	} as unknown as ExecutorContext;
}

function connectionsPayload(): GmailConnectionsPayload {
	return {
		available: true,
		maxConnections: 5,
		readOnly: true,
		connections: [
			{
				id: ACTIVE_ID,
				emailAddress: 'buildos@example.com',
				displayName: 'BuildOS',
				accountLabel: 'BuildOS',
				status: 'active',
				readEnabled: true,
				connectedAt: '2026-07-01T00:00:00.000Z',
				lastVerifiedAt: null,
				lastUsedAt: null,
				capabilities: [{ capability: 'read', status: 'enabled' }]
			},
			{
				id: RECONNECT_ID,
				emailAddress: 'cadre@example.com',
				displayName: 'Cadre',
				accountLabel: 'Cadre',
				status: 'reconnect_required',
				readEnabled: true,
				connectedAt: '2026-07-01T00:00:00.000Z',
				lastVerifiedAt: null,
				lastUsedAt: null,
				capabilities: [{ capability: 'read', status: 'reconnect_required' }]
			}
		]
	};
}

function searchPayload(): GmailMessageSearchPayload {
	return {
		fetchedAt: '2026-07-22T18:00:00.000Z',
		readOnly: true,
		accounts: [
			{
				connectionId: ACTIVE_ID,
				accountLabel: 'BuildOS',
				emailAddress: 'buildos@example.com',
				status: 'success',
				messageCount: 1,
				hasMore: false,
				nextCursor: null
			},
			{
				connectionId: RECONNECT_ID,
				accountLabel: 'Cadre',
				emailAddress: 'cadre@example.com',
				status: 'reconnect_required',
				messageCount: 0,
				hasMore: false,
				nextCursor: null
			}
		],
		messages: [
			{
				connectionId: ACTIVE_ID,
				accountLabel: 'BuildOS',
				emailAddress: 'buildos@example.com',
				messageId: 'm1',
				threadId: 't1',
				subject: 'Contract update',
				from: 'Sarah <sarah@example.com>',
				internalDate: '2026-07-22T17:00:00.000Z',
				snippet: 'Please review the attached contract.'
			}
		]
	};
}

function messageDetail(bodyText: string, bodyTruncated = false): GmailMessageDetail {
	return {
		connectionId: ACTIVE_ID,
		accountLabel: 'BuildOS',
		emailAddress: 'buildos@example.com',
		messageId: 'm1',
		threadId: 't1',
		subject: 'Contract update',
		from: 'Sarah <sarah@example.com>',
		internalDate: '2026-07-22T17:00:00.000Z',
		snippet: 'Please review the attached contract.',
		to: 'DJ <buildos@example.com>',
		cc: null,
		bodyText,
		bodyTruncated,
		hasUnsupportedAttachments: false,
		fetchedAt: '2026-07-22T18:00:00.000Z',
		readOnly: true
	};
}

function makeExecutor(
	userId: string,
	deps: EmailExecutorDeps,
	pilotUserIds = userId
): EmailExecutor {
	configureEmailRuntimeEnv({
		EMAIL_CHAT_TOOLS_ENABLED: 'true',
		EMAIL_CHAT_TOOLS_USER_IDS: pilotUserIds
	});
	return new EmailExecutor(createContext(userId), {
		checkRateLimit: () => ({ allowed: true, headers: {} }),
		...deps
	});
}

describe('EmailExecutor', () => {
	it('list_email_accounts returns provenance and flags reconnect-required accounts (no Gmail call)', async () => {
		const searchMessages = vi.fn();
		const getMessage = vi.fn();
		const listConnections = vi.fn().mockResolvedValue(connectionsPayload());
		const executor = makeExecutor('user-list', {
			gateway: { searchMessages, getMessage },
			oauthService: { listConnections }
		});

		const result = (await executor.listEmailAccounts()) as any;

		expect(result.read_only).toBe(true);
		expect(result.count).toBe(2);
		expect(result.readable_count).toBe(1);
		expect(result.accounts[0]).toMatchObject({
			connection_id: ACTIVE_ID,
			status: 'active',
			read_enabled: true,
			read_capability_status: 'enabled'
		});
		expect(result.accounts[1]).toMatchObject({
			connection_id: RECONNECT_ID,
			status: 'reconnect_required',
			reconnect_required: true
		});
		// No Gmail provider call for listing accounts.
		expect(searchMessages).not.toHaveBeenCalled();
		expect(getMessage).not.toHaveBeenCalled();
	});

	it('fails closed before any provider call when the BuildOS user is not allowlisted', async () => {
		const searchMessages = vi.fn();
		const getMessage = vi.fn();
		const listConnections = vi.fn();
		const executor = makeExecutor(
			'user-blocked',
			{
				gateway: { searchMessages, getMessage },
				oauthService: { listConnections }
			},
			'user-allowed'
		);

		await expect(executor.listEmailAccounts()).rejects.toThrow(/not enabled/i);
		expect(listConnections).not.toHaveBeenCalled();
		expect(searchMessages).not.toHaveBeenCalled();
		expect(getMessage).not.toHaveBeenCalled();
	});

	it('search wraps snippets as untrusted content, adds the deep link, and preserves per-account reconnect status', async () => {
		const searchMessages = vi.fn().mockResolvedValue(searchPayload());
		const executor = makeExecutor('user-search', {
			gateway: { searchMessages, getMessage: vi.fn() },
			oauthService: { listConnections: vi.fn() }
		});

		const result = (await executor.searchEmailMessages({
			connection_ids: [ACTIVE_ID, RECONNECT_ID],
			query: 'contract newer_than:7d'
		})) as any;

		expect(searchMessages).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-search',
				connectionIds: [ACTIVE_ID, RECONNECT_ID],
				query: 'contract newer_than:7d'
			})
		);
		expect(result.read_only).toBe(true);
		expect(result.result_contract_version).toBe('gmail-read-v2');
		const message = result.messages[0];
		expect(message.gmail_url).toBe(
			'https://mail.google.com/mail/?authuser=buildos%40example.com#all/t1'
		);
		expect(message.snippet).toContain('[BEGIN UNTRUSTED EMAIL CONTENT');
		expect(message.snippet).toContain('Please review the attached contract.');
		expect(message.snippet).toContain('[END UNTRUSTED EMAIL CONTENT]');
		expect(result.reconnect_required_accounts).toEqual(['Cadre']);
		expect(result.account_message_links).toEqual([
			{
				account_label: 'BuildOS',
				email_address: 'buildos@example.com',
				status: 'success',
				message_found: true,
				gmail_url: 'https://mail.google.com/mail/?authuser=buildos%40example.com#all/t1'
			},
			{
				account_label: 'Cadre',
				email_address: 'cadre@example.com',
				status: 'reconnect_required',
				message_found: false,
				gmail_url: null
			}
		]);
		const reconnectAccount = result.accounts.find((a: any) => a.connection_id === RECONNECT_ID);
		expect(reconnectAccount.status).toBe('reconnect_required');
		expect(reconnectAccount.guidance).toContain('Profile → Email');
	});

	it('reserves at least one result slot per selected account', async () => {
		const searchMessages = vi.fn().mockResolvedValue(searchPayload());
		const executor = makeExecutor('user-multi-account-limit', {
			gateway: { searchMessages, getMessage: vi.fn() },
			oauthService: { listConnections: vi.fn() }
		});

		await executor.searchEmailMessages({
			connection_ids: [ACTIVE_ID, RECONNECT_ID],
			query: 'newer_than:2d',
			max_results: 1
		});

		expect(searchMessages).toHaveBeenCalledWith(
			expect.objectContaining({
				connectionIds: [ACTIVE_ID, RECONNECT_ID],
				maxResults: 2
			})
		);
	});

	it('search requires explicit connection_ids', async () => {
		const searchMessages = vi.fn();
		const executor = makeExecutor('user-noconn', {
			gateway: { searchMessages, getMessage: vi.fn() },
			oauthService: { listConnections: vi.fn() }
		});

		await expect(executor.searchEmailMessages({ query: 'contract' })).rejects.toThrow(
			/connection_ids/
		);
		expect(searchMessages).not.toHaveBeenCalled();
	});

	it('get_email_message wraps the body and includes the deep link', async () => {
		const getMessage = vi
			.fn()
			.mockResolvedValue(messageDetail('Hello DJ, here is the update.'));
		const executor = makeExecutor('user-get', {
			gateway: { searchMessages: vi.fn(), getMessage },
			oauthService: { listConnections: vi.fn() }
		});

		const result = (await executor.getEmailMessage({
			connection_id: ACTIVE_ID,
			message_id: 'm1'
		})) as any;

		expect(getMessage).toHaveBeenCalledWith({
			userId: 'user-get',
			connectionId: ACTIVE_ID,
			messageId: 'm1'
		});
		expect(result.gmail_url).toBe(
			'https://mail.google.com/mail/?authuser=buildos%40example.com#all/t1'
		);
		expect(result.body).toContain('[BEGIN UNTRUSTED EMAIL CONTENT');
		expect(result.body).toContain('Hello DJ, here is the update.');
		expect(result.body).toContain('[END UNTRUSTED EMAIL CONTENT]');
		expect(result.read_only).toBe(true);
	});

	it('surfaces a reconnect-required account error with a clear Profile → Email message', async () => {
		const getMessage = vi
			.fn()
			.mockRejectedValue(new GmailOAuthError('reconnect_required', 'must be reconnected'));
		const listConnections = vi.fn().mockResolvedValue(connectionsPayload());
		const executor = makeExecutor('user-reconnect', {
			gateway: { searchMessages: vi.fn(), getMessage },
			oauthService: { listConnections }
		});

		await expect(
			executor.getEmailMessage({ connection_id: RECONNECT_ID, message_id: 'm9' })
		).rejects.toThrow(/reconnect.*Profile → Email/is);
	});

	it('maps a gateway connection_not_found (ownership failure) to a safe error and never leaks content', async () => {
		const searchMessages = vi
			.fn()
			.mockRejectedValue(
				new GmailReadGatewayError(
					'connection_not_found',
					'One or more Gmail accounts were not found'
				)
			);
		const executor = makeExecutor('user-owner', {
			gateway: { searchMessages, getMessage: vi.fn() },
			oauthService: { listConnections: vi.fn() }
		});

		await expect(
			executor.searchEmailMessages({
				connection_ids: ['99999999-9999-4999-8999-999999999999'],
				query: 'anything'
			})
		).rejects.toThrow(/were not found/);
	});

	it('enforces the per-turn email tool call cap (8)', async () => {
		const searchMessages = vi.fn().mockResolvedValue(searchPayload());
		const executor = makeExecutor('user-cap', {
			gateway: { searchMessages, getMessage: vi.fn() },
			oauthService: { listConnections: vi.fn() }
		});

		for (let i = 0; i < 8; i += 1) {
			await executor.searchEmailMessages({ connection_ids: [ACTIVE_ID], query: `q${i}` });
		}
		await expect(
			executor.searchEmailMessages({ connection_ids: [ACTIVE_ID], query: 'q9' })
		).rejects.toThrow(/call limit reached/i);
		expect(searchMessages).toHaveBeenCalledTimes(8);
	});

	it('enforces the per-turn total email-character budget across message reads', async () => {
		const bigBody = 'A'.repeat(20_000);
		const getMessage = vi.fn().mockResolvedValue(messageDetail(bigBody));
		const executor = makeExecutor('user-budget', {
			gateway: { searchMessages: vi.fn(), getMessage },
			oauthService: { listConnections: vi.fn() }
		});

		// Each body is individually capped at 12k and the per-turn budget is 24k, so
		// the first two reads exhaust the budget and the third returns no body.
		const first = (await executor.getEmailMessage({
			connection_id: ACTIVE_ID,
			message_id: 'm1'
		})) as any;
		const second = (await executor.getEmailMessage({
			connection_id: ACTIVE_ID,
			message_id: 'm2'
		})) as any;
		const third = (await executor.getEmailMessage({
			connection_id: ACTIVE_ID,
			message_id: 'm3'
		})) as any;

		expect(first.body_truncated).toBe(true); // clipped by the 12k per-message cap
		expect(String(first.body).length).toBeGreaterThan(0);
		expect(String(second.body).length).toBeGreaterThan(0);
		// Budget is exhausted by the third read: no body is returned at all.
		expect(third.body).toBe('');
		expect(third.body_truncated).toBe(true);
	});
});
