// apps/worker/tests/agenticChatConfig.test.ts
import { describe, expect, it } from 'vitest';
import { loadAgenticChatConfig } from '../src/workers/agentic-chat/config';

const DEDICATED_PROVIDER_ENV: NodeJS.ProcessEnv = {
	PRIVATE_OPENROUTER_API_KEY: 'provider-secret',
	AGENTIC_CHAT_OPENROUTER_MODEL: 'deepseek/deepseek-v4-flash'
};

describe('Agentic Chat acting provider routing defaults', () => {
	// Measured 2026-09-04 to 09-09 (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F78):
	// DeepInfra and Alibaba p50 5.3 s, StreamLake 7.3 s, Azure 21.5 s at 112 ms
	// per output token; DeepSeek and Cloudflare no longer list the model.
	it('prefers the measured cheap endpoints, keeps fallbacks, and ignores Azure', () => {
		const config = loadAgenticChatConfig(DEDICATED_PROVIDER_ENV);
		expect(config.provider.routes).toHaveLength(1);
		expect(config.provider.routes[0]?.providerRouting).toEqual({
			allow_fallbacks: true,
			order: ['deepinfra', 'gmicloud', 'alibaba', 'streamlake'],
			ignore: ['azure']
		});
	});

	it('never constrains the acting route with an allowlist', () => {
		const routing =
			loadAgenticChatConfig(DEDICATED_PROVIDER_ENV).provider.routes[0]?.providerRouting;
		expect(routing).not.toHaveProperty('only');
		expect(routing?.order).not.toContain('azure');
		expect(routing?.order).not.toContain('deepseek');
		expect(routing?.order).not.toContain('cloudflare');
	});
});
