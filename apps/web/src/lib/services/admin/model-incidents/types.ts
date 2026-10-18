// apps/web/src/lib/services/admin/model-incidents/types.ts
//
// One `llm_call_incidents` row (supabase/migrations/20261018150000_llm_call_incidents.sql):
// a stalled or failed model call captured by the chat worker
// (apps/worker/src/workers/agentic-chat/provider/openrouter/call-capture.ts) or by
// SmartLLMService (packages/smart-llm). Not in the generated database types yet.

export type IncidentJson = Record<string, unknown>;

export type IncidentEvent = { at_ms: number; event: string } & Record<string, unknown>;

export type ModelIncidentRow = {
	id: string;
	created_at: string;
	updated_at?: string;
	lane: string;
	user_id: string | null;
	session_id: string | null;
	turn_run_id: string | null;
	project_id: string | null;
	usage_log_id: string | null;
	kind: 'stall' | 'error';
	reason: string;
	pass_role: string | null;
	logical_provider_round: number | null;
	provider_attempt: number | null;
	route_id: string | null;
	model_requested: string;
	model_used: string | null;
	provider: string | null;
	http_status: number | null;
	generation_id: string | null;
	started_at: string;
	ended_at: string | null;
	duration_ms: number | null;
	request_body?: string;
	request_sha256?: string;
	request_headers?: IncidentJson;
	response_headers?: IncidentJson | null;
	response_body?: string | null;
	response_truncated?: boolean;
	timeline?: IncidentJson;
	outcome?: IncidentJson;
	eventual: IncidentJson | null;
	generation_stats: IncidentJson | null;
};

/** The list view's columns: everything but the bodies and the byte timeline. */
export const MODEL_INCIDENT_LIST_COLUMNS = [
	'id',
	'created_at',
	'lane',
	'user_id',
	'session_id',
	'turn_run_id',
	'project_id',
	'usage_log_id',
	'kind',
	'reason',
	'pass_role',
	'logical_provider_round',
	'provider_attempt',
	'route_id',
	'model_requested',
	'model_used',
	'provider',
	'http_status',
	'generation_id',
	'started_at',
	'ended_at',
	'duration_ms',
	'eventual',
	'generation_stats',
	'outcome'
].join(',');
