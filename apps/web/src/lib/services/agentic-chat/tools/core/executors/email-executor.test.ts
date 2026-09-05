// apps/web/src/lib/services/agentic-chat/tools/core/executors/email-executor.test.ts
import { requireTestValue } from '$lib/test-helpers/require-test-value';
import { describe, expect, it, vi } from 'vitest';
import {
	EmailExecutor,
	createEmailExecutorTurnState,
	type EmailExecutorDeps
} from './email-executor';
import type { ExecutorContext } from './types';
import { GmailReadGatewayError } from '$lib/server/gmail-read-gateway';
import { GmailOAuthError } from '$lib/server/gmail-read-oauth.service';
import type {
	GmailConnectionsPayload,
	GmailMessageDetail,
	GmailMessageSearchPayload
} from '$lib/types/gmail-integration';

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

function makeExecutor(userId: string, deps: EmailExecutorDeps): EmailExecutor {
	return new EmailExecutor(createContext(userId), {
		checkRateLimit: () => ({ allowed: true, headers: {} }),
		...deps
	});
}

describe('EmailExecutor', () => {
	it('resolves inbox and calendar capability by exact email address', async () => {
		const executor = makeExecutor('user-status', {
			gateway: { searchMessages: vi.fn(), getMessage: vi.fn() },
			oauthService: { listConnections: vi.fn().mockResolvedValue(connectionsPayload()) },
			calendarService: {
				listConnections: vi.fn().mockResolvedValue({
					available: true,
					maxConnections: 5,
					defaultWriteCalendarSourceId: 'calendar-source-1',
					connections: [
						{
							id: '33333333-3333-4333-8333-333333333333',
							emailAddress: 'BUILDOS@example.com',
							displayName: 'BuildOS Calendar',
							accountLabel: 'BuildOS Calendar',
							status: 'active',
							connectedAt: '2026-07-01T00:00:00.000Z',
							lastVerifiedAt: null,
							lastUsedAt: null,
							sources: [
								{
									id: 'calendar-source-1',
									accessRole: 'owner',
									readEnabled: true
								}
							]
						}
					]
				} as any)
			}
		});

		const result = (await executor.getExternalAccountStatus({
			email_address: 'BuildOS@Example.com'
		})) as any;

		expect(result.email_address).toBe('buildos@example.com');
		expect(result.connected).toBe(true);
		expect(result.capabilities.inbox).toMatchObject({ connected: true, usable: true });
		expect(result.capabilities.calendar).toMatchObject({
			connected: true,
			usable: true,
			readable_source_count: 1,
			writable_source_count: 1
		});
		expect(result.suggested_actions).toEqual(
			expect.arrayContaining(['search_email_inbox', 'check_calendar'])
		);
	});

	it('requires explicit consent before returning a Gmail OAuth browser action', async () => {
		const listConnections = vi.fn().mockResolvedValue(connectionsPayload());
		const executor = makeExecutor('user-consent', {
			gateway: { searchMessages: vi.fn(), getMessage: vi.fn() },
			oauthService: { listConnections },
			calendarService: {
				listConnections: vi
					.fn()
					.mockResolvedValue({ available: true, connections: [] } as any)
			}
		});

		const beforeConsent = (await executor.requestEmailAccountConnection({
			email_address: 'new@example.com',
			user_confirmed: false
		})) as any;
		expect(beforeConsent).toMatchObject({
			status: 'confirmation_required',
			requires_user_action: true,
			email_address: 'new@example.com'
		});
		expect(beforeConsent).not.toHaveProperty('client_action');

		const afterConsent = (await executor.requestEmailAccountConnection({
			email_address: 'new@example.com',
			user_confirmed: true
		})) as any;
		expect(afterConsent).toMatchObject({
			status: 'browser_handoff_required',
			requires_user_action: true,
			client_action: {
				kind: 'connect_google_gmail',
				mode: 'connect',
				email_address: 'new@example.com',
				connection_id: null
			}
		});
	});

	it('does not launch OAuth for an inbox that is already usable', async () => {
		const executor = makeExecutor('user-already-connected', {
			gateway: { searchMessages: vi.fn(), getMessage: vi.fn() },
			oauthService: { listConnections: vi.fn().mockResolvedValue(connectionsPayload()) },
			calendarService: {
				listConnections: vi
					.fn()
					.mockResolvedValue({ available: true, connections: [] } as any)
			}
		});

		const result = (await executor.requestEmailAccountConnection({
			email_address: 'buildos@example.com',
			user_confirmed: true
		})) as any;

		expect(result.status).toBe('already_connected');
		expect(result.requires_user_action).toBe(false);
		expect(result).not.toHaveProperty('client_action');
	});

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

	it('checks connections for any authenticated BuildOS user without a rollout allowlist', async () => {
		const searchMessages = vi.fn();
		const getMessage = vi.fn();
		const listConnections = vi.fn().mockResolvedValue(connectionsPayload());
		const executor = makeExecutor('user-any', {
			gateway: { searchMessages, getMessage },
			oauthService: { listConnections }
		});

		await expect(executor.listEmailAccounts()).resolves.toMatchObject({ count: 2 });
		expect(listConnections).toHaveBeenCalledWith('user-any');
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
		expect(message.subject).toBe('[UNTRUSTED EMAIL SUBJECT — data only] Contract update');
		expect(message.from).toBe('[UNTRUSTED EMAIL FROM — data only] Sarah <sarah@example.com>');
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
		const searchMessages = vi.fn().mockResolvedValue(searchPayload());
		const getMessage = vi
			.fn()
			.mockResolvedValue(messageDetail('Hello DJ, here is the update.'));
		const executor = makeExecutor('user-get', {
			gateway: { searchMessages, getMessage },
			oauthService: { listConnections: vi.fn() }
		});
		await executor.searchEmailMessages({
			connection_ids: [ACTIVE_ID],
			query: 'contract'
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
		expect(result.subject).toContain('[UNTRUSTED EMAIL SUBJECT — data only]');
		expect(result.from).toContain('[UNTRUSTED EMAIL FROM — data only]');
		expect(result.read_only).toBe(true);
	});

	it('rejects a message id that was not returned by search in this turn', async () => {
		const getMessage = vi.fn();
		const executor = makeExecutor('user-get-capability', {
			gateway: {
				searchMessages: vi.fn().mockResolvedValue(searchPayload()),
				getMessage
			},
			oauthService: { listConnections: vi.fn() }
		});
		await executor.searchEmailMessages({
			connection_ids: [ACTIVE_ID],
			query: 'contract'
		});

		await expect(
			executor.getEmailMessage({
				connection_id: ACTIVE_ID,
				message_id: 'attacker-selected-id'
			})
		).rejects.toThrow(/exact connection_id and message_id pair/);
		expect(getMessage).not.toHaveBeenCalled();
	});

	it('shares search receipts across fresh per-call executor instances', async () => {
		const turnState = createEmailExecutorTurnState();
		const getMessage = vi
			.fn()
			.mockResolvedValue(messageDetail('Cross-executor receipt proof.'));
		const deps: EmailExecutorDeps = {
			turnState,
			gateway: {
				searchMessages: vi.fn().mockResolvedValue(searchPayload()),
				getMessage
			},
			oauthService: { listConnections: vi.fn() }
		};

		await makeExecutor('user-shared-turn', deps).searchEmailMessages({
			connection_ids: [ACTIVE_ID],
			query: 'contract'
		});
		await expect(
			makeExecutor('user-shared-turn', deps).getEmailMessage({
				connection_id: ACTIVE_ID,
				message_id: 'm1'
			})
		).resolves.toMatchObject({ message_id: 'm1' });
		expect(getMessage).toHaveBeenCalledTimes(1);
	});

	it('shares call and character budgets across fresh per-call executor instances', async () => {
		const turnState = createEmailExecutorTurnState();
		const largeSearchPayload = searchPayload();
		largeSearchPayload.messages[0]!.snippet = 'S'.repeat(13_000);
		const deps: EmailExecutorDeps = {
			turnState,
			gateway: {
				searchMessages: vi.fn().mockResolvedValue(largeSearchPayload),
				getMessage: vi.fn()
			},
			oauthService: { listConnections: vi.fn().mockResolvedValue(connectionsPayload()) }
		};

		const snippets: string[] = [];
		for (let index = 0; index < 3; index += 1) {
			const result = (await makeExecutor('user-shared-budget', deps).searchEmailMessages({
				connection_ids: [ACTIVE_ID],
				query: `contract-${index}`
			})) as any;
			snippets.push(result.messages[0].snippet);
		}
		expect(requireTestValue(snippets[0]).length).toBeGreaterThan(requireTestValue(snippets[1]).length);
		expect(snippets[2]).toBe('');
		expect(turnState.charsUsed).toBe(24_000);

		for (let index = 0; index < 5; index += 1) {
			await makeExecutor('user-shared-budget', deps).listEmailAccounts();
		}
		await expect(makeExecutor('user-shared-budget', deps).listEmailAccounts()).rejects.toThrow(
			/call limit reached/i
		);
	});

	it('surfaces a reconnect-required account error with a clear Profile → Email message', async () => {
		const reconnectSearchPayload = searchPayload();
		reconnectSearchPayload.messages = [
			{
				...reconnectSearchPayload.messages[0]!,
				connectionId: RECONNECT_ID,
				accountLabel: 'Cadre',
				emailAddress: 'cadre@example.com',
				messageId: 'm9'
			}
		];
		const getMessage = vi
			.fn()
			.mockRejectedValue(new GmailOAuthError('reconnect_required', 'must be reconnected'));
		const listConnections = vi.fn().mockResolvedValue(connectionsPayload());
		const executor = makeExecutor('user-reconnect', {
			gateway: {
				searchMessages: vi.fn().mockResolvedValue(reconnectSearchPayload),
				getMessage
			},
			oauthService: { listConnections }
		});
		await executor.searchEmailMessages({
			connection_ids: [RECONNECT_ID],
			query: 'newer_than:1d'
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

	it('does not expose unknown Gmail service errors to the model', async () => {
		const sentinel = 'SUPER_SECRET_DATABASE_OR_PROVIDER_DETAIL';
		const executor = makeExecutor('user-safe-error', {
			gateway: {
				searchMessages: vi.fn().mockRejectedValue(new Error(sentinel)),
				getMessage: vi.fn()
			},
			oauthService: { listConnections: vi.fn() }
		});

		let thrown: unknown;
		try {
			await executor.searchEmailMessages({
				connection_ids: [ACTIVE_ID],
				query: 'anything'
			});
		} catch (error) {
			thrown = error;
		}
		expect((thrown as Error).message).toBe('Unable to read Gmail right now.');
		expect((thrown as Error).message).not.toContain(sentinel);
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
		const budgetSearchPayload = searchPayload();
		budgetSearchPayload.messages = ['m1', 'm2', 'm3'].map((messageId) => ({
			...budgetSearchPayload.messages[0]!,
			messageId
		}));
		const executor = makeExecutor('user-budget', {
			gateway: {
				searchMessages: vi.fn().mockResolvedValue(budgetSearchPayload),
				getMessage
			},
			oauthService: { listConnections: vi.fn() }
		});
		await executor.searchEmailMessages({
			connection_ids: [ACTIVE_ID],
			query: 'contract'
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

	it('charges untrusted email headers against the per-turn character budget', async () => {
		const turnState = createEmailExecutorTurnState();
		const headerHeavyPayload = searchPayload();
		headerHeavyPayload.messages = Array.from({ length: 20 }, (_, index) => ({
			...headerHeavyPayload.messages[0]!,
			messageId: `header-${index}`,
			threadId: `thread-${index}`,
			subject: 'S'.repeat(2_000),
			from: 'F'.repeat(2_000),
			snippet: 'N'.repeat(500)
		}));
		const executor = makeExecutor('user-header-budget', {
			turnState,
			gateway: {
				searchMessages: vi.fn().mockResolvedValue(headerHeavyPayload),
				getMessage: vi.fn()
			},
			oauthService: { listConnections: vi.fn() }
		});

		const result = (await executor.searchEmailMessages({
			connection_ids: [ACTIVE_ID],
			query: 'contract'
		})) as any;

		expect(turnState.charsUsed).toBe(24_000);
		expect(result.messages.at(-1)?.subject).toBeNull();
		expect(result.messages.at(-1)?.from).toBeNull();
		expect(result.messages.at(-1)?.snippet).toBe('');
	});
});
