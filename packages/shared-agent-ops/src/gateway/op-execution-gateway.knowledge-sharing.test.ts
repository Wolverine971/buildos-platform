// packages/shared-agent-ops/src/gateway/op-execution-gateway.knowledge-sharing.test.ts
//
// Knowledge in shared projects (tasker 168): knowledge.project_lens and knowledge.request_access.
// The database decides what a member sees (20261118300000); these runners must
//   - pass p_viewer = the authenticated user on the context, never a model argument,
//   - refuse when the owner turned this member's agents off in the project,
//   - let a selected-projects connection read the lens on its own projects only, never ask,
//   - label every fact with who shared it and how (project scope or a grant).
import { describe, expect, it, vi } from 'vitest';
import { EXTERNAL_OP_HANDLERS } from './op-execution-gateway.external';
import {
	knowledgeGrantValueKey,
	lensGrantedValueKeys,
	runKnowledgeProjectLens
} from './op-execution-gateway.knowledge';
import type { ToolExecutionContext } from './op-execution-gateway.types';
import { AGENT_OP_GATEWAY_READ_CATALOG } from './op-execution-gateway.worker';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const OTHER_PROJECT = '44444444-4444-4444-8444-444444444444';
const ENTITY = '55555555-5555-4555-8555-555555555555';
const ACTOR = '66666666-6666-4666-8666-666666666666';
const TASK = '77777777-7777-4777-8777-777777777777';
const DOC = '88888888-8888-4888-8888-888888888888';

const LENS_ENTRY = {
	owner: { user_id: OTHER_USER, name: 'DJ' },
	entity: { id: ENTITY, kind: 'person', name: 'Kyle Reed', summary: 'Seed investor' },
	record_ids: [TASK],
	quotes: ['Call Kyle about the round'],
	facts: [
		{
			id: 'f1',
			predicate: 'works_at',
			value: null,
			object_name: 'Acme Ventures',
			object_kind: 'org',
			qualifiers: { title: 'Partner' },
			source_url: 'https://acme.vc/team',
			via: 'shared'
		},
		{
			id: 'f2',
			predicate: 'email',
			value: 'Kyle@Acme.vc',
			object_name: null,
			object_kind: null,
			qualifiers: {},
			source_url: null,
			via: 'grant'
		}
	],
	hidden: { contact: 1, other: 2 },
	ask: null,
	grant: { id: 'g1', what: 'contact', duration: 'membership', expires_at: null }
};

type Options = {
	agentAccess?: string | null;
	lensError?: { code: string; message: string };
	share?: Record<string, unknown>;
};

function fakeAdmin(options: Options = {}) {
	const rpc = vi.fn(async (fn: string, _args: Record<string, unknown>) => {
		if (fn === 'people_layer_effective_agent_access') {
			return {
				data: options.agentAccess === undefined ? 'read' : options.agentAccess,
				error: null
			};
		}
		if (fn === 'knowledge_project_lens') {
			if (options.lensError) return { data: null, error: options.lensError };
			const args = _args as { p_record_kind: string };
			return {
				data: { entries: args.p_record_kind === 'task' ? [LENS_ENTRY] : [] },
				error: null
			};
		}
		if (fn === 'knowledge_request_share') {
			return {
				data: options.share ?? { status: 'requested', id: 'share-1', merged: false },
				error: null
			};
		}
		return { data: null, error: { message: `unexpected rpc ${fn}` } };
	});
	const tables: string[] = [];
	const from = vi.fn((table: string) => {
		tables.push(table);
		const single = async () =>
			table === 'onto_actors'
				? { data: { id: ACTOR }, error: null }
				: table === 'onto_projects'
					? { data: { id: PROJECT, name: 'Launch' }, error: null }
					: { data: null, error: null };
		const rows =
			table === 'onto_tasks'
				? [{ id: TASK }]
				: table === 'onto_documents'
					? [{ id: DOC }]
					: [];
		const chain: any = new Proxy(
			{},
			{
				get(_target, prop) {
					if (prop === 'then') {
						return (resolve: (value: unknown) => void) =>
							resolve({ data: rows, error: null });
					}
					if (prop === 'maybeSingle' || prop === 'single') return single;
					return () => chain;
				}
			}
		);
		return chain;
	});
	return { admin: { rpc, from }, rpc, from, tables };
}

function chatContext(admin: unknown): ToolExecutionContext {
	return {
		admin,
		userId: USER,
		chatSessionId: 'chat-session',
		scope: { mode: 'read_write', project_ids: [PROJECT], write_project_ids: [PROJECT] }
	};
}

function mcpContext(
	admin: unknown,
	overrides: Partial<ToolExecutionContext> = {}
): ToolExecutionContext {
	return {
		admin,
		userId: USER,
		callerId: 'caller-1',
		callSessionId: 'call-session',
		projectScopeMode: 'all_unrestricted',
		scope: { mode: 'read_only', project_ids: [PROJECT] },
		...overrides
	};
}

const lens = EXTERNAL_OP_HANDLERS['knowledge.project_lens'];
const ask = EXTERNAL_OP_HANDLERS['knowledge.request_access'];

describe('knowledge.project_lens', () => {
	it('reads as the context user, ignoring a viewer in the arguments, and labels every fact', async () => {
		const { admin, rpc } = fakeAdmin();
		const result = await lens(mcpContext(admin), {
			project_id: PROJECT,
			record_kind: 'task',
			p_viewer: OTHER_USER,
			user_id: OTHER_USER
		});

		const lensCalls = rpc.mock.calls.filter(([fn]) => fn === 'knowledge_project_lens');
		expect(lensCalls).toHaveLength(1);
		expect(lensCalls[0]![1]).toMatchObject({
			p_project: PROJECT,
			p_record_kind: 'task',
			p_record_ids: [TASK],
			p_viewer: USER
		});
		expect(result).toMatchObject({
			project: { id: PROJECT, name: 'Launch' },
			records_checked: 1,
			total: 1,
			entries: [
				{
					entity: { id: ENTITY, kind: 'person', name: 'Kyle Reed' },
					shared_by: 'DJ',
					facts: [
						{
							predicate: 'works_at',
							object: { name: 'Acme Ventures', kind: 'org' },
							source_url: 'https://acme.vc/team',
							shared_by: 'DJ',
							scope: 'project:Launch'
						},
						{
							predicate: 'email',
							value: 'Kyle@Acme.vc',
							shared_by: 'DJ',
							scope: 'grant'
						}
					],
					hidden: { contact: 1, other: 2 },
					grant: { what: 'contact', duration: 'membership' },
					can_ask: true,
					on_records: [TASK]
				}
			]
		});
		expect(String(result.guidance)).toMatch(/not the user's/);
		// Owner user ids never reach the model.
		expect(JSON.stringify(result)).not.toContain(OTHER_USER);
	});

	it('covers both tasks and documents when no record kind is given', async () => {
		const { admin, rpc } = fakeAdmin();
		const result = await runKnowledgeProjectLens(admin as never, USER, { project_id: PROJECT });
		const kinds = rpc.mock.calls
			.filter(([fn]) => fn === 'knowledge_project_lens')
			.map(([, args]) => (args as { p_record_kind: string }).p_record_kind)
			.sort();
		expect(kinds).toEqual(['document', 'task']);
		expect(result).toMatchObject({
			record_kind: 'task+document',
			records_checked: 2,
			total: 1
		});
	});

	it("refuses when the owner turned this member's agents off in the project", async () => {
		const { admin, rpc } = fakeAdmin({ agentAccess: 'off' });
		await expect(lens(chatContext(admin), { project_id: PROJECT })).rejects.toMatchObject({
			code: 'FORBIDDEN',
			message: expect.stringMatching(/turned off agents/)
		});
		expect(rpc.mock.calls.map(([fn]) => fn)).not.toContain('knowledge_project_lens');
		expect(
			rpc.mock.calls.find(([fn]) => fn === 'people_layer_effective_agent_access')![1]
		).toEqual({
			p_project_id: PROJECT,
			p_actor_id: ACTOR
		});
	});

	it('says plainly when the user is not a member (the database refuses)', async () => {
		const { admin } = fakeAdmin({ lensError: { code: '42501', message: 'Not a member' } });
		await expect(lens(chatContext(admin), { project_id: PROJECT })).rejects.toMatchObject({
			code: 'FORBIDDEN'
		});
	});

	it('runs the membership check even when the project has no records', async () => {
		const { admin, rpc } = fakeAdmin({ lensError: { code: '42501', message: 'Not a member' } });
		await expect(
			runKnowledgeProjectLens(admin as never, USER, {
				project_id: PROJECT,
				record_kind: 'task',
				record_ids: []
			})
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
		expect(rpc.mock.calls.some(([fn]) => fn === 'knowledge_project_lens')).toBe(true);
	});

	it('lets a selected-projects connection read its own projects only', async () => {
		const { admin, rpc } = fakeAdmin();
		const selected = mcpContext(admin, {
			projectScopeMode: 'selected',
			scope: { mode: 'read_only', project_ids: [PROJECT] }
		});
		await expect(lens(selected, { project_id: PROJECT })).resolves.toMatchObject({ total: 1 });
		await expect(lens(selected, { project_id: OTHER_PROJECT })).rejects.toMatchObject({
			code: 'FORBIDDEN'
		});
		// The personal graph stays closed to it.
		await expect(
			EXTERNAL_OP_HANDLERS['knowledge.search'](selected, { query: 'Kyle' })
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
		expect(rpc.mock.calls.map(([fn]) => fn)).not.toContain('knowledge_search');
	});

	it('refuses a project outside the connection scope before reading anything', async () => {
		const { admin, rpc, from } = fakeAdmin();
		await expect(lens(mcpContext(admin), { project_id: OTHER_PROJECT })).rejects.toMatchObject({
			code: 'FORBIDDEN'
		});
		expect(rpc).not.toHaveBeenCalled();
		expect(from).not.toHaveBeenCalled();
	});

	it('needs record_kind with explicit record ids', async () => {
		const { admin } = fakeAdmin();
		await expect(
			lens(mcpContext(admin), { project_id: PROJECT, record_ids: [TASK] })
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
	});
});

describe('knowledge.request_access', () => {
	it('asks as the context user via agent, and flags only a brand-new ask for the email', async () => {
		const { admin, rpc } = fakeAdmin();
		const result = await ask(mcpContext(admin), {
			entity_id: ENTITY,
			project_id: PROJECT,
			what: 'all',
			p_viewer: OTHER_USER
		});
		expect(rpc.mock.calls.find(([fn]) => fn === 'knowledge_request_share')![1]).toEqual({
			p_entity: ENTITY,
			p_project: PROJECT,
			p_what: 'all',
			p_viewer: USER,
			p_via: 'agent'
		});
		expect(result).toMatchObject({
			knowledge_ask: { status: 'sent', id: 'share-1', new_request: true, what: 'all' }
		});

		const merged = fakeAdmin({ share: { status: 'requested', id: 'share-1', merged: true } });
		await expect(
			ask(chatContext(merged.admin), { entity_id: ENTITY, project_id: PROJECT })
		).resolves.toMatchObject({
			knowledge_ask: { status: 'already_waiting', new_request: false, what: 'contact' }
		});

		const declined = fakeAdmin({ share: { status: 'declined' } });
		await expect(
			ask(chatContext(declined.admin), { entity_id: ENTITY, project_id: PROJECT })
		).resolves.toMatchObject({
			knowledge_ask: { status: 'owner_said_no', new_request: false }
		});
	});

	it('refuses when agents are off in the project, and on a selected-projects connection', async () => {
		const off = fakeAdmin({ agentAccess: 'off' });
		await expect(
			ask(chatContext(off.admin), { entity_id: ENTITY, project_id: PROJECT })
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
		expect(off.rpc.mock.calls.map(([fn]) => fn)).not.toContain('knowledge_request_share');

		const selected = fakeAdmin();
		await expect(
			ask(
				mcpContext(selected.admin, {
					projectScopeMode: 'selected',
					scope: { mode: 'read_only', project_ids: [PROJECT] }
				}),
				{ entity_id: ENTITY, project_id: PROJECT }
			)
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
		expect(selected.rpc).not.toHaveBeenCalled();
	});

	it('only offers contact or everything, and is never a background Agent Run read', async () => {
		const { admin } = fakeAdmin();
		await expect(
			ask(chatContext(admin), { entity_id: ENTITY, project_id: PROJECT, what: 'picked' })
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
		expect(AGENT_OP_GATEWAY_READ_CATALOG).toContain('knowledge.project_lens');
		expect(AGENT_OP_GATEWAY_READ_CATALOG).not.toContain('knowledge.request_access');
	});
});

describe('granted value keys', () => {
	it('keys granted values by normalized value, never shared ones', () => {
		const keys = lensGrantedValueKeys({
			entries: [
				{
					facts: [
						{ predicate: 'email', value: ' Kyle@Acme.VC ', scope: 'grant' },
						{ predicate: 'url', value: 'https://acme.vc/team', scope: 'project:Launch' }
					]
				}
			]
		});
		expect(keys).toEqual([knowledgeGrantValueKey('email', 'kyle@acme.vc')]);
		expect(keys[0]).not.toContain('kyle');
		expect(knowledgeGrantValueKey('phone', '+1 (410) 555-0100')).toBe(
			knowledgeGrantValueKey('phone', '+14105550100')
		);
	});
});
