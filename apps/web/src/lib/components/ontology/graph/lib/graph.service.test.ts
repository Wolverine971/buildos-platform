// apps/web/src/lib/components/ontology/graph/lib/graph.service.test.ts
import { describe, expect, it } from 'vitest';

import { OntologyGraphService } from './graph.service';
import type { GraphSourceData } from './graph.types';

const now = '2026-04-12T17:00:00.000Z';

function makeSourceData(overrides: Partial<GraphSourceData> = {}): GraphSourceData {
	return {
		projects: [
			{
				id: 'project-1',
				name: 'Podcast Launch',
				description: null,
				type_key: 'project',
				state_key: 'active',
				props: null,
				facet_context: null,
				facet_scale: 'medium',
				facet_stage: null,
				created_by: 'actor-1',
				created_at: now,
				updated_at: now
			}
		],
		tasks: [],
		documents: [],
		plans: [],
		goals: [],
		milestones: [],
		risks: [],
		edges: [],
		...overrides
	};
}

describe('OntologyGraphService label display data', () => {
	it('keeps full labels available while clamping long task display labels', () => {
		const longTaskTitle = 'Create guest outreach list & episode outlines/scripts';
		const graph = OntologyGraphService.buildGraphData(
			makeSourceData({
				tasks: [
					{
						id: 'task-1',
						project_id: 'project-1',
						type_key: 'task',
						title: longTaskTitle,
						description: null,
						state_key: 'todo',
						priority: 3,
						props: null,
						created_by: 'actor-1',
						created_at: now,
						updated_at: now
					}
				]
			}),
			'full'
		);

		const taskNode = graph.nodes.find((node) => node.data.id === 'task-1');
		const displayLines = taskNode?.data.displayLabel?.split('\n') ?? [];

		expect(taskNode?.data.label).toBe(longTaskTitle);
		expect(taskNode?.data.displayLabel).not.toBe(longTaskTitle);
		expect(displayLines).toHaveLength(3);
		expect(displayLines.every((line) => line.length <= 15)).toBe(true);
		expect(displayLines.at(-1)).toMatch(/\.\.\.$/);
		expect(taskNode?.data.labelBackgroundOpacity).toBeGreaterThan(0);
	});

	it('sizes centered plan nodes to contain multi-line labels without label backgrounds', () => {
		const graph = OntologyGraphService.buildGraphData(
			makeSourceData({
				plans: [
					{
						id: 'plan-1',
						project_id: 'project-1',
						type_key: 'plan',
						name: 'Episode Production Pipeline',
						plan: null,
						description: null,
						state_key: 'active',
						props: null,
						created_by: 'actor-1',
						created_at: now,
						updated_at: now
					}
				]
			}),
			'full'
		);

		const planNode = graph.nodes.find((node) => node.data.id === 'plan-1');

		expect(planNode?.data.displayLabel).toBe('Episode\nProduction\nPipeline');
		expect(planNode?.data.width).toBeGreaterThan(planNode?.data.labelMaxWidth ?? 0);
		expect(planNode?.data.height).toBeGreaterThan(40);
		expect(planNode?.data.labelBackgroundOpacity).toBe(0);
	});
});
