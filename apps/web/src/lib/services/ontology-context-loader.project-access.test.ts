// apps/web/src/lib/services/ontology-context-loader.project-access.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { OntologyContextLoader } from './ontology-context-loader';

function createQuery(result: unknown) {
	return {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		or: vi.fn().mockResolvedValue(result),
		in: vi.fn().mockResolvedValue(result),
		maybeSingle: vi.fn().mockResolvedValue(result)
	};
}

describe('OntologyContextLoader project-scoped access', () => {
	let mockSupabase: SupabaseClient<Database>;
	let taskAccessQuery: ReturnType<typeof createQuery>;
	let edgeQuery: ReturnType<typeof createQuery>;
	let documentQuery: ReturnType<typeof createQuery>;

	beforeEach(() => {
		taskAccessQuery = createQuery({
			data: { project_id: 'project-1', created_by: 'owner-actor' },
			error: null
		});
		edgeQuery = createQuery({
			data: [
				{
					id: 'edge-1',
					src_kind: 'task',
					src_id: 'task-1',
					rel: 'has_document',
					dst_kind: 'document',
					dst_id: 'doc-1'
				}
			],
			error: null
		});
		documentQuery = createQuery({
			data: [
				{
					id: 'doc-1',
					project_id: 'project-1',
					title: 'Shared doc',
					type_key: 'document.context.project',
					state_key: 'draft',
					description: 'Visible through project membership'
				}
			],
			error: null
		});

		mockSupabase = {
			rpc: vi.fn((fn: string) => {
				if (fn === 'current_actor_has_project_access') {
					return Promise.resolve({ data: true, error: null });
				}
				return Promise.resolve({ data: null, error: null });
			}),
			from: vi.fn((table: string) => {
				if (table === 'onto_projects') {
					return createQuery({ data: null, error: null });
				}
				if (table === 'onto_tasks') {
					return taskAccessQuery;
				}
				if (table === 'onto_edges') {
					return edgeQuery;
				}
				if (table === 'onto_documents') {
					return documentQuery;
				}
				return createQuery({ data: null, error: null });
			})
		} as unknown as SupabaseClient<Database>;
	});

	it('loads linked entities for an entity in a readable shared project', async () => {
		const loader = new OntologyContextLoader(mockSupabase, 'collaborator-actor');

		const result = await loader.loadLinkedEntitiesContext('task-1', 'task', 'Shared task', {
			includeDescriptions: true
		});

		expect(mockSupabase.rpc).toHaveBeenCalledWith('current_actor_has_project_access', {
			p_project_id: 'project-1',
			p_required_access: 'read'
		});
		expect(taskAccessQuery.select).toHaveBeenCalledWith('project_id, created_by');
		expect(edgeQuery.or).toHaveBeenCalledWith('src_id.eq.task-1,dst_id.eq.task-1');
		expect(documentQuery.in).toHaveBeenCalledWith('id', ['doc-1']);
		expect(result.linkedEntities.documents).toHaveLength(1);
		expect(result.linkedEntities.documents[0].id).toBe('doc-1');
	});
});
