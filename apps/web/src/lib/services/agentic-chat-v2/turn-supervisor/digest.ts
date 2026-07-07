// apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/digest.ts
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import { classifyToolFailure, isValidationFailure } from '../stream-orchestrator/tool-failure';
export {
	classifyToolExecution,
	extractCanonicalOp,
	isLikelyReadToolName,
	isLikelyWriteToolName
} from '../stream-orchestrator/tool-classification';

export function parseToolArguments(toolCall: ChatToolCall): Record<string, unknown> {
	try {
		const parsed = JSON.parse(toolCall.function.arguments || '{}');
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

export function summarizeToolArguments(args: unknown): {
	fingerprint: string | null;
	idArgs: Record<string, string>;
} {
	const record =
		args && typeof args === 'object' && !Array.isArray(args)
			? (args as Record<string, unknown>)
			: {};
	const fingerprintSource = stableStringify(record);
	return {
		fingerprint: fingerprintSource ? hashString(fingerprintSource) : null,
		idArgs: extractIdArgs(record)
	};
}

export function summarizeToolResult(result: ChatToolResult, maxChars = 220): string | null {
	const source = result.error ?? result.result;
	if (source === undefined || source === null) return null;
	let text: string;
	if (typeof source === 'string') {
		text = source;
	} else {
		try {
			text = JSON.stringify(source);
		} catch {
			text = String(source);
		}
	}
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (!normalized) return null;
	if (normalized.length <= maxChars) return normalized;
	return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

export function classifyToolError(error: string | null | undefined): string | null {
	const failure = classifyToolFailure(error);
	if (!failure) return null;
	return isValidationFailure(failure) ? 'validation' : failure.kind;
}

export function buildToolPatternKey(
	tools: Array<{ toolName: string; canonicalOp?: string | null }>
): string {
	return tools.map((tool) => tool.canonicalOp ?? tool.toolName).join('|');
}

function extractIdArgs(args: Record<string, unknown>): Record<string, string> {
	const idArgs: Record<string, string> = {};
	for (const [key, value] of Object.entries(args)) {
		if (!isIdArgKey(key) || typeof value !== 'string') continue;
		const trimmed = value.trim();
		if (!looksLikeUuid(trimmed)) continue;
		idArgs[key] = trimmed;
	}
	return idArgs;
}

function isIdArgKey(key: string): boolean {
	return key === 'id' || key.endsWith('_id') || key.endsWith('Id');
}

function looksLikeUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function stableStringify(value: unknown): string {
	if (value === undefined) return 'undefined';
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? String(value);
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(',')}]`;
	}
	const record = value as Record<string, unknown>;
	const keys = Object.keys(record).sort();
	return `{${keys
		.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
		.join(',')}}`;
}

function hashString(input: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < input.length; index += 1) {
		hash ^= input.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}
