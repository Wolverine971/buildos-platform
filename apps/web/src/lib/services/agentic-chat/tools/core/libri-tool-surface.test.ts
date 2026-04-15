// apps/web/src/lib/services/agentic-chat/tools/core/libri-tool-surface.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

import { CHAT_TOOL_DEFINITIONS } from './tool-definitions';
import { getGatewaySurfaceForContextType, materializeGatewayTools } from './gateway-surface';
import { getDefaultToolsForContextType, getToolsForContextType } from './tools.config';
import { getToolRegistry, resetToolRegistryCache } from '../registry/tool-registry';

function toolNames(tools: Array<{ function?: { name?: string } }>): string[] {
	return tools.map((tool) => tool.function?.name).filter((name): name is string => Boolean(name));
}

afterEach(() => {
	vi.unstubAllEnvs();
	resetToolRegistryCache();
});

describe('resolve_libri_resource tool surface', () => {
	it('defines a person-only resolver schema for the first Libri slice', () => {
		const tool = CHAT_TOOL_DEFINITIONS.find(
			(candidate) => candidate.function?.name === 'resolve_libri_resource'
		);

		expect(tool).toBeDefined();
		expect(tool?.function?.parameters.required).toEqual(['query']);
		const properties = tool?.function?.parameters.properties as Record<string, any>;
		expect(properties.types.items.enum).toEqual(['person']);
		expect(JSON.stringify(tool)).not.toContain('youtubeVideo');
	});

	it('defines a structured read-only Libri library query schema', () => {
		const tool = CHAT_TOOL_DEFINITIONS.find(
			(candidate) => candidate.function?.name === 'query_libri_library'
		);

		expect(tool).toBeDefined();
		expect(tool?.function?.parameters.required).toEqual(['action']);
		const properties = tool?.function?.parameters.properties as Record<string, any>;
		expect(properties.action.enum).toContain('list_book_categories');
		expect(properties.action.enum).toContain('list_books_by_category');
		expect(properties.action.enum).toContain('list_videos');
	});

	it('is available in global/project contexts but not project-create or calendar contexts', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');

		expect(toolNames(getToolsForContextType('global'))).toContain('resolve_libri_resource');
		expect(toolNames(getToolsForContextType('global'))).toContain('query_libri_library');
		expect(toolNames(getToolsForContextType('project'))).toContain('resolve_libri_resource');
		expect(toolNames(getToolsForContextType('project'))).toContain('query_libri_library');
		expect(toolNames(getToolsForContextType('project_create'))).not.toContain(
			'resolve_libri_resource'
		);
		expect(toolNames(getToolsForContextType('project_create'))).not.toContain(
			'query_libri_library'
		);
		expect(toolNames(getToolsForContextType('calendar'))).not.toContain(
			'resolve_libri_resource'
		);
		expect(toolNames(getToolsForContextType('calendar'))).not.toContain('query_libri_library');
		expect(toolNames(getDefaultToolsForContextType('calendar'))).not.toContain(
			'resolve_libri_resource'
		);
		expect(toolNames(getDefaultToolsForContextType('daily_brief'))).not.toContain(
			'resolve_libri_resource'
		);
	});

	it('is not preloaded in lean gateway surfaces but can be materialized when enabled', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');

		expect(toolNames(getGatewaySurfaceForContextType('global'))).not.toContain(
			'resolve_libri_resource'
		);
		expect(toolNames(getGatewaySurfaceForContextType('global'))).not.toContain(
			'query_libri_library'
		);
		expect(toolNames(getGatewaySurfaceForContextType('project'))).not.toContain(
			'resolve_libri_resource'
		);
		expect(toolNames(getGatewaySurfaceForContextType('project'))).not.toContain(
			'query_libri_library'
		);
		expect(toolNames(getGatewaySurfaceForContextType('project_create'))).not.toContain(
			'resolve_libri_resource'
		);
		expect(toolNames(getGatewaySurfaceForContextType('project_create'))).not.toContain(
			'query_libri_library'
		);
		expect(toolNames(getGatewaySurfaceForContextType('calendar'))).not.toContain(
			'resolve_libri_resource'
		);
		expect(toolNames(getGatewaySurfaceForContextType('calendar'))).not.toContain(
			'query_libri_library'
		);

		const materialized = materializeGatewayTools(getGatewaySurfaceForContextType('global'), [
			'resolve_libri_resource',
			'query_libri_library'
		]);

		expect(materialized.addedToolNames).toEqual([
			'resolve_libri_resource',
			'query_libri_library'
		]);
	});

	it('hides Libri from tool surfaces when the feature flag is disabled', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'false');
		expect(toolNames(getToolsForContextType('global'))).not.toContain('resolve_libri_resource');
		expect(toolNames(getToolsForContextType('global'))).not.toContain('query_libri_library');
		expect(toolNames(getGatewaySurfaceForContextType('global'))).not.toContain(
			'resolve_libri_resource'
		);
		expect(toolNames(getGatewaySurfaceForContextType('global'))).not.toContain(
			'query_libri_library'
		);
	});

	it('maps the canonical Libri op to the direct tool', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');
		resetToolRegistryCache();
		const registry = getToolRegistry();

		expect(registry.ops['libri.resource.resolve']).toEqual(
			expect.objectContaining({
				op: 'libri.resource.resolve',
				tool_name: 'resolve_libri_resource',
				group: 'x',
				kind: 'read'
			})
		);
		expect(registry.byToolName.resolve_libri_resource?.op).toBe('libri.resource.resolve');
		expect(registry.ops['libri.library.query']).toEqual(
			expect.objectContaining({
				op: 'libri.library.query',
				tool_name: 'query_libri_library',
				group: 'x',
				kind: 'read'
			})
		);
		expect(registry.byToolName.query_libri_library?.op).toBe('libri.library.query');
	});

	it('hides the canonical Libri op from discovery when the feature flag is disabled', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'false');
		resetToolRegistryCache();
		const registry = getToolRegistry();

		expect(registry.ops['libri.resource.resolve']).toBeUndefined();
		expect(registry.ops['libri.library.query']).toBeUndefined();
		expect(registry.byToolName.resolve_libri_resource).toBeUndefined();
		expect(registry.byToolName.query_libri_library).toBeUndefined();
	});
});
