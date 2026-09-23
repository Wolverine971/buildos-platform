// apps/web/src/routes/api/onto/documents/[id]/revert-change/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { summarizeDocumentChange } from '@buildos/shared-agent-ops/ontology/document-edits';
import { hashDocumentContent } from '@buildos/shared-agent-ops/utils/document-outline';

const mocks = vi.hoisted(() => ({
	requireProjectEntityAccess: vi.fn(),
	writeDocumentHeadAndVersion: vi.fn(),
	captureServerEvent: vi.fn()
}));

vi.mock('$lib/server/ontology-api-access', () => ({
	requireProjectEntityAccess: mocks.requireProjectEntityAccess
}));

vi.mock('$lib/services/ontology/document-write.service', () => ({
	writeDocumentHeadAndVersion: mocks.writeDocumentHeadAndVersion
}));

vi.mock('$lib/server/posthog', () => ({
	captureServerEvent: mocks.captureServerEvent
}));

import { POST } from './+server';

const PROJECT_ID = 'project-1';
const DOCUMENT_ID = 'document-1';

const BEFORE = [
	'# Launch plan',
	'',
	'Intro line.',
	'',
	'## Scope',
	'',
	'Old scope text.',
	'',
	'## Risks',
	'',
	'None yet.',
	''
].join('\n');
const MIDDLE = BEFORE.replace('Old scope text.', 'New scope text.\nSecond scope line.');
const AFTER = MIDDLE.replace('Intro line.', 'Sharper intro line.');

function summarize(before: string, after: string) {
	const summary = summarizeDocumentChange({
		project_id: PROJECT_ID,
		document_id: DOCUMENT_ID,
		title: 'Launch plan',
		before,
		after
	});
	if (!summary?.revert_patch) throw new Error('fixture change has no revert patch');
	return summary;
}

function documentRow(content: string) {
	return {
		id: DOCUMENT_ID,
		project_id: PROJECT_ID,
		title: 'Launch plan',
		content,
		props: { body_markdown: content, keep: true },
		updated_at: '2026-09-23T10:00:00.000Z',
		deleted_at: null
	};
}

function createSupabase(content: string) {
	const builder: Record<string, any> = {};
	builder.select = vi.fn(() => builder);
	builder.eq = vi.fn(() => builder);
	builder.is = vi.fn(() => builder);
	builder.maybeSingle = vi.fn(async () => ({ data: documentRow(content), error: null }));
	return { from: vi.fn(() => builder) };
}

function createEvent(body: unknown, content: string, id = DOCUMENT_ID) {
	return {
		params: { id },
		request: new Request(`http://localhost/api/onto/documents/${id}/revert-change`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}),
		locals: {
			safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
			supabase: createSupabase(content)
		}
	};
}

function grantWriteAccess() {
	mocks.requireProjectEntityAccess.mockResolvedValue({
		ok: true,
		actorId: 'actor-1',
		entity: { id: DOCUMENT_ID, project_id: PROJECT_ID },
		projectId: PROJECT_ID
	});
}

function acceptWrites() {
	mocks.writeDocumentHeadAndVersion.mockImplementation(async (params: any) => ({
		status: 'updated',
		document: { ...documentRow(params.update.content), updated_at: params.update.updated_at },
		versionWarning: null,
		versionError: null
	}));
}

describe('POST /api/onto/documents/[id]/revert-change', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.captureServerEvent.mockResolvedValue(undefined);
		grantWriteAccess();
		acceptWrites();
	});

	it('restores the pre-edit body in one guarded, versioned write', async () => {
		const change = summarize(BEFORE, MIDDLE);
		const event = createEvent(
			{
				revert_patch: change.revert_patch,
				before_hash: change.before_hash,
				expected_after_hash: change.after_hash
			},
			MIDDLE
		);

		const response = await POST(event as never);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(mocks.writeDocumentHeadAndVersion).toHaveBeenCalledTimes(1);
		const write = mocks.writeDocumentHeadAndVersion.mock.calls[0]![0];
		expect(write).toMatchObject({
			supabase: event.locals.supabase,
			documentId: DOCUMENT_ID,
			projectId: PROJECT_ID,
			expectedUpdatedAt: '2026-09-23T10:00:00.000Z',
			actorId: 'actor-1',
			changeSource: 'agent_undo',
			forceCreateVersion: true
		});
		expect(write.update.content).toBe(BEFORE);
		expect(write.update.props).toEqual({ body_markdown: BEFORE, keep: true });
		expect(payload.data).toMatchObject({
			already_undone: false,
			strategy: 'fast_path',
			document: { content: BEFORE },
			document_change: {
				lines_added: change.lines_removed,
				lines_removed: change.lines_added,
				before_hash: change.after_hash,
				after_hash: change.before_hash
			}
		});
		expect(mocks.captureServerEvent).toHaveBeenCalledWith(
			'user-1',
			'document_agent_edit_undone',
			expect.objectContaining({ document_id: DOCUMENT_ID, resolution_strategy: 'fast_path' })
		);
	});

	it('undoes a merged multi-edit card atomically, newest edit first', async () => {
		const first = summarize(BEFORE, MIDDLE);
		const second = summarize(MIDDLE, AFTER);

		const response = await POST(
			createEvent(
				{
					revert_patches: [second.revert_patch, first.revert_patch],
					before_hash: first.before_hash,
					expected_after_hash: second.after_hash
				},
				AFTER
			) as never
		);

		expect(response.status).toBe(200);
		expect(mocks.writeDocumentHeadAndVersion).toHaveBeenCalledTimes(1);
		expect(mocks.writeDocumentHeadAndVersion.mock.calls[0]![0].update.content).toBe(BEFORE);
	});

	it('keeps later edits elsewhere in the document by re-anchoring', async () => {
		const change = summarize(BEFORE, MIDDLE);
		const editedElsewhere = MIDDLE.replace('None yet.', 'Budget is tight.');

		const response = await POST(
			createEvent({ revert_patch: change.revert_patch }, editedElsewhere) as never
		);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data.strategy).toBe('reanchored');
		expect(mocks.writeDocumentHeadAndVersion.mock.calls[0]![0].update.content).toBe(
			BEFORE.replace('None yet.', 'Budget is tight.')
		);
	});

	it('returns 409 with the conflict reason when the edited text changed since', async () => {
		const change = summarize(BEFORE, MIDDLE);
		const rewritten = MIDDLE.replace('New scope text.', 'The user rewrote this line.');

		const response = await POST(
			createEvent({ revert_patch: change.revert_patch }, rewritten) as never
		);
		const payload = await response.json();

		expect(response.status).toBe(409);
		expect(payload.success).toBe(false);
		expect(['BASE_TEXT_CHANGED', 'ANCHOR_NOT_FOUND', 'ANCHOR_AMBIGUOUS']).toContain(
			payload.code
		);
		expect(mocks.writeDocumentHeadAndVersion).not.toHaveBeenCalled();
		expect(mocks.captureServerEvent).toHaveBeenCalledWith(
			'user-1',
			'document_agent_edit_undo_conflicted',
			expect.objectContaining({ reason: payload.code })
		);
	});

	it('reports an already-restored body as undone without writing', async () => {
		const change = summarize(BEFORE, MIDDLE);

		const response = await POST(
			createEvent(
				{ revert_patch: change.revert_patch, before_hash: hashDocumentContent(BEFORE) },
				BEFORE
			) as never
		);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data).toMatchObject({ already_undone: true, document_change: null });
		expect(mocks.writeDocumentHeadAndVersion).not.toHaveBeenCalled();
	});

	it('retries one write race, then reports WRITE_RACE', async () => {
		const change = summarize(BEFORE, MIDDLE);
		mocks.writeDocumentHeadAndVersion.mockResolvedValue({ status: 'conflict' });

		const response = await POST(
			createEvent({ revert_patch: change.revert_patch }, MIDDLE) as never
		);

		expect(response.status).toBe(409);
		expect((await response.json()).code).toBe('WRITE_RACE');
		expect(mocks.writeDocumentHeadAndVersion).toHaveBeenCalledTimes(2);
	});

	it('rejects a patch for another document before checking access', async () => {
		const change = summarize(BEFORE, MIDDLE);

		const response = await POST(
			createEvent({ revert_patch: change.revert_patch }, MIDDLE, 'document-2') as never
		);

		expect(response.status).toBe(400);
		expect(mocks.requireProjectEntityAccess).not.toHaveBeenCalled();
		expect(mocks.writeDocumentHeadAndVersion).not.toHaveBeenCalled();
	});

	it('rejects an altered patch as a bad request', async () => {
		const change = summarize(BEFORE, MIDDLE);
		const altered = structuredClone(change.revert_patch!);
		altered.operations[0]!.replacement_markdown = 'Injected text.\n';

		const response = await POST(createEvent({ revert_patch: altered }, MIDDLE) as never);

		expect(response.status).toBe(400);
		expect(mocks.writeDocumentHeadAndVersion).not.toHaveBeenCalled();
	});

	it('never writes when project write access is denied', async () => {
		const change = summarize(BEFORE, MIDDLE);
		mocks.requireProjectEntityAccess.mockResolvedValue({
			ok: false,
			response: new Response(JSON.stringify({ success: false }), { status: 403 })
		});
		const event = createEvent({ revert_patch: change.revert_patch }, MIDDLE);

		const response = await POST(event as never);

		expect(response.status).toBe(403);
		expect(event.locals.supabase.from).not.toHaveBeenCalled();
		expect(mocks.writeDocumentHeadAndVersion).not.toHaveBeenCalled();
	});
});
