// packages/api-client/src/endpoints/briefs.test.ts
import { describe, expect, it, vi } from 'vitest';

import { createBuildOsClient } from '../index';

function ok(data: unknown) {
	return new Response(
		JSON.stringify({ success: true, data, timestamp: '2026-10-31T12:00:00.000Z' }),
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
	return { api, url: () => String(fetchMock.mock.calls.at(-1)?.[0]) };
}

describe('briefs', () => {
	it('reads one day by its civil date', async () => {
		const { api, url } = client({ brief: null });
		const { brief } = await api.briefs.forDate({ date: '2026-10-30' });
		expect(brief).toBeNull();
		expect(url()).toBe('https://build-os.com/api/daily-briefs?date=2026-10-30');
	});

	it('lists the newest briefs first, a page at a time', async () => {
		const { api, url } = client({
			briefs: [{ id: 'b1', brief_date: '2026-10-31', generation_status: 'completed' }],
			pagination: {
				page: 1,
				limit: 3,
				total: 1,
				totalPages: 1,
				hasNext: false,
				hasPrev: false
			}
		});
		const { briefs } = await api.briefs.history({ limit: 3 });
		expect(briefs[0]?.id).toBe('b1');
		expect(url()).toBe('https://build-os.com/api/daily-briefs/history?limit=3');
	});

	it('signs the narration URL for one brief', async () => {
		const { api, url } = client({
			url: 'https://storage.example/brief.mp3?token=x',
			expiresAt: '2026-10-31T13:00:00.000Z'
		});
		const signed = await api.briefs.audioUrl('brief/1');
		expect(signed.url).toContain('brief.mp3');
		expect(url()).toBe('https://build-os.com/api/daily-briefs/brief%2F1/audio-url');
	});
});
