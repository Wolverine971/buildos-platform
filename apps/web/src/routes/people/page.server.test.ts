// apps/web/src/routes/people/page.server.test.ts
import { describe, expect, it, vi } from 'vitest';

const { fetchProjectSummariesMock } = vi.hoisted(() => ({
	fetchProjectSummariesMock: vi.fn()
}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn().mockResolvedValue('actor-me'),
	fetchProjectSummaries: fetchProjectSummariesMock
}));

import { load } from './+page.server';

function createEvent(options: { requestsError?: unknown } = {}) {
	const usersQuery = {
		select: vi.fn(() => usersQuery),
		eq: vi.fn(() => usersQuery),
		maybeSingle: vi.fn().mockResolvedValue({
			data: { username: 'dj', discoverability: 'handle', accepts_agent_requests: true },
			error: null
		})
	};
	const actorsQuery = {
		select: vi.fn(() => actorsQuery),
		in: vi.fn().mockResolvedValue({
			data: [{ id: 'actor-sam', name: 'Sam' }],
			error: null
		})
	};
	const supabase = {
		rpc: vi.fn().mockResolvedValue(
			options.requestsError
				? { data: null, error: options.requestsError }
				: {
						data: {
							incoming: [
								{
									id: 'r1',
									created_at: '2026-10-23T00:00:00Z',
									role_requested: 'viewer',
									from: { name: 'Lee', handle: 'lee', email: null }
								}
							],
							outgoing: []
						},
						error: null
					}
		),
		from: vi.fn((table: string) => (table === 'users' ? usersQuery : actorsQuery))
	};
	return {
		event: {
			url: new URL('http://localhost/people'),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-me' } }),
				serverTiming: undefined
			}
		} as any,
		supabase,
		actorsQuery
	};
}

describe('/people load', () => {
	it('splits projects you own (shareable) from projects shared with you', async () => {
		fetchProjectSummariesMock.mockResolvedValue([
			{ id: 'p-own', name: '9takes', is_shared: false, owner_actor_id: 'actor-me' },
			// The private Workspace (loose items) is never offered for sharing.
			{
				id: 'p-workspace',
				name: 'Workspace',
				kind: 'workspace',
				is_shared: false,
				owner_actor_id: 'actor-me'
			},
			{
				id: 'p-shared',
				name: 'Cadre',
				is_shared: true,
				owner_actor_id: 'actor-sam',
				access_role: 'editor'
			}
		]);
		const { event, supabase, actorsQuery } = createEvent();

		const data = (await load(event)) as any;

		expect(supabase.rpc).toHaveBeenCalledWith('list_people_requests', {});
		expect(data.requests.incoming).toHaveLength(1);
		expect(data.ownedProjects).toEqual([{ id: 'p-own', name: '9takes' }]);
		expect(actorsQuery.in).toHaveBeenCalledWith('id', ['actor-sam']);
		expect(data.sharedWithYou).toEqual([
			{ id: 'p-shared', name: 'Cadre', owner_name: 'Sam', role: 'editor' }
		]);
		expect(data.profile).toEqual({
			username: 'dj',
			discoverability: 'handle',
			accepts_agent_requests: true
		});
		expect(data.loadError).toBeNull();
	});

	it('still renders when requests fail to load', async () => {
		fetchProjectSummariesMock.mockResolvedValue([]);
		const { event } = createEvent({ requestsError: { code: 'XX000', message: 'boom' } });

		const data = (await load(event)) as any;

		expect(data.requests).toEqual({ incoming: [], outgoing: [] });
		expect(data.loadError).toContain('requests');
	});
});
