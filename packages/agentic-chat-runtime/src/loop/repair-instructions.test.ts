// packages/agentic-chat-runtime/src/loop/repair-instructions.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildGatewayRequiredFieldRepairInstruction,
	buildProjectCreateNoExecutionRepairInstruction,
	buildToolValidationRepairInstruction
} from './repair-instructions';

describe('tool validation repair instructions', () => {
	it('repairs web project relationships without switching execution workflows', () => {
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

		expect(instruction).toContain(
			'Each relationship must be an object with from and to objects'
		);
		expect(instruction).toContain('Keep any initial goals, tasks, plans, documents');
		expect(instruction).not.toContain('relationships must be an empty array');
		expect(instruction).not.toContain('create_onto_goal');
		expect(instruction).not.toContain('create_onto_task');
		expect(instruction).toContain('do not call tool_search, tool_schema');
		expect(instruction).not.toContain('Load exact-op help before retrying');
		expect(instruction).not.toContain('For first-time or uncertain writes');
	});

	it('retries web project creation using only the available one-call tool', () => {
		const instruction = buildProjectCreateNoExecutionRepairInstruction();

		expect(instruction).toContain('Build one complete create_onto_project call');
		expect(instruction).toContain('include them in entities in this same call');
		expect(instruction).not.toContain('declare_turn_contract');
		expect(instruction).not.toContain('create_onto_goal');
		expect(instruction).not.toContain('create_onto_task');
		expect(instruction).not.toMatch(/web-owned|reviewed flow|project shell|bounded surface/i);
	});

	it('repairs repeated web project fields without suggesting unavailable help tools', () => {
		const instruction = buildGatewayRequiredFieldRepairInstruction([
			{ op: 'onto.project.create', field: 'project.name', occurrences: 2 }
		]);

		expect(instruction).toContain('Correct and retry that tool directly');
		expect(instruction).toContain('same create_onto_project call');
		expect(instruction).not.toContain('tool_schema');
		expect(instruction).not.toContain('create_onto_goal');
		expect(instruction).not.toContain('create_onto_task');
	});
});
