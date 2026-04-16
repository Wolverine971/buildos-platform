// apps/web/src/routes/api/onto/graph/workspace-graph-limit.test.ts
import { describe, expect, it } from 'vitest';

import type { GraphSourceData } from '$lib/components/ontology/graph/lib/graph.types';
import { buildWorkspaceGraphPayload, filterGraphSourceData } from './workspace-graph-limit';
import {
	DEFAULT_GRAPH_SCOPE_FILTERS,
	normalizeGraphScopeFilters
} from '$lib/components/ontology/graph/lib/graph.filters';

const now = '2026-04-16T15:00:00.000Z';

function makeProject(index: number) {
	return {
		id: `project-${index}`,
		name: `Project ${index}`,
		description: null,
		type_key: 'project',
		state_key: index % 2 === 0 ? 'active' : 'draft',
		props: null,
		facet_context: null,
		facet_scale: 'medium',
		facet_stage: null,
		created_by: 'actor-1',
		created_at: now,
		updated_at: new Date(Date.parse(now) + index).toISOString()
	} as any;
}

function makeTask(index: number, projectId = 'project-0') {
	return {
		id: `task-${index}`,
		project_id: projectId,
		type_key: 'task',
		title: `Task ${index}`,
		description: null,
		state_key: index % 3 === 0 ? 'blocked' : 'in_progress',
		priority: 3,
		props: null,
		created_by: 'actor-1',
		created_at: now,
		updated_at: new Date(Date.parse(now) + index).toISOString()
	} as any;
}

function makeNamedEntity(kind: 'document' | 'plan' | 'goal' | 'milestone' | 'risk', index: number) {
	const base = {
		id: `${kind}-${index}`,
		project_id: 'project-0',
		type_key: kind,
		state_key: 'active',
		props: null,
		created_by: 'actor-1',
		created_at: now,
		updated_at: new Date(Date.parse(now) + index).toISOString()
	};

	if (kind === 'document') {
		return { ...base, title: `Document ${index}` } as any;
	}
	if (kind === 'plan') {
		return { ...base, name: `Plan ${index}`, plan: null, description: null } as any;
	}
	if (kind === 'goal') {
		return { ...base, name: `Goal ${index}` } as any;
	}
	if (kind === 'milestone') {
		return { ...base, title: `Milestone ${index}`, due_at: null } as any;
	}

	return {
		...base,
		title: `Risk ${index}`,
		content: null,
		impact: null,
		probability: null,
		mitigated_at: null
	} as any;
}

function makeEdge(kind: string, id: string, index: number) {
	return {
		id: `edge-${kind}-${index}`,
		project_id: 'project-0',
		src_kind: 'project',
		src_id: 'project-0',
		dst_kind: kind,
		dst_id: id,
		rel: `has_${kind}`,
		props: null,
		created_at: now
	} as any;
}

function makeSource(): GraphSourceData {
	const projects = [makeProject(0), makeProject(1)];
	const tasks = Array.from({ length: 20 }, (_, index) => makeTask(index));
	const documents = Array.from({ length: 8 }, (_, index) => makeNamedEntity('document', index));
	const plans = Array.from({ length: 6 }, (_, index) => makeNamedEntity('plan', index));
	const goals = Array.from({ length: 4 }, (_, index) => makeNamedEntity('goal', index));
	const milestones = Array.from({ length: 8 }, (_, index) => makeNamedEntity('milestone', index));
	const risks = Array.from({ length: 4 }, (_, index) => makeNamedEntity('risk', index));

	return {
		projects,
		tasks,
		documents,
		plans,
		goals,
		milestones,
		risks,
		edges: [
			...tasks.map((task, index) => makeEdge('task', task.id, index)),
			...documents.map((document, index) => makeEdge('document', document.id, index)),
			...plans.map((plan, index) => makeEdge('plan', plan.id, index)),
			...goals.map((goal, index) => makeEdge('goal', goal.id, index)),
			...milestones.map((milestone, index) => makeEdge('milestone', milestone.id, index)),
			...risks.map((risk, index) => makeEdge('risk', risk.id, index))
		]
	};
}

describe('buildWorkspaceGraphPayload', () => {
	it('filters terminal and backlog graph data by default', () => {
		const source: GraphSourceData = {
			projects: [
				makeProject(0),
				{ ...makeProject(1), id: 'project-completed', state_key: 'completed' }
			],
			tasks: [
				makeTask(0),
				{ ...makeTask(1), id: 'task-done', state_key: 'done' },
				{
					...makeTask(2),
					id: 'task-scheduled',
					state_key: 'todo',
					start_at: now
				},
				{ ...makeTask(3), id: 'task-backlog', state_key: 'todo' }
			],
			documents: [
				makeNamedEntity('document', 0),
				{
					...makeNamedEntity('document', 1),
					id: 'document-archived',
					state_key: 'archived'
				}
			],
			plans: [
				makeNamedEntity('plan', 0),
				{ ...makeNamedEntity('plan', 1), id: 'plan-completed', state_key: 'completed' }
			],
			goals: [
				makeNamedEntity('goal', 0),
				{ ...makeNamedEntity('goal', 1), id: 'goal-achieved', state_key: 'achieved' }
			],
			milestones: [
				makeNamedEntity('milestone', 0),
				{
					...makeNamedEntity('milestone', 1),
					id: 'milestone-completed',
					props: { state_key: 'completed' }
				}
			],
			risks: [
				makeNamedEntity('risk', 0),
				{ ...makeNamedEntity('risk', 1), id: 'risk-closed', state_key: 'closed' }
			],
			edges: []
		};

		const filtered = filterGraphSourceData(source, DEFAULT_GRAPH_SCOPE_FILTERS);

		expect(filtered.projects.map((item) => item.id)).toEqual(['project-0']);
		expect(filtered.tasks.map((item) => item.id).sort()).toEqual(['task-0', 'task-scheduled']);
		expect(filtered.documents.map((item) => item.id)).toEqual(['document-0']);
		expect(filtered.plans.map((item) => item.id)).toEqual(['plan-0']);
		expect(filtered.goals.map((item) => item.id)).toEqual(['goal-0']);
		expect(filtered.milestones.map((item) => item.id)).toEqual(['milestone-0']);
		expect(filtered.risks.map((item) => item.id)).toEqual(['risk-0']);
	});

	it('includes opted-in terminal graph data', () => {
		const source: GraphSourceData = {
			projects: [{ ...makeProject(0), state_key: 'completed' }],
			tasks: [
				{ ...makeTask(0), state_key: 'done' },
				{ ...makeTask(1), id: 'task-backlog', state_key: 'todo' }
			],
			documents: [{ ...makeNamedEntity('document', 0), state_key: 'archived' }],
			plans: [{ ...makeNamedEntity('plan', 0), state_key: 'completed' }],
			goals: [{ ...makeNamedEntity('goal', 0), state_key: 'achieved' }],
			milestones: [{ ...makeNamedEntity('milestone', 0), props: { state_key: 'completed' } }],
			risks: [{ ...makeNamedEntity('risk', 0), state_key: 'mitigated' }],
			edges: []
		};
		const filtered = filterGraphSourceData(
			source,
			normalizeGraphScopeFilters({
				showBacklogTasks: true,
				showDoneTasks: true,
				showCompletedPlans: true,
				showAchievedGoals: true,
				showCompletedMilestones: true,
				showClosedRisks: true,
				showInactiveProjects: true,
				showArchived: true
			})
		);

		expect(filtered.projects).toHaveLength(1);
		expect(filtered.tasks).toHaveLength(2);
		expect(filtered.documents).toHaveLength(1);
		expect(filtered.plans).toHaveLength(1);
		expect(filtered.goals).toHaveLength(1);
		expect(filtered.milestones).toHaveLength(1);
		expect(filtered.risks).toHaveLength(1);
	});

	it('adds inferred project links for project-owned entities without direct edges', () => {
		const source: GraphSourceData = {
			projects: [makeProject(0)],
			tasks: [makeTask(0)],
			documents: [],
			plans: [],
			goals: [],
			milestones: [],
			risks: [],
			edges: []
		};

		const payload = buildWorkspaceGraphPayload(source, 'projects', 10);
		const inferredEdge = payload.source.edges.find((edge) => edge.rel === 'project_contains');

		expect(inferredEdge).toMatchObject({
			src_id: 'project-0',
			dst_id: 'task-0',
			props: { inferred: true, source: 'project_id' }
		});
		expect(payload.graph.edges).toHaveLength(1);
		expect(payload.graph.edges[0]?.data.inferred).toBe(true);
		expect(payload.limitMetadata.scopeCounts.showInferredProjectLinks).toMatchObject({
			total: 1,
			included: 1,
			returned: 1
		});
	});

	it('can hide inferred project links while preserving project-owned nodes', () => {
		const source: GraphSourceData = {
			projects: [makeProject(0)],
			tasks: [makeTask(0)],
			documents: [],
			plans: [],
			goals: [],
			milestones: [],
			risks: [],
			edges: []
		};

		const payload = buildWorkspaceGraphPayload(
			source,
			'projects',
			10,
			normalizeGraphScopeFilters({ showInferredProjectLinks: false })
		);

		expect(payload.graph.nodes).toHaveLength(2);
		expect(payload.graph.edges).toHaveLength(0);
		expect(payload.limitMetadata.scopeCounts.showInferredProjectLinks).toMatchObject({
			total: 1,
			included: 0,
			returned: 0,
			hidden: 1
		});
	});

	it('uses count-only totals for categories hidden by the row loader', () => {
		const source: GraphSourceData = {
			projects: [makeProject(0)],
			tasks: [makeTask(0)],
			documents: [],
			plans: [],
			goals: [],
			milestones: [],
			risks: [],
			edges: [makeEdge('task', 'task-0', 0)]
		};

		const payload = buildWorkspaceGraphPayload(
			source,
			'projects',
			10,
			DEFAULT_GRAPH_SCOPE_FILTERS,
			{
				showDoneTasks: 7
			}
		);

		expect(payload.limitMetadata.scopeCounts.showDoneTasks).toMatchObject({
			total: 7,
			included: 0,
			returned: 0,
			hidden: 7
		});
	});

	it('returns a bounded workspace graph instead of failing over the node limit', () => {
		const payload = buildWorkspaceGraphPayload(makeSource(), 'projects', 12);
		const nodeIds = new Set(payload.graph.nodes.map((node) => node.data.id));

		expect(payload.limitMetadata.truncated).toBe(true);
		expect(payload.limitMetadata.originalNodeCount).toBe(52);
		expect(payload.graph.nodes.length).toBeLessThanOrEqual(12);
		expect(payload.source.projects).toHaveLength(2);
		expect(payload.source.tasks.length).toBeGreaterThan(0);
		expect(payload.source.documents.length).toBeGreaterThan(0);
		expect(payload.limitMetadata.omittedNodeCount).toBeGreaterThan(0);
		expect(
			payload.graph.edges.every(
				(edge) => nodeIds.has(edge.data.source) && nodeIds.has(edge.data.target)
			)
		).toBe(true);
	});

	it('keeps the full graph untouched when it is under the node limit', () => {
		const source: GraphSourceData = {
			projects: [makeProject(0)],
			tasks: [makeTask(0)],
			documents: [],
			plans: [],
			goals: [],
			milestones: [],
			risks: [],
			edges: [makeEdge('task', 'task-0', 0)]
		};

		const payload = buildWorkspaceGraphPayload(source, 'projects', 10);

		expect(payload.limitMetadata.truncated).toBe(false);
		expect(payload.source).toEqual(source);
		expect(payload.graph.nodes).toHaveLength(2);
		expect(payload.stats.totalTasks).toBe(1);
	});
});
