import { EntityMentionPingServiceError } from '@buildos/shared-agent-ops/ops/entity-mention-ping.service';
import { describe, expect, it, vi } from 'vitest';
import { reviewedAgenticChatGatewayMutationSpecV1 } from '../src/workers/agentic-chat/mutationToolCatalog';
import { AgenticChatTagOntoEntityPingMutationAdapter } from '../src/workers/agentic-chat/tagOntoEntityPingMutationAdapter';

const PROJECT_ID = '10000000-0000-4000-8000-000000000001';
const ENTITY_ID = '20000000-0000-4000-8000-000000000002';
const RECIPIENT_ID = '30000000-0000-4000-8000-000000000003';
const EFFECT_ID = '40000000-0000-4000-8000-000000000004';
const USER_ID = '50000000-0000-4000-8000-000000000005';
const SESSION_ID = '60000000-0000-4000-8000-000000000006';
const OTHER_PROJECT_ID = '70000000-0000-4000-8000-000000000007';

function mutationInput(overrides: Record<string, unknown> = {}) {
	return {
		effectId: EFFECT_ID,
		downstreamIdempotencyKey: `chat-effect:${EFFECT_ID}`,
		toolName: 'tag_onto_entity',
		operationName: 'x.misc.tag_onto_entity',
		downstreamIdempotencySupported: false,
		arguments: {
			project_id: PROJECT_ID,
			entity_type: 'task',
			entity_id: ENTITY_ID,
			mode: 'ping',
			mentioned_user_ids: [RECIPIENT_ID],
			message: 'Please review.'
		},
		providerToolCallId: 'provider-tag-entity',
		executionInput: {
			claim: { userId: USER_ID, sessionId: SESSION_ID },
			requestPayload: {
				context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID }
			},
			artifact: {
				prepared: {
					toolSurface: {
						surfaceProfile: 'test_tag_entity',
						toolNames: ['tag_onto_entity'],
						definitions: [
							{
								type: 'function',
								function: {
									name: 'tag_onto_entity',
									description: 'Tag collaborator',
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

function pingResult() {
	return {
		project_id: PROJECT_ID,
		entity_type: 'task' as const,
		entity_id: ENTITY_ID,
		mentioned_user_ids: [RECIPIENT_ID],
		notified_user_ids: [RECIPIENT_ID]
	};
}

describe('AgenticChatTagOntoEntityPingMutationAdapter', () => {
	it('keeps the worker-only tag operation outside the external gateway allowlist', () => {
		expect(reviewedAgenticChatGatewayMutationSpecV1('tag_onto_entity')).toBeNull();
	});

	it('dispatches one worker-authorized ping and restores the legacy receipt', async () => {
		const pingEntity = vi.fn(async () => pingResult());
		const adapter = new AgenticChatTagOntoEntityPingMutationAdapter({} as never, {
			pingEntity
		});

		await expect(adapter.execute(mutationInput())).resolves.toEqual({
			project_id: PROJECT_ID,
			entity_type: 'task',
			entity_id: ENTITY_ID,
			mentioned_user_ids: [RECIPIENT_ID],
			notified_user_ids: [RECIPIENT_ID],
			message: 'Tagged 1 collaborator on the task.'
		});
		expect(pingEntity).toHaveBeenCalledOnce();
		expect(pingEntity).toHaveBeenCalledWith({
			client: {},
			projectId: PROJECT_ID,
			entityType: 'task',
			entityId: ENTITY_ID,
			mentionedUserIds: [RECIPIENT_ID],
			messageSuffix: 'Please review.',
			source: 'agent_ping',
			caller: { kind: 'worker', userId: USER_ID, actorDisplayName: 'BuildOS agent' }
		});
	});

	it('rejects content mode, handles, duplicates, and project-scope mismatch before dispatch', async () => {
		const pingEntity = vi.fn();
		const adapter = new AgenticChatTagOntoEntityPingMutationAdapter({} as never, {
			pingEntity: pingEntity as never
		});

		const content = mutationInput() as any;
		content.arguments.mode = 'content';
		await expect(adapter.execute(content)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});

		const handles = mutationInput() as any;
		handles.arguments.mentioned_handles = ['@dj'];
		await expect(adapter.execute(handles)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});

		const duplicates = mutationInput() as any;
		duplicates.arguments.mentioned_user_ids = [RECIPIENT_ID, RECIPIENT_ID];
		await expect(adapter.execute(duplicates)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});

		const mismatched = mutationInput() as any;
		mismatched.executionInput.requestPayload.context = {
			type: 'project',
			entityId: OTHER_PROJECT_ID,
			projectId: OTHER_PROJECT_ID
		};
		await expect(adapter.execute(mismatched)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_project_scope_mismatch'
		});

		expect(pingEntity).not.toHaveBeenCalled();
	});

	it('separates pre-dispatch service failures from uncertain delivery outcomes', async () => {
		const knownAdapter = new AgenticChatTagOntoEntityPingMutationAdapter({} as never, {
			pingEntity: vi.fn(async () => {
				throw new EntityMentionPingServiceError(
					'ineligible_recipients',
					'known_failed',
					'Recipient is not an active member'
				);
			})
		});
		await expect(knownAdapter.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'tag_onto_entity_ineligible_recipients'
		});

		const uncertainAdapter = new AgenticChatTagOntoEntityPingMutationAdapter({} as never, {
			pingEntity: vi.fn(async () => {
				throw new EntityMentionPingServiceError(
					'delivery_incomplete',
					'outcome_uncertain',
					'Delivery incomplete'
				);
			})
		});
		await expect(uncertainAdapter.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'tag_onto_entity_delivery_incomplete'
		});

		const malformedAdapter = new AgenticChatTagOntoEntityPingMutationAdapter({} as never, {
			pingEntity: vi.fn(async () => ({
				...pingResult(),
				notified_user_ids: []
			}))
		});
		await expect(malformedAdapter.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'tag_onto_entity_receipt_invalid'
		});
	});
});
