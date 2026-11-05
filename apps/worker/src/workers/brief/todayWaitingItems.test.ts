// apps/worker/src/workers/brief/todayWaitingItems.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase.js', () => ({ supabase: {} }));
vi.mock('../../lib/services/smart-llm-service.js', () => ({
	SmartLLMService: vi.fn(() => {
		throw new Error('tests must inject an llm');
	})
}));

import {
	type TodayWaitingInputs,
	type WaitingTaskInput,
	buildRefMaps,
	refreshTodayWaitingItems,
	selectWaitingTasks,
	validateWaitingResponse
} from './todayWaitingItems';

type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

/** In-memory Supabase stand-in: applies eq/is/in filters, upsert on a key, and update. */
function fakeDb(tables: Tables) {
	const writes: Array<{ table: string; op: string; payload: unknown }> = [];
	const from = (table: string) => {
		const rows = (tables[table] ??= []);
		const filters: Array<(row: Row) => boolean> = [];
		let mode: 'select' | 'update' = 'select';
		let patch: Row = {};
		let limitN: number | null = null;
		const run = () => {
			const matched = rows.filter((row) => filters.every((f) => f(row)));
			if (mode === 'update') {
				matched.forEach((row) => Object.assign(row, patch));
				writes.push({ table, op: 'update', payload: patch });
			}
			return limitN === null ? matched : matched.slice(0, limitN);
		};
		const builder: any = {
			select: () => builder,
			eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), builder),
			is: (col: string, val: unknown) => (
				filters.push((r) => (r[col] ?? null) === val),
				builder
			),
			in: (col: string, vals: unknown[]) => (
				filters.push((r) => vals.includes(r[col])),
				builder
			),
			or: () => builder,
			order: () => builder,
			limit: (n: number) => ((limitN = n), builder),
			maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
			update: (p: Row) => ((mode = 'update'), (patch = p), builder),
			upsert: (payload: Row[]) => {
				writes.push({ table, op: 'upsert', payload });
				for (const item of payload) {
					const hit = rows.find(
						(r) => r.user_id === item.user_id && r.item_key === item.item_key
					);
					if (hit) Object.assign(hit, item);
					else rows.push({ status: 'open', ...item });
				}
				return Promise.resolve({ error: null });
			},
			then: (resolve: (value: unknown) => void) => resolve({ data: run(), error: null })
		};
		return builder;
	};
	return { client: { from } as any, writes, tables };
}

const NOW = new Date('2026-11-04T12:00:00Z');
const USER = 'user-1';

function baseTables(extra: Tables = {}): Tables {
	return {
		onto_project_members: [{ actor_id: 'actor-1', project_id: 'proj-a', removed_at: null }],
		onto_projects: [
			{
				id: 'proj-a',
				name: 'Beyond Exit Planning',
				next_step_short: "Record DJ intro for Rod's approval",
				next_step_long: null,
				updated_at: '2026-10-04T00:00:00Z',
				state_key: 'active',
				deleted_at: null,
				archived_at: null
			}
		],
		onto_tasks: [
			{
				id: 'task-1',
				project_id: 'proj-a',
				title: "Get Matt's OK on the pitch",
				description: null,
				state_key: 'blocked',
				due_at: null,
				updated_at: '2026-10-08T00:00:00Z',
				created_at: '2026-10-08T00:00:00Z',
				deleted_at: null,
				archived_at: null
			}
		],
		today_waiting_items: [],
		users: [{ id: USER, name: 'DJ' }],
		...extra
	};
}

const llmReturning = (response: unknown) => ({
	getJSONResponse: vi.fn().mockResolvedValue(response)
});

const inputs: TodayWaitingInputs = {
	userName: 'DJ',
	projects: [
		{ id: 'proj-a', name: 'A', next_step_short: null, next_step_long: null, updated_at: null }
	],
	tasks: [
		{
			id: 'task-1',
			project_id: 'proj-a',
			title: 't',
			description: null,
			state_key: 'blocked',
			due_at: null,
			updated_at: null,
			created_at: null
		}
	],
	existing: []
};

afterEach(() => {
	delete process.env.TODAY_WAITING_ITEMS;
});

describe('validateWaitingResponse', () => {
	const refs = buildRefMaps(inputs);
	const good = {
		key: 'Matt pitch OK',
		direction: 'on_them',
		who: 'Matt',
		who_kind: 'person',
		what: 'OK on the pitch',
		project_ref: 'P1',
		task_ref: 'T1',
		since: '2026-10-08'
	};

	it('maps refs to ids and normalizes the key', () => {
		const out = validateWaitingResponse({ items: [good] }, refs, new Set(), '2026-11-04');
		expect(out.items).toEqual([
			{
				item_key: 'matt-pitch-ok',
				direction: 'on_them',
				who: 'Matt',
				who_kind: 'person',
				what: 'OK on the pitch',
				project_id: 'proj-a',
				task_id: 'task-1',
				since: '2026-10-08'
			}
		]);
		expect(out.dropped).toBe(0);
	});

	it('drops unknown refs, bad enums, empty fields and duplicate keys', () => {
		const out = validateWaitingResponse(
			{
				items: [
					{ ...good, key: 'a', project_ref: 'P9', task_ref: null },
					{ ...good, key: 'b', task_ref: 'T9' },
					{ ...good, key: 'c', direction: 'sideways' },
					{ ...good, key: 'd', who_kind: 'robot' },
					{ ...good, key: 'e', who: '' },
					{ ...good, key: '!!!' },
					good,
					{ ...good, what: 'duplicate key' },
					'not an object'
				]
			},
			refs,
			new Set(),
			'2026-11-04'
		);
		expect(out.items.map((i) => i.item_key)).toEqual(['matt-pitch-ok']);
		expect(out.dropped).toBe(8);
	});

	it('takes the project from the task, clears future or malformed dates, and caps at 12', () => {
		const many = Array.from({ length: 15 }, (_, i) => ({
			...good,
			key: `k${i}`,
			project_ref: 'P1',
			since: i === 0 ? '2026-12-01' : i === 1 ? '2026-02-30' : '2026-10-01'
		}));
		const out = validateWaitingResponse({ items: many }, refs, new Set(), '2026-11-04');
		expect(out.items).toHaveLength(12);
		expect(out.items[0].since).toBeNull();
		expect(out.items[1].since).toBeNull();
		expect(out.items[2].since).toBe('2026-10-01');
		expect(out.dropped).toBe(3);
	});

	it('only resolves keys that were open and are not listed again', () => {
		const out = validateWaitingResponse(
			{ items: [good], resolved_keys: ['old-ask', 'matt-pitch-ok', 'never-existed', 42] },
			refs,
			new Set(['old-ask', 'matt-pitch-ok']),
			'2026-11-04'
		);
		expect(out.resolvedKeys).toEqual(['old-ask']);
	});

	it('survives a missing or malformed response', () => {
		expect(validateWaitingResponse(null, refs, new Set(), '2026-11-04').items).toEqual([]);
		expect(
			validateWaitingResponse({ items: 'nope' } as any, refs, new Set(), '2026-11-04').items
		).toEqual([]);
	});
});

describe('selectWaitingTasks', () => {
	const task = (over: Partial<WaitingTaskInput>): WaitingTaskInput => ({
		id: 'x',
		project_id: 'p',
		title: 't',
		description: null,
		state_key: 'todo',
		due_at: null,
		updated_at: null,
		created_at: null,
		...over
	});

	it('keeps blocked, recent, and due-soon tasks; blocked first', () => {
		const out = selectWaitingTasks(
			[
				task({ id: 'stale', updated_at: '2026-08-01T00:00:00Z' }),
				task({ id: 'recent', updated_at: '2026-11-01T00:00:00Z' }),
				task({
					id: 'due',
					updated_at: '2026-08-01T00:00:00Z',
					due_at: '2026-11-10T00:00:00Z'
				}),
				task({
					id: 'old-blocked',
					state_key: 'blocked',
					updated_at: '2026-05-01T00:00:00Z'
				}),
				task({ id: 'done', state_key: 'done', updated_at: '2026-11-03T00:00:00Z' })
			],
			NOW
		);
		expect(out.map((t) => t.id)).toEqual(['old-blocked', 'recent', 'due']);
	});
});

describe('refreshTodayWaitingItems', () => {
	const params = (client: any, llm: any) => ({
		supabase: client,
		userId: USER,
		actorId: 'actor-1',
		timezone: 'America/New_York',
		briefDate: '2026-11-04',
		llm,
		now: NOW
	});

	it('skips without a model call when switched off', async () => {
		process.env.TODAY_WAITING_ITEMS = 'off';
		const db = fakeDb(baseTables());
		const llm = llmReturning({ items: [] });
		const out = await refreshTodayWaitingItems(params(db.client, llm));
		expect(out).toEqual({ status: 'skipped', reason: 'disabled' });
		expect(llm.getJSONResponse).not.toHaveBeenCalled();
	});

	it('skips when the person has no projects', async () => {
		const db = fakeDb(baseTables({ onto_projects: [] }));
		const llm = llmReturning({ items: [] });
		const out = await refreshTodayWaitingItems(params(db.client, llm));
		expect(out).toEqual({ status: 'skipped', reason: 'no_projects' });
		expect(llm.getJSONResponse).not.toHaveBeenCalled();
	});

	it('saves new asks, never reopens dismissed ones, and resolves finished ones', async () => {
		const db = fakeDb(
			baseTables({
				today_waiting_items: [
					{
						user_id: USER,
						item_key: 'rod-intro',
						status: 'dismissed',
						who: 'Rod',
						what: 'old',
						direction: 'on_you',
						since: null
					},
					{
						user_id: USER,
						item_key: 'logan-offer',
						status: 'open',
						who: 'Logan',
						what: 'offer',
						direction: 'on_them',
						since: '2026-10-31'
					},
					{
						user_id: USER,
						item_key: 'cody-balance',
						status: 'open',
						who: 'Cody',
						what: 'balance',
						direction: 'on_them',
						since: null
					}
				]
			})
		);
		const llm = llmReturning({
			items: [
				{
					key: 'rod-intro',
					direction: 'on_you',
					who: 'Rod',
					who_kind: 'person',
					what: 'Waiting on your intro',
					project_ref: 'P1',
					task_ref: null,
					since: '2026-10-04'
				},
				{
					key: 'matt-pitch',
					direction: 'on_them',
					who: 'Matt',
					who_kind: 'person',
					what: 'OK on the pitch',
					project_ref: 'P1',
					task_ref: 'T1',
					since: '2026-10-08'
				},
				{
					key: 'logan-offer',
					direction: 'on_them',
					who: 'Logan',
					who_kind: 'person',
					what: 'Your $1,000 offer',
					project_ref: 'P1',
					task_ref: null,
					since: '2026-11-01'
				}
			],
			resolved_keys: ['cody-balance']
		});

		const out = await refreshTodayWaitingItems(params(db.client, llm));

		expect(out).toEqual({ status: 'refreshed', saved: 2, resolved: 1, dropped: 0, kept: 1 });
		const rows = db.tables.today_waiting_items;
		const byKey = Object.fromEntries(rows.map((r) => [r.item_key, r]));
		expect(byKey['rod-intro']).toMatchObject({ status: 'dismissed', what: 'old' });
		expect(byKey['matt-pitch']).toMatchObject({
			status: 'open',
			task_id: 'task-1',
			project_id: 'proj-a'
		});
		// The first-seen date sticks; the text refreshes.
		expect(byKey['logan-offer']).toMatchObject({
			status: 'open',
			since: '2026-10-31',
			what: 'Your $1,000 offer'
		});
		expect(byKey['cody-balance']).toMatchObject({ status: 'resolved' });
		const upsert = db.writes.find((w) => w.op === 'upsert')!.payload as Row[];
		expect(upsert.every((row) => !('status' in row))).toBe(true);

		const prompt = (llm.getJSONResponse.mock.calls[0] as any[])[0];
		expect(prompt.operationType).toBe('today_waiting_items');
		expect(prompt.userPrompt).toContain(
			"P1 Beyond Exit Planning | next step: Record DJ intro for Rod's approval"
		);
		expect(prompt.userPrompt).toContain("T1 [P1] Get Matt's OK on the pitch | state blocked");
		expect(prompt.userPrompt).toContain('logan-offer | on_them | Logan | offer');
	});
});
