// packages/api-client/src/endpoints/today.test.ts
import { describe, expect, it, vi } from 'vitest';

import { createBuildOsClient } from '../index';

function ok(data: unknown) {
	return new Response(
		JSON.stringify({ success: true, data, timestamp: '2026-11-13T12:00:00.000Z' }),
		{ status: 200, headers: { 'content-type': 'application/json' } }
	);
}

function client(data: unknown) {
	const fetchMock = vi.fn<typeof fetch>(async () => ok(data));
	const api = createBuildOsClient({
		baseUrl: 'https://build-os.com',
		getAccessToken: () => 'aaa.bbb.ccc',
		fetch: fetchMock
	});
	const last = () => {
		const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
		return {
			url: String(url),
			method: init?.method ?? 'GET',
			body: init?.body ? JSON.parse(String(init.body)) : undefined
		};
	};
	return { api, last };
}

describe('today', () => {
	it('marks a waiting row handled', async () => {
		const { api, last } = client({ item: { id: 'w/1', status: 'resolved' } });
		const { item } = await api.today.setWaitingStatus('w/1', 'resolved');
		expect(item.status).toBe('resolved');
		expect(last()).toEqual({
			url: 'https://build-os.com/api/today/waiting/w%2F1',
			method: 'PATCH',
			body: { status: 'resolved' }
		});
	});

	it('keeps a repeated suggestion, and undoes it with DELETE', async () => {
		const { api, last } = client({ task_id: 't1', kept_until: '2026-11-27' });
		await api.today.keepSuggestion('t1');
		expect(last()).toEqual({
			url: 'https://build-os.com/api/today/suggestions/keep',
			method: 'POST',
			body: { task_id: 't1' }
		});
		await api.today.unkeepSuggestion('t1');
		expect(last()).toMatchObject({ method: 'DELETE', body: { task_id: 't1' } });
	});

	it('reads what changed since an instant', async () => {
		const { api, last } = client({
			feed: {
				since: '2026-11-13T05:00:00.000Z',
				entries: [],
				totalLogCount: 0,
				truncated: false
			}
		});
		const { feed } = await api.today.changes({ since: '2026-11-13T05:00:00.000Z' });
		expect(feed.entries).toEqual([]);
		expect(last().url).toBe(
			'https://build-os.com/api/today/changes?since=2026-11-13T05%3A00%3A00.000Z'
		);
	});

	it('restores an archived task', async () => {
		const { api, last } = client({ task: { id: 't1' } });
		await api.tasks.restore('t1');
		expect(last()).toMatchObject({
			url: 'https://build-os.com/api/onto/tasks/t1/restore',
			method: 'POST'
		});
	});
});
