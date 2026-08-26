// apps/web/src/routes/api/onto/shared/entity-linked-helpers.test.ts
import { describe, expect, it, vi } from 'vitest';
import { resolveLinkedEntitiesGeneric } from './entity-linked-helpers';

describe('resolveLinkedEntitiesGeneric', () => {
	it('matches the source kind and keeps a linked entity with the same UUID in another kind', async () => {
		const sourceId = 'shared-id';
		const edges = [
			{
				id: 'unrelated-edge',
				src_id: sourceId,
				src_kind: 'goal',
				dst_id: 'unrelated-task',
				dst_kind: 'task',
				rel: 'references'
			},
			{
				id: 'valid-edge',
				src_id: sourceId,
				src_kind: 'task',
				dst_id: sourceId,
				dst_kind: 'risk',
				rel: 'blocked_by'
			}
		];
		const from = vi.fn((table: string) => {
			if (table === 'onto_edges') {
				return {
					select: () => ({ or: async () => ({ data: edges, error: null }) })
				};
			}

			return {
				select: () => ({
					in: (column: string, ids: string[]) => {
						expect(column).toBe('id');
						return {
							is: async () => ({
								data:
									table === 'onto_risks' && ids.includes(sourceId)
										? [
												{
													id: sourceId,
													title: 'Same-ID risk',
													state_key: 'open'
												}
											]
										: [],
								error: null
							})
						};
					}
				})
			};
		});

		const result = await resolveLinkedEntitiesGeneric({ from } as never, sourceId, 'task');

		expect(result.tasks).toEqual([]);
		expect(result.risks).toEqual([
			expect.objectContaining({
				id: sourceId,
				title: 'Same-ID risk',
				edge_id: 'valid-edge',
				edge_direction: 'outgoing'
			})
		]);
		expect(from).not.toHaveBeenCalledWith('onto_tasks');
	});
});
