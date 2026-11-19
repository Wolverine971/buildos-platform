// packages/api-client/src/endpoints/inbox.test.ts
// The request shapes the web's inbox routes parse (routes/api/inbox/**, onto/projects/[id]/cleanup).
import { describe, expect, it, vi } from 'vitest';

import { createBuildOsClient } from '../index';

function client(data: unknown = {}) {
	const fetchMock = vi.fn<typeof fetch>(
		async () =>
			new Response(JSON.stringify({ success: true, data }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			})
	);
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

describe('inbox', () => {
	it('lists pending items with payloads on the fast read by default', async () => {
		const { api, last } = client({ items: [], total: 0, heldTotal: 0 });
		await api.inbox.list({ limit: 50 });
		const { url, method } = last();
		expect(method).toBe('GET');
		const query = new URL(url).searchParams;
		expect(new URL(url).pathname).toBe('/api/inbox');
		expect(query.get('status')).toBe('pending');
		expect(query.get('include_payload')).toBe('1');
		expect(query.get('repair')).toBe('none');
		expect(query.get('limit')).toBe('50');
	});

	it('decides with item_id, sending a resolution only when given', async () => {
		const { api, last } = client({ item: null });
		await api.inbox.decide('i/1', 'approve');
		expect(last().body).toEqual({ item_id: 'i/1', action: 'approve' });
		await api.inbox.decide('i/1', 'address', { resolutionText: 'Sent it' });
		expect(last().body).toEqual({
			item_id: 'i/1',
			action: 'address',
			resolution_text: 'Sent it'
		});
	});

	it('snoozes until this time tomorrow unless told otherwise', async () => {
		const { api, last } = client({ snoozed_until: 'x' });
		const before = Date.now();
		await api.inbox.snooze('i1');
		const { body } = last();
		expect(body.action).toBe('snooze');
		const until = Date.parse(body.snooze_until);
		expect(until - before).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);
		expect(until - before).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 5000);
	});

	it('posts cleanup decisions, notes and undo to the project routes', async () => {
		const { api, last } = client({ outcomes: [], view: null });
		await api.inbox.decideCleanup('p1', [
			{ suggestion_id: 's1', action: 'approve', expected_fingerprint: 'f1' }
		]);
		expect(last()).toEqual({
			url: 'https://build-os.com/api/onto/projects/p1/cleanup',
			method: 'POST',
			body: {
				decisions: [{ suggestion_id: 's1', action: 'approve', expected_fingerprint: 'f1' }]
			}
		});
		await api.inbox.undoCleanup('p1', 's1');
		expect(last()).toMatchObject({
			url: 'https://build-os.com/api/onto/projects/p1/cleanup/undo',
			body: { suggestion_id: 's1' }
		});
	});

	it('opens a cleanup item chat with the item named', async () => {
		const { api, last } = client({ chat_session_id: 'c1' });
		await api.inbox.chatSession('i1', { cleanup_item_id: 'line-1' });
		expect(last()).toEqual({
			url: 'https://build-os.com/api/inbox/i1/chat-session',
			method: 'POST',
			body: { cleanup_item_id: 'line-1' }
		});
	});

	it('answers check-ins and email updates in the shapes the routes read', async () => {
		const { api, last } = client({ results: [], changed: 0, failed: 0 });
		await api.inbox.answerCheckIns([{ task_id: 't1', answer: 'done' }]);
		expect(last().body).toEqual({ answers: [{ task_id: 't1', answer: 'done' }] });
		await api.inbox.decideEmailUpdate('e1', 'dismiss');
		expect(last()).toEqual({
			url: 'https://build-os.com/api/inbox/email-updates/e1',
			method: 'POST',
			body: { decision: 'dismiss' }
		});
	});
});
