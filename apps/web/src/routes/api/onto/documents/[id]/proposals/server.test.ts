// apps/web/src/routes/api/onto/documents/[id]/proposals/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	requireProjectEntityAccess: vi.fn(),
	createAdminSupabaseClient: vi.fn(),
	createDocumentProposal: vi.fn(),
	captureServerEvent: vi.fn()
}));

vi.mock('$lib/server/ontology-api-access', () => ({
	requireProjectEntityAccess: mocks.requireProjectEntityAccess
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));

vi.mock('$lib/server/document-proposal.service', () => ({
	DOCUMENT_PROPOSAL_INSTRUCTION_MAX: 4_000,
	DOCUMENT_PROPOSAL_SELECTION_MAX: 20_000,
	DocumentProposalGenerationError: class DocumentProposalGenerationError extends Error {},
	createDocumentProposal: mocks.createDocumentProposal
}));

vi.mock('$lib/server/posthog', () => ({
	captureServerEvent: mocks.captureServerEvent
}));

import { POST } from './+server';

const document = {
	id: 'document-1',
	project_id: 'project-1',
	content: 'Draft this paragraph.',
	content_hash: 'a'.repeat(64)
};

function createEvent() {
	return {
		params: { id: document.id },
		request: new Request(`http://localhost/api/onto/documents/${document.id}/proposals`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				instruction: 'Make this publishable',
				selection_from: 0,
				selection_to: document.content.length,
				base_content_hash: document.content_hash
			})
		}),
		locals: {
			safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
			supabase: { from: vi.fn() }
		}
	};
}

describe('POST /api/onto/documents/[id]/proposals', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.createAdminSupabaseClient.mockReturnValue({ role: 'service' });
		mocks.captureServerEvent.mockResolvedValue(undefined);
	});

	it('creates the server-owned proposal only after project write access succeeds', async () => {
		const proposal = { id: 'proposal-1', document_id: document.id, status: 'pending' };
		mocks.requireProjectEntityAccess.mockResolvedValue({
			ok: true,
			actorId: 'actor-1',
			entity: document,
			projectId: document.project_id
		});
		mocks.createDocumentProposal.mockResolvedValue(proposal);
		const event = createEvent();

		const response = await POST(event as never);

		expect(response.status).toBe(201);
		expect(mocks.requireProjectEntityAccess).toHaveBeenCalledWith(
			expect.objectContaining({ requiredAccess: 'write', tableName: 'onto_documents' })
		);
		expect(mocks.createDocumentProposal).toHaveBeenCalledWith(
			expect.objectContaining({
				supabase: event.locals.supabase,
				proposalSupabase: { role: 'service' },
				document,
				actorId: 'actor-1',
				userId: 'user-1'
			})
		);
		expect(mocks.captureServerEvent).toHaveBeenCalledWith(
			'user-1',
			'document_proposal_generated',
			expect.objectContaining({ proposal_id: proposal.id, project_id: document.project_id })
		);
		expect(await response.json()).toMatchObject({ success: true, data: { proposal } });
	});

	it('never creates an admin client when project write access is denied', async () => {
		mocks.requireProjectEntityAccess.mockResolvedValue({
			ok: false,
			response: new Response(JSON.stringify({ success: false }), { status: 403 })
		});

		const response = await POST(createEvent() as never);

		expect(response.status).toBe(403);
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
		expect(mocks.createDocumentProposal).not.toHaveBeenCalled();
	});
});
