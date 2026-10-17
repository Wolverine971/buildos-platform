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

	it('bounds newly generated research recall including its committed timestamp', () => {
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
		expect(JSON.stringify(result).length).toBeLessThan(LAST_TURN_CONTEXT_MAX_CHARS);
		expect(result.entities.tasks).toHaveLength(66);
		expect(result.entities.documents).toHaveLength(38);
	});

	it('tells the model when entity recall is incomplete', () => {
		const hint = buildLastTurnContinuityHint({
			...packet(),
			entity_references_truncated: true
		});
		expect(hint).toContain('Some prior entity references were omitted');
	});
});
