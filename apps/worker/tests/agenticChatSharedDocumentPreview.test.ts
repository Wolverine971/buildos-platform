// apps/worker/tests/agenticChatSharedDocumentPreview.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ preview: vi.fn(), target: vi.fn() }));
vi.mock('@buildos/shared-agent-ops/gateway/op-execution-gateway', () => ({
	previewGatewayDocumentUpdate: mocks.preview
}));
vi.mock('../src/workers/agentic-chat/mutations/shared-document-edit', () => ({
	loadSharedDocumentTarget: mocks.target
}));
import { createGatewayDocumentEditPreviewPort } from '../src/workers/agentic-chat/provider/document-edit-preview';
const target = { parent_project_id: 'parent', shared_with_count: 4, document_id: 'doc' };
const missing = { ok: false, error: { code: 'NOT_FOUND', message: 'Not in project' } };
const ready = {
	ok: true,
	data: {
		document_id: 'doc',
		title: 'Rates',
		document_change: {
			lines_added: 1,
			lines_removed: 1,
			hunks_truncated: false,
			hunks: [{ lines: [{ kind: 'add', text: 'New rate' }] }]
		},
		next_content: 'New rate'
	}
};
const request = {
	userId: 'user',
	projectId: 'child',
	args: { document_id: 'doc', content: 'New rate' }
};
beforeEach(() => {
	vi.resetAllMocks();
});
describe('shared-document dry run', () => {
	it('previews a writable shelf document in the exact parent, as the confirm card will show it', async () => {
		mocks.preview.mockResolvedValueOnce(missing).mockResolvedValueOnce(ready);
		mocks.target.mockResolvedValue(target);
		const result = await createGatewayDocumentEditPreviewPort({} as never).preview({
			...request,
			baseContent: 'Unconfirmed prior body'
		});
		expect(result).toMatchObject({
			status: 'previewed',
			preview: { shared_document: target, changed_lines: ['+ New rate'] }
		});
		expect(mocks.preview.mock.calls[1]![0]).toMatchObject({
			scope: { project_ids: ['parent'], write_project_ids: ['parent'] },
			args: { document_id: 'doc', content: 'New rate' }
		});
		expect(mocks.preview.mock.calls[1]![0]).not.toHaveProperty('baseContent');
	});
	it('does not broaden preview scope for other parent or sibling documents', async () => {
		mocks.preview.mockResolvedValue(missing);
		mocks.target.mockResolvedValue(null);
		await expect(
			createGatewayDocumentEditPreviewPort({} as never).preview(request)
		).resolves.toMatchObject({ status: 'rejected' });
		expect(mocks.preview).toHaveBeenCalledTimes(1);
	});
	it('does not query hierarchy for ordinary local document previews', async () => {
		mocks.preview.mockResolvedValue(ready);
		await createGatewayDocumentEditPreviewPort({} as never).preview(request);
		expect(mocks.target).not.toHaveBeenCalled();
	});
});
