// packages/smart-llm/src/errors.ts

import type { OpenRouterMessageContentSummary, OpenRouterResponse } from './types';

export class OpenRouterEmptyContentError extends Error {
	public override name = 'OpenRouterEmptyContentError';
	public details: Record<string, unknown>;

	constructor(message: string, details: Record<string, unknown>) {
		super(message);
		this.details = details;
	}
}

export type OpenRouterErrorMetadata = {
	status?: number;
	message?: string;
	error?: Record<string, unknown> | null;
	metadata?: Record<string, unknown> | null;
	providerName?: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object';

const getStringField = (value: Record<string, unknown> | null, key: string): string | undefined => {
	if (!value) return undefined;
	const field = value[key];
	return typeof field === 'string' ? field : undefined;
};

export function parseOpenRouterErrorMetadata(error: unknown): OpenRouterErrorMetadata {
	if (!error || typeof error !== 'object') {
		return {};
	}

	const maybeError = error as {
		status?: number;
		message?: string;
		openrouter?: unknown;
	};
	const openrouter = isRecord(maybeError.openrouter)
		? (maybeError.openrouter as Record<string, unknown>)
		: null;
	const errorObject = isRecord(openrouter?.error)
		? (openrouter?.error as Record<string, unknown>)
		: null;
	const metadata = isRecord(errorObject?.metadata)
		? (errorObject?.metadata as Record<string, unknown>)
		: isRecord(openrouter?.metadata)
			? (openrouter?.metadata as Record<string, unknown>)
			: null;
	const providerName =
		getStringField(metadata, 'provider_name') ??
		getStringField(openrouter, 'providerName') ??
		getStringField(openrouter, 'provider_name') ??
		null;
	const message =
		getStringField(errorObject, 'message') ??
		(typeof maybeError.message === 'string' ? maybeError.message : undefined);

	return {
		status: maybeError.status,
		message,
		error: errorObject,
		metadata,
		providerName
	};
}

export function isOpenRouterProviderError(error: unknown): boolean {
	const metadata = parseOpenRouterErrorMetadata(error);
	const message = typeof metadata.message === 'string' ? metadata.message.toLowerCase() : '';

	if (message.includes('provider returned error')) {
		return true;
	}

	return Boolean(metadata.providerName);
}

export function isRetryableOpenRouterError(error: unknown): boolean {
	if (!error || typeof error !== 'object') {
		return false;
	}

	const maybeError = error as { status?: number; message?: string; code?: string; name?: string };
	const status = maybeError.status;

	if (status === 408 || status === 409 || status === 429) {
		return true;
	}

	if (status && status >= 500 && status < 600) {
		return true;
	}

	const code = typeof maybeError.code === 'string' ? maybeError.code.toUpperCase() : '';
	if (
		code === 'ETIMEDOUT' ||
		code === 'ECONNRESET' ||
		code === 'ECONNREFUSED' ||
		code === 'EAI_AGAIN' ||
		code === 'UND_ERR_CONNECT_TIMEOUT' ||
		code === 'UND_ERR_HEADERS_TIMEOUT' ||
		code === 'UND_ERR_SOCKET' ||
		code === 'UND_ERR_ABORTED'
	) {
		return true;
	}

	if (maybeError.name === 'AbortError') {
		return true;
	}

	const message = typeof maybeError.message === 'string' ? maybeError.message.toLowerCase() : '';
	if (message.includes('timeout') || message.includes('timed out')) {
		return true;
	}
	if (
		message.includes('terminated') ||
		message.includes('aborted') ||
		message.includes('connection reset') ||
		message.includes('socket hang up') ||
		message.includes('fetch failed') ||
		message.includes('network error')
	) {
		return true;
	}
	if (message.includes('rate limit')) {
		return true;
	}
	if (message.includes('provider returned error')) {
		return true;
	}

	return isOpenRouterProviderError(error);
}

export function summarizeOpenRouterMessageContent(
	content: unknown
): OpenRouterMessageContentSummary {
	const contentType =
		content === undefined
			? 'undefined'
			: content === null
				? 'null'
				: Array.isArray(content)
					? 'array'
					: (typeof content as OpenRouterMessageContentSummary['contentType']);

	if (contentType === 'string') {
		const value = content as string;
		return {
			contentType,
			stringLength: value.length,
			trimmedStringLength: value.trim().length
		};
	}

	if (contentType === 'object') {
		const keys = Object.keys(content as Record<string, unknown>);
		return {
			contentType,
			objectKeys: keys.slice(0, 25)
		};
	}

	if (contentType !== 'array') {
		return { contentType };
	}

	const partTypeCounts: Record<string, number> = {};
	const textLengthByType: Record<string, number> = {};
	let reasoningTextLength = 0;
	let nonReasoningTextLength = 0;

	const reasoningTypes = new Set(['reasoning', 'analysis', 'thinking', 'system']);
	const parts = content as unknown[];

	for (const part of parts) {
		let partType = 'unknown';
		let partTextLength = 0;

		if (typeof part === 'string') {
			partType = 'string';
			partTextLength = part.length;
		} else if (part && typeof part === 'object') {
			const partValue = part as {
				type?: string;
				text?: string | { value?: string };
				value?: string;
				content?: string;
			};
			if (typeof partValue.type === 'string' && partValue.type.trim().length > 0) {
				partType = partValue.type.trim().toLowerCase();
			}
			if (typeof partValue.text === 'string') {
				partTextLength = partValue.text.length;
			} else if (partValue.text && typeof partValue.text.value === 'string') {
				partTextLength = partValue.text.value.length;
			} else if (typeof partValue.value === 'string') {
				partTextLength = partValue.value.length;
			} else if (typeof partValue.content === 'string') {
				partTextLength = partValue.content.length;
			}
		}

		partTypeCounts[partType] = (partTypeCounts[partType] || 0) + 1;
		textLengthByType[partType] = (textLengthByType[partType] || 0) + partTextLength;

		if (reasoningTypes.has(partType)) {
			reasoningTextLength += partTextLength;
		} else {
			nonReasoningTextLength += partTextLength;
		}
	}

	return {
		contentType,
		partCount: parts.length,
		partTypeCounts,
		textLengthByType,
		reasoningTextLength,
		nonReasoningTextLength
	};
}

export function buildOpenRouterEmptyContentError(params: {
	operation: string;
	requestedModel: string;
	response: OpenRouterResponse;
	choice?: OpenRouterResponse['choices'][0];
	extractedText: string | null;
}): OpenRouterEmptyContentError {
	const { operation, requestedModel, response, choice, extractedText } = params;
	const actualModel = response.model || requestedModel;

	const toolCallsRaw = choice?.message?.tool_calls;
	const toolCalls = Array.isArray(toolCallsRaw) ? toolCallsRaw : [];
	const toolCallNames = toolCalls
		.map((call) => call?.function?.name)
		.filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
		.slice(0, 10);

	const contentSummary = summarizeOpenRouterMessageContent(choice?.message?.content);
	const finishReason = choice?.finish_reason;
	const nativeFinishReason = choice?.native_finish_reason;

	let inferredCause: string = 'unknown';
	if (toolCalls.length > 0) {
		inferredCause = 'tool_calls_without_text';
	} else if (
		contentSummary.contentType === 'null' ||
		contentSummary.contentType === 'undefined'
	) {
		inferredCause = 'null_content';
	} else if (
		contentSummary.contentType === 'string' &&
		(contentSummary.trimmedStringLength ?? 0) === 0
	) {
		inferredCause = 'empty_string';
	} else if (
		contentSummary.contentType === 'array' &&
		(contentSummary.nonReasoningTextLength ?? 0) === 0 &&
		(contentSummary.reasoningTextLength ?? 0) > 0
	) {
		inferredCause = 'reasoning_only';
	} else if (finishReason === 'length') {
		inferredCause = 'length_without_text';
	}

	const details: Record<string, unknown> = {
		operation,
		inferredCause,
		requestedModel,
		actualModel,
		openrouterProvider: response.provider ?? null,
		openrouterRequestId: response.id,
		finishReason: finishReason ?? null,
		nativeFinishReason: nativeFinishReason ?? null,
		systemFingerprint: response.system_fingerprint ?? null,
		messageRole: choice?.message?.role ?? null,
		toolCallCount: toolCalls.length,
		toolCallNames,
		contentSummary,
		extractedTextLength: typeof extractedText === 'string' ? extractedText.length : null,
		choiceTextLength: typeof choice?.text === 'string' ? choice.text.length : null,
		usage: response.usage
			? {
					prompt_tokens: response.usage.prompt_tokens ?? null,
					completion_tokens: response.usage.completion_tokens ?? null,
					total_tokens: response.usage.total_tokens ?? null,
					reasoning_tokens:
						response.usage.completion_tokens_details?.reasoning_tokens ?? null
				}
			: null,
		openrouterError: response.error ?? null
	};

	const message = `OpenRouter returned empty content (cause=${inferredCause}, finish_reason=${finishReason ?? 'unknown'}, model=${actualModel}, provider=${response.provider ?? 'unknown'}, requestId=${response.id})`;
	return new OpenRouterEmptyContentError(message, details);
}
