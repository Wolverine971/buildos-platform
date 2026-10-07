// apps/worker/src/workers/task-entities/extractTaskEntitiesWorker.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { JSONRequestOptions } from '@buildos/smart-llm';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../lib/services/smart-llm-service', () => ({ SmartLLMService: vi.fn() }));

import { processExtractTaskEntitiesJob } from './extractTaskEntitiesWorker';
import {
	TASK_ENTITY_EXTRACTOR_VERSION,
	describeReferenceDate,
	taskEntitySourceHash
} from './task-entity-prompt';

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

type Row = Record<string, unknown>;

/** In-memory tables with just the query surface the worker uses. */
function fakeDb(
	tables: Record<string, Row[]>,
	opts: { onTaskRead?: (count: number) => void } = {}
) {
	let taskReads = 0;
	const db = {
		from(table: string) {
			const rows = (tables[table] ??= []);
			const filters: Array<(row: Row) => boolean> = [];
			let mode: 'select' | 'update' | 'delete' = 'select';
			let patch: Row = {};
			const matching = () => rows.filter((row) => filters.every((keep) => keep(row)));
			const run = () => {
				if (mode === 'update') matching().forEach((row) => Object.assign(row, patch));
				if (mode === 'delete') {
					const doomed = new Set(matching());
					tables[table] = rows.filter((row) => !doomed.has(row));
				}
				return {
					data: mode === 'select' ? matching().map((row) => ({ ...row })) : null,
					error: null
				};
			};
			const query = {
				select: () => query,
				eq: (column: string, value: unknown) => {
					filters.push((row) => row[column] === value);
					return query;
				},
				is: (column: string, value: unknown) => {
					filters.push((row) => (row[column] ?? null) === value);
					return query;
				},
				in: (column: string, values: unknown[]) => {
					filters.push((row) => values.includes(row[column]));
					return query;
				},
				update: (values: Row) => {
					mode = 'update';
					patch = values;
					return query;
				},
				delete: () => {
					mode = 'delete';
					return query;
				},
				maybeSingle: () => {
					const result = {
						data: matching()[0] ? { ...matching()[0] } : null,
						error: null
					};
					if (table === 'onto_tasks') opts.onTaskRead?.(++taskReads);
					return Promise.resolve(result);
				},
				upsert: (values: Row | Row[], options?: { onConflict?: string }) => {
					const keys = (options?.onConflict ?? 'id').split(',');
					for (const value of Array.isArray(values) ? values : [values]) {
						const found = rows.find((row) =>
							keys.every((key) => row[key] === value[key])
						);
						if (found) Object.assign(found, value);
						else rows.push({ id: `row-${rows.length + 1}`, ...value });
					}
					return Promise.resolve({ error: null });
				},
				then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve)
			};
			return query;
		}
	};
	return db as never;
}

const TEXT_TITLE = 'Call True North Roofing: ask for Bruce P. (443-555-0164)';
const TEXT_DESCRIPTION =
	'Voicemail: your name, Glen Burnie, 410-555-0152, try again Thursday. Zoom if on job sites.';

function baseTables(extra: Record<string, Row[]> = {}) {
	return {
		onto_tasks: [
			{
				id: TASK_ID,
				project_id: PROJECT_ID,
				title: TEXT_TITLE,
				description: TEXT_DESCRIPTION,
				deleted_at: null,
				updated_at: '2026-10-06T13:00:00Z',
				created_at: '2026-10-06T12:00:00Z'
			}
		],
		users: [
			{ id: USER_ID, name: 'DJ Wayne', email: 'dj@example.com', timezone: 'America/New_York' }
		],
		user_sms_preferences: [{ user_id: USER_ID, phone_number: '+14105550152' }],
		user_email_connections: [
			{ user_id: USER_ID, email_address: 'DJ@WayneStrategies.example', deleted_at: null },
			{
				user_id: USER_ID,
				email_address: 'old@example.com',
				deleted_at: '2026-01-01T00:00:00Z'
			}
		],
		user_calendar_connections: [
			{ user_id: USER_ID, email_address: 'dj@9takes.example', deleted_at: null }
		],
		...extra
	};
}

const job = () =>
	({
		id: 'job-1',
		userId: USER_ID,
		data: { taskId: TASK_ID, projectId: PROJECT_ID, userId: USER_ID },
		attempts: 0,
		signal: new AbortController().signal,
		log: vi.fn(),
		updateProgress: vi.fn()
	}) as never;

const answer = {
	entities: [
		{
			kind: 'person',
			value: 'Bruce P.',
			display: 'Bruce P.',
			quote: 'Bruce P.',
			about: 'True North Roofing',
			role: 'primary',
			confidence: 'high'
		},
		{
			kind: 'phone',
			value: '+14435550164',
			quote: '443-555-0164',
			about: 'True North Roofing',
			role: 'primary'
		},
		{ kind: 'phone', value: '+14105550152', quote: '410-555-0152', role: 'primary' },
		{
			kind: 'time',
			value: '2026-10-08',
			display: 'Thu Oct 8',
			quote: 'try again Thursday',
			role: 'follow_up'
		}
	]
};

function llm(result: unknown) {
	const model = {
		async getJSONResponse<T>(options: JSONRequestOptions): Promise<T> {
			await options.onUsage?.({
				model: 'deepseek/deepseek-v4-flash',
				promptTokens: 100,
				completionTokens: 50,
				totalTokens: 150,
				inputCost: 0.0001,
				outputCost: 0.0003,
				totalCost: 0.0004,
				costSource: 'provider_reported'
			});
			return result as T;
		}
	};
	vi.spyOn(model, 'getJSONResponse');
	return model;
}

describe('processExtractTaskEntitiesJob', () => {
	it('reads the task once, stores checked entities as suggestions, and records the text hash', async () => {
		const tables = baseTables();
		const model = llm(answer);
		const result = await processExtractTaskEntitiesJob(job(), {
			supabase: fakeDb(tables),
			llm: model,
			now: () => new Date('2026-10-07T12:00:00Z')
		});

		expect(result).toMatchObject({
			outcome: 'extracted',
			inserted: 4,
			removed: 0,
			costUsd: 0.0004
		});
		const call = vi.mocked(model.getJSONResponse).mock.calls[0]![0];
		expect(call).toMatchObject({
			profile: 'fast',
			operationType: 'task_entity_extraction',
			projectId: PROJECT_ID,
			reasoning: { enabled: false }
		});
		expect(call.userPrompt).toContain('2026-10-06, a Tuesday');
		expect(call.userPrompt).toContain('phone +14105550152');
		expect(call.userPrompt).toContain(
			'email dj@example.com, dj@waynestrategies.example, dj@9takes.example;'
		);
		expect(call.userPrompt).not.toContain('old@example.com');
		expect(call.userPrompt).toContain(TEXT_TITLE);

		const stored = (tables as Record<string, Row[]>).onto_task_entities;
		expect(stored.map((row) => [row.kind, row.value, row.role, row.status])).toEqual([
			['person', 'Bruce P.', 'primary', 'suggested'],
			['phone', '+14435550164', 'primary', 'suggested'],
			['phone', '+14105550152', 'owner_self', 'suggested'],
			['time', '2026-10-08', 'follow_up', 'suggested']
		]);
		expect((tables as Record<string, Row[]>).onto_task_entity_state[0]).toMatchObject({
			task_id: TASK_ID,
			source_hash: taskEntitySourceHash(TEXT_TITLE, TEXT_DESCRIPTION),
			outcome: 'extracted',
			entity_count: 4,
			model: 'deepseek/deepseek-v4-flash'
		});
	});

	it('skips without a model call when the text was already read', async () => {
		const tables = baseTables({
			onto_task_entity_state: [
				{
					task_id: TASK_ID,
					source_hash: taskEntitySourceHash(TEXT_TITLE, TEXT_DESCRIPTION),
					extractor_version: TASK_ENTITY_EXTRACTOR_VERSION
				}
			]
		});
		const model = llm(answer);
		const result = await processExtractTaskEntitiesJob(job(), {
			supabase: fakeDb(tables),
			llm: model
		});
		expect(result).toMatchObject({ outcome: 'skipped', reason: 'text unchanged' });
		expect(model.getJSONResponse).not.toHaveBeenCalled();
	});

	it('keeps confirmed and dismissed rows and drops a stale suggestion on re-read', async () => {
		const tables = baseTables({
			onto_task_entities: [
				{
					id: 'bruce',
					task_id: TASK_ID,
					kind: 'person',
					natural_key: 'bruce p.',
					value: 'Bruce P.',
					status: 'confirmed',
					source: 'llm',
					quote: 'Bruce P.',
					in_text: true
				},
				{
					id: 'old-phone',
					task_id: TASK_ID,
					kind: 'phone',
					natural_key: '+14435550999',
					value: '+14435550999',
					status: 'suggested',
					source: 'llm',
					quote: '443-555-0999',
					in_text: true
				},
				{
					id: 'nope',
					task_id: TASK_ID,
					kind: 'phone',
					natural_key: '+14435550164',
					value: '+14435550164',
					status: 'dismissed',
					source: 'llm',
					quote: '443-555-0164',
					in_text: true
				}
			]
		});
		const result = await processExtractTaskEntitiesJob(job(), {
			supabase: fakeDb(tables),
			llm: llm(answer)
		});
		expect(result).toMatchObject({ outcome: 'extracted', removed: 1 });
		const stored = (tables as Record<string, Row[]>).onto_task_entities;
		expect(stored.map((row) => [row.id, row.status])).toEqual([
			['bruce', 'confirmed'],
			['nope', 'dismissed'],
			['row-3', 'suggested'],
			['row-4', 'suggested']
		]);
	});

	it('writes nothing when the text changed while the model was reading', async () => {
		const tables = baseTables();
		const db = fakeDb(tables, {
			onTaskRead: (count) => {
				if (count === 1)
					(tables.onto_tasks[0] as Row).title =
						'Call True North Roofing: Bruce called back';
			}
		});
		const result = await processExtractTaskEntitiesJob(job(), {
			supabase: db,
			llm: llm(answer)
		});
		expect(result).toMatchObject({ outcome: 'superseded' });
		expect((tables as Record<string, Row[]>).onto_task_entities ?? []).toEqual([]);
		expect((tables as Record<string, Row[]>).onto_task_entity_state ?? []).toEqual([]);
	});

	it('retries once with the problem, then records a failure', async () => {
		const tables = baseTables();
		const model = llm({ nope: true });
		const result = await processExtractTaskEntitiesJob(job(), {
			supabase: fakeDb(tables),
			llm: model
		});
		expect(model.getJSONResponse).toHaveBeenCalledTimes(2);
		expect(vi.mocked(model.getJSONResponse).mock.calls[1]![0].userPrompt).toContain(
			'must be a JSON object with an "entities" array'
		);
		expect(result).toMatchObject({ outcome: 'failed', success: false });
		expect((tables as Record<string, Row[]>).onto_task_entity_state[0]).toMatchObject({
			outcome: 'failed'
		});
	});

	it('tries a failed read again for the same text', async () => {
		const tables = baseTables({
			onto_task_entity_state: [
				{
					task_id: TASK_ID,
					source_hash: taskEntitySourceHash(TEXT_TITLE, TEXT_DESCRIPTION),
					extractor_version: TASK_ENTITY_EXTRACTOR_VERSION,
					outcome: 'failed'
				}
			]
		});
		const model = llm(answer);
		const result = await processExtractTaskEntitiesJob(job(), {
			supabase: fakeDb(tables),
			llm: model
		});
		expect(model.getJSONResponse).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({ outcome: 'extracted' });
		expect((tables as Record<string, Row[]>).onto_task_entity_state[0]).toMatchObject({
			outcome: 'extracted'
		});
	});

	it('skips deleted tasks', async () => {
		const tables = baseTables();
		(tables.onto_tasks[0] as Row).deleted_at = '2026-10-07T00:00:00Z';
		const model = llm(answer);
		const result = await processExtractTaskEntitiesJob(job(), {
			supabase: fakeDb(tables),
			llm: model
		});
		expect(result).toMatchObject({ outcome: 'skipped', reason: 'task deleted' });
		expect(model.getJSONResponse).not.toHaveBeenCalled();
	});
});

describe('describeReferenceDate', () => {
	it('names the day and offset in the owner zone', () => {
		expect(describeReferenceDate(new Date('2026-10-07T02:00:00Z'), 'America/New_York')).toBe(
			'2026-10-06, a Tuesday, in America/New_York (UTC offset -04:00)'
		);
		expect(describeReferenceDate(new Date('2026-01-15T12:00:00Z'), 'Not/AZone')).toBe(
			'2026-01-15, a Thursday, in UTC (UTC offset +00:00)'
		);
	});
});
