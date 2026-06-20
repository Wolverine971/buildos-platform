// apps/web/src/lib/services/agentic-chat/tools/registry/tool-search.test.ts
import { afterEach, describe, expect, it } from 'vitest';

import { CHAT_TOOL_DEFINITIONS, TOOL_METADATA } from '../core/definitions';
import { buildToolRegistry, getToolRegistry, resetToolRegistryCache } from './tool-registry';
import { searchToolRegistry } from './tool-search';

const CHAT_HIDDEN_LEGACY_SEARCH_TOOLS = [
	'search_onto_goals',
	'search_onto_plans',
	'search_onto_milestones',
	'search_onto_risks'
] as const;

function toolNames(result: Record<string, unknown>): string[] {
	const matches = Array.isArray(result.matches) ? result.matches : [];
	return matches
		.map((match) => (match as { tool_name?: unknown }).tool_name)
		.filter((name): name is string => typeof name === 'string');
}

afterEach(() => {
	resetToolRegistryCache();
});

describe('searchToolRegistry discovery surfaces', () => {
	it('marks zero-use legacy entity search tools as hidden from chat discovery', () => {
		const registry = getToolRegistry();

		for (const toolName of CHAT_HIDDEN_LEGACY_SEARCH_TOOLS) {
			expect(registry.byToolName[toolName]).toMatchObject({
				tool_name: toolName,
				chat_discoverable: false
			});
		}

		expect(registry.byToolName.search_onto_tasks).toMatchObject({
			tool_name: 'search_onto_tasks',
			chat_discoverable: true
		});
	});

	it('does not let chat-only visibility change the registry version', () => {
		const visibleMetadata = {
			...TOOL_METADATA,
			search_onto_goals: {
				...TOOL_METADATA.search_onto_goals,
				chatDiscovery: 'visible' as const
			}
		};
		const hiddenMetadata = {
			...TOOL_METADATA,
			search_onto_goals: {
				...TOOL_METADATA.search_onto_goals,
				chatDiscovery: 'hidden' as const
			}
		};

		expect(buildToolRegistry(CHAT_TOOL_DEFINITIONS, hiddenMetadata).version).toBe(
			buildToolRegistry(CHAT_TOOL_DEFINITIONS, visibleMetadata).version
		);
	});

	it('hides legacy entity search tools from the default chat surface only', () => {
		for (const toolName of CHAT_HIDDEN_LEGACY_SEARCH_TOOLS) {
			expect(toolNames(searchToolRegistry({ query: toolName, limit: 25 }))).not.toContain(
				toolName
			);
			expect(
				toolNames(searchToolRegistry({ query: toolName, limit: 25, surface: 'chat' }))
			).not.toContain(toolName);
			expect(
				toolNames(searchToolRegistry({ query: toolName, limit: 25, surface: 'external' }))
			).toContain(toolName);
			expect(
				toolNames(searchToolRegistry({ query: toolName, limit: 25, surface: 'all' }))
			).toContain(toolName);
		}

		expect(toolNames(searchToolRegistry({ query: 'search_onto_tasks', limit: 25 }))).toContain(
			'search_onto_tasks'
		);
	});
});
