// apps/web/src/lib/services/ontology/relationship-resolver.test.ts
import { describe, it, expect } from 'vitest';
import { buildRelationshipMutationPlan, resolveConnections } from './relationship-resolver';

describe('resolveConnections task fallback behavior', () => {
	const entity = { kind: 'task' as const, id: 'task-1' };

	it('keeps project fallback when task only references a document', () => {
		const plan = resolveConnections({
			entity,
			connections: [{ kind: 'document', id: 'doc-1' }]
		});

		expect(plan.entityContainment?.allowProjectFallback).toBe(true);
	});

	it('keeps project fallback when task only connects to a risk', () => {
		const plan = resolveConnections({
			entity,
			connections: [{ kind: 'risk', id: 'risk-1' }]
		});

		expect(plan.entityContainment?.allowProjectFallback).toBe(true);
		expect(plan.childContainment).toHaveLength(1);
		expect(plan.childContainment[0]?.child.kind).toBe('risk');
	});

	it('disables project fallback when task connects to a plan', () => {
		const plan = resolveConnections({
			entity,
			connections: [{ kind: 'plan', id: 'plan-1' }]
		});

		expect(plan.entityContainment?.allowProjectFallback).toBe(false);
	});

	it('disables project fallback and creates dependency for task-to-task', () => {
		const plan = resolveConnections({
			entity,
			connections: [{ kind: 'task', id: 'task-2' }]
		});

		expect(plan.entityContainment?.allowProjectFallback).toBe(false);
		const semanticRels = plan.entitySemantic.map((edge) => edge.rel);
		expect(semanticRels).toContain('depends_on');
	});
});

describe('resolveConnections project reference safeguards', () => {
	it('does not infer references for project-document connections', () => {
		const plan = resolveConnections({
			entity: { kind: 'document' as const, id: 'doc-1' },
			connections: [{ kind: 'project', id: 'project-1' }]
		});

		expect(plan.entitySemantic).toHaveLength(0);
		expect(plan.entityProjectEdge).toBeUndefined();
	});

	it('does not infer references for project-source connections', () => {
		const plan = resolveConnections({
			entity: { kind: 'source' as const, id: 'source-1' },
			connections: [{ kind: 'project', id: 'project-1' }]
		});

		expect(plan.entitySemantic).toHaveLength(0);
		expect(plan.entityProjectEdge).toBeUndefined();
	});
});

describe('resolveConnections deprecated relationship aliases', () => {
	it('preserves blocked_by semantics as incoming blocks', () => {
		const plan = resolveConnections({
			entity: { kind: 'task' as const, id: 'task-1' },
			connections: [{ kind: 'task', id: 'task-2', rel: 'blocked_by' }]
		});

		expect(plan.entitySemantic).toContainEqual(
			expect.objectContaining({
				rel: 'blocks',
				direction: 'incoming',
				targets: [{ kind: 'task', id: 'task-2' }]
			})
		);
	});

	it('preserves referenced_by semantics as incoming references', () => {
		const plan = resolveConnections({
			entity: { kind: 'task' as const, id: 'task-1' },
			connections: [{ kind: 'document', id: 'doc-1', rel: 'referenced_by' }]
		});

		expect(plan.entitySemantic).toContainEqual(
			expect.objectContaining({
				rel: 'references',
				direction: 'incoming',
				targets: [{ kind: 'document', id: 'doc-1' }]
			})
		);
	});
});

describe('buildRelationshipMutationPlan', () => {
	it('materializes goal relationship intent into explicit serializable edge mutations', () => {
		const entity = { kind: 'goal' as const, id: 'goal-1' };
		const resolved = resolveConnections({
			entity,
			connections: [
				{ kind: 'plan', id: 'plan-1' },
				{ kind: 'document', id: 'doc-1' }
			],
			options: { mode: 'replace' }
		});

		const plan = buildRelationshipMutationPlan({
			projectId: 'project-1',
			entity,
			resolved,
			options: { mode: 'replace' },
			references: [
				{ kind: 'plan', id: 'plan-1' },
				{ kind: 'document', id: 'doc-1' },
				{ kind: 'plan', id: 'plan-1' }
			],
			existingContainmentByChild: new Map([
				[
					'plan:plan-1',
					[
						{
							project_id: 'project-1',
							src_kind: 'milestone' as const,
							src_id: 'milestone-1',
							dst_kind: 'plan' as const,
							dst_id: 'plan-1',
							rel: 'has_plan' as const,
							props: { is_primary: true }
						}
					]
				]
			])
		});

		expect(plan.references).toEqual([
			{ kind: 'plan', id: 'plan-1' },
			{ kind: 'document', id: 'doc-1' }
		]);
		expect(plan.entityContainment).toEqual({
			type: 'containment',
			child: entity,
			expectedEdges: null,
			desiredEdges: []
		});
		expect(plan.childContainment).toEqual([
			{
				type: 'containment',
				child: { kind: 'plan', id: 'plan-1' },
				expectedEdges: [
					{
						project_id: 'project-1',
						src_kind: 'milestone',
						src_id: 'milestone-1',
						dst_kind: 'plan',
						dst_id: 'plan-1',
						rel: 'has_plan',
						props: { is_primary: true }
					}
				],
				desiredEdges: [
					{
						project_id: 'project-1',
						src_kind: 'milestone',
						src_id: 'milestone-1',
						dst_kind: 'plan',
						dst_id: 'plan-1',
						rel: 'has_plan',
						props: { is_primary: true }
					}
				]
			}
		]);
		expect(plan.semantic).toEqual([
			{
				type: 'semantic',
				entity,
				rel: 'references',
				direction: 'outgoing',
				mode: 'replace',
				desiredEdges: [
					{
						project_id: 'project-1',
						src_kind: 'goal',
						src_id: 'goal-1',
						dst_kind: 'document',
						dst_id: 'doc-1',
						rel: 'references',
						props: { is_primary: false }
					}
				]
			}
		]);
		expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
	});

	it('evaluates semantic props callbacks before the write boundary', () => {
		const entity = { kind: 'task' as const, id: 'task-1' };
		const plan = buildRelationshipMutationPlan({
			projectId: 'project-1',
			entity,
			resolved: {
				entitySemantic: [
					{
						rel: 'references',
						direction: 'incoming',
						mode: 'merge',
						targets: [{ kind: 'document', id: 'doc-1' }],
						props: (target) => ({ source_id: target.id })
					}
				],
				childContainment: []
			}
		});

		expect(plan.semantic[0]?.desiredEdges).toEqual([
			{
				project_id: 'project-1',
				src_kind: 'document',
				src_id: 'doc-1',
				dst_kind: 'task',
				dst_id: 'task-1',
				rel: 'references',
				props: { is_primary: false, source_id: 'doc-1' }
			}
		]);
		expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
	});
});
