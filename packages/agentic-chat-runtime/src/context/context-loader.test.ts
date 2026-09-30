// packages/agentic-chat-runtime/src/context/context-loader.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
// These are the context/loader and context entries, with no web host or aliases.
import { createFastChatContextLoader } from './context-loader';
import type { ProjectContextData } from './index';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const PROJECT_ID = '00000000-0000-4000-8000-000000000002';

function projectClient(
	rpcResult: { data: unknown; error: unknown },
	timezone = 'America/New_York',
	name: string | null = null
) {
	const rpc = vi.fn().mockResolvedValue(rpcResult);
	const select = vi.fn(() => ({
		eq: vi.fn(() => ({
			maybeSingle: vi.fn().mockResolvedValue({ data: { timezone, name }, error: null })
		}))
	}));
	const from = vi.fn((table: string) => {
		if (table === 'users') {
			return { select };
		}
		if (table === 'onto_documents') {
			const query = {
				select: vi.fn(() => query),
				eq: vi.fn(() => query),
				is: vi.fn(() => query),
				order: vi.fn(() => query),
				limit: vi.fn().mockResolvedValue({ data: [], error: null })
			};
			return query;
		}
		throw new Error(`Unexpected context query: ${table}`);
	});
	return { client: { rpc, from } as unknown as SupabaseClient<Database>, rpc, from, select };
}

describe('user prompt profile', () => {
	it('loads the display name with the timezone in one users query and normalizes it', async () => {
		const { client, select } = projectClient(
			{ data: null, error: null },
			'America/New_York',
			'  DJ \n Wayne  '
		);
		const { loadFastChatPromptContext } = createFastChatContextLoader({
			logger: { warn: vi.fn() }
		});
		const context = await loadFastChatPromptContext({
			supabase: client,
			userId: USER_ID,
			contextType: 'global'
		});
		expect(context).toMatchObject({
			timezone: 'America/New_York',
			userDisplayName: 'DJ Wayne'
		});
		// One lookup for both values: no second users round trip per turn.
		expect(select).toHaveBeenCalledExactlyOnceWith('timezone, name');
	});

	it('renders no name for a blank or absent profile name and bounds a runaway value', async () => {
		const loader = createFastChatContextLoader({ logger: { warn: vi.fn() } });
		const blank = await loader.loadFastChatPromptContext({
			supabase: projectClient({ data: null, error: null }, 'UTC', '   ').client,
			userId: USER_ID,
			contextType: 'global'
		});
		expect(blank.userDisplayName).toBeNull();
		const long = await loader.loadFastChatPromptContext({
			supabase: projectClient({ data: null, error: null }, 'UTC', 'x'.repeat(200)).client,
			userId: USER_ID,
			contextType: 'global'
		});
		expect(long.userDisplayName).toHaveLength(80);
	});
});

describe('portable context loading', () => {
	it('loads project context through the runtime entry point without a web host', async () => {
		const { client, rpc } = projectClient({
			data: {
				project: {
					id: PROJECT_ID,
					name: 'Launch workspace',
					state_key: 'active',
					description: 'Prepare the launch',
					updated_at: '2026-09-12T12:00:00Z'
				},
				tasks: [],
				documents: []
			},
			error: null
		});
		const { loadFastChatPromptContext } = createFastChatContextLoader({
			logger: { warn: vi.fn() }
		});
		const context = await loadFastChatPromptContext({
			supabase: client,
			userId: USER_ID,
			contextType: 'project',
			entityId: PROJECT_ID
		});
		expect(rpc).toHaveBeenNthCalledWith(1, 'load_fastchat_context', {
			p_context_type: 'project',
			p_user_id: USER_ID,
			p_project_id: PROJECT_ID,
			p_focus_type: undefined,
			p_focus_entity_id: undefined
		});
		// The project family (hierarchy phase 1) loads after the RPC authorized the project.
		expect(rpc.mock.calls.map(([fn]) => fn)).toEqual([
			'load_fastchat_context',
			'onto_project_family_v1'
		]);
		expect(context).toMatchObject({
			contextLoadSource: 'rpc',
			projectId: PROJECT_ID,
			projectName: 'Launch workspace',
			timezone: 'America/New_York'
		});
		expect((context.data as ProjectContextData).project).toMatchObject({ id: PROJECT_ID });
	});

	it.each([
		{ data: null, error: null, source: 'rpc_null_fallback' },
		{ data: {}, error: null, source: 'rpc_null_fallback' },
		{ data: null, error: { message: 'Access denied' }, source: 'rpc_error_fallback' }
	])(
		'does not read project tables when the authorizing RPC returns $source',
		async ({ data, error, source }) => {
			const { client, from } = projectClient({ data, error });
			const { loadFastChatPromptContext } = createFastChatContextLoader({
				logger: { warn: vi.fn() }
			});
			const context = await loadFastChatPromptContext({
				supabase: client,
				userId: USER_ID,
				contextType: 'project',
				entityId: PROJECT_ID
			});
			expect(context).toMatchObject({ data: null, contextLoadSource: source });
			expect(from.mock.calls.map(([table]) => table)).toEqual(['users']);
		}
	);

	it('keeps host logging separate and contains a failing error reporter', async () => {
		const firstLogger = { warn: vi.fn() };
		const secondLogger = { warn: vi.fn() };
		const first = createFastChatContextLoader({ logger: firstLogger });
		const second = createFastChatContextLoader({ logger: secondLogger });
		const callbackError = new Error('Reporter unavailable');
		const params = { userId: USER_ID, contextType: 'project' as const, entityId: PROJECT_ID };
		const [firstContext, secondContext] = await Promise.all([
			first.loadFastChatPromptContext({
				...params,
				supabase: projectClient({ data: null, error: null }, 'invalid-zone').client,
				onError: () => {
					throw callbackError;
				}
			}),
			second.loadFastChatPromptContext({
				...params,
				supabase: projectClient({ data: null, error: { message: 'RPC unavailable' } })
					.client
			})
		]);
		expect(firstContext).toMatchObject({ data: null, timezone: 'UTC' });
		expect(secondContext).toMatchObject({ data: null, timezone: 'America/New_York' });
		expect(firstLogger.warn).toHaveBeenCalledExactlyOnceWith(
			'FastChat context error callback failed',
			{ stage: 'rpc.load_fastchat_context.empty_payload', callbackError }
		);
		expect(secondLogger.warn).toHaveBeenCalledExactlyOnceWith(
			'FastChat context RPC failed',
			expect.objectContaining({ error: { message: 'RPC unavailable' } })
		);
	});
});

describe('project family (hierarchy phase 1)', () => {
	const PARENT_ID = '00000000-0000-4000-8000-0000000000aa';
	const ACTOR_ID = '00000000-0000-4000-8000-0000000000ac';
	const projectPayload = {
		project: {
			id: PROJECT_ID,
			name: 'Redline',
			state_key: 'active',
			description: null,
			updated_at: '2026-09-12T12:00:00Z'
		},
		tasks: [],
		documents: []
	};
	const childFamily = {
		project_id: PROJECT_ID,
		parent: {
			id: PARENT_ID,
			name: 'Wayne Strategies',
			state_key: 'active',
			can_write: true,
			shared_folder_document_id: 'folder-1',
			child_count: 5
		},
		shelf: [
			{
				id: 'doc-1',
				title: 'Voice guide',
				description: null,
				type_key: 'document.default',
				state_key: 'draft',
				updated_at: '2026-09-29T00:00:00Z',
				tree_parent_id: null,
				depth: 0
			}
		],
		children: [],
		own_shared_folder_document_id: null,
		child_count: 0
	};

	type RpcReply = { data: unknown; error: { code?: string; message: string } | null };
	function familyClient(familyReplies: RpcReply[]) {
		const replies = [...familyReplies];
		const rpc = vi.fn(async (fn: string) => {
			if (fn === 'load_fastchat_context') return { data: projectPayload, error: null };
			if (fn === 'ensure_actor_for_user') return { data: ACTOR_ID, error: null };
			if (fn === 'onto_project_family_v1')
				return replies.shift() ?? { data: null, error: { message: 'no reply queued' } };
			throw new Error(`Unexpected rpc: ${fn}`);
		});
		const base = projectClient({ data: null, error: null });
		return { client: { rpc, from: base.from } as unknown as SupabaseClient<Database>, rpc };
	}
	async function load(client: SupabaseClient<Database>, onError = vi.fn(), warn = vi.fn()) {
		const loader = createFastChatContextLoader({ logger: { warn } });
		const context = await loader.loadFastChatPromptContext({
			supabase: client,
			userId: USER_ID,
			contextType: 'project',
			entityId: PROJECT_ID,
			onError
		});
		return { data: context.data as ProjectContextData, onError, warn, loader };
	}

	it('attaches the family a signed-in client reads in one call', async () => {
		const { client, rpc } = familyClient([{ data: childFamily, error: null }]);
		const { data } = await load(client);
		expect(data.project_family).toMatchObject({
			parent: { id: PARENT_ID, name: 'Wayne Strategies', child_count: 5 },
			shelf: [{ id: 'doc-1', title: 'Voice guide' }]
		});
		expect(rpc).toHaveBeenCalledWith('onto_project_family_v1', { p_project_id: PROJECT_ID });
		expect(rpc.mock.calls.map(([fn]) => fn)).not.toContain('ensure_actor_for_user');
	});

	it('names the actor and retries when a service client is refused without one', async () => {
		const { client, rpc } = familyClient([
			{ data: null, error: { code: '42501', message: 'project_family_access_denied' } },
			{ data: childFamily, error: null }
		]);
		const { data, onError } = await load(client);
		expect(data.project_family?.parent?.id).toBe(PARENT_ID);
		expect(rpc).toHaveBeenCalledWith('ensure_actor_for_user', { p_user_id: USER_ID });
		expect(rpc).toHaveBeenLastCalledWith('onto_project_family_v1', {
			p_project_id: PROJECT_ID,
			p_actor_id: ACTOR_ID
		});
		expect(onError).not.toHaveBeenCalledWith(
			expect.objectContaining({ stage: 'rpc.project_family' })
		);
	});

	it('leaves the family off a project with no parent and no readable children', async () => {
		const { client } = familyClient([
			{
				data: { ...childFamily, parent: null, shelf: [], children: [], child_count: 2 },
				error: null
			}
		]);
		const { data } = await load(client);
		expect(data.project).toMatchObject({ id: PROJECT_ID });
		expect('project_family' in data).toBe(false);
	});

	it('fails open: a missing RPC warns once per loader, other errors report', async () => {
		const missing = { code: 'PGRST202', message: 'Could not find the function' };
		const warn = vi.fn();
		const loader = createFastChatContextLoader({ logger: { warn } });
		const onError = vi.fn();
		for (let i = 0; i < 2; i += 1) {
			const context = await loader.loadFastChatPromptContext({
				supabase: familyClient([{ data: null, error: missing }]).client,
				userId: USER_ID,
				contextType: 'project',
				entityId: PROJECT_ID,
				onError
			});
			expect((context.data as ProjectContextData).project.id).toBe(PROJECT_ID);
			expect('project_family' in (context.data as object)).toBe(false);
		}
		expect(
			warn.mock.calls.filter(([message]) => String(message).includes('Project family'))
		).toHaveLength(1);
		expect(onError).not.toHaveBeenCalledWith(
			expect.objectContaining({ stage: 'rpc.project_family' })
		);

		const broken = await load(
			familyClient([{ data: null, error: { code: 'XX000', message: 'boom' } }]).client
		);
		expect(broken.data.project.id).toBe(PROJECT_ID);
		expect(broken.onError).toHaveBeenCalledWith(
			expect.objectContaining({ stage: 'rpc.project_family' })
		);
	});
});
