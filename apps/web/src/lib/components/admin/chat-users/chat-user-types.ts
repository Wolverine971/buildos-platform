// apps/web/src/lib/components/admin/chat-users/chat-user-types.ts
export type Timeframe = '24h' | '7d' | '30d' | '90d';
export type SortOrder = 'asc' | 'desc';
export type ErrorFilter = 'all' | 'only' | 'none';
export type ToolBucketFilter = 'all' | 'none' | 'some' | 'heavy';
export type ClassificationFilter = 'all' | 'classified' | 'missing' | 'stale';
export type EntityActionFilter = 'all' | 'created' | 'updated' | 'deleted';

export type SortField =
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
	| 'created_entity_count'
	| 'updated_entity_count'
	| 'total_tokens'
	| 'total_cost_usd';

export type UserMetric = {
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

export type ClassificationJobSummary = {
	job_id: string;
	queue_job_id: string | null;
	status: string;
	error_message: string | null;
	queued_at: string | null;
	started_at: string | null;
	completed_at: string | null;
	updated_at: string | null;
};

export type SessionMetric = {
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
	classification_job: ClassificationJobSummary | null;
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

export type UsersResponse = {
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
		most_sessions: UserMetric[];
		slowest_first_responses: UserMetric[];
		most_tool_calls: UserMetric[];
		longest_threads: SessionMetric[];
		most_requests_responses: UserMetric[];
		most_created_entities: UserMetric[];
		most_error_impacted: UserMetric[];
	};
	users: UserMetric[];
	pagination: { page: number; limit: number; total: number; total_pages: number };
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

export type UserDetail = {
	user: { id: string; email: string; name: string | null };
	summary: UserMetric;
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
	sessions: SessionMetric[];
	errors: Array<{
		source: string;
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

export type RedactedTurn = {
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

export type RedactedTimelineEvent = {
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

export type RedactedSession = {
	session: SessionMetric;
	turns: RedactedTurn[];
	timeline: RedactedTimelineEvent[];
	privacy: {
		raw_message_content_returned: false;
		raw_assistant_content_returned: false;
		raw_request_message_returned: false;
		raw_tool_arguments_returned: false;
		raw_tool_results_returned: false;
		prompt_snapshot_returned: false;
	};
};

export type ComparisonTone = 'neutral' | 'good' | 'warning' | 'bad';
export type ComparisonPreference = 'neutral' | 'lower' | 'higher';

export type ComparisonMetric = {
	label: string;
	user_value: string;
	cohort_value: string;
	delta: string;
	tone: ComparisonTone;
	description: string;
};

export type AlertBadge = {
	label: string;
	tone: Exclude<ComparisonTone, 'good'>;
	title: string;
};

export type IssueCluster = {
	key: string;
	source: string;
	message: string;
	severity: string | null;
	count: number;
	latest_at: string;
	session_id: string | null;
};
