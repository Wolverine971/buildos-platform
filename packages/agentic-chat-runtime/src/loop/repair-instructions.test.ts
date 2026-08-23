import { describe, expect, it } from 'vitest';
import { buildToolValidationRepairInstruction } from './repair-instructions';

describe('tool validation repair instructions', () => {
	it('recommends only the canonical project relationship object shape', () => {
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
			'Project-create relationships must use the canonical object form'
		);
		expect(instruction).toContain('Do not use pair arrays');
		expect(instruction).not.toContain('[ { temp_id, kind }, { temp_id, kind } ]');
	});
});
