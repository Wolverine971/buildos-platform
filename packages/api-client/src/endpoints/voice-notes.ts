// packages/api-client/src/endpoints/voice-notes.ts
import type { BuildOsHttp, RequestOptions } from '../client';
import type {
	TranscribeResponse,
	VoiceNoteListParams,
	VoiceNoteListResponse,
	VoiceNoteRow
} from '../types';

export function createVoiceNoteEndpoints(http: BuildOsHttp) {
	return {
		/** GET /api/voice-notes */
		list: (params: VoiceNoteListParams = {}, options?: RequestOptions) =>
			http.request<VoiceNoteListResponse>('/api/voice-notes', {
				query: {
					linkedEntityType: params.linkedEntityType,
					linkedEntityId: params.linkedEntityId,
					groupId: params.groupId,
					groupIds:
						params.groupIds && params.groupIds.length > 0
							? params.groupIds.join(',')
							: undefined,
					limit: params.limit,
					offset: params.offset
				},
				...options
			}),

		/**
		 * POST /api/voice-notes — multipart upload. Build the `FormData` with the keys in
		 * `VoiceNoteCreateFields`; the browser/runtime sets the multipart boundary.
		 */
		create: (formData: FormData, options?: RequestOptions) =>
			http.request<VoiceNoteRow>('/api/voice-notes', {
				method: 'POST',
				body: formData,
				...options
			})
	};
}

/** POST /api/transcribe — multipart; keys in `TranscribeFields`. */
export function createTranscribeEndpoint(http: BuildOsHttp) {
	return (formData: FormData, options?: RequestOptions) =>
		http.request<TranscribeResponse>('/api/transcribe', {
			method: 'POST',
			body: formData,
			...options
		});
}

export type VoiceNoteEndpoints = ReturnType<typeof createVoiceNoteEndpoints>;
export type TranscribeEndpoint = ReturnType<typeof createTranscribeEndpoint>;
