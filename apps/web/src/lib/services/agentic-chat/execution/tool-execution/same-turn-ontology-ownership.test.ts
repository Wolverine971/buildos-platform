// apps/web/src/lib/services/agentic-chat/execution/tool-execution/same-turn-ontology-ownership.test.ts
import { describe, expect, it } from 'vitest';
import type { ServiceContext } from '../../shared/types';
import { SameTurnOntologyOwnershipRegistry } from './same-turn-ontology-ownership';

const PROJECT_A = '11111111-1111-4111-8111-111111111111';
const PROJECT_B = '22222222-2222-4222-8222-222222222222';
const TASK_ID = '33333333-3333-4333-8333-333333333333';
const GOAL_ID = '44444444-4444-4444-8444-444444444444';

const context: ServiceContext = {
	sessionId: 'session_1',
	userId: 'user_1',
	contextType: 'project',
	entityId: PROJECT_A,
	conversationHistory: []
};

describe('same-turn ontology ownership registry', () => {
	it('records consistent created-entity ownership', () => {
		const registry = new SameTurnOntologyOwnershipRegistry();
		registry.rememberCreated(
			'create_onto_task',
			{ project_id: PROJECT_A },
			{ id: TASK_ID, project_id: PROJECT_A },
			context
		);

		expect(registry.asReadonlyMap().get(`task:${TASK_ID}`)).toBe(PROJECT_A);
	});

	it('rejects inconsistent created-entity ownership evidence', () => {
		const registry = new SameTurnOntologyOwnershipRegistry();
		registry.rememberCreated(
			'create_onto_task',
			{ project_id: PROJECT_A },
			{ id: TASK_ID, project_id: PROJECT_B },
			context
		);

		expect(registry.asReadonlyMap().has(`task:${TASK_ID}`)).toBe(false);
	});

	it('records every consistent project-instantiation child', () => {
		const registry = new SameTurnOntologyOwnershipRegistry();
		registry.rememberCreated(
			'create_onto_project',
			{},
			{
				project_id: PROJECT_A,
				created_entities: [
					{ kind: 'project', id: PROJECT_A },
					{ kind: 'task', id: TASK_ID, project_id: PROJECT_A },
					{ kind: 'goal', id: GOAL_ID, project_id: PROJECT_A }
				]
			},
			{ ...context, contextType: 'project_create', entityId: undefined }
		);

		expect([...registry.asReadonlyMap().entries()]).toEqual([
			[`project:${PROJECT_A}`, PROJECT_A],
			[`task:${TASK_ID}`, PROJECT_A],
			[`goal:${GOAL_ID}`, PROJECT_A]
		]);
	});

	it('tombstones contradictory trusted read evidence', () => {
		const registry = new SameTurnOntologyOwnershipRegistry();
		registry.rememberLoaded(
			'get_onto_task_details',
			{ task_id: TASK_ID },
			{ task: { id: TASK_ID, project_id: PROJECT_A } }
		);
		registry.rememberLoaded(
			'get_onto_task_details',
			{ task_id: TASK_ID },
			{ task: { id: TASK_ID, project_id: PROJECT_B } }
		);

		expect(registry.asReadonlyMap().get(`task:${TASK_ID}`)).toBeNull();
	});

	it('applies successful moves and delete tombstones', () => {
		const registry = new SameTurnOntologyOwnershipRegistry();
		registry.applyMutation(
			'move_onto_task',
			{ task_id: TASK_ID, destination_project_id: PROJECT_B },
			{ status: 'moved' }
		);
		expect(registry.asReadonlyMap().get(`task:${TASK_ID}`)).toBe(PROJECT_B);

		registry.applyMutation('delete_onto_task', { task_id: TASK_ID }, {});
		expect(registry.asReadonlyMap().get(`task:${TASK_ID}`)).toBeNull();
	});
});
