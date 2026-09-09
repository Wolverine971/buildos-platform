// apps/web/src/lib/server/document-editor-revision.test.ts
import { describe, expect, it } from 'vitest';
import { canRebaseDocumentEditorSave, getDocumentEditorRevision } from './document-editor-revision';

const original = {
	id: 'doc-1',
	project_id: 'project-1',
	title: 'Notes',
	content: 'My draft',
	description: null,
	state_key: 'draft',
	type_key: 'document.default',
	props: {}
};
const request = {
	content: 'My next draft',
	expected_editor_revision: getDocumentEditorRevision(original)
};

describe('document editor revision', () => {
	it('preserves its revision across independent metadata and derived-data updates', () => {
		expect(
			canRebaseDocumentEditorSave(
				{
					...original,
					type_key: 'document.context.workflow',
					updated_at: '2026-09-09T19:13:21.868765+00:00',
					outline: { headings: [] },
					content_hash: 'derived-hash',
					props: { tags: ['testing'], _classification: { confidence: 0.72 } }
				},
				request
			)
		).toBe(true);
	});

	it.each([
		{ id: 'other-doc' },
		{ project_id: 'other-project' },
		{ title: 'Renamed' },
		{ content: 'Another writer' },
		{ description: 'Another description' },
		{ state_key: 'published' },
		{ content: null, props: { body_markdown: 'Legacy body' } },
		{ description: null, props: { description: 'Legacy description' } }
	])('rejects a changed editor baseline: %j', (changed) => {
		expect(canRebaseDocumentEditorSave({ ...original, ...changed }, request)).toBe(false);
	});

	it.each([
		{ type_key: 'document.default' },
		{ props: {} },
		{ parents: [] },
		{ action: 'archive' },
		{ state_key: 'Archive' },
		{ connections: [] },
		{ expected_editor_revision: 'incorrect' }
	])('does not rebase non-editor or invalid requests: %j', (fields) => {
		expect(canRebaseDocumentEditorSave(original, { ...request, ...fields })).toBe(false);
	});

	it('does not rebase a save into an archived document', () => {
		const archived = { ...original, state_key: 'archived' };
		expect(
			canRebaseDocumentEditorSave(archived, {
				...request,
				expected_editor_revision: getDocumentEditorRevision(archived)
			})
		).toBe(false);
	});
});
