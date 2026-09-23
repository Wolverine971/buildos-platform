// apps/worker/tests/agenticChatConfig.test.ts
import { describe, expect, it } from 'vitest';
import { PARETO_MODEL } from '@buildos/smart-llm';
import { loadAgenticChatConfig } from '../src/workers/agentic-chat/host/config';
import {
	AGENTIC_CHAT_WORKFLOW_FALLBACK_MODELS_V1,
	AGENTIC_CHAT_WORKFLOW_PRICING_SNAPSHOTS_V1,
	AGENTIC_CHAT_WORKFLOW_PROVIDER_ROUTING_V1,
	buildAgenticChatWorkflowRoutesV1
} from '../src/workers/agentic-chat/workflow/workflow-dispatch';

const DEDICATED_PROVIDER_ENV: NodeJS.ProcessEnv = {
	PRIVATE_OPENROUTER_API_KEY: 'provider-secret',
	AGENTIC_CHAT_OPENROUTER_MODEL: 'deepseek/deepseek-v4-flash'
};

describe('Agentic Chat acting provider routing defaults', () => {
	it('uses neutral routing and a measured header budget for the local Pareto experiment', () => {
		const config = loadAgenticChatConfig({
			...DEDICATED_PROVIDER_ENV,
			AGENTIC_CHAT_OPENROUTER_MODEL: PARETO_MODEL
		});

		expect(config.provider.routes[0]?.model).toBe(PARETO_MODEL);
		expect(config.provider.routes[0]?.providerRouting).toEqual({
			allow_fallbacks: true
		});
		expect(config.provider.responseHeadersTimeoutMs).toBe(10_000);
	});

	// Measured 2026-09-04 to 09-09 (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F78):
	// DeepInfra and Alibaba p50 5.3 s, StreamLake 7.3 s, Azure 21.5 s at 112 ms
	// per output token; DeepSeek and Cloudflare no longer list the model.
	it('prefers the measured cheap endpoints, keeps fallbacks, and ignores Azure', () => {
		const config = loadAgenticChatConfig(DEDICATED_PROVIDER_ENV);
		expect(config.provider.responseHeadersTimeoutMs).toBe(5_000);
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
			ignore: ['azure', 'morph', 'modal'],
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
		for (const override of [
			{ AGENTIC_CHAT_OPENROUTER_PROVIDER_ORDER: 'novita,venice' },
			{ AGENTIC_CHAT_OPENROUTER_PROVIDER_SORT: 'latency' }
		]) {
			expect(
				loadAgenticChatConfig({ ...environment, ...override }).provider.routes[0]
					?.providerRouting
			).toMatchObject({ allow_fallbacks: true, ignore: ['azure', 'morph', 'modal'] });
		}
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

describe('workflow v4 flag matrix (Tasker 86 preparation, Tasker 87 execution)', () => {
	const load = (flags: NodeJS.ProcessEnv) =>
		loadAgenticChatConfig({ ...DEDICATED_PROVIDER_ENV, ...flags });

	it('defaults both off', () => {
		const config = load({});
		expect(config.workflowV4PreparationEnabled).toBe(false);
		expect(config.workflowV4ExecutionEnabled).toBe(false);
		expect(config.jevSpecialistSelection).toBe('off');
	});
	it('supports shadow specialist selection but refuses an execution mode', () => {
		expect(
			load({ AGENTIC_CHAT_JEV_SPECIALIST_SELECTION: 'shadow' }).jevSpecialistSelection
		).toBe('shadow');
		expect(() => load({ AGENTIC_CHAT_JEV_SPECIALIST_SELECTION: 'on' })).toThrow(
			'off or shadow'
		);
	});

	it('allows preparation alone and preparation with execution', () => {
		expect(load({ AGENTIC_CHAT_WORKFLOW_V4_PREPARATION_ENABLED: 'true' })).toMatchObject({
			workflowV4PreparationEnabled: true,
			workflowV4ExecutionEnabled: false
		});
		expect(
			load({
				AGENTIC_CHAT_WORKFLOW_V4_PREPARATION_ENABLED: 'true',
				AGENTIC_CHAT_WORKFLOW_EXECUTION_ENABLED: 'true'
			})
		).toMatchObject({ workflowV4PreparationEnabled: true, workflowV4ExecutionEnabled: true });
	});

	it('refuses to start with execution on while preparation is off', () => {
		expect(() => load({ AGENTIC_CHAT_WORKFLOW_EXECUTION_ENABLED: 'true' })).toThrow(
			/requires AGENTIC_CHAT_WORKFLOW_V4_PREPARATION_ENABLED/
		);
		expect(() =>
			load({
				AGENTIC_CHAT_WORKFLOW_V4_PREPARATION_ENABLED: 'false',
				AGENTIC_CHAT_WORKFLOW_EXECUTION_ENABLED: 'true'
			})
		).toThrow(/requires/);
	});

	it.each(['TRUE', '1', 'yes', ' true'])('accepts only exact true or false (%s)', (value) => {
		expect(() =>
			load({
				AGENTIC_CHAT_WORKFLOW_V4_PREPARATION_ENABLED: 'true',
				AGENTIC_CHAT_WORKFLOW_EXECUTION_ENABLED: value
			})
		).toThrow(/exactly true or false/);
	});

	it('pins the workflow client to priced models on the configured OpenRouter credential', () => {
		const routes = load({}).provider.routes;
		const [route] = buildAgenticChatWorkflowRoutesV1(routes);
		expect(route).toMatchObject({
			id: 'openrouter-workflow',
			kind: 'openrouter',
			apiKey: routes[0]!.apiKey,
			baseUrl: routes[0]!.baseUrl,
			model: 'deepseek/deepseek-v4.1-flash',
			fallbackModels: [...AGENTIC_CHAT_WORKFLOW_FALLBACK_MODELS_V1]
		});
		for (const model of [route!.model, ...(route!.fallbackModels ?? [])]) {
			expect(AGENTIC_CHAT_WORKFLOW_PRICING_SNAPSHOTS_V1[model]).toBeDefined();
		}
		// Chat's provider policy is measured for chat's model; the workflow owns its own.
		expect(route!.providerRouting).toEqual(AGENTIC_CHAT_WORKFLOW_PROVIDER_ROUTING_V1);
		expect(route!.providerRouting).not.toEqual(routes[0]!.providerRouting);
		expect(() => buildAgenticChatWorkflowRoutesV1(routes, {})).toThrow(/pricing snapshots/);
	});
});

it('parses host-owned workflow reasoning: default none, all, a step list, or a refusal', () => {
	const load = (value?: string) =>
		loadAgenticChatConfig({
			...DEDICATED_PROVIDER_ENV,
			...(value === undefined ? {} : { AGENTIC_CHAT_WORKFLOW_REASONING_OFF_STEPS: value })
		}).workflowReasoning;
	expect(load()).toEqual({});
	expect(load('all')).toEqual({
		planner: 'none',
		project_analyst: 'none',
		risk_reviewer: 'none',
		editor: 'none'
	});
	expect(load('planner, editor')).toEqual({ planner: 'none', editor: 'none' });
	expect(() => load('reviewer')).toThrow(/REASONING_OFF_STEPS/);
});

it('keeps shared document evidence off until explicitly enabled', () => {
	expect(loadAgenticChatConfig(DEDICATED_PROVIDER_ENV).documentEvidenceHandoffEnabled).toBe(
		false
	);
	expect(
		loadAgenticChatConfig({
			...DEDICATED_PROVIDER_ENV,
			AGENTIC_CHAT_DOCUMENT_EVIDENCE_HANDOFF_ENABLED: 'true'
		}).documentEvidenceHandoffEnabled
	).toBe(true);
});
