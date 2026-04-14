import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

import { CHAT_TOOL_DEFINITIONS } from './tool-definitions';
import { getGatewaySurfaceForContextType } from './gateway-surface';
import { getToolsForContextType } from './tools.config';
import { getToolRegistry, resetToolRegistryCache } from '../registry/tool-registry';

function toolNames(tools: Array<{ function?: { name?: string } }>): string[] {
	return tools.map((tool) => tool.function?.name).filter((name): name is string => Boolean(name));
}

afterEach(() => {
	delete mockEnv.LIBRI_INTEGRATION_ENABLED;
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

	it('is available in global/project contexts but not project-create or calendar contexts', () => {
		mockEnv.LIBRI_INTEGRATION_ENABLED = 'true';

		expect(toolNames(getToolsForContextType('global'))).toContain('resolve_libri_resource');
		expect(toolNames(getToolsForContextType('project'))).toContain('resolve_libri_resource');
		expect(toolNames(getToolsForContextType('project_create'))).not.toContain(
			'resolve_libri_resource'
		);
		expect(toolNames(getToolsForContextType('calendar'))).not.toContain(
			'resolve_libri_resource'
		);
	});

	it('is preloaded in global/project gateway surfaces only', () => {
		mockEnv.LIBRI_INTEGRATION_ENABLED = 'true';

		expect(toolNames(getGatewaySurfaceForContextType('global'))).toContain(
			'resolve_libri_resource'
		);
		expect(toolNames(getGatewaySurfaceForContextType('project'))).toContain(
			'resolve_libri_resource'
		);
		expect(toolNames(getGatewaySurfaceForContextType('project_create'))).not.toContain(
			'resolve_libri_resource'
		);
		expect(toolNames(getGatewaySurfaceForContextType('calendar'))).not.toContain(
			'resolve_libri_resource'
		);
	});

	it('hides Libri from tool surfaces when the feature flag is disabled', () => {
		expect(toolNames(getToolsForContextType('global'))).not.toContain('resolve_libri_resource');
		expect(toolNames(getGatewaySurfaceForContextType('global'))).not.toContain(
			'resolve_libri_resource'
		);
	});

	it('maps the canonical Libri op to the direct tool', () => {
		mockEnv.LIBRI_INTEGRATION_ENABLED = 'true';
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
	});

	it('hides the canonical Libri op from discovery when the feature flag is disabled', () => {
		resetToolRegistryCache();
		const registry = getToolRegistry();

		expect(registry.ops['libri.resource.resolve']).toBeUndefined();
		expect(registry.byToolName.resolve_libri_resource).toBeUndefined();
	});
});
