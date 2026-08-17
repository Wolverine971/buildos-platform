// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/turn-route-health.test.ts
import { describe, expect, it } from 'vitest';
import type { FastChatPassModelRouting } from '../model-tiering';
import {
	applyTurnRouteHealth,
	createTurnRouteHealth,
	observeTurnRouteHealth
} from './turn-route-health';

const baseRouting: FastChatPassModelRouting = {
	passRole: 'tool_followup',
	profile: 'balanced',
	models: ['deepseek/model', 'google/model', 'tencent/model'],
	retryModelRotation: true
};

describe('turn route health', () => {
	it('does not override normal tiering after an ordinary successful pass', () => {
		const health = createTurnRouteHealth();
		observeTurnRouteHealth(health, {
			status: 'success',
			model: 'tencent/model',
			requestedModel: 'tencent/model'
		});

		expect(applyTurnRouteHealth(baseRouting, health).models).toEqual(baseRouting.models);
	});

	it('keeps an internally resolved fallback sticky even without a surfaced failure', () => {
		const health = createTurnRouteHealth();
		observeTurnRouteHealth(health, {
			status: 'success',
			model: 'google/model',
			requestedModel: 'deepseek/model'
		});

		expect(applyTurnRouteHealth(baseRouting, health).models).toEqual([
			'google/model',
			'deepseek/model',
			'tencent/model'
		]);
	});

	it('cools down a failed model/provider and keeps the successful fallback sticky', () => {
		const health = createTurnRouteHealth();
		observeTurnRouteHealth(health, {
			status: 'failure',
			model: 'deepseek/model',
			providerSlug: 'DigitalOcean'
		});

		expect(applyTurnRouteHealth(baseRouting, health)).toMatchObject({
			models: ['google/model', 'tencent/model', 'deepseek/model'],
			ignoredProviderSlugs: ['digitalocean']
		});

		observeTurnRouteHealth(health, {
			status: 'success',
			model: 'google/model',
			requestedModel: 'google/model',
			providerSlug: 'google'
		});

		expect(applyTurnRouteHealth(baseRouting, health)).toMatchObject({
			models: ['google/model', 'tencent/model', 'deepseek/model'],
			ignoredProviderSlugs: ['digitalocean']
		});
	});

	it('keeps explicit pinned model order while retaining provider cooldowns', () => {
		const health = createTurnRouteHealth();
		observeTurnRouteHealth(health, {
			status: 'failure',
			model: 'deepseek/model',
			providerSlug: 'digitalocean'
		});

		expect(
			applyTurnRouteHealth(baseRouting, health, { preserveModelOrder: true })
		).toMatchObject({
			models: ['deepseek/model', 'google/model', 'tencent/model'],
			ignoredProviderSlugs: ['digitalocean']
		});
	});
});
