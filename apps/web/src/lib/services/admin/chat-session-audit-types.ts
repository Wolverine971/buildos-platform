// apps/web/src/lib/services/admin/chat-session-audit-types.ts
export type AuditRecord = Record<string, unknown>;

export type AuditTimelineType =
	| 'session'
	| 'message'
	| 'tool_execution'
	| 'llm_call'
	| 'operation'
	| 'context_shift'
	| 'timing'
	| 'turn_run'
	| 'prompt_snapshot'
	| 'turn_event'
	| 'eval_run';

export type AuditTimelineSeverity = 'info' | 'success' | 'warning' | 'error';

export interface AuditTimelineEvent {
	id: string;
	timestamp: string;
	type: AuditTimelineType;
	severity: AuditTimelineSeverity;
	title: string;
	summary: string;
	turn_index: number | null;
	payload: AuditRecord;
}

export interface AuditPromptEvalRun {
	id: string;
	scenario_slug: string;
	scenario_version: string;
	runner_type: string;
	status: string;
	summary: AuditRecord;
	started_at: string;
	completed_at: string | null;
	created_by: string | null;
	assertions: AuditRecord[];
}

export interface AuditTurnRun {
	id: string;
	turn_index: number;
	stream_run_id: string | null;
	client_turn_id: string | null;
	status: string;
	finished_reason: string | null;
	context_type: string;
	entity_id: string | null;
	project_id: string | null;
	gateway_enabled: boolean;
	request_message: string;
	user_message_id: string | null;
	assistant_message_id: string | null;
	tool_round_count: number;
	tool_call_count: number;
	validation_failure_count: number;
	llm_pass_count: number;
	first_lane: string | null;
	first_help_path: string | null;
	first_skill_path: string | null;
	first_canonical_op: string | null;
	history_strategy: string | null;
	history_compressed: boolean | null;
	raw_history_count: number;
	history_for_model_count: number;
	cache_source: string | null;
	cache_age_seconds: number;
	request_prewarmed_context: boolean;
	started_at: string;
	finished_at: string | null;
	prompt_snapshot: AuditRecord | null;
	events: AuditRecord[];
	eval_runs: AuditPromptEvalRun[];
}

export interface ChatSessionAuditPayload {
	session: {
		id: string;
		title: string;
		user: { id: string; email: string; name: string };
		context_type: string;
		context_id: string | null;
		status: string;
		message_count: number;
		total_tokens: number;
		tool_call_count: number;
		llm_call_count: number;
		cost_estimate: number;
		has_errors: boolean;
		created_at: string;
		updated_at: string;
		last_message_at: string | null;
		agent_metadata: AuditRecord;
		extracted_entities: unknown;
	};
	metrics: {
		total_tokens: number;
		total_cost_usd: number;
		tool_calls: number;
		tool_failures: number;
		llm_calls: number;
		llm_failures: number;
		messages: number;
	};
	messages: AuditRecord[];
	tool_executions: AuditRecord[];
	llm_calls: AuditRecord[];
	operations: AuditRecord[];
	timeline: AuditTimelineEvent[];
	timing_metrics: AuditRecord | null;
	turn_runs: AuditTurnRun[];
}

export type SessionListItem = {
	id: string;
	title: string;
	user: { id: string; email: string; name: string };
	status: string;
	context_type: string;
	entity_id: string | null;
	message_count: number;
	total_tokens: number;
	tool_call_count: number;
	llm_call_count: number;
	tool_failure_count: number;
	cost_estimate: number;
	has_errors: boolean;
	has_agent_state: boolean;
	has_context_shift: boolean;
	has_libri_extraction: boolean;
	libri_candidate_count: number;
	libri_handoff_status: string | null;
	libri_handoff_result_count: number;
	last_tool_at: string | null;
	created_at: string;
	updated_at: string;
	last_message_at: string | null;
};

export type PromptEvalScenario = {
	slug: string;
	version: string;
	title: string;
	description: string;
	category: string;
	replayRequest?: {
		message: string;
		contextType?: string;
		entityId?: string | null;
	};
};

export type SessionTurnRun = ChatSessionAuditPayload['turn_runs'][number];
export type TimelineGroupKind = 'standalone' | 'turn';
export type TimelineGroupCounts = {
	total: number;
	messages: number;
	promptSnapshots: number;
	llmCalls: number;
	toolExecutions: number;
	turnEvents: number;
	operations: number;
	evalRuns: number;
	errors: number;
};

export type TimelineGroup = {
	id: string;
	kind: TimelineGroupKind;
	title: string;
	summary: string;
	timestamp: string;
	severity: AuditTimelineSeverity;
	turnIndex: number | null;
	run: SessionTurnRun | null;
	items: AuditTimelineEvent[];
	counts: TimelineGroupCounts;
};

export type ToolLifecycleDisplayState = {
	outcomeEvent: AuditTimelineEvent | null;
	hideEvent: boolean;
	displayPayload: Record<string, unknown>;
	displayRawPayload: Record<string, unknown>;
	displayTitle: string;
	displaySummary: string;
	displaySeverity: AuditTimelineSeverity;
	displayTimestamp: string;
	displayBadgeLabel: string;
	displayIconType: AuditTimelineType;
	displayEventId: string;
};

export type ConversationMessageRole = 'user' | 'assistant' | 'tool' | 'system' | 'other';
export type ConversationMessage = {
	id: string;
	role: ConversationMessageRole;
	roleLabel: string;
	content: string;
	timestamp: string;
	turnIndex: number | null;
	totalTokens: number;
	errorMessage: string;
};

export type ConversationToolCall = {
	id: string;
	toolName: string;
	title: string;
	summary: string;
	statusLabel: string;
	success: boolean | null;
	severity: AuditTimelineSeverity;
	sourceLabel: string;
	timestamp: string;
	completedAt: string | null;
	duration: unknown;
	toolCallId: string;
	canonicalOp: string;
	resultSource: string;
	arguments: unknown;
	result: unknown;
	error: string;
	metadata: Record<string, unknown>;
	linkedToolExecution: Record<string, unknown> | null;
	linkedToolMessage: Record<string, unknown> | null;
	rawPayload: Record<string, unknown>;
	qualityRank: number;
};

export type ConversationTurn = {
	id: string;
	turnIndex: number | null;
	run: SessionTurnRun | null;
	userMessages: ConversationMessage[];
	assistantMessages: ConversationMessage[];
	otherMessages: ConversationMessage[];
	toolCalls: ConversationToolCall[];
	llmCalls: AuditTimelineEvent[];
	promptSnapshots: AuditTimelineEvent[];
	operations: AuditTimelineEvent[];
	evalRuns: AuditTimelineEvent[];
	supervisorEvents: AuditTimelineEvent[];
	auditEvents: AuditTimelineEvent[];
	startedAt: string;
	finishedAt: string | null;
	status: string;
	errors: number;
};

export type LibriCandidateDisplay = {
	entityType: string;
	displayName: string;
	canonicalQuery: string;
	action: string;
	relevance: string;
	confidence: number | null;
	youtubeVideoId: string;
	authors: string[];
	sourceTurns: number[];
	evidenceSnippets: string[];
};

export type LibriHandoffResultDisplay = {
	entityType: string;
	canonicalQuery: string;
	status: string;
	resourceKey: string;
	jobId: string;
	message: string;
};

export type LibriExtractionDisplay = {
	candidates: LibriCandidateDisplay[];
	ignoredCount: number;
	extractedAt: string;
	version: string;
};

export type LibriHandoffDisplay = {
	status: string;
	attemptedAt: string;
	idempotencyKey: string;
	message: string;
	httpStatus: string;
	results: LibriHandoffResultDisplay[];
	raw: Record<string, unknown>;
};
