// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-failure.ts

export type ToolFailureKind =
	| 'validation'
	| 'missing_required_parameter'
	| 'invalid_argument'
	| 'not_found'
	| 'permission'
	| 'timeout'
	| 'tool_not_loaded'
	| 'transport'
	| 'execution';

export type ToolFailure = {
	kind: ToolFailureKind;
	toolName?: string | null;
	canonicalOp?: string | null;
	field?: string | null;
	message: string;
	retryable: boolean;
	userRecoverable: boolean;
};

export type ClassifyToolFailureParams = {
	message?: unknown;
	error?: unknown;
	toolName?: string | null;
	canonicalOp?: string | null;
	field?: string | null;
};

const REQUIRED_PARAMETER_PATTERN = /Missing required parameter:\s*([a-zA-Z0-9_.-]+)/i;
const INVALID_ARGUMENT_PATTERN = /\bInvalid\s+([a-zA-Z0-9_.-]+):/i;

export function parseRequiredParameterFailure(message: string): string | null {
	const match = message.match(REQUIRED_PARAMETER_PATTERN);
	return match?.[1] ?? null;
}

export function parseInvalidArgumentFailure(message: string): string | null {
	const match = message.match(INVALID_ARGUMENT_PATTERN);
	return match?.[1] ?? null;
}

export function classifyToolFailure(
	params: ClassifyToolFailureParams | string | null | undefined
): ToolFailure | null {
	const input = normalizeClassifyParams(params);
	const message = normalizeMessage(input.message ?? input.error);
	if (!message) return null;

	const explicitField = normalizeOptionalString(input.field);
	const toolName = normalizeOptionalString(input.toolName);
	const canonicalOp = normalizeOptionalString(input.canonicalOp);
	const normalized = message.toLowerCase();

	const requiredField = parseRequiredParameterFailure(message);
	if (requiredField) {
		return buildToolFailure({
			kind: 'missing_required_parameter',
			message,
			toolName,
			canonicalOp,
			field: explicitField ?? requiredField,
			retryable: true,
			userRecoverable: true
		});
	}

	const invalidField = parseInvalidArgumentFailure(message);
	if (invalidField) {
		return buildToolFailure({
			kind: 'invalid_argument',
			message,
			toolName,
			canonicalOp,
			field: explicitField ?? invalidField,
			retryable: true,
			userRecoverable: true
		});
	}

	if (normalized.includes('validation') || normalized.includes('no update fields provided')) {
		return buildToolFailure({
			kind: 'validation',
			message,
			toolName,
			canonicalOp,
			field: explicitField,
			retryable: true,
			userRecoverable: true
		});
	}

	if (normalized.includes('not found') || normalized.includes('missing')) {
		return buildToolFailure({
			kind: 'not_found',
			message,
			toolName,
			canonicalOp,
			field: explicitField,
			retryable: true,
			userRecoverable: true
		});
	}

	if (normalized.includes('permission') || normalized.includes('unauthorized')) {
		return buildToolFailure({
			kind: 'permission',
			message,
			toolName,
			canonicalOp,
			field: explicitField,
			retryable: false,
			userRecoverable: true
		});
	}

	if (normalized.includes('timeout') || normalized.includes('timed out')) {
		return buildToolFailure({
			kind: 'timeout',
			message,
			toolName,
			canonicalOp,
			field: explicitField,
			retryable: true,
			userRecoverable: false
		});
	}

	if (
		normalized.includes('tool not loaded') ||
		normalized.includes('tool is not loaded') ||
		normalized.includes('operation not loaded')
	) {
		return buildToolFailure({
			kind: 'tool_not_loaded',
			message,
			toolName,
			canonicalOp,
			field: explicitField,
			retryable: false,
			userRecoverable: false
		});
	}

	if (
		normalized.includes('transport') ||
		normalized.includes('fetch failed') ||
		normalized.includes('network') ||
		normalized.includes('connection') ||
		/\b(?:econnreset|econnrefused|enotfound|socket)\b/i.test(message)
	) {
		return buildToolFailure({
			kind: 'transport',
			message,
			toolName,
			canonicalOp,
			field: explicitField,
			retryable: true,
			userRecoverable: false
		});
	}

	return buildToolFailure({
		kind: 'execution',
		message,
		toolName,
		canonicalOp,
		field: explicitField,
		retryable: false,
		userRecoverable: false
	});
}

export function isValidationFailure(failure: ToolFailure | null): boolean {
	return (
		failure?.kind === 'validation' ||
		failure?.kind === 'missing_required_parameter' ||
		failure?.kind === 'invalid_argument'
	);
}

export function isNotFoundFailure(failure: ToolFailure | null): boolean {
	return failure?.kind === 'not_found';
}

export function buildFailureKey(failure: ToolFailure): string {
	return [
		failure.toolName ?? '',
		failure.canonicalOp ?? '',
		failure.kind,
		failure.field ?? '',
		failure.message
	].join('|');
}

function normalizeClassifyParams(
	params: ClassifyToolFailureParams | string | null | undefined
): ClassifyToolFailureParams {
	if (typeof params === 'string') {
		return { message: params };
	}
	return params ?? {};
}

function normalizeMessage(value: unknown): string | null {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : null;
	}
	if (value === undefined || value === null) {
		return null;
	}
	return String(value).trim() || null;
}

function normalizeOptionalString(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function buildToolFailure(failure: ToolFailure): ToolFailure {
	return failure;
}
