import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	aiInboxCountStore,
	loadAiInboxCount,
	resetAiInboxCount,
	setAiInboxRemainingCount
} from './aiInboxCount.store';

describe('aiInboxCountStore', () => {
	beforeEach(() => {
		resetAiInboxCount();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('loads the shared pending-review count', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					success: true,
					data: { total: 14, account: 2, by_project: { one: 5, two: 7 } }
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		);
		vi.stubGlobal('fetch', fetchMock);

		await loadAiInboxCount();

		expect(fetchMock).toHaveBeenCalledOnce();
		expect(get(aiInboxCountStore)).toEqual({
			total: 14,
			account: 2,
			projectCount: 2,
			loading: false,
			loaded: true,
			error: null
		});
	});

	it('reuses a loaded count until a forced refresh', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ success: true, data: { total: 3 } }), {
					status: 200
				})
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ success: true, data: { total: 1 } }), {
					status: 200
				})
			);
		vi.stubGlobal('fetch', fetchMock);

		await loadAiInboxCount();
		await loadAiInboxCount();
		expect(fetchMock).toHaveBeenCalledOnce();

		await loadAiInboxCount({ force: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(get(aiInboxCountStore).total).toBe(1);
	});

	it('updates the visible total immediately when the modal closes', () => {
		setAiInboxRemainingCount(6);

		expect(get(aiInboxCountStore)).toMatchObject({
			total: 6,
			loaded: true,
			error: null
		});
	});
});
