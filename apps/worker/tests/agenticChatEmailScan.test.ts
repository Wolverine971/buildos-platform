// apps/worker/tests/agenticChatEmailScan.test.ts
// scan_email_inbox on the worker: Jev relevance scoring, the scan ledger
// (cursor), and the orchestration that joins them with the Gmail gateway.
import { describe, expect, it, vi } from 'vitest';
import type { JevDecider } from '@buildos/smart-llm';
import type { GmailInboxScanMessage } from '@buildos/shared-agent-ops/email/gmail-read-gateway';
import {
	EMAILS_PER_RELEVANCE_DECISION,
	buildEmailRelevanceRequest,
	isRelevantEmailScore,
	scoreEmailRelevance
} from '../src/workers/agentic-chat/tools/email-relevance';
import {
	type EmailScanLedger,
	SupabaseEmailScanLedger,
	emailScanScopeKey
} from '../src/workers/agentic-chat/tools/email-scan-ledger';
import {
	type EmailScanDeps,
	runEmailInboxScan
} from '../src/workers/agentic-chat/tools/email-scan';
import {
	JevEmailSearchProvenanceJudge,
	buildEmailSearchProvenanceRequest
} from '../src/workers/agentic-chat/tools/email-search-provenance';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';

function message(
	id: string,
	overrides: Partial<GmailInboxScanMessage> = {}
): GmailInboxScanMessage {
	return {
		connectionId: CONNECTION_ID,
		accountLabel: 'DJ',
		emailAddress: 'dj@9takes.com',
		messageId: id,
		threadId: `t-${id}`,
		subject: `Subject ${id}`,
		from: `Sender ${id} <${id}@example.com>`,
		internalDate: `2026-09-24T1${id.length % 10}:00:00.000Z`,
		snippet: `Snippet for ${id}`,
		to: 'dj@9takes.com',
		labelIds: ['INBOX', 'CATEGORY_PERSONAL'],
		...overrides
	};
}

/** A decider that answers every noul from a ref → probability table. */
function tableDecider(
	table: Record<string, number>
): JevDecider & { decide: ReturnType<typeof vi.fn> } {
	return {
		decide: vi.fn(async (request: { questions: Record<string, unknown> }) => ({
			ok: true as const,
			answers: Object.fromEntries(
				Object.keys(request.questions).map((ref) => [
					ref,
					{ type: 'noul', noul: table[ref] ?? 0 }
				])
			),
			receipt: {
				modelRequested: 'typesafe/jev-1.13',
				modelUsed: 'typesafe/jev-1.13',
				requestId: null,
				inputTokens: 1000,
				outputTokens: 0,
				costUsd: 0.00004,
				durationMs: 300,
				requestBytes: 1000,
				questionCount: Object.keys(request.questions).length,
				attempts: 1
			},
			rawResponse: null
		}))
	} as never;
}

function memoryLedger(
	seed: Record<string, { relevance: number; relevant: boolean }> = {}
): EmailScanLedger & {
	rows: Map<string, { relevance: number; relevant: boolean }>;
	record: ReturnType<typeof vi.fn>;
} {
	const rows = new Map(Object.entries(seed));
	return {
		rows,
		load: vi.fn(async ({ messageIds }) => {
			const found = new Map();
			for (const id of messageIds) if (rows.has(id)) found.set(id, rows.get(id)!);
			return found;
		}),
		record: vi.fn(async ({ rows: written }) => {
			for (const row of written)
				rows.set(row.messageId, { relevance: row.relevance, relevant: row.relevant });
		})
	};
}

function deps(
	overrides: Partial<EmailScanDeps> & { messages?: GmailInboxScanMessage[] } = {}
): EmailScanDeps & {
	gateway: { scanInboxWindow: ReturnType<typeof vi.fn>; getMessage: ReturnType<typeof vi.fn> };
} {
	const messages = overrides.messages ?? [message('a'), message('b'), message('c')];
	const gateway = {
		scanInboxWindow: vi.fn(
			async (params: {
				skipFetch?: (ids: readonly string[]) => Promise<ReadonlySet<string>>;
			}) => {
				const listed = messages.map((entry) => entry.messageId);
				const skipped = params.skipFetch
					? await params.skipFetch(listed)
					: new Set<string>();
				return {
					account: {
						connectionId: CONNECTION_ID,
						accountLabel: 'DJ',
						emailAddress: 'dj@9takes.com',
						status: 'success' as const
					},
					listedMessageIds: listed,
					truncated: false,
					messages: messages.filter((entry) => !skipped.has(entry.messageId)),
					failedMessageCount: 0
				};
			}
		),
		getMessage: vi.fn(async () => ({
			bodyText: 'Full body text of the email.',
			bodyTruncated: false
		}))
	};
	return {
		gateway,
		listAccounts: async () => [
			{
				connectionId: CONNECTION_ID,
				emailAddress: 'dj@9takes.com',
				accountLabel: 'DJ',
				status: 'active',
				readEnabled: true
			}
		],
		ledger: null,
		decider: tableDecider({}),
		loadProjectBrief: async () => ({
			name: '9takes',
			description: 'Personality and enneagram content platform',
			currentState: 'Launching the creator program.',
			recentWork: ['Creator outreach list', 'Substack migration']
		}),
		...overrides
	} as never;
}

const WINDOW = {
	userId: USER_ID,
	afterMs: Date.parse('2026-09-24T04:00:00.000Z'),
	beforeMs: Date.parse('2026-09-24T20:00:00.000Z'),
	maxPerAccount: 100,
	lookingFor: null,
	projectId: PROJECT_ID
};

describe('email relevance (Jev)', () => {
	it('asks one noul per email and names each email in its instruction', () => {
		const request = buildEmailRelevanceRequest({ scope: 'attention' }, [
			{
				ref: 'e0',
				inbox: 'dj@9takes.com',
				from: 'A',
				to: 'B',
				subject: 'Hi',
				date: '2026-09-24T12:00:00.000Z',
				labelIds: ['CATEGORY_PROMOTIONS', 'Label_42'],
				snippet: 'x'.repeat(500)
			}
		]);
		expect(request.questions).toEqual({
			e0: { type: 'noul', instructions: 'Is email e0 relevant to the target?' }
		});
		const emails = request.state.emails as Array<Record<string, unknown>>;
		expect(emails[0]!.category).toEqual(['promotions']);
		expect((emails[0]!.snippet as string).length).toBe(300);
		expect(request.state.project).toBeUndefined();
	});

	it('splits large scans into parallel decisions and joins the scores', async () => {
		const items = Array.from({ length: EMAILS_PER_RELEVANCE_DECISION + 5 }, (_, index) => ({
			ref: `e${index}`,
			inbox: 'dj@9takes.com',
			from: 'A',
			to: 'B',
			subject: 'S',
			date: '2026-09-24T12:00:00.000Z',
			labelIds: [],
			snippet: 'hello'
		}));
		const decider = tableDecider({ e0: 0.9, e84: 0.7 });
		const result = await scoreEmailRelevance({ decider, focus: { scope: 'attention' }, items });
		expect(decider.decide).toHaveBeenCalledTimes(2);
		expect(result.ok && result.scores.get('e84')).toBe(0.7);
		expect(result.ok && result.scores.size).toBe(items.length);
	});

	it('fails the whole scoring when any decision fails', async () => {
		const decider = {
			decide: vi.fn(async () => ({ ok: false, error: 'jev_timeout', receipt: {} }))
		} as never as JevDecider;
		const result = await scoreEmailRelevance({
			decider,
			focus: { scope: 'attention' },
			items: [
				{
					ref: 'e0',
					inbox: 'a',
					from: 'a',
					to: 'b',
					subject: 's',
					date: 'd',
					labelIds: [],
					snippet: 'x'
				}
			]
		});
		expect(result).toEqual({ ok: false, error: 'jev_timeout' });
	});

	it('keeps clear matches and close runners-up, never weak ones', () => {
		expect(isRelevantEmailScore(0.55, 0.95)).toBe(true);
		expect(isRelevantEmailScore(0.45, 0.6)).toBe(true);
		expect(isRelevantEmailScore(0.45, 0.95)).toBe(false);
		expect(isRelevantEmailScore(0.25, 0.3)).toBe(false);
	});
});

describe('email search provenance (Jev)', () => {
	it('allows at or above the threshold and fails closed on Jev errors', async () => {
		const allow = new JevEmailSearchProvenanceJudge(tableDecider({ serves_request: 0.82 }));
		await expect(
			allow.authorize({
				userMessage: 'check my email for the Conductor offer',
				query: 'Conductor offer'
			})
		).resolves.toEqual({ allowed: true, probability: 0.82 });

		const deny = new JevEmailSearchProvenanceJudge(tableDecider({ serves_request: 0.2 }));
		await expect(
			deny.authorize({ userMessage: 'Summarize my project.', query: 'password reset' })
		).resolves.toEqual({ allowed: false, probability: 0.2 });

		const broken = new JevEmailSearchProvenanceJudge({
			decide: vi.fn(async () => ({ ok: false, error: 'jev_timeout', receipt: {} }))
		} as never);
		await expect(
			broken.authorize({ userMessage: 'check my email', query: 'x' })
		).resolves.toEqual({ allowed: false, probability: null });
	});

	it('shows Jev the user message and the proposed query, nothing else', () => {
		const request = buildEmailSearchProvenanceRequest(
			'find the invoice from Stripe',
			'from:stripe invoice'
		);
		expect(request.state).toMatchObject({
			user_message: 'find the invoice from Stripe',
			proposed_gmail_query: 'from:stripe invoice'
		});
		expect(Object.keys(request.questions)).toEqual(['serves_request']);
	});
});

describe('email scan ledger', () => {
	it('keys project scopes stably and hashes looking_for text', () => {
		expect(
			emailScanScopeKey({ scope: 'project', projectId: PROJECT_ID, lookingFor: null })
		).toBe(`project:${PROJECT_ID}:v1`);
		const first = emailScanScopeKey({
			scope: 'request',
			projectId: null,
			lookingFor: 'Replies  from Conductor'
		});
		const second = emailScanScopeKey({
			scope: 'request',
			projectId: null,
			lookingFor: 'replies from conductor'
		});
		expect(first).toBe(second);
		expect(first).toMatch(/^request:[0-9a-f]{32}:v1$/);
		expect(first).not.toContain('conductor');
		expect(emailScanScopeKey({ scope: 'attention', projectId: null, lookingFor: null })).toBe(
			'attention:0:v1'
		);
	});

	it('stores HMAC message keys and scores only, and reads them back', async () => {
		const upserted: Record<string, unknown>[] = [];
		const selectChain: Record<string, unknown> = {};
		let selectedKeys: string[] = [];
		const chain = (terminal: () => Promise<unknown>) => {
			const query: Record<string, unknown> = {};
			for (const method of ['select', 'eq', 'gt', 'lt', 'delete'])
				query[method] = () => query;
			query.in = (_column: string, values: string[]) => {
				selectedKeys = values;
				return query;
			};
			query.upsert = async (rows: Record<string, unknown>[]) => {
				upserted.push(...rows);
				return { error: null };
			};
			query.then = (
				resolve: (value: unknown) => unknown,
				reject: (reason: unknown) => unknown
			) => terminal().then(resolve, reject);
			return query;
		};
		const client = {
			from: () =>
				chain(async () => ({
					data: upserted
						.filter((row) => selectedKeys.includes(String(row.message_key)))
						.map((row) => ({
							message_key: row.message_key,
							relevance: row.relevance,
							relevant: row.relevant
						})),
					error: null
				}))
		};
		void selectChain;
		const ledger = new SupabaseEmailScanLedger(client as never, 'x'.repeat(40));
		await ledger.record({
			userId: USER_ID,
			connectionId: CONNECTION_ID,
			scopeKey: `project:${PROJECT_ID}:v1`,
			rows: [{ messageId: 'gmail-msg-1', relevance: 0.91, relevant: true }]
		});
		expect(upserted).toHaveLength(1);
		expect(upserted[0]).toMatchObject({
			relevance: 0.91,
			relevant: true,
			scope_key: `project:${PROJECT_ID}:v1`
		});
		expect(String(upserted[0]!.message_key)).toMatch(/^[0-9a-f]{32}$/);
		expect(JSON.stringify(upserted)).not.toContain('gmail-msg-1');

		const found = await ledger.load({
			userId: USER_ID,
			connectionId: CONNECTION_ID,
			scopeKey: `project:${PROJECT_ID}:v1`,
			messageIds: ['gmail-msg-1', 'gmail-msg-2']
		});
		expect([...found.entries()]).toEqual([
			['gmail-msg-1', { relevance: 0.91, relevant: true }]
		]);
	});

	it('degrades to "nothing checked" when the table is unavailable', async () => {
		const onError = vi.fn();
		const failing = {
			from: () => {
				throw new Error('relation "email_scan_checks" does not exist');
			}
		};
		const ledger = new SupabaseEmailScanLedger(failing as never, 'x'.repeat(40), { onError });
		await expect(
			ledger.load({
				userId: USER_ID,
				connectionId: CONNECTION_ID,
				scopeKey: 'attention:0:v1',
				messageIds: ['m']
			})
		).resolves.toEqual(new Map());
		await expect(
			ledger.record({
				userId: USER_ID,
				connectionId: CONNECTION_ID,
				scopeKey: 'attention:0:v1',
				rows: [{ messageId: 'm', relevance: 0.1, relevant: false }]
			})
		).resolves.toBeUndefined();
		expect(onError).toHaveBeenCalledTimes(2);
	});
});

describe('runEmailInboxScan', () => {
	it('scores new mail against the project, keeps the relevant, and opens the top matches', async () => {
		const decider = tableDecider({ e0: 0.93, e1: 0.12, e2: 0.61 });
		const ledger = memoryLedger();
		const scanDeps = deps({ decider, ledger });
		const result = await runEmailInboxScan(USER_ID, WINDOW, scanDeps);

		expect(result.scope).toBe('project');
		expect(result.scopeLabel).toBe('the project "9takes"');
		expect(result.filter).toBe('scored');
		expect(result.relevant.map((entry) => [entry.messageId, entry.relevance])).toEqual([
			['a', 0.93],
			['c', 0.61]
		]);
		expect(result.relevant[0]!.bodyExcerpt).toBe('Full body text of the email.');
		expect(result.otherSenders).toEqual([{ from: 'Sender b', count: 1 }]);
		expect(result.accounts[0]).toMatchObject({
			inWindow: 3,
			newlyChecked: 3,
			previouslyChecked: 0
		});
		const state = decider.decide.mock.calls[0]![0].state as Record<string, any>;
		expect(state.project.name).toBe('9takes');
		expect(state.emails.map((entry: { ref: string }) => entry.ref)).toEqual(['e0', 'e1', 'e2']);

		await vi.waitFor(() => expect(ledger.record).toHaveBeenCalledTimes(1));
		expect(ledger.record.mock.calls[0]![0]).toMatchObject({
			scopeKey: `project:${PROJECT_ID}:v1`
		});
		expect([...ledger.rows.keys()].sort()).toEqual(['a', 'b', 'c']);
	});

	it('skips mail an earlier scan scored, re-reading only earlier relevant mail', async () => {
		const decider = tableDecider({ e0: 0.2 });
		const ledger = memoryLedger({
			a: { relevance: 0.88, relevant: true },
			b: { relevance: 0.05, relevant: false }
		});
		const scanDeps = deps({ decider, ledger });
		const result = await runEmailInboxScan(USER_ID, WINDOW, scanDeps);

		// a (earlier relevant) is re-read and shown; b is skipped; c is new and scored.
		const firstScan = await scanDeps.gateway.scanInboxWindow.mock.results[0]!.value;
		expect(firstScan.messages.map((entry: GmailInboxScanMessage) => entry.messageId)).toEqual([
			'a',
			'c'
		]);
		expect(decider.decide).toHaveBeenCalledTimes(1);
		const state = decider.decide.mock.calls[0]![0].state as Record<string, any>;
		expect(state.emails).toHaveLength(1);
		expect(result.relevant).toEqual([
			expect.objectContaining({ messageId: 'a', relevance: 0.88, previouslyChecked: true })
		]);
		expect(result.accounts[0]).toMatchObject({ newlyChecked: 1, previouslyChecked: 2 });
	});

	it('does not call Jev when every message was already scored', async () => {
		const decider = tableDecider({});
		const ledger = memoryLedger({
			a: { relevance: 0.1, relevant: false },
			b: { relevance: 0.1, relevant: false },
			c: { relevance: 0.1, relevant: false }
		});
		const scanDeps = deps({ decider, ledger });
		const result = await runEmailInboxScan(USER_ID, WINDOW, scanDeps);
		expect(decider.decide).not.toHaveBeenCalled();
		expect(scanDeps.gateway.getMessage).not.toHaveBeenCalled();
		expect(result.relevant).toEqual([]);
		expect(result.filter).toBe('scored');
	});

	it('falls back to the newest mail, unscored, when Jev fails, and writes no ledger rows', async () => {
		const ledger = memoryLedger();
		const decider = {
			decide: vi.fn(async () => ({ ok: false, error: 'jev_timeout', receipt: {} }))
		} as never as JevDecider;
		const result = await runEmailInboxScan(USER_ID, WINDOW, deps({ decider, ledger }));
		expect(result.filter).toBe('unscored');
		expect(result.relevant).toHaveLength(3);
		expect(result.relevant.every((entry) => entry.relevance === null)).toBe(true);
		expect(ledger.record).not.toHaveBeenCalled();
	});

	it('uses looking_for as the target and keys the ledger on its hash', async () => {
		const decider = tableDecider({ e0: 0.9 });
		const ledger = memoryLedger();
		const result = await runEmailInboxScan(
			USER_ID,
			{ ...WINDOW, lookingFor: 'replies from ConductorAI' },
			deps({ decider, ledger })
		);
		expect(result.scope).toBe('request');
		expect(result.scopeLabel).toBe('"replies from ConductorAI"');
		const state = decider.decide.mock.calls[0]![0].state as Record<string, any>;
		expect(state.target).toContain('replies from ConductorAI');
		await vi.waitFor(() => expect(ledger.record).toHaveBeenCalled());
		expect(ledger.record.mock.calls[0]![0].scopeKey).toMatch(/^request:/);
	});

	it('judges attention and skips ledger writes when the project brief fails to load', async () => {
		const decider = tableDecider({ e0: 0.9 });
		const ledger = memoryLedger();
		const result = await runEmailInboxScan(
			USER_ID,
			WINDOW,
			deps({ decider, ledger, loadProjectBrief: async () => null })
		);
		expect(result.scope).toBe('attention');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(ledger.record).not.toHaveBeenCalled();
	});

	it('refuses an account the user does not own and never scans a reconnect-required one', async () => {
		await expect(
			runEmailInboxScan(USER_ID, { ...WINDOW, connectionIds: ['not-mine'] }, deps())
		).rejects.toMatchObject({
			name: 'AgenticChatEmailReadErrorV1',
			code: 'connection_not_found'
		});

		const scanDeps = deps({
			listAccounts: async () => [
				{
					connectionId: CONNECTION_ID,
					emailAddress: 'dj@9takes.com',
					accountLabel: 'DJ',
					status: 'reconnect_required',
					readEnabled: true
				}
			]
		});
		const result = await runEmailInboxScan(USER_ID, WINDOW, scanDeps);
		expect(scanDeps.gateway.scanInboxWindow).not.toHaveBeenCalled();
		expect(result.accounts[0]!.status).toBe('reconnect_required');
	});

	it('passes the window to Gmail as epoch seconds', async () => {
		const scanDeps = deps();
		await runEmailInboxScan(USER_ID, WINDOW, scanDeps);
		expect(scanDeps.gateway.scanInboxWindow).toHaveBeenCalledWith(
			expect.objectContaining({
				afterEpochSeconds: WINDOW.afterMs / 1000,
				beforeEpochSeconds: WINDOW.beforeMs / 1000,
				maxResults: 100
			})
		);
	});
});
