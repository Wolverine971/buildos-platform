// packages/shared-agent-ops/src/ontology/document-archive-error.ts
// Only constructed from a returned PostgreSQL RPC error, never transport prose.
export class DocumentArchiveDatabaseError extends Error {
	constructor(
		readonly code: string,
		readonly databaseMessage: string,
		readonly details: string | null = null,
		readonly hint: string | null = null
	) {
		const message =
			databaseMessage === 'document_archive_review_changed'
				? 'Document archive review changed: preview and review the current tree and public pages again'
				: databaseMessage === 'document_archive_version_conflict'
					? 'Document version conflict: the document changed before archive'
					: databaseMessage === 'doc_structure_version_conflict'
						? 'Structure version conflict: the structure changed before archive'
						: `Failed to archive document: ${databaseMessage}`;
		super(message);
		this.name = 'DocumentArchiveDatabaseError';
	}
}
