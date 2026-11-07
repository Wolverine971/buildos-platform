// apps/web/src/lib/server/email-project-updates.service.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@buildos/shared-agent-ops/gateway/op-execution-gateway', () => ({
	runGatewayWriteOp: vi.fn()
}));

import {
	checkEmailUpdates,
	decideEmailUpdate,
	emailProjectUpdatesUserIds,
	emailUpdateHeadline,
	gmailThreadUrl,
	runEmailProjectUpdates
} from './email-project-updates.service';

type Result = { data: any; error: any };
type Op = { table: string; action: string; payload?: any; filters: Array<[string, unknown]> };

/** Chainable Supabase stand-in: results keyed `table:action` (or `table`), every call recorded. */
function fakeDb(results: Record<string, Result | ((op: Op) => Result)>) {
	const ops: Op[] = [];
	const from = (table: string) => {
		const op: Op = { table, action: 'select', filters: [] };
		ops.push(op);
		const resolve = () => {
			const entry = results[`${table}:${op.action}`] ?? results[table];
			if (typeof entry === 'function') return entry(op);
			return entry ?? { data: op.action === 'select' ? [] : null, error: null };
		};
		const b: any = {
			select: () => b,
			order: () => b,
			limit: () => b,
			insert: (payload: any) => ((op.action = 'insert'), (op.payload = payload), b),
			update: (payload: any) => ((op.action = 'update'), (op.payload = payload), b),
			single: () => Promise.resolve(resolve()),
			maybeSingle: () => Promise.resolve(resolve()),
			then: (ok: any, bad: any) => Promise.resolve(resolve()).then(ok, bad)
		};
		for (const name of ['eq', 'in', 'is', 'lt', 'gte', 'neq']) {
			b[name] = (column: string, value: unknown) => (
				op.filters.push([`${name}:${column}`, value]),
				b
			);
		}
		return b;
	};
	return { db: { from: vi.fn(from) }, ops };
}

const projects = [
	{
		ref: 'P1',
		id: 'proj-1',
		name: 'Acme rebrand',
		description: null,
		tasks: [
			{
				ref: 'T1',
				id: 'task-1',
				title: 'Send quote',
				state_key: 'todo',
				due_at: '2026-11-10T23:59:00Z'
			}
		]
	}
];
const emails = [
	{
		ref: 'E1',
		message: {
			connectionId: 'conn-1',
			accountLabel: 'Work',
			emailAddress: 'dj@example.com',
			messageId: 'msg-1',
			threadId: 'thr-1',
			subject: 'Quote',
			from: 'Jane Doe <jane@acme.com>',
			internalDate: '2026-11-05T15:00:00.000Z',
			snippet: 'Can we push to the 14th?',
			to: 'dj@example.com',
			labelIds: ['INBOX']
		}
	}
];

describe('allowlist', () => {
	it('takes exact user ids only, never a wildcard', () => {
		expect(
			emailProjectUpdatesUserIds(' 255735ad-a34b-4ca9-942c-397ed8cc1435 , *, nope')
		).toEqual(['255735ad-a34b-4ca9-942c-397ed8cc1435']);
		expect(emailProjectUpdatesUserIds(undefined)).toEqual([]);
	});
});

describe('checkEmailUpdates', () => {
	it('keeps real changes and drops invented refs, no-ops, and duplicates', () => {
		const out = checkEmailUpdates(
			{
				updates: [
					{
						email: 'E1',
						project: 'P1',
						action: 'update_task',
						task: 'T1',
						due_date: '2026-11-14',
						why: 'Jane asked to push.'
					},
					{
						email: 'E1',
						project: 'P1',
						action: 'update_task',
						task: 'T1',
						due_date: '2026-11-20'
					},
					{ email: 'E1', project: 'P9', action: 'create_task', title: 'Ghost project' },
					{ email: 'E7', project: 'P1', action: 'create_task', title: 'Ghost email' },
					{
						email: 'E1',
						project: 'P1',
						action: 'update_task',
						task: 'T1',
						due_date: '2026-11-10',
						state: 'todo'
					},
					{ email: 'E1', project: 'P1', action: 'create_task', title: '  ' },
					{
						email: 'E1',
						project: 'P1',
						action: 'create_task',
						title: 'Book kickoff',
						due_date: 'next week'
					},
					{ email: 'E1', project: 'P1', action: 'delete_project' }
				]
			},
			projects,
			emails as never
		);
		expect(out).toHaveLength(2);
		expect(out[0]).toMatchObject({
			action: 'update_task',
			taskId: 'task-1',
			proposal: { due_date: '2026-11-14' },
			why: 'Jane asked to push.'
		});
		// A bad date is dropped from the task, not the task itself.
		expect(out[1]).toMatchObject({
			action: 'create_task',
			proposal: { title: 'Book kickoff' }
		});
		expect(out[1]!.proposal.due_date).toBeUndefined();
	});

	it('returns nothing for a malformed reply', () => {
		expect(checkEmailUpdates(null, projects, emails as never)).toEqual([]);
		expect(checkEmailUpdates({ updates: 'x' }, projects, emails as never)).toEqual([]);
	});
});

describe('card wording', () => {
	it('is written by code from the checked change', () => {
		expect(
			emailUpdateHeadline({
				action: 'create_task',
				proposal: { title: 'Send deck', due_date: '2026-11-14' }
			})
		).toBe('New task: Send deck (due Sat, Nov 14)');
		expect(
			emailUpdateHeadline({
				action: 'update_task',
				proposal: { due_date: '2026-11-14' },
				taskTitle: 'Send quote'
			})
		).toBe('Move "Send quote" to Sat, Nov 14');
		expect(
			emailUpdateHeadline({
				action: 'update_task',
				proposal: { state_key: 'done', due_date: '2026-11-14' },
				taskTitle: 'Send quote'
			})
		).toBe('Mark "Send quote" done, due Sat, Nov 14');
		expect(gmailThreadUrl({ account_email: 'dj@example.com', thread_id: 'thr-1' })).toBe(
			'https://mail.google.com/mail/?authuser=dj%40example.com#all/thr-1'
		);
	});
});

describe('runEmailProjectUpdates', () => {
	const now = new Date('2026-11-06T10:30:00Z');

	function setup(overrides: Record<string, Result | ((op: Op) => Result)> = {}) {
		const { db, ops } = fakeDb({
			'email_project_update_runs:select': {
				data: { window_end: '2026-11-05T10:30:00Z' },
				error: null
			},
			'email_project_update_runs:insert': { data: { id: 'run-1' }, error: null },
			user_email_connections: {
				data: [{ id: 'conn-1', email_address: 'dj@example.com' }],
				error: null
			},
			onto_actors: { data: { id: 'actor-1' }, error: null },
			onto_project_members: { data: [{ project_id: 'proj-1' }], error: null },
			onto_projects: {
				data: [{ id: 'proj-1', name: 'Acme rebrand', description: null }],
				error: null
			},
			onto_tasks: {
				data: [
					{
						id: 'task-1',
						project_id: 'proj-1',
						title: 'Send quote',
						state_key: 'todo',
						due_at: '2026-11-10T23:59:00Z'
					}
				],
				error: null
			},
			'email_project_updates:select': { data: [{ message_id: 'msg-old' }], error: null },
			...overrides
		});
		const gateway = {
			scanInboxWindow: vi.fn(async (params: any) => {
				const skipped = await params.skipFetch(['msg-1', 'msg-promo', 'msg-old']);
				const all = [
					{ ...emails[0]!.message },
					{
						...emails[0]!.message,
						messageId: 'msg-promo',
						subject: '50% off',
						labelIds: ['INBOX', 'CATEGORY_PROMOTIONS']
					}
				];
				return {
					account: {
						connectionId: 'conn-1',
						emailAddress: 'dj@example.com',
						status: 'success'
					},
					messages: all.filter((m) => !skipped.has(m.messageId)),
					truncated: false
				};
			})
		};
		const llm = {
			getJSONResponse: vi.fn().mockResolvedValue({
				updates: [
					{
						email: 'E1',
						project: 'P1',
						action: 'update_task',
						task: 'T1',
						due_date: '2026-11-14',
						why: 'Jane asked to move the quote to the 14th.'
					}
				]
			})
		};
		return { db, ops, gateway, llm };
	}

	it('reads since the last run, skips promotions and mail already proposed, saves cards', async () => {
		const { db, ops, gateway, llm } = setup();
		const summary = await runEmailProjectUpdates({
			admin: db,
			userId: 'user-1',
			gateway,
			llm,
			now,
			timeZone: 'America/New_York'
		});

		expect(gateway.scanInboxWindow).toHaveBeenCalledWith(
			expect.objectContaining({
				connectionId: 'conn-1',
				afterEpochSeconds: Date.parse('2026-11-05T10:30:00Z') / 1000
			})
		);
		const prompt = llm.getJSONResponse.mock.calls[0]![0].userPrompt as string;
		expect(prompt).toContain('Today: 2026-11-06');
		expect(prompt).toContain('E1 |');
		expect(prompt).not.toContain('50% off');
		expect(llm.getJSONResponse.mock.calls[0]![0]).toMatchObject({
			operationType: 'email_project_updates',
			userId: 'user-1'
		});

		const insert = ops.find(
			(op) => op.table === 'email_project_updates' && op.action === 'insert'
		);
		expect(insert?.payload).toEqual([
			expect.objectContaining({
				project_id: 'proj-1',
				action: 'update_task',
				task_id: 'task-1',
				title: 'Move "Send quote" to Sat, Nov 14',
				message_id: 'msg-1',
				run_id: 'run-1',
				email: expect.objectContaining({ subject: 'Quote', thread_id: 'thr-1' })
			})
		]);
		const finished = ops.filter(
			(op) => op.table === 'email_project_update_runs' && op.action === 'update'
		);
		expect(finished.at(-1)?.payload).toMatchObject({
			status: 'completed',
			emails_read: 1,
			suggestions_created: 1
		});
		expect(summary).toMatchObject({ status: 'completed', emailsRead: 1, accountsRead: 1 });
		expect(summary.suggestions).toHaveLength(1);
	});

	it('dry run proposes but saves no cards', async () => {
		const { db, ops, gateway, llm } = setup();
		const summary = await runEmailProjectUpdates({
			admin: db,
			userId: 'user-1',
			gateway,
			llm,
			now,
			dryRun: true
		});
		expect(summary.status).toBe('dry_run');
		expect(summary.suggestions).toHaveLength(1);
		expect(
			ops.some((op) => op.table === 'email_project_updates' && op.action !== 'select')
		).toBe(false);
	});

	it('makes no model call when no mail arrived', async () => {
		const { db, llm } = setup();
		const gateway = {
			scanInboxWindow: vi.fn().mockResolvedValue({
				account: {
					connectionId: 'conn-1',
					emailAddress: 'dj@example.com',
					status: 'success'
				},
				messages: [],
				truncated: false
			})
		};
		const summary = await runEmailProjectUpdates({
			admin: db,
			userId: 'user-1',
			gateway,
			llm,
			now
		});
		expect(llm.getJSONResponse).not.toHaveBeenCalled();
		expect(summary).toMatchObject({ status: 'completed', emailsRead: 0 });
	});

	it('fails the run (window not advanced) when no account can be read', async () => {
		const { db, ops, llm } = setup();
		const gateway = { scanInboxWindow: vi.fn().mockRejectedValue(new Error('token revoked')) };
		const summary = await runEmailProjectUpdates({
			admin: db,
			userId: 'user-1',
			gateway,
			llm,
			now
		});
		expect(summary.status).toBe('failed');
		expect(
			ops
				.filter((op) => op.table === 'email_project_update_runs' && op.action === 'update')
				.at(-1)?.payload
		).toMatchObject({ status: 'failed' });
	});

	it('first run reads the last 24 hours', async () => {
		const { db, gateway, llm } = setup({
			'email_project_update_runs:select': { data: null, error: null }
		});
		await runEmailProjectUpdates({ admin: db, userId: 'user-1', gateway, llm, now });
		expect(gateway.scanInboxWindow.mock.calls[0]![0].afterEpochSeconds).toBe(
			(now.getTime() - 24 * 3600_000) / 1000
		);
	});
});

describe('decideEmailUpdate', () => {
	const pending = {
		id: 'upd-1',
		user_id: 'user-1',
		project_id: 'proj-1',
		action: 'create_task',
		task_id: null,
		proposal: { title: 'Send revised deck', due_date: '2026-11-14' },
		email: { subject: 'Deck', from: 'Jane Doe <jane@acme.com>' },
		status: 'pending'
	};

	it('creates the task through the write gateway, fenced to the card’s project', async () => {
		const { db, ops } = fakeDb({
			'email_project_updates:select': { data: pending, error: null }
		});
		const runWrite = vi.fn().mockResolvedValue({ ok: true, entityId: 'task-new' });
		const userDb = { tag: 'user' };
		const result = await decideEmailUpdate({
			admin: db,
			userDb,
			userId: 'user-1',
			id: 'upd-1',
			decision: 'apply',
			runWrite
		});
		expect(result).toEqual({ ok: true, status: 'applied', task_id: 'task-new' });
		expect(runWrite).toHaveBeenCalledWith({
			admin: userDb,
			userId: 'user-1',
			scope: {
				mode: 'read_write',
				allowed_ops: ['onto.task.create'],
				project_ids: ['proj-1'],
				write_project_ids: ['proj-1']
			},
			op: 'onto.task.create',
			args: {
				project_id: 'proj-1',
				title: 'Send revised deck',
				description: 'From an email from Jane Doe <jane@acme.com>: "Deck"',
				due_at: '2026-11-14',
				calendar_sync: 'none'
			}
		});
		expect(ops.find((op) => op.action === 'update')?.payload).toMatchObject({
			status: 'applied',
			task_id: 'task-new'
		});
	});

	it('updates an existing task and keeps the card when the write is refused', async () => {
		const { db, ops } = fakeDb({
			'email_project_updates:select': {
				data: {
					...pending,
					action: 'update_task',
					task_id: 'task-1',
					proposal: { state_key: 'done' }
				},
				error: null
			}
		});
		const runWrite = vi.fn().mockResolvedValue({
			ok: false,
			error: { code: 'FORBIDDEN', message: 'No write access' }
		});
		const result = await decideEmailUpdate({
			admin: db,
			userDb: {},
			userId: 'user-1',
			id: 'upd-1',
			decision: 'apply',
			runWrite
		});
		expect(runWrite.mock.calls[0]![0]).toMatchObject({
			op: 'onto.task.update',
			args: { task_id: 'task-1', state_key: 'done', calendar_sync: 'none' }
		});
		expect(result).toMatchObject({ ok: false, reason: 'failed', message: 'No write access' });
		expect(ops.find((op) => op.action === 'update')?.payload).not.toHaveProperty('status');
	});

	it('dismisses, and refuses a card that was already handled', async () => {
		const { db, ops } = fakeDb({
			'email_project_updates:select': { data: pending, error: null }
		});
		expect(
			await decideEmailUpdate({
				admin: db,
				userDb: {},
				userId: 'user-1',
				id: 'upd-1',
				decision: 'dismiss'
			})
		).toEqual({ ok: true, status: 'dismissed' });
		expect(ops.find((op) => op.action === 'update')?.payload).toMatchObject({
			status: 'dismissed'
		});

		const done = fakeDb({
			'email_project_updates:select': { data: { ...pending, status: 'applied' }, error: null }
		});
		expect(
			await decideEmailUpdate({
				admin: done.db,
				userDb: {},
				userId: 'user-1',
				id: 'upd-1',
				decision: 'apply'
			})
		).toMatchObject({ ok: false, reason: 'already_decided' });
	});
});
