// packages/agentic-chat-runtime/src/last-turn-context-budget.test.ts
import { describe, expect, it } from 'vitest';
import {
	boundLastTurnContext,
	LAST_TURN_CONTEXT_BUDGET_CHARS,
	LAST_TURN_CONTEXT_MAX_CHARS
} from './last-turn-context-budget';
import { buildLastTurnContext, buildLastTurnContinuityHint } from './last-turn-context';

const records = (count: number, offset = 0) =>
	Array.from({ length: count }, (_, i) => ({
		id: `da000000-0000-4000-8000-${String(offset + i).padStart(12, '0')}`,
		name: `${i} ${'A'.repeat(76)}`,
		description: 'D'.repeat(140)
	}));
const packet = () => ({
	summary: 'Reviewed the projects.',
	context_type: 'global' as const,
	data_accessed: ['list_onto_projects', 'list_onto_tasks'],
	timestamp: '2026-10-16T20:46:33.791692+00:00',
	entities: {
		projects: records(36),
		tasks: records(66, 100),
		documents: records(38, 200),
		plans: records(8, 300),
		goals: records(2, 400),
		task_ids: records(66, 100).map(({ id }) => id),
		goal_ids: records(2, 400).map(({ id }) => id)
	}
});

describe('continuity packet size budget', () => {
	it('keeps small packets unchanged', () => {
		const context = { summary: 'Done', entities: { tasks: records(1) } };
		expect(boundLastTurnContext(context)).toBe(context);
	});

	it('retains all IDs and names from a broad research turn by removing descriptions', () => {
		const context = packet();
		const before = JSON.stringify(context);
		expect(before.length).toBeGreaterThan(LAST_TURN_CONTEXT_MAX_CHARS);
		const result = boundLastTurnContext(context)!;
		expect(JSON.stringify(result).length).toBeLessThanOrEqual(LAST_TURN_CONTEXT_BUDGET_CHARS);
		for (const key of ['projects', 'tasks', 'documents', 'plans', 'goals'] as const) {
			expect(result.entities[key]).toEqual(
				context.entities[key].map(({ description: _, ...item }) => item)
			);
		}
		expect(result.entities.task_ids).toEqual(context.entities.task_ids);
		expect(JSON.stringify(context)).toBe(before);
	});

	it('bounds large escaped inventories and keeps legacy IDs consistent', () => {
		const tasks = records(1000).map((item) => ({ ...item, name: '"\\\n😀'.repeat(40) }));
		const context = {
			entities: { tasks, task_ids: tasks.map(({ id }) => id), projects: records(200, 2000) }
		};
		const result = boundLastTurnContext(context)!;
		expect(JSON.stringify(result).length).toBeLessThanOrEqual(LAST_TURN_CONTEXT_BUDGET_CHARS);
		expect(result.entities.tasks.length).toBeGreaterThan(0);
		expect(result.entities.tasks.length).toBeLessThan(tasks.length);
		expect(result.entities.tasks[0].id).toBe(tasks[0].id);
		expect(result.entities.projects.length).toBeGreaterThan(0);
		expect(result.entities.task_ids).toEqual(result.entities.tasks.map(({ id }) => id));
		expect(result).toHaveProperty('entity_references_truncated', true);
		expect(boundLastTurnContext(result)).toBe(result);
	});

	it('retains pending cleanup as a whole while bounding other recall', () => {
		const cleanup = {
			version: 1,
			request_expectation: { detail: 'C'.repeat(23_000) },
			manifest: { items: [] }
		};
		const result = boundLastTurnContext({ ...packet(), cleanup })!;
		expect(result.cleanup).toEqual(cleanup);
		expect(JSON.stringify(result).length).toBeLessThanOrEqual(LAST_TURN_CONTEXT_BUDGET_CHARS);
		expect(result.entities.tasks.length).toBeGreaterThan(0);
	});

	it('omits an unusable optional hint instead of clipping its non-entity metadata', () => {
		expect(boundLastTurnContext({ summary: 'x'.repeat(40_000) })).toBeNull();
		expect(
			boundLastTurnContext({ ...packet(), cleanup: { receipt: 'x'.repeat(40_000) } })
		).toBeNull();
	});

	it('caps newly generated research recall per kind and records totals', () => {
		const result = buildLastTurnContext({
			assistantText: 'Here is the inventory.',
			userMessage: 'Compare these projects.',
			contextType: 'global',
			timestamp: '2026-10-16T20:46:33.791692+00:00',
			toolExecutions: [
				{
					toolCall: {
						id: 'read',
						type: 'function',
						function: { name: 'get_onto_project_graph', arguments: '{}' }
					},
					result: { tool_call_id: 'read', success: true, result: packet().entities }
				}
			]
		});
		// The 2026-10-16 Cadre shape: 150 records read, 35,671 characters before.
		expect(JSON.stringify(result).length).toBeLessThan(6_000);
		expect(result.entities.tasks).toHaveLength(8);
		expect(result.entities.documents).toHaveLength(8);
		expect(result.entities.goals).toHaveLength(2);
		expect(result.entity_totals).toEqual({ projects: 36, tasks: 66, documents: 38 });
		expect(result.entity_references_truncated).toBeUndefined();
		expect(JSON.stringify(result.entities)).not.toContain('DDDD');
		expect(result.entities.task_ids).toEqual(result.entities.tasks!.map(({ id }) => id));
		expect(result.entities.tasks![0]).toEqual({
			id: packet().entities.tasks[0]!.id,
			name: packet().entities.tasks[0]!.name
		});

		const hint = buildLastTurnContinuityHint(result)!;
		expect(hint).toContain('projects (4 of 36):');
		expect(hint).toContain('tasks (4 of 66):');
		expect(hint).toContain('goals:');
		expect(hint).not.toContain('goals (');
	});

	it('keeps a context shift target ahead of bulk read results', () => {
		const shiftedId = 'db000000-0000-4000-8000-000000000001';
		const result = buildLastTurnContext({
			assistantText: 'Switched to the project.',
			userMessage: 'Open that one.',
			contextType: 'global',
			timestamp: '2026-10-16T20:46:33.791692+00:00',
			contextShift: {
				new_context: 'project',
				entity_type: 'project',
				entity_id: shiftedId,
				entity_name: 'Shifted project',
				message: 'Moved into the project'
			} as never,
			toolExecutions: [
				{
					toolCall: {
						id: 'read',
						type: 'function',
						function: { name: 'list_onto_projects', arguments: '{}' }
					},
					result: {
						tool_call_id: 'read',
						success: true,
						result: { projects: records(36) }
					}
				}
			]
		});
		expect(result.entities.projects![0]).toEqual({ id: shiftedId, name: 'Shifted project' });
		expect(result.entities.project_id).toBe(shiftedId);
		expect(result.entity_totals).toEqual({ projects: 37 });
	});

	it('tells the model when entity recall is incomplete', () => {
		const hint = buildLastTurnContinuityHint({
			...packet(),
			entity_references_truncated: true
		});
		expect(hint).toContain('Some prior entity references were omitted');
	});
});
