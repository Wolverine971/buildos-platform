// packages/api-client/src/endpoints/documents.ts
import type { BuildOsHttp, RequestOptions } from '../client';
import type { DocumentDetailResponse, DocumentUpdateInput, DocumentUpdateResponse } from '../types';

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
			})
	};
}

export type DocumentEndpoints = ReturnType<typeof createDocumentEndpoints>;
