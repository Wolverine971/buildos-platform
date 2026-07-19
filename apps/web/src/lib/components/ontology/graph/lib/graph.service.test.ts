// apps/web/src/lib/components/ontology/graph/lib/graph.service.test.ts
import { describe, expect, it } from 'vitest';

import { NODE_STYLE_CONFIG, OntologyGraphService } from './graph.service';
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
		expect(displayLines.every((line) => line.length <= 18)).toBe(true);
		expect(displayLines.at(-1)).toMatch(/…$/);
		expect(taskNode?.data.labelBackgroundOpacity).toBeGreaterThan(0);
		expect(taskNode?.data.iconImage).toMatch(/^data:image\/svg\+xml,/);
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

		expect(planNode?.data.displayLabel).toBe('Episode Production\nPipeline');
		expect(planNode?.data.width).toBeGreaterThan(planNode?.data.labelMaxWidth ?? 0);
		expect(planNode?.data.height).toBeGreaterThan(40);
		expect(planNode?.data.labelBackgroundOpacity).toBe(0);
	});

	it('uses a fully encoded data URI for goal icons', () => {
		const graph = OntologyGraphService.buildGraphData(
			makeSourceData({
				goals: [
					{
						id: 'goal-1',
						project_id: 'project-1',
						type_key: 'goal',
						name: 'Launch',
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

		const goalNode = graph.nodes.find((node) => node.data.id === 'goal-1');
		const iconImage = goalNode?.data.iconImage ?? '';

		expect(iconImage).toMatch(/^data:image\/svg\+xml,%3Csvg/);
		expect(iconImage).not.toMatch(/[<>"'\s]/);
		const decodedIcon = decodeURIComponent(iconImage.replace(/^data:image\/svg\+xml,/, ''));
		expect(decodedIcon).toContain('xmlns="http://www.w3.org/2000/svg"');
		expect(decodedIcon).toContain('width="32" height="32" viewBox="0 0 32 32"');
		expect(decodedIcon).toContain('<g transform="translate(4 4)">');
	});

	it('keeps every entity label at the readable graph type floor', () => {
		expect(Object.values(NODE_STYLE_CONFIG).every((config) => config.fontSize >= 11)).toBe(
			true
		);
	});

	it('adds canonical glyph metadata to milestone and risk silhouettes', () => {
		const milestone = OntologyGraphService.milestonesToNodes([
			{
				id: 'milestone-1',
				project_id: 'project-1',
				title: 'Launch checkpoint',
				state_key: 'pending',
				props: {},
				created_by: 'actor-1',
				created_at: now
			}
		])[0];
		const risk = OntologyGraphService.risksToNodes([
			{
				id: 'risk-1',
				project_id: 'project-1',
				title: 'Launch delay',
				state_key: 'identified',
				props: {},
				created_by: 'actor-1',
				created_at: now
			}
		])[0];

		for (const node of [milestone, risk]) {
			expect(node?.data.iconImage).toMatch(/^data:image\/svg\+xml,/);
			const decodedIcon = decodeURIComponent(
				(node?.data.iconImage ?? '').replace(/^data:image\/svg\+xml,/, '')
			);
			expect(decodedIcon).toContain('width="32" height="32"');
		}
	});

	it('places project-owned entities inside the project compound node', () => {
		const graph = OntologyGraphService.buildGraphData(
			makeSourceData({
				tasks: [
					{
						id: 'task-1',
						project_id: 'project-1',
						type_key: 'task',
						title: 'Book guest',
						description: null,
						state_key: 'todo',
						priority: 3,
						props: null,
						created_by: 'actor-1',
						created_at: now,
						updated_at: now
					}
				],
				documents: [
					{
						id: 'doc-1',
						project_id: 'project-1',
						type_key: 'document',
						title: 'Guest Brief',
						description: null,
						state_key: 'draft',
						props: null,
						children: null,
						created_by: 'actor-1',
						created_at: now,
						updated_at: now
					}
				]
			}),
			'full'
		);

		expect(
			graph.nodes.find((node) => node.data.id === 'project-1')?.data.parent
		).toBeUndefined();
		expect(graph.nodes.find((node) => node.data.id === 'task-1')?.data.parent).toBe(
			'project-1'
		);
		expect(graph.nodes.find((node) => node.data.id === 'doc-1')?.data.parent).toBe('project-1');
		expect(graph.nodes.find((node) => node.data.id === 'doc-1')?.data.iconImage).toMatch(
			/^data:image\/svg\+xml,/
		);
	});

	it('derives document hierarchy edges from project doc_structure', () => {
		const baseProject = makeSourceData().projects[0]!;
		const graph = OntologyGraphService.buildGraphData(
			makeSourceData({
				projects: [
					{
						...baseProject,
						doc_structure: {
							version: 1,
							root: [
								{
									id: 'doc-parent',
									order: 0,
									children: [{ id: 'doc-child', order: 0 }]
								}
							]
						}
					}
				],
				documents: [
					{
						id: 'doc-parent',
						project_id: 'project-1',
						type_key: 'document',
						title: 'Parent Brief',
						description: null,
						state_key: 'draft',
						props: null,
						children: null,
						created_by: 'actor-1',
						created_at: now,
						updated_at: now
					},
					{
						id: 'doc-child',
						project_id: 'project-1',
						type_key: 'document',
						title: 'Child Notes',
						description: null,
						state_key: 'draft',
						props: null,
						children: null,
						created_by: 'actor-1',
						created_at: now,
						updated_at: now
					}
				]
			}),
			'full'
		);

		const hierarchyEdge = graph.edges.find((edge) =>
			edge.data.id.startsWith('doc-structure:project-1:doc-parent:doc-child')
		);

		expect(hierarchyEdge?.data.source).toBe('doc-parent');
		expect(hierarchyEdge?.data.target).toBe('doc-child');
		expect(hierarchyEdge?.data.relationship).toBe('has_part');
		expect(hierarchyEdge?.data.category).toBe('hierarchical');
	});

	it('suppresses direct project containment edges while keeping internal ontology edges', () => {
		const graph = OntologyGraphService.buildGraphData(
			makeSourceData({
				plans: [
					{
						id: 'plan-1',
						project_id: 'project-1',
						type_key: 'plan',
						name: 'Production',
						plan: null,
						description: null,
						state_key: 'active',
						props: null,
						created_by: 'actor-1',
						created_at: now,
						updated_at: now
					}
				],
				tasks: [
					{
						id: 'task-1',
						project_id: 'project-1',
						type_key: 'task',
						title: 'Record episode',
						description: null,
						state_key: 'todo',
						priority: 3,
						props: null,
						created_by: 'actor-1',
						created_at: now,
						updated_at: now
					}
				],
				edges: [
					{
						id: 'edge-project-plan',
						project_id: 'project-1',
						src_kind: 'project',
						src_id: 'project-1',
						dst_kind: 'plan',
						dst_id: 'plan-1',
						rel: 'has_plan',
						props: {},
						created_at: now
					},
					{
						id: 'edge-plan-task',
						project_id: 'project-1',
						src_kind: 'plan',
						src_id: 'plan-1',
						dst_kind: 'task',
						dst_id: 'task-1',
						rel: 'has_task',
						props: {},
						created_at: now
					}
				]
			}),
			'full'
		);

		expect(graph.edges.map((edge) => edge.data.id)).toEqual(['edge-plan-task']);
		expect(graph.edges[0]?.data.source).toBe('plan-1');
		expect(graph.edges[0]?.data.target).toBe('task-1');
	});
});
