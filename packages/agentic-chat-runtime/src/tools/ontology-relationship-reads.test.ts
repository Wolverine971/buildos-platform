// packages/agentic-chat-runtime/src/tools/ontology-relationship-reads.test.ts
import { describe, expect, it, vi } from 'vitest';
import { AgenticChatToolAccessDeniedError } from './access-port';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import {
	getEntityRelationships,
	getReadableRelationshipEntityDisplayName
} from './ontology-relationship-reads';

type QueryResponse = { data: unknown; error: unknown };

function createContext(responses: Record<string, QueryResponse[]>) {
	const events: string[] = [];
	const builders: Array<{ table: string; index: number; query: Record<string, any> }> = [];
	const positions = new Map<string, number>();
	const client = {
		from: vi.fn((table: string) => {
			const index = positions.get(table) ?? 0;
			positions.set(table, index + 1);
			const response = responses[table]?.[index] ?? { data: null, error: null };
			const query: Record<string, any> = {};
			for (const method of ['select', 'eq']) {
				query[method] = vi.fn(() => query);
			}
			query.maybeSingle = vi.fn(async () => {
				events.push(`query:${table}:${index}`);
				return response;
			});
			query.limit = vi.fn(async () => {
				events.push(`query:${table}:${index}`);
				return response;
			});
			builders.push({ table, index, query });
			return query;
		})
	};
	const access = {
		getActorId: vi.fn(async () => 'actor-1'),
		resolveProjectSummaries: vi.fn(async () => []),
		assertProjectAccess: vi.fn(async (projectId: string) => {
			events.push(`access:${projectId}`);
		}),
		assertEntityAccess: vi.fn(async () => {})
	};
	return {
		context: { client, access } as unknown as AgenticChatSharedReadContextV1,
		access,
		builders,
		events
	};
}

describe('shared ontology relationship reads', () => {
	it('authorizes the source project before project-fenced edge reads', async () => {
		const { context, access, builders, events } = createContext({
			onto_projects: [{ data: null, error: null }],
			onto_tasks: [{ data: { id: 'task-1', project_id: 'project-1' }, error: null }],
			onto_edges: [
				{
					data: [{ id: 'edge-out', project_id: 'project-1', src_id: 'task-1' }],
					error: null
				},
				{
					data: [{ id: 'edge-in', project_id: 'project-1', dst_id: 'task-1' }],
					error: null
				}
			]
		});

		const result = await getEntityRelationships(context, {
			entity_id: 'task-1',
			direction: 'both'
		});

		expect(result.relationships.map((edge) => edge.direction)).toEqual([
			'outgoing',
			'incoming'
		]);
		expect(events.slice(0, 3)).toEqual([
			'query:onto_projects:0',
			'query:onto_tasks:0',
			'access:project-1'
		]);
		expect(access.assertProjectAccess).toHaveBeenCalledWith('project-1', 'read');
		for (const { query } of builders.filter(({ table }) => table === 'onto_edges')) {
			expect(query.eq).toHaveBeenCalledWith('project_id', 'project-1');
		}
	});

	it('rejects a project-less creator row before any edge fan-out', async () => {
		const { context, access } = createContext({
			onto_projects: [{ data: null, error: null }],
			onto_tasks: [
				{
					data: { id: 'task-1', project_id: null, created_by: 'actor-1' },
					error: null
				}
			]
		});

		await expect(
			getEntityRelationships(context, { entity_id: 'task-1', direction: 'both' })
		).rejects.toBeInstanceOf(AgenticChatToolAccessDeniedError);
		expect(access.assertProjectAccess).not.toHaveBeenCalled();
		expect((context.client as any).from).not.toHaveBeenCalledWith('onto_edges');
	});

	it('loads display names only through the authorized project id', async () => {
		const { context, builders } = createContext({
			onto_tasks: [
				{ data: { id: 'task-1', project_id: 'project-1' }, error: null },
				{
					data: { id: 'task-1', project_id: 'project-1', title: 'Secure task' },
					error: null
				}
			]
		});

		await expect(
			getReadableRelationshipEntityDisplayName(context, {
				entityId: 'task-1',
				entityKind: 'task'
			})
		).resolves.toEqual({ displayName: 'Secure task', projectId: 'project-1' });

		const displayQuery = builders.find(
			({ table, index }) => table === 'onto_tasks' && index === 1
		)?.query;
		expect(displayQuery?.select).toHaveBeenCalledWith('id, project_id, title');
		expect(displayQuery?.eq).toHaveBeenCalledWith('project_id', 'project-1');
	});

	it('fails closed for an unsupported entity kind instead of dereferencing missing config', async () => {
		const { context } = createContext({});

		await expect(
			getReadableRelationshipEntityDisplayName(context, {
				entityId: 'metric-1',
				entityKind: 'metric' as never
			})
		).rejects.toThrow('Unsupported relationship entity kind');
		expect((context.client as any).from).not.toHaveBeenCalled();
	});
});
