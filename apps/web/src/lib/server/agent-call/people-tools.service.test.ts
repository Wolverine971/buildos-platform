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
			order: () => builder,
			limit: () => builder,
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

	it('exposes five tools, none of which approve or share', () => {
		expect(PEOPLE_TOOLS.map((tool) => tool.name)).toEqual([
			'find_buildos_person',
			'request_buildos_access',
			'list_buildos_people',
			'request_project_access',
			'check_project_access'
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

	describe('asking a project owner for more (tasker 140)', () => {
		const PROJECT = '11111111-1111-4111-8111-111111111111';
		const sharedSummary = {
			id: PROJECT,
			name: '9takes',
			is_shared: true,
			access_level: 'write',
			access_role: 'editor',
			owner_actor_id: 'actor-owner'
		};
		const writeScope = {
			mode: 'read_write' as const,
			project_ids: [PROJECT],
			write_project_ids: []
		};

		beforeEach(() => {
			mocks.sendPeopleRequestReceivedEmail.mockClear();
			mocks.fetchProjectSummaries.mockResolvedValue([sharedSummary]);
		});

		it('sends one request as the agent and emails the owner once', async () => {
			const { admin, calls } = fakeAdmin(
				(name) =>
					name === 'create_project_upgrade_request'
						? { data: { status: 'pending', request_id: 'r1' }, error: null }
						: { data: null, error: null },
				{ users: { name: 'Sam' }, onto_actors: { name: 'Sam', user_id: 'user-owner' } }
			);
			const result = await executePeopleTool({
				admin,
				userId: 'user-me',
				callerId: 'caller-1',
				scope: writeScope,
				toolName: 'request_project_access',
				arguments: {
					project_id: PROJECT,
					need: 'agents_write',
					note: 'For the launch task'
				}
			});
			expect(result).toMatchObject({
				ok: true,
				result: { status: 'sent', owner_name: 'Sam' }
			});
			expect((result.result as Record<string, unknown>).say_to_user).toBe(
				"I asked Sam. Nothing changes until they answer in BuildOS; I'll pick this up once they do."
			);
			expect(calls[0]).toMatchObject({
				name: 'create_project_upgrade_request',
				args: {
					p_project_ids: [PROJECT],
					p_need: 'agents_write',
					p_note: 'For the launch task',
					p_caller_id: 'caller-1',
					p_user_id: 'user-me'
				}
			});
			expect(mocks.sendPeopleRequestReceivedEmail).toHaveBeenCalledTimes(1);
		});

		it('joins a waiting request without emailing again', async () => {
			const { admin } = fakeAdmin(() => ({
				data: { status: 'pending', request_id: 'r1', already_pending: true, merged: true },
				error: null
			}));
			const result = await executePeopleTool({
				admin,
				userId: 'user-me',
				callerId: 'caller-1',
				scope: writeScope,
				toolName: 'request_project_access',
				arguments: { project_id: PROJECT, need: 'agents_write' }
			});
			expect(result.result).toMatchObject({ status: 'already_waiting' });
			expect(mocks.sendPeopleRequestReceivedEmail).not.toHaveBeenCalled();
		});

		it('explains refusals in plain words and rejects bad input', async () => {
			for (const [status, text] of [
				['declined_recently', /not now to this in the last 7 days/],
				['mixed_owners', /one request per owner/],
				['waiting_other', /different request waiting/]
			] as const) {
				const { admin } = fakeAdmin(() => ({ data: { status }, error: null }));
				const result = await executePeopleTool({
					admin,
					userId: 'user-me',
					callerId: 'caller-1',
					scope: writeScope,
					toolName: 'request_project_access',
					arguments: { project_id: PROJECT, need: 'agents_write' }
				});
				expect(String((result.result as Record<string, unknown>).message)).toMatch(text);
			}
			const { admin } = fakeAdmin(() => ({ data: null, error: null }));
			for (const args of [
				{ project_id: 'nope', need: 'agents_write' },
				{ project_id: PROJECT, need: 'admin' },
				{
					project_ids: Array.from(
						{ length: 11 },
						(_, n) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`
					),
					need: 'edit'
				}
			]) {
				const result = await executePeopleTool({
					admin,
					userId: 'user-me',
					callerId: 'caller-1',
					scope: writeScope,
					toolName: 'request_project_access',
					arguments: args
				});
				expect(result.ok).toBe(false);
			}
			const noCaller = await executePeopleTool({
				admin,
				userId: 'user-me',
				scope: writeScope,
				toolName: 'request_project_access',
				arguments: { project_id: PROJECT, need: 'agents_write' }
			});
			expect(noCaller.ok).toBe(false);
		});

		it('check_project_access says waiting, then not now, from the latest request', async () => {
			const member = [
				{ project_id: PROJECT, role_key: 'editor', access: 'write', agent_access: 'read' }
			];
			const pending = fakeAdmin(() => ({ data: null, error: null }), {
				onto_project_members: member,
				people_requests: [
					{
						id: 'r1',
						status: 'pending',
						created_at: '2026-10-23T00:00:00.000Z',
						expires_at: '2999-01-01T00:00:00.000Z',
						requested_items: [{ project_id: PROJECT, need: 'agents_write' }]
					}
				]
			});
			const waiting = await executePeopleTool({
				admin: pending.admin,
				userId: 'user-me',
				callerId: 'caller-1',
				scope: writeScope,
				toolName: 'check_project_access',
				arguments: { project_id: PROJECT }
			});
			expect(waiting.result).toMatchObject({ status: 'waiting_on_owner' });

			const declined = fakeAdmin(() => ({ data: null, error: null }), {
				onto_project_members: member,
				people_requests: [
					{
						id: 'r1',
						status: 'declined',
						created_at: new Date().toISOString(),
						decided_at: new Date().toISOString(),
						requested_items: [{ project_id: PROJECT, need: 'agents_write' }]
					}
				]
			});
			const said = await executePeopleTool({
				admin: declined.admin,
				userId: 'user-me',
				callerId: 'caller-1',
				scope: writeScope,
				toolName: 'check_project_access',
				arguments: { project_id: PROJECT }
			});
			expect(said.result).toMatchObject({ status: 'owner_said_no' });

			const fresh = fakeAdmin(() => ({ data: null, error: null }), {
				onto_project_members: member
			});
			const needs = await executePeopleTool({
				admin: fresh.admin,
				userId: 'user-me',
				callerId: 'caller-1',
				scope: writeScope,
				toolName: 'check_project_access',
				arguments: { project_id: PROJECT },
				connectorOrigin: 'https://build-os.com'
			});
			expect(needs.result).toMatchObject({
				status: 'needs_owner',
				access_needed: {
					wall: 'owner_allows_read_only',
					next: { tool: 'request_project_access', args: { project_id: PROJECT } }
				}
			});
		});
	});
});
