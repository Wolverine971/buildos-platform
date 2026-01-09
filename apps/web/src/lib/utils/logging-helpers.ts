// apps/web/src/lib/utils/logging-helpers.ts
/**
 * Logging helpers for redaction and truncation.
 */

const DEFAULT_MAX_STRING_LENGTH = 160;
const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MAX_ENTRIES = 20;

const DEFAULT_REDACT_KEYS = new Set([
	'content',
	'message',
	'userMessage',
	'prompt',
	'systemPrompt',
	'rawArguments',
	'arguments',
	'tool_result',
	'toolResult',
	'toolResults',
	'messages'
]);

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_REGEX = /(?:\+?\d[\d\s().-]{7,}\d)/g;

function redactText(value: string): string {
	return value.replace(EMAIL_REGEX, '[redacted-email]').replace(PHONE_REGEX, '[redacted-phone]');
}

function truncateText(value: string, maxLength: number): string {
	if (value.length <= maxLength) {
		return value;
	}
	return `${value.slice(0, maxLength)}...`;
}

export function sanitizeLogText(value: string, maxLength = DEFAULT_MAX_STRING_LENGTH): string {
	return truncateText(redactText(value ?? ''), maxLength);
}

export function sanitizeLogData(
	value: unknown,
	options: {
		maxStringLength?: number;
		maxDepth?: number;
		maxEntries?: number;
		redactedKeys?: string[];
	} = {}
): unknown {
	const {
		maxStringLength = DEFAULT_MAX_STRING_LENGTH,
		maxDepth = DEFAULT_MAX_DEPTH,
		maxEntries = DEFAULT_MAX_ENTRIES,
		redactedKeys = []
	} = options;
	const redactedKeySet = new Set(
		[...DEFAULT_REDACT_KEYS, ...redactedKeys].map((key) => key.toLowerCase())
	);

	const sanitize = (target: unknown, depth: number): unknown => {
		if (target === null || target === undefined) {
			return target;
		}
		if (typeof target === 'string') {
			return sanitizeLogText(target, maxStringLength);
		}
		if (target instanceof Date) {
			return target.toISOString();
		}
		if (target instanceof Error) {
			return {
				name: target.name,
				message: sanitizeLogText(target.message, maxStringLength),
				stack: target.stack
			};
		}
		if (typeof target !== 'object') {
			return target;
		}
		if (depth >= maxDepth) {
			return '[truncated]';
		}
		if (Array.isArray(target)) {
			const items = target.slice(0, maxEntries).map((item) => sanitize(item, depth + 1));
			if (target.length > maxEntries) {
				items.push(`[${target.length - maxEntries} more items truncated]`);
			}
			return items;
		}

		const entries = Object.entries(target as Record<string, unknown>);
		const sliced = entries.slice(0, maxEntries);
		const sanitized: Record<string, unknown> = {};

		for (const [key, val] of sliced) {
			if (redactedKeySet.has(key.toLowerCase())) {
				sanitized[key] = '[redacted]';
				continue;
			}
			sanitized[key] = sanitize(val, depth + 1);
		}

		if (entries.length > maxEntries) {
			sanitized._truncated = `+${entries.length - maxEntries} keys`;
		}

		return sanitized;
	};

	return sanitize(value, 0);
}
