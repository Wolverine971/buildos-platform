// apps/web/src/lib/services/admin/chat-session-audit-bundle.ts
//
// Multi-file (zip) export for a chat session audit. Optimized for an agent
// reading the audit: README.md carries the gist + index, each readable layer
// is its own small file, and the raw records live as real .json files under
// raw/ (greppable / jq-able instead of buried in markdown code fences).
//
//   <bundle>/
//     README.md        gist + outcome + summary + file index (read this first)
//     transcript.md    clean conversation
//     tool-calls.md    table + per-call args/result
//     llm-calls.md     per-pass token/cost table
//     timeline.md      compact turn-grouped table
//     turns.md         turn-run detail + prompt-variant comparison
//     diagnostics.md   outcome, flags, notable LLM passes
//     raw/*.json       full records
import { zipSync, strToU8 } from 'fflate';
import { buildPromptVariantComparisonSection } from './chat-session-audit-export';
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
	stringOrDash,
	toJson
} from './chat-session-audit-gist';
import type { ChatSessionAuditPayload } from './chat-session-audit-types';

const sanitizeFilenamePart = (value: string): string =>
	value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48) || 'session';

export const buildChatSessionAuditBundleName = (payload: ChatSessionAuditPayload): string => {
	const safeTitle = sanitizeFilenamePart(payload.session.title);
	const safeId = sanitizeFilenamePart(payload.session.id).slice(0, 16);
	const date = new Date().toISOString().slice(0, 10);
	return `chat-session-audit-${safeTitle}-${safeId}-${date}`;
};

const section = (lines: string[]): string => lines.join('\n').trimEnd() + '\n';

const buildReadme = (
	payload: ChatSessionAuditPayload,
	gist: ReturnType<typeof deriveAuditGist>
) => {
	const lines = [
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
	lines.push(...buildGistSection(gist));
	lines.push(
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
	);
	lines.push(
		'## Files',
		'',
		'- [`transcript.md`](./transcript.md) — clean conversation',
		'- [`tool-calls.md`](./tool-calls.md) — tool calls table + per-call args/result',
		'- [`llm-calls.md`](./llm-calls.md) — per-pass token/cost table',
		'- [`timeline.md`](./timeline.md) — compact ordered timeline',
		'- [`turns.md`](./turns.md) — turn-run detail + prompt-variant comparison',
		'- [`diagnostics.md`](./diagnostics.md) — outcome, flags, notable LLM passes',
		'- [`raw/`](./raw/) — full JSON records (messages, tool_executions, llm_calls, operations, timeline, turn_runs, timing_metrics, session)',
		''
	);
	return section(lines);
};

const buildTranscriptFile = (payload: ChatSessionAuditPayload) =>
	section(buildConversationSection(payload));

/** Tool calls table, then full args/result for each call. */
const buildToolCallsFile = (payload: ChatSessionAuditPayload) => {
	const lines = [...buildToolCallSection(payload)];
	if (payload.tool_executions.length > 0) {
		lines.push('## Call detail', '');
		const ordered = [...payload.tool_executions].sort(
			(a, b) => Number(a.sequence_index ?? 0) - Number(b.sequence_index ?? 0)
		);
		ordered.forEach((exec, index) => {
			const seq = exec.sequence_index ?? index + 1;
			lines.push(`### ${seq}. ${stringOrDash(exec.tool_name)}`, '');
			lines.push('**Arguments**', '', codeFence(toJson(exec.arguments ?? {}), 'json'), '');
			lines.push(
				'**Result**',
				'',
				codeFence(toJson(exec.result ?? exec.error ?? {}), 'json'),
				''
			);
		});
	}
	return section(lines);
};

const buildLlmCallsFile = (payload: ChatSessionAuditPayload) =>
	section(buildLlmCallSection(payload));

const buildTimelineFile = (payload: ChatSessionAuditPayload) =>
	section(buildTimelineSection(payload));

const buildTurnsFile = (payload: ChatSessionAuditPayload) => {
	const lines = [...buildTurnSummarySection(payload)];
	lines.push(...buildPromptVariantComparisonSection(payload.turn_runs));
	return section(lines);
};

const buildDiagnosticsFile = (
	payload: ChatSessionAuditPayload,
	gist: ReturnType<typeof deriveAuditGist>
) => section(buildDiagnosticsSection(payload, gist));

/**
 * Build the full set of bundle files keyed by their in-zip path (without the
 * top-level folder prefix). Exported so it can be unit-tested without zipping.
 */
export const buildChatSessionAuditBundleFiles = (
	payload: ChatSessionAuditPayload
): Record<string, string> => {
	const gist = deriveAuditGist(payload);
	return {
		'README.md': buildReadme(payload, gist),
		'transcript.md': buildTranscriptFile(payload),
		'tool-calls.md': buildToolCallsFile(payload),
		'llm-calls.md': buildLlmCallsFile(payload),
		'timeline.md': buildTimelineFile(payload),
		'turns.md': buildTurnsFile(payload),
		'diagnostics.md': buildDiagnosticsFile(payload, gist),
		'raw/session.json': `${toJson(payload.session)}\n`,
		'raw/messages.json': `${toJson(payload.messages)}\n`,
		'raw/tool_executions.json': `${toJson(payload.tool_executions)}\n`,
		'raw/llm_calls.json': `${toJson(payload.llm_calls)}\n`,
		'raw/operations.json': `${toJson(payload.operations)}\n`,
		'raw/timeline.json': `${toJson(payload.timeline)}\n`,
		'raw/turn_runs.json': `${toJson(payload.turn_runs)}\n`,
		'raw/timing_metrics.json': `${toJson(payload.timing_metrics)}\n`
	};
};

/** Build the zipped bundle as bytes. */
export const buildChatSessionAuditBundleZip = (payload: ChatSessionAuditPayload): Uint8Array => {
	const folder = buildChatSessionAuditBundleName(payload);
	const files = buildChatSessionAuditBundleFiles(payload);
	const zippable: Record<string, Uint8Array> = {};
	for (const [path, content] of Object.entries(files)) {
		zippable[`${folder}/${path}`] = strToU8(content);
	}
	return zipSync(zippable, { level: 6 });
};

export const downloadChatSessionAuditBundle = (payload: ChatSessionAuditPayload): void => {
	const bytes = buildChatSessionAuditBundleZip(payload);
	// Copy into a fresh ArrayBuffer so Blob gets a clean, correctly-typed buffer.
	const buffer = new Uint8Array(bytes);
	const blob = new Blob([buffer], { type: 'application/zip' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = `${buildChatSessionAuditBundleName(payload)}.zip`;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
};
