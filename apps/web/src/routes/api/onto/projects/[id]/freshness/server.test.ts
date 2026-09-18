// apps/web/src/routes/api/onto/projects/[id]/freshness/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	requireProjectMemberAccess: vi.fn(),
	loadFreshnessBadges: vi.fn(),
	loadFreshnessScanStatus: vi.fn(),
	undoFreshnessFlags: vi.fn(),
	markFreshnessFlagNotStale: vi.fn(),
	replayLoopOperations: vi.fn(),
	createAdminSupabaseClient: vi.fn(() => ({ admin: true }))
}));

vi.mock('$lib/server/ontology-project-access', () => ({
	requireProjectMemberAccess: mocks.requireProjectMemberAccess
}));
vi.mock('$lib/server/freshness-radar.service', () => ({
	loadFreshnessBadges: mocks.loadFreshnessBadges,
	loadFreshnessScanStatus: mocks.loadFreshnessScanStatus,
	undoFreshnessFlags: mocks.undoFreshnessFlags,
	markFreshnessFlagNotStale: mocks.markFreshnessFlagNotStale
}));
vi.mock('$lib/server/project-suggestion-actions.service', () => ({
	replayLoopOperations: mocks.replayLoopOperations
}));
vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));

import { GET as getBadges } from './+server';
import { GET as getScan } from './scans/[scan_id]/+server';
import { POST as postUndo } from './scans/[scan_id]/undo/+server';
import { POST as postFlag } from './flags/[flag_id]/+server';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const SCAN = '22222222-2222-4222-8222-222222222222';
const FLAG = '33333333-3333-4333-8333-333333333333';
const locals = { supabase: { user: true } };
const access = { ok: true, projectId: PROJECT, userId: 'user-1', actorId: 'actor-1' };

function post(body: unknown) {
	return new Request('http://localhost/api/test', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: typeof body === 'string' ? body : JSON.stringify(body)
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.requireProjectMemberAccess.mockResolvedValue(access);
});

describe('freshness routes: access', () => {
	it('returns the access failure for a non-member on every route', async () => {
		const denied = new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
			status: 403
		});
		mocks.requireProjectMemberAccess.mockResolvedValue({ ok: false, response: denied });
		const responses = await Promise.all([
			getBadges({ params: { id: PROJECT }, locals } as any),
			getScan({ params: { id: PROJECT, scan_id: SCAN }, locals } as any),
			postUndo({
				params: { id: PROJECT, scan_id: SCAN },
				locals,
				request: post({}),
				fetch: vi.fn()
			} as any),
			postFlag({
				params: { id: PROJECT, flag_id: FLAG },
				locals,
				request: post({ action: 'not_stale' })
			} as any)
		]);
		for (const response of responses) expect(response.status).toBe(403);
		expect(mocks.loadFreshnessBadges).not.toHaveBeenCalled();
		expect(mocks.undoFreshnessFlags).not.toHaveBeenCalled();
		expect(mocks.markFreshnessFlagNotStale).not.toHaveBeenCalled();
		expect(
			mocks.requireProjectMemberAccess.mock.calls.map(([options]) => options.requiredAccess)
		).toEqual(['read', 'read', 'write', 'write']);
	});
});

describe('GET /freshness', () => {
	it('returns the badge read for the caller', async () => {
		const read = {
			version: 'freshness_badges_v1',
			projectId: PROJECT,
			scannedAt: null,
			flags: [],
			gauges: []
		};
		mocks.loadFreshnessBadges.mockResolvedValue(read);
		const response = await getBadges({ params: { id: PROJECT }, locals } as any);
		expect(response.status).toBe(200);
		expect((await response.json()).data).toEqual(read);
		expect(mocks.loadFreshnessBadges).toHaveBeenCalledWith({
			supabase: locals.supabase,
			projectId: PROJECT,
			userId: 'user-1'
		});
	});
});

describe('GET /freshness/scans/[scan_id]', () => {
	it('rejects a malformed scan id and 404s an unknown scan', async () => {
		expect(
			(await getScan({ params: { id: PROJECT, scan_id: 'nope' }, locals } as any)).status
		).toBe(400);
		mocks.loadFreshnessScanStatus.mockResolvedValue(null);
		expect(
			(await getScan({ params: { id: PROJECT, scan_id: SCAN }, locals } as any)).status
		).toBe(404);
	});
});

describe('POST /freshness/scans/[scan_id]/undo', () => {
	const call = (body: unknown) =>
		postUndo({
			params: { id: PROJECT, scan_id: SCAN },
			locals,
			request: post(body),
			fetch: vi.fn()
		} as any);

	it('treats an empty body as "undo everything undoable" and replays through the caller', async () => {
		mocks.undoFreshnessFlags.mockImplementation(async (params: any) => {
			await params.replay({
				operations: [{ tool: 'update_onto_task', args: {} }],
				operationId: 'freshness_undo:f',
				chatSessionId: 's'
			});
			return { version: 'freshness_undo_v1', undone: ['f'], skipped: [] };
		});
		const response = await call('');
		expect(response.status).toBe(200);
		expect((await response.json()).data.undone).toEqual(['f']);
		expect(mocks.undoFreshnessFlags).toHaveBeenCalledWith(
			expect.objectContaining({ scanId: SCAN, flagIds: undefined, admin: { admin: true } })
		);
		expect(mocks.replayLoopOperations).toHaveBeenCalledWith(
			expect.objectContaining({
				supabase: locals.supabase,
				userId: 'user-1',
				operationKind: 'freshness_undo',
				operationId: 'freshness_undo:f'
			})
		);
	});

	it('rejects unknown keys and non-uuid flag ids', async () => {
		expect((await call({ flag_ids: [FLAG], force: true })).status).toBe(422);
		expect((await call({ flag_ids: ['not-a-uuid'] })).status).toBe(422);
		expect((await call({ flag_ids: [] })).status).toBe(422);
		expect((await call('{not json')).status).toBe(400);
		expect(mocks.undoFreshnessFlags).not.toHaveBeenCalled();
	});

	it('404s a scan the caller does not own', async () => {
		mocks.undoFreshnessFlags.mockResolvedValue(null);
		expect((await call({ flag_ids: [FLAG] })).status).toBe(404);
	});
});

describe('POST /freshness/flags/[flag_id]', () => {
	const call = (body: unknown, flagId = FLAG) =>
		postFlag({ params: { id: PROJECT, flag_id: flagId }, locals, request: post(body) } as any);

	it('accepts only { action: "not_stale" }', async () => {
		expect((await call({ action: 'dismiss' })).status).toBe(422);
		expect((await call({ action: 'not_stale', note: 'x' })).status).toBe(422);
		expect((await call({ action: 'not_stale' }, 'bad-id')).status).toBe(400);
		expect(mocks.markFreshnessFlagNotStale).not.toHaveBeenCalled();
	});

	it('returns the flag and the bundle to approve now', async () => {
		mocks.markFreshnessFlagNotStale.mockResolvedValue({
			ok: true,
			flag: { id: FLAG, status: 'dismissed' },
			suggestionId: 'bundle-2'
		});
		const response = await call({ action: 'not_stale' });
		expect(response.status).toBe(200);
		expect((await response.json()).data).toEqual({
			flag: { id: FLAG, status: 'dismissed' },
			suggestionId: 'bundle-2'
		});
	});

	it('passes through the service status for a missing flag', async () => {
		mocks.markFreshnessFlagNotStale.mockResolvedValue({
			ok: false,
			status: 404,
			message: 'Flag not found'
		});
		expect((await call({ action: 'not_stale' })).status).toBe(404);
	});
});
