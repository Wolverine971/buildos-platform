// packages/api-client/src/endpoints/documents.ts
import type { BuildOsHttp, RequestOptions } from '../client';
import type {
	DocumentDetailResponse,
	DocumentRevertChangeRequest,
	DocumentRevertChangeResponse,
	DocumentUpdateInput,
	DocumentUpdateResponse
} from '../types';

const encode = encodeURIComponent;

export function createDocumentEndpoints(http: BuildOsHttp) {
	return {
		/** GET /api/onto/documents/[id] */
		get: (documentId: string, options?: RequestOptions) =>
			http.request<DocumentDetailResponse>(
				`/api/onto/documents/${encode(documentId)}`,
				options
			),

		/**
		 * PATCH /api/onto/documents/[id]. Send `expected_editor_revision` from the last
		 * read so a concurrent edit returns 409 instead of being overwritten.
		 */
		update: (documentId: string, patch: DocumentUpdateInput, options?: RequestOptions) =>
			http.request<DocumentUpdateResponse>(`/api/onto/documents/${encode(documentId)}`, {
				method: 'PATCH',
				body: patch,
				...options
			}),

		/**
		 * POST /api/onto/documents/[id]/revert-change: one-click Undo of an agent edit, from the
		 * change receipt's inverse patches (newest first). 409 means the text moved on since
		 * (`error.code` is one of DOCUMENT_UNDO_CONFLICT_CODES); idempotent against `before_hash`.
		 */
		revertChange: (
			documentId: string,
			body: DocumentRevertChangeRequest,
			options?: RequestOptions
		) =>
			http.request<DocumentRevertChangeResponse>(
				`/api/onto/documents/${encode(documentId)}/revert-change`,
				{ method: 'POST', body, ...options }
			)
	};
}

export type DocumentEndpoints = ReturnType<typeof createDocumentEndpoints>;
