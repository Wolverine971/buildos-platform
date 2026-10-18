// apps/web/src/routes/admin/model-incidents/[id]/+page.server.ts
//
// One incident in full: the story, the byte timeline, how it ended, OpenRouter's
// record, what came back, and what was sent. Opening it is an admin read of a
// person's chat or job content, so it is logged before anything is returned.
import type { PageServerLoad } from './$types';
import { logAdminChatContentAccess } from '$lib/server/admin-chat-content-access';
import {
	getModelIncident,
	incidentUserEmails,
	listTurnSiblings,
	requireModelIncidentAdmin
} from '$lib/server/model-incidents';
import { assembleStream, parsedRequest } from '$lib/services/admin/model-incidents/packet';
import { buildIncidentStory, incidentHeadline } from '$lib/services/admin/model-incidents/story';
import type { IncidentEvent, IncidentJson } from '$lib/services/admin/model-incidents/types';

const record = (value: unknown): IncidentJson =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as IncidentJson) : {};

/** Bodies the page shows raw are cut here; the export carries everything. */
const RAW_PREVIEW_CHARS = 60_000;

export const load: PageServerLoad = async ({ locals, params, request, setHeaders }) => {
	const admin = await requireModelIncidentAdmin(locals);
	setHeaders({ 'cache-control': 'private, no-store' });
	const row = await getModelIncident(params.id);
	await logAdminChatContentAccess({
		adminUserId: admin.id,
		action: 'read',
		route: '/admin/model-incidents/[id]',
		targetType: 'llm_call_incident',
		targetId: row.id,
		targetUserIds: [row.user_id],
		rowCounts: { llm_call_incidents: 1 },
		request
	});
	const [siblings, emails] = await Promise.all([
		listTurnSiblings(row),
		incidentUserEmails([row.user_id])
	]);

	const request_json = parsedRequest(row);
	const { messages, tools, ...settings } = request_json ?? {};
	const responseBody = typeof row.response_body === 'string' ? row.response_body : '';
	const reply = assembleStream(responseBody);
	const timeline = record(row.timeline);

	return {
		incident: {
			id: row.id,
			createdAt: row.created_at,
			kind: row.kind,
			reason: row.reason,
			lane: row.lane,
			passRole: row.pass_role,
			round: row.logical_provider_round,
			attempt: row.provider_attempt,
			routeId: row.route_id,
			modelRequested: row.model_requested,
			modelUsed: row.model_used,
			provider: row.provider,
			httpStatus: row.http_status,
			generationId: row.generation_id,
			startedAt: row.started_at,
			endedAt: row.ended_at,
			durationMs: row.duration_ms,
			userId: row.user_id,
			userEmail: row.user_id ? (emails[row.user_id] ?? null) : null,
			sessionId: row.session_id,
			turnRunId: row.turn_run_id,
			projectId: row.project_id,
			usageLogId: row.usage_log_id,
			requestSha256: row.request_sha256 ?? null,
			requestHeaders: row.request_headers ?? {},
			responseHeaders: row.response_headers ?? null,
			responseTruncated: row.response_truncated === true,
			outcome: row.outcome ?? {},
			eventual: row.eventual,
			generationStats: row.generation_stats
		},
		story: buildIncidentStory(row),
		// Background jobs (SmartLLMService) get one JSON body; only chat streams.
		streamed: record(row.outcome).lane !== 'smart_llm',
		events: (Array.isArray(timeline.events) ? timeline.events : []) as IncidentEvent[],
		bytes: (Array.isArray(timeline.bytes) ? timeline.bytes : []) as Array<[number, number]>,
		request: request_json
			? {
					settings,
					messages: (Array.isArray(messages) ? messages : []) as IncidentJson[],
					tools: (Array.isArray(tools) ? tools : []) as IncidentJson[],
					raw: null
				}
			: {
					settings: {},
					messages: [],
					tools: [],
					raw:
						row.request_body && row.request_body !== '{}'
							? String(row.request_body).slice(0, RAW_PREVIEW_CHARS)
							: null
				},
		reply: {
			...reply,
			raw:
				responseBody &&
				!reply.reasoning &&
				!reply.content &&
				!reply.toolCalls.length &&
				!reply.errors.length
					? responseBody.slice(0, RAW_PREVIEW_CHARS)
					: null,
			hasBody: responseBody.length > 0
		},
		siblings: siblings.map((sibling) => ({
			id: sibling.id,
			createdAt: sibling.created_at,
			headline: incidentHeadline(sibling),
			passRole: sibling.pass_role,
			attempt: sibling.provider_attempt,
			provider: sibling.provider,
			durationMs: sibling.duration_ms
		}))
	};
};
