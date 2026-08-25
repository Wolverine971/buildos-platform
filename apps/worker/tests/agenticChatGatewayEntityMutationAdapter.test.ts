import { describe, expect, it, vi } from 'vitest';
import { AgenticChatGatewayEntityMutationAdapter } from '../src/workers/agentic-chat/gatewayEntityMutationAdapter';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const ENTITY_ID = '33333333-3333-4333-8333-333333333333';
const GOAL_ID = '44444444-4444-4444-8444-444444444444';
const EFFECT_ID = '55555555-5555-4555-8555-555555555555';
const USER_ID = '66666666-6666-4666-8666-666666666666';
const SESSION_ID = '77777777-7777-4777-8777-777777777777';

type SuccessCase = {
	toolName: string;
	operationName: string;
	entityKind: 'document' | 'goal' | 'plan' | 'milestone' | 'risk';
	arguments: Record<string, unknown>;
	gatewayArguments?: Record<string, unknown>;
	entity: Record<string, unknown>;
	expectedEntity: Record<string, unknown>;
	message: string;
};

const SUCCESS_CASES: SuccessCase[] = [
	{
		toolName: 'update_onto_document',
		operationName: 'onto.document.update',
		entityKind: 'document',
		arguments: {
			document_id: ENTITY_ID,
			content: '\nNext section',
			update_strategy: 'append',
			props: {}
		},
		gatewayArguments: {
			document_id: ENTITY_ID,
			content: '\nNext section',
			update_strategy: 'append'
		},
		entity: {
			id: ENTITY_ID,
			project_id: PROJECT_ID,
			title: 'Decision log',
			props: { origin: 'external_agent', retained: true },
			project_name: 'Fixture project'
		},
		expectedEntity: {
			id: ENTITY_ID,
			project_id: PROJECT_ID,
			title: 'Decision log',
			props: { retained: true }
		},
		message: 'Updated ontology document "Decision log"'
	},
	{
		toolName: 'create_onto_goal',
		operationName: 'onto.goal.create',
		entityKind: 'goal',
		arguments: { project_id: PROJECT_ID, name: 'Ship beta', target_date: '2026-08-31' },
		gatewayArguments: {
			project_id: PROJECT_ID,
			name: 'Ship beta',
			target_date: '2026-08-31T23:59:59.000Z'
		},
		entity: {
			id: ENTITY_ID,
			project_id: PROJECT_ID,
			name: 'Ship beta',
			project_name: 'Fixture project'
		},
		expectedEntity: { id: ENTITY_ID, project_id: PROJECT_ID, name: 'Ship beta' },
		message: 'Created ontology goal "Ship beta"'
	},
	{
		toolName: 'update_onto_goal',
		operationName: 'onto.goal.update',
		entityKind: 'goal',
		arguments: { goal_id: ENTITY_ID, name: 'Ship stable', target_date: null },
		entity: {
			id: ENTITY_ID,
			project_id: PROJECT_ID,
			name: 'Ship stable',
			project_name: 'Fixture project'
		},
		expectedEntity: { id: ENTITY_ID, project_id: PROJECT_ID, name: 'Ship stable' },
		message: 'Updated ontology goal "Ship stable"'
	},
	{
		toolName: 'create_onto_plan',
		operationName: 'onto.plan.create',
		entityKind: 'plan',
		arguments: { project_id: PROJECT_ID, name: 'Beta plan', plan: '# Steps' },
		entity: {
			id: ENTITY_ID,
			project_id: PROJECT_ID,
			name: 'Beta plan',
			project_name: 'Fixture project'
		},
		expectedEntity: { id: ENTITY_ID, project_id: PROJECT_ID, name: 'Beta plan' },
		message: 'Created ontology plan "Beta plan"'
	},
	{
		toolName: 'update_onto_plan',
		operationName: 'onto.plan.update',
		entityKind: 'plan',
		arguments: { plan_id: ENTITY_ID, name: 'Stable plan' },
		entity: {
			id: ENTITY_ID,
			project_id: PROJECT_ID,
			name: 'Stable plan',
			project_name: 'Fixture project'
		},
		expectedEntity: { id: ENTITY_ID, project_id: PROJECT_ID, name: 'Stable plan' },
		message: 'Updated ontology plan "Stable plan"'
	},
	{
		toolName: 'create_onto_milestone',
		operationName: 'onto.milestone.create',
		entityKind: 'milestone',
		arguments: {
			project_id: PROJECT_ID,
			title: 'Beta ready',
			goal_id: GOAL_ID,
			due_at: '2099-08-31'
		},
		gatewayArguments: {
			project_id: PROJECT_ID,
			title: 'Beta ready',
			goal_id: GOAL_ID,
			due_at: '2099-08-31T00:00:00.000Z'
		},
		entity: {
			id: ENTITY_ID,
			project_id: PROJECT_ID,
			title: 'Beta ready',
			type_key: 'milestone.default',
			state_key: 'pending',
			due_at: '2099-08-31T00:00:00.000Z',
			props: {},
			project_name: 'Fixture project'
		},
		expectedEntity: {
			id: ENTITY_ID,
			project_id: PROJECT_ID,
			title: 'Beta ready',
			state_key: 'pending',
			due_at: '2099-08-31T00:00:00.000Z',
			props: {},
			effective_state_key: 'pending',
			is_missed: false,
			goal_id: GOAL_ID
		},
		message: 'Created ontology milestone "Beta ready"'
	},
	{
		toolName: 'update_onto_milestone',
		operationName: 'onto.milestone.update',
		entityKind: 'milestone',
		arguments: { milestone_id: ENTITY_ID, state_key: 'completed', due_at: null },
		entity: {
			id: ENTITY_ID,
			project_id: PROJECT_ID,
			title: 'Beta ready',
			type_key: 'milestone.default',
			state_key: 'completed',
			due_at: null,
			props: {},
			project_name: 'Fixture project'
		},
		expectedEntity: {
			id: ENTITY_ID,
			project_id: PROJECT_ID,
			title: 'Beta ready',
			state_key: 'completed',
			due_at: null,
			props: {},
			effective_state_key: 'completed',
			is_missed: false
		},
		message: 'Updated ontology milestone "Beta ready"'
	},
	{
		toolName: 'create_onto_risk',
		operationName: 'onto.risk.create',
		entityKind: 'risk',
		arguments: { project_id: PROJECT_ID, title: 'Launch slip', impact: 'high' },
		entity: {
			id: ENTITY_ID,
			project_id: PROJECT_ID,
			title: 'Launch slip',
			impact: 'high',
			project_name: 'Fixture project'
		},
		expectedEntity: {
			id: ENTITY_ID,
			project_id: PROJECT_ID,
			title: 'Launch slip',
			impact: 'high'
		},
		message: 'Created ontology risk "Launch slip"'
	},
	{
		toolName: 'update_onto_risk',
		operationName: 'onto.risk.update',
		entityKind: 'risk',
		arguments: { risk_id: ENTITY_ID, state_key: 'mitigated' },
		entity: {
			id: ENTITY_ID,
			project_id: PROJECT_ID,
			title: 'Launch slip',
			state_key: 'mitigated',
			project_name: 'Fixture project'
		},
		expectedEntity: {
			id: ENTITY_ID,
			project_id: PROJECT_ID,
			title: 'Launch slip',
			state_key: 'mitigated'
		},
		message: 'Updated ontology risk "Launch slip"'
	}
];

function mutationInput(testCase: SuccessCase, overrides: Record<string, unknown> = {}) {
	return {
		effectId: EFFECT_ID,
		downstreamIdempotencyKey: `chat-effect:${EFFECT_ID}`,
		toolName: testCase.toolName,
		operationName: testCase.operationName,
		downstreamIdempotencySupported: false,
		arguments: testCase.arguments,
		providerToolCallId: `provider-${testCase.toolName}`,
		executionInput: {
			claim: { userId: USER_ID, sessionId: SESSION_ID },
			requestPayload: {
				context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID }
			},
			artifact: {
				prepared: {
					toolSurface: {
						surfaceProfile: 'test_gateway_entity',
						toolNames: [testCase.toolName],
						definitions: [
							{
								type: 'function',
								function: {
									name: testCase.toolName,
									description: 'Mutation fixture',
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

describe('AgenticChatGatewayEntityMutationAdapter', () => {
	it.each(SUCCESS_CASES)(
		'dispatches $toolName once through the project-fenced gateway',
		async (testCase) => {
			const runGateway = vi.fn(async () => ({
				ok: true,
				data: { [testCase.entityKind]: testCase.entity }
			}));
			const adapter = new AgenticChatGatewayEntityMutationAdapter({} as never, {
				runGateway: runGateway as never
			});

			await expect(adapter.execute(mutationInput(testCase))).resolves.toEqual({
				[testCase.entityKind]: testCase.expectedEntity,
				message: testCase.message
			});
			expect(runGateway).toHaveBeenCalledOnce();
			expect(runGateway).toHaveBeenCalledWith({
				admin: {},
				userId: USER_ID,
				scope: {
					mode: 'read_write',
					allowed_ops: [testCase.operationName],
					project_ids: [PROJECT_ID],
					write_project_ids: [PROJECT_ID]
				},
				op: testCase.operationName,
				args: testCase.gatewayArguments ?? testCase.arguments,
				callSessionId: SESSION_ID
			});
		}
	);

	it('rejects compound fields and merge_llm before gateway dispatch', async () => {
		const runGateway = vi.fn();
		const adapter = new AgenticChatGatewayEntityMutationAdapter({} as never, {
			runGateway: runGateway as never
		});
		const plan = SUCCESS_CASES.find((entry) => entry.toolName === 'create_onto_plan')!;
		const planInput = mutationInput(plan) as any;
		planInput.arguments = { ...plan.arguments, goal_id: GOAL_ID };
		await expect(adapter.execute(planInput)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});

		const document = SUCCESS_CASES.find((entry) => entry.toolName === 'update_onto_document')!;
		const documentInput = mutationInput(document) as any;
		documentInput.arguments = {
			document_id: ENTITY_ID,
			content: 'Merge this',
			update_strategy: 'merge_llm'
		};
		await expect(adapter.execute(documentInput)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('rejects invalid scope, date, and create prerequisites before dispatch', async () => {
		const runGateway = vi.fn();
		const adapter = new AgenticChatGatewayEntityMutationAdapter({} as never, {
			runGateway: runGateway as never
		});
		const goal = SUCCESS_CASES.find((entry) => entry.toolName === 'create_onto_goal')!;
		const mismatched = mutationInput(goal) as any;
		mismatched.arguments = { ...goal.arguments, project_id: OTHER_PROJECT_ID };
		await expect(adapter.execute(mismatched)).rejects.toMatchObject({
			failureCode: 'mutation_project_scope_mismatch'
		});

		const invalidDate = mutationInput(goal) as any;
		invalidDate.arguments = { ...goal.arguments, target_date: '2026-02-31' };
		await expect(adapter.execute(invalidDate)).rejects.toMatchObject({
			failureCode: 'mutation_arguments_not_admitted'
		});

		const milestone = SUCCESS_CASES.find(
			(entry) => entry.toolName === 'create_onto_milestone'
		)!;
		const missingGoal = mutationInput(milestone) as any;
		missingGoal.arguments = { project_id: PROJECT_ID, title: 'No parent' };
		await expect(adapter.execute(missingGoal)).rejects.toMatchObject({
			failureCode: 'mutation_scope_invalid'
		});

		const risk = SUCCESS_CASES.find((entry) => entry.toolName === 'create_onto_risk')!;
		const missingImpact = mutationInput(risk) as any;
		missingImpact.arguments = { project_id: PROJECT_ID, title: 'No impact' };
		await expect(adapter.execute(missingImpact)).rejects.toMatchObject({
			failureCode: 'mutation_arguments_not_admitted'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('classifies known gateway failures separately from uncertain outcomes', async () => {
		const goal = SUCCESS_CASES.find((entry) => entry.toolName === 'update_onto_goal')!;
		const knownAdapter = new AgenticChatGatewayEntityMutationAdapter({} as never, {
			runGateway: vi.fn(async () => ({
				ok: false,
				error: { code: 'FORBIDDEN', message: 'denied' }
			})) as never
		});
		await expect(knownAdapter.execute(mutationInput(goal))).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'update_onto_goal_forbidden'
		});

		const uncertainAdapter = new AgenticChatGatewayEntityMutationAdapter({} as never, {
			runGateway: vi.fn(async () => {
				throw new Error('response lost');
			}) as never
		});
		await expect(uncertainAdapter.execute(mutationInput(goal))).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'update_onto_goal_gateway_threw'
		});
	});

	it('treats a mismatched post-dispatch receipt as uncertain', async () => {
		const risk = SUCCESS_CASES.find((entry) => entry.toolName === 'update_onto_risk')!;
		const adapter = new AgenticChatGatewayEntityMutationAdapter({} as never, {
			runGateway: vi.fn(async () => ({
				ok: true,
				data: { risk: { ...risk.entity, id: GOAL_ID } }
			})) as never
		});

		await expect(adapter.execute(mutationInput(risk))).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'update_onto_risk_receipt_invalid'
		});
	});
});
