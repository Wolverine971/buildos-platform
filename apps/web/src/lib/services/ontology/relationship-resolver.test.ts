// apps/web/src/lib/services/ontology/relationship-resolver.test.ts
import { describe, it, expect } from 'vitest';
import { resolveConnections } from './relationship-resolver';

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
		expect(plan.entityProjectEdge).toEqual({ rel: 'has_document', mode: 'ensure' });
	});

	it('does not infer references for project-source connections', () => {
		const plan = resolveConnections({
			entity: { kind: 'source' as const, id: 'source-1' },
			connections: [{ kind: 'project', id: 'project-1' }]
		});

		expect(plan.entitySemantic).toHaveLength(0);
		expect(plan.entityProjectEdge).toEqual({ rel: 'has_source', mode: 'ensure' });
	});
});
