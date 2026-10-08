// apps/web/src/routes/projects/[id]/page.server.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { ensureActorIdMock, tryGetProjectFamilyMock } = vi.hoisted(() => ({
	ensureActorIdMock: vi.fn(),
	tryGetProjectFamilyMock: vi.fn()
}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: ensureActorIdMock
}));

vi.mock('$lib/services/ontology/project-hierarchy.service', () => ({
	tryGetProjectFamily: tryGetProjectFamilyMock
}));

import { load } from './+page.server';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

async function loadProjectPage(event: Parameters<typeof load>[0]) {
	const result = await load(event);
	if (!result) throw new Error('Expected project page data');
	return result;
}

type BundleAccess = {
	can_edit?: boolean;
	can_admin?: boolean;
	can_invite?: boolean;
	can_view_logs?: boolean;
	is_owner?: boolean;
	is_authenticated?: boolean;
	current_actor_id?: string | null;
};

type HarnessOptions = {
	userId?: string | null;
	bundleData?: Record<string, unknown> | null;
	bundleError?: { message: string; code?: string; details?: string } | null;
	fallbackData?: Record<string, unknown> | null;
	fallbackError?: { message: string; code?: string } | null;
	requestId?: string;
	access?: BundleAccess;
	pathname?: string;
	fullDataResponse?: Response;
};

function buildDefaultAccess(userId: string | null | undefined): BundleAccess {
	return {
		can_edit: false,
		can_admin: false,
		can_invite: false,
		can_view_logs: false,
		is_owner: false,
		is_authenticated: Boolean(userId),
		current_actor_id: userId ? 'actor-current' : null
	};
}

function createHarness(options: HarnessOptions = {}) {
	const operations: string[] = [];
	const timingLabels: string[] = [];

	const userId = options.userId === undefined ? 'user-1' : options.userId;
	const accessDefaults = buildDefaultAccess(userId);
	const access = { ...accessDefaults, ...(options.access ?? {}) };

	const baseBundleData = {
		id: PROJECT_ID,
		name: 'Project 1',
		description: null,
		state_key: 'active',
		type_key: 'project',
		next_step_short: null,
		next_step_long: null,
		next_step_source: null,
		next_step_updated_at: null,
		icon_emoji: { glyphs: ['📖', '🔚'], source: 'llm', ranked: [['📖', 0.3]] },
		access
	};
	const bundleData = options.bundleData === undefined ? baseBundleData : options.bundleData;

	const from = vi.fn((table: string) => {
		operations.push(`from:${table}`);
		throw new Error(`Unexpected table requested: ${table}`);
	});

	const rpc = vi.fn((fn: string) => {
		if (fn === 'get_project_skeleton_with_access_v2') {
			operations.push(`rpc:${fn}`);
			return Promise.resolve({
				data: bundleData,
				error: options.bundleError ?? null
			});
		}
		if (fn === 'get_project_full') {
			operations.push(`rpc:${fn}`);
			return Promise.resolve({
				data: options.fallbackData ?? null,
				error: options.fallbackError ?? null
			});
		}
		throw new Error(`Unexpected RPC requested: ${fn}`);
	});

	const safeGetSession = vi
		.fn()
		.mockResolvedValue(
			userId ? { user: { id: userId, email: 'test@example.com' } } : { user: null }
		);
	const fetch = vi.fn(() => {
		operations.push('fetch:project-full-v2');
		return Promise.resolve(
			options.fullDataResponse ??
				Response.json({
					success: true,
					data: { project: { id: PROJECT_ID, name: 'Project 1' } }
				})
		);
	});

	const event = {
		params: { id: PROJECT_ID },
		route: { id: '/projects/[id]' },
		request: new Request(`https://buildos.test/projects/${PROJECT_ID}`, {
			headers: { 'x-vercel-id': options.requestId ?? 'iad1::project-request' }
		}),
		url: new URL(`https://buildos.test${options.pathname ?? `/projects/${PROJECT_ID}`}`),
		fetch,
		locals: {
			supabase: { rpc, from },
			safeGetSession,
			serverTiming: {
				measure: vi.fn(async (name: string, fn: () => Promise<unknown> | unknown) => {
					timingLabels.push(name);
					return await fn();
				})
			}
		}
	} as any;

	return {
		event,
		operations,
		timingLabels,
		from,
		rpc,
		safeGetSession,
		fetch
	};
}

describe('projects/[id] +page.server load', () => {
	beforeEach(() => {
		ensureActorIdMock.mockReset();
		ensureActorIdMock.mockResolvedValue('actor-1');
		tryGetProjectFamilyMock.mockReset();
		tryGetProjectFamilyMock.mockResolvedValue(null);
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.mocked(console.error).mockClear();
		vi.mocked(console.warn).mockClear();
	});

	afterEach(() => vi.restoreAllMocks());

	it('owner access returns full owner/admin privileges from the RPC bundle', async () => {
		const { event, operations, from, safeGetSession } = createHarness({
			access: {
				can_edit: true,
				can_admin: true,
				can_invite: true,
				can_view_logs: true,
				is_owner: true,
				is_authenticated: true
			}
		});

		const result = await loadProjectPage(event);

		// The header emoji rides in the same bundle; no second query.
		expect(result.projectEmoji).toEqual({
			glyphs: ['📖', '🔚'],
			source: 'llm',
			suggestions: ['📖']
		});
		expect(result.access).toEqual({
			canEdit: true,
			canAdmin: true,
			canInvite: true,
			canViewLogs: true,
			isOwner: true,
			isAuthenticated: true,
			currentActorId: 'actor-current'
		});
		// Access stays on one count-free DB round-trip; full data starts immediately after it.
		expect(operations).toEqual([
			'rpc:get_project_skeleton_with_access_v2',
			'fetch:project-full-v2'
		]);
		expect(await result.deferredFullData).toEqual({
			ok: true,
			data: { project: { id: PROJECT_ID, name: 'Project 1' } }
		});
		expect(from).not.toHaveBeenCalled();
		expect(safeGetSession).toHaveBeenCalledOnce();
		expect(ensureActorIdMock).not.toHaveBeenCalled();
	});

	it('turns a deferred full-data failure into a recoverable page result', async () => {
		const { event } = createHarness({
			fullDataResponse: Response.json(
				{ success: false, error: 'Project data is temporarily unavailable' },
				{ status: 503 }
			)
		});

		const result = await loadProjectPage(event);

		expect(await result.deferredFullData).toEqual({
			ok: false,
			error: 'Project data is temporarily unavailable'
		});
	});

	it('editor access keeps invite/log visibility without admin', async () => {
		const { event } = createHarness({
			access: {
				can_edit: true,
				can_admin: false,
				can_invite: true,
				can_view_logs: true,
				is_owner: false,
				is_authenticated: true
			}
		});

		const result = await loadProjectPage(event);

		expect(result.access).toEqual({
			canEdit: true,
			canAdmin: false,
			canInvite: true,
			canViewLogs: true,
			isOwner: false,
			isAuthenticated: true,
			currentActorId: 'actor-current'
		});
	});

	it('viewer access remains read-only but can view logs', async () => {
		const { event } = createHarness({
			access: {
				can_edit: false,
				can_admin: false,
				can_invite: false,
				can_view_logs: true,
				is_owner: false,
				is_authenticated: true
			}
		});

		const result = await loadProjectPage(event);

		expect(result.access).toEqual({
			canEdit: false,
			canAdmin: false,
			canInvite: false,
			canViewLogs: true,
			isOwner: false,
			isAuthenticated: true,
			currentActorId: 'actor-current'
		});
	});

	it('redirects logged-out requests before project RPCs even when the layout is skipped', async () => {
		const destination = `/projects/${PROJECT_ID}?tab=tasks`;
		const { event, operations, rpc, from, fetch, safeGetSession } = createHarness({
			userId: null,
			pathname: destination,
			bundleError: {
				code: '42501',
				message: 'permission denied for function get_project_skeleton_with_access_v2'
			}
		});

		await expect(load(event)).rejects.toMatchObject({
			status: 303,
			location: `/auth/login?redirect=${encodeURIComponent(destination)}`
		});
		expect(operations).toEqual([]);
		expect(rpc).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
		expect(from).not.toHaveBeenCalled();
		expect(tryGetProjectFamilyMock).not.toHaveBeenCalled();
		expect(safeGetSession).toHaveBeenCalledOnce();
		expect(ensureActorIdMock).not.toHaveBeenCalled();
		expect(console.error).not.toHaveBeenCalled();
	});

	it('waits for session validation before starting project reads', async () => {
		const { event, rpc, safeGetSession } = createHarness();
		let finishSession!: (session: { user: { id: string } }) => void;
		safeGetSession.mockReturnValueOnce(
			new Promise((resolve) => {
				finishSession = resolve;
			})
		);

		const pendingLoad = loadProjectPage(event);
		expect(rpc).not.toHaveBeenCalled();
		expect(tryGetProjectFamilyMock).not.toHaveBeenCalled();
		finishSession({ user: { id: 'user-1' } });
		await pendingLoad;
		expect(rpc).toHaveBeenCalledOnce();
	});

	it('recovers a skeleton transport failure with a single full-data fallback', async () => {
		const { event, operations, safeGetSession } = createHarness({
			bundleError: { code: 'UND_ERR_SOCKET', message: 'fetch failed' },
			fallbackData: {
				project: { id: PROJECT_ID, name: 'Project 1' },
				context_document: { id: 'context-1' }
			}
		});

		const result = await loadProjectPage(event);
		expect(result.skeleton).toBe(false);
		expect(result.project.id).toBe(PROJECT_ID);
		expect(operations).toEqual([
			'rpc:get_project_skeleton_with_access_v2',
			'rpc:get_project_full'
		]);
		expect(safeGetSession).toHaveBeenCalledOnce();
	});

	it.each(['ETIMEDOUT', '42501'])(
		'ends a failed fallback without retrying and correlates %s failures to their request',
		async (code) => {
			const { event, operations } = createHarness({
				requestId: 'iad1::origin-request',
				pathname: `/projects/${PROJECT_ID}?private_note=do-not-log`,
				bundleError: { code, message: 'RPC unavailable' },
				fallbackError: { code, message: 'RPC unavailable' }
			});

			await expect(load(event)).rejects.toMatchObject({ status: 500 });
			expect(operations).toEqual([
				'rpc:get_project_skeleton_with_access_v2',
				'rpc:get_project_full'
			]);
			for (const prefix of ['Skeleton+access', 'Full']) {
				expect(console.error).toHaveBeenCalledWith(`[Project Page] ${prefix} RPC error:`, {
					routeId: '/projects/[id]',
					projectId: PROJECT_ID,
					requestId: 'iad1::origin-request',
					error: { code, message: '[redacted]' }
				});
			}
			expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('do-not-log');
		}
	);

	it('redacts secrets in RPC errors while preserving diagnostic codes', async () => {
		const { event } = createHarness({
			bundleError: {
				code: '42501',
				message: 'RPC unavailable',
				details: 'Authorization: Bearer secret-value'
			}
		});

		await expect(load(event)).rejects.toMatchObject({ status: 404 });
		const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
		expect(logs).toContain('42501');
		expect(logs).not.toContain('secret-value');
	});

	it('not-found short-circuits to a 404', async () => {
		const { event, operations } = createHarness({ bundleData: null });

		await expect(load(event)).rejects.toMatchObject({ status: 404 });
		expect(operations).toEqual(['rpc:get_project_skeleton_with_access_v2']);
	});

	it('returns a forbidden error when the route bundle identifies a signed-in nonmember', async () => {
		const { event, operations } = createHarness({
			bundleData: { route_access_state: 'forbidden' }
		});

		await expect(load(event)).rejects.toMatchObject({
			status: 403,
			body: { message: 'You do not have access to this project.' }
		});
		expect(operations).toEqual(['rpc:get_project_skeleton_with_access_v2']);
	});

	it('emits the combined timing label', async () => {
		const { event, timingLabels } = createHarness({
			access: {
				can_edit: true,
				can_admin: false,
				can_invite: true,
				can_view_logs: true,
				is_owner: false,
				is_authenticated: true
			}
		});

		await load(event);

		expect(timingLabels).toContain('db.project_skeleton_with_access_v2');
	});

	it('routes ?doc= deep links to the document page before any fan-out', async () => {
		const documentId = '22222222-2222-4222-8222-222222222222';
		const { event, operations } = createHarness({
			pathname: `/projects/${PROJECT_ID}?doc=${documentId}&openPublish=true`
		});

		await expect(load(event)).rejects.toMatchObject({
			status: 307,
			location: `/projects/${PROJECT_ID}/documents/${documentId}?openPublish=true`
		});
		expect(operations).toEqual([]);
		expect(ensureActorIdMock).not.toHaveBeenCalled();
	});

	it('drops a malformed ?doc= value instead of opening a broken document route', async () => {
		const { event } = createHarness({ pathname: `/projects/${PROJECT_ID}?doc=not-a-uuid` });

		await expect(load(event)).rejects.toMatchObject({
			status: 307,
			location: `/projects/${PROJECT_ID}`
		});
	});

	it('rejects invalid project ids before making API calls', async () => {
		const { event, operations, from } = createHarness();
		event.params.id = 'project-1';

		await expect(load(event)).rejects.toMatchObject({ status: 400 });
		expect(operations).toEqual([]);
		expect(from).not.toHaveBeenCalled();
		expect(ensureActorIdMock).not.toHaveBeenCalled();
	});
});
