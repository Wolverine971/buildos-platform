type AuditRecord = Record<string, unknown>;

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

const stringOrDash = (value: unknown): string => {
	if (value === null || value === undefined) return '-';
	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : '-';
	}
	return String(value);
};

const boolLabel = (value: unknown): string => {
	if (value === true) return 'yes';
	if (value === false) return 'no';
	return '-';
};

const toJson = (value: unknown): string => {
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
};

const sanitizeFilenamePart = (value: string): string =>
	value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48) || 'session';

const codeFence = (content: string, language = ''): string => {
	const matches = content.match(/`+/g) ?? [];
	const maxBackticks = matches.reduce((max, chunk) => Math.max(max, chunk.length), 0);
	const fence = '`'.repeat(Math.max(3, maxBackticks + 1));
	return `${fence}${language}\n${content}\n${fence}`;
};

const rawSection = (heading: string, value: unknown, language = 'json'): string[] => {
	if (value === null || value === undefined) return [];
	if (typeof value === 'string') {
		if (!value.trim()) return [];
		return [`#### ${heading}`, '', codeFence(value, language), ''];
	}
	return [`#### ${heading}`, '', codeFence(toJson(value), language), ''];
};

const metricLine = (label: string, value: unknown): string => `- ${label}: ${stringOrDash(value)}`;

const buildConversationSection = (messages: AuditRecord[]): string[] => {
	const lines = ['## Conversation Transcript', ''];
	if (messages.length === 0) {
		lines.push('_No messages recorded._', '');
		return lines;
	}

	messages.forEach((message, index) => {
		lines.push(
			`### ${index + 1}. ${stringOrDash(message.role).toUpperCase()} · ${stringOrDash(message.created_at)}`,
			'',
			metricLine('Message ID', message.id),
			metricLine('Type', message.message_type),
			metricLine('Tool Name', message.tool_name),
			metricLine('Tool Call ID', message.tool_call_id),
			metricLine('Tokens', message.total_tokens),
			metricLine('Prompt Tokens', message.prompt_tokens),
			metricLine('Completion Tokens', message.completion_tokens),
			metricLine('Error', message.error_message),
			''
		);
		const content =
			typeof message.content === 'string' && message.content.trim()
				? message.content
				: '(empty message)';
		lines.push('#### Content', '', codeFence(content, 'text'), '');
		lines.push(...rawSection('Raw Message', message));
	});

	return lines;
};

const buildTimelineSection = (timeline: AuditTimelineEvent[]): string[] => {
	const lines = ['## Ordered Timeline', ''];
	if (timeline.length === 0) {
		lines.push('_No timeline events recorded._', '');
		return lines;
	}

	timeline.forEach((event, index) => {
		lines.push(
			`### ${index + 1}. ${event.timestamp} · ${event.title}`,
			'',
			metricLine('Event ID', event.id),
			metricLine('Type', event.type),
			metricLine('Severity', event.severity),
			metricLine('Turn', event.turn_index),
			metricLine('Summary', event.summary),
			''
		);
		lines.push(...rawSection('Payload', event.payload));
	});

	return lines;
};

const buildTurnRunsSection = (turnRuns: AuditTurnRun[]): string[] => {
	const lines = ['## Turn Runs', ''];
	if (turnRuns.length === 0) {
		lines.push('_No turn runs recorded._', '');
		return lines;
	}

	turnRuns.forEach((turnRun) => {
		lines.push(
			`### Turn ${turnRun.turn_index} · ${turnRun.status}`,
			'',
			metricLine('Turn Run ID', turnRun.id),
			metricLine('Started', turnRun.started_at),
			metricLine('Finished', turnRun.finished_at),
			metricLine('Finished Reason', turnRun.finished_reason),
			metricLine('Context', turnRun.context_type),
			metricLine('Context ID', turnRun.entity_id),
			metricLine('Project ID', turnRun.project_id),
			metricLine('Gateway Enabled', boolLabel(turnRun.gateway_enabled)),
			metricLine('Tool Rounds', turnRun.tool_round_count),
			metricLine('Tool Calls', turnRun.tool_call_count),
			metricLine('Validation Failures', turnRun.validation_failure_count),
			metricLine('LLM Passes', turnRun.llm_pass_count),
			metricLine('First Lane', turnRun.first_lane),
			metricLine('First Help Path', turnRun.first_help_path),
			metricLine('First Skill Path', turnRun.first_skill_path),
			metricLine('First Canonical Op', turnRun.first_canonical_op),
			metricLine('History Strategy', turnRun.history_strategy),
			metricLine('History Compressed', boolLabel(turnRun.history_compressed)),
			metricLine('Raw History Count', turnRun.raw_history_count),
			metricLine('History For Model Count', turnRun.history_for_model_count),
			metricLine('Cache Source', turnRun.cache_source),
			metricLine('Cache Age Seconds', turnRun.cache_age_seconds),
			metricLine('Prewarmed Context', boolLabel(turnRun.request_prewarmed_context)),
			''
		);

		lines.push(
			'#### Request Message',
			'',
			codeFence(turnRun.request_message || '(empty request)', 'text'),
			''
		);
		lines.push(...rawSection('Prompt Snapshot', turnRun.prompt_snapshot));
		lines.push(...rawSection('Turn Events', turnRun.events));
		lines.push(...rawSection('Prompt Evals', turnRun.eval_runs));
	});

	return lines;
};

const buildRawCollectionsSection = (payload: ChatSessionAuditPayload): string[] => {
	const lines = ['## Raw Collections', ''];
	lines.push(...rawSection('Tool Executions', payload.tool_executions));
	lines.push(...rawSection('LLM Calls', payload.llm_calls));
	lines.push(...rawSection('Operations', payload.operations));
	lines.push(...rawSection('Timing Metrics', payload.timing_metrics));
	lines.push(...rawSection('Agent Metadata', payload.session.agent_metadata));
	return lines;
};

export const buildChatSessionAuditFilename = (payload: ChatSessionAuditPayload): string => {
	const safeTitle = sanitizeFilenamePart(payload.session.title);
	const safeId = sanitizeFilenamePart(payload.session.id).slice(0, 16);
	const date = new Date().toISOString().slice(0, 10);
	return `chat-session-audit-${safeTitle}-${safeId}-${date}.md`;
};

export const buildChatSessionAuditMarkdown = (payload: ChatSessionAuditPayload): string => {
	const lines: string[] = [
		`# Chat Session Audit: ${payload.session.title}`,
		'',
		metricLine('Exported At', new Date().toISOString()),
		metricLine('Session ID', payload.session.id),
		metricLine('User ID', payload.session.user.id),
		metricLine('User Email', payload.session.user.email),
		metricLine('User Name', payload.session.user.name),
		metricLine('Context Type', payload.session.context_type),
		metricLine('Context ID', payload.session.context_id),
		metricLine('Status', payload.session.status),
		metricLine('Has Errors', boolLabel(payload.session.has_errors)),
		metricLine('Created At', payload.session.created_at),
		metricLine('Updated At', payload.session.updated_at),
		metricLine('Last Message At', payload.session.last_message_at),
		'',
		'## Summary',
		'',
		metricLine('Messages', payload.metrics.messages),
		metricLine('Tool Calls', payload.metrics.tool_calls),
		metricLine('Tool Failures', payload.metrics.tool_failures),
		metricLine('LLM Calls', payload.metrics.llm_calls),
		metricLine('LLM Failures', payload.metrics.llm_failures),
		metricLine('Turns', payload.turn_runs.length),
		metricLine('Timeline Events', payload.timeline.length),
		metricLine('Tokens', payload.metrics.total_tokens),
		metricLine('Cost (USD)', payload.metrics.total_cost_usd),
		''
	];

	lines.push(...buildConversationSection(payload.messages));
	lines.push(...buildTimelineSection(payload.timeline));
	lines.push(...buildTurnRunsSection(payload.turn_runs));
	lines.push(...buildRawCollectionsSection(payload));

	return lines.join('\n').trimEnd() + '\n';
};

export const downloadChatSessionAuditMarkdown = (payload: ChatSessionAuditPayload): string => {
	const markdown = buildChatSessionAuditMarkdown(payload);
	const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = buildChatSessionAuditFilename(payload);
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
	return markdown;
};
