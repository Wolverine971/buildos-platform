// apps/worker/src/workers/knowledge/knowledgeSortSweep.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const find = vi.fn();
const sort = vi.fn();
vi.mock('@buildos/shared-agent-ops/knowledge', () => ({
	findEntriesToSort: (...args: unknown[]) => find(...args),
	sortKnowledgeEntries: (...args: unknown[]) => sort(...args)
}));
vi.mock('./knowledgeEnrichWorker', () => ({ getKnowledgeDecider: () => null }));

const { knowledgeSortUsers, runKnowledgeSortSweep } = await import('./knowledgeSortSweep');

const decider = { decide: vi.fn() } as never;
const db = {} as never;
const sorted = (n: number) => ({
	sorted: n,
	modelAsked: n,
	calls: 1,
	costUsd: 0.0006,
	inner: n,
	public: 0,
	unsure: 0,
	notAName: 0,
	mergeSuggestions: 0,
	decisions: []
});

beforeEach(() => {
	find.mockReset();
	sort.mockReset();
});

describe('knowledge sort sweep', () => {
	it('is off unless users are listed', () => {
		expect(knowledgeSortUsers({})).toBeNull();
		expect(knowledgeSortUsers({ KNOWLEDGE_SORT_USER_IDS: ' ' })).toBeNull();
		expect(knowledgeSortUsers({ KNOWLEDGE_SORT_USER_IDS: '*' })).toBe('*');
		expect(knowledgeSortUsers({ KNOWLEDGE_SORT_USER_IDS: 'a, b' })).toEqual(['a', 'b']);
	});

	it('sorts only users whose batch is ripe, and one failure does not stop the rest', async () => {
		find.mockImplementation(async (_db: unknown, userId: string) => {
			if (userId === 'boom') throw new Error('db down');
			return {
				ids: ['x'],
				ripe: userId !== 'waiting',
				why: { never_sorted: 1, old_question: 0, new_work: 0 }
			};
		});
		sort.mockResolvedValue(sorted(1));
		const result = await runKnowledgeSortSweep({
			db,
			users: ['ready', 'waiting', 'boom', 'ready2'],
			decider
		});
		expect(sort.mock.calls.map((c) => c[1])).toEqual(['ready', 'ready2']);
		expect(result).toMatchObject({ users: 2, sorted: 2, calls: 2, failed: 1 });
	});

	it('does nothing without the model', async () => {
		const result = await runKnowledgeSortSweep({ db, users: ['a'], decider: null });
		expect(find).not.toHaveBeenCalled();
		expect(result.users).toBe(0);
	});
});
