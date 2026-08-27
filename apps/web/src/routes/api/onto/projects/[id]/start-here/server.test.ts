// apps/web/src/routes/api/onto/projects/[id]/start-here/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	requireOntologyActor: vi.fn(),
	requireCurrentActorProjectAccess: vi.fn(),
	ensureProjectStartHereDocument: vi.fn(),
	queueProjectContextSnapshot: vi.fn(),
	createOrMergeDocumentVersion: vi.fn()
}));

vi.mock('$lib/server/ontology-api-access', () => ({
	requireOntologyActor: mocks.requireOntologyActor,
	requireCurrentActorProjectAccess: mocks.requireCurrentActorProjectAccess
}));

vi.mock('@buildos/shared-agent-ops/ontology/start-here.service', () => ({
	ensureProjectStartHereDocument: mocks.ensureProjectStartHereDocument
}));

vi.mock('$lib/server/project-context-snapshot.service', () => ({
	queueProjectContextSnapshot: mocks.queueProjectContextSnapshot
}));

vi.mock('$lib/services/ontology/versioning.service', () => ({
	createOrMergeDocumentVersion: mocks.createOrMergeDocumentVersion,
	toDocumentSnapshot: vi.fn((document) => ({ content: document.content }))
}));

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';
const START_HERE_DOCUMENT = {
	id: DOCUMENT_ID,
	project_id: PROJECT_ID,
	title: 'START HERE - Project',
	content: '# START HERE - Project',
	type_key: 'document.context.project',
	state_key: 'draft',
	props: {},
	created_at: '2026-08-27T12:00:00.000Z',
	updated_at: '2026-08-27T12:00:00.000Z'
};

function projectClient(stateKey = 'active') {
	const maybeSingle = vi.fn().mockResolvedValue({
		data: {
			name: 'Project',
			description: 'Project description',
			state_key: stateKey,
			deleted_at: null,
			archived_at: null
		},
		error: null
	});
	const eq = vi.fn(() => ({ maybeSingle }));
	const select = vi.fn(() => ({ eq }));
	return { from: vi.fn(() => ({ select })) };
}

function event(supabase = projectClient()) {
	return {
		params: { id: PROJECT_ID },
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
		}
	} as any;
}

describe('POST /api/onto/projects/[id]/start-here', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.requireOntologyActor.mockResolvedValue({
			ok: true,
			actor: { actorId: 'actor-1', userId: 'user-1' }
		});
		mocks.requireCurrentActorProjectAccess.mockResolvedValue({ ok: true });
		mocks.ensureProjectStartHereDocument.mockResolvedValue({
			ok: true,
			created: true,
			document: START_HERE_DOCUMENT
		});
		mocks.createOrMergeDocumentVersion.mockResolvedValue({
			status: 'created',
			versionId: 'version-1',
			versionNumber: 1
		});
		mocks.queueProjectContextSnapshot.mockResolvedValue({
			queued: true,
			jobId: 'snapshot-job-1'
		});
	});

	it('creates, versions, and queues the missing canonical document', async () => {
		const { POST } = await import('./+server');
		const response = await POST(event());
		const payload = await response.json();

		expect(response.status).toBe(201);
		expect(payload.data).toMatchObject({
			created: true,
			version_recorded: true,
			refresh_queued: true,
			refresh_job_id: 'snapshot-job-1',
			document: { id: DOCUMENT_ID }
		});
		expect(mocks.createOrMergeDocumentVersion).toHaveBeenCalledOnce();
		expect(mocks.queueProjectContextSnapshot).toHaveBeenCalledWith({
			projectId: PROJECT_ID,
			userId: 'user-1',
			reason: 'start_here_recovery',
			force: true
		});
	});

	it('is idempotent when the canonical document already exists', async () => {
		mocks.ensureProjectStartHereDocument.mockResolvedValue({
			ok: true,
			created: false,
			document: START_HERE_DOCUMENT
		});
		const { POST } = await import('./+server');
		const response = await POST(event());
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data.created).toBe(false);
		expect(mocks.createOrMergeDocumentVersion).not.toHaveBeenCalled();
		expect(mocks.queueProjectContextSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({ reason: 'start_here_refresh_requested' })
		);
	});

	it('reports an initial history failure without losing the recovered document', async () => {
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		mocks.createOrMergeDocumentVersion.mockRejectedValue(new Error('version insert failed'));

		const { POST } = await import('./+server');
		const response = await POST(event());
		const payload = await response.json();

		expect(response.status).toBe(201);
		expect(payload.data).toMatchObject({
			created: true,
			version_recorded: false,
			refresh_queued: true,
			document: { id: DOCUMENT_ID }
		});
		expect(mocks.queueProjectContextSnapshot).toHaveBeenCalledOnce();
		expect(warning).toHaveBeenCalledWith(
			'[Start Here API] Initial version write failed:',
			expect.any(Error)
		);
		warning.mockRestore();
	});

	it('does not seed project memory for an inactive project', async () => {
		const { POST } = await import('./+server');
		const response = await POST(event(projectClient('completed')));

		expect(response.status).toBe(409);
		expect(mocks.ensureProjectStartHereDocument).not.toHaveBeenCalled();
		expect(mocks.queueProjectContextSnapshot).not.toHaveBeenCalled();
	});
});
