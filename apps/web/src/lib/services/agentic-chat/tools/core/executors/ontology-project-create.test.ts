// apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-project-create.test.ts
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

describe('OntologyWriteExecutor project creation normalization', () => {
	const userId = 'user-123';
	const sessionId = 'session-456';
	const actorId = 'actor-789';

	let mockSupabase: SupabaseClient<Database>;
	let mockFetch: typeof fetch;
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

		let lastInstantiateBody: any = null;
		mockFetch = vi.fn().mockImplementation((url, options) => {
			if (String(url).includes('/api/onto/projects/instantiate')) {
				lastInstantiateBody = options?.body ? JSON.parse(options.body as string) : null;
				return Promise.resolve(
					buildJsonResponse({
						project_id: 'project-1',
						counts: { goals: 1, tasks: 2 }
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
			fetchFn: mockFetch,
			getActorId: async () => actorId,
			getAdminSupabase: () => mockSupabase as any,
			getAuthHeaders: async () => ({})
		};

		(mockFetch as any).lastInstantiateBody = () => lastInstantiateBody;
	});

	it('normalizes relationship string pairs to entity refs before instantiate', async () => {
		const executor = new OntologyWriteExecutor(context);

		await executor.createOntoProject({
			project: {
				name: 'Podcast Launch',
				type_key: 'project.creative.podcast'
			},
			entities: [
				{ temp_id: 'g1', kind: 'goal', name: 'Publish the first 3 episodes' },
				{ temp_id: 't1', kind: 'task', title: 'Define the show format' },
				{ temp_id: 't2', kind: 'task', title: 'Book the first 3 guests' }
			] as any,
			relationships: [
				['g1', 't1'],
				['g1', 't2']
			] as any
		});

		const body = (mockFetch as any).lastInstantiateBody();
		expect(body.relationships).toEqual([
			[
				{ temp_id: 'g1', kind: 'goal' },
				{ temp_id: 't1', kind: 'task' }
			],
			[
				{ temp_id: 'g1', kind: 'goal' },
				{ temp_id: 't2', kind: 'task' }
			]
		]);
	});

	it('repairs a project state value misplaced in the stage facet before instantiate', async () => {
		const executor = new OntologyWriteExecutor(context);

		await executor.createOntoProject({
			project: {
				name: 'Agentic Chat Pentest A - 2026-06-22',
				type_key: 'project.security.pentest',
				description: 'Security QA fixture. Do not use for real work.',
				state_key: 'active',
				props: {
					facets: {
						context: 'internal',
						scale: 'small',
						stage: 'active'
					}
				}
			},
			entities: [],
			relationships: []
		});

		const body = (mockFetch as any).lastInstantiateBody();
		expect(body.project.state_key).toBe('active');
		expect(body.project.props.facets).toEqual({
			context: 'internal',
			scale: 'small',
			stage: 'planning'
		});
	});

	it('moves a misplaced project stage state into state_key when state_key is omitted', async () => {
		const executor = new OntologyWriteExecutor(context);

		await executor.createOntoProject({
			project: {
				name: 'Paused Research',
				type_key: 'project.business.research',
				props: {
					facets: {
						stage: 'paused'
					}
				}
			},
			entities: [],
			relationships: []
		});

		const body = (mockFetch as any).lastInstantiateBody();
		expect(body.project.state_key).toBe('paused');
		expect(body.project.props.facets.stage).toBe('planning');
	});

	it('normalizes capitalized risk impact values before instantiate', async () => {
		const executor = new OntologyWriteExecutor(context);

		await executor.createOntoProject({
			project: {
				name: 'Risky Launch',
				type_key: 'project.business.launch'
			},
			entities: [
				{
					temp_id: 'r1',
					kind: 'risk',
					title: 'Launch timeline slips',
					impact: 'Medium'
				}
			] as any,
			relationships: []
		});

		const body = (mockFetch as any).lastInstantiateBody();
		expect(body.entities[0].impact).toBe('medium');
	});

	it('fails locally for non-repairable invalid stage facets', async () => {
		const executor = new OntologyWriteExecutor(context);

		await expect(
			executor.createOntoProject({
				project: {
					name: 'Unknown Stage',
					type_key: 'project.business.research',
					props: {
						facets: {
							stage: 'ideation'
						}
					}
				},
				entities: [],
				relationships: []
			})
		).rejects.toThrow('Invalid project.props.facets.stage');
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it('fails early with a precise relationship error when shorthand temp ids cannot be resolved', async () => {
		const executor = new OntologyWriteExecutor(context);

		await expect(
			executor.createOntoProject({
				project: {
					name: 'Podcast Launch',
					type_key: 'project.creative.podcast'
				},
				entities: [
					{ temp_id: 'g1', kind: 'goal', name: 'Publish the first 3 episodes' }
				] as any,
				relationships: [['g1', 't9']] as any
			})
		).rejects.toThrow('relationships[0][1]');
	});
});
