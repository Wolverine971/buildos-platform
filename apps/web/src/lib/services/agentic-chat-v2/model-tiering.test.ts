// apps/web/src/lib/services/agentic-chat-v2/model-tiering.test.ts
import { describe, expect, it } from 'vitest';
import { OPENROUTER_V2_TOOL_MODELS } from '@buildos/smart-llm';
import {
	FASTCHAT_FORCED_SYNTHESIS_IGNORED_PROVIDER_SLUGS,
	FASTCHAT_FORCED_SYNTHESIS_MODELS,
	FASTCHAT_PROJECT_CREATE_MAX_TOKENS,
	FASTCHAT_PROJECT_CREATE_TOOL_MODELS,
	parseFastChatForcedSynthesisIgnoredProviderSlugs,
	parseFastChatForcedSynthesisModels,
	parseFastChatForcedSynthesisRoutingMode,
	parseFastChatRoutingSampleRate,
	parseFastChatPinnedModels,
	resolveFastChatForcedSynthesisRoutingConfig,
	resolveFastChatPassModelRouting
} from './model-tiering';

describe('fast chat model routing', () => {
	it('parses forced-synthesis canary controls and exact provider slugs conservatively', () => {
		expect(parseFastChatForcedSynthesisRoutingMode(undefined)).toBe('off');
		expect(parseFastChatForcedSynthesisRoutingMode('control')).toBe('control');
		expect(parseFastChatForcedSynthesisRoutingMode('canary')).toBe('ab');
		expect(parseFastChatForcedSynthesisRoutingMode('dedicated')).toBe('dedicated');
		expect(parseFastChatForcedSynthesisRoutingMode('unknown')).toBe('off');
		expect(parseFastChatForcedSynthesisModels(undefined)).toEqual([
			...FASTCHAT_FORCED_SYNTHESIS_MODELS
		]);
		expect(parseFastChatForcedSynthesisModels(' model/a,model/b,model/a ')).toEqual([
			'model/a',
			'model/b'
		]);
		expect(parseFastChatForcedSynthesisIgnoredProviderSlugs(undefined)).toEqual([
			...FASTCHAT_FORCED_SYNTHESIS_IGNORED_PROVIDER_SLUGS
		]);
		expect(
			parseFastChatForcedSynthesisIgnoredProviderSlugs(
				' DigitalOcean, digitalocean, GMICloud '
			)
		).toEqual(['digitalocean', 'gmicloud']);
	});

	it('assigns forced-synthesis routing variants deterministically', () => {
		expect(
			resolveFastChatForcedSynthesisRoutingConfig({ mode: 'off', maxTokens: 6000 })
		).toBeNull();
		expect(
			resolveFastChatForcedSynthesisRoutingConfig({
				mode: 'control',
				models: ['synthesis/a'],
				ignoredProviderSlugs: ['digitalocean'],
				maxTokens: 6000
			})
		).toEqual({
			variant: 'control',
			models: ['synthesis/a'],
			ignoredProviderSlugs: ['digitalocean'],
			maxTokens: 6000
		});
		expect(
			resolveFastChatForcedSynthesisRoutingConfig({
				mode: 'ab',
				sampleRate: 1,
				bucketKey: 'turn-1',
				maxTokens: 6000
			})?.variant
		).toBe('dedicated');
		expect(
			resolveFastChatForcedSynthesisRoutingConfig({
				mode: 'ab',
				sampleRate: 0,
				bucketKey: 'turn-1',
				maxTokens: 6000
			})?.variant
		).toBe('control');
	});

	it('parses shared routing sample rates conservatively', () => {
		expect(parseFastChatRoutingSampleRate('25%')).toBe(0.25);
		expect(parseFastChatRoutingSampleRate('0.8')).toBe(0.8);
		expect(parseFastChatRoutingSampleRate('2')).toBe(1);
		expect(parseFastChatRoutingSampleRate('-1')).toBe(0);
	});

	it('parses an optional pinned eval model list without a production fallback', () => {
		expect(parseFastChatPinnedModels(undefined)).toEqual([]);
		expect(parseFastChatPinnedModels(' model/a, model/b, model/a ')).toEqual([
			'model/a',
			'model/b'
		]);
	});

	it('rotates the ordinary tool lane after a transient stream failure', () => {
		expect(
			resolveFastChatPassModelRouting({
				passNumber: 1,
				hasTools: true,
				noToolSynthesisPass: false,
				writeIntentToolPass: false
			})
		).toEqual({
			passRole: 'initial_plan',
			profile: 'balanced',
			models: [...OPENROUTER_V2_TOOL_MODELS],
			retryModelRotation: true
		});
	});

	it('uses the bounded Gemini-first route for project creation tool passes', () => {
		const routing = resolveFastChatPassModelRouting({
			passNumber: 1,
			hasTools: true,
			noToolSynthesisPass: false,
			writeIntentToolPass: false,
			projectCreateToolPass: true
		});

		expect(routing).toEqual({
			passRole: 'initial_plan',
			profile: 'balanced',
			models: [...FASTCHAT_PROJECT_CREATE_TOOL_MODELS],
			maxTokens: FASTCHAT_PROJECT_CREATE_MAX_TOKENS,
			retryModelRotation: true
		});
		expect(routing.models?.[0]).toMatch(/^google\//);
		expect(routing.models).not.toContain('tencent/hy3');
		expect(routing.models).not.toContain('deepseek/deepseek-v4-flash');
	});

	it('uses pinned eval models for every pass', () => {
		const routing = resolveFastChatPassModelRouting({
			passNumber: 2,
			hasTools: true,
			noToolSynthesisPass: false,
			writeIntentToolPass: false,
			projectCreateToolPass: true,
			pinnedModels: ['eval/model']
		});

		expect(routing).toEqual({
			passRole: 'tool_followup',
			profile: 'balanced',
			models: ['eval/model']
		});
	});

	it('gives dedicated forced synthesis an explicit heterogeneous retry route', () => {
		const routing = resolveFastChatPassModelRouting({
			passNumber: 4,
			hasTools: false,
			noToolSynthesisPass: true,
			writeIntentToolPass: false,
			forcedSynthesisRouting: {
				variant: 'dedicated',
				models: ['family-a/model', 'family-b/model', 'family-c/model'],
				ignoredProviderSlugs: ['digitalocean'],
				maxTokens: 6000
			}
		});

		expect(routing).toEqual({
			passRole: 'forced_synthesis',
			profile: 'quality',
			models: ['family-a/model', 'family-b/model', 'family-c/model'],
			forcedSynthesisRoutingVariant: 'dedicated',
			ignoredProviderSlugs: ['digitalocean'],
			maxTokens: 6000,
			retryModelRotation: true
		});
	});
});
