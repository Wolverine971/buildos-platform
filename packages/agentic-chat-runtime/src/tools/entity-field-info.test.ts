// packages/agentic-chat-runtime/src/tools/entity-field-info.test.ts
import { describe, expect, it } from 'vitest';
import { ENTITY_FIELD_INFO } from './entity-field-info';
import { ONTOLOGY_WRITE_TOOLS } from '../catalog/definitions/ontology-write';

describe('entity field info', () => {
	it('agrees with the task tool schema on the optional work-type policy', () => {
		const field = ENTITY_FIELD_INFO.ontology_task?.type_key;
		expect(field).toBeDefined();
		expect(field?.required).toBe(false);
		expect(field?.description).toContain('Stored default when omitted: task.default');
		expect(field?.description).toContain(
			'Set it only when the user states or clearly implies the work mode; otherwise omit it.'
		);
		expect(field?.description).not.toContain('execute (default)');

		const createTask = ONTOLOGY_WRITE_TOOLS.find(
			(tool) => tool.function.name === 'create_onto_task'
		);
		const schema = (createTask?.function.parameters as { properties?: Record<string, unknown> })
			.properties?.type_key as { default?: string } | undefined;
		expect(schema?.default).toBe('task.default');
	});
});
