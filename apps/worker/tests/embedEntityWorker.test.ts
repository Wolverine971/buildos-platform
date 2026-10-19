// apps/worker/tests/embedEntityWorker.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processEmbedOntoEntity } from '../src/workers/embeddings/embedEntityWorker';
import { supabase } from '../src/lib/supabase';

const { embed } = vi.hoisted(() => ({ embed: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@buildos/shared-agent-ops/embeddings/openai-embeddings', () => ({
	ONTO_EMBEDDING_MODEL: 'fixture-model',
	createEmbeddingsClientFromEnv: () => ({ embed })
}));

type Row = Record<string, unknown>;
function database(
	options: { afterUpsert?: () => void; readError?: boolean; deleteError?: boolean } = {}
) {
	const state = {
		entity: {
			id: 'task-1',
			project_id: 'project-1',
			title: 'A task',
			deleted_at: null
		} as Row | null,
		chunks: [{ entity_type: 'task', entity_id: 'other-task', id: 'other' }] as Row[],
		reads: 0
	};
	vi.mocked(supabase.from).mockImplementation(((table: string) => {
		let operation = 'read';
		let upserts: Row[] = [];
		const filters = new Map<string, unknown>();
		const matches = (row: Row) => [...filters].every(([key, value]) => row[key] === value);
		const execute = async () => {
			if (table === 'onto_tasks') {
				state.reads++;
				return {
					data: state.entity,
					error:
						options.readError && state.reads > 1
							? { message: 'read unavailable' }
							: null
				};
			}
			if (operation === 'upsert') {
				state.chunks.push(...upserts);
				options.afterUpsert?.();
				return { data: null, error: null };
			}
			const selected = state.chunks.filter(matches);
			if (operation === 'delete') {
				if (options.deleteError)
					return { data: null, error: { message: 'delete unavailable' } };
				state.chunks = state.chunks.filter((row) => !matches(row));
			}
			return { data: selected, error: null };
		};
		const builder = {
			select: vi.fn(() => builder),
			eq: vi.fn((key: string, value: unknown) => {
				filters.set(key, value);
				return builder;
			}),
			maybeSingle: vi.fn(() => builder),
			overrideTypes: vi.fn(() => builder),
			delete: vi.fn(() => {
				operation = 'delete';
				return builder;
			}),
			upsert: vi.fn((rows: Row[]) => {
				operation = 'upsert';
				upserts = rows;
				return builder;
			}),
			then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
				execute().then(resolve, reject)
		};
		return builder;
	}) as never);
	return state;
}

function job(): Parameters<typeof processEmbedOntoEntity>[0] {
	return {
		id: 'job-1',
		signal: new AbortController().signal,
		data: { entityType: 'task', entityId: 'task-1', projectId: 'project-1', userId: 'user-1' },
		opts: {},
		timestamp: 0,
		attemptsMade: 0,
		updateProgress: vi.fn(),
		log: vi.fn()
	};
}

beforeEach(() => {
	embed.mockReset();
	embed.mockImplementation(async (texts: string[]) => texts.map(() => [0.1, 0.2]));
});

describe('embedding deletion races', () => {
	it.each(['soft', 'hard'] as const)(
		'cleans up chunks written after a %s deletion',
		async (kind) => {
			const state = database();
			embed.mockImplementation(async (texts: string[]) => {
				// The inline delete trigger has already run while the provider was busy.
				state.entity =
					kind === 'hard'
						? null
						: { ...state.entity, deleted_at: '2026-10-18T00:00:00Z' };
				return texts.map(() => [0.1, 0.2]);
			});
			const result = await processEmbedOntoEntity(job());
			expect(state.chunks).toEqual([
				{ entity_type: 'task', entity_id: 'other-task', id: 'other' }
			]);
			expect(result).toMatchObject({ chunksWritten: 1, chunksDeleted: 1 });
		}
	);

	it('retains chunks when the entity is still live', async () => {
		const state = database();
		await expect(processEmbedOntoEntity(job())).resolves.toMatchObject({
			chunksWritten: 1,
			chunksDeleted: 0
		});
		expect(state.chunks).toHaveLength(2);
	});

	it('fails a post-upsert read error instead of guessing that the entity was deleted', async () => {
		const state = database({ readError: true });
		await expect(processEmbedOntoEntity(job())).rejects.toThrow('read unavailable');
		expect(state.chunks).toHaveLength(2);
	});

	it('surfaces cleanup failures for retry', async () => {
		const state = database({
			afterUpsert: () => {
				state.entity = null;
			},
			deleteError: true
		});
		await expect(processEmbedOntoEntity(job())).rejects.toThrow('delete unavailable');
	});
});
