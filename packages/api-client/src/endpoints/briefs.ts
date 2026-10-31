// packages/api-client/src/endpoints/briefs.ts
import type { BuildOsHttp, RequestOptions } from '../client';
import type {
	DailyBriefAudioUrl,
	DailyBriefHistoryParams,
	DailyBriefHistoryResponse,
	DailyBriefParams,
	DailyBriefResponse
} from '../types';

const encode = encodeURIComponent;

export function createBriefEndpoints(http: BuildOsHttp) {
	return {
		/**
		 * GET /api/daily-briefs — the newest brief for one date; `brief` is null when
		 * none exists yet. Defaults to today.
		 */
		forDate: (params: DailyBriefParams = {}, options?: RequestOptions) =>
			http.request<DailyBriefResponse>('/api/daily-briefs', {
				query: { date: params.date },
				...options
			}),
		/**
		 * GET /api/daily-briefs/history — the newest briefs first, a page at a time. Rows are
		 * narrower than `forDate` (no analysis, no audio); see `DailyBriefListItem`.
		 */
		history: (params: DailyBriefHistoryParams = {}, options?: RequestOptions) =>
			http.request<DailyBriefHistoryResponse>('/api/daily-briefs/history', {
				query: { ...params },
				...options
			}),
		/**
		 * GET /api/daily-briefs/:id/audio-url — a signed URL for the brief's narration, good
		 * for an hour. 400 unless the brief's `audio_status` is `ready`.
		 */
		audioUrl: (briefId: string, options?: RequestOptions) =>
			http.request<DailyBriefAudioUrl>(`/api/daily-briefs/${encode(briefId)}/audio-url`, {
				...options
			})
	};
}

export type BriefEndpoints = ReturnType<typeof createBriefEndpoints>;
