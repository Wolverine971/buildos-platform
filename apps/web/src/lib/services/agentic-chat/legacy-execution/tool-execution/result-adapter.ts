// apps/web/src/lib/services/agentic-chat/legacy-execution/tool-execution/result-adapter.ts
import type { StreamEvent, ToolExecutionResult, ToolExecutorResponse } from '../../shared/types';
import { normalizeToolError } from '../../shared/error-utils';

export const MAX_FORMATTED_TOOL_RESULT_LENGTH = 4_000;

export interface AdaptedCoreExecution {
	result: ToolExecutionResult;
	cleanedData: unknown;
}

export function adaptCoreToolExecutionResult(
	execution: ToolExecutorResponse | undefined,
	identity: { toolName: string; toolCallId: string }
): AdaptedCoreExecution {
	const rawData: unknown = execution?.data;
	const cleanedData = cleanToolResultData(rawData);
	const entitiesAccessed = extractToolResultEntityIds(rawData);
	const streamEvents: StreamEvent[] | undefined = Array.isArray(execution?.streamEvents)
		? execution.streamEvents
		: undefined;

	return {
		cleanedData,
		result: {
			success: true,
			data: cleanedData,
			toolName: identity.toolName,
			toolCallId: identity.toolCallId,
			entitiesAccessed: entitiesAccessed.length > 0 ? entitiesAccessed : undefined,
			streamEvents,
			tokensUsed: extractToolExecutionTokens(execution),
			metadata: execution?.metadata
		}
	};
}

export function cleanToolResultData(result: unknown): unknown {
	if (!result || typeof result !== 'object') return result;

	const cleaned = { ...(result as Record<string, unknown>) };
	delete cleaned._entities_accessed;
	delete cleaned._metadata;
	delete cleaned._internal;
	delete cleaned._stream_events;
	return cleaned;
}

export function extractToolResultEntityIds(result: unknown): string[] {
	const entities = new Set<string>();

	const findIds = (value: unknown, depth = 0): void => {
		if (depth > 10 || !value) return;
		if (Array.isArray(value)) {
			for (const entry of value) findIds(entry, depth + 1);
			return;
		}
		if (typeof value !== 'object') return;

		const record = value as Record<string, unknown>;
		if (typeof record.id === 'string') entities.add(record.id);

		for (const key of Object.keys(record)) {
			if ((key.endsWith('_id') || key.endsWith('Id')) && typeof record[key] === 'string') {
				entities.add(record[key]);
			}
		}

		if (Array.isArray(record._entities_accessed)) {
			for (const entityId of record._entities_accessed) {
				if (typeof entityId === 'string') entities.add(entityId);
			}
		}

		for (const entry of Object.values(record)) {
			if (entry && typeof entry === 'object') findIds(entry, depth + 1);
		}
	};

	findIds(result);
	return Array.from(entities);
}

export function extractToolExecutionTokens(
	execution: ToolExecutorResponse | undefined
): number | undefined {
	const executionRecord = asRecord(execution);
	const metadata = asRecord(executionRecord?.metadata);
	const metadataUsage = asRecord(metadata?.usage);
	const executionUsage = asRecord(executionRecord?.usage);
	const dataUsage = asRecord(asRecord(executionRecord?.data)?.usage);
	const candidates: unknown[] = [
		metadata?.tokensUsed,
		metadata?.tokens_used,
		metadataUsage?.total_tokens,
		metadataUsage?.totalTokens,
		executionRecord?.tokensUsed,
		executionRecord?.tokens_used,
		executionRecord?.tokens_consumed,
		executionUsage?.total_tokens,
		executionUsage?.totalTokens,
		dataUsage?.total_tokens,
		dataUsage?.totalTokens
	];

	for (const value of candidates) {
		if (typeof value === 'number' && Number.isFinite(value)) return value;
	}
	return undefined;
}

export function formatToolExecutionResult(
	result: ToolExecutionResult,
	maxLength = MAX_FORMATTED_TOOL_RESULT_LENGTH
): string {
	if (!result.success) return `Error executing ${result.toolName}: ${result.error}`;

	let formatted = `Tool: ${result.toolName}\n`;
	if (result.data) {
		const dataString = JSON.stringify(result.data, null, 2) as string;
		if (dataString.length > maxLength) {
			formatted += `Result (truncated):\n${dataString.substring(0, maxLength)}\n...`;
		} else {
			formatted += `Result:\n${dataString}`;
		}
	} else {
		formatted += 'Result: Success (no data)';
	}

	if (result.entitiesAccessed && result.entitiesAccessed.length > 0) {
		formatted += `\nEntities accessed: ${result.entitiesAccessed.join(', ')}`;
	}
	return formatted;
}

export function normalizeToolExecutionError(error: unknown, toolName: string): string {
	return normalizeToolError(error, toolName);
}

export function isToolCancellationResult(result: ToolExecutionResult): boolean {
	if (result.errorType === 'cancelled') return true;
	const message = typeof result.error === 'string' ? result.error.trim().toLowerCase() : '';
	return message === 'operation cancelled' || message === 'operation canceled';
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}
