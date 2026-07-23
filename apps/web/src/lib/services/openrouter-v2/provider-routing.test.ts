// apps/web/src/lib/services/openrouter-v2/provider-routing.test.ts
import { describe, expect, it } from 'vitest';
import {
	mergeOpenRouterRequestProviderRouting,
	normalizeOpenRouterProviderSlug,
	normalizeOpenRouterProviderSlugList
} from './provider-routing';

describe('OpenRouter provider routing', () => {
	it('normalizes known provider display names to exact API slugs', () => {
		expect(normalizeOpenRouterProviderSlug('DigitalOcean')).toBe('digitalocean');
		expect(normalizeOpenRouterProviderSlug('Moonshot AI')).toBe('moonshotai');
		expect(normalizeOpenRouterProviderSlug('Baidu Qianfan')).toBe('baidu');
		expect(normalizeOpenRouterProviderSlug('google-vertex')).toBe('google-vertex');
		expect(normalizeOpenRouterProviderSlug('Unknown Provider Name')).toBeUndefined();
		expect(
			normalizeOpenRouterProviderSlugList(['DigitalOcean', 'digitalocean', 'GMICloud'])
		).toEqual(['digitalocean', 'gmicloud']);
	});

	it('merges an ignore canary without weakening privacy controls', () => {
		expect(
			mergeOpenRouterRequestProviderRouting(
				{
					allow_fallbacks: true,
					data_collection: 'deny',
					zdr: true,
					order: ['Baidu', 'GMICloud', 'DigitalOcean'],
					ignore: ['Moonshot AI']
				},
				{ ignore: ['DigitalOcean'] }
			)
		).toEqual({
			allow_fallbacks: true,
			data_collection: 'deny',
			zdr: true,
			order: ['baidu', 'gmicloud'],
			ignore: ['moonshotai', 'digitalocean']
		});
	});
});
