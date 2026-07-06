// apps/web/src/lib/types/admin-chat-user-analytics.ts

export type AdminChatUserAnalyticsTimeframe = '24h' | '7d' | '30d' | '90d';

export type AdminChatUserMetric = {
	user_id: string;
	email: string;
	name: string | null;
	first_chat_at: string | null;
	last_activity_at: string | null;
	active_day_count: number;
	consecutive_day_streak: number;
	session_count: number;
	project_session_count: number;
	global_session_count: number;
	turn_count: number;
	completed_turn_count: number;
	failed_turn_count: number;
	cancelled_turn_count: number;
	running_turn_count: number;
	message_count: number;
	user_message_count: number;
	assistant_message_count: number;
	message_error_count: number;
	tool_call_count: number;
	tool_failure_count: number;
	tool_failure_rate: number;
	llm_call_count: number;
	llm_failure_count: number;
	validation_failure_count: number;
	ttfr_p50_ms: number | null;
	ttfr_p95_ms: number | null;
	ttfr_max_ms: number | null;
	slow_turn_count: number;
	total_tokens: number;
	total_cost_usd: number;
	created_entity_count: number;
	updated_entity_count: number;
	deleted_entity_count: number;
	project_count: number;
	top_topics: Array<{ topic: string; count: number }>;
	top_projects: Array<{ project_id: string; name: string | null; count: number }>;
	top_tools: Array<{ tool_name: string; count: number; failures: number }>;
	preview: string;
};

export type AdminChatClassificationJobSummary = {
	job_id: string;
	queue_job_id: string | null;
	status: string;
	error_message: string | null;
	queued_at: string | null;
	started_at: string | null;
	completed_at: string | null;
	updated_at: string | null;
};

export type AdminChatSessionMetric = {
	session_id: string;
	user_id: string;
	user_email: string;
	user_name: string | null;
	title: string;
	context_type: string;
	entity_id: string | null;
	project_ids: string[];
	project_names: string[];
	status: string;
	created_at: string;
	last_activity_at: string | null;
	last_classified_at: string | null;
	classification_state: 'classified' | 'missing' | 'stale';
	classification_job: AdminChatClassificationJobSummary | null;
	topics: string[];
	summary_preview: string | null;
	turn_count: number;
	message_count: number;
	user_message_count: number;
	assistant_message_count: number;
	tool_call_count: number;
	tool_failure_count: number;
	llm_call_count: number;
	llm_failure_count: number;
	validation_failure_count: number;
	ttfr_p50_ms: number | null;
	ttfr_p95_ms: number | null;
	ttfr_max_ms: number | null;
	slow_turn_count: number;
	duration_ms: number | null;
	total_tokens: number;
	total_cost_usd: number;
	created_entity_count: number;
	updated_entity_count: number;
	deleted_entity_count: number;
	has_errors: boolean;
	has_slow_response: boolean;
};

export type AdminChatUsersResponse = {
	kpis: {
		active_users: number;
		sessions: number;
		turns: number;
		user_messages: number;
		assistant_responses: number;
		ttfr_p50_ms: number | null;
		ttfr_p95_ms: number | null;
		slow_turns: number;
		error_impacted_users: number;
		chat_created_entities: number;
	};
	leaderboards: {
		most_sessions: AdminChatUserMetric[];
		slowest_first_responses: AdminChatUserMetric[];
		most_tool_calls: AdminChatUserMetric[];
		longest_threads: AdminChatSessionMetric[];
		most_requests_responses: AdminChatUserMetric[];
		most_created_entities: AdminChatUserMetric[];
		most_error_impacted: AdminChatUserMetric[];
	};
	users: AdminChatUserMetric[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		total_pages: number;
	};
	filter_options: {
		context_types: string[];
		topics: string[];
		tools: string[];
		gateway_ops: string[];
		projects: Array<{ project_id: string; name: string | null }>;
	};
	data_health: {
		truncated: Record<string, boolean>;
		classification_missing_sessions: number;
		classification_stale_sessions: number;
		raw_message_content_returned: false;
	};
};

export type AdminChatUserDetailResponse = {
	user: {
		id: string;
		email: string;
		name: string | null;
	};
	summary: AdminChatUserMetric;
	timeline: Array<{
		date: string;
		session_count: number;
		turn_count: number;
		message_count: number;
		slow_turn_count: number;
		error_count: number;
		created_entity_count: number;
		top_topics: string[];
		project_names: string[];
	}>;
	sessions: AdminChatSessionMetric[];
	errors: Array<{
		source: 'message' | 'tool' | 'llm' | 'turn' | 'validation' | 'app';
		session_id: string | null;
		turn_run_id: string | null;
		error_message: string;
		severity: string | null;
		created_at: string;
	}>;
	tools: Array<{
		tool_name: string;
		gateway_op: string | null;
		count: number;
		failures: number;
		p95_execution_time_ms: number | null;
	}>;
	entities: Array<{
		project_id: string;
		project_name: string | null;
		entity_type: string;
		action: string;
		count: number;
	}>;
	entity_changes: Array<{
		session_id: string;
		project_id: string | null;
		project_name: string | null;
		entity_type: string;
		entity_id: string | null;
		entity_title: string | null;
		action: string;
		source: string | null;
		created_at: string;
	}>;
};

export type AdminChatRedactedTurn = {
	turn_run_id: string;
	session_id: string;
	turn_index: number;
	status: string;
	finished_reason: string | null;
	started_at: string;
	finished_at: string | null;
	duration_ms: number | null;
	ttfr_ms: number | null;
	ttfe_ms: number | null;
	tool_round_count: number;
	tool_call_count: number;
	tool_failure_count: number;
	validation_failure_count: number;
	llm_pass_count: number;
	first_lane: string | null;
	first_skill_path: string | null;
	first_canonical_op: string | null;
	cache_source: string | null;
	prepared_prompt_hit: boolean | null;
	error_summaries: Array<{
		source: 'message' | 'tool' | 'llm' | 'turn' | 'validation';
		message: string;
	}>;
	entity_changes: Array<{
		action: string;
		entity_type: string;
		entity_id: string;
		entity_title: string | null;
		project_id: string | null;
	}>;
};

export type AdminChatRedactedSessionTimelineEvent = {
	id: string;
	timestamp: string;
	type:
		| 'session'
		| 'turn'
		| 'timing'
		| 'tool'
		| 'llm'
		| 'entity_change'
		| 'error'
		| 'context_shift';
	severity: 'info' | 'success' | 'warning' | 'error';
	turn_index: number | null;
	title: string;
	summary: string;
};

export type AdminChatRedactedSessionResponse = {
	session: AdminChatSessionMetric;
	turns: AdminChatRedactedTurn[];
	timeline: AdminChatRedactedSessionTimelineEvent[];
	privacy: {
		raw_message_content_returned: false;
		raw_assistant_content_returned: false;
		raw_request_message_returned: false;
		raw_tool_arguments_returned: false;
		raw_tool_results_returned: false;
		prompt_snapshot_returned: false;
	};
};

export type AdminChatUserAnalyticsQuery = {
	timeframe: AdminChatUserAnalyticsTimeframe;
	page: number;
	limit: number;
	sort_by: AdminChatUserSortField;
	sort_order: 'asc' | 'desc';
	search: string;
	user_id: string | null;
	project_id: string | null;
	context_type: string;
	topic: string;
	slow_threshold_ms: number;
	errors: 'all' | 'only' | 'none';
	tool_bucket: 'all' | 'none' | 'some' | 'heavy';
	entity_action: 'all' | 'created' | 'updated' | 'deleted';
	classification: 'all' | 'classified' | 'missing' | 'stale';
};

export type AdminChatUserSortField =
	| 'last_activity_at'
	| 'session_count'
	| 'turn_count'
	| 'message_count'
	| 'user_message_count'
	| 'assistant_message_count'
	| 'tool_call_count'
	| 'tool_failure_count'
	| 'tool_failure_rate'
	| 'llm_failure_count'
	| 'validation_failure_count'
	| 'p95_ttfr_ms'
	| 'max_ttfr_ms'
	| 'slow_turn_count'
	| 'longest_session_turns'
	| 'longest_session_messages'
	| 'created_entity_count'
	| 'updated_entity_count'
	| 'total_tokens'
	| 'total_cost_usd';

export type AdminChatSessionSortField =
	| 'last_activity_at'
	| 'created_at'
	| 'turn_count'
	| 'message_count'
	| 'user_message_count'
	| 'assistant_message_count'
	| 'tool_call_count'
	| 'tool_failure_count'
	| 'llm_call_count'
	| 'llm_failure_count'
	| 'max_ttfr_ms'
	| 'p95_ttfr_ms'
	| 'duration_ms'
	| 'created_entity_count'
	| 'total_tokens'
	| 'total_cost_usd';

export type AdminChatUserDetailQuery = {
	timeframe: AdminChatUserAnalyticsTimeframe;
	session_page: number;
	session_limit: number;
	session_sort_by: AdminChatSessionSortField;
	session_sort_order: 'asc' | 'desc';
	search: string;
	slow_threshold_ms: number;
};

export type AdminChatRedactedSessionQuery = {
	slow_threshold_ms: number;
};

export type AdminChatUserSessionRow = {
	id: string;
	user_id?: string | null;
	title?: string | null;
	auto_title?: string | null;
	chat_topics?: string[] | null;
	context_type?: string | null;
	entity_id?: string | null;
	status?: string | null;
	message_count?: number | string | null;
	tool_call_count?: number | string | null;
	total_tokens_used?: number | string | null;
	created_at?: string | null;
	updated_at?: string | null;
	last_message_at?: string | null;
	last_classified_at?: string | null;
};

export type AdminChatUserRow = {
	id: string;
	email?: string | null;
	name?: string | null;
};

export type AdminChatSessionProjectRow = {
	chat_session_id?: string | null;
	project_id?: string | null;
};

export type AdminChatProjectRow = {
	id: string;
	name?: string | null;
};

export type AdminChatUserMessageRow = {
	id: string;
	session_id?: string | null;
	user_id?: string | null;
	role?: string | null;
	total_tokens?: number | string | null;
	error_code?: string | null;
	error_message?: string | null;
	created_at?: string | null;
};

export type AdminChatUserTurnRunRow = {
	id: string;
	session_id?: string | null;
	user_id?: string | null;
	status?: string | null;
	finished_reason?: string | null;
	context_type?: string | null;
	entity_id?: string | null;
	project_id?: string | null;
	tool_round_count?: number | string | null;
	tool_call_count?: number | string | null;
	validation_failure_count?: number | string | null;
	llm_pass_count?: number | string | null;
	first_lane?: string | null;
	first_skill_path?: string | null;
	first_canonical_op?: string | null;
	first_help_path?: string | null;
	cache_source?: string | null;
	prepared_prompt_hit?: boolean | null;
	started_at?: string | null;
	finished_at?: string | null;
	created_at?: string | null;
};

export type AdminChatUserTimingRow = {
	id: string;
	session_id?: string | null;
	turn_run_id?: string | null;
	user_id?: string | null;
	context_type?: string | null;
	time_to_first_response_ms?: number | string | null;
	time_to_first_event_ms?: number | string | null;
	created_at?: string | null;
};

export type AdminChatUserToolExecutionRow = {
	id: string;
	session_id?: string | null;
	turn_run_id?: string | null;
	tool_name?: string | null;
	tool_category?: string | null;
	gateway_op?: string | null;
	help_path?: string | null;
	success?: boolean | null;
	execution_time_ms?: number | string | null;
	tokens_consumed?: number | string | null;
	result_count?: number | string | null;
	zero_result?: boolean | null;
	error_message?: string | null;
	affected_entities?: unknown;
	created_at?: string | null;
};

export type AdminChatUserUsageRow = {
	id: string;
	user_id?: string | null;
	chat_session_id?: string | null;
	turn_run_id?: string | null;
	model_requested?: string | null;
	model_used?: string | null;
	provider?: string | null;
	profile?: string | null;
	prompt_tokens?: number | string | null;
	completion_tokens?: number | string | null;
	total_tokens?: number | string | null;
	input_cost_usd?: number | string | null;
	output_cost_usd?: number | string | null;
	total_cost_usd?: number | string | null;
	openrouter_usage_cost_usd?: number | string | null;
	response_time_ms?: number | string | null;
	status?: string | null;
	error_message?: string | null;
	openrouter_cache_status?: string | null;
	created_at?: string | null;
};

export type AdminChatUserProjectLogRow = {
	id: string;
	chat_session_id?: string | null;
	project_id?: string | null;
	entity_type?: string | null;
	entity_id?: string | null;
	action?: string | null;
	change_source?: string | null;
	changed_by?: string | null;
	created_at?: string | null;
};

export type AdminChatUserAppErrorRow = {
	id: string;
	user_id?: string | null;
	error_message?: string | null;
	error_type?: string | null;
	severity?: string | null;
	endpoint?: string | null;
	record_id?: string | null;
	project_id?: string | null;
	created_at?: string | null;
};

export type AdminChatClassificationJobRow = {
	id: string;
	queue_job_id?: string | null;
	metadata?: unknown;
	status?: string | null;
	error_message?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
	started_at?: string | null;
	completed_at?: string | null;
};

export type BuildAdminChatUserAnalyticsInput = {
	sessions: AdminChatUserSessionRow[];
	users: AdminChatUserRow[];
	sessionProjects: AdminChatSessionProjectRow[];
	projects: AdminChatProjectRow[];
	messages: AdminChatUserMessageRow[];
	turnRuns: AdminChatUserTurnRunRow[];
	timingRows: AdminChatUserTimingRow[];
	toolExecutions: AdminChatUserToolExecutionRow[];
	usageRows: AdminChatUserUsageRow[];
	projectLogs: AdminChatUserProjectLogRow[];
	appErrors: AdminChatUserAppErrorRow[];
	classificationJobs?: AdminChatClassificationJobRow[];
	truncated?: Record<string, boolean>;
};
