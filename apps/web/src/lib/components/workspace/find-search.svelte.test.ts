// apps/web/src/lib/components/workspace/find-search.svelte.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFindSearch } from './find-search.svelte';
import type { BestMatchResponse, FindItem } from './find-model';

function item(id: string, title: string): FindItem {
	return {
		kind: 'task',
		id,
		project_id: 'p',
		project_name: 'P',
		in_workspace: false,
		title,
		snippet: null,
		state_key: 'todo',
		type_key: null,
		due_at: null,
		updated_at: null
	};
}

function json(data: unknown, ok = true) {
	return Promise.resolve(
		new Response(JSON.stringify(ok ? { success: true, data } : { error: 'x' }), {
			status: ok ? 200 : 500
		})
	);
}

async function settle(ms: number) {
	await vi.advanceTimersByTimeAsync(ms);
}

describe('find search session', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('asks for word matches after a pause, and only for the latest query', async () => {
		const fetcher = vi.fn((url: string) => {
			const q = new URL(url, 'http://x').searchParams.get('q');
			return json({
				query: q,
				items: [1, 2, 3, 4].map((n) => item(`${q}${n}`, `${q} ${n}`))
			});
		});
		const search = createFindSearch({ fetcher, bestMatch: false });
		search.set('gu');
		search.set('gun');
		search.set('guns');
		expect(search.loading).toBe(true);
		await settle(200);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(fetcher.mock.calls[0]![0]).toBe('/api/workspace/find?q=guns');
		expect(search.items.map((x) => x.title)[0]).toBe('guns 1');
		expect(search.resultQuery).toBe('guns');
		expect(search.loading).toBe(false);
		search.destroy();
	});

	it('clears for one-letter queries without a request', async () => {
		const fetcher = vi.fn(() => json({ items: [] }));
		const search = createFindSearch({ fetcher });
		search.set('g');
		await settle(1000);
		expect(fetcher).not.toHaveBeenCalled();
		expect(search.active).toBe(false);
		expect(search.items).toEqual([]);
	});

	it('adds a best match for thin results, reuses it for the same query, and never blocks word matches', async () => {
		const best: BestMatchResponse = {
			query: 'gunsmtih',
			status: 'selected',
			items: [{ ...item('b1', 'Call the gunsmith back'), p: 0.9 }],
			ms: 400
		};
		const fetcher = vi.fn((url: string, _init?: RequestInit) =>
			url.startsWith('/api/workspace/find/best') ? json(best) : json({ items: [] })
		);
		const search = createFindSearch({ fetcher });
		search.set('gunsmtih');
		await settle(150);
		expect(search.items).toEqual([]);
		expect(search.best.status).toBe('waiting');
		await settle(500);
		expect(search.best.status).toBe('ready');
		expect(search.best.items.map((x) => x.title)).toEqual(['Call the gunsmith back']);
		const bestCalls = () =>
			fetcher.mock.calls.filter(
				([url, init]) =>
					url.includes('/best') &&
					String((init as RequestInit | undefined)?.body).includes('gunsmtih')
			).length;
		expect(bestCalls()).toBe(1);

		search.set('gunsm');
		await settle(1000);
		search.set('gunsmtih');
		await settle(1000);
		expect(search.best.status).toBe('ready');
		expect(bestCalls()).toBe(1);
	});

	it('skips the best match when word matches are plentiful and the query is short', async () => {
		const fetcher = vi.fn(() =>
			json({ items: [1, 2, 3, 4].map((n) => item(String(n), `gift ${n}`)) })
		);
		const search = createFindSearch({ fetcher });
		search.set('gift');
		await settle(1000);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(search.best.status).toBe('idle');
	});

	it('hides a failed best match and keeps the word matches', async () => {
		const fetcher = vi.fn((url: string) =>
			url.includes('/best') ? json(null, false) : json({ items: [item('a', 'Gift list')] })
		);
		const search = createFindSearch({ fetcher });
		search.set('what to get mom');
		await settle(1000);
		expect(search.items.map((x) => x.title)).toEqual(['Gift list']);
		expect(search.best.status).toBe('unavailable');
	});

	it('reports a failed word search', async () => {
		const fetcher = vi.fn(() => json(null, false));
		const search = createFindSearch({ fetcher, bestMatch: false });
		search.set('gift');
		await settle(500);
		expect(search.failed).toBe(true);
		expect(search.loading).toBe(false);
	});
});
