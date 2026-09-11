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
	it('uses the V4.1 measurements only for V4.1 and permits an explicit order override', () => {
		const environment = {
			...DEDICATED_PROVIDER_ENV,
			AGENTIC_CHAT_OPENROUTER_MODEL: 'deepseek/deepseek-v4.1-flash'
		};
		expect(loadAgenticChatConfig(environment).provider.routes[0]?.providerRouting).toEqual({
			allow_fallbacks: true,
			ignore: ['azure', 'morph'],
			sort: 'throughput'
		});
		expect(loadAgenticChatConfig(environment).provider.routes[0]?.providerRouting).toEqual(
			loadAgenticChatConfig({
				...environment,
				AGENTIC_CHAT_OPENROUTER_PROVIDER_SORT: 'throughput'
			}).provider.routes[0]?.providerRouting
		);
		expect(
			loadAgenticChatConfig({
				...environment,
				AGENTIC_CHAT_OPENROUTER_PROVIDER_ORDER: 'deepinfra,gmicloud'
			}).provider.routes[0]?.providerRouting?.order
		).toEqual(['deepinfra', 'gmicloud']);
	});
});

it('supports explicit measured provider experiments without changing the default route', () => {
	expect(
		loadAgenticChatConfig({
			...DEDICATED_PROVIDER_ENV,
			AGENTIC_CHAT_OPENROUTER_PROVIDER_SORT: 'latency'
		}).provider.routes[0]?.providerRouting
	).toEqual({ allow_fallbacks: true, ignore: ['azure'], sort: 'latency' });
	expect(
		loadAgenticChatConfig({
			...DEDICATED_PROVIDER_ENV,
			AGENTIC_CHAT_OPENROUTER_PROVIDER_ORDER: 'gmicloud,deepinfra'
		}).provider.routes[0]?.providerRouting
	).toEqual({ allow_fallbacks: true, ignore: ['azure'], order: ['gmicloud', 'deepinfra'] });
	expect(() =>
		loadAgenticChatConfig({
			...DEDICATED_PROVIDER_ENV,
			AGENTIC_CHAT_OPENROUTER_PROVIDER_ORDER: 'deepinfra',
			AGENTIC_CHAT_OPENROUTER_PROVIDER_SORT: 'latency'
		})
	).toThrow(/order or sort/);
	expect(() =>
		loadAgenticChatConfig({
			...DEDICATED_PROVIDER_ENV,
			AGENTIC_CHAT_OPENROUTER_PROVIDER_SORT: 'fastest'
		})
	).toThrow(/Invalid/);
});
