// apps/web/src/routes/api/profile/me/discoverability/server.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';
import { PATCH } from './+server';

function createEvent(
	body: unknown,
	options: { username?: string | null; updated?: Record<string, unknown> | null } = {}
) {
	const updateCalls: unknown[] = [];
	const usersTable = {
		select: vi.fn(() => ({
			eq: vi.fn(() => ({
				maybeSingle: vi.fn().mockResolvedValue({
					data: { username: options.username === undefined ? 'sam' : options.username },
					error: null
				})
			}))
		})),
		update: vi.fn((values: unknown) => {
			updateCalls.push(values);
			return {
				eq: vi.fn(() => ({
					select: vi.fn(() => ({
						maybeSingle: vi.fn().mockResolvedValue({
							data:
								options.updated === undefined
									? { discoverability: 'handle', accepts_agent_requests: true }
									: options.updated,
							error: null
						})
					}))
				}))
			};
		})
	};
	const event = {
		request: { json: vi.fn().mockResolvedValue(body) },
		locals: {
			supabase: { from: vi.fn(() => usersTable) },
			safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
		}
	} as unknown as RequestEvent;
	return { event, usersTable, updateCalls };
}

describe('PATCH /api/profile/me/discoverability', () => {
	it('rejects bad values and empty updates', async () => {
		expect((await PATCH(createEvent({ discoverability: 'directory' }).event)).status).toBe(400);
		expect((await PATCH(createEvent({ accepts_agent_requests: 'yes' }).event)).status).toBe(
			400
		);
		expect((await PATCH(createEvent({}).event)).status).toBe(400);
	});

	it('refuses to make you findable without a username', async () => {
		const { event, usersTable } = createEvent(
			{ discoverability: 'handle' },
			{ username: null }
		);
		const response = await PATCH(event);
		expect(response.status).toBe(409);
		expect((await response.json()).error).toContain('Claim a username');
		expect(usersTable.update).not.toHaveBeenCalled();
	});

	it('turns finding-by-handle on for someone with a username', async () => {
		const { event, updateCalls } = createEvent({ discoverability: 'handle' });
		const payload = await (await PATCH(event)).json();
		expect(updateCalls).toEqual([{ discoverability: 'handle' }]);
		expect(payload.data).toEqual({ discoverability: 'handle', accepts_agent_requests: true });
	});

	it('switches agent-sent requests off without checking the username', async () => {
		const { event, usersTable, updateCalls } = createEvent(
			{ accepts_agent_requests: false },
			{ updated: { discoverability: 'none', accepts_agent_requests: false } }
		);
		const payload = await (await PATCH(event)).json();
		expect(usersTable.select).not.toHaveBeenCalled();
		expect(updateCalls).toEqual([{ accepts_agent_requests: false }]);
		expect(payload.data).toEqual({ discoverability: 'none', accepts_agent_requests: false });
	});
});
