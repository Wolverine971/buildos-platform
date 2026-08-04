// apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.write-integrity.test.ts
/**
 * Track A write-path integrity tests.
 *
 * D1  — append/merge must abort (throw) when existing content cannot be loaded,
 *       rather than silently PATCHing the new content as the full body.
 * D15 — an explicit but invalid state_key must throw, rather than producing an
 *       empty {} PATCH that the route reports as a successful "Updated".
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { OntologyWriteExecutor } from './ontology-write-executor';
import type { ExecutorContext } from './types';

const buildJsonResponse = (payload: any) => ({
	ok: true,
	status: 200,
	statusText: 'OK',
	headers: {
		get: () => 'application/json'
	},
	json: async () => payload,
	text: async () => JSON.stringify(payload)
});

describe('OntologyWriteExecutor write-path integrity', () => {
	const userId = 'user-1';
	const sessionId = 'session-1';
	const actorId = 'actor-1';

	let mockSupabase: SupabaseClient<Database>;
	let patchBodies: any[];
	let mockFetch: ReturnType<typeof vi.fn>;
	let context: ExecutorContext;

	beforeEach(() => {
		mockSupabase = {
			from: vi.fn(),
			rpc: vi.fn().mockResolvedValue({ data: actorId, error: null }),
			auth: {
				getSession: vi.fn().mockResolvedValue({
					data: { session: { access_token: 'test-token' } }
				})
			}
		} as unknown as SupabaseClient<Database>;

		patchBodies = [];
		mockFetch = vi.fn().mockImplementation((url, options) => {
			const urlValue = String(url);
			const body = options?.body ? JSON.parse(options.body as string) : null;

			if (options?.method === 'PATCH') {
				patchBodies.push({ url: urlValue, body });
			}

			if (urlValue.includes('/api/onto/documents/') && options?.method === 'PATCH') {
				return Promise.resolve(
					buildJsonResponse({
						success: true,
						data: { document: { id: 'doc-1', title: 'Doc', content: body?.content } }
					})
				);
			}

			if (urlValue.includes('/api/onto/tasks/') && options?.method === 'PATCH') {
				return Promise.resolve(
					buildJsonResponse({
						success: true,
						data: { task: { id: 'task-1', title: 'Task' } }
					})
				);
			}

			return Promise.resolve({
				ok: false,
				status: 404,
				statusText: 'Not Found',
				headers: { get: () => 'application/json' },
				json: async () => ({ error: 'Unexpected request' }),
				text: async () => 'Unexpected request'
			});
		});

		context = {
			supabase: mockSupabase,
			userId,
			sessionId,
			fetchFn: mockFetch as unknown as typeof fetch,
			getActorId: async () => actorId,
			getAdminSupabase: () => mockSupabase as any,
			getAuthHeaders: async () => ({})
		};
	});

	describe('create-project payload integrity', () => {
		it('repairs nested graph collections before calling the instantiate endpoint', async () => {
			let instantiateBody: Record<string, any> | null = null;
			mockFetch.mockImplementationOnce((_url, options) => {
				instantiateBody = JSON.parse(String(options?.body));
				return Promise.resolve(
					buildJsonResponse({
						project_id: 'project-1',
						counts: { goals: 1, tasks: 1, edges: 1 }
					})
				);
			});
			const executor = new OntologyWriteExecutor(context);

			const result = await executor.createOntoProject({
				project: {
					name: 'Christian School Launch',
					type_key: 'project.nonprofit.school_launch',
					entities: [
						{ temp_id: 'goal-1', kind: 'goal', name: 'Validate demand' },
						{ temp_id: 'task-1', kind: 'task', title: 'Interview parents' }
					],
					relationships: [
						{
							from: { temp_id: 'goal-1', kind: 'goal' },
							to: { temp_id: 'task-1', kind: 'task' },
							rel: 'contains'
						}
					]
				}
			} as any);

			expect(result.project_id).toBe('project-1');
			expect(instantiateBody?.project).not.toHaveProperty('entities');
			expect(instantiateBody?.project).not.toHaveProperty('relationships');
			expect(instantiateBody?.entities).toHaveLength(2);
			expect(instantiateBody?.relationships).toHaveLength(1);
		});
	});

	describe('D1 — append/merge aborts on existing-content load failure', () => {
		it('throws (does not PATCH) when the existing-content loader fails under append', async () => {
			const executor = new OntologyWriteExecutor(context);

			await expect(
				executor.updateOntoDocument(
					{
						document_id: 'doc-1',
						content: 'Newly appended paragraph.',
						update_strategy: 'append'
					},
					async () => {
						throw new Error('boom: could not read document');
					}
				)
			).rejects.toThrow(/existing content could not be loaded/i);

			// Critical: no PATCH may have been sent — the existing body must not be clobbered.
			expect(patchBodies).toHaveLength(0);
		});

		it('throws when the existing-content loader fails under merge_llm', async () => {
			const executor = new OntologyWriteExecutor(context);

			await expect(
				executor.updateOntoDocument(
					{
						document_id: 'doc-1',
						content: 'Merge this in.',
						update_strategy: 'merge_llm'
					},
					async () => {
						throw new Error('boom: loader failed');
					}
				)
			).rejects.toThrow(/existing content could not be loaded/i);

			expect(patchBodies).toHaveLength(0);
		});

		it('replace strategy is unaffected by a failing loader (loader never called)', async () => {
			const executor = new OntologyWriteExecutor(context);
			const loader = vi.fn(async () => {
				throw new Error('loader should not be called for replace');
			});

			const result = await executor.updateOntoDocument(
				{
					document_id: 'doc-1',
					content: 'Full replacement body.',
					update_strategy: 'replace'
				},
				loader
			);

			expect(loader).not.toHaveBeenCalled();
			expect(patchBodies).toHaveLength(1);
			expect(patchBodies[0].body.content).toBe('Full replacement body.');
			expect(result.message).toContain('Updated ontology document');
		});

		it('append still succeeds when existing content loads', async () => {
			const executor = new OntologyWriteExecutor(context);

			await executor.updateOntoDocument(
				{
					document_id: 'doc-1',
					content: 'Appended line.',
					update_strategy: 'append'
				},
				async () => ({
					document: { id: 'doc-1', content: 'Existing body.', project_id: 'project-1' }
				})
			);

			expect(patchBodies).toHaveLength(1);
			expect(patchBodies[0].body.content).toBe('Existing body.\n\nAppended line.');
		});
	});

	describe('D2 — merge_llm scales tokens and rejects a truncated merge', () => {
		const longExisting = 'E'.repeat(8000);

		it('scales the merge token cap above the old 2000 default for long documents', async () => {
			const generateTextDetailed = vi.fn(async () => ({
				text: `MERGED ${'M'.repeat(8500)}`
			}));
			context.llmService = { generateTextDetailed } as any;
			const executor = new OntologyWriteExecutor(context);

			await executor.updateOntoDocument(
				{
					document_id: 'doc-1',
					content: 'New paragraph to weave in.',
					update_strategy: 'merge_llm'
				},
				async () => ({
					document: { id: 'doc-1', content: longExisting, project_id: 'project-1' }
				})
			);

			expect(generateTextDetailed).toHaveBeenCalledTimes(1);
			const mergeArgs = generateTextDetailed.mock.calls[0][0] as {
				maxTokens?: number;
				timeoutMs?: number;
			};
			expect(mergeArgs.maxTokens).toBeGreaterThan(2000);
			expect(mergeArgs.timeoutMs).toBe(25_000);

			// A merge at least as long as the existing body is accepted and PATCHed.
			expect(patchBodies).toHaveLength(1);
			expect(patchBodies[0].body.content).toContain('MERGED');
		});

		it('falls back to a safe append when the merge comes back materially shorter', async () => {
			const generateTextDetailed = vi.fn(async () => ({ text: 'short merged output' }));
			context.llmService = { generateTextDetailed } as any;
			const executor = new OntologyWriteExecutor(context);

			await executor.updateOntoDocument(
				{
					document_id: 'doc-1',
					content: 'New paragraph to weave in.',
					update_strategy: 'merge_llm'
				},
				async () => ({
					document: { id: 'doc-1', content: longExisting, project_id: 'project-1' }
				})
			);

			// The truncated merge must NOT replace the long document.
			expect(patchBodies).toHaveLength(1);
			expect(patchBodies[0].body.content).not.toBe('short merged output');
			expect(patchBodies[0].body.content).toBe(
				`${longExisting}\n\nNew paragraph to weave in.`
			);
		});

		it('falls back to a safe append when the merge returns the original body unchanged', async () => {
			const existing = '# Start Here\n\nNext step: submit the application.';
			const incoming = 'Now waiting to hear back on next steps.';
			const generateTextDetailed = vi.fn(async () => ({ text: existing }));
			context.llmService = { generateTextDetailed } as any;
			const executor = new OntologyWriteExecutor(context);

			await executor.updateOntoDocument(
				{
					document_id: 'doc-1',
					content: incoming,
					update_strategy: 'merge_llm'
				},
				async () => ({
					document: { id: 'doc-1', content: existing, project_id: 'project-1' }
				})
			);

			expect(generateTextDetailed).toHaveBeenCalledTimes(1);
			expect(patchBodies).toHaveLength(1);
			expect(patchBodies[0].body.content).toBe(`${existing}\n\n${incoming}`);
		});

		it('does not duplicate content that was already durably present', async () => {
			const incoming = 'Now waiting to hear back on next steps.';
			const existing = `# Start Here\n\n${incoming}`;
			const generateTextDetailed = vi.fn(async () => ({ text: existing }));
			context.llmService = { generateTextDetailed } as any;
			const executor = new OntologyWriteExecutor(context);

			await executor.updateOntoDocument(
				{
					document_id: 'doc-1',
					content: incoming,
					update_strategy: 'merge_llm'
				},
				async () => ({
					document: { id: 'doc-1', content: existing, project_id: 'project-1' }
				})
			);

			expect(patchBodies).toHaveLength(1);
			expect(patchBodies[0].body.content).toBe(existing);
		});
	});

	describe('D15 — invalid task state_key throws instead of a no-op PATCH', () => {
		it('throws for an unmapped state such as "cancelled" and sends no PATCH', async () => {
			const executor = new OntologyWriteExecutor(context);

			await expect(
				executor.updateOntoTask(
					{ task_id: 'task-1', state_key: 'cancelled' },
					async () => ({ task: { id: 'task-1', project_id: 'project-1' } })
				)
			).rejects.toThrow(/Invalid task state_key "cancelled"/);

			expect(patchBodies).toHaveLength(0);
		});

		it('throws for "wont_do" and names the valid options', async () => {
			const executor = new OntologyWriteExecutor(context);

			await expect(
				executor.updateOntoTask({ task_id: 'task-1', state_key: 'wont_do' }, async () => ({
					task: { id: 'task-1', project_id: 'project-1' }
				}))
			).rejects.toThrow(/todo, in_progress, blocked, done/);
		});

		it('normalizes and PATCHes a valid state (completed -> done)', async () => {
			const executor = new OntologyWriteExecutor(context);

			await executor.updateOntoTask(
				{ task_id: 'task-1', state_key: 'completed' },
				async () => ({ task: { id: 'task-1', project_id: 'project-1' } })
			);

			expect(patchBodies).toHaveLength(1);
			expect(patchBodies[0].body.state_key).toBe('done');
		});

		it('does not require a state change (title-only update still works)', async () => {
			const executor = new OntologyWriteExecutor(context);

			await executor.updateOntoTask(
				{ task_id: 'task-1', title: 'Renamed task' },
				async () => ({ task: { id: 'task-1', project_id: 'project-1' } })
			);

			expect(patchBodies).toHaveLength(1);
			expect(patchBodies[0].body).not.toHaveProperty('state_key');
			expect(patchBodies[0].body.title).toBe('Renamed task');
		});
	});

	describe('no-effect task update throws instead of reporting success (2026-07-31 reschedule incident)', () => {
		const storedTask = {
			id: 'task-1',
			project_id: 'project-1',
			title: 'Send the launch announcement to the beta list',
			type_key: 'task.default',
			state_key: 'todo',
			priority: 2,
			due_at: '2026-08-05T15:00:00+00:00'
		};

		it('throws when the patch only resends the current title/type echo, and sends no PATCH', async () => {
			const executor = new OntologyWriteExecutor(context);

			await expect(
				executor.updateOntoTask(
					{
						task_id: 'task-1',
						title: 'Send the launch announcement to the beta list',
						type_key: 'task.default'
					},
					async () => ({ task: storedTask })
				)
			).rejects.toThrow(/No-effect update.*due_at/s);

			expect(patchBodies).toHaveLength(0);
		});

		it('treats an equivalent-but-differently-formatted due_at as unchanged', async () => {
			const executor = new OntologyWriteExecutor(context);

			await expect(
				executor.updateOntoTask(
					{
						task_id: 'task-1',
						title: 'Send the launch announcement to the beta list',
						due_at: '2026-08-05T15:00:00Z'
					},
					async () => ({ task: storedTask })
				)
			).rejects.toThrow(/No-effect update/);

			expect(patchBodies).toHaveLength(0);
		});

		it('PATCHes when due_at actually moves, even alongside echoed fields', async () => {
			const executor = new OntologyWriteExecutor(context);

			await executor.updateOntoTask(
				{
					task_id: 'task-1',
					title: 'Send the launch announcement to the beta list',
					type_key: 'task.default',
					due_at: '2026-08-07T15:00:00Z'
				},
				async () => ({ task: storedTask })
			);

			expect(patchBodies).toHaveLength(1);
			expect(patchBodies[0].body.due_at).toBe('2026-08-07T15:00:00Z');
		});

		it('skips the check when the payload touches non-scalar fields such as props', async () => {
			const executor = new OntologyWriteExecutor(context);
			const loader = vi.fn(async () => ({ task: storedTask }));

			await executor.updateOntoTask(
				{
					task_id: 'task-1',
					title: 'Send the launch announcement to the beta list',
					props: { note: 'unchanged-looking but not compared' }
				},
				loader
			);

			expect(loader).not.toHaveBeenCalled();
			expect(patchBodies).toHaveLength(1);
		});

		it('fails open when the details loader fails — the PATCH still runs', async () => {
			const executor = new OntologyWriteExecutor(context);

			await executor.updateOntoTask(
				{
					task_id: 'task-1',
					title: 'Send the launch announcement to the beta list'
				},
				async () => {
					throw new Error('details fetch failed');
				}
			);

			expect(patchBodies).toHaveLength(1);
		});
	});
});
