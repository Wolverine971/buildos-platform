// apps/web/src/lib/components/knowledge/company-locate.svelte.test.ts
//
// The browser's watcher for the company lookup (tasker 170). What would go wrong on screen:
//   - the page polls forever after the lookup finished → it must stop when nothing is running
//   - an answered question lingers, or one whose save failed vanishes → answers leave the
//     stack at once and come back when the save fails
//   - the list never shows new places → listeners hear when more companies are placed
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanyLocateWatch, LOCATE_POLL_MS } from './company-locate.svelte';
import type {
	companyLocateApi,
	KnowledgeCompanyQuestion,
	KnowledgeLocateTray
} from './company-locate-client';

function tray(
	over: Partial<KnowledgeLocateTray> & { placed?: number; done?: number } = {}
): KnowledgeLocateTray {
	const { placed = 0, done = 0, ...rest } = over;
	return {
		run_id: 'run-1',
		status: 'running',
		stats: {
			total: 10,
			done,
			placed,
			unconfirmed: 0,
			ask: 0,
			common: 0,
			none: 0,
			failed: 0,
			skipped: 0
		},
		started_at: '2026-11-24T12:00:00Z',
		finished_at: null,
		open_questions: 0,
		leftover: 0,
		web_search: false,
		...rest
	};
}

function question(id: string): KnowledgeCompanyQuestion {
	return {
		id,
		entity_id: `org-${id}`,
		name: 'Summit Consulting',
		options: [],
		options_total: 2,
		people: [],
		checked_at: '2026-11-24T12:00:00Z'
	};
}

function fakeApi(
	trays: Array<KnowledgeLocateTray | null>,
	questions: KnowledgeCompanyQuestion[] = []
) {
	const calls = { tray: 0, questions: 0, answer: [] as unknown[] };
	const api = {
		tray: vi.fn(async () => {
			const locate = trays[Math.min(calls.tray, trays.length - 1)] ?? null;
			calls.tray += 1;
			return { locate };
		}),
		questions: vi.fn(async () => {
			calls.questions += 1;
			return { questions };
		}),
		answer: vi.fn(async (id: string, choice: unknown) => {
			calls.answer.push({ id, choice });
			return { status: 'answered' as const, facts_added: 2 };
		}),
		start: vi.fn(async () => ({ run_id: 'run-1', queued: 10, reason: null })),
		stop: vi.fn(async () => ({ stopped: true })),
		searchRest: vi.fn(async () => ({ queued: 3, remaining: 0, refused: null }))
	};
	return { api: api as unknown as typeof companyLocateApi, calls, raw: api };
}

describe('CompanyLocateWatch', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('polls while a lookup runs and stops once it has finished', async () => {
		const { api, calls } = fakeApi([
			tray({ done: 3 }),
			tray({ done: 6 }),
			tray({ done: 10, status: 'completed', finished_at: '2026-11-24T12:05:00Z' })
		]);
		const watch = new CompanyLocateWatch({ api, isHidden: () => false });
		watch.start();
		await vi.advanceTimersByTimeAsync(0);
		expect(watch.live).toBe(true);
		expect(calls.tray).toBe(1);

		await vi.advanceTimersByTimeAsync(LOCATE_POLL_MS);
		await vi.advanceTimersByTimeAsync(LOCATE_POLL_MS);
		expect(calls.tray).toBe(3);
		expect(watch.live).toBe(false);

		await vi.advanceTimersByTimeAsync(LOCATE_POLL_MS * 10);
		expect(calls.tray).toBe(3);
	});

	it('does not poll at all when there is no lookup', async () => {
		const { api, calls } = fakeApi([null]);
		const watch = new CompanyLocateWatch({ api, isHidden: () => false });
		watch.start();
		await vi.advanceTimersByTimeAsync(LOCATE_POLL_MS * 5);
		expect(calls.tray).toBe(1);
		expect(watch.loaded).toBe(true);
		expect(watch.tray).toBeNull();
	});

	it('makes no request while the tab is hidden', async () => {
		let hidden = true;
		const { api, calls } = fakeApi([tray({ done: 1 })]);
		const watch = new CompanyLocateWatch({ api, isHidden: () => hidden });
		watch.start();
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(LOCATE_POLL_MS * 4);
		expect(calls.tray).toBe(1);
		hidden = false;
		await vi.advanceTimersByTimeAsync(LOCATE_POLL_MS);
		expect(calls.tray).toBe(2);
		watch.stop();
	});

	it('loads the questions only when their count changes', async () => {
		const { api, calls } = fakeApi(
			[tray({ open_questions: 2 }), tray({ open_questions: 2, done: 4 })],
			[question('a'), question('b')]
		);
		const watch = new CompanyLocateWatch({ api, isHidden: () => false });
		watch.start();
		await vi.advanceTimersByTimeAsync(0);
		expect(watch.questions.map((q) => q.id)).toEqual(['a', 'b']);
		expect(watch.byEntity.get('org-a')?.id).toBe('a');
		await vi.advanceTimersByTimeAsync(LOCATE_POLL_MS);
		expect(calls.questions).toBe(1);
		watch.stop();
	});

	it('tells listeners when more companies are placed and when the run stops, not on every poll', async () => {
		const { api } = fakeApi([
			tray({ done: 2, placed: 1 }),
			tray({ done: 4, placed: 1 }),
			tray({ done: 6, placed: 3 }),
			tray({ done: 10, placed: 3, status: 'completed' })
		]);
		const watch = new CompanyLocateWatch({ api, isHidden: () => false });
		const heard: number[] = [];
		const off = watch.onProgress((t) => heard.push(t.stats.done));
		watch.start();
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(LOCATE_POLL_MS * 3);
		expect(heard).toEqual([6, 10]);
		off();
	});

	it('takes an answered question off the stack at once and counts it down', async () => {
		const { api, calls } = fakeApi(
			[tray({ status: 'completed', open_questions: 2, leftover: 4 })],
			[question('a'), question('b')]
		);
		const watch = new CompanyLocateWatch({ api, isHidden: () => false });
		await watch.refresh();

		await watch.answer(watch.questions[0]!, { choice: 'option', key: 'summitllc.com' });
		expect(watch.questions.map((q) => q.id)).toEqual(['b']);
		expect(watch.tray).toMatchObject({ open_questions: 1, leftover: 4 });
		expect(calls.answer).toEqual([
			{ id: 'a', choice: { choice: 'option', key: 'summitllc.com' } }
		]);

		// "None of these" leaves the company for a web search.
		await watch.answer(watch.questions[0]!, { choice: 'none_of_these' });
		expect(watch.questions).toEqual([]);
		expect(watch.tray).toMatchObject({ open_questions: 0, leftover: 5 });
	});

	it('puts a question back when its answer could not be saved', async () => {
		const { api, raw } = fakeApi(
			[tray({ status: 'completed', open_questions: 1 })],
			[question('a')]
		);
		raw.answer.mockRejectedValueOnce(new Error('offline'));
		const watch = new CompanyLocateWatch({ api, isHidden: () => false });
		await watch.refresh();

		await expect(
			watch.answer(watch.questions[0]!, { choice: 'none_of_these' })
		).rejects.toThrow('offline');
		expect(watch.questions.map((q) => q.id)).toEqual(['a']);
		expect(watch.tray).toMatchObject({ open_questions: 1, leftover: 0 });
	});
});
