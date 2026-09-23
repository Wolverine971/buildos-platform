// apps/worker/src/workers/agentic-chat/provider/openrouter/retry.ts
// Retry classification and failure attribution for provider responses and
// error frames. Nothing here performs I/O beyond reading a bounded error body.
import type { AgenticChatOpenAiCompatibleRouteV1, RouteFailure } from './types';
import {
	canonicalError,
	canonicalOptionalText,
	normalizeProviderSlug,
	requireRecord
} from './canonical';
import { AgenticChatProviderNetworkError } from './errors';

/**
 * The failing response's message and, when the gateway reported it, the
 * upstream that produced the failure. OpenRouter names it as
 * `error.metadata.provider_name`; a direct OpenAI-compatible endpoint names
 * nothing, and the caller falls back to the endpoint the request was pinned to.
 */
export async function responseError(
	response: Response
): Promise<{ message: string; providerSlug: string | null }> {
	const text = (await readBoundedResponseText(response, 16 * 1024)).trim().slice(0, 2_000);
	if (!text) {
		return {
			message: response.statusText || 'provider request failed',
			providerSlug: null
		};
	}
	try {
		const parsed = JSON.parse(text) as unknown;
		if (parsed !== null && typeof parsed === 'object') {
			const root = parsed as Record<string, unknown>;
			const error =
				root.error !== null && typeof root.error === 'object'
					? (root.error as Record<string, unknown>)
					: root;
			const metadata =
				error.metadata !== null && typeof error.metadata === 'object'
					? (error.metadata as Record<string, unknown>)
					: {};
			const providerSlug =
				normalizeProviderSlug(canonicalOptionalText(metadata.provider_slug)) ??
				normalizeProviderSlug(canonicalOptionalText(metadata.provider_name)) ??
				normalizeProviderSlug(canonicalOptionalText(metadata.provider)) ??
				normalizeProviderSlug(canonicalOptionalText(root.provider_slug)) ??
				normalizeProviderSlug(canonicalOptionalText(root.provider));
			if (typeof error.message === 'string' && error.message.trim()) {
				return { message: error.message.trim().slice(0, 2_000), providerSlug };
			}
			return { message: text, providerSlug };
		}
	} catch {
		// Plain-text provider errors are returned below.
	}
	return { message: text, providerSlug: null };
}

/**
 * The endpoint a failed attempt can honestly be blamed for. Either the error
 * named it (the gateway's `provider_name`, or the ordered endpoint a timed-out
 * request went to first), or the request was constrained to exactly one
 * upstream and could have reached no other. An unconstrained request that
 * fails names nothing: ignoring a provider it may never have touched would
 * shrink the pool for the rest of the turn on no evidence.
 */
export function attributedProviderSlug(
	route: AgenticChatOpenAiCompatibleRouteV1,
	error: unknown
): string | null {
	if (error instanceof AgenticChatProviderNetworkError && error.providerSlug) {
		return error.providerSlug;
	}
	if (route.kind !== 'openrouter') return null;
	const only = route.providerRouting?.only;
	return only?.length === 1 ? normalizeProviderSlug(only[0]) : null;
}

/** The single endpoint a request's `order` sends it to first, when it names one. */
export function orderedProviderSlug(route: AgenticChatOpenAiCompatibleRouteV1): string | null {
	if (route.kind !== 'openrouter') return null;
	const order = route.providerRouting?.order;
	return order?.length === 1 ? normalizeProviderSlug(order[0]) : null;
}

async function readBoundedResponseText(response: Response, maximumBytes: number): Promise<string> {
	const reader = response.body?.getReader();
	if (!reader) return '';
	const decoder = new TextDecoder();
	let text = '';
	let remaining = maximumBytes;
	try {
		while (remaining > 0) {
			const chunk = await reader.read();
			if (chunk.done) break;
			const accepted = chunk.value.subarray(0, remaining);
			remaining -= accepted.byteLength;
			text += decoder.decode(accepted, { stream: true });
			if (accepted.byteLength < chunk.value.byteLength) break;
		}
		text += decoder.decode();
		return text;
	} finally {
		await reader.cancel().catch(() => undefined);
	}
}

export function routeFailure(routeId: string, error: unknown): RouteFailure {
	return {
		routeId,
		message: canonicalError(error),
		retryable:
			error instanceof AgenticChatProviderNetworkError
				? error.retryable
				: isRetryableUnknownError(error)
	};
}

export function isRetryableUnknownError(error: unknown): boolean {
	return error instanceof TypeError || retryableMessage(canonicalError(error));
}

export function isRetryableStatus(status: number): boolean {
	return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function retryableMessage(message: string): boolean {
	return /rate.?limit|temporar|timeout|timed out|overload|unavailable|connection|network/i.test(
		message
	);
}

function numericStatus(value: unknown): number | null {
	const status = typeof value === 'string' && /^\d{3}$/.test(value) ? Number(value) : value;
	return Number.isSafeInteger(status) && (status as number) >= 100 && (status as number) <= 599
		? (status as number)
		: null;
}

/** Message and retry class of an SSE `error` frame. */
export function providerFrameError(value: unknown): { message: string; retryable: boolean } {
	if (typeof value === 'string') {
		return { message: canonicalError(value), retryable: retryableMessage(value) };
	}
	const error = requireRecord(value, 'provider error');
	const message = canonicalError(
		error.message ?? 'Agentic Chat provider returned an error frame'
	);
	const status = numericStatus(error.code ?? error.status);
	return {
		message,
		retryable: status === null ? retryableMessage(message) : isRetryableStatus(status)
	};
}
