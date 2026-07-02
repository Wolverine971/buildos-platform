// apps/web/src/lib/services/admin/chat-session-audit-export.ts
//
// Single-file markdown export for a chat session audit. Structured for
// progressive disclosure: a TL;DR gist + clean conversation + compact tables
// come first, and the raw JSON lives in a single collapsed appendix (one home
// per collection — no triple-duplicating the same tool calls across timeline,
// turn events, and raw collections).
import {
	buildPromptEvalVariantComparison,
	formatPromptEvalVariantDecisionNote,
	formatPromptVariantLabel,
	readPromptEvalAssertionCounts,
	type PromptEvalVariantEvidence,
	type PromptEvalVariantScenarioComparison
} from '../agentic-chat-v2/prompt-eval-comparison';
import {
	buildConversationSection,
	buildDiagnosticsSection,
	buildGistSection,
	buildLlmCallSection,
	buildTimelineSection,
	buildToolCallSection,
	buildTurnSummarySection,
	codeFence,
	deriveAuditGist,
	metricLine,
	toJson
} from './chat-session-audit-gist';
import {
	buildCapabilityManifest,
	buildCompactTimeline,
	buildCompactTurnRuns,
	buildPromptSnapshotRecords,
	compactPromptSnapshot
} from './chat-session-audit-compact';
import type { AuditTurnRun, ChatSessionAuditPayload } from './chat-session-audit-types';
export type {
	AuditPromptEvalRun,
	AuditTimelineEvent,
	AuditTimelineSeverity,
	AuditTimelineType,
	AuditTurnRun,
	ChatSessionAuditPayload
} from './chat-session-audit-types';

type ChatSessionAuditResponse = {
	success?: boolean;
	message?: string;
	data?: ChatSessionAuditPayload;
};

const sanitizeFilenamePart = (value: string, maxLength = 48): string =>
	value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, maxLength) || 'session';

const FILENAME_STOP_WORDS = new Set([
	'a',
	'an',
	'and',
	'are',
	'as',
	'at',
	'be',
	'but',
	'can',
	'chat',
	'could',
	'for',
	'from',
	'happening',
	'help',
	'how',
	'i',
	'im',
	'in',
	'is',
	'it',
	'me',
	'my',
	'of',
	'on',
	'or',
	'please',
	'session',
	'that',
	'the',
	'this',
	'to',
	'wa',
	'want',
	'we',
	'what',
	'when',
	'where',
	'with',
	'would',
	'why',
	'you'
]);

const stripStarterPhrase = (value: string): string =>
	value
		.replace(
			/^\s*(i['’]?m|i am|we['’]?re|we are)\s+(launching|starting|creating|building)\s+(a|an|the)\s+/i,
			''
		)
		.replace(/^\s*(help me|can you|could you|please)\s+/i, '')
		.trim();

const firstUserMessage = (payload: ChatSessionAuditPayload): string | null => {
	const message = payload.messages.find((entry) => entry.role === 'user');
	return typeof message?.content === 'string' && message.content.trim()
		? message.content.trim()
		: null;
};

const buildTopicSlug = (payload: ChatSessionAuditPayload): string => {
	const source = stripStarterPhrase(firstUserMessage(payload) ?? payload.session.title);
	const words = source.toLowerCase().match(/[a-z0-9]+/g) ?? [];
	const significant = words.filter((word) => word.length >= 3 && !FILENAME_STOP_WORDS.has(word));
	const selected = significant.slice(0, 4);
	if (selected.length > 0) return sanitizeFilenamePart(selected.join('-'), 40);
	return sanitizeFilenamePart(payload.session.title, 40);
};

const timestampPart = (date = new Date()): string =>
	date
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}Z$/, 'Z');

export const buildChatSessionAuditBaseName = (payload: ChatSessionAuditPayload): string =>
	`csa-${buildTopicSlug(payload)}-${timestampPart()}`;

const optionalString = (value: unknown): string | null => {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const optionalNumber = (value: unknown): number | null => {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
};

// ---------------------------------------------------------------------------
// Prompt variant comparison (unchanged logic, kept compact)
// ---------------------------------------------------------------------------

const buildPromptEvalVariantEvidence = (turnRuns: AuditTurnRun[]): PromptEvalVariantEvidence[] => {
	const evidence: PromptEvalVariantEvidence[] = [];
	for (const turnRun of turnRuns) {
		for (const evalRun of turnRun.eval_runs ?? []) {
			const promptSnapshot = turnRun.prompt_snapshot ?? {};
			evidence.push({
				scenarioSlug: evalRun.scenario_slug,
				scenarioVersion: evalRun.scenario_version,
				turnRunId: turnRun.id,
				evalRunId: evalRun.id,
				promptVariant:
					optionalString(promptSnapshot.prompt_variant) ??
					optionalString(promptSnapshot.snapshot_version),
				snapshotVersion: optionalString(promptSnapshot.snapshot_version),
				status: turnRun.status,
				finishedReason: turnRun.finished_reason,
				firstLane: turnRun.first_lane,
				firstCanonicalOp: turnRun.first_canonical_op,
				firstSkillPath: turnRun.first_skill_path,
				validationFailureCount: turnRun.validation_failure_count,
				toolRoundCount: turnRun.tool_round_count,
				toolCallCount: turnRun.tool_call_count,
				llmPassCount: turnRun.llm_pass_count,
				promptTokens: optionalNumber(promptSnapshot.approx_prompt_tokens),
				evalStatus: evalRun.status,
				assertionCounts: readPromptEvalAssertionCounts(evalRun.summary),
				startedAt: evalRun.started_at,
				completedAt: evalRun.completed_at
			});
		}
	}
	return evidence;
};

const verdictLabel = (verdict: PromptEvalVariantScenarioComparison['verdict']): string => {
	switch (verdict) {
		case 'lite_better':
			return 'lite better';
		case 'lite_worse':
			return 'lite worse';
		case 'mixed':
			return 'mixed';
		case 'unchanged':
			return 'unchanged';
		case 'missing_evidence':
			return 'missing evidence';
		default:
			return verdict;
	}
};

const signedMetric = (value: number | null): string | null => {
	if (value === null) return null;
	return value > 0 ? `+${value}` : String(value);
};

const scenarioComparisonLine = (
	scenario: PromptEvalVariantScenarioComparison,
	baselineVariant: string,
	candidateVariant: string
): string => {
	const parts = [`- ${scenario.scenarioSlug}: ${verdictLabel(scenario.verdict)}`];
	if (scenario.missingVariants.length > 0) {
		parts.push(`missing ${scenario.missingVariants.map(formatPromptVariantLabel).join(', ')}`);
	}
	const tokenDelta = signedMetric(scenario.metricDeltas.promptTokens);
	if (tokenDelta) {
		parts.push(`prompt tokens ${tokenDelta}`);
	}
	parts.push(
		`${formatPromptVariantLabel(baselineVariant)} eval ${scenario.baseline?.evalStatus ?? '-'}`
	);
	parts.push(
		`${formatPromptVariantLabel(candidateVariant)} eval ${scenario.candidate?.evalStatus ?? '-'}`
	);
	return parts.join('; ');
};

export const buildPromptVariantComparisonSection = (turnRuns: AuditTurnRun[]): string[] => {
	const evidence = buildPromptEvalVariantEvidence(turnRuns);
	if (evidence.length === 0) return [];

	const report = buildPromptEvalVariantComparison(evidence);
	const lines = [
		'## Prompt Variant Comparison',
		'',
		formatPromptEvalVariantDecisionNote(report),
		''
	];
	for (const scenario of report.scenarios) {
		lines.push(
			scenarioComparisonLine(scenario, report.baselineVariant, report.candidateVariant)
		);
	}
	lines.push('');
	return lines;
};

// ---------------------------------------------------------------------------
// Raw appendix — the single home for raw JSON, collapsed by default
// ---------------------------------------------------------------------------

const collapsedRaw = (heading: string, value: unknown): string[] => {
	if (value === null || value === undefined) return [];
	if (Array.isArray(value) && value.length === 0) return [];
	if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
		return [];
	return [
		'<details>',
		`<summary>${heading}</summary>`,
		'',
		codeFence(toJson(value), 'json'),
		'',
		'</details>',
		''
	];
};

export const buildRawAppendixSection = (payload: ChatSessionAuditPayload): string[] => {
	const lines = [
		'## Appendix: Raw Data',
		'',
		'_Compact records for deep inspection. Null fields and duplicate prompt blobs are removed; the sections above are the readable summary._',
		''
	];
	lines.push(...collapsedRaw('Messages', payload.messages));
	lines.push(...collapsedRaw('Tool Executions', payload.tool_executions));
	lines.push(...collapsedRaw('LLM Calls', payload.llm_calls));
	lines.push(...collapsedRaw('Operations', payload.operations));
	lines.push(...collapsedRaw('Timeline', buildCompactTimeline(payload.timeline)));
	lines.push(...collapsedRaw('Turn Runs', buildCompactTurnRuns(payload.turn_runs)));
	lines.push(
		...collapsedRaw(
			'Prompt Snapshot Summaries',
			buildPromptSnapshotRecords(payload).map(compactPromptSnapshot)
		)
	);
	lines.push(...collapsedRaw('Capabilities', buildCapabilityManifest(payload)));
	lines.push(...collapsedRaw('Timing Metrics', payload.timing_metrics));
	lines.push(...collapsedRaw('Agent Metadata', payload.session.agent_metadata));
	lines.push(...collapsedRaw('Extracted Entities', payload.session.extracted_entities));
	return lines;
};

// ---------------------------------------------------------------------------
// Session metadata + summary
// ---------------------------------------------------------------------------

const buildHeaderSection = (payload: ChatSessionAuditPayload): string[] => [
	`# Chat Session Audit: ${payload.session.title}`,
	'',
	metricLine('Exported At', new Date().toISOString()),
	metricLine('Session ID', payload.session.id),
	metricLine('User', `${payload.session.user.name} <${payload.session.user.email}>`),
	metricLine(
		'Context',
		`${payload.session.context_type} ${payload.session.context_id ?? ''}`.trim()
	),
	metricLine('Status', payload.session.status),
	metricLine('Created At', payload.session.created_at),
	metricLine('Last Message At', payload.session.last_message_at),
	''
];

const buildSummarySection = (payload: ChatSessionAuditPayload): string[] => [
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

export const buildChatSessionAuditFilename = (payload: ChatSessionAuditPayload): string => {
	return `${buildChatSessionAuditBaseName(payload)}.md`;
};

export const buildChatSessionAuditMarkdown = (payload: ChatSessionAuditPayload): string => {
	const gist = deriveAuditGist(payload);
	const lines: string[] = [];

	lines.push(...buildHeaderSection(payload));
	lines.push(...buildGistSection(gist));
	lines.push(...buildSummarySection(payload));
	lines.push(...buildConversationSection(payload));
	lines.push(...buildToolCallSection(payload));
	lines.push(...buildLlmCallSection(payload));
	lines.push(...buildTurnSummarySection(payload));
	lines.push(...buildPromptVariantComparisonSection(payload.turn_runs));
	lines.push(...buildDiagnosticsSection(payload, gist));
	lines.push(...buildTimelineSection(payload));
	lines.push(...buildRawAppendixSection(payload));

	return lines.join('\n').trimEnd() + '\n';
};

export const fetchChatSessionAuditPayload = async (
	sessionId: string,
	fetcher: typeof fetch = fetch
): Promise<ChatSessionAuditPayload> => {
	const trimmedSessionId = sessionId.trim();
	if (!trimmedSessionId) {
		throw new Error('Chat session ID is required');
	}

	const response = await fetcher(
		`/api/admin/chat/sessions/${encodeURIComponent(trimmedSessionId)}`
	);
	const result = (await response.json().catch(() => null)) as ChatSessionAuditResponse | null;

	if (!response.ok || !result?.success || !result.data) {
		throw new Error(result?.message || 'Failed to load session audit');
	}

	return result.data;
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
