// packages/agentic-chat-runtime/src/loop/repair-instructions.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildProjectCreateNoExecutionRepairInstruction,
	buildToolValidationRepairInstruction
} from './repair-instructions';

describe('tool validation repair instructions', () => {
	it('repairs project creation to an empty shell and separate canonical children', () => {
		const instruction = buildToolValidationRepairInstruction(
			[
				{
					toolCall: {
						id: 'project-create-invalid',
						type: 'function',
						function: {
							name: 'create_onto_project',
							arguments: '{"relationships":[null]}'
						}
					},
					toolName: 'create_onto_project',
					op: 'onto.project.create',
					errors: ['Invalid relationships[0]: expected an object.']
				}
			],
			true
		);

		expect(instruction).toContain('Project-create relationships must be an empty array');
		expect(instruction).toContain('use create_onto_goal');
		expect(instruction).toContain('one create_onto_task call per commissioned task');
		expect(instruction).not.toContain('Use the explicit object form');
	});

	it('re-enters project creation through a contract and shell without redundant confirmation', () => {
		const instruction = buildProjectCreateNoExecutionRepairInstruction();

		expect(instruction).toContain('declare their exact project, goal, and task outcomes first');
		expect(instruction).toContain('entities and relationships arrays must both be empty');
		expect(instruction).toContain('create_onto_goal');
		expect(instruction).toContain('create_onto_task');
		expect(instruction).toContain('do not use clarification as redundant confirmation');
	});
});
