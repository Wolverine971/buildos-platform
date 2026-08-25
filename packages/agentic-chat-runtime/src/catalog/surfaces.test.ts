// packages/agentic-chat-runtime/src/catalog/surfaces.test.ts
import { describe, expect, it } from 'vitest';
import {
	getGatewayDirectToolNamesForProfile,
	getGatewaySurfaceForContextType,
	getGatewaySurfaceForProfile
} from './surfaces';

describe('project-create gateway surface', () => {
	it('separates the web compound surface from reviewed shell/goal/task creation', () => {
		const expected = [
			'declare_turn_contract',
			'declare_read_only_turn',
			'request_turn_clarification',
			'cancel_turn_contract',
			'create_onto_project',
			'create_onto_goal',
			'create_onto_task'
		];

		expect(getGatewayDirectToolNamesForProfile('project_create_minimal')).toEqual(expected);
		expect(getGatewayDirectToolNamesForProfile('project_create_compound')).toEqual([
			'create_onto_project'
		]);
		const surface = getGatewaySurfaceForContextType('project_create');
		expect(surface.map((tool) => tool.function.name)).toEqual(['create_onto_project']);
		const reviewedSurface = getGatewaySurfaceForProfile('project_create_minimal');
		expect(
			reviewedSurface.find((tool) => tool.function.name === 'create_onto_goal')?.function
				.parameters.required
		).toEqual(['project_id', 'name']);
		expect(
			reviewedSurface.find((tool) => tool.function.name === 'create_onto_task')?.function
				.parameters.required
		).toEqual(['project_id', 'title']);
	});
});
