// apps/web/src/routes/projects/[id]/page.server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ensureActorIdMock } = vi.hoisted(() => ({
	ensureActorIdMock: vi.fn()
}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: ensureActorIdMock
}));

import { load } from './+page.server';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

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
	bundleError?: { message: string } | null;
	access?: BundleAccess;
	pathname?: string;
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
		access
	};
	const bundleData =
		options.bundleData === undefined
			? options.pathname?.endsWith('/old')
				? {
						...baseBundleData,
						task_count: 1,
						document_count: 2,
						goal_count: 3,
						plan_count: 4,
						milestone_count: 5,
						risk_count: 6,
						image_count: 7
					}
				: baseBundleData
			: options.bundleData;

	const from = vi.fn((table: string) => {
		operations.push(`from:${table}`);
		throw new Error(`Unexpected table requested: ${table}`);
	});

	const rpc = vi.fn((fn: string) => {
		if (
			fn === 'get_project_skeleton_with_access' ||
			fn === 'get_project_skeleton_with_access_v2'
		) {
			operations.push(`rpc:${fn}`);
			return Promise.resolve({
				data: bundleData,
				error: options.bundleError ?? null
			});
		}
		throw new Error(`Unexpected RPC requested: ${fn}`);
	});

	const safeGetSession = vi
		.fn()
		.mockResolvedValue(
			userId ? { user: { id: userId, email: 'test@example.com' } } : { user: null }
		);

	const event = {
		params: { id: PROJECT_ID },
		url: new URL(`https://buildos.test${options.pathname ?? `/projects/${PROJECT_ID}`}`),
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
		safeGetSession
	};
}

describe('projects/[id] +page.server load', () => {
	beforeEach(() => {
		ensureActorIdMock.mockReset();
		ensureActorIdMock.mockResolvedValue('actor-1');
	});

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

		const result = await load(event);

		expect(result.access).toEqual({
			canEdit: true,
			canAdmin: true,
			canInvite: true,
			canViewLogs: true,
			isOwner: true,
			isAuthenticated: true,
			currentActorId: 'actor-current'
		});
		// New v2 hot path: exactly one count-free DB round-trip.
		expect(operations).toEqual(['rpc:get_project_skeleton_with_access_v2']);
		expect(from).not.toHaveBeenCalled();
		expect(safeGetSession).not.toHaveBeenCalled();
		expect(ensureActorIdMock).not.toHaveBeenCalled();
	});

	it('classic route keeps the counted skeleton RPC', async () => {
		const { event, operations } = createHarness({
			pathname: `/projects/${PROJECT_ID}/old`
		});

		const result = await load(event);

		expect(result.counts).toEqual({
			task_count: 1,
			document_count: 2,
			goal_count: 3,
			plan_count: 4,
			milestone_count: 5,
			risk_count: 6,
			image_count: 7
		});
		expect(operations).toEqual(['rpc:get_project_skeleton_with_access']);
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

		const result = await load(event);

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

		const result = await load(event);

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

	it('anonymous requests return skeleton data without any fan-out queries', async () => {
		const { event, operations, from, safeGetSession } = createHarness({ userId: null });

		const result = await load(event);

		expect(result.skeleton).toBe(true);
		expect(result.access).toEqual({
			canEdit: false,
			canAdmin: false,
			canInvite: false,
			canViewLogs: false,
			isOwner: false,
			isAuthenticated: false,
			currentActorId: null
		});
		expect(operations).toEqual(['rpc:get_project_skeleton_with_access_v2']);
		expect(from).not.toHaveBeenCalled();
		expect(safeGetSession).not.toHaveBeenCalled();
		expect(ensureActorIdMock).not.toHaveBeenCalled();
	});

	it('not-found short-circuits to a 404', async () => {
		const { event, operations } = createHarness({ bundleData: null });

		await expect(load(event)).rejects.toMatchObject({ status: 404 });
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

	it('rejects invalid project ids before making API calls', async () => {
		const { event, operations, from } = createHarness();
		event.params.id = 'project-1';

		await expect(load(event)).rejects.toMatchObject({ status: 400 });
		expect(operations).toEqual([]);
		expect(from).not.toHaveBeenCalled();
		expect(ensureActorIdMock).not.toHaveBeenCalled();
	});
});
