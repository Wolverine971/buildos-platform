// apps/worker/src/workers/agentic-chat/provider/protocol.ts
import type { AgenticChatRecoveryFailureClassV1 } from '@buildos/shared-types';
import {
	type AgenticChatProviderExecutionDiagnosticV1,
	AgenticChatProviderExecutionError,
	type AgenticChatProviderUsageV1,
	type AgenticChatTurnProviderClientEventV1
} from './contracts';

export function normalizeUsage(
	value: Extract<AgenticChatTurnProviderClientEventV1, { type: 'done' }>['usage']
): AgenticChatProviderUsageV1 | null {
	if (!value) return null;
	const promptTokens = value.promptTokens ?? value.prompt_tokens;
	const completionTokens = value.completionTokens ?? value.completion_tokens;
	const totalTokens = value.totalTokens ?? value.total_tokens;
	if (
		!nonnegativeInteger(promptTokens) ||
		!nonnegativeInteger(completionTokens) ||
		!nonnegativeInteger(totalTokens) ||
		totalTokens !== promptTokens + completionTokens
	) {
		throw providerError('provider_invalid_usage', 'unknown');
	}
	return { promptTokens, completionTokens, totalTokens };
}

export function canonicalFinishedReason(value: string | undefined): string {
	if (value === undefined) return 'stop';
	return canonicalRequiredText(value, 'finished reason').slice(0, 256);
}

export function canonicalRequiredText(value: unknown, label: string): string {
	if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
		throw new AgenticChatProviderExecutionError(
			`invalid_${label.replaceAll(' ', '_')}`,
			'permanent',
			`Agentic Chat ${label} is invalid`
		);
	}
	return value;
}

export function requiredContent(value: unknown, label: string): string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new AgenticChatProviderExecutionError(
			`invalid_${label.replaceAll(' ', '_')}`,
			'permanent',
			`Agentic Chat ${label} is invalid`
		);
	}
	return value;
}

export function nullableString(value: unknown, label: string): string | null {
	if (value === null || value === undefined) return null;
	return canonicalRequiredText(value, label);
}

export function requireRecord(value: unknown, label: string): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new AgenticChatProviderExecutionError(
			`invalid_${label.replaceAll(' ', '_')}`,
			'permanent',
			`Agentic Chat ${label} is invalid`
		);
	}
	return value as Record<string, unknown>;
}

export function isCanonicalProviderText(value: unknown, maximum: number): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		value.length <= maximum &&
		value === value.trim()
	);
}

export function canonicalError(value: string): string {
	return value.trim().slice(0, 2_000) || 'Agentic Chat provider failed';
}

export function providerError(
	code: string,
	failureClass: AgenticChatRecoveryFailureClassV1,
	diagnostic: AgenticChatProviderExecutionDiagnosticV1 | null = null
): AgenticChatProviderExecutionError {
	return new AgenticChatProviderExecutionError(
		code,
		failureClass,
		`Agentic Chat read-only provider protocol failed: ${code}`,
		diagnostic
	);
}

export function throwIfAborted(signal: AbortSignal): void {
	if (!signal.aborted) return;
	throw signal.reason instanceof Error ? signal.reason : new Error('Execution aborted');
}

function nonnegativeInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) >= 0;
}
