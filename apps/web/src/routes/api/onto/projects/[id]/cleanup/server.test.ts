// apps/web/src/routes/api/onto/projects/[id]/cleanup/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	requireProjectMemberAccess: vi.fn(),
	decideProjectSuggestion: vi.fn(),
	loadProjectCleanupView: vi.fn(),
	syncInboxItemForProjectCleanup: vi.fn(),
	captureServerEvent: vi.fn(),
	admin: { from: vi.fn() }
}));

vi.mock('$lib/config/project-loops', () => ({
	PROJECT_LOOPS_ENABLED: true
}));

vi.mock('$lib/server/ontology-project-access', () => ({
	requireProjectMemberAccess: mocks.requireProjectMemberAccess
}));

vi.mock('$lib/server/project-suggestion-actions.service', () => ({
	decideProjectSuggestion: mocks.decideProjectSuggestion
}));

vi.mock('@buildos/shared-agent-ops/project-cleanup', () => ({
	loadProjectCleanupView: mocks.loadProjectCleanupView
}));

vi.mock('@buildos/shared-agent-ops/inbox-index', () => ({
	syncInboxItemForProjectCleanup: mocks.syncInboxItemForProjectCleanup
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: () => mocks.admin
}));

vi.mock('$lib/server/posthog', () => ({
	captureServerEvent: mocks.captureServerEvent
}));

vi.mock('$lib/server/background', () => ({
	runAfterResponse: vi.fn()
}));

import { GET, POST } from './+server';

const access = {
	ok: true,
	projectId: 'project-1',
	userId: 'user-1',
	actorId: 'actor-1'
};

const view = {
	project_id: 'project-1',
	items: [],
	groups: [],
	bottom_line: null,
	recommendation: null,
	synthesized_at: null,
	latest_run_id: null,
	latest_audit: null,
	counts: { total: 0, safe_cleanup: 0, needs_call: 0, note: 0 },
	recently_closed: []
};

const userSupabase = { from: vi.fn() };

function request(body: unknown) {
	return new Request('http://localhost/api/onto/projects/project-1/cleanup', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

async function callPost(body: unknown) {
	return POST({
		params: { id: 'project-1' },
		locals: { supabase: userSupabase },
		request: request(body)
	} as any);
}

describe('/api/onto/projects/[id]/cleanup', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.requireProjectMemberAccess.mockResolvedValue(access);
		mocks.loadProjectCleanupView.mockResolvedValue(view);
		mocks.syncInboxItemForProjectCleanup.mockResolvedValue(null);
		mocks.captureServerEvent.mockResolvedValue(undefined);
	});

	it('GET returns the verified view for a project reader', async () => {
		const response = await GET({
			params: { id: 'project-1' },
			locals: { supabase: userSupabase }
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data).toEqual({ view });
		expect(mocks.requireProjectMemberAccess).toHaveBeenCalledWith(
			expect.objectContaining({ projectId: 'project-1', requiredAccess: 'read' })
		);
		expect(mocks.loadProjectCleanupView).toHaveBeenCalledWith(mocks.admin, 'project-1', {
			verify: true
		});
	});

	it('POST requires write access', async () => {
		mocks.requireProjectMemberAccess.mockResolvedValue({
			ok: false,
			response: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
		});

		const response = await callPost({
			decisions: [{ suggestion_id: 's-1', action: 'approve', expected_fingerprint: 'fp' }]
		});

		expect(response.status).toBe(403);
		expect(mocks.requireProjectMemberAccess).toHaveBeenCalledWith(
			expect.objectContaining({ requiredAccess: 'write' })
		);
		expect(mocks.decideProjectSuggestion).not.toHaveBeenCalled();
	});

	it('rejects malformed or oversized batches', async () => {
		expect((await callPost({ decisions: [] })).status).toBe(422);
		expect(
			(await callPost({ decisions: [{ suggestion_id: 's-1', action: 'delete' }] })).status
		).toBe(422);
		expect(
			(
				await callPost({
					decisions: Array.from({ length: 41 }, (_, index) => ({
						suggestion_id: `s-${index}`,
						action: 'dismiss'
					}))
				})
			).status
		).toBe(422);
		expect(mocks.decideProjectSuggestion).not.toHaveBeenCalled();
	});

	it('applies decisions one at a time, keeps going past failures, and reports each', async () => {
		const calls: string[] = [];
		mocks.decideProjectSuggestion.mockImplementation(
			async ({ suggestionId }: { suggestionId: string }) => {
				calls.push(suggestionId);
				switch (suggestionId) {
					case 's-applied':
						return {
							ok: true,
							suggestion: { id: suggestionId, status: 'applied' },
							result: { ok: true, applied_operations: 1 }
						};
					case 's-stale':
						return {
							ok: false,
							status: 409,
							message:
								'This change was updated after you opened it. Review the new version.'
						};
					case 's-throws':
						throw new Error('boom');
					case 's-partial':
						return {
							ok: true,
							suggestion: { id: suggestionId, status: 'failed' },
							result: {
								ok: false,
								applied_operations: 0,
								errors: [
									{ tool: 'update_onto_document', error: 'Document is locked' }
								]
							}
						};
					case 's-superseded':
						return {
							ok: true,
							suggestion: { id: suggestionId, status: 'superseded' },
							superseded: true
						};
					case 's-done':
						return {
							ok: true,
							suggestion: { id: suggestionId, status: 'applied' },
							alreadyDecided: true
						};
					case 's-dismiss':
						return { ok: true, suggestion: { id: suggestionId, status: 'rejected' } };
					case 's-address':
						return { ok: true, suggestion: { id: suggestionId, status: 'addressed' } };
					default:
						return { ok: false, status: 422, message: 'Not executable' };
				}
			}
		);
		const freshView = {
			...view,
			counts: { total: 1, safe_cleanup: 0, needs_call: 1, note: 0 }
		};
		mocks.loadProjectCleanupView.mockResolvedValue(freshView);
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

		const response = await callPost({
			decisions: [
				{ suggestion_id: 's-applied', action: 'approve', expected_fingerprint: 'fp-a' },
				{ suggestion_id: 's-stale', action: 'approve', expected_fingerprint: 'fp-b' },
				{ suggestion_id: 's-throws', action: 'approve', expected_fingerprint: 'fp-c' },
				{ suggestion_id: 's-partial', action: 'approve', expected_fingerprint: 'fp-d' },
				{ suggestion_id: 's-superseded', action: 'approve' },
				{ suggestion_id: 's-done', action: 'approve', expected_fingerprint: 'fp-e' },
				{
					suggestion_id: 's-dismiss',
					action: 'dismiss',
					reason: 'too_risky',
					note: 'Still quoting it'
				},
				{ suggestion_id: 's-address', action: 'address' },
				{ suggestion_id: 's-applied', action: 'approve', expected_fingerprint: 'dup' }
			]
		});
		const payload = await response.json();
		errorLog.mockRestore();

		expect(response.status).toBe(200);
		expect(calls).toEqual([
			's-applied',
			's-stale',
			's-throws',
			's-partial',
			's-superseded',
			's-done',
			's-dismiss',
			's-address'
		]);
		expect(payload.data.outcomes).toEqual([
			{ suggestion_id: 's-applied', ok: true, status: 'applied' },
			{
				suggestion_id: 's-stale',
				ok: false,
				status: 'changed',
				message: 'This item changed since you opened it — review the new version.'
			},
			{ suggestion_id: 's-throws', ok: false, status: 'error', message: 'boom' },
			{
				suggestion_id: 's-partial',
				ok: false,
				status: 'failed',
				message: 'Document is locked'
			},
			{
				suggestion_id: 's-superseded',
				ok: false,
				status: 'changed',
				message: 'This item changed since you opened it — review the new version.'
			},
			{
				suggestion_id: 's-done',
				ok: true,
				status: 'already_decided',
				message: 'Already handled.'
			},
			{ suggestion_id: 's-dismiss', ok: true, status: 'rejected' },
			{ suggestion_id: 's-address', ok: true, status: 'addressed' }
		]);
		expect(payload.data.view).toEqual(freshView);

		expect(mocks.decideProjectSuggestion).toHaveBeenCalledWith(
			expect.objectContaining({
				supabase: userSupabase,
				userId: 'user-1',
				projectId: 'project-1',
				suggestionId: 's-applied',
				action: 'approve',
				expectedStructuralFingerprint: 'fp-a'
			})
		);
		expect(mocks.decideProjectSuggestion).toHaveBeenCalledWith(
			expect.objectContaining({
				suggestionId: 's-superseded',
				expectedStructuralFingerprint: null
			})
		);
		expect(mocks.decideProjectSuggestion).toHaveBeenCalledWith(
			expect.objectContaining({
				suggestionId: 's-dismiss',
				action: 'dismiss',
				feedback: { reason: 'too_risky', note: 'Still quoting it' }
			})
		);
		expect(mocks.decideProjectSuggestion).toHaveBeenCalledWith(
			expect.objectContaining({
				suggestionId: 's-address',
				action: 'address',
				feedback: { reason: undefined, note: 'Handled from the project cleanup list' }
			})
		);
		expect(mocks.syncInboxItemForProjectCleanup).toHaveBeenCalledTimes(1);
		expect(mocks.syncInboxItemForProjectCleanup).toHaveBeenCalledWith({
			supabase: mocks.admin,
			projectId: 'project-1'
		});
		expect(mocks.loadProjectCleanupView).toHaveBeenCalledWith(mocks.admin, 'project-1', {
			verify: true
		});
	});

	it('still answers with the outcomes when the inbox sync and reload fail', async () => {
		mocks.decideProjectSuggestion.mockResolvedValue({
			ok: true,
			suggestion: { id: 's-1', status: 'rejected' }
		});
		mocks.syncInboxItemForProjectCleanup.mockRejectedValue(new Error('sync down'));
		mocks.loadProjectCleanupView.mockRejectedValue(new Error('verify down'));
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		const response = await callPost({
			decisions: [{ suggestion_id: 's-1', action: 'dismiss' }]
		});
		const payload = await response.json();
		warn.mockRestore();

		expect(response.status).toBe(200);
		expect(payload.data).toEqual({
			outcomes: [{ suggestion_id: 's-1', ok: true, status: 'rejected' }],
			view: null
		});
	});
});
