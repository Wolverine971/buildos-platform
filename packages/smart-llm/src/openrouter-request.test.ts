// packages/smart-llm/src/openrouter-request.test.ts
import { describe, expect, it } from 'vitest';
import {
	GEMINI_37_FLASH_MODEL,
	GLM_53_FLASH_MODEL,
	GLM_53_MODEL,
	GPT_6_LUNA_MODEL,
	GROK_47_MODEL,
	KIMI_K3_MODEL,
	QWEN_38_27B_FREE_MODEL
} from './model-config';
import {
	buildOpenRouterChatCompletionBody,
	OPENROUTER_PRIVATE_PROVIDER,
	resolveOpenRouterFallbackModels,
	withOpenRouterPrivacy
} from './openrouter-request';

describe('resolveOpenRouterFallbackModels', () => {
	it('deduplicates fallbacks and excludes the requested primary model', () => {
		expect(
			resolveOpenRouterFallbackModels('qwen/qwen3.7-plus', [
				'qwen/qwen3.7-plus',
				' deepseek/deepseek-v4-flash ',
				'deepseek/deepseek-v4-flash',
				'minimax/minimax-m3'
			])
		).toEqual(['deepseek/deepseek-v4-flash', 'minimax/minimax-m3']);
	});

	it("caps serialized fallbacks to OpenRouter's accepted models array size", () => {
		expect(
			resolveOpenRouterFallbackModels('deepseek/deepseek-v4-flash', [
				'qwen/qwen3.7-plus',
				'minimax/minimax-m3',
				'xiaomi/mimo-v2.5',
				'google/gemini-3.1-flash-lite',
				'moonshotai/kimi-k2.6'
			])
		).toEqual(['qwen/qwen3.7-plus', 'minimax/minimax-m3', 'xiaomi/mimo-v2.5']);
	});
});

describe('buildOpenRouterChatCompletionBody', () => {
	it.each([
		[undefined, 'low'],
		['none', 'low'],
		['minimal', 'low'],
		['low', 'low'],
		['medium', 'high'],
		['high', 'high'],
		['xhigh', 'max'],
		['max', 'max']
	])('normalizes GLM reasoning effort %s to %s', (effort, expected) => {
		const body = buildOpenRouterChatCompletionBody({
			model: GLM_53_MODEL,
			messages: [],
			reasoning: { effort, enabled: false, exclude: true }
		});
		expect(body.reasoning).toEqual({ effort: expected, exclude: true });
	});

	it('preserves an explicit GLM reasoning token budget without adding conflicting effort', () => {
		const body = buildOpenRouterChatCompletionBody({
			model: GLM_53_MODEL,
			messages: [],
			reasoning: { max_tokens: 2048, exclude: true }
		});
		expect(body.reasoning).toEqual({ max_tokens: 2048, exclude: true });
	});

	it('restricts forced GLM tools to compatible providers without relaxing caller privacy or price caps', () => {
		const body = buildOpenRouterChatCompletionBody({
			model: GLM_53_MODEL,
			messages: [],
			tool_choice: 'required',
			provider: {
				zdr: true,
				data_collection: 'deny',
				max_price: { prompt: 2 },
				only: ['phala', 'deepinfra']
			}
		});
		expect(body.provider).toEqual({
			zdr: true,
			data_collection: 'deny',
			max_price: { prompt: 2 },
			only: ['phala'],
			require_parameters: true
		});
		expect(body.tool_choice).toBe('required');
	});

	it('rejects an incompatible explicit GLM provider restriction', () => {
		expect(() =>
			buildOpenRouterChatCompletionBody({
				model: GLM_53_MODEL,
				messages: [],
				tool_choice: 'required',
				provider: { only: ['deepinfra'] }
			})
		).toThrow('do not support the requested tool choice');
	});

	it('keeps Qwen free and disables the tool surface for a no-tools turn', () => {
		const body = buildOpenRouterChatCompletionBody({
			model: QWEN_38_27B_FREE_MODEL,
			models: [GLM_53_MODEL],
			messages: [],
			tools: [{ type: 'function' }],
			tool_choice: 'none',
			provider: { zdr: true, data_collection: 'deny', max_price: { prompt: 5 } }
		});
		expect(body).not.toHaveProperty('models');
		expect(body).not.toHaveProperty('tools');
		expect(body).not.toHaveProperty('tool_choice');
		expect(body.provider).toEqual({
			zdr: true,
			data_collection: 'deny',
			require_parameters: true,
			max_price: { prompt: 0, completion: 0, request: 0 }
		});
	});

	it('preserves forced Qwen tool calls and explicit reasoning off', () => {
		const body = buildOpenRouterChatCompletionBody({
			model: QWEN_38_27B_FREE_MODEL,
			messages: [],
			tools: [{ type: 'function' }],
			tool_choice: 'required',
			reasoning: { enabled: false }
		});
		expect(body.tool_choice).toBe('required');
		expect(body.tools).toHaveLength(1);
		expect(body.reasoning).toEqual({ enabled: false });
	});
	it('serializes fallback models with the top-level OpenRouter models field', () => {
		const body = buildOpenRouterChatCompletionBody({
			model: 'qwen/qwen3.7-plus',
			models: ['qwen/qwen3.7-plus', 'deepseek/deepseek-v4-flash', 'minimax/minimax-m3'],
			messages: [{ role: 'user', content: 'Return JSON.' }],
			response_format: { type: 'json_object' },
			stream: false
		});

		expect(body).toMatchObject({
			model: 'qwen/qwen3.7-plus',
			models: ['deepseek/deepseek-v4-flash', 'minimax/minimax-m3'],
			response_format: { type: 'json_object' },
			stream: false
		});
		expect(Object.keys(body)).not.toContain('extra_body');
	});

	it('forwards session_id and prompt_cache_key when a session id is supplied', () => {
		const body = buildOpenRouterChatCompletionBody({
			model: 'qwen/qwen3.7-plus',
			messages: [{ role: 'user', content: 'Stream this.' }],
			stream: true,
			session_id: 'chat-session-123',
			prompt_cache_key: 'chat-session-123'
		});

		expect(body.session_id).toBe('chat-session-123');
		expect(body.prompt_cache_key).toBe('chat-session-123');
	});

	it('truncates an over-long session_id to 256 chars and omits empty cache keys', () => {
		const longId = 'x'.repeat(300);
		const body = buildOpenRouterChatCompletionBody({
			model: 'qwen/qwen3.7-plus',
			messages: [{ role: 'user', content: 'Stream this.' }],
			stream: true,
			session_id: longId,
			prompt_cache_key: '   '
		});

		expect((body.session_id as string).length).toBe(256);
		expect(Object.keys(body)).not.toContain('prompt_cache_key');
	});

	it('passes reasoning off through to models without a reasoning policy', () => {
		const body = buildOpenRouterChatCompletionBody({
			model: 'deepseek/deepseek-v4-flash',
			messages: [{ role: 'user', content: 'Extract.' }],
			reasoning: { enabled: false }
		});
		expect(body.reasoning).toEqual({ enabled: false });
	});

	it('drops reasoning off for models that require reasoning, and adds no default effort', () => {
		const gemini = buildOpenRouterChatCompletionBody({
			model: GEMINI_37_FLASH_MODEL,
			messages: [{ role: 'user', content: 'Extract.' }],
			reasoning: { enabled: false }
		});
		expect(gemini.reasoning).toEqual({ effort: 'medium' });
		const glm = buildOpenRouterChatCompletionBody({
			model: GLM_53_FLASH_MODEL,
			messages: [{ role: 'user', content: 'Extract.' }],
			reasoning: { enabled: false }
		});
		expect(glm.reasoning).toEqual({ enabled: false });
	});

	it('omits K3 temperature and forces visible maximum reasoning', () => {
		const body = buildOpenRouterChatCompletionBody({
			model: KIMI_K3_MODEL,
			messages: [{ role: 'user', content: 'Solve this carefully.' }],
			temperature: 0.2,
			reasoning: { effort: 'low', exclude: true }
		});

		expect(body).not.toHaveProperty('temperature');
		expect(body.reasoning).toEqual({ effort: 'max', exclude: false });
	});

	it('adds K3 reasoning requirements when the caller did not supply reasoning', () => {
		const body = buildOpenRouterChatCompletionBody({
			model: KIMI_K3_MODEL,
			messages: [{ role: 'user', content: 'Solve this carefully.' }],
			temperature: 0.2
		});

		expect(body.reasoning).toEqual({ effort: 'max', exclude: false });
	});

	it('omits unsupported Luna temperature without changing its requested reasoning effort', () => {
		const body = buildOpenRouterChatCompletionBody({
			model: GPT_6_LUNA_MODEL,
			messages: [{ role: 'user', content: 'Analyze this.' }],
			temperature: 0.4,
			reasoning: { effort: 'low', exclude: true }
		});

		expect(body).not.toHaveProperty('temperature');
		expect(body.reasoning).toEqual({ effort: 'low', exclude: true });
	});

	it('omits Gemini 3.7 temperature and forces its tested medium reasoning effort', () => {
		const body = buildOpenRouterChatCompletionBody({
			model: GEMINI_37_FLASH_MODEL,
			messages: [{ role: 'user', content: 'Create a structured project plan.' }],
			temperature: 0.2,
			reasoning: { effort: 'low', exclude: true }
		});

		expect(body).not.toHaveProperty('temperature');
		expect(body.reasoning).toEqual({ effort: 'medium', exclude: true });
	});

	it('preserves explicitly requested Gemini 3.7 reasoning above its medium floor', () => {
		const body = buildOpenRouterChatCompletionBody({
			model: GEMINI_37_FLASH_MODEL,
			messages: [{ role: 'user', content: 'Analyze this deeply.' }],
			reasoning: { effort: 'high', exclude: false }
		});

		expect(body.reasoning).toEqual({ effort: 'high', exclude: false });
	});

	it('defaults GLM 5.3 Flash to low reasoning while preserving visibility policy', () => {
		const body = buildOpenRouterChatCompletionBody({
			model: GLM_53_FLASH_MODEL,
			messages: [{ role: 'user', content: 'Choose one concise next action.' }],
			temperature: 0.2,
			reasoning: { exclude: true }
		});

		expect(body.temperature).toBe(0.2);
		expect(body.reasoning).toEqual({ effort: 'low', exclude: true });
	});

	it('preserves an explicit GLM 5.3 Flash reasoning effort', () => {
		const body = buildOpenRouterChatCompletionBody({
			model: GLM_53_FLASH_MODEL,
			messages: [{ role: 'user', content: 'Analyze this deeply.' }],
			reasoning: { effort: 'high', exclude: false }
		});

		expect(body.reasoning).toEqual({ effort: 'high', exclude: false });
	});

	it('keeps temperature for models that support it', () => {
		const body = buildOpenRouterChatCompletionBody({
			model: GROK_47_MODEL,
			messages: [{ role: 'user', content: 'Analyze this.' }],
			temperature: 0.4
		});

		expect(body.temperature).toBe(0.4);
	});

	it('always opts in to OpenRouter usage accounting', () => {
		const body = buildOpenRouterChatCompletionBody({
			model: 'qwen/qwen3.7-plus',
			messages: [{ role: 'user', content: 'Return JSON.' }]
		});

		expect(body.usage).toEqual({ include: true });
	});
});

// Tasker 103: every OpenRouter body denies data collection and requires ZDR,
// whatever routing a caller passes. Only named eval fixtures may drop ZDR.
describe('OpenRouter privacy policy', () => {
	const hostileProviders: unknown[] = [
		undefined,
		null,
		{},
		{ zdr: false, data_collection: 'allow' },
		{ zdr: false },
		{ data_collection: 'allow', order: ['openai'], allow_fallbacks: true },
		{ sort: 'throughput', ignore: ['azure'], max_price: { prompt: 1 } },
		'not-an-object',
		['zdr', false]
	];
	const models = [
		'deepseek/deepseek-v4-flash',
		GLM_53_MODEL,
		QWEN_38_27B_FREE_MODEL,
		GPT_6_LUNA_MODEL,
		KIMI_K3_MODEL
	];

	it.each(models.flatMap((model) => hostileProviders.map((provider) => [model, provider])))(
		'forces deny + zdr for %s with provider %j',
		(model, provider) => {
			const body = buildOpenRouterChatCompletionBody({
				model: model as string,
				messages: [],
				tool_choice: 'auto',
				provider
			});
			expect(body.provider).toMatchObject({ data_collection: 'deny', zdr: true });
		}
	);

	it('keeps caller routing keys while the policy values win', () => {
		const body = buildOpenRouterChatCompletionBody({
			model: 'deepseek/deepseek-v4-flash',
			messages: [],
			provider: {
				zdr: false,
				data_collection: 'allow',
				order: ['deepinfra'],
				allow_fallbacks: true
			}
		});
		expect(body.provider).toEqual({
			order: ['deepinfra'],
			allow_fallbacks: true,
			data_collection: 'deny',
			zdr: true
		});
	});

	it('applies the policy inside the GLM forced-tool rewrite', () => {
		const body = buildOpenRouterChatCompletionBody({
			model: GLM_53_MODEL,
			messages: [],
			tool_choice: 'required',
			provider: { zdr: false, data_collection: 'allow' }
		});
		expect(body.provider).toMatchObject({
			require_parameters: true,
			only: ['morph', 'inference-net', 'phala', 'fireworks'],
			data_collection: 'deny',
			zdr: true
		});
	});

	it('drops only zdr for the named evaluation-only escape hatch', () => {
		const body = buildOpenRouterChatCompletionBody({
			model: 'unbiased/pareto',
			messages: [],
			provider: { zdr: true, data_collection: 'allow', order: ['unbiased'] },
			privacy: 'evaluation_only_non_zdr'
		});
		expect(body.provider).toEqual({ order: ['unbiased'], data_collection: 'deny' });
	});

	it('exports one frozen policy for bodies built outside the builder', () => {
		expect(Object.isFrozen(OPENROUTER_PRIVATE_PROVIDER)).toBe(true);
		expect(OPENROUTER_PRIVATE_PROVIDER).toEqual({ data_collection: 'deny', zdr: true });
		expect(withOpenRouterPrivacy({ zdr: false, allow_fallbacks: false })).toEqual({
			allow_fallbacks: false,
			data_collection: 'deny',
			zdr: true
		});
		expect(withOpenRouterPrivacy()).toEqual({ data_collection: 'deny', zdr: true });
	});
});
