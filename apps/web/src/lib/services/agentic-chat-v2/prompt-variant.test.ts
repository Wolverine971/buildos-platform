// apps/web/src/lib/services/agentic-chat-v2/prompt-variant.test.ts
import { describe, expect, it } from 'vitest';
import { LITE_PROMPT_VARIANT } from '$lib/services/agentic-chat-lite/prompt';
import { FASTCHAT_PROMPT_VARIANT } from './prompt-variant';

describe('prompt variant labels', () => {
	it('exposes the live lite variant label', () => {
		expect(LITE_PROMPT_VARIANT).toBe('lite_seed_v1');
	});

	it('retains the legacy fastchat label for historical snapshots', () => {
		expect(FASTCHAT_PROMPT_VARIANT).toBe('fastchat_prompt_v1');
	});
});
