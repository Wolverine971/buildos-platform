// apps/web/src/lib/services/agentic-chat/tools/resources/resource-registry.test.ts
import { describe, expect, it } from 'vitest';
import { loadResource, searchResources } from './resource-registry';

describe('resource registry', () => {
	it('searches domain-level resources by domain and query', () => {
		const result = searchResources({
			domain: 'marketing.content_strategy',
			query: 'combo index',
			limit: 5
		}) as Record<string, any>;

		expect(result.type).toBe('resource_search_results');
		expect(result.materialized_tools).toEqual(['resource_load']);
		expect(result.matches).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					resource_id: 'youtube_library.marketing_and_content_combo_index',
					kind: 'domain_resource',
					domain_ids: ['marketing.content_strategy']
				})
			])
		);
	});

	it('searches skill reference modules through linked domain context', () => {
		const result = searchResources({
			domain: 'product_and_design.ui_ux_quality',
			query: 'source map',
			limit: 5
		}) as Record<string, any>;

		const ids = result.matches.map((match: Record<string, unknown>) => match.resource_id);
		expect(ids).toContain('build_quality_ui_ux.source_map');
		expect(result.matches).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					resource_id: 'build_quality_ui_ux.source_map',
					kind: 'skill_reference',
					skill_id: 'build_quality_ui_ux',
					visibility: 'internal'
				})
			])
		);
	});

	it('filters internal skill reference resources outside internal chat', () => {
		const result = searchResources({
			query: 'source map',
			limit: 20,
			surface: 'public_portable'
		}) as Record<string, any>;

		const ids = result.matches.map((match: Record<string, unknown>) => match.resource_id);
		expect(ids).not.toContain('build_quality_ui_ux.source_map');
		expect(result.matches).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					visibility: 'internal'
				})
			])
		);
	});

	it('searches explicitly public skill reference resources outside internal chat', () => {
		const result = searchResources({
			skill: 'google_calendar',
			query: 'public safe write rules',
			surface: 'external_agent'
		}) as Record<string, any>;

		expect(result.matches).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					resource_id: 'google_calendar.public_safe_write_rules',
					kind: 'skill_reference',
					visibility: 'public'
				})
			])
		);
	});

	it('loads skill reference resources through the unified resource loader', () => {
		const result = loadResource('build_quality_ui_ux.source_map') as Record<string, unknown>;

		expect(result.type).toBe('skill_reference');
		expect(result.skill_id).toBe('build_quality_ui_ux');
		expect(result.reference_id).toBe('build_quality_ui_ux.source_map');
		expect(result.content).toContain('UI/UX Source Map');
	});

	it('blocks internal skill reference resources through the unified resource loader', () => {
		const result = loadResource('build_quality_ui_ux.source_map', {
			surface: 'public_portable'
		}) as Record<string, unknown>;

		expect(result).toMatchObject({
			type: 'forbidden',
			skill_id: 'build_quality_ui_ux',
			reference_id: 'build_quality_ui_ux.source_map',
			visibility: 'internal',
			surface: 'public_portable'
		});
		expect(result.content).toBeUndefined();
	});

	it('loads explicitly public skill reference resources through the unified resource loader', () => {
		const result = loadResource('google_calendar.public_safe_write_rules', {
			surface: 'external_agent'
		}) as Record<string, unknown>;

		expect(result.type).toBe('skill_reference');
		expect(result.visibility).toBe('public');
		expect(result.content).toContain('Public Safe Calendar Write Rules');
	});

	it('returns metadata for indexed domain resources without bundled loaders', () => {
		const result = loadResource('youtube_library.marketing_and_content_combo_index') as Record<
			string,
			unknown
		>;

		expect(result).toMatchObject({
			type: 'resource',
			resource_id: 'youtube_library.marketing_and_content_combo_index',
			kind: 'domain_resource',
			message:
				'This resource is indexed for routing, but no bundled content loader is registered yet.'
		});
	});
});
