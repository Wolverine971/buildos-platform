// apps/worker/tests/profileSignalProcessor.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;

const mocks = vi.hoisted(() => ({
	tables: {} as Record<string, Array<Record<string, any>>>,
	getJSONResponse: vi.fn(),
	seq: 0
}));

// Minimal in-memory PostgREST fake covering the calls the processor makes.
function fakeFrom(table: string) {
	const filters: Array<(row: Row) => boolean> = [];
	let op: 'select' | 'insert' | 'update' = 'select';
	let payload: Row | Row[] | null = null;
	let ignoreDuplicates = false;
	const rows = () => (mocks.tables[table] ??= []);
	const execute = () => {
		if (op === 'insert') {
			const inserted: Row[] = [];
			for (const value of Array.isArray(payload) ? payload : [payload!]) {
				const duplicate =
					ignoreDuplicates &&
					rows().some((row) => row.idempotency_key === value.idempotency_key);
				if (duplicate) continue;
				const row = { id: `${table}-${++mocks.seq}`, ...value };
				rows().push(row);
				inserted.push({ ...row });
			}
			return inserted;
		}
		const matched = rows().filter((row) => filters.every((filter) => filter(row)));
		if (op === 'update') for (const row of matched) Object.assign(row, payload);
		return matched.map((row) => ({ ...row }));
	};
	const builder: any = {
		select: () => builder,
		insert: (value: Row | Row[]) => {
			op = 'insert';
			payload = value;
			return builder;
		},
		upsert: (value: Row[], options?: { ignoreDuplicates?: boolean }) => {
			op = 'insert';
			payload = value;
			ignoreDuplicates = Boolean(options?.ignoreDuplicates);
			return builder;
		},
		update: (value: Row) => {
			op = 'update';
			payload = value;
			return builder;
		},
		eq: (column: string, value: unknown) => {
			filters.push((row) => row[column] === value);
			return builder;
		},
		is: (column: string, value: unknown) => {
			filters.push((row) => (row[column] ?? null) === value);
			return builder;
		},
		not: (column: string) => {
			filters.push((row) => row[column] != null);
			return builder;
		},
		order: () => builder,
		limit: () => builder,
		single: async () => ({ data: execute()[0] ?? null, error: null }),
		maybeSingle: async () => ({ data: execute()[0] ?? null, error: null }),
		then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
			Promise.resolve({ data: execute(), error: null }).then(resolve, reject)
	};
	return builder;
}

vi.mock('../src/lib/supabase', () => ({
	supabase: { from: (table: string) => fakeFrom(table) }
}));

vi.mock('../src/lib/services/smart-llm-service', () => ({
	SmartLLMService: vi.fn().mockImplementation(function () {
		return { getJSONResponse: mocks.getJSONResponse };
	})
}));

import { processContactSignals } from '../src/workers/chat/contactSignalProcessor';
import { processProfileSignals } from '../src/workers/chat/profileSignalProcessor';

const MESSAGES = [
	{
		id: 'msg-1',
		role: 'user',
		content: 'I now lead the design team, and I left my old agency role last month.',
		created_at: '2026-09-01T12:00:00.000Z'
	}
];

describe('processProfileSignals', () => {
	beforeEach(() => {
		mocks.seq = 0;
		mocks.tables = {
			user_profiles: [
				{
					id: 'profile-1',
					user_id: 'user-1',
					actor_id: 'actor-1',
					doc_structure: { version: 1, root: [] },
					summary: null,
					safe_summary: null,
					extraction_enabled: true
				}
			]
		};
		mocks.getJSONResponse.mockReset();
		mocks.getJSONResponse.mockImplementation(async (options: { systemPrompt: string }) =>
			options.systemPrompt.includes('profile summary')
				? { summary: 'Leads design.', safe_summary: 'Leads design.' }
				: {
						signals: [
							{
								content: 'Now leads the design team.',
								category: 'career',
								confidence: 0.95,
								is_update: false
							},
							{
								content: 'Stopped working at an agency.',
								category: 'career',
								confidence: 0.95,
								is_update: true
							}
						]
					}
		);
	});

	it('routes review on the model is_update flag, not on words in the fact', async () => {
		const result = await processProfileSignals({
			sessionId: 'session-1',
			userId: 'user-1',
			messages: MESSAGES,
			classification: {}
		});

		const fragments = mocks.tables.profile_fragments ?? [];
		const byContent = (content: string) => fragments.find((row) => row.content === content);
		// "Now" in a non-update fact no longer forces review; it merges.
		expect(byContent('Now leads the design team.')?.status).toBe('accepted');
		expect(byContent('Stopped working at an agency.')?.status).toBe('needs_review');
		expect(result).toMatchObject({ mergedCount: 1, needsReviewCount: 1 });
	});

	it('bounds LLM calls with an abort signal so a timeout cancels the paid request', async () => {
		await processProfileSignals({
			sessionId: 'session-1',
			userId: 'user-1',
			messages: MESSAGES,
			classification: {}
		});

		expect(mocks.getJSONResponse).toHaveBeenCalled();
		for (const [options] of mocks.getJSONResponse.mock.calls) {
			expect(options.signal).toBeInstanceOf(AbortSignal);
			expect(options.signal.aborted).toBe(false);
		}
	});
});

describe('processContactSignals', () => {
	it('bounds extraction with an abort signal so a timeout cancels the paid request', async () => {
		mocks.tables = {
			user_profiles: [{ id: 'profile-1', user_id: 'user-1', extraction_enabled: true }]
		};
		mocks.getJSONResponse.mockReset();
		mocks.getJSONResponse.mockResolvedValue({ contacts: [] });

		const result = await processContactSignals({
			sessionId: 'session-1',
			userId: 'user-1',
			messages: MESSAGES,
			classification: {}
		});

		expect(result.reason).toBe('no_signals');
		const [options] = mocks.getJSONResponse.mock.calls[0]!;
		expect(options.signal).toBeInstanceOf(AbortSignal);
	});
});
