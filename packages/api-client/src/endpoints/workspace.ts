// packages/api-client/src/endpoints/workspace.ts
import type { BuildOsHttp, RequestOptions } from '../client';
import type {
	CaptureSortInput,
	CaptureSortReceipt,
	CaptureSortResult,
	CaptureUndoResult,
	WorkspaceCaptureInput,
	WorkspaceCaptureResponse
} from '../types';

export function createWorkspaceEndpoints(http: BuildOsHttp) {
	return {
		/**
		 * POST /api/workspace/capture — save a note or task to the Workspace at once (201).
		 * Send the same `idempotency_key` on every retry of one capture so an offline
		 * queue can never double-save.
		 */
		capture: (input: WorkspaceCaptureInput, options?: RequestOptions) =>
			http.request<WorkspaceCaptureResponse>('/api/workspace/capture', {
				method: 'POST',
				body: input,
				...options
			}),

		/**
		 * POST /api/workspace/capture/sort — sort a note just saved by `capture` (tasks, notes,
		 * or the project it belongs to). Safe to retry: a sorted note answers `skipped`.
		 */
		sortCapture: (input: CaptureSortInput, options?: RequestOptions) =>
			http.request<CaptureSortResult>('/api/workspace/capture/sort', {
				method: 'POST',
				body: input,
				...options
			}),

		/** POST /api/workspace/capture/sort/undo — put a sorted capture back as it was written. */
		undoSort: (receipt: CaptureSortReceipt, options?: RequestOptions) =>
			http.request<CaptureUndoResult>('/api/workspace/capture/sort/undo', {
				method: 'POST',
				body: { receipt },
				...options
			})
	};
}

export type WorkspaceEndpoints = ReturnType<typeof createWorkspaceEndpoints>;
