// apps/web/src/lib/server/organize/organize-snapshot.test.ts
import { describe, expect, it, vi } from 'vitest';
import { loadOrganizeSnapshot } from './organize-snapshot';
import { organizeFixtures } from '$lib/components/organize/organize-fixtures';

vi.mock('$lib/services/ontology/project-hierarchy.service', () => ({
	tryGetProjectFamily: vi.fn(async () => ({ child_count: 0, parent: null, children: [] }))
}));

function mockClient(
	options: {
		read?: boolean;
		write?: boolean;
		archived?: boolean;
		documentCount?: number;
		documentsError?: boolean;
	} = {}
) {
	const project = organizeFixtures()[0]!;
	const calls: [string, string, unknown[]][] = [];
	const from = vi.fn((table: string) => {
		const builder: Record<string, unknown> = {};
		for (const method of ['select', 'eq', 'is', 'neq', 'order']) {
			builder[method] = (...args: unknown[]) => {
				calls.push([table, method, args]);
				return builder;
			};
		}
		builder.maybeSingle = async () => ({
			data: {
				...project,
				doc_structure: project.structure,
				archived_at: options.archived ? '2026-09-30T12:00:00Z' : null
			},
			error: null
		});
		builder.range = async (start: number, end: number) => {
			calls.push([table, 'range', [start, end]]);
			const rows =
				table === 'onto_tasks'
					? project.tasks
					: options.documentCount === undefined
						? project.documents
						: Array.from({ length: options.documentCount }, (_, index) => ({
								...project.documents[0],
								id: String(index)
							}));
			return {
				data: rows.slice(start, end + 1),
				error:
					options.documentsError && table === 'onto_documents'
						? new Error('offline')
						: null
			};
		};
		return builder;
	});
	const rpc = vi.fn(async (_name: string, args: { p_required_access: string }) => ({
		data: args.p_required_access === 'read' ? options.read !== false : options.write !== false,
		error: null
	}));
	return {
		client: { from, rpc } as unknown as Parameters<typeof loadOrganizeSnapshot>[0],
		from,
		rpc,
		calls
	};
}

describe('Organize snapshot reads', () => {
	it('does not read project contents without membership', async () => {
		const { client, from } = mockClient({ read: false });
		await expect(loadOrganizeSnapshot(client, 'source')).rejects.toMatchObject({ status: 403 });
		expect(from).not.toHaveBeenCalled();
	});
	it('loads read-only projects without leaking raw parent ids', async () => {
		const { client, rpc, calls } = mockClient({ write: false });
		const result = await loadOrganizeSnapshot(client, 'source');
		expect(result.project.can_write).toBe(false);
		expect(result.related_projects).toEqual([]);
		expect(result.project).not.toHaveProperty('parent_project_id');
		expect(rpc).toHaveBeenCalledWith('current_actor_has_project_member_access', {
			p_project_id: 'source',
			p_required_access: 'read'
		});
		expect(calls).toContainEqual(['onto_documents', 'neq', ['state_key', 'archived']]);
		expect(calls).toContainEqual(['onto_documents', 'is', ['deleted_at', null]]);
		expect(calls).toContainEqual(['onto_tasks', 'is', ['deleted_at', null]]);
	});
	it('reads beyond the first page rather than silently dropping documents', async () => {
		const { client, calls } = mockClient({ documentCount: 501 });
		const result = await loadOrganizeSnapshot(client, 'source');
		expect(result.project.documents).toHaveLength(501);
		expect(calls).toContainEqual(['onto_documents', 'range', [500, 999]]);
	});
	it('does not turn query failures into an empty project', async () => {
		await expect(
			loadOrganizeSnapshot(mockClient({ documentsError: true }).client, 'source')
		).rejects.toThrow('Could not load project items');
	});
	it('rejects archived projects before loading their entities', async () => {
		const { client, from } = mockClient({ archived: true });
		await expect(loadOrganizeSnapshot(client, 'source')).rejects.toMatchObject({ status: 409 });
		expect(from).toHaveBeenCalledTimes(1);
	});
});
