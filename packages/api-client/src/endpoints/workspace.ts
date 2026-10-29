// packages/api-client/src/endpoints/workspace.ts
import type { BuildOsHttp, RequestOptions } from '../client';
import type { WorkspaceCaptureInput, WorkspaceCaptureResponse } from '../types';

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
			})
	};
}

export type WorkspaceEndpoints = ReturnType<typeof createWorkspaceEndpoints>;
