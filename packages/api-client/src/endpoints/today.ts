// packages/api-client/src/endpoints/today.ts
import type { BuildOsHttp, RequestOptions } from '../client';
import type {
	TodayKeepResponse,
	TodayParams,
	TodayResponse,
	TodayWaitingStatus,
	TodayWaitingStatusResponse,
	WhatChangedResponse
} from '../types';

const encode = encodeURIComponent;

export function createTodayEndpoints(http: BuildOsHttp) {
	return {
		/**
		 * GET /api/today — today's events, tasks and overdue count in the user's timezone, plus
		 * `attention` (who's waiting, suggestions the brief keeps repeating).
		 */
		get: (params: TodayParams = {}, options?: RequestOptions) =>
			http.request<TodayResponse>('/api/today', {
				query: { timezone: params.timezone },
				...options
			}),

		/** PATCH /api/today/waiting/[id] — mark a waiting row handled, remove it, or reopen it. */
		setWaitingStatus: (itemId: string, status: TodayWaitingStatus, options?: RequestOptions) =>
			http.request<TodayWaitingStatusResponse>(`/api/today/waiting/${encode(itemId)}`, {
				method: 'PATCH',
				body: { status },
				...options
			}),

		/** POST /api/today/suggestions/keep — hide a repeated suggestion for two weeks. */
		keepSuggestion: (taskId: string, options?: RequestOptions) =>
			http.request<TodayKeepResponse>('/api/today/suggestions/keep', {
				method: 'POST',
				body: { task_id: taskId },
				...options
			}),

		/** DELETE /api/today/suggestions/keep — undo Keep. */
		unkeepSuggestion: (taskId: string, options?: RequestOptions) =>
			http.request<{ task_id: string }>('/api/today/suggestions/keep', {
				method: 'DELETE',
				body: { task_id: taskId },
				...options
			}),

		/** GET /api/today/changes — who changed what since an instant (clamped to 7 days). */
		changes: (params: { since: string }, options?: RequestOptions) =>
			http.request<WhatChangedResponse>('/api/today/changes', {
				query: { since: params.since },
				...options
			})
	};
}

export type TodayEndpoints = ReturnType<typeof createTodayEndpoints>;
