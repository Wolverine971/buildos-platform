// apps/web/src/routes/projects/[id]/page.server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ensureActorIdMock } = vi.hoisted(() => ({
	ensureActorIdMock: vi.fn()
}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: ensureActorIdMock
}));

import { load } from './+page.server';

type HarnessOptions = {
	userId?: string | null;
	skeletonData?: Record<string, unknown> | null;
	skeletonError?: { message: string } | null;
	writeAccess?: boolean;
	adminAccess?: boolean;
	memberCount?: number;
	ownerCount?: number;
};

function createHarness(options: HarnessOptions = {}) {
	const operations: string[] = [];
	const timingLabels: string[] = [];

	const skeletonData =
		options.skeletonData === undefined
			? {
					id: 'project-1',
					name: 'Project 1',
					description: null,
					state_key: 'active',
					type_key: 'project',
					next_step_short: null,
					next_step_long: null,
					next_step_source: null,
					next_step_updated_at: null,
					task_count: 1,
					document_count: 2,
					goal_count: 3,
					plan_count: 4,
					milestone_count: 5,
					risk_count: 6,
					image_count: 7
				}
			: options.skeletonData;
	const writeAccess = options.writeAccess ?? false;
	const adminAccess = options.adminAccess ?? false;
	const memberCount = options.memberCount ?? 0;
	const ownerCount = options.ownerCount ?? 0;

	const ownerQuery: {
		select?: ReturnType<typeof vi.fn>;
		eq?: ReturnType<typeof vi.fn>;
		is?: ReturnType<typeof vi.fn>;
	} = {};
	const memberQuery: {
		select?: ReturnType<typeof vi.fn>;
		eq?: ReturnType<typeof vi.fn>;
		is?: ReturnType<typeof vi.fn>;
	} = {};

	const from = vi.fn((table: string) => {
		operations.push(`from:${table}`);

		if (table === 'onto_projects') {
			const chain: Record<string, any> = {};
			chain.select = vi.fn(() => chain);
			chain.eq = vi.fn(() => chain);
			chain.is = vi.fn().mockResolvedValue({ count: ownerCount, error: null });
			ownerQuery.select = chain.select;
			ownerQuery.eq = chain.eq;
			ownerQuery.is = chain.is;
			return chain;
		}

		if (table === 'onto_project_members') {
			const chain: Record<string, any> = {};
			chain.select = vi.fn(() => chain);
			chain.eq = vi.fn(() => chain);
			chain.is = vi.fn().mockResolvedValue({ count: memberCount, error: null });
			memberQuery.select = chain.select;
			memberQuery.eq = chain.eq;
			memberQuery.is = chain.is;
			return chain;
		}

		throw new Error(`Unexpected table requested: ${table}`);
	});

	const rpc = vi.fn((fn: string, args: { p_required_access?: 'read' | 'write' | 'admin' }) => {
		if (fn === 'get_project_skeleton') {
			operations.push('rpc:get_project_skeleton');
			return Promise.resolve({
				data: skeletonData,
				error: options.skeletonError ?? null
			});
		}

		if (fn === 'current_actor_has_project_access') {
			operations.push(`rpc:current_actor_has_project_access:${args.p_required_access}`);
			if (args.p_required_access === 'write') {
				return Promise.resolve({ data: writeAccess, error: null });
			}
			if (args.p_required_access === 'admin') {
				return Promise.resolve({ data: adminAccess, error: null });
			}
			return Promise.resolve({ data: false, error: null });
		}

		throw new Error(`Unexpected RPC requested: ${fn}`);
	});

	const userId = options.userId === undefined ? 'user-1' : options.userId;
	const safeGetSession = vi
		.fn()
		.mockResolvedValue(
			userId ? { user: { id: userId, email: 'test@example.com' } } : { user: null }
		);

	const event = {
		params: { id: 'project-1' },
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
		memberQuery,
		ownerQuery
	};
}

describe('projects/[id] +page.server load', () => {
	beforeEach(() => {
		ensureActorIdMock.mockReset();
		ensureActorIdMock.mockResolvedValue('actor-1');
	});

	it('owner access returns full owner/admin privileges', async () => {
		const { event, operations, from } = createHarness({
			writeAccess: true,
			adminAccess: true,
			ownerCount: 1
		});

		const result = await load(event);

		expect(result.access).toEqual({
			canEdit: true,
			canAdmin: true,
			canInvite: true,
			canViewLogs: true,
			isOwner: true,
			isAuthenticated: true
		});
		expect(operations).not.toContain('from:onto_project_members');
		expect(from).toHaveBeenCalledWith('onto_projects');
	});

	it('editor access keeps invite/log visibility without admin', async () => {
		const { event, operations } = createHarness({
			writeAccess: true,
			adminAccess: false,
			memberCount: 1,
			ownerCount: 0
		});

		const result = await load(event);

		expect(result.access).toEqual({
			canEdit: true,
			canAdmin: false,
			canInvite: true,
			canViewLogs: true,
			isOwner: false,
			isAuthenticated: true
		});
		expect(operations).toContain('from:onto_project_members');
	});

	it('viewer access remains read-only but can view logs', async () => {
		const { event } = createHarness({
			writeAccess: false,
			adminAccess: false,
			memberCount: 1,
			ownerCount: 0
		});

		const result = await load(event);

		expect(result.access).toEqual({
			canEdit: false,
			canAdmin: false,
			canInvite: false,
			canViewLogs: true,
			isOwner: false,
			isAuthenticated: true
		});
	});

	it('anonymous requests return skeleton data without access fan-out queries', async () => {
		const { event, operations, from } = createHarness({
			userId: null
		});

		const result = await load(event);

		expect(result.skeleton).toBe(true);
		expect(result.access).toEqual({
			canEdit: false,
			canAdmin: false,
			canInvite: false,
			canViewLogs: false,
			isOwner: false,
			isAuthenticated: false
		});
		expect(operations).toEqual(['rpc:get_project_skeleton']);
		expect(from).not.toHaveBeenCalled();
		expect(ensureActorIdMock).not.toHaveBeenCalled();
	});

	it('not-found short-circuits before access fan-out queries', async () => {
		const { event, operations } = createHarness({
			skeletonData: null
		});

		await expect(load(event)).rejects.toMatchObject({ status: 404 });
		expect(operations).toContain('rpc:get_project_skeleton');
		expect(operations.some((op) => op.startsWith('rpc:current_actor_has_project_access'))).toBe(
			false
		);
		expect(operations).not.toContain('from:onto_projects');
		expect(operations).not.toContain('from:onto_project_members');
	});

	it('calls skeleton RPC before access resolution and emits timing labels', async () => {
		const { event, operations, timingLabels } = createHarness({
			writeAccess: true,
			adminAccess: false,
			memberCount: 1
		});

		await load(event);

		const skeletonIndex = operations.indexOf('rpc:get_project_skeleton');
		const firstAccessIndex = operations.findIndex(
			(op) =>
				op.startsWith('rpc:current_actor_has_project_access') ||
				op === 'from:onto_projects' ||
				op === 'from:onto_project_members'
		);

		expect(skeletonIndex).toBeGreaterThanOrEqual(0);
		expect(firstAccessIndex).toBeGreaterThan(skeletonIndex);
		expect(timingLabels).toEqual(
			expect.arrayContaining(['db.project_skeleton', 'db.project_access.resolve'])
		);
	});
});
