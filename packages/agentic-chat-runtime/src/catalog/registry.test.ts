// packages/agentic-chat-runtime/src/catalog/registry.test.ts
import { describe, expect, it } from 'vitest';
import { CHAT_TOOL_DEFINITIONS } from './definitions';
import { TOOL_METADATA } from './metadata';
import { buildToolRegistry, getToolDiscoveryPolicyVersion } from './registry';

describe('catalog registry versioning', () => {
	it('keeps discovery policy out of the stable registry schema version', () => {
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
		expect(getToolDiscoveryPolicyVersion(CHAT_TOOL_DEFINITIONS, hiddenMetadata)).not.toBe(
			getToolDiscoveryPolicyVersion(CHAT_TOOL_DEFINITIONS, visibleMetadata)
		);
	});

	it('preserves the reviewed op taxonomy and discovery flags', () => {
		const registry = buildToolRegistry(CHAT_TOOL_DEFINITIONS, TOOL_METADATA);

		expect(registry.ops['onto.task.move']).toMatchObject({
			tool_name: 'move_onto_task',
			group: 'onto',
			entity: 'task',
			kind: 'write',
			chat_discoverable: true
		});
		expect(registry.byToolName.search_onto_goals).toMatchObject({
			op: 'onto.goal.search',
			chat_discoverable: false
		});
	});
});
