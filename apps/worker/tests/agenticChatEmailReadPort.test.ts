// apps/worker/tests/agenticChatEmailReadPort.test.ts
//
// The worker half of the five shared email tools: the port adapter over the
// shared Gmail read stack plus the shared Google Calendar connection read,
// driven through the shared read dispatcher so the test covers what a real turn
// executes (arguments -> shared tool -> port -> provider services).
import { describe, expect, it, vi } from 'vitest';
import {
	executeAgenticChatSharedReadToolV1,
	type AgenticChatSharedReadContextV1,
	type AgenticChatToolAccessPortV1
} from '@buildos/agentic-chat-runtime/tools';
import { createWorkerAgenticChatEmailReadPort } from '../src/workers/agentic-chat/tools/email-read-port';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const ACTIVE_ID = '11111111-1111-4111-8111-111111111111';
const RECONNECT_ID = '22222222-2222-4222-8222-222222222222';
const CALENDAR_CONNECTION_ID = '33333333-3333-4333-8333-333333333333';

type QueryResponse = { data: unknown; error: unknown };

function createSupabaseStub(responses: Record<string, QueryResponse[]> = {}) {
	const positions = new Map<string, number>();
	return {
		from: vi.fn((table: string) => {
			const index = positions.get(table) ?? 0;
			positions.set(table, index + 1);
			const response = responses[table]?.[index] ?? { data: [], error: null };
			const query: Record<string, any> = {};
			for (const method of ['select', 'eq', 'is', 'in', 'order', 'limit', 'gte', 'lte']) {
				query[method] = vi.fn(() => query);
			}
			query.then = (resolve: (value: unknown) => unknown) =>
				Promise.resolve(response).then(resolve);
			query.maybeSingle = vi.fn(async () => ({
				data: Array.isArray(response.data) ? (response.data[0] ?? null) : response.data,
				error: response.error
			}));
			query.single = query.maybeSingle;
			return query;
		})
	} as any;
}

/** Mimics the shared stack's classified errors, which the port matches by shape. */
function gmailOAuthError(code: string, message = 'gmail oauth failure'): Error {
	const error = new Error(message);
	error.name = 'GmailOAuthError';
	(error as unknown as { code: string }).code = code;
	return error;
}

function gmailGatewayError(code: string, message = 'gmail gateway failure'): Error {
	const error = new Error(message);
	error.name = 'GmailReadGatewayError';
	(error as unknown as { code: string }).code = code;
	return error;
}

function gmailConnections() {
	return {
		available: true,
		maxConnections: 5,
		readOnly: true as const,
		connections: [
			{
				id: ACTIVE_ID,
				emailAddress: 'buildos@example.com',
				displayName: 'BuildOS',
				accountLabel: 'BuildOS',
				status: 'active' as const,
				readEnabled: true,
				connectedAt: '2026-07-01T00:00:00.000Z',
				lastVerifiedAt: null,
				lastUsedAt: null,
				capabilities: [{ capability: 'read' as const, status: 'enabled' as const }]
			},
			{
				id: RECONNECT_ID,
				emailAddress: 'cadre@example.com',
				displayName: 'Cadre',
				accountLabel: 'Cadre',
				status: 'reconnect_required' as const,
				readEnabled: true,
				connectedAt: '2026-07-01T00:00:00.000Z',
				lastVerifiedAt: null,
				lastUsedAt: null,
				capabilities: []
			}
		]
	};
}

function calendarConnections() {
	return {
		available: true,
		connections: [
			{
				id: CALENDAR_CONNECTION_ID,
				emailAddress: 'buildos@example.com',
				displayName: 'BuildOS Calendar',
				accountLabel: 'BuildOS Calendar',
				status: 'active' as const,
				sources: [{ id: 'source-1', readEnabled: true, accessRole: 'owner' }]
			}
		]
	};
}

function gmailSearchPayload() {
	return {
		readOnly: true as const,
		fetchedAt: '2026-09-04T00:00:00.000Z',
		accounts: [
			{
				connectionId: ACTIVE_ID,
				accountLabel: 'BuildOS',
				emailAddress: 'buildos@example.com',
				status: 'success' as const,
				messageCount: 1,
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
				internalDate: '2026-09-03T17:00:00.000Z',
				snippet: 'Please review the attached contract.'
			}
		]
	};
}

function gmailMessageDetail() {
	return {
		connectionId: ACTIVE_ID,
		accountLabel: 'BuildOS',
		emailAddress: 'buildos@example.com',
		messageId: 'm1',
		threadId: 't1',
		subject: 'Contract update',
		from: 'Sarah <sarah@example.com>',
		internalDate: '2026-09-03T17:00:00.000Z',
		snippet: 'Please review the attached contract.',
		to: 'DJ <buildos@example.com>',
		cc: null,
		bodyText: 'Hello DJ, here is the update.',
		bodyTruncated: false,
		hasUnsupportedAttachments: false,
		fetchedAt: '2026-09-04T00:00:00.000Z',
		readOnly: true as const
	};
}

function accessStub(): AgenticChatToolAccessPortV1 {
	return {
		getActorId: vi.fn(async () => 'actor-1'),
		resolveProjectSummaries: vi.fn(async () => [] as never),
		assertProjectAccess: vi.fn(async () => {}),
		assertEntityAccess: vi.fn(async () => {})
	};
}

function createHarness(
	overrides: {
		accounts?: unknown;
		messages?: unknown;
		calendarAccounts?: unknown;
		responses?: Record<string, QueryResponse[]>;
		readEnv?: (name: string) => string | undefined;
		rateLimitAllowed?: boolean;
	} = {}
) {
	const client = createSupabaseStub(overrides.responses);
	const gmailAccountsPort = (overrides.accounts ?? {
		listConnections: vi.fn(async () => gmailConnections())
	}) as any;
	const gmailMessagesPort = (overrides.messages ?? {
		searchMessages: vi.fn(async () => gmailSearchPayload()),
		getMessage: vi.fn(async () => gmailMessageDetail())
	}) as any;
	const calendarAccountsPort = (overrides.calendarAccounts ?? {
		listConnections: vi.fn(async () => calendarConnections())
	}) as any;

	const port = createWorkerAgenticChatEmailReadPort({
		client,
		userId: USER_ID,
		options: {
			accounts: () => gmailAccountsPort,
			messages: () => gmailMessagesPort,
			calendarAccounts: () => calendarAccountsPort,
			readEnv: overrides.readEnv ?? (() => undefined),
			rateLimiter: {
				check: vi.fn(() => ({
					allowed: overrides.rateLimitAllowed ?? true,
					remaining: 10,
					resetTime: Date.now() + 60_000
				}))
			}
		}
	});

	const context: AgenticChatSharedReadContextV1 = {
		client,
		access: accessStub(),
		userId: USER_ID,
		timezone: 'America/New_York',
		email: port
	};

	const run = (toolName: string, args: Record<string, unknown>) =>
		executeAgenticChatSharedReadToolV1({
			toolName: toolName as never,
			context,
			arguments: args as never
		}) as Promise<Record<string, any>>;

	return {
		client,
		port,
		context,
		run,
		gmailAccountsPort,
		gmailMessagesPort,
		calendarAccountsPort
	};
}

describe('worker Agentic Chat email read port', () => {
	it('lists connected Gmail accounts with their read capability grants', async () => {
		const harness = createHarness();

		const result = await harness.run('list_email_accounts', {});

		expect(harness.gmailAccountsPort.listConnections).toHaveBeenCalledWith(USER_ID);
		expect(result.count).toBe(2);
		expect(result.readable_count).toBe(1);
		expect(result.accounts[0]).toMatchObject({
			connection_id: ACTIVE_ID,
			read_capability_status: 'enabled'
		});
		// No `read` grant row at all reads as `disabled`, never as enabled.
		expect(result.accounts[1]).toMatchObject({
			connection_id: RECONNECT_ID,
			read_capability_status: 'disabled',
			reconnect_required: true
		});
	});

	it('reports inbox and calendar capability side by side for one address', async () => {
		const harness = createHarness();

		const result = await harness.run('get_external_account_status', {
			email_address: 'BuildOS@example.com'
		});

		expect(harness.calendarAccountsPort.listConnections).toHaveBeenCalledWith(USER_ID);
		expect(result.capabilities.inbox).toMatchObject({
			connected: true,
			usable: true,
			connection_id: ACTIVE_ID
		});
		expect(result.capabilities.calendar).toMatchObject({
			connected: true,
			usable: true,
			connection_id: CALENDAR_CONNECTION_ID,
			readable_source_count: 1,
			writable_source_count: 1
		});
	});

	it('still answers the inbox question when the calendar connection read fails', async () => {
		const harness = createHarness({
			calendarAccounts: {
				listConnections: vi.fn(async () => {
					throw new Error('calendar table unavailable');
				})
			}
		});

		const result = await harness.run('get_external_account_status', {
			email_address: 'buildos@example.com'
		});

		expect(result.capabilities.inbox.usable).toBe(true);
		expect(result.capabilities.calendar).toMatchObject({ connected: false, usable: false });
		expect(result.provider_availability.google_calendar).toBe(false);
	});

	it('maps a provider search payload onto the shared message shape', async () => {
		const harness = createHarness();

		const result = await harness.run('search_email_messages', {
			connection_ids: [ACTIVE_ID],
			query: 'contract'
		});

		expect(harness.gmailMessagesPort.searchMessages).toHaveBeenCalledWith({
			userId: USER_ID,
			connectionIds: [ACTIVE_ID],
			query: 'contract',
			maxResults: undefined,
			cursor: undefined
		});
		expect(result.messages[0]).toMatchObject({
			message_id: 'm1',
			// internalDate -> date
			date: '2026-09-03T17:00:00.000Z',
			gmail_url: 'https://mail.google.com/mail/?authuser=buildos%40example.com#all/t1'
		});
		expect(result.messages[0].snippet).toContain('[BEGIN UNTRUSTED EMAIL CONTENT');
	});

	it('maps a provider message detail onto the shared body shape', async () => {
		const harness = createHarness();
		await harness.run('search_email_messages', {
			connection_ids: [ACTIVE_ID],
			query: 'contract'
		});

		const result = await harness.run('get_email_message', {
			connection_id: ACTIVE_ID,
			message_id: 'm1'
		});

		expect(harness.gmailMessagesPort.getMessage).toHaveBeenCalledWith({
			userId: USER_ID,
			connectionId: ACTIVE_ID,
			messageId: 'm1'
		});
		// bodyText -> body, wrapped as untrusted external data.
		expect(result.body).toContain('Hello DJ, here is the update.');
		expect(result.body).toContain('[END UNTRUSTED EMAIL CONTENT]');
		expect(result.to).toContain('[UNTRUSTED EMAIL TO — data only]');
	});

	it('turns a reconnect-required OAuth failure into the Profile → Email instruction', async () => {
		const harness = createHarness({
			messages: {
				searchMessages: vi.fn(async () => {
					throw gmailOAuthError('reconnect_required', 'must be reconnected');
				}),
				getMessage: vi.fn()
			}
		});

		await expect(
			harness.run('search_email_messages', { connection_ids: [ACTIVE_ID], query: 'contract' })
		).rejects.toThrow(/BuildOS.*Profile → Email/is);
	});

	it('turns a gateway ownership failure into a non-enumerating error', async () => {
		const harness = createHarness({
			messages: {
				searchMessages: vi.fn(async () => {
					throw gmailGatewayError('connection_not_found', 'not found');
				}),
				getMessage: vi.fn()
			}
		});

		await expect(
			harness.run('search_email_messages', {
				connection_ids: ['99999999-9999-4999-8999-999999999999'],
				query: 'contract'
			})
		).rejects.toThrow(/were not found.*list_email_accounts/s);
	});

	it('never exposes an unclassified provider or database error', async () => {
		const sentinel = 'SUPER_SECRET_DATABASE_OR_PROVIDER_DETAIL';
		const harness = createHarness({
			messages: {
				searchMessages: vi.fn(async () => {
					throw new Error(sentinel);
				}),
				getMessage: vi.fn()
			}
		});

		let thrown: unknown;
		try {
			await harness.run('search_email_messages', {
				connection_ids: [ACTIVE_ID],
				query: 'contract'
			});
		} catch (error) {
			thrown = error;
		}
		expect((thrown as Error).message).toBe('Unable to read Gmail right now.');
		expect((thrown as Error).message).not.toContain(sentinel);
	});

	it('refuses a search that would exceed the worker Gmail read quota', async () => {
		const harness = createHarness({ rateLimitAllowed: false });

		await expect(
			harness.run('search_email_messages', { connection_ids: [ACTIVE_ID], query: 'contract' })
		).rejects.toThrow(/Too many Gmail reads in a short window/);
		expect(harness.gmailMessagesPort.searchMessages).not.toHaveBeenCalled();
	});

	it('reports a structured not_configured instead of crashing when the OAuth env is absent', async () => {
		const harness = createHarness({
			messages: {
				searchMessages: vi.fn(async () => {
					throw gmailOAuthError(
						'not_configured',
						'Gmail read-only integration is not configured'
					);
				}),
				getMessage: vi.fn()
			}
		});

		await expect(
			harness.run('search_email_messages', { connection_ids: [ACTIVE_ID], query: 'contract' })
		).rejects.toThrow('Gmail reading is not available right now.');
	});

	it('boots and lists accounts with no Gmail OAuth env at all', async () => {
		// Real shared services over a stub client: `available` collapses to false
		// rather than throwing, so a worker deployed without the Gmail env still
		// answers list_email_accounts.
		const client = createSupabaseStub({ user_email_connections: [{ data: [], error: null }] });
		const port = createWorkerAgenticChatEmailReadPort({
			client,
			userId: USER_ID,
			options: { readEnv: () => undefined }
		});
		const context: AgenticChatSharedReadContextV1 = {
			client,
			access: accessStub(),
			userId: USER_ID,
			timezone: null,
			email: port
		};

		const result = (await executeAgenticChatSharedReadToolV1({
			toolName: 'list_email_accounts' as never,
			context,
			arguments: {} as never
		})) as Record<string, any>;

		expect(result.gmail_available).toBe(false);
		expect(result.count).toBe(0);
		expect(result.notice).toContain('Profile → Email');
	});

	it('refuses a userId outside the turn claim', async () => {
		const harness = createHarness();

		await expect(
			harness.port.listAccounts({ userId: '99999999-9999-4999-8999-999999999999' })
		).rejects.toThrow(/outside the turn claim/);
		expect(harness.gmailAccountsPort.listConnections).not.toHaveBeenCalled();
	});
});
