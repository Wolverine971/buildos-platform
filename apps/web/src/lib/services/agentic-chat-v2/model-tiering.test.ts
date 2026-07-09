// apps/web/src/lib/services/agentic-chat-v2/model-tiering.test.ts
import { describe, expect, it } from 'vitest';
import {
	parseFastChatInitialPlanModels,
	parseFastChatModelTieringMode,
	parseFastChatModelTieringSampleRate,
	resolveFastChatModelTieringConfig,
	resolveFastChatPassModelRouting
} from './model-tiering';

describe('fast chat model tiering', () => {
	it('parses rollout controls conservatively', () => {
		expect(parseFastChatModelTieringMode(undefined)).toBe('off');
		expect(parseFastChatModelTieringMode('false')).toBe('off');
		expect(parseFastChatModelTieringMode('control')).toBe('control');
		expect(parseFastChatModelTieringMode('ab')).toBe('ab');
		expect(parseFastChatModelTieringMode('fast_initial_pass')).toBe('fast_initial_plan');
		expect(parseFastChatModelTieringMode('unknown')).toBe('off');

		expect(parseFastChatModelTieringSampleRate('25%')).toBe(0.25);
		expect(parseFastChatModelTieringSampleRate('0.8')).toBe(0.8);
		expect(parseFastChatModelTieringSampleRate('2')).toBe(1);
		expect(parseFastChatModelTieringSampleRate('-1')).toBe(0);
	});

	it('dedupes configured fast initial-plan model candidates', () => {
		expect(
			parseFastChatInitialPlanModels(' tencent/hy3, xiaomi/mimo-v2.5, tencent/hy3 ')
		).toEqual(['tencent/hy3', 'xiaomi/mimo-v2.5']);
		expect(parseFastChatInitialPlanModels('', ['fallback/model'])).toEqual(['fallback/model']);
	});

	it('assigns deterministic A/B variants from the bucket key', () => {
		const first = resolveFastChatModelTieringConfig({
			mode: 'ab',
			sampleRate: 0.5,
			bucketKey: 'turn-123',
			initialPlanModels: ['fast/model']
		});
		const second = resolveFastChatModelTieringConfig({
			mode: 'ab',
			sampleRate: 0.5,
			bucketKey: 'turn-123',
			initialPlanModels: ['fast/model']
		});

		expect(first).toEqual(second);
		expect(first?.initialPlanModels).toEqual(['fast/model']);
		expect(['control', 'fast_initial_plan']).toContain(first?.variant);
		expect(
			resolveFastChatModelTieringConfig({
				mode: 'ab',
				sampleRate: 1,
				bucketKey: 'turn-123',
				initialPlanModels: ['fast/model']
			})?.variant
		).toBe('fast_initial_plan');
		expect(
			resolveFastChatModelTieringConfig({
				mode: 'ab',
				sampleRate: 0,
				bucketKey: 'turn-123',
				initialPlanModels: ['fast/model']
			})?.variant
		).toBe('control');
	});

	it('only applies fast models to the first tool-capable planning pass', () => {
		const modelTiering = {
			variant: 'fast_initial_plan' as const,
			initialPlanModels: ['fast/model', 'fallback/model']
		};

		expect(
			resolveFastChatPassModelRouting({
				passNumber: 1,
				hasTools: true,
				noToolSynthesisPass: false,
				writeIntentToolPass: false,
				modelTiering
			})
		).toEqual({
			passRole: 'initial_plan',
			profile: 'speed',
			models: ['fast/model', 'fallback/model'],
			modelTieringVariant: 'fast_initial_plan'
		});

		expect(
			resolveFastChatPassModelRouting({
				passNumber: 2,
				hasTools: true,
				noToolSynthesisPass: false,
				writeIntentToolPass: false,
				modelTiering
			})
		).toEqual({
			passRole: 'tool_followup',
			profile: 'balanced',
			modelTieringVariant: 'fast_initial_plan'
		});

		expect(
			resolveFastChatPassModelRouting({
				passNumber: 1,
				hasTools: false,
				noToolSynthesisPass: false,
				writeIntentToolPass: false,
				modelTiering
			})
		).toEqual({
			passRole: 'synthesis',
			profile: 'balanced',
			modelTieringVariant: 'fast_initial_plan'
		});

		expect(
			resolveFastChatPassModelRouting({
				passNumber: 4,
				hasTools: false,
				noToolSynthesisPass: true,
				writeIntentToolPass: false,
				noToolSynthesisRetryCount: 1,
				modelTiering
			})
		).toEqual({
			passRole: 'forced_synthesis',
			profile: 'quality',
			modelTieringVariant: 'fast_initial_plan'
		});
	});
});
