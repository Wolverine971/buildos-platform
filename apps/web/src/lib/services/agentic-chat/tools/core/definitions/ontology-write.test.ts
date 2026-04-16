// apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.test.ts
import { describe, expect, it } from 'vitest';
import { ONTOLOGY_WRITE_TOOLS } from './ontology-write';

function getToolProperties(toolName: string): Record<string, unknown> {
	const tool = ONTOLOGY_WRITE_TOOLS.find((candidate) => candidate.function.name === toolName);
	if (!tool) {
		throw new Error(`Missing tool definition: ${toolName}`);
	}
	return ((tool.function.parameters as any).properties ?? {}) as Record<string, unknown>;
}

describe('ontology write tool definitions', () => {
	it('exposes document merge strategy only on document updates', () => {
		for (const toolName of [
			'update_onto_task',
			'update_onto_project',
			'update_onto_goal',
			'update_onto_plan'
		]) {
			const properties = getToolProperties(toolName);
			expect(properties).not.toHaveProperty('update_strategy');
			expect(properties).not.toHaveProperty('merge_instructions');
		}

		const documentProperties = getToolProperties('update_onto_document');
		expect(documentProperties).toHaveProperty('update_strategy');
		expect(documentProperties).toHaveProperty('merge_instructions');
	});
});
