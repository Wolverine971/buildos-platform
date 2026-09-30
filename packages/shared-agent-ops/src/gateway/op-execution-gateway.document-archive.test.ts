// packages/shared-agent-ops/src/gateway/op-execution-gateway.document-archive.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	previewGatewayDocumentArchive,
	runReviewedDocumentArchive,
	type DocumentArchiveReviewSnapshot
} from './op-execution-gateway.document-archive';
import { DocumentArchiveDatabaseError } from '../ontology/document-archive-error';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';

const { archive, writeAccess, visible } = vi.hoisted(() => ({
	archive: vi.fn(),
	writeAccess: vi.fn(),
	visible: vi.fn()
}));
vi.mock('../ontology/doc-structure.service', () => ({ archiveDocumentInTree: archive }));
vi.mock('../ops/async-activity-logger', () => ({ logUpdateAsync: vi.fn(async () => undefined) }));
vi.mock('./op-execution-gateway.access', () => ({
	loadVisibleProjects: visible,
	assertProjectWriteAccess: writeAccess,
	assertVisibleEntityProject: (map: Map<string, unknown>, id: string) => map.get(id),
	contextActorId: async () => 'actor'
}));
vi.mock('./op-execution-gateway.serializers', () => ({
	serializeExternalEntity: (_kind: string, row: unknown) => row
}));
const project = { id: '10000000-0000-4000-8000-000000000001', name: 'Project' };
const document = {
	id: '10000000-0000-4000-8000-000000000002',
	project_id: project.id,
	title: 'Doc',
	state_key: 'draft',
	type_key: 'document.default'
};
const snapshot: DocumentArchiveReviewSnapshot = {
	project_id: project.id,
	document_id: document.id,
	archive_mode: 'archive_children',
	target_updated_at: '2026-09-29T00:00:00Z',
	tree_fingerprint: 'tree',
	archived_document_ids: [document.id],
	documents: [{ id: document.id, title: document.title, effect: 'archive' }],
	public_pages: [{ document_id: document.id, slug: 'published-doc', status: 'published' }]
};
function params() {
	const query = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		in: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn(async () => ({ data: document, error: null }))
	};
	const rpc = vi.fn(async () => ({ data: snapshot, error: null }));
	return {
		admin: { from: vi.fn(() => query), rpc } as never,
		userId: 'user',
		scope: { mode: 'read_write' as const, project_ids: [project.id] },
		args: {
			document_id: document.id,
			state_key: 'archived',
			archive_mode: 'archive_children',
			_archive_review: snapshot
		}
	};
}
describe('reviewed document archive gateway', () => {
	it('keeps a connection failure mentioning the RPC name uncertain', async () => {
		archive.mockRejectedValue(
			new Error('Connection lost while calling onto_document_archive_reviewed_atomic')
		);
		expect(await runReviewedDocumentArchive(params())).toMatchObject({
			ok: false,
			error: { code: 'INTERNAL' }
		});
	});
	beforeEach(() => {
		vi.resetAllMocks();
		visible.mockResolvedValue({
			projects: [project],
			projectMap: new Map([[project.id, project]])
		});
		archive.mockResolvedValue({
			document: { ...document, state_key: 'archived' },
			archivedDocumentIds: [document.id],
			archiveMode: 'archive_children'
		});
	});
	it('previews without writing and rechecks user write access on execution', async () => {
		const input = { ...params(), memo: {} };
		expect(await previewGatewayDocumentArchive(input)).toEqual({ ok: true, snapshot });
		expect(archive).not.toHaveBeenCalled();
		const saved = await runReviewedDocumentArchive(input);
		expect(visible).toHaveBeenCalledTimes(2);
		expect(visible.mock.calls[1]![0]).not.toHaveProperty('memo');
		expect(writeAccess).toHaveBeenCalledTimes(2);
		expect(archive).toHaveBeenCalledWith(
			input.admin,
			project.id,
			document.id,
			{
				mode: 'archive_children',
				expectedUpdatedAt: snapshot.target_updated_at,
				expectedReviewSnapshot: snapshot
			},
			'actor'
		);
		expect(saved).toMatchObject({
			ok: true,
			data: {
				archived_document_ids: [document.id],
				public_pages_preserved: snapshot.public_pages
			}
		});
	});
	it('cannot execute without bound server facts', async () => {
		const input = params();
		delete (input.args as any)._archive_review;
		expect(await runReviewedDocumentArchive(input)).toMatchObject({
			ok: false,
			error: { code: 'VALIDATION_ERROR' }
		});
		expect(archive).not.toHaveBeenCalled();
	});
	it('fails closed when access was revoked during review', async () => {
		writeAccess.mockImplementation(() => {
			throw new ExternalToolGatewayError('FORBIDDEN', 'revoked');
		});
		expect(await runReviewedDocumentArchive(params())).toMatchObject({
			ok: false,
			error: { code: 'FORBIDDEN' }
		});
		expect(archive).not.toHaveBeenCalled();
	});
	it.each(['archive', ' ARCHIVED '])(
		'rejects noncanonical state %s before a write',
		async (state) => {
			const input = params();
			input.args.state_key = state;
			expect(await runReviewedDocumentArchive(input)).toMatchObject({
				ok: false,
				error: { code: 'VALIDATION_ERROR' }
			});
			expect(archive).not.toHaveBeenCalled();
		}
	);
	it('returns a known no-write failure on changed reviewed facts and never retries', async () => {
		archive.mockRejectedValue(
			new DocumentArchiveDatabaseError('40001', 'document_archive_review_changed')
		);
		expect(await runReviewedDocumentArchive(params())).toMatchObject({
			ok: false,
			error: {
				code: 'VALIDATION_ERROR',
				message: expect.stringContaining('Nothing was archived')
			}
		});
		expect(archive).toHaveBeenCalledTimes(1);
	});
	it.each(['40001', '40P01', '55P03', '57014'])(
		'exposes confirmed %s rollback to the bounded executor retry',
		async (code) => {
			archive.mockRejectedValue(
				new DocumentArchiveDatabaseError(code, 'transaction aborted')
			);
			expect(await runReviewedDocumentArchive(params())).toMatchObject({
				ok: false,
				error: {
					code: 'INTERNAL',
					details: { write_rolled_back: true, database_code: code }
				}
			});
			expect(archive).toHaveBeenCalledTimes(1);
		}
	);
	it.each(['document_archive_version_conflict', 'doc_structure_version_conflict'])(
		'requires a fresh review after %s',
		async (message) => {
			archive.mockRejectedValue(new DocumentArchiveDatabaseError('P0001', message));
			expect(await runReviewedDocumentArchive(params())).toMatchObject({
				ok: false,
				error: { code: 'VALIDATION_ERROR' }
			});
		}
	);
	it('does not turn transport prose resembling a database marker into a rollback receipt', async () => {
		archive.mockRejectedValue(new Error('document_archive_review_changed: connection lost'));
		expect(await runReviewedDocumentArchive(params())).toMatchObject({
			ok: false,
			error: { code: 'INTERNAL' }
		});
	});
	it('keeps a lost database response uncertain', async () => {
		archive.mockRejectedValue(new Error('connection closed'));
		expect(await runReviewedDocumentArchive(params())).toMatchObject({
			ok: false,
			error: { code: 'INTERNAL' }
		});
	});
});
