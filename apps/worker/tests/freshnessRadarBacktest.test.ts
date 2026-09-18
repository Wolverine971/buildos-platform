// apps/worker/tests/freshnessRadarBacktest.test.ts
//
// Tasker 88 Lane B: the read-only backtest harness (plan sections 7 and 9).
// Offline only: no database, no network. Jev is a scripted JevDecider behind the
// harness's cache; datasets are built in memory or written to an OS temp dir.
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JevDecider, JevDecisionResult, JevQuestionSet } from '@buildos/smart-llm';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
	type BacktestDataset,
	BacktestJev,
	ReadOnlyViolation,
	auroc,
	buildLedgerReport,
	buildReplayReport,
	checkOptIn,
	labelEntity,
	labelRetire,
	parseBacktestArgs,
	parseDataset,
	prAuc,
	readOnlyClient,
	rebuildSignals,
	reconstructEntity,
	replayDataset,
	runBacktestCli
} from '../scripts/freshness-radar-backtest';

const MODEL = 'typesafe/jev-1.13';
const TODAY = '2026-09-18';
const NOW = new Date('2026-09-18T15:00:00.000Z');
const temp = mkdtempSync(join(tmpdir(), 'freshness-backtest-test-'));
afterAll(() => rmSync(temp, { recursive: true, force: true }));

// ---------------------------------------------------------------------------
// A small history: on Sep 1 the user says the deck is done and the venue moved;
// the deck was marked done a day later and the venue date moved to Oct 3.
// ---------------------------------------------------------------------------

const U = '11111111-1111-4111-8111-111111111111';
const P = '33333333-3333-4333-8333-333333333333';
const S = '44444444-4444-4444-8444-444444444444';
const T_DECK = 'aaaaaaa1-0000-4000-8000-000000000001';
const T_VENUE = 'aaaaaaa1-0000-4000-8000-000000000002';
const T_CATERING = 'aaaaaaa1-0000-4000-8000-000000000003';
const T_SIGNAGE = 'aaaaaaa1-0000-4000-8000-000000000004';
const G_OPEN = 'bbbbbbb1-0000-4000-8000-000000000001';
const S_OLD = 'eeeeeee1-0000-4000-8000-000000000001';
const INBOX_OLD = 'fffffff1-0000-4000-8000-000000000001';
const DUMP =
	'Quick update on the store. The investor deck is done and sent to Jen. The venue contract is now due Oct 3. Still waiting on the caterer quote.';
const CREATED = '2026-08-20T12:00:00.000Z';

function task(id: string, title: string, extra: Record<string, unknown> = {}) {
	return {
		id,
		project_id: P,
		title,
		description: null,
		state_key: 'todo',
		start_at: null,
		due_at: null,
		props: {},
		created_at: CREATED,
		updated_at: CREATED,
		archived_at: null,
		deleted_at: null,
		completed_at: null,
		...extra
	};
}

function log(
	entityId: string,
	at: string,
	before: Record<string, unknown> | null,
	after: Record<string, unknown> | null,
	extra: Record<string, unknown> = {}
) {
	return {
		project_id: P,
		entity_type: 'task',
		entity_id: entityId,
		action: 'updated',
		chat_session_id: null,
		changed_by: U,
		change_source: 'ui',
		created_at: at,
		before_data: before,
		after_data: after,
		...extra
	};
}

function history(): BacktestDataset {
	return parseDataset({
		readAt: NOW.toISOString(),
		userId: U,
		timezone: 'America/New_York',
		actorId: '22222222-2222-4222-8222-222222222222',
		window: { from: '2026-09-01T00:00:00.000Z', to: '2026-09-05T00:00:00.000Z' },
		sessions: [
			{
				id: S,
				user_id: U,
				context_type: 'project',
				entity_id: P,
				created_at: '2026-09-01T14:00:00.000Z',
				updated_at: '2026-09-01T14:51:00.000Z'
			}
		],
		turns: [
			{
				id: 'turn-1',
				session_id: S,
				user_id: U,
				project_id: P,
				status: 'completed',
				request_message: DUMP,
				mutation_reserved_at: null,
				user_message_id: 'm-1',
				created_at: '2026-09-01T14:50:00.000Z',
				finished_at: '2026-09-01T14:50:30.000Z'
			}
		],
		messages: [
			{
				id: 'm-1',
				session_id: S,
				role: 'user',
				content: DUMP,
				created_at: '2026-09-01T14:50:00.000Z',
				metadata: {}
			}
		],
		projects: [
			{
				id: P,
				name: 'Pop-up store',
				description: 'Open the pop-up store',
				deleted_at: null,
				archived_at: null
			}
		],
		tasks: [
			task(T_DECK, 'Investor deck', {
				state_key: 'done',
				updated_at: '2026-09-02T10:00:00.000Z'
			}),
			task(T_VENUE, 'Venue contract', {
				due_at: '2026-10-04T03:59:59.000Z',
				updated_at: '2026-09-03T10:00:00.000Z'
			}),
			task(T_CATERING, 'Caterer quote'),
			task(T_SIGNAGE, 'Signage order', {
				due_at: '2026-09-25T03:59:59.000Z',
				updated_at: '2026-09-15T10:00:00.000Z'
			})
		],
		goals: [
			{
				id: G_OPEN,
				project_id: P,
				name: 'Open the store',
				description: null,
				goal: null,
				state_key: 'active',
				target_date: '2026-10-31',
				props: {},
				created_at: CREATED,
				updated_at: CREATED,
				archived_at: null,
				deleted_at: null,
				completed_at: null
			}
		],
		edges: [
			{
				project_id: P,
				src_kind: 'goal',
				src_id: G_OPEN,
				dst_kind: 'task',
				dst_id: T_DECK,
				rel: 'has_task',
				created_at: CREATED
			}
		],
		logs: [
			log(
				T_DECK,
				'2026-09-02T10:00:00.000Z',
				{ state_key: 'in_progress' },
				{ state_key: 'done' }
			),
			log(
				T_VENUE,
				'2026-09-03T10:00:00.000Z',
				{ due_at: '2026-10-01T03:59:59.000Z' },
				{ due_at: '2026-10-04T03:59:59.000Z' }
			),
			// Changed after the horizon, with no before value: partial at T.
			log(T_SIGNAGE, '2026-09-15T10:00:00.000Z', {}, { due_at: '2026-09-25T03:59:59.000Z' })
		],
		suggestions: [
			{
				id: S_OLD,
				project_id: P,
				kind: 'task_conflict',
				status: 'rejected',
				operations: [
					{ tool: 'update_onto_task', args: { task_id: T_DECK, props: { x: 1 } } }
				],
				title: 'Resolve the investor deck overlap',
				created_at: '2026-08-28T12:00:00.000Z',
				updated_at: '2026-09-03T12:00:00.000Z',
				decided_at: '2026-09-03T12:00:00.000Z'
			}
		],
		inboxItems: [
			{
				id: INBOX_OLD,
				source_type: 'project_suggestion',
				source_ref_id: S_OLD,
				source_status: 'rejected',
				project_id: P,
				audience: 'project_members',
				status: 'decided',
				title: 'Resolve the investor deck overlap',
				summary: null,
				risk_tier: 2,
				snoozed_until: null,
				expires_at: null,
				created_at: '2026-08-28T12:00:00.000Z',
				updated_at: '2026-09-03T12:00:00.000Z',
				decided_at: '2026-09-03T12:00:00.000Z',
				freshness_state: 'fresh',
				freshness_flag_id: null
			}
		]
	});
}

const choice = (options: string[], chosen: string, probability: number) => ({
	type: 'choice',
	choice: chosen,
	confidence: probability,
	probabilities: Object.fromEntries(
		options.map((option) => [
			option,
			option === chosen ? probability : (1 - probability) / (options.length - 1)
		])
	)
});

/** Scripted Jev: the deck is done, the venue moved to d1, the old item is obsolete. */
function scriptedJev(): JevDecider & { calls: number } {
	const decider = {
		calls: 0,
		decide: async <Qs extends JevQuestionSet>(req: { state: unknown; questions: Qs }) => {
			decider.calls += 1;
			const titles = (
				(req.state as { entities?: Array<{ title: string }> }).entities ?? []
			).map((entity) => entity.title);
			const deck = titles.indexOf('Investor deck');
			const venue = titles.indexOf('Venue contract');
			const answers: Record<string, unknown> = {};
			for (const [key, question] of Object.entries(req.questions)) {
				const options = question.type === 'choice' ? Object.keys(question.criteria) : [];
				if (question.type === 'noul') answers[key] = { type: 'noul', noul: 0.05 };
				else if (question.type === 'choice')
					answers[key] = choice(
						options,
						options.includes('no_change_needed')
							? 'no_change_needed'
							: options.includes('none')
								? 'none'
								: options[0]!,
						0.9
					);
				else
					answers[key] = {
						type: 'score',
						score: 2,
						confidence: 0.8,
						probabilities: { '0': 0, '1': 0, '2': 1, '3': 0 }
					};
				if (key === 'status_news') answers[key] = { type: 'noul', noul: 0.97 };
				if (key === `stale_${deck}`) answers[key] = { type: 'noul', noul: 0.97 };
				if (key === `change_${deck}`) answers[key] = choice(options, 'mark_done', 0.96);
				if (key === `stale_${venue}`) answers[key] = { type: 'noul', noul: 0.8 };
				if (key === `change_${venue}`)
					answers[key] = choice(options, 'reschedule_due', 0.85);
				if (key === `date_${venue}`) answers[key] = choice(options, 'd1', 0.9);
				if (key === 'obsolete_0') answers[key] = { type: 'noul', noul: 0.95 };
			}
			return {
				ok: true,
				answers,
				receipt: {
					modelRequested: MODEL,
					modelUsed: `${MODEL}-20260917`,
					requestId: 'gen-local',
					inputTokens: 1_000,
					outputTokens: 100,
					costUsd: 0.0002,
					durationMs: 400,
					requestBytes: 1,
					questionCount: Object.keys(req.questions).length,
					attempts: 1
				},
				rawResponse: { answers }
			} as unknown as JevDecisionResult<Qs>;
		}
	};
	return decider;
}

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

describe('read-only client', () => {
	function fakeClient() {
		const reads: string[] = [];
		const builder = (table: string) => {
			const chain: Record<string, unknown> = {
				select: () => chain,
				eq: () => chain,
				range: () => Promise.resolve({ data: [{ table }], error: null }),
				insert: vi.fn(),
				update: vi.fn(),
				upsert: vi.fn(),
				delete: vi.fn()
			};
			reads.push(table);
			return chain;
		};
		return {
			reads,
			client: {
				from: builder,
				rpc: vi.fn(),
				storage: { from: vi.fn() },
				functions: { invoke: vi.fn() },
				channel: vi.fn()
			}
		};
	}

	it('lets reads through and throws on every write and rpc', async () => {
		const { client, reads } = fakeClient();
		const db = readOnlyClient(client) as any;
		await expect(db.from('onto_tasks').select('id').eq('id', 'x').range(0, 9)).resolves.toEqual(
			{
				data: [{ table: 'onto_tasks' }],
				error: null
			}
		);
		expect(reads).toEqual(['onto_tasks']);
		for (const method of ['insert', 'update', 'upsert', 'delete']) {
			expect(() => db.from('onto_tasks')[method]({})).toThrow(ReadOnlyViolation);
		}
		// Chained builders stay guarded too.
		expect(() => (db.from('onto_tasks').select('id') as any).update({})).toThrow(
			/onto_tasks.update\(\) is blocked/
		);
		expect(() => db.rpc('add_queue_job', {})).toThrow(/rpc\(add_queue_job\) is blocked/);
		expect(() => db.storage).toThrow(ReadOnlyViolation);
		expect(() => db.functions).toThrow(ReadOnlyViolation);
		expect(() => db.channel('x')).toThrow(ReadOnlyViolation);
		expect(client.rpc).not.toHaveBeenCalled();
	});
});

describe('the triple opt-in', () => {
	const full = { FRESHNESS_BACKTEST_DJ_OK: 'yes' };

	it('needs the env flag, a confirm token dated today, and --execute', () => {
		expect(checkOptIn({ execute: true, confirm: `DJ-OK:${TODAY}` }, full, TODAY)).toEqual({
			ok: true
		});
		expect(checkOptIn({ execute: true, confirm: `DJ-OK:${TODAY}` }, {}, TODAY)).toEqual({
			ok: false,
			missing: ['FRESHNESS_BACKTEST_DJ_OK=yes']
		});
		expect(checkOptIn({ execute: true, confirm: 'DJ-OK:2026-09-17' }, full, TODAY)).toEqual({
			ok: false,
			missing: [`--confirm DJ-OK:${TODAY}`]
		});
		expect(checkOptIn({ execute: false, confirm: null }, {}, TODAY)).toMatchObject({
			ok: false,
			missing: ['FRESHNESS_BACKTEST_DJ_OK=yes', `--confirm DJ-OK:${TODAY}`, '--execute']
		});
	});

	it('the CLI never builds a database client without all three', async () => {
		const createDb = vi.fn();
		const lines: string[] = [];
		const io = { log: (line: string) => void lines.push(line), now: () => NOW, createDb };
		const dbArgs = ['--db-url', 'https://example.supabase.co', '--user', U];

		expect(await runBacktestCli(dbArgs, {}, io)).toBe(0); // dry run
		expect(lines.join('\n')).toMatch(/DRY RUN: nothing was read/);
		expect(lines.join('\n')).toContain('database example.supabase.co (read-only proxy)');

		expect(await runBacktestCli([...dbArgs, '--execute'], full, io)).toBe(3);
		expect(
			await runBacktestCli(
				[...dbArgs, '--execute', '--confirm', 'DJ-OK:2026-09-17'],
				full,
				io
			)
		).toBe(3);
		expect(
			await runBacktestCli([...dbArgs, '--execute', '--confirm', `DJ-OK:${TODAY}`], {}, io)
		).toBe(3);
		// All three, but no key: still refused before any client exists.
		expect(
			await runBacktestCli([...dbArgs, '--execute', '--confirm', `DJ-OK:${TODAY}`], full, io)
		).toBe(3);
		expect(createDb).not.toHaveBeenCalled();
		expect(lines.filter((line) => line.startsWith('Refused'))).toHaveLength(4);
	});

	it('refuses live Jev on a fixture without the opt-in, and bad arguments', async () => {
		const fixture = join(temp, 'refuse.json');
		writeFileSync(fixture, JSON.stringify(history()));
		const io = { log: () => undefined, now: () => NOW };
		expect(await runBacktestCli(['--fixture', fixture, '--jev', 'live'], {}, io)).toBe(3);
		expect(await runBacktestCli(['--bogus'], {}, io)).toBe(2);
		expect(parseBacktestArgs(['--jev', 'maybe']).errors).toContain(
			'--jev must be off, cache or live'
		);
		expect(
			parseBacktestArgs(['--fixture', 'a.json', '--db-url', 'https://x.test']).errors
		).toContain('use --fixture or --db-url, not both');
	});
});

// ---------------------------------------------------------------------------
// Reconstruction, signals, labels, metrics
// ---------------------------------------------------------------------------

describe('as-of reconstruction', () => {
	const T = '2026-09-01T14:51:30.000Z';
	const dataset = history();
	const row = (id: string) => dataset.tasks.find((entry) => entry.id === id)! as any;
	const logsOf = (id: string) => dataset.logs.filter((entry) => entry.entity_id === id);

	it('reverses later logs field by field', () => {
		const deck = reconstructEntity('task', row(T_DECK), logsOf(T_DECK), T)!;
		expect(deck.row.state_key).toBe('in_progress');
		expect(deck.partial.size).toBe(0);
		expect(deck.row.updated_at).toBe(CREATED);
		const venue = reconstructEntity('task', row(T_VENUE), logsOf(T_VENUE), T)!;
		expect(venue.row.due_at).toBe('2026-10-01T03:59:59.000Z');
	});

	it('flags partial fields: a later log without a before value, or an unlogged change', () => {
		const signage = reconstructEntity('task', row(T_SIGNAGE), logsOf(T_SIGNAGE), T)!;
		expect([...signage.partial]).toEqual(['due_at']);
		const unlogged = reconstructEntity(
			'task',
			{ ...row(T_CATERING), updated_at: '2026-09-10T00:00:00.000Z' },
			[],
			T
		)!;
		expect(unlogged.partial).toContain('state_key');
		expect(unlogged.partial).toContain('updated_at');
	});

	it('drops rows created later and restores rows deleted later', () => {
		expect(
			reconstructEntity(
				'task',
				row(T_CATERING),
				[
					log(
						T_CATERING,
						'2026-09-02T00:00:00.000Z',
						null,
						{ title: 'x' },
						{
							action: 'created'
						}
					)
				],
				T
			)
		).toBeNull();
		const hardDeleted = reconstructEntity(
			'task',
			null,
			[
				log(
					'gone',
					'2026-09-03T00:00:00.000Z',
					{
						id: 'gone',
						project_id: P,
						title: 'Old task',
						created_at: CREATED,
						updated_at: CREATED
					},
					null,
					{ action: 'deleted' }
				)
			],
			T
		)!;
		expect(hardDeleted.row.title).toBe('Old task');
		expect(hardDeleted.row.deleted_at).toBeNull();
		expect(hardDeleted.partial).toContain('state_key');
	});
});

describe('pseudo-signals', () => {
	const turn = (id: string, at: string, extra: Record<string, unknown> = {}) => ({
		id,
		session_id: S,
		user_id: U,
		project_id: P,
		status: 'completed',
		request_message: DUMP,
		mutation_reserved_at: null,
		user_message_id: null,
		created_at: at,
		finished_at: at,
		...extra
	});
	const window = { from: '2026-09-01T00:00:00.000Z', to: '2026-09-02T00:00:00.000Z' };

	it('debounces like the trigger: 60s quiet, 10 minute cap, admission rules', () => {
		const turns = [
			turn('a', '2026-09-01T10:00:00.000Z'),
			turn('b', '2026-09-01T10:00:40.000Z'),
			turn('short', '2026-09-01T10:01:00.000Z', { request_message: 'ok thanks' }),
			turn('workflow', '2026-09-01T10:01:10.000Z'),
			turn('c', '2026-09-01T10:05:00.000Z')
		];
		const signals = rebuildSignals(turns, new Set(['workflow']), window);
		expect(signals.map((signal) => [signal.turnIds, signal.dueAt])).toEqual([
			[['a', 'b'], '2026-09-01T10:01:40.000Z'],
			[['c'], '2026-09-01T10:06:00.000Z']
		]);
		const busy = Array.from({ length: 12 }, (_, index) =>
			turn(
				`t${index}`,
				new Date(Date.parse('2026-09-01T11:00:00.000Z') + index * 55_000).toISOString()
			)
		);
		const capped = rebuildSignals(busy, new Set(), window);
		expect(capped[0]!.dueAt).toBe('2026-09-01T11:10:00.000Z');
		expect(capped[0]!.turnIds).toHaveLength(11);
	});
});

describe('labels', () => {
	const dataset = history();
	const at = '2026-09-01T14:51:30.000Z';
	const base = { dataset, projectId: P, kind: 'task' as const, at, horizonDays: 7 };

	it('positive when a non-radar edit changed the entity, and grades the proposal', () => {
		expect(
			labelEntity({ ...base, id: T_DECK, proposal: { field: 'state_key', to: 'done' } })
		).toEqual({
			label: 'positive',
			reason: 'field_changed_within_horizon',
			proposalCorrect: true
		});
		expect(
			labelEntity({ ...base, id: T_VENUE, proposal: { field: 'due_at', to: '2026-10-03' } })
		).toMatchObject({ label: 'positive', proposalCorrect: true });
		expect(
			labelEntity({ ...base, id: T_VENUE, proposal: { field: 'due_at', to: '2026-10-10' } })
				.proposalCorrect
		).toBe(false);
	});

	it('negative when nothing changed; excluded when partial, radar-written or open', () => {
		expect(labelEntity({ ...base, id: T_CATERING, proposal: null })).toEqual({
			label: 'negative',
			reason: 'unchanged_within_horizon',
			proposalCorrect: null
		});
		expect(labelEntity({ ...base, id: T_SIGNAGE, proposal: null })).toMatchObject({
			label: 'excluded',
			reason: 'partial_reconstruction'
		});
		const radar = {
			...dataset,
			logs: dataset.logs.map((entry) =>
				entry.entity_id === T_DECK ? { ...entry, change_source: 'freshness_radar' } : entry
			)
		};
		// The radar's own write is not evidence; the end state still differs.
		expect(labelEntity({ ...base, dataset: radar, id: T_DECK, proposal: null })).toMatchObject({
			label: 'positive',
			reason: 'known_field_differs'
		});
		expect(
			labelEntity({ ...base, at: '2026-09-15T00:00:00.000Z', id: T_CATERING, proposal: null })
		).toMatchObject({ label: 'excluded', reason: 'horizon_open' });
	});

	it('retire is correct only when the source was later dismissed or superseded', () => {
		expect(labelRetire(dataset, S_OLD)).toBe('correct');
		const approved = {
			...dataset,
			suggestions: dataset.suggestions.map((row) => ({ ...row, status: 'applied' }))
		};
		expect(labelRetire(approved, S_OLD)).toBe('incorrect');
		expect(labelRetire(dataset, null)).toBe('excluded');
	});
});

describe('metrics', () => {
	it('AUROC and PR-AUC on known points, with ties', () => {
		const perfect = [
			{ p: 0.9, y: 1 as const },
			{ p: 0.8, y: 1 as const },
			{ p: 0.2, y: 0 as const }
		];
		expect(auroc(perfect)).toBe(1);
		expect(prAuc(perfect)).toBe(1);
		const tied = [
			{ p: 0.5, y: 1 as const },
			{ p: 0.5, y: 0 as const }
		];
		expect(auroc(tied)).toBe(0.5);
		expect(prAuc(tied)).toBe(0.5);
		expect(auroc([{ p: 0.5, y: 1 }])).toBeNull();
	});

	it('ledger mode calibrates from live outcomes', () => {
		const report = buildLedgerReport({
			...history(),
			ledgerFlags: [
				{
					id: '1',
					subject_kind: 'task',
					probability: 0.95,
					disposition: 'auto_applied',
					outcome: 'stale',
					outcome_source: 'auto_applied_kept',
					created_at: at()
				},
				{
					id: '2',
					subject_kind: 'task',
					probability: 0.3,
					disposition: 'evaluated',
					outcome: 'not_stale',
					outcome_source: 'unchanged_within_horizon',
					created_at: at()
				},
				{
					id: '3',
					subject_kind: 'inbox_item',
					probability: 0.92,
					disposition: 'retired',
					outcome: 'stale',
					outcome_source: 'user_dismissed',
					created_at: at()
				}
			]
		});
		expect(report.calibration).toMatchObject({ n: 2, auroc: 1 });
		expect(report.autoApplied).toEqual({ judged: 1, kept: 1 });
		expect(report.retire).toEqual({ judged: 1, precision: 1 });
		function at() {
			return '2026-09-02T00:00:00.000Z';
		}
	});
});

// ---------------------------------------------------------------------------
// End to end: the same stages as live, over the as-of port
// ---------------------------------------------------------------------------

describe('replay', () => {
	it('replays history through the live stages, caches Jev, and reports', async () => {
		const dataset = history();
		const cacheDir = join(temp, 'jev-cache');
		const decider = scriptedJev();
		const first = new BacktestJev({
			mode: 'live',
			model: MODEL,
			cacheDir,
			inline: {},
			live: decider,
			timeoutMs: 5_000
		});
		const replay = await replayDataset({ dataset, jev: first, model: MODEL });
		expect(replay.signals).toHaveLength(1);
		expect(replay.scans).toHaveLength(1);
		const scan = replay.scans[0]!;
		expect(scan).toMatchObject({
			status: 'decided',
			projectId: P,
			at: '2026-09-01T14:51:30.000Z'
		});
		expect(scan.requests.map((request) => [request.name, request.source])).toEqual([
			['r1', 'live'],
			['r2', 'live'],
			['r3', 'live']
		]);
		const byTitle = new Map(scan.entities.map((entity) => [entity.title, entity]));
		expect(byTitle.get('Investor deck')).toMatchObject({
			wouldAutoApply: true,
			proposal: { field: 'state_key', from: 'in_progress', to: 'done' }
		});
		expect(byTitle.get('Venue contract')).toMatchObject({
			disposition: 'drafted',
			cardRank: 0,
			proposal: { field: 'due_at', from: '2026-09-30', to: '2026-10-03' }
		});
		expect(byTitle.get('Signage order')!.partialFields).toEqual(['due_at']);
		expect(scan.inbox).toEqual([
			expect.objectContaining({
				inboxItemId: INBOX_OLD,
				suggestionId: S_OLD,
				action: 'retire'
			})
		]);

		const report = buildReplayReport({
			dataset,
			signals: replay.signals,
			scans: replay.scans,
			horizonDays: 7,
			jev: {
				mode: 'live',
				hits: first.hits,
				misses: first.misses,
				liveCalls: first.liveCalls
			}
		});
		expect(report.labels.byLabel).toMatchObject({ positive: 2, excluded: 1 });
		expect(report.calibration.auroc).toBe(1);
		expect(report.wouldAutoApply).toMatchObject({
			n: 1,
			judged: 1,
			precision: 1,
			meetsTarget: true
		});
		expect(report.cardTop3).toEqual({ n: 1, precision: 1 });
		expect(report.retire).toEqual({ n: 1, judged: 1, precision: 1 });
		expect(report.scans.partialEntities).toBe(1);

		// Cache mode replays byte-identical requests without calling Jev.
		const cached = new BacktestJev({
			mode: 'cache',
			model: MODEL,
			cacheDir,
			inline: {},
			live: null,
			timeoutMs: 5_000
		});
		const again = await replayDataset({ dataset, jev: cached, model: MODEL });
		expect(cached).toMatchObject({ hits: 3, misses: 0, liveCalls: 0 });
		expect(decider.calls).toBe(3);
		expect(again.scans[0]!.entities).toEqual(scan.entities);

		// Off: the requests are still planned, nothing is decided, like a failed live scan.
		const off = await replayDataset({
			dataset,
			jev: new BacktestJev({
				mode: 'off',
				model: MODEL,
				cacheDir: null,
				inline: {},
				live: null,
				timeoutMs: 5_000
			}),
			model: MODEL
		});
		expect(off.scans[0]).toMatchObject({
			status: 'unanswered',
			reason: 'jev_off',
			entities: []
		});
	});

	it('the CLI replays a fixture offline and redacts text by default', async () => {
		const dataset = history();
		// Warm a cache with the scripted Jev, then ship it inside the fixture.
		const warmDir = join(temp, 'fixture-cache');
		await replayDataset({
			dataset,
			model: MODEL,
			jev: new BacktestJev({
				mode: 'live',
				model: MODEL,
				cacheDir: warmDir,
				inline: {},
				live: scriptedJev(),
				timeoutMs: 5_000
			})
		});
		const jevCache = Object.fromEntries(
			readdirSync(warmDir).map((file) => [
				file.replace(/\.json$/, ''),
				JSON.parse(readFileSync(join(warmDir, file), 'utf8'))
			])
		);
		expect(Object.keys(jevCache)).toHaveLength(3);
		const fixture = join(temp, 'history.json');
		writeFileSync(fixture, JSON.stringify({ ...dataset, jevCache }));

		const out = join(temp, 'out');
		const lines: string[] = [];
		const code = await runBacktestCli(
			['--fixture', fixture, '--out', out, '--cache-dir', join(temp, 'empty-cache')],
			{},
			{ log: (line) => void lines.push(line), now: () => NOW }
		);
		expect(code).toBe(0);
		const printed = lines.join('\n');
		expect(printed).toContain('READ PLAN');
		expect(printed).toContain('writes:   none');
		expect(printed).toMatch(/AUROC 1\.000/);
		const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
		expect(report.jev).toMatchObject({ mode: 'cache', hits: 3, misses: 0, liveCalls: 0 });
		const scans = readFileSync(join(out, 'scans.jsonl'), 'utf8');
		expect(scans).toContain('[redacted:');
		expect(scans).not.toContain('now due Oct 3');
	});
});
