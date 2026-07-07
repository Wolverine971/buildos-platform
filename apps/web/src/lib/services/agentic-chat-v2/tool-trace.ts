// apps/web/src/lib/services/agentic-chat-v2/tool-trace.ts
/**
 * Tool-trace helpers for the FastChat v2 stream route.
 *
 * Pure functions — no logging, no IO. They turn the raw tool executions of a
 * turn into the compact `fastchat_tool_trace_v1` array persisted on
 * chat_messages.metadata, plus a one-line human summary. Extracted from the
 * route file so the orchestration spine stays focused on flow.
 *
 * `previewToolArguments` lives here because it is the shared truncation used
 * both by the trace builder and by validation-failure logging in the route.
 */

import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import { extractFastChatToolCallMeta } from './prompt-observability';
import { classifyToolTraceName } from './stream-orchestrator/tool-classification';

export type PersistedToolTraceEntry = {
	tool_call_id: string;
	tool_name: string;
	op?: string;
	success: boolean;
	error?: string;
	arguments_preview?: string;
	result_preview?: string;
	duration_ms?: number;
};

export type ToolTraceCategory = 'write' | 'read_discovery' | 'other';

const MAX_PERSISTED_TOOL_TRACE_ITEMS = 12;
const MAX_PERSISTED_TOOL_ERROR_CHARS = 180;
const MAX_PERSISTED_TOOL_ARGUMENT_PREVIEW_CHARS = 420;
const MAX_PERSISTED_TOOL_RESULT_PREVIEW_CHARS = 600;

export function previewToolArguments(raw: unknown, maxChars = 280): string {
	if (raw === undefined || raw === null) {
		return 'null';
	}

	let value: string;
	if (typeof raw === 'string') {
		value = raw;
	} else {
		try {
			value = JSON.stringify(raw);
		} catch {
			value = String(raw);
		}
	}
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (normalized.length <= maxChars) {
		return normalized;
	}
	return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

export function truncateToolTraceText(value: string, maxChars: number): string {
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (normalized.length <= maxChars) return normalized;
	return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

export function extractToolOpFromToolCall(toolCall: ChatToolCall): string | undefined {
	return extractFastChatToolCallMeta(toolCall).canonicalOp ?? undefined;
}

export function buildPersistedToolTrace(
	executions: Array<{ toolCall: ChatToolCall; result: ChatToolResult }>
): PersistedToolTraceEntry[] {
	if (!Array.isArray(executions) || executions.length === 0) return [];
	return executions.slice(0, MAX_PERSISTED_TOOL_TRACE_ITEMS).map(({ toolCall, result }) => {
		const op = extractToolOpFromToolCall(toolCall);
		const rawError = typeof result.error === 'string' ? result.error : '';
		const argumentsPreview = previewToolArguments(
			toolCall.function.arguments,
			MAX_PERSISTED_TOOL_ARGUMENT_PREVIEW_CHARS
		);
		const resultPreview =
			result.result === undefined
				? undefined
				: previewToolArguments(result.result, MAX_PERSISTED_TOOL_RESULT_PREVIEW_CHARS);
		const durationMs =
			typeof result.duration_ms === 'number' && Number.isFinite(result.duration_ms)
				? result.duration_ms
				: undefined;
		return {
			tool_call_id: toolCall.id,
			tool_name: toolCall.function.name,
			op,
			success: result.success === true,
			...(argumentsPreview ? { arguments_preview: argumentsPreview } : {}),
			...(resultPreview ? { result_preview: resultPreview } : {}),
			...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
			...(rawError
				? {
						error: truncateToolTraceText(rawError, MAX_PERSISTED_TOOL_ERROR_CHARS)
					}
				: {})
		};
	});
}

export function classifyTraceEntry(entry: PersistedToolTraceEntry): ToolTraceCategory {
	return classifyToolTraceName(entry.tool_name ?? '');
}

export function summarizeTraceGroup(
	entries: PersistedToolTraceEntry[],
	maxLabels: number
): { label: string; failures: string[] } {
	const successCounts = new Map<string, number>();
	const failures: string[] = [];
	for (const entry of entries) {
		const label = entry.op ?? entry.tool_name ?? 'unknown';
		if (entry.success) {
			successCounts.set(label, (successCounts.get(label) ?? 0) + 1);
		} else {
			failures.push(`${label}${entry.error ? `(${entry.error})` : ''}`);
		}
	}
	const successLabels = Array.from(successCounts.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, maxLabels)
		.map(([name, count]) => (count > 1 ? `${name} x${count}` : name))
		.join(', ');
	return { label: successLabels, failures };
}

export function buildPersistedToolTraceSummary(trace: PersistedToolTraceEntry[]): string | null {
	if (!trace.length) return null;

	const writes: PersistedToolTraceEntry[] = [];
	const reads: PersistedToolTraceEntry[] = [];
	const others: PersistedToolTraceEntry[] = [];
	let failures = 0;
	for (const entry of trace) {
		if (!entry.success) failures += 1;
		switch (classifyTraceEntry(entry)) {
			case 'write':
				writes.push(entry);
				break;
			case 'read_discovery':
				reads.push(entry);
				break;
			default:
				others.push(entry);
		}
	}

	const writeSummary = summarizeTraceGroup(writes, 6);
	const readSummary = summarizeTraceGroup(reads, 6);
	const otherSummary = summarizeTraceGroup(others, 4);

	const parts: string[] = [];
	parts.push(`Tool trace: ${trace.length} calls, ${writes.length} writes, ${failures} failures.`);
	if (writeSummary.label) parts.push(`Writes: ${writeSummary.label}.`);
	if (readSummary.label) parts.push(`Discovery/reads: ${readSummary.label}.`);
	if (otherSummary.label) parts.push(`Other: ${otherSummary.label}.`);
	// Always surface failures in full — never truncate failures away.
	const allFailures = [
		...writeSummary.failures,
		...readSummary.failures,
		...otherSummary.failures
	];
	if (allFailures.length > 0) {
		parts.push(`Failures: ${allFailures.join('; ')}.`);
	}

	return truncateToolTraceText(parts.join(' '), 600);
}
