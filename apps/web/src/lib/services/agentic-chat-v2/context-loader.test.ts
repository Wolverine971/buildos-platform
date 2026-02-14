// apps/web/src/lib/services/agentic-chat-v2/context-loader.test.ts
import { describe, expect, it, vi } from 'vitest';
import { loadFastChatPromptContext } from './context-loader';

type QueryResult = {
	data: any;
	error: any;
};

function createDailyBriefSupabaseMock(config: {
	dailyBrief: QueryResult;
	projectBriefs: QueryResult;
	entities: QueryResult;
}) {
	const from = vi.fn().mockImplementation((table: string) => {
		if (table === 'ontology_daily_briefs') {
			const maybeSingle = vi.fn().mockResolvedValue(config.dailyBrief);
			const eqUser = vi.fn().mockReturnValue({ maybeSingle });
			const eqId = vi.fn().mockReturnValue({ eq: eqUser });
			const select = vi.fn().mockReturnValue({ eq: eqId });
			return { select };
		}

		if (table === 'ontology_project_briefs') {
			const order = vi.fn().mockResolvedValue(config.projectBriefs);
			const eq = vi.fn().mockReturnValue({ order });
			const select = vi.fn().mockReturnValue({ eq });
			return { select };
		}

		if (table === 'ontology_brief_entities') {
			const order = vi.fn().mockResolvedValue(config.entities);
			const eq = vi.fn().mockReturnValue({ order });
			const select = vi.fn().mockReturnValue({ eq });
			return { select };
		}

		throw new Error(`Unexpected table in mock: ${table}`);
	});

	return { from } as any;
}

describe('loadFastChatPromptContext daily_brief', () => {
	it('prefers ontology_brief_entities as mentioned-entity source', async () => {
		const supabase = createDailyBriefSupabaseMock({
			dailyBrief: {
				data: {
					id: 'brief-1',
					brief_date: '2026-02-14',
					executive_summary: 'Summary',
					priority_actions: ['Do the thing'],
					generation_status: 'completed',
					llm_analysis: null,
					metadata: { generatedVia: 'ontology_v1' }
				},
				error: null
			},
			projectBriefs: {
				data: [
					{
						id: 'pb-1',
						project_id: 'proj-1',
						brief_content: 'Project brief',
						metadata: {},
						created_at: '2026-02-14T10:00:00.000Z',
						project: { name: 'Alpha' }
					}
				],
				error: null
			},
			entities: {
				data: [
					{
						id: 'be-1',
						entity_kind: 'task',
						entity_id: 'task-123',
						project_id: 'proj-1',
						role: 'priority',
						project: { name: 'Alpha' }
					}
				],
				error: null
			}
		});

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'daily_brief',
			entityId: 'brief-1'
		});

		const data = context.data as Record<string, any>;
		expect(data.brief_id).toBe('brief-1');
		expect(data.mentioned_entities).toHaveLength(1);
		expect(data.mentioned_entities[0]).toMatchObject({
			entity_kind: 'task',
			entity_id: 'task-123',
			source: 'ontology_brief_entities'
		});
		expect(data.mentioned_entity_counts).toMatchObject({ task: 1 });
	});

	it('falls back to markdown-link parsing when ontology_brief_entities is empty', async () => {
		const supabase = createDailyBriefSupabaseMock({
			dailyBrief: {
				data: {
					id: 'brief-2',
					brief_date: '2026-02-14',
					executive_summary: 'See [Alpha](/projects/proj-1).',
					priority_actions: [],
					generation_status: 'completed',
					llm_analysis: null,
					metadata: {}
				},
				error: null
			},
			projectBriefs: {
				data: [
					{
						id: 'pb-2',
						project_id: 'proj-1',
						brief_content:
							'Ship auth fixes. [Fix auth blocker](/projects/proj-1/tasks/task-123)',
						metadata: {},
						created_at: '2026-02-14T11:00:00.000Z',
						project: { name: 'Alpha' }
					}
				],
				error: null
			},
			entities: {
				data: [],
				error: null
			}
		});

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'daily_brief',
			entityId: 'brief-2'
		});

		const data = context.data as Record<string, any>;
		expect(data.mentioned_entities.length).toBeGreaterThanOrEqual(1);
		expect(data.mentioned_entities).toContainEqual(
			expect.objectContaining({
				entity_kind: 'task',
				entity_id: 'task-123',
				source: 'markdown_link_fallback'
			})
		);
	});
});
