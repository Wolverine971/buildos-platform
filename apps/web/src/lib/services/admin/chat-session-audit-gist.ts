// apps/web/src/lib/services/admin/chat-session-audit-gist.ts
//
// Derives a high-level, human/agent-readable gist from a raw session audit
// payload and provides the compact markdown builders shared by both the
// single-file export and the bundle export. The goal is progressive
// disclosure: a reader (human or agent) should learn what happened from a few
// lines at the top before ever touching the raw JSON.
import type {
	AuditRecord,
	AuditTimelineEvent,
	ChatSessionAuditPayload
} from './chat-session-audit-types';

// ---------------------------------------------------------------------------
// Safe field accessors (payload records are loosely typed AuditRecord maps)
// ---------------------------------------------------------------------------

const asString = (value: unknown): string | null => {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const asNumber = (value: unknown): number | null => {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
};

const asRecord = (value: unknown): AuditRecord | null =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as AuditRecord) : null;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

// ---------------------------------------------------------------------------
// Shared markdown helpers (exported for the export + bundle builders)
// ---------------------------------------------------------------------------

export const stringOrDash = (value: unknown): string => {
	if (value === null || value === undefined) return '-';
	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : '-';
	}
	return String(value);
};

export const boolLabel = (value: unknown): string => {
	if (value === true) return 'yes';
	if (value === false) return 'no';
	return '-';
};

export const toJson = (value: unknown): string => {
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
};

export const toCompactJson = (value: unknown): string => {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
};

export const metricLine = (label: string, value: unknown): string =>
	`- ${label}: ${stringOrDash(value)}`;

/** Dynamically sized fence so embedded backticks never break the block. */
export const codeFence = (content: string, language = ''): string => {
	const matches = content.match(/`+/g) ?? [];
	const maxBackticks = matches.reduce((max, chunk) => Math.max(max, chunk.length), 0);
	const fence = '`'.repeat(Math.max(3, maxBackticks + 1));
	return `${fence}${language}\n${content}\n${fence}`;
};

/** Escape a value for use inside a single markdown table cell. */
export const tableCell = (value: unknown, maxLength = 80): string => {
	let text: string;
	if (value === null || value === undefined) {
		text = '-';
	} else if (typeof value === 'string') {
		text = value;
	} else {
		text = toCompactJson(value);
	}
	text = text
		.replace(/\r?\n+/g, ' ')
		.replace(/\|/g, '\\|')
		.trim();
	if (!text) text = '-';
	if (text.length > maxLength) text = `${text.slice(0, maxLength - 1)}…`;
	return text;
};

const truncate = (value: string, maxLength: number): string =>
	value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;

// ---------------------------------------------------------------------------
// Gist derivation
// ---------------------------------------------------------------------------

export type AuditOutcome = 'completed' | 'errored' | 'incomplete' | 'empty';

export interface AuditGist {
	outcome: AuditOutcome;
	/** Short uppercase label, e.g. "FAILED — safety limit", "COMPLETED". */
	outcomeLabel: string;
	/** One-line headline summary. */
	headline: string;
	/** Multi-line narrative (one entry per line). */
	narrative: string[];
	/** Notable diagnostic flags worth surfacing at the top. */
	flags: string[];
	toolNames: string[];
	firstUserMessage: string | null;
	finalAssistantMessage: string | null;
}

const FAILURE_PHRASE =
	/(safety|rate)\s+limit|something went wrong|please (try again|break (the|your) request)|i (couldn't|could not|was unable|ran into)|hit a (safety|rate|tool|limit)/i;

const messageRole = (message: AuditRecord): string => asString(message.role) ?? 'other';
const messageContent = (message: AuditRecord): string | null => asString(message.content);

/** llm_passes live on the assistant message metadata. */
const messageLlmPasses = (message: AuditRecord): AuditRecord[] => {
	const metadata = asRecord(message.metadata);
	if (!metadata) return [];
	return asArray(metadata.llm_passes)
		.map(asRecord)
		.filter((p): p is AuditRecord => p !== null);
};

const collectToolNames = (payload: ChatSessionAuditPayload): string[] => {
	const names = new Set<string>();
	for (const exec of payload.tool_executions) {
		const name = asString(exec.tool_name);
		if (name) names.add(name);
	}
	if (names.size === 0) {
		for (const event of payload.timeline) {
			if (event.type !== 'tool_execution') continue;
			const name = asString(event.payload?.tool_name) ?? asString(event.title);
			if (name) names.add(name);
		}
	}
	return Array.from(names);
};

const sumField = (records: AuditRecord[], field: string): number =>
	records.reduce((total, record) => total + (asNumber(record[field]) ?? 0), 0);

const maxField = (records: AuditRecord[], field: string): number =>
	records.reduce((max, record) => Math.max(max, asNumber(record[field]) ?? 0), 0);

export const deriveAuditGist = (payload: ChatSessionAuditPayload): AuditGist => {
	const messages = payload.messages;
	const turnRuns = payload.turn_runs as unknown as AuditRecord[];

	const firstUser = messages.find((m) => messageRole(m) === 'user');
	const assistantMessages = messages.filter((m) => messageRole(m) === 'assistant');
	const finalAssistant = [...assistantMessages].reverse().find((m) => messageContent(m) !== null);

	const firstUserMessage = firstUser ? messageContent(firstUser) : null;
	const finalAssistantMessage = finalAssistant ? messageContent(finalAssistant) : null;

	const toolNames = collectToolNames(payload);

	// Aggregate signals across turn runs + assistant message metadata.
	const forcedPasses = assistantMessages.reduce(
		(total, message) =>
			total +
			messageLlmPasses(message).filter((p) => p.forced_no_tool_synthesis === true).length,
		0
	);
	const validationFailures = sumField(turnRuns, 'validation_failure_count');
	const maxLlmPasses = maxField(turnRuns, 'llm_pass_count');
	const lastTurn = turnRuns.length > 0 ? turnRuns[turnRuns.length - 1] : null;
	const lastFinishedReason = lastTurn ? asString(lastTurn.finished_reason) : null;
	const hasContextShift = asRecord(payload.session.agent_metadata)?.fastchat_last_context_shift
		? true
		: false;

	// ---- Outcome classification --------------------------------------------
	const hasFailurePhrase = finalAssistantMessage
		? FAILURE_PHRASE.test(finalAssistantMessage)
		: false;
	const toolFailures = payload.metrics.tool_failures ?? 0;
	const llmFailures = payload.metrics.llm_failures ?? 0;

	let outcome: AuditOutcome;
	let reason: string | null = null;

	if (messages.length === 0) {
		outcome = 'empty';
	} else if (
		payload.session.has_errors ||
		hasFailurePhrase ||
		toolFailures > 0 ||
		llmFailures > 0
	) {
		outcome = 'errored';
		if (hasFailurePhrase && /(safety|rate)\s+limit/i.test(finalAssistantMessage ?? '')) {
			reason = 'safety limit';
		} else if (toolFailures > 0) {
			reason = `${toolFailures} tool failure${toolFailures === 1 ? '' : 's'}`;
		} else if (llmFailures > 0) {
			reason = `${llmFailures} LLM failure${llmFailures === 1 ? '' : 's'}`;
		} else if (hasFailurePhrase) {
			reason = 'agent reported a problem';
		} else {
			reason = 'session flagged errors';
		}
	} else if (!finalAssistantMessage) {
		outcome = 'incomplete';
		reason = 'no assistant reply recorded';
	} else if (lastFinishedReason === 'tool_calls') {
		// Natural stop is `stop`; ending on `tool_calls` means it ran out of
		// rounds mid-tool-loop without synthesizing a final answer.
		outcome = 'incomplete';
		reason = 'ended mid tool-loop (finished_reason=tool_calls)';
	} else {
		outcome = 'completed';
	}

	const outcomeLabel = (() => {
		switch (outcome) {
			case 'completed':
				return 'COMPLETED';
			case 'errored':
				return reason ? `FAILED — ${reason}` : 'FAILED';
			case 'incomplete':
				return reason ? `INCOMPLETE — ${reason}` : 'INCOMPLETE';
			case 'empty':
				return 'EMPTY (no messages)';
		}
	})();

	// ---- Flags --------------------------------------------------------------
	const flags: string[] = [];
	if (forcedPasses > 0) flags.push(`forced synthesis ×${forcedPasses}`);
	if (validationFailures > 0)
		flags.push(
			`${validationFailures} validation failure${validationFailures === 1 ? '' : 's'}`
		);
	if (toolFailures > 0)
		flags.push(`${toolFailures} tool failure${toolFailures === 1 ? '' : 's'}`);
	if (llmFailures > 0) flags.push(`${llmFailures} LLM failure${llmFailures === 1 ? '' : 's'}`);
	if (maxLlmPasses >= 5) flags.push(`high LLM pass count (${maxLlmPasses})`);
	if (lastFinishedReason === 'tool_calls') flags.push('finished_reason=tool_calls');
	if (hasContextShift) flags.push('context shift mid-session');

	// ---- Narrative ----------------------------------------------------------
	const narrative: string[] = [];
	if (firstUserMessage) {
		narrative.push(`**Ask:** ${truncate(firstUserMessage.replace(/\s+/g, ' '), 280)}`);
	}

	const toolPart =
		toolNames.length > 0
			? `${payload.metrics.tool_calls} tool call${payload.metrics.tool_calls === 1 ? '' : 's'} (${truncate(toolNames.join(', '), 160)})`
			: 'no tool calls';
	const turnCount = payload.turn_runs.length;
	const passPart = `${payload.metrics.llm_calls} LLM call${payload.metrics.llm_calls === 1 ? '' : 's'}`;
	narrative.push(
		`**Activity:** ${toolPart} across ${passPart} over ${turnCount} turn${turnCount === 1 ? '' : 's'}.`
	);

	if (finalAssistantMessage) {
		const label = outcome === 'completed' ? 'Final reply' : 'Ended with';
		narrative.push(
			`**${label}:** ${truncate(finalAssistantMessage.replace(/\s+/g, ' '), 280)}`
		);
	} else if (outcome !== 'empty') {
		narrative.push('**Final reply:** _(none recorded)_');
	}

	const headline = (() => {
		const askSnippet = firstUserMessage
			? truncate(firstUserMessage.replace(/\s+/g, ' '), 100)
			: payload.session.title;
		return `${outcomeLabel} · "${askSnippet}"`;
	})();

	return {
		outcome,
		outcomeLabel,
		headline,
		narrative,
		flags,
		toolNames,
		firstUserMessage,
		finalAssistantMessage
	};
};

// ---------------------------------------------------------------------------
// Shared section builders (compose into both export shapes)
// ---------------------------------------------------------------------------

export const buildGistSection = (gist: AuditGist): string[] => {
	const lines = ['## TL;DR', '', `**Outcome:** ${gist.outcomeLabel}`, ''];
	lines.push(...gist.narrative.map((line) => `- ${line}`));
	if (gist.flags.length > 0) {
		lines.push('', `**Flags:** ${gist.flags.join(' · ')}`);
	}
	lines.push('');
	return lines;
};

export const buildConversationSection = (payload: ChatSessionAuditPayload): string[] => {
	const lines = ['## Conversation', ''];
	if (payload.messages.length === 0) {
		lines.push('_No messages recorded._', '');
		return lines;
	}

	// Skip tool-result messages in the readable transcript — they are captured
	// in the Tool Calls table and the raw appendix.
	const conversational = payload.messages.filter((message) => {
		const role = messageRole(message);
		return role === 'user' || role === 'assistant' || role === 'system';
	});

	conversational.forEach((message, index) => {
		const role = messageRole(message).toUpperCase();
		const timestamp = stringOrDash(message.created_at);
		const tokens = asNumber(message.total_tokens);
		const suffix = tokens !== null ? ` · ${tokens} tok` : '';
		lines.push(`### ${index + 1}. ${role} · ${timestamp}${suffix}`, '');
		const error = asString(message.error_message);
		if (error) lines.push(`> ⚠️ ${error}`, '');
		const content = messageContent(message) ?? '(empty message)';
		lines.push(codeFence(content, 'text'), '');
	});

	return lines;
};

export const buildToolCallSection = (payload: ChatSessionAuditPayload): string[] => {
	const lines = [`## Tool Calls (${payload.tool_executions.length})`, ''];
	if (payload.tool_executions.length === 0) {
		lines.push('_No tool calls recorded._', '');
		return lines;
	}

	lines.push(
		'| # | Tool | Op | Status | Duration | Result preview |',
		'| --- | --- | --- | --- | --- | --- |'
	);
	const ordered = [...payload.tool_executions].sort((a, b) => {
		const sa = asNumber(a.sequence_index) ?? 0;
		const sb = asNumber(b.sequence_index) ?? 0;
		return sa - sb;
	});
	ordered.forEach((exec, index) => {
		const seq = asNumber(exec.sequence_index) ?? index + 1;
		const name = tableCell(exec.tool_name, 36);
		const op = tableCell(exec.gateway_op, 30);
		const success = exec.success;
		const status = success === true ? '✅ ok' : success === false ? '❌ fail' : '–';
		const durationMs = asNumber(exec.execution_time_ms);
		const duration = durationMs !== null ? `${durationMs} ms` : '-';
		const resultPreview = tableCell(exec.result ?? exec.error ?? '-', 80);
		lines.push(`| ${seq} | ${name} | ${op} | ${status} | ${duration} | ${resultPreview} |`);
	});
	lines.push('');
	return lines;
};

export const buildLlmCallSection = (payload: ChatSessionAuditPayload): string[] => {
	const lines = [`## LLM Calls (${payload.llm_calls.length})`, ''];
	if (payload.llm_calls.length === 0) {
		lines.push('_No LLM calls recorded._', '');
		return lines;
	}

	lines.push(
		'| # | Model | Provider | Prompt | Completion | Total | Status | ms |',
		'| --- | --- | --- | --- | --- | --- | --- | --- |'
	);
	payload.llm_calls.forEach((call, index) => {
		const model = tableCell(call.model_used ?? call.model_requested, 40);
		const provider = tableCell(call.provider, 16);
		const prompt = stringOrDash(asNumber(call.prompt_tokens));
		const completion = stringOrDash(asNumber(call.completion_tokens));
		const total = stringOrDash(asNumber(call.total_tokens));
		const status = tableCell(call.status, 12);
		const ms = stringOrDash(asNumber(call.response_time_ms));
		lines.push(
			`| ${index + 1} | ${model} | ${provider} | ${prompt} | ${completion} | ${total} | ${status} | ${ms} |`
		);
	});
	lines.push('');
	return lines;
};

const timelineTypeLabel = (type: AuditTimelineEvent['type']): string => type.replace(/_/g, ' ');

export const buildTimelineSection = (payload: ChatSessionAuditPayload): string[] => {
	const lines = [`## Timeline (${payload.timeline.length} events)`, ''];
	if (payload.timeline.length === 0) {
		lines.push('_No timeline events recorded._', '');
		return lines;
	}

	lines.push(
		'| # | Time | Turn | Type | Event | Severity |',
		'| --- | --- | --- | --- | --- | --- |'
	);
	payload.timeline.forEach((event, index) => {
		const time = tableCell(event.timestamp, 32);
		const turn = event.turn_index === null ? '-' : String(event.turn_index);
		const type = tableCell(timelineTypeLabel(event.type), 16);
		const title = tableCell(event.summary || event.title, 90);
		const severity = event.severity === 'info' ? '' : event.severity;
		lines.push(`| ${index + 1} | ${time} | ${turn} | ${type} | ${title} | ${severity} |`);
	});
	lines.push('');
	return lines;
};

export const buildTurnSummarySection = (payload: ChatSessionAuditPayload): string[] => {
	const lines = [`## Turns (${payload.turn_runs.length})`, ''];
	if (payload.turn_runs.length === 0) {
		lines.push('_No turn runs recorded._', '');
		return lines;
	}

	payload.turn_runs.forEach((run) => {
		const variant =
			asString(run.prompt_snapshot?.prompt_variant) ??
			asString(run.prompt_snapshot?.snapshot_version) ??
			'-';
		lines.push(
			`### Turn ${run.turn_index} · ${run.status}`,
			'',
			metricLine('Finished reason', run.finished_reason),
			metricLine('First lane', run.first_lane),
			metricLine('First canonical op', run.first_canonical_op),
			metricLine('Tool rounds / calls', `${run.tool_round_count} / ${run.tool_call_count}`),
			metricLine('LLM passes', run.llm_pass_count),
			metricLine('Validation failures', run.validation_failure_count),
			metricLine('Prompt variant', variant),
			metricLine('Started', run.started_at),
			metricLine('Finished', run.finished_at),
			''
		);
	});
	return lines;
};

export const buildDiagnosticsSection = (
	payload: ChatSessionAuditPayload,
	gist: AuditGist
): string[] => {
	const lines = ['## Diagnostics', '', metricLine('Outcome', gist.outcomeLabel)];
	if (gist.flags.length > 0) {
		lines.push('', '**Flags:**');
		lines.push(...gist.flags.map((flag) => `- ${flag}`));
	} else {
		lines.push('', '_No notable flags._');
	}

	// Surface every forced-synthesis / errored LLM pass inline.
	const forcedRows: string[] = [];
	for (const message of payload.messages) {
		if (messageRole(message) !== 'assistant') continue;
		messageLlmPasses(message).forEach((pass) => {
			if (
				pass.forced_no_tool_synthesis === true ||
				asString(pass.finished_reason) === 'error'
			) {
				forcedRows.push(
					`- pass ${stringOrDash(pass.pass)}: ${stringOrDash(pass.model)} · ${stringOrDash(
						pass.finished_reason
					)}${pass.forced_no_tool_synthesis ? ' · forced synthesis' : ''}`
				);
			}
		});
	}
	if (forcedRows.length > 0) {
		lines.push('', '**Notable LLM passes:**', ...forcedRows);
	}
	lines.push('');
	return lines;
};
