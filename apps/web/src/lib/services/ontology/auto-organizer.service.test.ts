import { describe, expect, it, vi } from 'vitest';
import {
	AutoOrganizeError,
	assertEntityRefsInProject,
	autoOrganizeConnections,
	autoOrganizeEntityEdges
} from './auto-organizer.service';

type TableFixture = {
	ids: string[];
	error?: { message: string } | null;
};

function createSupabaseMock(fixtures: Record<string, TableFixture>) {
	const queries: Array<{ table: string; ids: string[] }> = [];

	function createQuery(table: string) {
		let selectedId: string | null = null;
		const query: Record<string, any> = {};
		query.select = vi.fn(() => query);
		query.eq = vi.fn((column: string, value: string) => {
			if (column === 'id') selectedId = value;
			return query;
		});
		query.is = vi.fn(() => query);
		query.in = vi.fn((_column: string, ids: string[]) => {
			queries.push({ table, ids });
			const fixture = fixtures[table] ?? { ids: [] };
			return Promise.resolve({
				data: fixture.ids.filter((id) => ids.includes(id)).map((id) => ({ id })),
				error: fixture.error ?? null
			});
		});
		query.delete = vi.fn(() => query);
		query.insert = vi.fn(async () => ({ error: null }));
		query.maybeSingle = vi.fn(async () => {
			queries.push({ table, ids: selectedId ? [selectedId] : [] });
			const fixture = fixtures[table] ?? { ids: [] };
			return {
				data: selectedId && fixture.ids.includes(selectedId) ? { id: selectedId } : null,
				error: fixture.error ?? null
			};
		});
		return query;
	}

	return {
		supabase: {
			from: vi.fn((table: string) => createQuery(table))
		},
		queries
	};
}

describe('assertEntityRefsInProject', () => {
	it('deduplicates references and validates each entity kind with one set query', async () => {
		const { supabase, queries } = createSupabaseMock({
			onto_tasks: { ids: ['task-1', 'task-2'] },
			onto_plans: { ids: ['plan-1'] }
		});

		await assertEntityRefsInProject({
			supabase: supabase as any,
			projectId: 'project-1',
			refs: [
				{ kind: 'task', id: 'task-1' },
				{ kind: 'task', id: 'task-2' },
				{ kind: 'task', id: 'task-1' },
				{ kind: 'plan', id: 'plan-1' },
				{ kind: 'project', id: 'project-1' }
			]
		});

		expect(queries).toEqual([
			{ table: 'onto_tasks', ids: ['task-1', 'task-2'] },
			{ table: 'onto_plans', ids: ['plan-1'] }
		]);
		expect(supabase.from).toHaveBeenCalledTimes(2);
	});

	it('preserves the entity-kind-specific not-found error for a missing set member', async () => {
		const { supabase } = createSupabaseMock({
			onto_tasks: { ids: ['task-1'] }
		});

		await expect(
			assertEntityRefsInProject({
				supabase: supabase as any,
				projectId: 'project-1',
				refs: [
					{ kind: 'task', id: 'task-1' },
					{ kind: 'task', id: 'task-missing' }
				]
			})
		).rejects.toEqual(new AutoOrganizeError('task not found', 404));
	});

	it('rejects a mismatched project reference without querying entity tables', async () => {
		const { supabase } = createSupabaseMock({});

		await expect(
			assertEntityRefsInProject({
				supabase: supabase as any,
				projectId: 'project-1',
				refs: [{ kind: 'project', id: 'project-2' }]
			})
		).rejects.toEqual(new AutoOrganizeError('parent project_id must match project_id', 400));
		expect(supabase.from).not.toHaveBeenCalled();
	});
});

describe('autoOrganizeConnections validation reuse', () => {
	it('validates semantic connection references once before planning and applying writes', async () => {
		const { supabase, queries } = createSupabaseMock({
			onto_documents: { ids: ['doc-1'] }
		});

		await autoOrganizeConnections({
			supabase: supabase as any,
			projectId: 'project-1',
			entity: { kind: 'goal', id: 'goal-1' },
			connections: [{ kind: 'document', id: 'doc-1' }],
			options: { mode: 'replace' }
		});

		expect(queries.filter((query) => query.table === 'onto_documents')).toEqual([
			{ table: 'onto_documents', ids: ['doc-1'] }
		]);
	});

	it('does not re-query references that the mutation guard already validated', async () => {
		const { supabase, queries } = createSupabaseMock({
			onto_plans: { ids: ['plan-1'] },
			onto_edges: { ids: [] }
		});

		await autoOrganizeConnections({
			supabase: supabase as any,
			projectId: 'project-1',
			entity: { kind: 'goal', id: 'goal-1' },
			connections: [{ kind: 'plan', id: 'plan-1' }],
			options: { mode: 'replace' },
			referencesValidated: true
		});

		expect(queries.some((query) => query.table === 'onto_plans')).toBe(false);
		expect(queries.filter((query) => query.table === 'onto_edges')).toHaveLength(3);
	});
});

describe('semantic replacement failures', () => {
	it('surfaces a failed replacement delete instead of reporting success', async () => {
		const query: Record<string, any> = {};
		query.delete = vi.fn(() => query);
		query.eq = vi.fn(() => query);
		query.then = (
			resolve: (value: { error: { message: string } }) => void,
			_reject: (reason?: unknown) => void
		) => resolve({ error: { message: 'delete failed' } });
		const supabase = { from: vi.fn(() => query) };

		await expect(
			autoOrganizeEntityEdges({
				supabase: supabase as any,
				projectId: 'project-1',
				entity: { kind: 'goal', id: 'goal-1' },
				referencesValidated: true,
				semantic: [{ rel: 'references', targets: [], mode: 'replace' }]
			})
		).rejects.toEqual(new AutoOrganizeError('delete failed', 500));
	});
});
