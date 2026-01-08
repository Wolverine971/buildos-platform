// apps/web/src/lib/services/ontology/project-graph-serializer.test.ts
import { describe, it, expect } from 'vitest';
import {
	serializeProjectGraph,
	deserializeProjectGraph,
	serializeProjectGraphData,
	isSerializedProjectGraph
} from './project-graph-serializer';
import { buildProjectGraph } from './project-graph-builder';
import type { ProjectGraphData } from '$lib/types/project-graph.types';
import type { OntoProject, OntoPlan, OntoTask, OntoGoal, OntoEdge } from '$lib/types/onto-api';

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

// Test data
const projectId = 'proj-1';

const mockData: ProjectGraphData = {
	project: createMockProject(projectId, 'Test Project'),
	plans: [
		createMockPlan('plan-1', projectId, 'Plan A'),
		createMockPlan('plan-2', projectId, 'Plan B')
	],
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
		createMockEdge('e2', 'project', projectId, 'plan', 'plan-2', 'has_plan', projectId),
		createMockEdge('e3', 'plan', 'plan-1', 'task', 'task-1', 'has_task', projectId),
		createMockEdge('e4', 'plan', 'plan-2', 'task', 'task-2', 'has_task', projectId),
		createMockEdge('e5', 'project', projectId, 'goal', 'goal-1', 'has_goal', projectId)
	]
};

describe('serializeProjectGraph', () => {
	it('converts Maps to arrays/records', () => {
		const graph = buildProjectGraph(mockData);
		const serialized = serializeProjectGraph(graph);

		// entitiesByKind should be arrays, not Maps
		expect(Array.isArray(serialized.entitiesByKind.task)).toBe(true);
		expect(Array.isArray(serialized.entitiesByKind.plan)).toBe(true);
		expect(Array.isArray(serialized.entitiesByKind.project)).toBe(true);

		// edgeIndex should be plain objects, not Maps
		expect(typeof serialized.edgeIndex.outgoing).toBe('object');
		expect(serialized.edgeIndex.outgoing instanceof Map).toBe(false);
		expect(typeof serialized.edgeIndex.incoming).toBe('object');
		expect(serialized.edgeIndex.incoming instanceof Map).toBe(false);
	});

	it('produces JSON-serializable output', () => {
		const graph = buildProjectGraph(mockData);
		const serialized = serializeProjectGraph(graph);

		// Should not throw when stringified
		expect(() => JSON.stringify(serialized)).not.toThrow();

		// Should be able to parse it back
		const json = JSON.stringify(serialized);
		const parsed = JSON.parse(json);
		expect(parsed.project.id).toBe(projectId);
	});

	it('includes metadata with version and timestamp', () => {
		const graph = buildProjectGraph(mockData);
		const serialized = serializeProjectGraph(graph);

		expect(serialized._serialized).toBeDefined();
		expect(serialized._serialized.version).toBe(1);
		expect(serialized._serialized.timestamp).toBeDefined();
		expect(typeof serialized._serialized.timestamp).toBe('string');
	});

	it('preserves all entity data', () => {
		const graph = buildProjectGraph(mockData);
		const serialized = serializeProjectGraph(graph);

		expect(serialized.entitiesByKind.plan).toHaveLength(2);
		expect(serialized.entitiesByKind.task).toHaveLength(2);
		expect(serialized.entitiesByKind.goal).toHaveLength(1);
		expect(serialized.entitiesByKind.project).toHaveLength(1);
	});

	it('preserves all edges', () => {
		const graph = buildProjectGraph(mockData);
		const serialized = serializeProjectGraph(graph);

		expect(serialized.edges).toHaveLength(5);
	});

	it('preserves edge indexes', () => {
		const graph = buildProjectGraph(mockData);
		const serialized = serializeProjectGraph(graph);

		// Check outgoing edges from project
		expect(serialized.edgeIndex.outgoing[projectId]).toBeDefined();
		expect(serialized.edgeIndex.outgoing[projectId]).toHaveLength(3); // 2 has_plan + 1 has_goal

		// Check byRelationship
		expect(serialized.edgeIndex.byRelationship['has_plan']).toHaveLength(2);
		expect(serialized.edgeIndex.byRelationship['has_task']).toHaveLength(2);
		expect(serialized.edgeIndex.byRelationship['has_goal']).toHaveLength(1);
	});
});

describe('deserializeProjectGraph', () => {
	it('reconstructs a working ProjectGraph', () => {
		const original = buildProjectGraph(mockData);
		const serialized = serializeProjectGraph(original);
		const restored = deserializeProjectGraph(serialized);

		// Basic entity lookup should work
		expect(restored.getEntity('task-1')).toBeDefined();
		expect(restored.getEntity('task-1')?.id).toBe('task-1');

		// Traversal methods should work
		expect(restored.getTasksForPlan('plan-1')).toHaveLength(1);
		expect(restored.getTasksForPlan('plan-1')[0].title).toBe('Task 1');
	});

	it('roundtrip preserves all entities', () => {
		const original = buildProjectGraph(mockData);
		const serialized = serializeProjectGraph(original);
		const restored = deserializeProjectGraph(serialized);

		expect(restored.entitiesById.size).toBe(original.entitiesById.size);
		expect(restored.entitiesByKind.plan.size).toBe(original.entitiesByKind.plan.size);
		expect(restored.entitiesByKind.task.size).toBe(original.entitiesByKind.task.size);
	});

	it('roundtrip preserves all edges', () => {
		const original = buildProjectGraph(mockData);
		const serialized = serializeProjectGraph(original);
		const restored = deserializeProjectGraph(serialized);

		expect(restored.edges.length).toBe(original.edges.length);
	});

	it('restored graph traversal methods work correctly', () => {
		const original = buildProjectGraph(mockData);
		const serialized = serializeProjectGraph(original);
		const restored = deserializeProjectGraph(serialized);

		// getPlansForProject
		const originalPlans = original.getPlansForProject();
		const restoredPlans = restored.getPlansForProject();
		expect(restoredPlans).toHaveLength(originalPlans.length);
		expect(restoredPlans.map((p) => p.id).sort()).toEqual(
			originalPlans.map((p) => p.id).sort()
		);

		// getGoalsForProject
		const originalGoals = original.getGoalsForProject();
		const restoredGoals = restored.getGoalsForProject();
		expect(restoredGoals).toHaveLength(originalGoals.length);

		// getChildren
		const originalChildren = original.getChildren(projectId);
		const restoredChildren = restored.getChildren(projectId);
		expect(restoredChildren).toHaveLength(originalChildren.length);

		// getParent
		const originalParent = original.getParent('task-1');
		const restoredParent = restored.getParent('task-1');
		expect(restoredParent?.id).toBe(originalParent?.id);
	});

	it('survives JSON stringify/parse cycle', () => {
		const original = buildProjectGraph(mockData);
		const serialized = serializeProjectGraph(original);

		// Simulate network transmission / load function
		const json = JSON.stringify(serialized);
		const parsed = JSON.parse(json);
		const restored = deserializeProjectGraph(parsed);

		expect(restored.getEntity('task-1')).toBeDefined();
		expect(restored.getPlansForProject()).toHaveLength(2);
	});
});

describe('serializeProjectGraphData', () => {
	it('creates a valid SerializedProjectGraph from raw data', () => {
		const serialized = serializeProjectGraphData(mockData);

		expect(serialized.project.id).toBe(projectId);
		expect(serialized._serialized.version).toBe(1);
		expect(serialized.entitiesByKind.task).toHaveLength(2);
	});

	it('builds edge indexes from raw data', () => {
		const serialized = serializeProjectGraphData(mockData);

		// Outgoing edges should be indexed
		expect(serialized.edgeIndex.outgoing[projectId]).toBeDefined();
		expect(serialized.edgeIndex.outgoing['plan-1']).toBeDefined();

		// Incoming edges should be indexed
		expect(serialized.edgeIndex.incoming['plan-1']).toBeDefined();
		expect(serialized.edgeIndex.incoming['task-1']).toBeDefined();

		// byRelationship should be indexed
		expect(serialized.edgeIndex.byRelationship['has_plan']).toHaveLength(2);
	});

	it('can be deserialized to a working graph', () => {
		const serialized = serializeProjectGraphData(mockData);
		const graph = deserializeProjectGraph(serialized);

		expect(graph.getPlansForProject()).toHaveLength(2);
		expect(graph.getTasksForPlan('plan-1')).toHaveLength(1);
	});
});

describe('isSerializedProjectGraph', () => {
	it('returns true for valid SerializedProjectGraph', () => {
		const graph = buildProjectGraph(mockData);
		const serialized = serializeProjectGraph(graph);

		expect(isSerializedProjectGraph(serialized)).toBe(true);
	});

	it('returns true after JSON roundtrip', () => {
		const graph = buildProjectGraph(mockData);
		const serialized = serializeProjectGraph(graph);
		const parsed = JSON.parse(JSON.stringify(serialized));

		expect(isSerializedProjectGraph(parsed)).toBe(true);
	});

	it('returns false for null', () => {
		expect(isSerializedProjectGraph(null)).toBe(false);
	});

	it('returns false for undefined', () => {
		expect(isSerializedProjectGraph(undefined)).toBe(false);
	});

	it('returns false for non-objects', () => {
		expect(isSerializedProjectGraph('string')).toBe(false);
		expect(isSerializedProjectGraph(123)).toBe(false);
		expect(isSerializedProjectGraph(true)).toBe(false);
	});

	it('returns false for objects missing _serialized', () => {
		expect(isSerializedProjectGraph({ project: {}, edges: [] })).toBe(false);
	});

	it('returns false for objects with wrong version', () => {
		expect(
			isSerializedProjectGraph({
				_serialized: { version: 2 },
				project: {},
				edges: [],
				entitiesByKind: {}
			})
		).toBe(false);
	});
});
