// apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.test.ts
import { describe, expect, it } from 'vitest';
import {
	getGatewayDirectToolNamesForProfile,
	getGatewaySurfaceForContextType
} from './gateway-surface';

describe('project-create gateway surface', () => {
	it('mounts only semantic controls and independently reviewable shell/goal/task creates', () => {
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
		const surface = getGatewaySurfaceForContextType('project_create');
		expect(surface.map((tool) => tool.function.name)).toEqual(expected);
		expect(
			surface.find((tool) => tool.function.name === 'create_onto_goal')?.function.parameters
				.required
		).toEqual(['project_id', 'name']);
		expect(
			surface.find((tool) => tool.function.name === 'create_onto_task')?.function.parameters
				.required
		).toEqual(['project_id', 'title']);
	});
});
