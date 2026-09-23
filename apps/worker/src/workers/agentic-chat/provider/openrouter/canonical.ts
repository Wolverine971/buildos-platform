// apps/worker/src/workers/agentic-chat/provider/openrouter/canonical.ts
// Canonical value checks shared by the OpenRouter client modules. Several look
// like helpers elsewhere in agentic-chat but differ in error type or fallback
// text, so they stay local to keep this client's messages byte-identical.
import type { AgenticChatProviderPassRoleV1 } from '../contracts';
import { AgenticChatProviderNetworkError } from './errors';

export function canonicalProviderAttempt(value: number | undefined): number {
	const attempt = value ?? 1;
	if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 8) {
		throw new Error('Agentic Chat provider attempt must be between 1 and 8');
	}
	return attempt;
}

export function canonicalProviderPassRole(
	value: AgenticChatProviderPassRoleV1 | undefined
): AgenticChatProviderPassRoleV1 {
	const role = value ?? 'acting';
	if (
		role !== 'acting' &&
		role !== 'contract_review' &&
		role !== 'mutation_review' &&
		role !== 'research_review' &&
		role !== 'repair' &&
		role !== 'final_response'
	) {
		throw new Error('Agentic Chat provider pass role is invalid');
	}
	return role;
}

export function estimateTokens(chars: number): number {
	return Math.ceil(chars / 4);
}

export function boundedDuration(startedAtMs: number, observedAtMs: number): number {
	return Math.min(2_147_483_647, Math.max(0, Math.floor(observedAtMs - startedAtMs)));
}

export function canonicalError(value: unknown): string {
	const message = value instanceof Error ? value.message : String(value ?? '');
	return message.trim().slice(0, 2_000) || 'Agentic Chat provider request failed';
}

export function canonicalOptionalHeader(value: string | null): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed.slice(0, 512) : null;
}

export function canonicalOptionalText(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim().slice(0, 512) : null;
}

const PROVIDER_DISPLAY_NAME_ALIASES: Readonly<Record<string, string>> = Object.freeze({
	'baidu qianfan': 'baidu',
	'digital ocean': 'digitalocean',
	'google vertex': 'google-vertex',
	'moonshot ai': 'moonshotai',
	nvidia: 'nvidia',
	'weights & biases': 'wandb',
	'z.ai': 'z-ai'
});

export function normalizeProviderSlug(value: string | null | undefined): string | null {
	const normalized = value?.trim().toLowerCase();
	if (!normalized) return null;
	const alias = PROVIDER_DISPLAY_NAME_ALIASES[normalized];
	if (alias) return alias;
	return /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/.test(normalized) ? normalized : null;
}

export function canonicalRequiredText(value: unknown, label: string, maximum: number): string {
	if (
		typeof value !== 'string' ||
		!value.trim() ||
		value !== value.trim() ||
		value.length > maximum
	) {
		throw new AgenticChatProviderNetworkError(
			`Agentic Chat provider ${label} is invalid`,
			false
		);
	}
	return value;
}

export function canonicalHeaderValue(value: string, label: string): string {
	if (
		typeof value !== 'string' ||
		!value.trim() ||
		value !== value.trim() ||
		value.length > 512 ||
		/[\r\n]/.test(value)
	) {
		throw new Error(`Agentic Chat provider ${label} is invalid`);
	}
	return value;
}

export function canonicalSecret(value: string): string {
	if (
		typeof value !== 'string' ||
		!value.trim() ||
		value !== value.trim() ||
		value.length > 2_048 ||
		/[\r\n]/.test(value)
	) {
		throw new Error('Agentic Chat provider API key is invalid');
	}
	return value;
}

export function canonicalModel(value: string): string {
	if (
		typeof value !== 'string' ||
		!value.trim() ||
		value !== value.trim() ||
		value.length > 256
	) {
		throw new Error('Agentic Chat provider model is invalid');
	}
	return value;
}

export function canonicalRoutingName(value: string, label: string): string {
	if (
		typeof value !== 'string' ||
		!value.trim() ||
		value !== value.trim() ||
		value.length > 128 ||
		!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)
	) {
		throw new Error(`Agentic Chat ${label} contains an invalid name`);
	}
	return value;
}

export function uniqueModels(values: readonly string[]): string[] {
	return Array.from(new Set(values.map(canonicalModel)));
}

export function boundedInteger(
	value: number,
	label: string,
	minimum: number,
	maximum: number
): number {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
		throw new Error(`Agentic Chat provider ${label} must be between ${minimum} and ${maximum}`);
	}
	return value;
}

export function nonnegativeInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function finiteNonnegativeNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function requireRecord(value: unknown, label: string): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new AgenticChatProviderNetworkError(`Agentic Chat ${label} is malformed`, false);
	}
	return value as Record<string, unknown>;
}

export function throwAbort(signal: AbortSignal): never {
	throw signal.reason instanceof Error ? signal.reason : new Error('Execution aborted');
}
