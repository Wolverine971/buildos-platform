// packages/agentic-chat-runtime/src/tools/ontology-detail-reads.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import {
	getOntoGoalDetails,
	getOntoMilestoneDetails,
	loadOntoDocumentApiDetail
} from './ontology-detail-reads';

const PROJECT_ID = '40000000-0000-4000-8000-000000000004';

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
			for (const method of ['select', 'eq', 'is', 'order', 'limit']) {
				query[method] = vi.fn(() => query);
			}
			query.maybeSingle = vi.fn(async () => {
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

describe('shared ontology detail reads', () => {
	it('gates on a minimal project ref before loading and sanitizing the full goal', async () => {
		const { context, access, builders, events } = createContext({
			onto_goals: [
				{ data: { id: 'goal-1', project_id: PROJECT_ID }, error: null },
				{
					data: {
						id: 'goal-1',
						project_id: PROJECT_ID,
						name: 'Launch',
						search_vector: "'launch':1",
						props: { search_vector: "'nested':1", kept: true },
						project: { id: PROJECT_ID, name: 'BuildOS', created_by: 'actor-1' }
					},
					error: null
				}
			]
		});

		await expect(getOntoGoalDetails(context, { goal_id: 'goal-1' })).resolves.toEqual({
			goal: {
				id: 'goal-1',
				project_id: PROJECT_ID,
				name: 'Launch',
				props: { kept: true }
			},
			message: 'Complete ontology goal details loaded.'
		});
		expect(events).toEqual([
			'query:onto_goals:0',
			`access:${PROJECT_ID}`,
			'query:onto_goals:1'
		]);
		expect(access.assertProjectAccess).toHaveBeenCalledWith(PROJECT_ID, 'read');
		expect(builders[0]?.query.select).toHaveBeenCalledWith('id, project_id');
		expect(builders[1]?.query.eq).toHaveBeenCalledWith('project_id', PROJECT_ID);
	});

	it('returns the legacy recovery payload without attempting an access check', async () => {
		const { context, access, builders } = createContext({
			onto_goals: [{ data: null, error: null }]
		});

		await expect(getOntoGoalDetails(context, { goal_id: 'stale-goal' })).resolves.toEqual({
			status: 'not_found',
			found: false,
			goal_id: 'stale-goal',
			goal: null,
			message:
				'Goal not found. The goal may have been deleted, archived, inaccessible, or the ID may be stale. Use search_onto_goals to find a current goal.'
		});
		expect(access.assertProjectAccess).not.toHaveBeenCalled();
		expect(builders).toHaveLength(1);
	});

	it('adds the latest goal edge and computed missed state to milestone details', async () => {
		const { context } = createContext({
			onto_milestones: [
				{ data: { id: 'milestone-1', project_id: PROJECT_ID }, error: null },
				{
					data: {
						id: 'milestone-1',
						project_id: PROJECT_ID,
						title: 'Ship beta',
						type_key: 'milestone.default',
						state_key: 'pending',
						due_at: '2026-08-01T00:00:00.000Z',
						project: { id: PROJECT_ID, name: 'BuildOS' }
					},
					error: null
				}
			],
			onto_edges: [{ data: { src_id: 'goal-1' }, error: null }]
		});

		await expect(
			getOntoMilestoneDetails(context, { milestone_id: 'milestone-1' })
		).resolves.toMatchObject({
			milestone: {
				id: 'milestone-1',
				goal_id: 'goal-1',
				effective_state_key: 'missed',
				is_missed: true,
				project: { name: 'BuildOS' }
			},
			message: 'Complete ontology milestone details loaded.'
		});
	});

	it('keeps the route-only document loader on the full UI payload', async () => {
		const document = {
			id: 'doc-1',
			project_id: PROJECT_ID,
			title: 'Specs',
			content: '# Full UI body',
			search_vector: "'specs':1"
		};
		const { context } = createContext({
			onto_documents: [
				{ data: { id: 'doc-1', project_id: PROJECT_ID }, error: null },
				{ data: document, error: null }
			]
		});

		await expect(loadOntoDocumentApiDetail(context, 'doc-1')).resolves.toEqual({ document });
	});
});
