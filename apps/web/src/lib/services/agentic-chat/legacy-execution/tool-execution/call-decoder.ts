// apps/web/src/lib/services/agentic-chat/legacy-execution/tool-execution/call-decoder.ts
import { ToolExecutionError } from '../../shared/types';
import { cloneToolArguments, isToolArgumentRecord, type ToolArguments } from './argument-values';

export interface ResolvedToolCall {
	name: string;
	rawArguments: unknown;
}

export type ArgumentDecodeDiagnostic =
	| {
			type: 'string_argument_fallback';
			reason: 'non_json_string' | 'json_string';
			value: string;
	  }
	| { type: 'parse_depth_exceeded' }
	| { type: 'nested_json_reparsed' }
	| { type: 'control_characters_sanitized' }
	| { type: 'parsed_string_discarded'; rawPreview?: string };

export type ArgumentDecodeResult =
	| { ok: true; args: ToolArguments; diagnostics: ArgumentDecodeDiagnostic[] }
	| { ok: false; error: ToolExecutionError; diagnostics: ArgumentDecodeDiagnostic[] };

/**
 * Compatibility parser for canonical provider calls and historical flat calls.
 * Keep untrusted/replayed data unknown until it crosses this boundary.
 */
export function resolveToolCall(toolCall: unknown): ResolvedToolCall {
	const callRecord = isToolArgumentRecord(toolCall) ? toolCall : {};
	const nestedFunction = isToolArgumentRecord(callRecord.function)
		? callRecord.function
		: undefined;
	const legacyName = callRecord.name;
	const legacyArguments = callRecord.arguments;
	const rawName = nestedFunction?.name ?? legacyName ?? '';
	const name = typeof rawName === 'string' ? rawName.trim() : '';
	const primaryArgs = nestedFunction?.arguments;
	const hasPrimaryArgs =
		primaryArgs !== undefined &&
		primaryArgs !== null &&
		!(typeof primaryArgs === 'string' && primaryArgs.trim().length === 0);
	const rawArguments = hasPrimaryArgs ? primaryArgs : legacyArguments;
	return { name, rawArguments };
}

export function decodeToolArguments(
	rawArguments: unknown,
	toolName?: string
): ArgumentDecodeResult {
	const diagnostics: ArgumentDecodeDiagnostic[] = [];

	if (rawArguments === undefined || rawArguments === null) {
		return { ok: true, args: {}, diagnostics };
	}

	if (typeof rawArguments === 'string') {
		const trimmed = rawArguments.trim();
		if (!trimmed) {
			return { ok: true, args: {}, diagnostics };
		}

		try {
			const parsed: unknown = JSON.parse(trimmed);
			return {
				ok: true,
				args: normalizeParsedArguments(parsed, toolName, diagnostics, trimmed),
				diagnostics
			};
		} catch (error) {
			const fallback = buildStringArgumentFallback(toolName, trimmed);
			if (fallback) {
				diagnostics.push({
					type: 'string_argument_fallback',
					reason: 'non_json_string',
					value: trimmed
				});
				return { ok: true, args: fallback, diagnostics };
			}

			return {
				ok: false,
				error: new ToolExecutionError(
					`Invalid JSON for tool arguments: ${error instanceof Error ? error.message : 'unknown error'}`,
					toolName ?? 'unknown',
					{ args: rawArguments }
				),
				diagnostics
			};
		}
	}

	if (typeof rawArguments === 'object') {
		return {
			ok: true,
			args: normalizeParsedArguments(rawArguments, toolName, diagnostics),
			diagnostics
		};
	}

	return { ok: true, args: {}, diagnostics };
}

function normalizeParsedArguments(
	parsed: unknown,
	toolName: string | undefined,
	diagnostics: ArgumentDecodeDiagnostic[],
	rawString?: string,
	depth = 0
): ToolArguments {
	if (parsed === undefined || parsed === null) {
		return {};
	}

	if (depth > 3) {
		diagnostics.push({ type: 'parse_depth_exceeded' });
		return {};
	}

	if (typeof parsed === 'string') {
		const inner = parsed.trim();
		if (inner && looksLikeJsonPayload(inner)) {
			const reparsed = tryParseJsonPayload(inner, diagnostics);
			if (reparsed !== null && reparsed !== undefined) {
				diagnostics.push({ type: 'nested_json_reparsed' });
				return normalizeParsedArguments(
					reparsed,
					toolName,
					diagnostics,
					rawString,
					depth + 1
				);
			}
		}

		const fallback = buildStringArgumentFallback(toolName, inner);
		if (fallback) {
			diagnostics.push({
				type: 'string_argument_fallback',
				reason: 'json_string',
				value: inner
			});
			return fallback;
		}

		diagnostics.push({
			type: 'parsed_string_discarded',
			rawPreview: rawString?.slice(0, 200)
		});
		return {};
	}

	if (typeof parsed === 'object') {
		return cloneToolArguments(parsed);
	}

	return {};
}

function looksLikeJsonPayload(value: string): boolean {
	const trimmed = value.trim();
	if (!trimmed) return false;
	if (trimmed.startsWith('{') || trimmed.startsWith('[')) return true;
	return trimmed.startsWith('"') && trimmed.endsWith('"');
}

function tryParseJsonPayload(
	value: string,
	diagnostics: ArgumentDecodeDiagnostic[]
): unknown | null {
	try {
		return JSON.parse(value) as unknown;
	} catch {
		const sanitized = value.replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
		if (sanitized === value) {
			return null;
		}
		try {
			const reparsed: unknown = JSON.parse(sanitized);
			diagnostics.push({ type: 'control_characters_sanitized' });
			return reparsed;
		} catch {
			return null;
		}
	}
}

function buildStringArgumentFallback(
	toolName: string | undefined,
	value: string
): ToolArguments | null {
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	switch (toolName) {
		case 'web_search':
			return { query: trimmed };
		case 'web_visit':
			return { url: trimmed };
		default:
			return null;
	}
}
