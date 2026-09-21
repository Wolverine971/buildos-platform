// apps/web/src/routes/workflow-lab/page.server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = 'd1000000-0000-4000-8000-000000000001';
const state = vi.hoisted(() => ({
	env: {} as Record<string, string | undefined>,
	listPublishedSpecialistVersions: vi.fn(),
	createAdminSupabaseClient: vi.fn(),
	ensureActorId: vi.fn(),
	fetchProjectSummaries: vi.fn()
}));
vi.mock('$env/dynamic/private', () => ({ env: state.env }));
vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: state.createAdminSupabaseClient
}));
vi.mock('$lib/services/agentic-chat-v2/specialist-workbench.server', () => ({
	listPublishedSpecialistVersions: state.listPublishedSpecialistVersions
}));
vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: state.ensureActorId,
	fetchProjectSummaries: state.fetchProjectSummaries
}));
import { load } from './+page.server';

const gates = [
	'AGENTIC_CHAT_PUBLISHED_SPECIALISTS_ENABLED',
	'AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED',
	'AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED',
	'AGENTIC_CHAT_DOCUMENT_READ_TOOLS_ENABLED'
];
const version = {
	draftId: 'd8000000-0000-4000-8000-000000000001',
	version: 1,
	draftRevision: 2,
	snapshotHash: 'a'.repeat(64),
	name: 'Launch reviewer',
	createdAt: '2026-09-20T00:00:00Z'
};
function event(userId: string | null = USER_ID) {
	return {
		locals: {
			safeGetSession: async () => ({ user: userId ? { id: userId } : null }),
			supabase: {}
		},
		setHeaders: vi.fn()
	};
}

describe('workflow lab published specialist picker', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		for (const gate of gates) state.env[gate] = 'true';
		state.env.AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS = USER_ID;
		state.createAdminSupabaseClient.mockReturnValue({ admin: true });
		state.listPublishedSpecialistVersions.mockResolvedValue([version]);
		state.ensureActorId.mockResolvedValue('actor-1');
		state.fetchProjectSummaries.mockResolvedValue([{ id: 'project-1', name: 'Launch' }]);
	});

	it.each([
		[null, 401],
		['d1000000-0000-4000-8000-000000000002', 404]
	])('rejects inaccessible users before service-role catalog reads', async (userId, status) => {
		await expect(load(event(userId as string | null) as never)).rejects.toMatchObject({
			status
		});
		expect(state.createAdminSupabaseClient).not.toHaveBeenCalled();
		expect(state.listPublishedSpecialistVersions).not.toHaveBeenCalled();
	});

	it.each(gates)('does not load the catalog without %s', async (gate) => {
		delete state.env[gate];
		const result = await load(event() as never);
		expect(result).toMatchObject({
			publishedSpecialistsEnabled: false,
			publishedSpecialists: []
		});
		expect(state.listPublishedSpecialistVersions).not.toHaveBeenCalled();
	});

	it('loads only the signed-in owner’s version summaries and disables caching', async () => {
		const request = event();
		const result = await load(request as never);
		expect(state.listPublishedSpecialistVersions).toHaveBeenCalledWith(
			{ admin: true },
			USER_ID
		);
		expect(request.setHeaders).toHaveBeenCalledWith({ 'Cache-Control': 'private, no-store' });
		expect(result).toEqual({
			projects: [{ id: 'project-1', name: 'Launch' }],
			publishedSpecialists: [version],
			jevRecommendationsEnabled: false,
			publishedSpecialistsEnabled: true,
			specialistLoadError: null
		});
	});

	it('keeps the built-in review available and reports unavailable specialist storage', async () => {
		state.listPublishedSpecialistVersions.mockRejectedValue(new Error('storage unavailable'));
		const result = await load(event() as never);
		expect(result).toMatchObject({
			projects: [{ id: 'project-1', name: 'Launch' }],
			publishedSpecialists: [],
			specialistLoadError: 'Published specialists could not be loaded. Reload to try again.'
		});
	});
});
