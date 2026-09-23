// apps/web/src/lib/services/next-step-generation.service.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEEPSEEK_V4_FLASH_MODEL, PROJECT_NEXT_STEP_MODELS } from '@buildos/smart-llm';

vi.mock('$env/static/private', () => ({
	PRIVATE_OPENROUTER_API_KEY: 'openrouter-test-key'
}));

vi.mock('$env/dynamic/private', () => ({
	env: {}
}));

import {
	generateNextStepRecommendationFromPrompt,
	generateProjectNextStep
} from './next-step-generation.service';

describe('next-step generation model fallback', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('advances through the default JSON roster when the primary is rate-limited', async () => {
		const requestBodies: Array<Record<string, unknown>> = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body) as Record<string, unknown>);
			}

			if (requestBodies.length === 1) {
				return new Response(
					JSON.stringify({
						error: {
							message: 'Provider returned error',
							code: 429,
							metadata: {
								raw: `${DEEPSEEK_V4_FLASH_MODEL} is temporarily rate-limited upstream`,
								provider_name: 'DeepSeek'
							}
						}
					}),
					{
						status: 429,
						headers: {
							'content-type': 'application/json'
						}
					}
				);
			}

			return new Response(
				JSON.stringify({
					id: 'chatcmpl-next-step-fallback',
					model: PROJECT_NEXT_STEP_MODELS[1],
					choices: [
						{
							index: 0,
							message: {
								role: 'assistant',
								content:
									'{"short":"Start the draft","long":"Work on [[task:t1|the draft]] next."}'
							},
							finish_reason: 'stop'
						}
					],
					usage: {
						prompt_tokens: 10,
						completion_tokens: 4,
						total_tokens: 14
					}
				}),
				{
					status: 200,
					headers: {
						'content-type': 'application/json'
					}
				}
			);
		});

		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const result = await generateNextStepRecommendationFromPrompt(
			'Recommend the next action.',
			{
				userId: 'user-1',
				projectId: 'project-1'
			}
		);

		expect(result).toEqual({
			short: 'Start the draft',
			long: 'Work on [[task:t1|the draft]] next.'
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
		// First request: primary candidate + an OpenRouter fallback list. The exact
		// list is shaped by lane resolution (dedupe/capability filter), so assert the
		// mechanism structurally rather than pinning the transformed array: it leads
		// with the next default model and never re-includes the rate-limited primary.
		expect(requestBodies[0]?.model).toBe(DEEPSEEK_V4_FLASH_MODEL);
		expect(requestBodies[0]?.model).toBe(PROJECT_NEXT_STEP_MODELS[0]);
		expect(Array.isArray(requestBodies[0]?.models)).toBe(true);
		expect((requestBodies[0]?.models as string[])?.[0]).toBe(PROJECT_NEXT_STEP_MODELS[1]);
		expect(requestBodies[0]?.models).not.toContain(DEEPSEEK_V4_FLASH_MODEL);
		// After the primary is rate-limited, the retry advances through the chain:
		// it pins the next model and forwards the remaining fallbacks, never
		// re-attempting the rate-limited primary or repeating the now-pinned model.
		expect(requestBodies[1]?.model).toBe(PROJECT_NEXT_STEP_MODELS[1]);
		expect(requestBodies[1]?.models).not.toContain(DEEPSEEK_V4_FLASH_MODEL);
		expect(requestBodies[1]?.models).not.toContain(PROJECT_NEXT_STEP_MODELS[1]);
	});
});

describe('next-step project context', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	type Op = {
		table: string;
		filters: Array<[string, string, unknown]>;
		orders: Array<[string, unknown]>;
	};

	function createSupabase(tables: Record<string, unknown[]>) {
		const ops: Op[] = [];
		const from = (table: string) => {
			const op: Op = { table, filters: [], orders: [] };
			ops.push(op);
			const result = () => ({
				data: table === 'onto_projects' ? tables[table]?.[0] : (tables[table] ?? []),
				error: null
			});
			const builder: any = {
				select: () => builder,
				update: () => builder,
				eq: (c: string, v: unknown) => (op.filters.push(['eq', c, v]), builder),
				is: (c: string, v: unknown) => (op.filters.push(['is', c, v]), builder),
				in: (c: string, v: unknown) => (op.filters.push(['in', c, v]), builder),
				not: (c: string, o: string, v: unknown) => (
					op.filters.push(['not', c, v]),
					builder
				),
				order: (c: string, opts: unknown) => (op.orders.push([c, opts]), builder),
				limit: () => builder,
				single: () => Promise.resolve(result()),
				then: (
					resolve: (value: unknown) => unknown,
					reject: (reason: unknown) => unknown
				) => Promise.resolve(result()).then(resolve, reject)
			};
			return builder;
		};
		return { supabase: { from } as any, ops };
	}

	it('reads open, non-deleted tasks with priority 1 (Critical) first and judges goals by state_key', async () => {
		const { supabase, ops } = createSupabase({
			onto_projects: [
				{ id: 'p1', name: 'Book', description: null, state_key: 'active', type_key: null }
			],
			onto_tasks: [
				{
					id: 'critical',
					title: 'Critical fix',
					state_key: 'todo',
					priority: 1,
					due_at: null,
					props: null,
					completed_at: null,
					updated_at: '2026-09-01T00:00:00Z'
				},
				{
					id: 'someday',
					title: 'Someday polish',
					state_key: 'todo',
					priority: 5,
					due_at: null,
					props: null,
					completed_at: null,
					updated_at: '2026-09-01T00:00:00Z'
				}
			],
			onto_goals: [
				{
					id: 'g-done',
					name: 'Finished goal',
					type_key: null,
					state_key: 'achieved',
					props: {}
				},
				{ id: 'g-live', name: 'Live goal', type_key: null, state_key: 'active', props: {} }
			]
		});
		const getJSONResponse = vi.fn().mockResolvedValue({ short: 'Do it', long: 'Do it now.' });
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network disabled in tests')));

		await generateProjectNextStep(supabase, 'p1', 'user-1', {
			llmClient: { getJSONResponse } as any
		});

		const openTaskQuery = ops.find(
			(op) => op.table === 'onto_tasks' && op.orders.some(([column]) => column === 'priority')
		);
		expect(openTaskQuery?.filters).toContainEqual(['is', 'deleted_at', null]);
		expect(openTaskQuery?.filters).toContainEqual([
			'in',
			'state_key',
			['todo', 'in_progress', 'blocked']
		]);
		expect(openTaskQuery?.orders[0]).toEqual([
			'priority',
			{ ascending: true, nullsFirst: false }
		]);
		for (const table of ['onto_goals', 'onto_plans', 'onto_milestones']) {
			expect(ops.find((op) => op.table === table)?.filters).toContainEqual([
				'is',
				'deleted_at',
				null
			]);
		}

		const prompt = getJSONResponse.mock.calls[0]?.[0]?.userPrompt as string;
		const highPriority = prompt.split('### 🔥 High Priority Tasks')[1]?.split('###')[0] ?? '';
		expect(highPriority).toContain('task:critical');
		expect(highPriority).not.toContain('task:someday');
		expect(prompt).toContain('- Active: 1, Completed: 1');
	});
});
