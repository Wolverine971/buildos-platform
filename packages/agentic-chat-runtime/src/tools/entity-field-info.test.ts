// packages/agentic-chat-runtime/src/tools/entity-field-info.test.ts
import { describe, expect, it } from 'vitest';
import { ENTITY_FIELD_INFO } from './entity-field-info';
import { ONTOLOGY_WRITE_TOOLS } from '../catalog/definitions/ontology-write';
import { UTILITY_TOOL_DEFINITIONS } from '../catalog/definitions/utility';

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

	// Tasker 122: on 2026-10-16 chat read parent_project_id's absence here as
	// proof that projects can't nest. It is listed now, as read-only, and the
	// tool no longer calls this curated list authoritative.
	it('lists parent_project_id as read-only, matching the update tool schema', () => {
		const field = ENTITY_FIELD_INFO.ontology_project?.parent_project_id;
		expect(field).toMatchObject({ type: 'string', required: false });
		expect(field?.description).toContain("update_onto_project can't set it");
		expect(field?.description).toContain('Move under');

		const updateProject = ONTOLOGY_WRITE_TOOLS.find(
			(tool) => tool.function.name === 'update_onto_project'
		);
		const properties = (updateProject?.function.parameters as { properties?: object })
			.properties;
		expect(properties).not.toHaveProperty('parent_project_id');
		expect(updateProject?.function.description).toContain('Not the parent project');
	});

	it('describes get_field_info as a curated guide, not the full schema', () => {
		const tool = UTILITY_TOOL_DEFINITIONS.find(
			(definition) => definition.function.name === 'get_field_info'
		);
		expect(tool?.function.description).toContain('Curated guide');
		expect(tool?.function.description).toContain('not a full schema');
		expect(tool?.function.description).not.toMatch(/authoritative/i);
	});
});
