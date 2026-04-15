// apps/web/src/lib/services/agentic-chat-v2/prompt-variant.ts
import {
	LITE_PROMPT_VARIANT,
	type LitePromptVariant
} from '$lib/services/agentic-chat-lite/prompt/types';

export const FASTCHAT_PROMPT_VARIANT = 'fastchat_prompt_v1' as const;

export type FastChatPromptVariant = typeof FASTCHAT_PROMPT_VARIANT | LitePromptVariant;

export type FastChatPromptVariantResolution =
	| {
			ok: true;
			promptVariant: FastChatPromptVariant;
			requestedPromptVariant: FastChatPromptVariant | null;
			requiresAdminOrDev: boolean;
	  }
	| {
			ok: false;
			error: string;
	  };

export function isLitePromptVariant(
	promptVariant: FastChatPromptVariant
): promptVariant is LitePromptVariant {
	return promptVariant === LITE_PROMPT_VARIANT;
}

export function normalizeFastChatPromptVariantRequest(
	value: unknown
): FastChatPromptVariantResolution {
	if (value === undefined || value === null || value === '') {
		return {
			ok: true,
			promptVariant: FASTCHAT_PROMPT_VARIANT,
			requestedPromptVariant: null,
			requiresAdminOrDev: false
		};
	}

	if (typeof value !== 'string') {
		return {
			ok: false,
			error: 'prompt_variant must be a string when provided'
		};
	}

	const normalized = value.trim();
	if (!normalized || normalized === FASTCHAT_PROMPT_VARIANT) {
		return {
			ok: true,
			promptVariant: FASTCHAT_PROMPT_VARIANT,
			requestedPromptVariant: normalized ? FASTCHAT_PROMPT_VARIANT : null,
			requiresAdminOrDev: false
		};
	}

	if (normalized === LITE_PROMPT_VARIANT) {
		return {
			ok: true,
			promptVariant: LITE_PROMPT_VARIANT,
			requestedPromptVariant: LITE_PROMPT_VARIANT,
			requiresAdminOrDev: true
		};
	}

	return {
		ok: false,
		error: `Unsupported prompt_variant: ${normalized}`
	};
}
