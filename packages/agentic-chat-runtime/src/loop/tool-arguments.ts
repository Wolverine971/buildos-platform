// packages/agentic-chat-runtime/src/loop/tool-arguments.ts

const MAX_TOOL_ARG_PARSE_DEPTH = 3;
const MAX_TOOL_ARG_SEGMENTS = 8;

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
