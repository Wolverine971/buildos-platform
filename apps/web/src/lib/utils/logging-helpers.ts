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

const SENSITIVE_KEY_PATTERN =
	/(?:^|[_-])(?:authorization|cookie|credentials?|password|passwd|private[_-]?key|api[_-]?keys?|client[_-]?secret|access[_-]?token|refresh[_-]?token|id[_-]?token|webhook[_-]?token|sync[_-]?token|session|secret|token)(?:$|[_-])/i;

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_REGEX = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const PRIVATE_KEY_REGEX =
	/-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----/gi;
const AUTH_HEADER_REGEX = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/-]+=*/gi;
const JWT_REGEX = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const KNOWN_SECRET_REGEXES = [
	/\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/g,
	/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
	/\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g,
	/\bgh[pousr]_[A-Za-z0-9_]{30,}\b/g,
	/\bxox[baprs]-[A-Za-z0-9-]{16,}\b/g,
	/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
	/\bAIza[0-9A-Za-z_-]{30,}\b/g
];
const ASSIGNMENT_SECRET_REGEX =
	/(\b(?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret|password|passwd|authorization|cookie|secret)\b\s*[:=]\s*["']?)[^"'\s,;&}]+/gi;

function isSensitiveKey(key: string, explicitlyRedacted: Set<string>): boolean {
	const lowercase = key.toLowerCase();
	const normalized = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
	return (
		explicitlyRedacted.has(lowercase) ||
		explicitlyRedacted.has(normalized) ||
		SENSITIVE_KEY_PATTERN.test(normalized)
	);
}

function redactText(value: string): string {
	let redacted = value
		.replace(PRIVATE_KEY_REGEX, '[redacted-private-key]')
		.replace(AUTH_HEADER_REGEX, '$1 [redacted]')
		.replace(JWT_REGEX, '[redacted-jwt]')
		.replace(ASSIGNMENT_SECRET_REGEX, '$1[redacted]')
		.replace(EMAIL_REGEX, '[redacted-email]')
		.replace(PHONE_REGEX, '[redacted-phone]');

	for (const pattern of KNOWN_SECRET_REGEXES) {
		redacted = redacted.replace(pattern, '[redacted-secret]');
	}

	return redacted;
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
				stack: target.stack ? sanitizeLogText(target.stack, maxStringLength * 4) : undefined
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
			if (isSensitiveKey(key, redactedKeySet)) {
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
