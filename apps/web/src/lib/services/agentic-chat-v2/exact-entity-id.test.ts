// apps/web/src/lib/services/agentic-chat-v2/exact-entity-id.test.ts
import { describe, expect, it } from 'vitest';
import {
	normalizeExactEntityId,
	shouldCollectExactEntityReferencesFromToolName
} from './exact-entity-id';

describe('exact-entity-id helpers', () => {
	it('keeps real UUIDs and rejects placeholder IDs', () => {
		expect(normalizeExactEntityId('debd6c62-8701-4f2a-972d-9036d1bc7c2f')).toBe(
			'debd6c62-8701-4f2a-972d-9036d1bc7c2f'
		);
		expect(normalizeExactEntityId('<plan_id_uuid>')).toBeUndefined();
		expect(normalizeExactEntityId('<project_id_uuid>')).toBeUndefined();
		expect(normalizeExactEntityId('__TASK_ID_FROM_ABOVE__')).toBeUndefined();
		expect(normalizeExactEntityId('none')).toBeUndefined();
		expect(normalizeExactEntityId('plan_123')).toBeUndefined();
	});

	it('does not mine referents from schema/search/skill meta-tools', () => {
		expect(shouldCollectExactEntityReferencesFromToolName('update_onto_task')).toBe(true);
		expect(shouldCollectExactEntityReferencesFromToolName('create_onto_document')).toBe(true);
		expect(shouldCollectExactEntityReferencesFromToolName('tool_schema')).toBe(false);
		expect(shouldCollectExactEntityReferencesFromToolName('tool_search')).toBe(false);
		expect(shouldCollectExactEntityReferencesFromToolName('skill_load')).toBe(false);
	});
});
