// apps/worker/tests/agenticChatCreateOntoProjectMutationAdapter.test.ts
import { describe, expect, it, vi } from 'vitest';
import { AgenticChatCreateOntoProjectMutationAdapter } from '../src/workers/agentic-chat/createOntoProjectMutationAdapter';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';
const EFFECT_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const SESSION_ID = '55555555-5555-4555-8555-555555555555';
const NOW = Date.parse('2026-08-11T14:30:00.000Z');
const COUNTS = {
	goals: 0,
	requirements: 0,
	plans: 0,
	tasks: 0,
	documents: 1,
	sources: 0,
	metrics: 0,
	milestones: 0,
	risks: 0,
	edges: 0
};

function mutationInput(overrides: Record<string, unknown> = {}) {
	return {
		effectId: EFFECT_ID,
		downstreamIdempotencyKey: `chat-effect:${EFFECT_ID}`,
		toolName: 'create_onto_project',
		operationName: 'onto.project.create',
		downstreamIdempotencySupported: false,
		arguments: {
			project: {
				name: 'Launch Site',
				type_key: 'project.business.product_launch',
				description: '  Ship the new site.  ',
				state_key: 'In Progress',
				props: { facets: { context: 'commercial', stage: 'execution' } },
				start_at: '2026-08',
				end_at: '2026'
			},
			entities: [],
			relationships: []
		},
		providerToolCallId: 'provider-create-project',
		executionInput: {
			claim: { userId: USER_ID, sessionId: SESSION_ID },
			requestPayload: {
				message: 'Create a launch project',
				context: { type: 'project_create' }
			},
			artifact: {
				prepared: {
					toolSurface: {
						surfaceProfile: 'test_create_project',
						toolNames: ['create_onto_project'],
						definitions: [
							{
								type: 'function',
								function: {
									name: 'create_onto_project',
									description: 'Create project shell',
									parameters: { type: 'object', properties: {} }
								}
							}
						]
					}
				}
			}
		},
		signal: new AbortController().signal,
		...overrides
	} as never;
}

function successData(overrides: Record<string, unknown> = {}) {
	return {
		project_id: PROJECT_ID,
		project: { id: PROJECT_ID, name: 'Launch Site' },
		counts: COUNTS,
		created_entities: [
			{ kind: 'project', id: PROJECT_ID, project_id: PROJECT_ID },
			{ kind: 'document', id: DOCUMENT_ID, project_id: PROJECT_ID }
		],
		...overrides
	};
}

describe('AgenticChatCreateOntoProjectMutationAdapter', () => {
	it('creates one project shell once and restores the compound legacy receipt', async () => {
		const runGateway = vi.fn(async () => ({ ok: true, data: successData() }));
		const expectedContextMarkdown = [
			'# Launch Site Context Document',
			'## Vision & Summary',
			'Ship the new site.',
			'## Source Notes / Spark',
			'Not provided yet.',
			'## Initial Goals',
			'No goals captured yet.',
			'## Initial Tasks / Threads',
			'No starter tasks captured yet.'
		].join('\n\n');
		const adapter = new AgenticChatCreateOntoProjectMutationAdapter({} as never, {
			runGateway: runGateway as never,
			now: () => NOW
		});

		await expect(adapter.execute(mutationInput())).resolves.toEqual({
			project_id: PROJECT_ID,
			counts: COUNTS,
			created_entities: [
				{ kind: 'project', id: PROJECT_ID, project_id: PROJECT_ID },
				{ kind: 'document', id: DOCUMENT_ID, project_id: PROJECT_ID }
			],
			message: `Created project "Launch Site" (ID: ${PROJECT_ID}) with 1 documents`,
			context_shift: {
				new_context: 'project',
				entity_id: PROJECT_ID,
				entity_name: 'Launch Site',
				entity_type: 'project'
			}
		});
		expect(runGateway).toHaveBeenCalledOnce();
		expect(runGateway).toHaveBeenCalledWith({
			admin: {},
			userId: USER_ID,
			scope: {
				mode: 'read_write',
				allowed_ops: ['onto.project.create'],
				project_ids: [],
				write_project_ids: []
			},
			op: 'onto.project.create',
			args: {
				project: {
					name: 'Launch Site',
					type_key: 'project.business.product_launch',
					description: '  Ship the new site.  ',
					state_key: 'active',
					props: { facets: { context: 'commercial', stage: 'execution' } },
					start_at: '2026-08-01T00:00:00.000Z',
					end_at: '2026-12-31T23:59:59.000Z'
				},
				entities: [],
				relationships: [],
				context_document: {
					title: 'Launch Site Context Document',
					content: expectedContextMarkdown,
					body_markdown: expectedContextMarkdown,
					type_key: 'document.context.project',
					state_key: 'active',
					props: {
						source: 'agent_project_creation',
						generated_at: '2026-08-11T14:30:00.000Z'
					}
				}
			},
			chatSessionId: SESSION_ID
		});
	});

	it('rejects graph creation, project scope, fiction profiles, and unreviewed props', async () => {
		const runGateway = vi.fn();
		const adapter = new AgenticChatCreateOntoProjectMutationAdapter({} as never, {
			runGateway: runGateway as never
		});

		const graph = mutationInput() as any;
		graph.arguments.entities = [{ temp_id: 'g1', kind: 'goal', name: 'Ship' }];
		await expect(adapter.execute(graph)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});

		const projectContext = mutationInput() as any;
		projectContext.executionInput.requestPayload.context = {
			type: 'project',
			entityId: PROJECT_ID,
			projectId: PROJECT_ID
		};
		await expect(adapter.execute(projectContext)).rejects.toMatchObject({
			failureCode: 'mutation_context_invalid'
		});

		const fiction = mutationInput() as any;
		fiction.arguments.project.type_key = 'project.creative.novel';
		await expect(adapter.execute(fiction)).rejects.toMatchObject({
			failureCode: 'mutation_arguments_not_admitted'
		});

		const reserved = mutationInput() as any;
		reserved.arguments.project.props.agent_workspace = { mode: 'living_reference' };
		await expect(adapter.execute(reserved)).rejects.toMatchObject({
			failureCode: 'mutation_arguments_not_admitted'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('separates known gateway failures from uncertain compound outcomes', async () => {
		const knownAdapter = new AgenticChatCreateOntoProjectMutationAdapter({} as never, {
			runGateway: vi.fn(async () => ({
				ok: false,
				error: { code: 'VALIDATION_ERROR', message: 'invalid shell' }
			})) as never
		});
		await expect(knownAdapter.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'create_onto_project_validation_error'
		});

		const thrownAdapter = new AgenticChatCreateOntoProjectMutationAdapter({} as never, {
			runGateway: vi.fn(async () => {
				throw new Error('response lost');
			}) as never
		});
		await expect(thrownAdapter.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'create_onto_project_gateway_threw'
		});

		const malformedAdapter = new AgenticChatCreateOntoProjectMutationAdapter({} as never, {
			runGateway: vi.fn(async () => ({
				ok: true,
				data: successData({ counts: { ...COUNTS, tasks: 1 } })
			})) as never
		});
		await expect(malformedAdapter.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'create_onto_project_receipt_invalid'
		});
	});
});

describe('AgenticChatCreateOntoProjectMutationAdapter civil-day bounds', () => {
	function timezoneClient(timezone: string | null) {
		return {
			from: vi.fn(() => ({
				select: () => ({
					eq: () => ({
						maybeSingle: async () => ({
							data: timezone === null ? null : { timezone },
							error: null
						})
					})
				})
			}))
		};
	}

	async function dispatchedProjectArgs(input: {
		timezone: string | null;
		start_at?: string;
		end_at?: string;
	}) {
		const runGateway = vi.fn(async () => ({ ok: true, data: successData() }));
		const adapter = new AgenticChatCreateOntoProjectMutationAdapter(
			timezoneClient(input.timezone) as never,
			{ runGateway: runGateway as never, now: () => NOW }
		);
		const mutation = mutationInput() as any;
		mutation.arguments.project = {
			name: 'Launch Site',
			type_key: 'project.business.product_launch',
			...(input.start_at !== undefined ? { start_at: input.start_at } : {}),
			...(input.end_at !== undefined ? { end_at: input.end_at } : {})
		};

		await adapter.execute(mutation);
		return (runGateway.mock.calls[0]?.[0] as any).args.project as Record<string, unknown>;
	}

	it('resolves a date-only start to the first moment of that civil day', async () => {
		const project = await dispatchedProjectArgs({
			timezone: 'America/New_York',
			start_at: '2026-09-14'
		});

		expect(project.start_at).toBe('2026-09-14T04:00:00.000Z');
	});

	it('resolves a date-only end to the last second of that civil day', async () => {
		const project = await dispatchedProjectArgs({
			timezone: 'America/New_York',
			end_at: '2026-11-20'
		});

		expect(project.end_at).toBe('2026-11-21T04:59:59.000Z');
	});

	it('falls back to the UTC civil day when the user has no timezone row', async () => {
		const project = await dispatchedProjectArgs({
			timezone: null,
			start_at: '2026-09-14',
			end_at: '2026-11-20'
		});

		expect(project.start_at).toBe('2026-09-14T00:00:00.000Z');
		expect(project.end_at).toBe('2026-11-20T23:59:59.000Z');
	});

	it('passes a full datetime through unchanged', async () => {
		const project = await dispatchedProjectArgs({
			timezone: 'America/New_York',
			start_at: '2026-09-14T15:30:00.000Z'
		});

		expect(project.start_at).toBe('2026-09-14T15:30:00.000Z');
	});
});
