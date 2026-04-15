// apps/web/src/lib/services/agentic-chat-v2/prompt-variant.test.ts
import { describe, expect, it } from 'vitest';
import { LITE_PROMPT_VARIANT } from '$lib/services/agentic-chat-lite/prompt';
import {
	FASTCHAT_PROMPT_VARIANT,
	isLitePromptVariant,
	normalizeFastChatPromptVariantRequest
} from './prompt-variant';

describe('fast chat prompt variant selector', () => {
	it('defaults to the current v2 prompt variant', () => {
		expect(normalizeFastChatPromptVariantRequest(undefined)).toEqual({
			ok: true,
			promptVariant: FASTCHAT_PROMPT_VARIANT,
			requestedPromptVariant: null,
			requiresAdminOrDev: false
		});
	});

	it('accepts the lite seed variant and marks it gated', () => {
		const result = normalizeFastChatPromptVariantRequest(LITE_PROMPT_VARIANT);

		expect(result).toEqual({
			ok: true,
			promptVariant: LITE_PROMPT_VARIANT,
			requestedPromptVariant: LITE_PROMPT_VARIANT,
			requiresAdminOrDev: true
		});
		expect(result.ok && isLitePromptVariant(result.promptVariant)).toBe(true);
	});

	it('rejects unsupported prompt variants', () => {
		expect(normalizeFastChatPromptVariantRequest('experimental')).toEqual({
			ok: false,
			error: 'Unsupported prompt_variant: experimental'
		});
	});
});
