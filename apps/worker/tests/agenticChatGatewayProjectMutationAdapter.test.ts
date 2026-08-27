import { describe, expect, it, vi } from 'vitest';
import { AgenticChatGatewayProjectMutationAdapter } from '../src/workers/agentic-chat/gatewayProjectMutationAdapter';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const EFFECT_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const SESSION_ID = '55555555-5555-4555-8555-555555555555';

function mutationInput(overrides: Record<string, unknown> = {}) {
	return {
		effectId: EFFECT_ID,
		downstreamIdempotencyKey: `chat-effect:${EFFECT_ID}`,
		toolName: 'update_onto_project',
		operationName: 'onto.project.update',
		downstreamIdempotencySupported: false,
		arguments: {
			project_id: PROJECT_ID,
			name: 'Renamed project',
			description: '  Updated context  ',
			state_key: 'In Progress',
			start_at: '2026-08-11',
			end_at: null,
			props: {
				color: 'blue',
				preferences: { secret: true },
				agent_workspace: { mode: 'living_reference' }
			}
		},
		providerToolCallId: 'provider-update-project',
		executionInput: {
			claim: { userId: USER_ID, sessionId: SESSION_ID },
			requestPayload: {
				context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID }
			},
			artifact: {
				prepared: {
					toolSurface: {
						surfaceProfile: 'test_gateway_project',
						toolNames: ['update_onto_project'],
						definitions: [
							{
								type: 'function',
								function: {
									name: 'update_onto_project',
									description: 'Update project',
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

describe('AgenticChatGatewayProjectMutationAdapter', () => {
	it('dispatches the sanitized row update once and restores the legacy receipt', async () => {
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: {
				project: {
					id: PROJECT_ID,
					name: 'Renamed project',
					description: 'Updated context',
					state_key: 'active',
					start_at: '2026-08-11T00:00:00.000Z',
					end_at: null,
					props: {
						color: 'blue',
						preferences: { hidden: true },
						agent_workspace: { domain_profile: 'fiction_story' }
					}
				}
			}
		}));
		const adapter = new AgenticChatGatewayProjectMutationAdapter({} as never, {
			runGateway: runGateway as never
		});

		await expect(adapter.execute(mutationInput())).resolves.toEqual({
			project: {
				id: PROJECT_ID,
				name: 'Renamed project',
				description: 'Updated context',
				state_key: 'active',
				start_at: '2026-08-11T00:00:00.000Z',
				end_at: null,
				props: {
					color: 'blue',
					agent_workspace: { domain_profile: 'fiction_story' }
				}
			},
			message: 'Updated ontology project "Renamed project"'
		});
		expect(runGateway).toHaveBeenCalledOnce();
		expect(runGateway).toHaveBeenCalledWith({
			admin: {},
			userId: USER_ID,
			scope: {
				mode: 'read_write',
				allowed_ops: ['onto.project.update'],
				project_ids: [PROJECT_ID],
				write_project_ids: [PROJECT_ID]
			},
			op: 'onto.project.update',
			args: {
				project_id: PROJECT_ID,
				name: 'Renamed project',
				description: '  Updated context  ',
				state_key: 'active',
				start_at: '2026-08-11T00:00:00.000Z',
				end_at: null,
				props: { color: 'blue' }
			},
			chatSessionId: SESSION_ID
		});
	});

	it('rejects project-scope mismatch, aliases, and empty effective updates before dispatch', async () => {
		const runGateway = vi.fn();
		const adapter = new AgenticChatGatewayProjectMutationAdapter({} as never, {
			runGateway: runGateway as never
		});
		const mismatched = mutationInput() as any;
		mismatched.arguments = { project_id: OTHER_PROJECT_ID, name: 'Outside scope' };
		await expect(adapter.execute(mismatched)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_project_scope_mismatch'
		});

		const alias = mutationInput() as any;
		alias.arguments = { project_id: PROJECT_ID, state: 'active' };
		await expect(adapter.execute(alias)).rejects.toMatchObject({
			failureCode: 'mutation_arguments_not_admitted'
		});

		const empty = mutationInput() as any;
		empty.arguments = {
			project_id: PROJECT_ID,
			props: {
				agent_workspace: { mode: 'living_reference' },
				preferences: { hidden: true }
			}
		};
		await expect(adapter.execute(empty)).rejects.toMatchObject({
			failureCode: 'mutation_arguments_not_admitted'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('rejects invalid dates before dispatch', async () => {
		const runGateway = vi.fn();
		const adapter = new AgenticChatGatewayProjectMutationAdapter({} as never, {
			runGateway: runGateway as never
		});
		const input = mutationInput() as any;
		input.arguments = { project_id: PROJECT_ID, end_at: '2026-02-31' };

		await expect(adapter.execute(input)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('separates known gateway failures from uncertain post-dispatch outcomes', async () => {
		const knownAdapter = new AgenticChatGatewayProjectMutationAdapter({} as never, {
			runGateway: vi.fn(async () => ({
				ok: false,
				error: { code: 'FORBIDDEN', message: 'denied' }
			})) as never
		});
		await expect(knownAdapter.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'update_onto_project_forbidden'
		});

		const thrownAdapter = new AgenticChatGatewayProjectMutationAdapter({} as never, {
			runGateway: vi.fn(async () => {
				throw new Error('response lost');
			}) as never
		});
		await expect(thrownAdapter.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'update_onto_project_gateway_threw'
		});

		const receiptAdapter = new AgenticChatGatewayProjectMutationAdapter({} as never, {
			runGateway: vi.fn(async () => ({
				ok: true,
				data: { project: { id: OTHER_PROJECT_ID, name: 'Wrong project' } }
			})) as never
		});
		await expect(receiptAdapter.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'update_onto_project_receipt_invalid'
		});
	});
});
