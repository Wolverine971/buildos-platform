// apps/web/src/lib/server/people/people-hub.test.ts
import { describe, expect, it, vi } from 'vitest';

const { fetchProjectSummariesMock } = vi.hoisted(() => ({
	fetchProjectSummariesMock: vi.fn()
}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn().mockResolvedValue('actor-me'),
	fetchProjectSummaries: fetchProjectSummariesMock
}));

import { groupPeople, loadPeopleHub, toHubInvites } from './people-hub';

const projectNames = new Map([
	['p-cadre', 'The Cadre Content Operations'],
	['p-uxm', 'UXM Training Website']
]);

function member(overrides: Record<string, unknown>) {
	return {
		id: 'm1',
		project_id: 'p-cadre',
		actor_id: 'actor-ian',
		role_key: 'editor',
		agent_access: 'write',
		created_at: '2026-03-03T00:00:00Z',
		joined_via_invite_link_id: null,
		actor: { id: 'actor-ian', user_id: 'user-ian', name: 'Ian Miner', email: 'ian@x.test' },
		...overrides
	} as any;
}

describe('groupPeople', () => {
	it('puts each person on one row with every project they are in, most-shared first', () => {
		const people = groupPeople(
			[
				member({
					id: 'm-owner',
					actor_id: 'actor-me',
					role_key: 'owner',
					actor: { name: 'DJ' }
				}),
				member({
					id: 'm-phil',
					actor_id: 'actor-phil',
					agent_access: 'read',
					actor: { user_id: 'user-phil', name: 'Phillip Velayo', email: 'p@x.test' }
				}),
				member({ id: 'm-ian-cadre' }),
				member({
					id: 'm-ian-uxm',
					project_id: 'p-uxm',
					joined_via_invite_link_id: 'link-1'
				})
			],
			projectNames,
			new Map([['user-ian', 'ian']]),
			'actor-me'
		);

		expect(people.map((p) => p.name)).toEqual(['Ian Miner', 'Phillip Velayo']);
		expect(people[0]).toMatchObject({
			handle: 'ian',
			email: 'ian@x.test',
			memberships: [
				{ member_id: 'm-ian-cadre', project_name: 'The Cadre Content Operations' },
				{ member_id: 'm-ian-uxm', joined_via_link: true }
			]
		});
		expect(people[1]).toMatchObject({ handle: null, memberships: [{ agent_access: 'read' }] });
	});

	it('skips projects you do not own and the owner row', () => {
		const people = groupPeople(
			[member({ project_id: 'p-someone-else' }), member({ role_key: 'owner' })],
			projectNames,
			new Map(),
			'actor-me'
		);
		expect(people).toEqual([]);
	});
});

describe('toHubInvites', () => {
	it('calls pending invites past their date expired, and hides the email behind a handle', () => {
		const now = Date.parse('2026-10-23T00:00:00Z');
		const invites = toHubInvites(
			[
				{
					id: 'i-old',
					project_id: 'p-cadre',
					invitee_email: 'beau@x.test',
					invitee_handle: null,
					role_key: 'editor',
					agent_access: 'read',
					created_at: '2026-03-02T00:00:00Z',
					expires_at: '2026-03-09T00:00:00Z'
				},
				{
					id: 'i-handle',
					project_id: 'p-uxm',
					invitee_email: 'secret@x.test',
					invitee_handle: 'sam',
					role_key: 'viewer',
					agent_access: 'off',
					created_at: '2026-10-22T00:00:00Z',
					expires_at: '2026-10-29T00:00:00Z'
				}
			],
			projectNames,
			now
		);

		expect(invites).toEqual([
			expect.objectContaining({
				id: 'i-handle',
				invitee_email: null,
				invitee_handle: 'sam',
				effective_status: 'pending',
				role: 'viewer',
				agent_access: 'off'
			}),
			expect.objectContaining({
				id: 'i-old',
				invitee_email: 'beau@x.test',
				effective_status: 'expired',
				project_name: 'The Cadre Content Operations'
			})
		]);
	});
});

function query(result: { data: unknown; error: unknown }) {
	const q: any = {};
	for (const method of ['select', 'eq', 'in', 'is']) q[method] = vi.fn(() => q);
	q.maybeSingle = vi.fn().mockResolvedValue(result);
	q.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
	return q;
}

describe('loadPeopleHub', () => {
	it('splits projects you own from projects shared with you, never offering the Workspace', async () => {
		fetchProjectSummariesMock.mockResolvedValueOnce([
			{
				id: 'p-cadre',
				name: 'The Cadre Content Operations',
				is_shared: false,
				kind: 'project'
			},
			{ id: 'p-ws', name: 'Workspace', is_shared: false, kind: 'workspace' },
			{
				id: 'p-sam',
				name: "Sam's Launch",
				is_shared: true,
				kind: 'project',
				owner_actor_id: 'actor-sam',
				access_role: 'editor'
			}
		]);
		const tables: Record<string, any> = {
			users: query({
				data: {
					username: 'djwayne',
					discoverability: 'none',
					accepts_agent_requests: true
				},
				error: null
			}),
			onto_project_invites: query({ data: [], error: null }),
			project_agent_settings: query({
				data: [{ project_id: 'p-cadre', editor_agents_write: true }],
				error: null
			}),
			onto_projects: query({
				data: [{ id: 'p-cadre', external_agent_access: 'standard' }],
				error: null
			}),
			onto_actors: query({ data: [{ id: 'actor-sam', name: 'Sam Rivera' }], error: null })
		};
		let membersCall = 0;
		const supabase: any = {
			rpc: vi.fn().mockResolvedValue({ data: { incoming: [], outgoing: [] }, error: null }),
			from: vi.fn((table: string) => {
				if (table !== 'onto_project_members') return tables[table];
				membersCall += 1;
				return membersCall === 1
					? query({ data: [member({})], error: null })
					: query({
							data: [
								{ project_id: 'p-sam', role_key: 'editor', agent_access: 'off' }
							],
							error: null
						});
			})
		};
		const admin: any = {
			from: vi.fn(() => query({ data: [{ id: 'user-ian', username: 'ian' }], error: null }))
		};

		const hub = await loadPeopleHub({ supabase, admin, userId: 'user-me' });

		expect(hub.loadError).toBeNull();
		expect(hub.profile).toEqual({
			username: 'djwayne',
			discoverability: 'none',
			accepts_agent_requests: true
		});
		expect(hub.ownedProjects).toEqual([
			{
				id: 'p-cadre',
				name: 'The Cadre Content Operations',
				editor_agents_write: true,
				restricted: false
			}
		]);
		expect(hub.people).toEqual([expect.objectContaining({ name: 'Ian Miner', handle: 'ian' })]);
		expect(hub.sharedWithYou).toEqual([
			{
				id: 'p-sam',
				name: "Sam's Launch",
				owner_name: 'Sam Rivera',
				role: 'editor',
				agent_access: 'off'
			}
		]);
	});

	it('still loads when requests fail, and says what is missing', async () => {
		fetchProjectSummariesMock.mockResolvedValueOnce([]);
		const supabase: any = {
			rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
			from: vi.fn(() =>
				query({
					data: { username: null, discoverability: 'none', accepts_agent_requests: true },
					error: null
				})
			)
		};
		const hub = await loadPeopleHub({ supabase, admin: {} as any, userId: 'user-me' });
		expect(hub.requests).toEqual({ incoming: [], outgoing: [] });
		expect(hub.loadError).toContain('requests');
	});
});
