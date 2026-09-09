// apps/web/src/lib/server/document-editor-revision.ts
import { createHash } from 'node:crypto';
import { normalizeDocumentStateInput } from '@buildos/shared-agent-ops/ontology/document-state';

/**
 * Revision of the fields the document editor can replace. Classification, tags,
 * outlines, and other metadata can change independently without losing an edit.
 * This is a concurrency token, not an authorization credential.
 */
export function getDocumentEditorRevision(document: Record<string, any>): string {
	return createHash('sha256')
		.update(
			JSON.stringify([
				'document-editor-v1',
				document.id,
				document.project_id,
				document.title ?? '',
				document.description ?? document.props?.description ?? '',
				document.content ?? document.props?.body_markdown ?? '',
				document.state_key
			])
		)
		.digest('hex');
}

const EDITOR_SAVE_FIELDS = new Set([
	'title',
	'description',
	'content',
	'state_key',
	'expected_updated_at',
	'expected_editor_revision',
	'force_version',
	'sync_public_page'
]);

/** Only ordinary editor saves may rebase; metadata, tree, and archive writes stay strict. */
export function canRebaseDocumentEditorSave(
	document: Record<string, any>,
	body: Record<string, unknown>
): boolean {
	return (
		Object.keys(body).every((key) => EDITOR_SAVE_FIELDS.has(key)) &&
		normalizeDocumentStateInput(document.state_key) !== 'archived' &&
		normalizeDocumentStateInput(body.state_key) !== 'archived' &&
		typeof body.expected_editor_revision === 'string' &&
		body.expected_editor_revision === getDocumentEditorRevision(document)
	);
}
