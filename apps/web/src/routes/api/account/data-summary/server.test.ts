// apps/web/src/routes/api/account/data-summary/server.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from './$types';
import { exportRow, fakeUserClient, routeEvent } from '$lib/test-helpers/fake-user-data-exports';

vi.mock('$lib/server/route-error', async () => {
	const { ApiResponse } = await import('$lib/utils/api-response');
	return {
		routeErrorResponse: vi.fn(async () =>
			ApiResponse.error('Could not load your data summary', 500)
		)
	};
});

import { GET } from './+server';

type Event = Parameters<RequestHandler>[0];

describe('GET /api/account/data-summary', () => {
	it('requires a session', async () => {
		const { client, rpcCalls } = fakeUserClient([]);
		const response = await GET(routeEvent(client, { userId: null }) as unknown as Event);
		expect(response.status).toBe(401);
		expect(rpcCalls).toEqual([]);
	});

	it('returns the caller’s summary and latest export in one response', async () => {
		const { client, rpcCalls } = fakeUserClient([exportRow({ status: 'running' })], () => ({
			data: {
				generated_at: '2026-09-24T12:00:00Z',
				workspace: { projects: 46, documents: 300, tasks: 624, voice_notes: 194 },
				traces: { tool_traces: 809, ai_usage_records: 12 },
				connections: {
					gmail: {
						connected: true,
						needs_reconnect: false,
						last_read_at: '2026-09-01T10:00:00Z'
					},
					calendar: { connected: false },
					agents: [{ id: 'a1', provider: 'claude-code', name: null, last_used_at: null }]
				}
			},
			error: null
		}));

		const body = await (await GET(routeEvent(client) as unknown as Event)).json();

		expect(rpcCalls).toEqual(['get_my_data_summary']);
		expect(body.data.summary.workspace).toMatchObject({
			projects: 46,
			voiceNotes: 194,
			chats: 0
		});
		expect(body.data.summary.connections.gmail.lastReadAt).toBe('2026-09-01T10:00:00Z');
		expect(body.data.summary.connections.agents).toEqual([
			{ id: 'a1', provider: 'claude-code', name: null, lastUsedAt: null }
		]);
		expect(body.data.export.status).toBe('running');
		expect(body.data.remainingToday).toBe(2);
	});

	it('fails closed when the summary function errors', async () => {
		const { client } = fakeUserClient([], () => ({ data: null, error: { code: '42501' } }));
		expect((await GET(routeEvent(client) as unknown as Event)).status).toBe(500);
	});
});
