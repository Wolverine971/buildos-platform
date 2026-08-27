// apps/web/src/routes/api/onto/documents/[id]/proposals/[proposalId]/apply/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	requireProjectEntityAccess: vi.fn(),
	createAdminSupabaseClient: vi.fn(),
	applyDocumentProposal: vi.fn(),
	captureServerEvent: vi.fn()
}));

vi.mock('$lib/server/ontology-api-access', () => ({
	requireProjectEntityAccess: mocks.requireProjectEntityAccess
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));

vi.mock('$lib/server/document-proposal.service', () => ({
	applyDocumentProposal: mocks.applyDocumentProposal
}));

vi.mock('$lib/server/posthog', () => ({
	captureServerEvent: mocks.captureServerEvent
}));

import { POST } from './+server';

function createEvent() {
	return {
		params: { id: 'document-1', proposalId: 'proposal-1' },
		locals: {
			safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
			supabase: { from: vi.fn() }
		}
	};
}

describe('POST /api/onto/documents/[id]/proposals/[proposalId]/apply', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.createAdminSupabaseClient.mockReturnValue({ role: 'service' });
		mocks.captureServerEvent.mockResolvedValue(undefined);
	});

	it('never enters the privileged apply path when project write access is denied', async () => {
		mocks.requireProjectEntityAccess.mockResolvedValue({
			ok: false,
			response: new Response(JSON.stringify({ success: false }), { status: 403 })
		});

		const response = await POST(createEvent() as never);

		expect(response.status).toBe(403);
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
		expect(mocks.applyDocumentProposal).not.toHaveBeenCalled();
	});

	it('returns a stable conflict contract and records the conflict reason', async () => {
		const proposal = {
			id: 'proposal-1',
			status: 'conflict',
			conflict_reason: 'TARGET_CHANGED'
		};
		mocks.requireProjectEntityAccess.mockResolvedValue({
			ok: true,
			actorId: 'actor-1',
			entity: { id: 'document-1', project_id: 'project-1' },
			projectId: 'project-1'
		});
		mocks.applyDocumentProposal.mockResolvedValue({
			status: 'conflict',
			reason: 'TARGET_CHANGED',
			proposal
		});
		const event = createEvent();

		const response = await POST(event as never);

		expect(response.status).toBe(409);
		expect(mocks.applyDocumentProposal).toHaveBeenCalledWith({
			supabase: event.locals.supabase,
			proposalSupabase: { role: 'service' },
			documentId: 'document-1',
			proposalId: 'proposal-1',
			actorId: 'actor-1'
		});
		expect(mocks.captureServerEvent).toHaveBeenCalledWith(
			'user-1',
			'document_proposal_conflicted',
			expect.objectContaining({ reason: 'TARGET_CHANGED', project_id: 'project-1' })
		);
		expect(await response.json()).toMatchObject({
			success: false,
			code: 'TARGET_CHANGED',
			details: { proposal }
		});
	});
});
