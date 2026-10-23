// apps/web/src/lib/server/agent-call/people-tools.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	ensureActorId: vi.fn(async () => 'actor-sam'),
	fetchProjectSummaries: vi.fn(async () => [] as any[]),
	sendPeopleRequestReceivedEmail: vi.fn(async () => 'sent' as const)
}));

vi.mock('$lib/server/people/people-emails', () => ({
	sendPeopleRequestReceivedEmail: mocks.sendPeopleRequestReceivedEmail
}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: mocks.ensureActorId,
	fetchProjectSummaries: mocks.fetchProjectSummaries
}));

import { executePeopleTool, PEOPLE_TOOL_NAMES, PEOPLE_TOOLS } from './people-tools.service';

type RpcHandler = (
	name: string,
	args: Record<string, unknown>
) => { data: unknown; error: unknown };

function fakeAdmin(rpc: RpcHandler, tables: Record<string, unknown> = {}) {
	const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
	const from = (table: string) => {
		const builder: any = {
			select: () => builder,
			eq: () => builder,
			is: () => builder,
			in: () => builder,
			maybeSingle: async () => ({ data: tables[table] ?? null, error: null }),
			then: (resolve: (value: unknown) => void) =>
				resolve({ data: Array.isArray(tables[table]) ? tables[table] : [], error: null })
		};
		return builder;
	};
	return {
		admin: {
			from,
			rpc: async (name: string, args: Record<string, unknown>) => {
				calls.push({ name, args });
				return rpc(name, args);
			}
		},
		calls
	};
}

const scope = { mode: 'read_only' as const, project_ids: ['shared-visible'] };

describe('people tools', () => {
	beforeEach(() => {
		mocks.fetchProjectSummaries.mockResolvedValue([]);
	});

	it('exposes three tools, none of which approve or share', () => {
		expect(PEOPLE_TOOLS.map((tool) => tool.name)).toEqual([
			'find_buildos_person',
			'request_buildos_access',
			'list_buildos_people'
		]);
		expect(PEOPLE_TOOL_NAMES.has('decide_people_request')).toBe(false);
	});

	it('finds a person by handle as the connected user', async () => {
		const { admin, calls } = fakeAdmin(() => ({
			data: { found: true, is_self: false, handle: 'djwayne', name: 'DJ Wayne' },
			error: null
		}));
		const result = await executePeopleTool({
			admin,
			userId: 'user-sam',
			scope,
			toolName: 'find_buildos_person',
			arguments: { handle: '@DJWayne' }
		});
		expect(calls[0]).toEqual({
			name: 'find_person_by_handle',
			args: { p_handle: 'djwayne', p_user_id: 'user-sam' }
		});
		expect(result).toMatchObject({ ok: true, result: { found: true, handle: 'djwayne' } });
	});

	it('says plainly when no one can be found', async () => {
		const { admin } = fakeAdmin(() => ({ data: { found: false }, error: null }));
		const result = await executePeopleTool({
			admin,
			userId: 'user-sam',
			scope,
			toolName: 'find_buildos_person',
			arguments: { handle: 'nobody' }
		});
		expect(result).toMatchObject({ ok: true, result: { found: false } });
		expect(JSON.stringify(result)).toContain('choose to be findable');
	});

	it('needs a connected agent to send a request', async () => {
		const { admin } = fakeAdmin(() => ({ data: null, error: null }));
		const result = await executePeopleTool({
			admin,
			userId: 'user-sam',
			scope,
			toolName: 'request_buildos_access',
			arguments: { handle: 'djwayne' }
		});
		expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
	});

	it('sends the request as the agent, labelled with the client name', async () => {
		const { admin, calls } = fakeAdmin(
			() => ({ data: { status: 'pending', request_id: 'r1' }, error: null }),
			{
				agent_oauth_grants: { client_id: 'client-claude' },
				agent_oauth_clients: { client_name: 'Claude' }
			}
		);
		const result = await executePeopleTool({
			admin,
			userId: 'user-sam',
			callerId: 'caller-1',
			oauthGrantId: 'grant-1',
			scope,
			toolName: 'request_buildos_access',
			arguments: {
				handle: 'djwayne',
				project_hint: '9takes',
				note: 'Helping with outreach',
				role: 'owner'
			}
		});
		expect(calls[0]).toEqual({
			name: 'create_people_request',
			args: {
				p_handle: 'djwayne',
				p_role: 'viewer',
				p_project_hint: '9takes',
				p_note: 'Helping with outreach',
				p_caller_id: 'caller-1',
				p_oauth_grant_id: 'grant-1',
				p_agent_label: 'Claude',
				p_user_id: 'user-sam'
			}
		});
		expect(result).toMatchObject({ ok: true, result: { status: 'pending', request_id: 'r1' } });
		expect(mocks.sendPeopleRequestReceivedEmail).toHaveBeenCalledWith('r1', { admin });
	});

	it('emails the owner only for a brand-new request', async () => {
		for (const outcome of [
			{ status: 'pending', request_id: 'r1', already_pending: true },
			// A silent block looks pending to the requester but has no request id.
			{ status: 'pending' },
			{ status: 'declined_recently' }
		]) {
			mocks.sendPeopleRequestReceivedEmail.mockClear();
			const { admin } = fakeAdmin(() => ({ data: outcome, error: null }), {
				external_agent_callers: { provider: 'openclaw' }
			});
			await executePeopleTool({
				admin,
				userId: 'user-sam',
				callerId: 'caller-1',
				scope,
				toolName: 'request_buildos_access',
				arguments: { handle: 'djwayne' }
			});
			expect(mocks.sendPeopleRequestReceivedEmail).not.toHaveBeenCalled();
		}
	});

	it('explains refusals in plain words', async () => {
		for (const [outcome, phrase] of [
			[{ status: 'agent_requests_off' }, "doesn't accept requests sent by agents"],
			[{ status: 'declined_recently' }, '30 days'],
			[{ status: 'rate_limited', reason: 'agent_daily_limit' }, 'Try again tomorrow']
		] as const) {
			const { admin } = fakeAdmin(() => ({ data: outcome, error: null }), {
				external_agent_callers: { provider: 'openclaw' }
			});
			const result = await executePeopleTool({
				admin,
				userId: 'user-sam',
				callerId: 'caller-1',
				scope,
				toolName: 'request_buildos_access',
				arguments: { handle: 'djwayne' }
			});
			expect(JSON.stringify(result)).toContain(phrase);
		}
	});

	it('lists people without emails and only names projects this connection can read', async () => {
		mocks.fetchProjectSummaries.mockResolvedValue([
			{
				id: 'mine',
				name: 'Mine',
				is_shared: false,
				owner_actor_id: 'actor-sam',
				access_role: 'owner'
			},
			{
				id: 'shared-visible',
				name: '9takes',
				is_shared: true,
				owner_actor_id: 'actor-dj',
				access_role: 'viewer'
			},
			{
				id: 'shared-hidden',
				name: 'Secret plan',
				is_shared: true,
				owner_actor_id: 'actor-dj',
				access_role: 'viewer'
			}
		]);
		const { admin } = fakeAdmin(
			() => ({
				data: {
					incoming: [
						{ id: 'r2', from: { name: 'Ana', handle: null, email: 'ana@example.com' } }
					],
					outgoing: [
						{
							id: 'r1',
							status: 'approved',
							to: { name: 'DJ Wayne', handle: 'djwayne' }
						}
					]
				},
				error: null
			}),
			{
				onto_actors: [{ id: 'actor-dj', name: 'DJ Wayne' }],
				onto_project_members: [
					{ project_id: 'shared-visible', agent_access: 'read' },
					{ project_id: 'shared-hidden', agent_access: 'read' }
				]
			}
		);
		const result = (await executePeopleTool({
			admin,
			userId: 'user-sam',
			callerId: 'caller-1',
			scope,
			toolName: 'list_buildos_people'
		})) as any;
		const text = JSON.stringify(result);
		expect(text).not.toContain('ana@example.com');
		expect(text).not.toContain('Secret plan');
		expect(result.result.shared_with_you).toEqual([
			{
				project_id: 'shared-visible',
				name: '9takes',
				owner_name: 'DJ Wayne',
				your_role: 'viewer',
				owner_lets_your_agents: 'read'
			}
		]);
		expect(result.result.shared_but_not_given_to_this_connection).toBe(1);
	});
});
