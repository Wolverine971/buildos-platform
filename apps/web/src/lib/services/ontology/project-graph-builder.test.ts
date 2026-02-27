// apps/web/src/lib/services/ontology/project-graph-builder.test.ts
import { describe, it, expect } from 'vitest';
import {
	buildProjectGraph,
	buildProjectTree,
	getEdgesBetween,
	findConnectedEntities,
	getGraphStats
} from './project-graph-builder';
import type { ProjectGraphData } from '$lib/types/project-graph.types';
import type {
	OntoProject,
	OntoPlan,
	OntoTask,
	OntoGoal,
	OntoEdge,
	OntoOutput,
	OntoMilestone,
	OntoDocument,
	OntoRisk,
	OntoDecision
} from '$lib/types/onto-api';

// Helper to create mock entities
function createMockProject(id: string, name: string): OntoProject {
	return {
		id,
		name,
		description: `Description for ${name}`,
		type_key: 'project.default',
		state_key: 'active',
		props: {},
		created_by: 'actor-1',
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString()
	};
}

function createMockPlan(id: string, projectId: string, name: string): OntoPlan {
	return {
		id,
		project_id: projectId,
		name,
		type_key: 'plan.default',
		state_key: 'active',
		props: {},
		created_by: 'actor-1',
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString()
	};
}

function createMockTask(id: string, projectId: string, title: string): OntoTask {
	return {
		id,
		project_id: projectId,
		title,
		type_key: 'task.execute',
		state_key: 'todo',
		priority: 3,
		props: {},
		created_by: 'actor-1',
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString()
	};
}

function createMockGoal(id: string, projectId: string, name: string): OntoGoal {
	return {
		id,
		project_id: projectId,
		name,
		type_key: 'goal.default',
		props: {},
		created_by: 'actor-1',
		created_at: new Date().toISOString()
	};
}

function createMockOutput(id: string, projectId: string, name: string): OntoOutput {
	return {
		id,
		project_id: projectId,
		name,
		type_key: 'output.default',
		state_key: 'draft',
		props: {},
		created_by: 'actor-1',
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString()
	};
}

function createMockEdge(
	id: string,
	srcKind: string,
	srcId: string,
	dstKind: string,
	dstId: string,
	rel: string,
	projectId: string
): OntoEdge {
	return {
		id,
		src_kind: srcKind,
		src_id: srcId,
		dst_kind: dstKind,
		dst_id: dstId,
		rel,
		props: {},
		created_at: new Date().toISOString(),
		project_id: projectId
	};
}

describe('buildProjectGraph', () => {
	const projectId = 'proj-1';

	const mockData: ProjectGraphData = {
		project: createMockProject(projectId, 'Test Project'),
		plans: [
			createMockPlan('plan-1', projectId, 'Plan A'),
			createMockPlan('plan-2', projectId, 'Plan B')
		],
		tasks: [
			createMockTask('task-1', projectId, 'Task 1'),
			createMockTask('task-2', projectId, 'Task 2'),
			createMockTask('task-3', projectId, 'Task 3')
		],
		goals: [createMockGoal('goal-1', projectId, 'Goal 1')],
		milestones: [],
		outputs: [],
		documents: [],
		requirements: [],
		metrics: [],
		sources: [],
		risks: [],
		decisions: [],
		edges: [
			createMockEdge('e1', 'project', projectId, 'plan', 'plan-1', 'has_plan', projectId),
			createMockEdge('e2', 'project', projectId, 'plan', 'plan-2', 'has_plan', projectId),
			createMockEdge('e3', 'plan', 'plan-1', 'task', 'task-1', 'has_task', projectId),
			createMockEdge('e4', 'plan', 'plan-1', 'task', 'task-2', 'has_task', projectId),
			createMockEdge('e5', 'plan', 'plan-2', 'task', 'task-3', 'has_task', projectId),
			createMockEdge('e6', 'task', 'task-1', 'task', 'task-2', 'depends_on', projectId),
			createMockEdge('e7', 'project', projectId, 'goal', 'goal-1', 'has_goal', projectId)
		]
	};

	it('indexes entities by ID', () => {
		const graph = buildProjectGraph(mockData);

		expect(graph.getEntity('task-1')).toEqual(mockData.tasks[0]);
		expect(graph.getEntity('plan-1')).toEqual(mockData.plans[0]);
		expect(graph.getEntity('proj-1')).toEqual(mockData.project);
		expect(graph.getEntity('nonexistent')).toBeUndefined();
	});

	it('indexes entities by kind', () => {
		const graph = buildProjectGraph(mockData);

		expect(graph.entitiesByKind.task.size).toBe(3);
		expect(graph.entitiesByKind.plan.size).toBe(2);
		expect(graph.entitiesByKind.project.size).toBe(1);
		expect(graph.entitiesByKind.goal.size).toBe(1);
	});

	it('provides type-safe entity lookup by kind', () => {
		const graph = buildProjectGraph(mockData);

		const task = graph.getEntityByKind('task', 'task-1');
		expect(task?.title).toBe('Task 1');

		const plan = graph.getEntityByKind('plan', 'plan-1');
		expect(plan?.name).toBe('Plan A');
	});

	it('returns all entities of a specific kind', () => {
		const graph = buildProjectGraph(mockData);

		const tasks = graph.getAllOfKind('task');
		expect(tasks).toHaveLength(3);
		expect(tasks.map((t) => t.title)).toContain('Task 1');
		expect(tasks.map((t) => t.title)).toContain('Task 2');
		expect(tasks.map((t) => t.title)).toContain('Task 3');
	});

	it('indexes edges by source (outgoing)', () => {
		const graph = buildProjectGraph(mockData);

		const outgoing = graph.getOutgoingEdges('plan-1');
		expect(outgoing).toHaveLength(2);
		expect(outgoing.map((e) => e.dst_id)).toContain('task-1');
		expect(outgoing.map((e) => e.dst_id)).toContain('task-2');
	});

	it('indexes edges by destination (incoming)', () => {
		const graph = buildProjectGraph(mockData);

		const incoming = graph.getIncomingEdges('task-1');
		expect(incoming).toHaveLength(1);
		expect(incoming[0].src_id).toBe('plan-1');
	});

	it('indexes edges by relationship type', () => {
		const graph = buildProjectGraph(mockData);

		const hasTaskEdges = graph.getEdgesByRelationship('has_task');
		expect(hasTaskEdges).toHaveLength(3);

		const hasPlanEdges = graph.getEdgesByRelationship('has_plan');
		expect(hasPlanEdges).toHaveLength(2);

		const dependsOnEdges = graph.getEdgesByRelationship('depends_on');
		expect(dependsOnEdges).toHaveLength(1);
	});

	it('resolves parent-child relationships via getChildren', () => {
		const graph = buildProjectGraph(mockData);

		// Project children should be plans
		const projectChildren = graph.getChildren(projectId);
		expect(projectChildren).toHaveLength(3); // 2 plans + 1 goal
		expect(projectChildren.map((c) => c.id)).toContain('plan-1');
		expect(projectChildren.map((c) => c.id)).toContain('plan-2');
		expect(projectChildren.map((c) => c.id)).toContain('goal-1');

		// Plan children should be tasks
		const planChildren = graph.getChildren('plan-1');
		expect(planChildren).toHaveLength(2);
		expect(planChildren.map((c) => c.id)).toContain('task-1');
		expect(planChildren.map((c) => c.id)).toContain('task-2');
	});

	it('resolves parent via getParent', () => {
		const graph = buildProjectGraph(mockData);

		// Task parent should be plan
		const taskParent = graph.getParent('task-1');
		expect(taskParent?.id).toBe('plan-1');

		// Plan parent should be project
		const planParent = graph.getParent('plan-1');
		expect(planParent?.id).toBe(projectId);

		// Project has no parent
		const projectParent = graph.getParent(projectId);
		expect(projectParent).toBeUndefined();
	});

	it('resolves tasks for a plan', () => {
		const graph = buildProjectGraph(mockData);

		const plan1Tasks = graph.getTasksForPlan('plan-1');
		expect(plan1Tasks).toHaveLength(2);
		expect(plan1Tasks.map((t) => t.title)).toContain('Task 1');
		expect(plan1Tasks.map((t) => t.title)).toContain('Task 2');

		const plan2Tasks = graph.getTasksForPlan('plan-2');
		expect(plan2Tasks).toHaveLength(1);
		expect(plan2Tasks[0].title).toBe('Task 3');
	});

	it('resolves plans for the project', () => {
		const graph = buildProjectGraph(mockData);

		const plans = graph.getPlansForProject();
		expect(plans).toHaveLength(2);
		expect(plans.map((p) => p.name)).toContain('Plan A');
		expect(plans.map((p) => p.name)).toContain('Plan B');
	});

	it('resolves goals for the project', () => {
		const graph = buildProjectGraph(mockData);

		const goals = graph.getGoalsForProject();
		expect(goals).toHaveLength(1);
		expect(goals[0].name).toBe('Goal 1');
	});

	it('resolves dependencies', () => {
		const graph = buildProjectGraph(mockData);

		// Task 1 depends on Task 2
		const deps = graph.getDependencies('task-1');
		expect(deps).toHaveLength(1);
		expect(deps[0].id).toBe('task-2');
	});

	it('resolves dependents', () => {
		const graph = buildProjectGraph(mockData);

		// Task 2 is depended on by Task 1
		const dependents = graph.getDependents('task-2');
		expect(dependents).toHaveLength(1);
		expect(dependents[0].id).toBe('task-1');
	});

	it('treats has_part edges as containment children', () => {
		const data: ProjectGraphData = {
			project: createMockProject(projectId, 'Test Project'),
			plans: [],
			tasks: [createMockTask('task-1', projectId, 'Task 1')],
			goals: [],
			milestones: [],
			outputs: [],
			documents: [createMockDocument('doc-1', projectId, 'Doc 1')],
			requirements: [],
			metrics: [],
			sources: [],
			risks: [],
			decisions: [],
			edges: [
				createMockEdge('e1', 'task', 'task-1', 'document', 'doc-1', 'has_part', projectId),
				createMockEdge(
					'e2',
					'project',
					projectId,
					'document',
					'doc-1',
					'has_document',
					projectId
				)
			]
		};

		const graph = buildProjectGraph(data);

		// has_part should be treated as a child relationship
		const taskChildren = graph.getChildren('task-1');
		expect(taskChildren.map((child) => child.id)).toContain('doc-1');

		// has_document still surfaces the document under the project
		const projectChildren = graph.getChildren(projectId);
		expect(projectChildren.map((child) => child.id)).toContain('doc-1');

		const hasPartEdges = graph.getEdgesByRelationship('has_part');
		expect(hasPartEdges).toHaveLength(1);
	});
});

describe('buildProjectTree', () => {
	const projectId = 'proj-1';

	const mockData: ProjectGraphData = {
		project: createMockProject(projectId, 'Test Project'),
		plans: [createMockPlan('plan-1', projectId, 'Plan A')],
		tasks: [createMockTask('task-1', projectId, 'Task 1')],
		goals: [],
		milestones: [],
		outputs: [],
		documents: [],
		requirements: [],
		metrics: [],
		sources: [],
		risks: [],
		decisions: [],
		edges: [
			createMockEdge('e1', 'project', projectId, 'plan', 'plan-1', 'has_plan', projectId),
			createMockEdge('e2', 'plan', 'plan-1', 'task', 'task-1', 'has_task', projectId)
		]
	};

	it('builds a hierarchical tree structure', () => {
		const graph = buildProjectGraph(mockData);
		const tree = buildProjectTree(graph);

		expect(tree.kind).toBe('project');
		expect(tree.entity.id).toBe(projectId);
		expect(tree.children).toHaveLength(1);

		const planNode = tree.children[0];
		expect(planNode.kind).toBe('plan');
		expect(planNode.entity.id).toBe('plan-1');
		expect(planNode.children).toHaveLength(1);

		const taskNode = planNode.children[0];
		expect(taskNode.kind).toBe('task');
		expect(taskNode.entity.id).toBe('task-1');
		expect(taskNode.children).toHaveLength(0);
	});
});

describe('getEdgesBetween', () => {
	const projectId = 'proj-1';

	const mockData: ProjectGraphData = {
		project: createMockProject(projectId, 'Test Project'),
		plans: [],
		tasks: [
			createMockTask('task-1', projectId, 'Task 1'),
			createMockTask('task-2', projectId, 'Task 2')
		],
		goals: [],
		milestones: [],
		outputs: [],
		documents: [],
		requirements: [],
		metrics: [],
		sources: [],
		risks: [],
		decisions: [],
		edges: [
			createMockEdge('e1', 'task', 'task-1', 'task', 'task-2', 'depends_on', projectId),
			createMockEdge('e2', 'task', 'task-2', 'task', 'task-1', 'blocks', projectId)
		]
	};

	it('finds edges between two entities in both directions', () => {
		const graph = buildProjectGraph(mockData);

		const edges = getEdgesBetween(graph, 'task-1', 'task-2');
		expect(edges).toHaveLength(2);
		expect(edges.map((e) => e.rel)).toContain('depends_on');
		expect(edges.map((e) => e.rel)).toContain('blocks');
	});

	it('returns empty array when no edges exist', () => {
		const graph = buildProjectGraph(mockData);

		const edges = getEdgesBetween(graph, 'task-1', projectId);
		expect(edges).toHaveLength(0);
	});
});

describe('findConnectedEntities', () => {
	const projectId = 'proj-1';

	const mockData: ProjectGraphData = {
		project: createMockProject(projectId, 'Test Project'),
		plans: [createMockPlan('plan-1', projectId, 'Plan A')],
		tasks: [
			createMockTask('task-1', projectId, 'Task 1'),
			createMockTask('task-2', projectId, 'Task 2'),
			createMockTask('task-3', projectId, 'Task 3')
		],
		goals: [],
		milestones: [],
		outputs: [],
		documents: [],
		requirements: [],
		metrics: [],
		sources: [],
		risks: [],
		decisions: [],
		edges: [
			createMockEdge('e1', 'project', projectId, 'plan', 'plan-1', 'has_plan', projectId),
			createMockEdge('e2', 'plan', 'plan-1', 'task', 'task-1', 'has_task', projectId),
			createMockEdge('e3', 'plan', 'plan-1', 'task', 'task-2', 'has_task', projectId),
			createMockEdge('e4', 'task', 'task-1', 'task', 'task-3', 'depends_on', projectId)
		]
	};

	it('finds entities within 1 hop', () => {
		const graph = buildProjectGraph(mockData);

		const connected = findConnectedEntities(graph, 'plan-1', 1);
		expect(connected.size).toBe(3); // project, task-1, task-2
		expect(connected.has(projectId)).toBe(true);
		expect(connected.has('task-1')).toBe(true);
		expect(connected.has('task-2')).toBe(true);
		expect(connected.has('task-3')).toBe(false); // 2 hops away
	});

	it('finds entities within 2 hops', () => {
		const graph = buildProjectGraph(mockData);

		const connected = findConnectedEntities(graph, 'plan-1', 2);
		expect(connected.size).toBe(4); // project, task-1, task-2, task-3
		expect(connected.has('task-3')).toBe(true);
	});
});

describe('getGraphStats', () => {
	const projectId = 'proj-1';

	const mockData: ProjectGraphData = {
		project: createMockProject(projectId, 'Test Project'),
		plans: [createMockPlan('plan-1', projectId, 'Plan A')],
		tasks: [
			createMockTask('task-1', projectId, 'Task 1'),
			createMockTask('task-2', projectId, 'Task 2')
		],
		goals: [createMockGoal('goal-1', projectId, 'Goal 1')],
		milestones: [],
		outputs: [],
		documents: [],
		requirements: [],
		metrics: [],
		sources: [],
		risks: [],
		decisions: [],
		edges: [
			createMockEdge('e1', 'project', projectId, 'plan', 'plan-1', 'has_plan', projectId),
			createMockEdge('e2', 'plan', 'plan-1', 'task', 'task-1', 'has_task', projectId),
			createMockEdge('e3', 'plan', 'plan-1', 'task', 'task-2', 'has_task', projectId),
			createMockEdge('e4', 'task', 'task-1', 'task', 'task-2', 'depends_on', projectId)
		]
	};

	it('calculates correct statistics', () => {
		const graph = buildProjectGraph(mockData);
		const stats = getGraphStats(graph);

		expect(stats.totalEntities).toBe(5); // 1 project + 1 plan + 2 tasks + 1 goal
		expect(stats.totalEdges).toBe(4);
		expect(stats.entitiesByKind.project).toBe(1);
		expect(stats.entitiesByKind.plan).toBe(1);
		expect(stats.entitiesByKind.task).toBe(2);
		expect(stats.entitiesByKind.goal).toBe(1);
		expect(stats.edgesByRelationship['has_plan']).toBe(1);
		expect(stats.edgesByRelationship['has_task']).toBe(2);
		expect(stats.edgesByRelationship['depends_on']).toBe(1);
	});
});

// ============================================
// Additional Mock Entity Helpers
// ============================================

function createMockMilestone(id: string, projectId: string, title: string): OntoMilestone {
	return {
		id,
		project_id: projectId,
		title,
		type_key: 'milestone.default',
		props: {},
		created_by: 'actor-1',
		created_at: new Date().toISOString()
	};
}

function createMockDocument(id: string, projectId: string, title: string): OntoDocument {
	return {
		id,
		project_id: projectId,
		title,
		type_key: 'document.default',
		state_key: 'draft',
		props: {},
		created_by: 'actor-1',
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString()
	};
}

function createMockRisk(id: string, projectId: string, title: string): OntoRisk {
	return {
		id,
		project_id: projectId,
		title,
		type_key: 'risk.default',
		state_key: 'identified',
		impact: 'medium',
		probability: 'medium',
		props: {},
		created_by: 'actor-1',
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString()
	};
}

function createMockDecision(id: string, projectId: string, title: string): OntoDecision {
	return {
		id,
		project_id: projectId,
		title,
		type_key: 'decision.default',
		props: {},
		created_by: 'actor-1',
		created_at: new Date().toISOString()
	};
}

// ============================================
// Project-Level Traversal Methods Tests
// ============================================

describe('project-level traversal methods', () => {
	const projectId = 'proj-1';

	const mockDataWithAllEntities: ProjectGraphData = {
		project: createMockProject(projectId, 'Test Project'),
		plans: [createMockPlan('plan-1', projectId, 'Plan A')],
		tasks: [createMockTask('task-1', projectId, 'Task 1')],
		goals: [createMockGoal('goal-1', projectId, 'Goal 1')],
		milestones: [
			createMockMilestone('milestone-1', projectId, 'Milestone 1'),
			createMockMilestone('milestone-2', projectId, 'Milestone 2')
		],
		outputs: [createMockOutput('output-1', projectId, 'Output 1')],
		documents: [
			createMockDocument('doc-1', projectId, 'Document 1'),
			createMockDocument('doc-2', projectId, 'Document 2')
		],
		requirements: [],
		metrics: [],
		sources: [],
		risks: [createMockRisk('risk-1', projectId, 'Risk 1')],
		decisions: [
			createMockDecision('decision-1', projectId, 'Decision 1'),
			createMockDecision('decision-2', projectId, 'Decision 2')
		],
		edges: [
			createMockEdge('e1', 'project', projectId, 'plan', 'plan-1', 'has_plan', projectId),
			createMockEdge('e2', 'plan', 'plan-1', 'task', 'task-1', 'has_task', projectId),
			createMockEdge('e3', 'project', projectId, 'goal', 'goal-1', 'has_goal', projectId),
			createMockEdge(
				'e4',
				'project',
				projectId,
				'milestone',
				'milestone-1',
				'has_milestone',
				projectId
			),
			createMockEdge(
				'e5',
				'project',
				projectId,
				'milestone',
				'milestone-2',
				'has_milestone',
				projectId
			),
			createMockEdge(
				'e6',
				'project',
				projectId,
				'document',
				'doc-1',
				'has_document',
				projectId
			),
			createMockEdge(
				'e7',
				'project',
				projectId,
				'document',
				'doc-2',
				'has_document',
				projectId
			),
			createMockEdge('e8', 'project', projectId, 'risk', 'risk-1', 'has_risk', projectId),
			createMockEdge(
				'e9',
				'project',
				projectId,
				'output',
				'output-1',
				'has_output',
				projectId
			),
			createMockEdge(
				'e10',
				'project',
				projectId,
				'decision',
				'decision-1',
				'has_decision',
				projectId
			),
			createMockEdge(
				'e11',
				'project',
				projectId,
				'decision',
				'decision-2',
				'has_decision',
				projectId
			)
		]
	};

	it('getMilestonesForProject returns milestones linked via has_milestone', () => {
		const graph = buildProjectGraph(mockDataWithAllEntities);
		const milestones = graph.getMilestonesForProject();

		expect(milestones).toHaveLength(2);
		expect(milestones.map((m) => m.title)).toContain('Milestone 1');
		expect(milestones.map((m) => m.title)).toContain('Milestone 2');
	});

	it('getDocumentsForProject returns documents linked via has_document', () => {
		const graph = buildProjectGraph(mockDataWithAllEntities);
		const documents = graph.getDocumentsForProject();

		expect(documents).toHaveLength(2);
		expect(documents.map((d) => d.title)).toContain('Document 1');
		expect(documents.map((d) => d.title)).toContain('Document 2');
	});

	it('getRisksForProject returns risks linked via has_risk', () => {
		const graph = buildProjectGraph(mockDataWithAllEntities);
		const risks = graph.getRisksForProject();

		expect(risks).toHaveLength(1);
		expect(risks[0].title).toBe('Risk 1');
	});

	it('does not expose removed decision accessors', () => {
		const graph = buildProjectGraph(mockDataWithAllEntities);
		expect((graph as any).getDecisionsForProject).toBeUndefined();
	});

	it('does not expose removed output accessors', () => {
		const graph = buildProjectGraph(mockDataWithAllEntities);
		expect((graph as any).getOutputsForProject).toBeUndefined();
	});

	it('getEntitiesForProject generic method works for plans', () => {
		const graph = buildProjectGraph(mockDataWithAllEntities);
		const plans = graph.getEntitiesForProject('plan');

		expect(plans).toHaveLength(1);
		expect(plans[0].name).toBe('Plan A');
	});

	it('getEntitiesForProject generic method works for milestones', () => {
		const graph = buildProjectGraph(mockDataWithAllEntities);
		const milestones = graph.getEntitiesForProject('milestone');

		expect(milestones).toHaveLength(2);
	});

	it('getEntitiesForProject generic method works for risks', () => {
		const graph = buildProjectGraph(mockDataWithAllEntities);
		const risks = graph.getEntitiesForProject('risk');

		expect(risks).toHaveLength(1);
	});

	it('getEntitiesForProject returns empty array for tasks (belong to plans)', () => {
		const graph = buildProjectGraph(mockDataWithAllEntities);
		const tasks = graph.getEntitiesForProject('task');

		expect(tasks).toHaveLength(0);
	});

	it('getEntitiesForProject returns empty array for project kind', () => {
		const graph = buildProjectGraph(mockDataWithAllEntities);
		const projects = graph.getEntitiesForProject('project');

		expect(projects).toHaveLength(0);
	});

	it('getEntitiesForProject returns empty for unsupported kinds', () => {
		const graph = buildProjectGraph(mockDataWithAllEntities);
		const decisions = (graph as any).getEntitiesForProject('decision');

		expect(decisions).toHaveLength(0);
	});

	it('ignores has_decision edges for containment lookups', () => {
		const graph = buildProjectGraph(mockDataWithAllEntities);

		const projectChildren = graph.getChildren(projectId);
		expect(projectChildren.map((c) => c.id)).not.toContain('decision-1');
		expect(projectChildren.map((c) => c.id)).not.toContain('decision-2');

		const decisionParent = graph.getParent('decision-1');
		expect(decisionParent).toBeUndefined();
	});
});
