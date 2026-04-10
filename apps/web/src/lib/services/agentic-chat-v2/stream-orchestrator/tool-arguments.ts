// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-arguments.ts
import type { ChatToolCall } from '@buildos/shared-types';
import { normalizeGatewayOpName } from '$lib/services/agentic-chat/tools/registry/gateway-op-aliases';
import { getToolRegistry } from '$lib/services/agentic-chat/tools/registry/tool-registry';
import {
	PRIMARY_GATEWAY_EXEC_TOOL_NAME,
	buildGatewayExecPayload,
	isGatewayExecToolName,
	readGatewayExecInput
} from '$lib/services/agentic-chat/tools/core/gateway-exec-utils';

const MAX_TOOL_ARG_PARSE_DEPTH = 3;
const MAX_TOOL_ARG_SEGMENTS = 8;

export type ToolArgumentAnomaly = {
	kind: 'malformed' | 'recovered';
	toolCallId: string;
	toolName: string;
	rawArgs: unknown;
	parseError?: string;
	recoveredArgs?: Record<string, any>;
};

export function parseToolArguments(rawArgs: unknown): {
	args: Record<string, any>;
	error?: string;
} {
	if (rawArgs === undefined || rawArgs === null) {
		return { args: {} };
	}

	if (typeof rawArgs === 'string') {
		const trimmed = rawArgs.trim();
		if (!trimmed) {
			return { args: {} };
		}

		const parsed = parseToolArgumentObject(trimmed);
		if (parsed.value) {
			return { args: parsed.value };
		}

		const recovered = recoverToolArgumentObject(trimmed);
		if (recovered) {
			return { args: recovered };
		}

		return { args: {}, error: parsed.error ?? 'Tool arguments must be a JSON object.' };
	}

	if (typeof rawArgs === 'object') {
		if (Array.isArray(rawArgs)) {
			return { args: {}, error: 'Tool arguments must be a JSON object.' };
		}
		return { args: rawArgs as Record<string, any> };
	}

	return { args: {}, error: 'Tool arguments must be a JSON object.' };
}

export function normalizeToolCallDefaults(
	toolCall: ChatToolCall,
	projectId?: string
): ChatToolCall {
	const toolName = toolCall.function?.name?.trim() ?? '';
	if (
		!isGatewaySchemaToolName(toolName) &&
		!isGatewayExecToolName(toolName) &&
		!isGatewaySkillLoadToolName(toolName)
	) {
		return toolCall;
	}

	const rawArgs = toolCall.function?.arguments;
	const { args, error } = parseToolArguments(rawArgs);
	if (!error) {
		if (toolName === 'tool_help') {
			const path = typeof args.path === 'string' ? args.path.trim() : '';
			const normalizedArgs = path.length > 0 ? { ...args, path } : { ...args, path: 'root' };
			const serializedArgs = JSON.stringify(normalizedArgs);
			if (toolCall.function.arguments === serializedArgs) {
				return toolCall;
			}
			return {
				...toolCall,
				function: {
					...toolCall.function,
					arguments: serializedArgs
				}
			};
		}

		if (toolName === 'tool_schema') {
			const op =
				typeof args.op === 'string'
					? args.op.trim()
					: typeof args.path === 'string'
						? args.path.trim()
						: '';
			if (!op) {
				return toolCall;
			}
			const normalizedArgs = { ...args, op: normalizeGatewayOpName(op) };
			const serializedArgs = JSON.stringify(normalizedArgs);
			if (toolCall.function.arguments === serializedArgs) {
				return toolCall;
			}
			return {
				...toolCall,
				function: {
					...toolCall.function,
					arguments: serializedArgs
				}
			};
		}

		if (toolName === 'skill_load') {
			const skill =
				typeof args.skill === 'string'
					? args.skill.trim()
					: typeof args.id === 'string'
						? args.id.trim()
						: typeof args.path === 'string'
							? args.path.trim()
							: '';
			if (!skill) {
				return toolCall;
			}
			const normalizedArgs = { ...args, skill };
			const serializedArgs = JSON.stringify(normalizedArgs);
			if (toolCall.function.arguments === serializedArgs) {
				return toolCall;
			}
			return {
				...toolCall,
				function: {
					...toolCall.function,
					arguments: serializedArgs
				}
			};
		}

		if (isGatewayExecToolName(toolName)) {
			const normalizedArgs = injectGatewayExecutionDefaults(args, projectId, toolName);
			const serializedArgs = JSON.stringify(normalizedArgs);
			if (toolCall.function.arguments === serializedArgs) {
				return toolCall;
			}
			return {
				...toolCall,
				function: {
					...toolCall.function,
					arguments: serializedArgs
				}
			};
		}

		return toolCall;
	}

	if (typeof rawArgs !== 'string') {
		return toolCall;
	}

	const fallbackArgs = buildGatewayFallbackArgs(toolName, rawArgs);
	if (!fallbackArgs) {
		return toolCall;
	}

	if (toolName === 'tool_help') {
		const path = typeof fallbackArgs.path === 'string' ? fallbackArgs.path.trim() : '';
		if (!path) {
			fallbackArgs.path = 'root';
		} else {
			fallbackArgs.path = path;
		}
	}

	if (toolName === 'tool_schema') {
		const op = typeof fallbackArgs.op === 'string' ? fallbackArgs.op.trim() : '';
		if (!op) {
			return toolCall;
		}
		fallbackArgs.op = normalizeGatewayOpName(op);
	}

	if (toolName === 'skill_load') {
		const skill =
			typeof fallbackArgs.skill === 'string'
				? fallbackArgs.skill.trim()
				: typeof fallbackArgs.id === 'string'
					? fallbackArgs.id.trim()
					: typeof fallbackArgs.path === 'string'
						? fallbackArgs.path.trim()
						: '';
		if (!skill) {
			return toolCall;
		}
		fallbackArgs.skill = skill;
	}

	if (isGatewayExecToolName(toolName)) {
		const op = typeof fallbackArgs.op === 'string' ? fallbackArgs.op.trim() : '';
		if (!op) {
			return toolCall;
		}
		const normalizedExecArgs = injectGatewayExecutionDefaults(
			buildGatewayExecPayload(toolName, {
				op: normalizeGatewayOpName(op),
				input: readGatewayExecInput(fallbackArgs),
				dry_run: fallbackArgs.dry_run,
				idempotency_key:
					typeof fallbackArgs.idempotency_key === 'string'
						? fallbackArgs.idempotency_key
						: undefined
			}),
			projectId,
			toolName
		);
		Object.keys(fallbackArgs).forEach((key) => delete fallbackArgs[key]);
		Object.assign(fallbackArgs, normalizedExecArgs);
	}

	const serializedArgs = JSON.stringify(fallbackArgs);
	if (toolCall.function.arguments === serializedArgs) {
		return toolCall;
	}

	return {
		...toolCall,
		function: {
			...toolCall.function,
			arguments: serializedArgs
		}
	};
}

export function inspectToolArgumentAnomaly(toolCall: ChatToolCall): ToolArgumentAnomaly | null {
	const toolName = toolCall.function?.name?.trim() ?? 'unknown';
	const rawArgs = toolCall.function?.arguments;

	if (rawArgs === undefined || rawArgs === null) {
		return null;
	}

	if (typeof rawArgs !== 'string') {
		return null;
	}

	const trimmed = rawArgs.trim();
	if (!trimmed) {
		return null;
	}

	const parsed = parseToolArgumentObject(trimmed);
	if (parsed.value) {
		return null;
	}

	const recovered = recoverToolArgumentObject(trimmed);
	if (recovered) {
		return {
			kind: 'recovered',
			toolCallId: toolCall.id,
			toolName,
			rawArgs,
			parseError: parsed.error,
			recoveredArgs: recovered
		};
	}

	return {
		kind: 'malformed',
		toolCallId: toolCall.id,
		toolName,
		rawArgs,
		parseError: parsed.error
	};
}

export function logToolArgumentAnomaly(params: {
	sessionId: string;
	anomaly: ToolArgumentAnomaly;
}): void {
	const { sessionId, anomaly } = params;
	const parts = [
		`[FastChat][ToolArgs:${anomaly.kind.toUpperCase()}]`,
		`session=${sessionId}`,
		`tool=${anomaly.toolName}`,
		`toolCallId=${anomaly.toolCallId}`,
		`parseError=${anomaly.parseError ?? 'none'}`,
		'rawArgs:',
		typeof anomaly.rawArgs === 'string' ? anomaly.rawArgs : JSON.stringify(anomaly.rawArgs),
		...(anomaly.recoveredArgs
			? ['recoveredArgs:', JSON.stringify(anomaly.recoveredArgs, null, 2)]
			: [])
	];
	console.warn(parts.join('\n'));
}

export function sanitizeToolCallsForReplay(toolCalls: ChatToolCall[]): ChatToolCall[] {
	let mutated = false;
	const sanitized = toolCalls.map((toolCall) => {
		const fn = toolCall.function;
		if (!fn || typeof fn !== 'object') {
			return toolCall;
		}

		const { args } = parseToolArguments(fn.arguments);
		const serializedArgs = JSON.stringify(args ?? {});
		if (fn.arguments === serializedArgs) {
			return toolCall;
		}

		mutated = true;
		return {
			...toolCall,
			function: {
				...fn,
				arguments: serializedArgs
			}
		};
	});

	return mutated ? sanitized : toolCalls;
}

function stripMarkdownCodeFence(raw: string): string {
	let trimmed = raw.trim();
	if (!trimmed.startsWith('```')) {
		return trimmed;
	}

	trimmed = trimmed.replace(/^```(?:json)?/i, '').trim();
	if (trimmed.endsWith('```')) {
		trimmed = trimmed.slice(0, -3).trim();
	}
	return trimmed;
}

function parseToolArgumentObject(
	raw: string,
	depth = 0
): { value?: Record<string, any>; error?: string } {
	if (depth > MAX_TOOL_ARG_PARSE_DEPTH) {
		return { error: 'Tool arguments must be a JSON object.' };
	}

	try {
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return { value: parsed as Record<string, any> };
		}

		if (typeof parsed === 'string') {
			const nested = parsed.trim();
			if (nested) {
				return parseToolArgumentObject(nested, depth + 1);
			}
		}

		return { error: 'Tool arguments must be a JSON object.' };
	} catch (error) {
		return {
			error: `Invalid JSON in tool arguments: ${error instanceof Error ? error.message : String(error)}`
		};
	}
}

function extractBalancedJsonObjectSegments(raw: string): string[] {
	const segments: string[] = [];
	let cursor = 0;

	while (cursor < raw.length && segments.length < MAX_TOOL_ARG_SEGMENTS) {
		const start = raw.indexOf('{', cursor);
		if (start < 0) {
			break;
		}

		let inString = false;
		let escapeNext = false;
		const stack: Array<'{' | '['> = ['{'];
		let end = -1;

		for (let i = start + 1; i < raw.length; i += 1) {
			const char = raw[i];
			if (inString) {
				if (escapeNext) {
					escapeNext = false;
					continue;
				}
				if (char === '\\') {
					escapeNext = true;
					continue;
				}
				if (char === '"') {
					inString = false;
				}
				continue;
			}

			if (char === '"') {
				inString = true;
				continue;
			}

			if (char === '{' || char === '[') {
				stack.push(char);
				continue;
			}

			if (char === '}' || char === ']') {
				const open = stack.pop();
				const isMatch = (open === '{' && char === '}') || (open === '[' && char === ']');
				if (!isMatch) {
					break;
				}
				if (stack.length === 0) {
					end = i;
					break;
				}
			}
		}

		if (end < 0) {
			cursor = start + 1;
			continue;
		}

		segments.push(raw.slice(start, end + 1));
		cursor = end + 1;
	}

	return segments;
}

function parseMergedJsonObjectSegments(raw: string): Record<string, any> | null {
	const segments = extractBalancedJsonObjectSegments(raw);
	if (segments.length === 0) {
		return null;
	}

	const parsedObjects: Record<string, any>[] = [];
	for (const segment of segments) {
		const parsed = parseToolArgumentObject(segment);
		if (parsed.value) {
			parsedObjects.push(parsed.value);
		}
	}

	if (parsedObjects.length === 0) {
		return null;
	}
	if (parsedObjects.length === 1) {
		return parsedObjects[0] ?? null;
	}
	return Object.assign({}, ...parsedObjects);
}

function parseMergedJsonStringObjectSegments(raw: string): Record<string, any> | null {
	const literalPattern = /"(?:\\.|[^"\\])*"/g;
	const matches = raw.match(literalPattern);
	if (!matches || matches.length === 0) {
		return null;
	}

	const parsedObjects: Record<string, any>[] = [];
	for (const literal of matches.slice(0, MAX_TOOL_ARG_SEGMENTS)) {
		let parsedLiteral: unknown;
		try {
			parsedLiteral = JSON.parse(literal);
		} catch {
			continue;
		}

		if (typeof parsedLiteral !== 'string') {
			continue;
		}

		const nested = parseToolArgumentObject(parsedLiteral);
		if (nested.value) {
			parsedObjects.push(nested.value);
		}
	}

	if (parsedObjects.length === 0) {
		return null;
	}
	if (parsedObjects.length === 1) {
		return parsedObjects[0] ?? null;
	}
	return Object.assign({}, ...parsedObjects);
}

function recoverToolArgumentObject(raw: string): Record<string, any> | null {
	const stripped = stripMarkdownCodeFence(raw);
	const direct = parseToolArgumentObject(stripped);
	if (direct.value) {
		return direct.value;
	}

	const mergedSegments = parseMergedJsonObjectSegments(stripped);
	if (mergedSegments) {
		return mergedSegments;
	}

	const mergedStringSegments = parseMergedJsonStringObjectSegments(stripped);
	if (mergedStringSegments) {
		return mergedStringSegments;
	}

	const firstBrace = stripped.indexOf('{');
	const lastBrace = stripped.lastIndexOf('}');
	if (firstBrace >= 0 && lastBrace > firstBrace) {
		const wrapped = stripped.slice(firstBrace, lastBrace + 1).trim();
		const parsedWrapped = parseToolArgumentObject(wrapped);
		if (parsedWrapped.value) {
			return parsedWrapped.value;
		}
		const mergedWrapped = parseMergedJsonObjectSegments(wrapped);
		if (mergedWrapped) {
			return mergedWrapped;
		}
	}

	return null;
}

function extractGatewayPathCandidate(raw: string): string | null {
	const pathPattern =
		/\b(root|onto(?:\.[a-z0-9_]+)*|cal(?:\.[a-z0-9_]+)*|util(?:\.[a-z0-9_]+)*)\b/i;
	const match = raw.match(pathPattern);
	if (!match || !match[1]) {
		return null;
	}
	const candidate = match[1].trim();
	return candidate.length > 0 ? candidate : null;
}

function extractGatewayOpCandidate(raw: string): string | null {
	const opPattern = /\b(?:onto|cal|util)\.[a-z0-9_]+(?:\.[a-z0-9_]+){1,6}\b/i;
	const match = raw.match(opPattern);
	if (!match || !match[0]) {
		return null;
	}
	const candidate = match[0].trim();
	return candidate.length > 0 ? normalizeGatewayOpName(candidate) : null;
}

function isGatewaySchemaToolName(toolName: string): boolean {
	return toolName === 'tool_help' || toolName === 'tool_schema';
}

function isGatewaySkillLoadToolName(toolName: string): boolean {
	return toolName === 'skill_load';
}

function buildGatewayFallbackArgs(toolName: string, rawArgs: string): Record<string, any> | null {
	const recoveredObject = recoverToolArgumentObject(rawArgs);

	if (isGatewaySchemaToolName(toolName)) {
		if (toolName === 'tool_schema') {
			if (recoveredObject) {
				const op =
					typeof recoveredObject.op === 'string'
						? normalizeGatewayOpName(recoveredObject.op)
						: typeof recoveredObject.path === 'string'
							? normalizeGatewayOpName(recoveredObject.path)
							: '';
				if (op) {
					return { ...recoveredObject, op };
				}
			}
			const opCandidate = extractGatewayOpCandidate(rawArgs);
			return opCandidate ? { op: opCandidate } : null;
		}

		if (recoveredObject && typeof recoveredObject.path === 'string') {
			const path = recoveredObject.path.trim();
			if (path.length > 0) {
				return { ...recoveredObject, path };
			}
		}

		const pathCandidate = extractGatewayPathCandidate(rawArgs);
		if (pathCandidate) {
			return { path: pathCandidate };
		}
		return null;
	}

	if (isGatewaySkillLoadToolName(toolName)) {
		if (recoveredObject) {
			const skill =
				typeof recoveredObject.skill === 'string'
					? recoveredObject.skill.trim()
					: typeof recoveredObject.id === 'string'
						? recoveredObject.id.trim()
						: typeof recoveredObject.path === 'string'
							? recoveredObject.path.trim()
							: '';
			if (skill) {
				return { ...recoveredObject, skill };
			}
		}
		return null;
	}

	if (!isGatewayExecToolName(toolName)) {
		return null;
	}

	if (recoveredObject) {
		const op =
			typeof recoveredObject.op === 'string'
				? normalizeGatewayOpName(recoveredObject.op)
				: '';
		const input = readGatewayExecInput(recoveredObject);
		const fallbackOp = op || extractGatewayOpCandidate(rawArgs) || '';
		if (fallbackOp) {
			return buildGatewayExecPayload(toolName, {
				op: fallbackOp,
				input,
				dry_run: recoveredObject.dry_run,
				idempotency_key:
					typeof recoveredObject.idempotency_key === 'string'
						? recoveredObject.idempotency_key
						: undefined
			});
		}
	}

	const opCandidate = extractGatewayOpCandidate(rawArgs);
	if (opCandidate) {
		return buildGatewayExecPayload(toolName, {
			op: opCandidate,
			input: {}
		});
	}

	return null;
}

function injectGatewayExecutionDefaults(
	args: Record<string, any>,
	projectId?: string,
	toolName: string = PRIMARY_GATEWAY_EXEC_TOOL_NAME
): Record<string, any> {
	const normalizedOp = typeof args.op === 'string' ? normalizeGatewayOpName(args.op) : '';
	const rawOpArgs = readGatewayExecInput(args);
	const effectiveProjectId =
		typeof projectId === 'string' && projectId.trim().length > 0 ? projectId.trim() : null;

	if (!normalizedOp || !effectiveProjectId || 'project_id' in rawOpArgs) {
		return buildGatewayExecPayload(toolName, {
			op: normalizedOp || args.op,
			input: rawOpArgs,
			dry_run: args.dry_run,
			idempotency_key:
				typeof args.idempotency_key === 'string' ? args.idempotency_key : undefined
		});
	}

	const schema = getToolRegistry().ops[normalizedOp]?.parameters_schema;
	const requiresProjectId =
		Array.isArray((schema as Record<string, any> | undefined)?.required) &&
		((schema as Record<string, any>).required as string[]).includes('project_id');
	const shouldInjectProjectId = requiresProjectId || normalizedOp === 'util.project.overview';

	return buildGatewayExecPayload(toolName, {
		op: normalizedOp,
		input: shouldInjectProjectId
			? {
					...rawOpArgs,
					project_id: effectiveProjectId
				}
			: rawOpArgs,
		dry_run: args.dry_run,
		idempotency_key: typeof args.idempotency_key === 'string' ? args.idempotency_key : undefined
	});
}
