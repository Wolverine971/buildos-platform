import { describe, expect, it, vi } from 'vitest';
import { buildContainmentEdges, fetchContainmentEdges } from './containment-organizer';

describe('buildContainmentEdges', () => {
	it('keeps project fallback implicit instead of persisting a project edge', () => {
		expect(
			buildContainmentEdges({
				projectId: 'project-1',
				childKind: 'task',
				childId: 'task-1',
				parents: [],
				allowProjectFallback: true
			})
		).toEqual([]);
	});

	it('selects the highest-precedence parent before materializing an edge', () => {
		expect(
			buildContainmentEdges({
				projectId: 'project-1',
				childKind: 'task',
				childId: 'task-1',
				parents: [
					{ kind: 'goal', id: 'goal-1' },
					{ kind: 'plan', id: 'plan-1' }
				]
			})
		).toEqual([
			{
				project_id: 'project-1',
				src_kind: 'plan',
				src_id: 'plan-1',
				dst_kind: 'task',
				dst_id: 'task-1',
				rel: 'has_task',
				props: { is_primary: true }
			}
		]);
	});

	it('retains same-kind multi-parent edges with exactly one primary', () => {
		const edges = buildContainmentEdges({
			projectId: 'project-1',
			childKind: 'task',
			childId: 'task-1',
			parents: [
				{ kind: 'plan', id: 'plan-1', is_primary: true },
				{ kind: 'plan', id: 'plan-2', is_primary: true }
			],
			allowMultiParent: true
		});

		expect(edges.map((edge) => edge.src_id)).toEqual(['plan-1', 'plan-2']);
		expect(edges.map((edge) => edge.props.is_primary)).toEqual([true, false]);
	});

	it('loads the exact persisted edge snapshot used by merge preconditions', async () => {
		const row = {
			project_id: 'project-1',
			src_kind: 'milestone',
			src_id: 'milestone-1',
			dst_kind: 'plan',
			dst_id: 'plan-1',
			rel: 'has_plan',
			props: { is_primary: true, source: 'manual' }
		};
		const query: Record<string, any> = {};
		query.select = vi.fn(() => query);
		query.eq = vi.fn(() => query);
		query.in = vi.fn(async () => ({ data: [row], error: null }));
		const supabase = { from: vi.fn(() => query) };

		await expect(
			fetchContainmentEdges({
				supabase: supabase as any,
				childKind: 'plan',
				childId: 'plan-1'
			})
		).resolves.toEqual([row]);
	});
});
