// packages/api-client/src/endpoints/inbox.ts
import type { BuildOsHttp, RequestOptions } from '../client';
import type {
	CheckInAnswer,
	CheckInAnswersResponse,
	CheckInsResponse,
	CleanupDecideResponse,
	CleanupDecisionRequest,
	CleanupNoteRequest,
	CleanupNoteResponse,
	CleanupUndoResponse,
	DoneForYouResponse,
	EmailUpdateDecisionResponse,
	EmailUpdatesResponse,
	InboxChatSessionRequest,
	InboxChatSessionResponse,
	InboxCountResponse,
	InboxDecideAction,
	InboxDecideResponse,
	InboxListParams,
	InboxListResponse
} from '../inbox-types';

const encode = encodeURIComponent;

/** The web's snooze: until this time tomorrow. */
export const INBOX_SNOOZE_MS = 24 * 60 * 60 * 1000;

export function createInboxEndpoints(http: BuildOsHttp) {
	return {
		/** GET /api/inbox — pending items with their payloads, the way the web's inbox reads it. */
		list: (params: InboxListParams = {}, options?: RequestOptions) =>
			http.request<InboxListResponse>('/api/inbox', {
				query: {
					status: params.status ?? 'pending',
					project_id: params.projectId,
					source_type: params.sourceType,
					limit: params.limit,
					repair: params.repair ?? 'none',
					include_payload: params.includePayload === false ? undefined : '1'
				},
				...options
			}),

		/** GET /api/inbox/count — the badge (`total` includes check-in and email cards). */
		count: (params: { timezone?: string } = {}, options?: RequestOptions) =>
			http.request<InboxCountResponse>('/api/inbox/count', {
				query: { status: 'pending', limit: 1000, tz: params.timezone },
				...options
			}),

		/** POST /api/inbox/decide — approve, mark handled (`address` needs a note), or dismiss. */
		decide: (
			itemId: string,
			action: InboxDecideAction,
			extra: { note?: string; resolutionText?: string } = {},
			options?: RequestOptions
		) =>
			http.request<InboxDecideResponse>('/api/inbox/decide', {
				method: 'POST',
				body: {
					item_id: itemId,
					action,
					...(extra.resolutionText ? { resolution_text: extra.resolutionText } : {}),
					...(extra.note ? { note: extra.note } : {})
				},
				...options
			}),

		/** POST /api/inbox/decide with `snooze` — any kind; default until this time tomorrow. */
		snooze: (itemId: string, until?: Date, options?: RequestOptions) =>
			http.request<InboxDecideResponse>('/api/inbox/decide', {
				method: 'POST',
				body: {
					item_id: itemId,
					action: 'snooze',
					snooze_until: (until ?? new Date(Date.now() + INBOX_SNOOZE_MS)).toISOString()
				},
				...options
			}),

		/** POST /api/inbox/[id]/chat-session — a chat seeded with the item ("Talk it through"). */
		chatSession: (
			itemId: string,
			body: InboxChatSessionRequest = {},
			options?: RequestOptions
		) =>
			http.request<InboxChatSessionResponse>(`/api/inbox/${encode(itemId)}/chat-session`, {
				method: 'POST',
				body,
				...options
			}),

		/** GET /api/inbox/done-for-you — safe changes made without asking this week. */
		doneForYou: (options?: RequestOptions) =>
			http.request<DoneForYouResponse>('/api/inbox/done-for-you', options),

		/** GET /api/inbox/check-ins — overdue tasks ("Did this happen?") and quiet projects. */
		checkIns: (params: { timezone?: string } = {}, options?: RequestOptions) =>
			http.request<CheckInsResponse>('/api/inbox/check-ins', {
				query: { tz: params.timezone },
				...options
			}),

		/** POST /api/inbox/check-ins — answer tasks and projects; `restore` is Undo. */
		answerCheckIns: (answers: CheckInAnswer[], options?: RequestOptions) =>
			http.request<CheckInAnswersResponse>('/api/inbox/check-ins', {
				method: 'POST',
				body: { answers },
				...options
			}),

		/** GET /api/inbox/email-updates — project updates the nightly email read proposed. */
		emailUpdates: (options?: RequestOptions) =>
			http.request<EmailUpdatesResponse>('/api/inbox/email-updates', options),

		/** POST /api/inbox/email-updates/[id] — Apply or Not now. Read `ok`: 200 on refusal too. */
		decideEmailUpdate: (id: string, decision: 'apply' | 'dismiss', options?: RequestOptions) =>
			http.request<EmailUpdateDecisionResponse>(`/api/inbox/email-updates/${encode(id)}`, {
				method: 'POST',
				body: { decision },
				...options
			}),

		/** POST /api/onto/projects/[id]/cleanup — up to 40 decisions on a project's cleanup list. */
		decideCleanup: (
			projectId: string,
			decisions: CleanupDecisionRequest[],
			options?: RequestOptions
		) =>
			http.request<CleanupDecideResponse>(`/api/onto/projects/${encode(projectId)}/cleanup`, {
				method: 'POST',
				body: { decisions },
				...options
			}),

		/** POST /api/onto/projects/[id]/cleanup/note — send an item on with the user's words. */
		cleanupNote: (projectId: string, body: CleanupNoteRequest, options?: RequestOptions) =>
			http.request<CleanupNoteResponse>(
				`/api/onto/projects/${encode(projectId)}/cleanup/note`,
				{ method: 'POST', body, ...options }
			),

		/** POST /api/onto/projects/[id]/cleanup/undo — undo one applied (or done-for-you) change. */
		undoCleanup: (projectId: string, suggestionId: string, options?: RequestOptions) =>
			http.request<CleanupUndoResponse>(
				`/api/onto/projects/${encode(projectId)}/cleanup/undo`,
				{ method: 'POST', body: { suggestion_id: suggestionId }, ...options }
			),

		/** POST to a done-for-you entry's own `undo_url` (calendar changes). */
		undoByUrl: (undoUrl: string, options?: RequestOptions) =>
			http.request<unknown>(undoUrl, { method: 'POST', ...options })
	};
}

export type InboxEndpoints = ReturnType<typeof createInboxEndpoints>;
