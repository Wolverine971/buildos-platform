// packages/agentic-chat-runtime/src/context/context-loader.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
// These are the context/loader and context entries, with no web host or aliases.
import { createFastChatContextLoader } from './context-loader';
import type { GlobalContextData, ProjectContextData } from './index';

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

// Tasker 122: the global index carries each project's parent so the prompt can
// say "part of X" / "includes N". Only parents the viewer can open (index
// members) are recorded; a failed read leaves the index unlabeled.
describe('global project index hierarchy', () => {
	const HUB = '00000000-0000-4000-8000-0000000000b1';
	const CHILD = '00000000-0000-4000-8000-0000000000b2';
	const ORPHAN = '00000000-0000-4000-8000-0000000000b3';
	const HIDDEN_PARENT = '00000000-0000-4000-8000-0000000000b9';
	const projects = [
		{
			id: HUB,
			name: 'Wayne Strategies',
			state_key: 'active',
			updated_at: '2026-10-16T00:00:00Z'
		},
		{ id: CHILD, name: 'Cadre', state_key: 'active', updated_at: '2026-10-15T00:00:00Z' },
		{ id: ORPHAN, name: 'Solo', state_key: 'active', updated_at: '2026-10-14T00:00:00Z' }
	];
	const hierarchyRows = [
		{ id: HUB, parent_project_id: null, start_at: null, end_at: null },
		{ id: CHILD, parent_project_id: HUB, start_at: null, end_at: null },
		{ id: ORPHAN, parent_project_id: HIDDEN_PARENT, start_at: null, end_at: null }
	];

	function globalClient(options: {
		rpcPayload: unknown;
		projectsReply?: { data: unknown; error: unknown };
		/** What ensure_workspace_project returns; absent means the RPC fails. */
		workspaceId?: string;
		summaries?: unknown[];
	}) {
		const selects: Record<string, string[]> = {};
		const rpc = vi.fn(async (fn: string) => {
			if (fn === 'load_fastchat_context') return { data: options.rpcPayload, error: null };
			if (fn === 'ensure_actor_for_user') return { data: 'actor-1', error: null };
			if (fn === 'get_onto_project_summaries_v1')
				return { data: options.summaries ?? projects, error: null };
			if (fn === 'ensure_workspace_project')
				return options.workspaceId
					? { data: options.workspaceId, error: null }
					: { data: null, error: { message: 'no session' } };
			throw new Error(`Unexpected rpc: ${fn}`);
		});
		const from = vi.fn((table: string) => {
			const reply =
				table === 'onto_projects'
					? (options.projectsReply ?? { data: hierarchyRows, error: null })
					: { data: [], error: null };
			const chain: Record<string, any> = {};
			for (const method of ['in', 'is', 'eq', 'or', 'gte', 'lte', 'order', 'limit']) {
				chain[method] = () => chain;
			}
			chain.select = (columns: string) => {
				(selects[table] ??= []).push(columns);
				return chain;
			};
			chain.maybeSingle = async () => ({
				data: { timezone: 'UTC', name: null },
				error: null
			});
			chain.then = (resolve: (value: unknown) => unknown) =>
				Promise.resolve(reply).then(resolve);
			return chain;
		});
		return { client: { rpc, from } as unknown as SupabaseClient<Database>, selects };
	}

	async function loadGlobal(client: SupabaseClient<Database>) {
		const loader = createFastChatContextLoader({ logger: { warn: vi.fn() } });
		const context = await loader.loadFastChatPromptContext({
			supabase: client,
			userId: USER_ID,
			contextType: 'global'
		});
		return context.data as { project_index: Array<Record<string, unknown>> };
	}

	const parentsOf = (data: { project_index: Array<Record<string, unknown>> }) =>
		Object.fromEntries(data.project_index.map((entry) => [entry.id, entry.parent_project_id]));

	it('labels the RPC index with a separate parent read', async () => {
		const { client, selects } = globalClient({
			rpcPayload: {
				projects,
				project_intelligence: { generated_at: '2026-10-17T00:00:00Z', scope: 'global' }
			}
		});
		const data = await loadGlobal(client);
		expect(selects.onto_projects).toEqual(['id, parent_project_id, kind']);
		// The orphan's parent is not in the index (the viewer can't open it): not recorded.
		expect(parentsOf(data)).toEqual({ [HUB]: undefined, [CHILD]: HUB, [ORPHAN]: undefined });
	});

	it('reads parents in the fallback date query with no extra round trip', async () => {
		const { client, selects } = globalClient({ rpcPayload: null });
		const data = await loadGlobal(client);
		expect(selects.onto_projects).toEqual(['id, start_at, end_at, parent_project_id']);
		expect(parentsOf(data)).toEqual({ [HUB]: undefined, [CHILD]: HUB, [ORPHAN]: undefined });
	});

	it('keeps the index, unlabeled, when the parent read fails', async () => {
		const { client } = globalClient({
			rpcPayload: {
				projects,
				project_intelligence: { generated_at: '2026-10-17T00:00:00Z', scope: 'global' }
			},
			projectsReply: { data: null, error: { message: 'boom' } }
		});
		const data = await loadGlobal(client);
		expect(data.project_index).toHaveLength(3);
		expect(Object.values(parentsOf(data)).every((value) => value === undefined)).toBe(true);
	});
});

// Workspace (2026-10-23): the user's kind='workspace' project keeps an index
// entry, marked, but is never a bundle and never counted as a project. Its id
// rides the context so a save that fits no project has a home.
describe('global context Workspace', () => {
	const WS = '00000000-0000-4000-8000-0000000000c1';
	const P1 = '00000000-0000-4000-8000-0000000000c2';
	const P2 = '00000000-0000-4000-8000-0000000000c3';
	const projects = [
		{ id: WS, name: 'Workspace', state_key: 'active', updated_at: '2026-10-23T00:00:00Z' },
		{ id: P1, name: 'Launch', state_key: 'active', updated_at: '2026-10-22T00:00:00Z' },
		{ id: P2, name: 'Book', state_key: 'paused', updated_at: '2026-10-21T00:00:00Z' }
	];

	function client(options: {
		rpcPayload: unknown;
		workspaceId?: string;
		summaries?: unknown[];
		kindRows?: unknown[];
	}) {
		const rpc = vi.fn(async (fn: string) => {
			if (fn === 'load_fastchat_context') return { data: options.rpcPayload, error: null };
			if (fn === 'ensure_actor_for_user') return { data: 'actor-1', error: null };
			if (fn === 'get_onto_project_summaries_v1')
				return { data: options.summaries ?? projects, error: null };
			if (fn === 'ensure_workspace_project')
				return options.workspaceId
					? { data: options.workspaceId, error: null }
					: { data: null, error: { message: 'no session' } };
			throw new Error(`Unexpected rpc: ${fn}`);
		});
		const from = vi.fn((table: string) => {
			const reply =
				table === 'onto_projects'
					? { data: options.kindRows ?? [], error: null }
					: { data: [], error: null };
			const chain: Record<string, any> = {};
			for (const method of [
				'select',
				'in',
				'is',
				'eq',
				'or',
				'gte',
				'lte',
				'order',
				'limit'
			]) {
				chain[method] = () => chain;
			}
			chain.maybeSingle = async () => ({
				data: { timezone: 'UTC', name: null },
				error: null
			});
			chain.then = (resolve: (value: unknown) => unknown) =>
				Promise.resolve(reply).then(resolve);
			return chain;
		});
		return { rpc, from } as unknown as SupabaseClient<Database>;
	}

	async function loadGlobal(supabase: SupabaseClient<Database>) {
		const loader = createFastChatContextLoader({ logger: { warn: vi.fn() } });
		const context = await loader.loadFastChatPromptContext({
			supabase,
			userId: USER_ID,
			contextType: 'global'
		});
		return context.data as GlobalContextData;
	}

	const rpcPayload = {
		projects,
		project_intelligence: { generated_at: '2026-10-23T00:00:00Z', scope: 'global' }
	};

	it('marks the Workspace in the RPC index and keeps it out of bundles and counts', async () => {
		const data = await loadGlobal(client({ rpcPayload, workspaceId: WS }));
		expect(data.workspace_project_id).toBe(WS);
		expect(data.project_index.find((entry) => entry.id === WS)?.kind).toBe('workspace');
		expect(data.project_index.find((entry) => entry.id === P1)?.kind).toBeUndefined();
		expect(data.projects.map((bundle) => bundle.project.id)).toEqual([P1, P2]);
		expect(data.context_meta).toMatchObject({
			project_count: 2,
			active_project_count: 1,
			projects_returned: 2
		});
	});

	it('falls back to the kind column when the ensure call fails', async () => {
		const data = await loadGlobal(
			client({
				rpcPayload,
				kindRows: [{ id: WS, parent_project_id: null, kind: 'workspace' }]
			})
		);
		expect(data.workspace_project_id).toBe(WS);
		expect(data.project_index.find((entry) => entry.id === WS)?.kind).toBe('workspace');
	});

	it('carries a Workspace created by this load even before it is in the summaries', async () => {
		const NEW_WS = '00000000-0000-4000-8000-0000000000c9';
		const data = await loadGlobal(client({ rpcPayload, workspaceId: NEW_WS }));
		expect(data.workspace_project_id).toBe(NEW_WS);
		expect(data.project_index.some((entry) => entry.kind === 'workspace')).toBe(false);
		expect(data.context_meta?.project_count).toBe(3);
	});

	it('finds the Workspace from summary kind on the fallback path', async () => {
		const data = await loadGlobal(
			client({
				rpcPayload: null,
				summaries: projects.map((project) =>
					project.id === WS ? { ...project, kind: 'workspace' } : project
				)
			})
		);
		expect(data.workspace_project_id).toBe(WS);
		expect(data.project_index.find((entry) => entry.id === WS)?.kind).toBe('workspace');
		expect(data.projects.map((bundle) => bundle.project.id)).not.toContain(WS);
		expect(data.context_meta?.project_count).toBe(2);
	});

	it('adds the Workspace id to a project context only on request', async () => {
		const loader = createFastChatContextLoader({ logger: { warn: vi.fn() } });
		const rpc = vi.fn(async (fn: string) =>
			fn === 'ensure_workspace_project'
				? { data: WS, error: null }
				: { data: null, error: null }
		);
		const from = vi.fn(() => {
			const chain: Record<string, any> = {};
			for (const method of [
				'select',
				'in',
				'is',
				'eq',
				'or',
				'gte',
				'lte',
				'order',
				'limit'
			]) {
				chain[method] = () => chain;
			}
			chain.maybeSingle = async () => ({ data: null, error: null });
			chain.then = (resolve: (value: unknown) => unknown) =>
				Promise.resolve({ data: [], error: null }).then(resolve);
			return chain;
		});
		const supabase = { rpc, from } as unknown as SupabaseClient<Database>;
		await loader.loadFastChatPromptContext({
			supabase,
			userId: USER_ID,
			contextType: 'project',
			entityId: P1
		});
		expect(rpc).not.toHaveBeenCalledWith('ensure_workspace_project');
		await loader.loadFastChatPromptContext({
			supabase,
			userId: USER_ID,
			contextType: 'project',
			entityId: P1,
			includeWorkspace: true
		});
		expect(rpc).toHaveBeenCalledWith('ensure_workspace_project');
	});
});
