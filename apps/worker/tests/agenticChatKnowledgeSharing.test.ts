// apps/worker/tests/agenticChatKnowledgeSharing.test.ts
//
// Knowledge in shared projects through the worker (tasker 168): request_knowledge_access runs on
// the shared gateway as the claim's user, fenced to the project in its arguments; its receipt
// keeps every database answer (sent, already waiting, said no...); a plain ask takes the direct
// lane while one that follows a lens read (another member's text) goes to review; and Jev keeps
// the lens beside an ask.
/* eslint-disable require-await -- fakes satisfy async ports without I/O */
import { describe, expect, it, vi } from 'vitest';
import type { JsonObject } from '@buildos/shared-types';
import { AGENTIC_CHAT_MUTATION_RECEIPT_BUILDERS_V1 } from '../src/workers/agentic-chat/mutations/argument-normalizers';
import type { AgenticChatMutationExecutionContextV1 } from '../src/workers/agentic-chat/mutations/execution-context';
import { AgenticChatTableMutationAdapter } from '../src/workers/agentic-chat/mutations/table-adapter';
import type { CompletedProviderToolCall } from '../src/workers/agentic-chat/provider/stream-tool-calls';
import type { AgenticChatTurnProviderToolV1 } from '../src/workers/agentic-chat/provider/contracts';
import { selectJevToolDefinitions } from '../src/workers/agentic-chat/provider/jev-tool-selector';
import { assessDirectWriteBatch } from '../src/workers/agentic-chat/provider/write-routing';

const USER_ID = '55555555-5555-4555-8555-555555555555';
const SESSION_ID = '66666666-6666-4666-8666-666666666666';
const EFFECT_ID = '44444444-4444-4444-8444-444444444444';
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const KYLE = '33333333-3333-4333-8333-333333333333';

const ASK_ARGS = { entity_id: KYLE, project_id: PROJECT_ID, what: 'contact' };
const ASK_RESULT = {
	knowledge_ask: {
		status: 'sent',
		entity_id: KYLE,
		project_id: PROJECT_ID,
		what: 'contact',
		id: '77777777-7777-4777-8777-777777777777',
		new_request: true
	},
	message: 'Asked. Nothing is shared until they choose.'
};

function mutationInput(args: Record<string, unknown>, contextProjectId: string | null) {
	return {
		effectId: EFFECT_ID,
		downstreamIdempotencyKey: `chat-effect:${EFFECT_ID}`,
		toolName: 'request_knowledge_access',
		operationName: 'knowledge.request_access',
		downstreamIdempotencySupported: false,
		arguments: args,
		providerToolCallId: 'provider-ask',
		executionInput: {
			claim: { userId: USER_ID, sessionId: SESSION_ID },
			requestPayload: {
				context: contextProjectId
					? { type: 'project', entityId: contextProjectId, projectId: contextProjectId }
					: { type: 'global' }
			},
			artifact: {
				prepared: {
					toolSurface: {
						version: 1,
						surfaceProfile: 'test_knowledge_sharing',
						toolNames: ['request_knowledge_access'],
						definitions: [
							{
								type: 'function',
								function: {
									name: 'request_knowledge_access',
									description: 'Mutation fixture',
									parameters: { type: 'object', properties: {} }
								}
							}
						]
					}
				}
			}
		},
		signal: new AbortController().signal
	} as never;
}

let callIndex = 0;
function call(name: string, args: JsonObject): CompletedProviderToolCall {
	callIndex += 1;
	const json = JSON.stringify(args);
	return {
		id: `call-${callIndex}`,
		name,
		arguments: args,
		canonicalArguments: json,
		canonicalProviderArguments: json
	};
}

describe('request_knowledge_access on the gateway runner', () => {
	it('asks as the claim user, fenced to the project it names', async () => {
		const runGateway = vi.fn(async (_input: Record<string, unknown>) => ({
			ok: true,
			data: ASK_RESULT
		}));
		const adapter = new AgenticChatTableMutationAdapter({} as never, { runGateway } as never);

		const receipt = await adapter.execute(mutationInput(ASK_ARGS, PROJECT_ID));

		expect(runGateway).toHaveBeenCalledTimes(1);
		const request = runGateway.mock.calls[0]![0] as Record<string, any>;
		expect(request.userId).toBe(USER_ID);
		expect(request.op).toBe('knowledge.request_access');
		expect(request.scope).toEqual({
			mode: 'read_write',
			allowed_ops: ['knowledge.request_access'],
			project_ids: [PROJECT_ID],
			write_project_ids: [PROJECT_ID]
		});
		expect(receipt).toEqual(ASK_RESULT);
	});

	it('refuses an ask about another project from a project chat, and a viewer argument', async () => {
		const runGateway = vi.fn();
		const adapter = new AgenticChatTableMutationAdapter({} as never, { runGateway } as never);
		await expect(
			adapter.execute(
				mutationInput({ ...ASK_ARGS, project_id: OTHER_PROJECT_ID }, PROJECT_ID)
			)
		).rejects.toMatchObject({ disposition: 'known_failed' });
		await expect(
			adapter.execute(mutationInput({ ...ASK_ARGS, p_viewer: USER_ID }, PROJECT_ID))
		).rejects.toMatchObject({ disposition: 'known_failed' });
		expect(runGateway).not.toHaveBeenCalled();
	});
});

describe('ask receipts', () => {
	const context = (args: Record<string, unknown>) =>
		({
			toolName: 'request_knowledge_access',
			args,
			projectId: PROJECT_ID,
			expected: {}
		}) as unknown as AgenticChatMutationExecutionContextV1;

	it('keeps every database answer and refuses one about another entry', () => {
		const build = AGENTIC_CHAT_MUTATION_RECEIPT_BUILDERS_V1.knowledge_access_request;
		expect(build(ASK_RESULT, context(ASK_ARGS))).toEqual(ASK_RESULT);
		const saidNo = {
			knowledge_ask: {
				...ASK_RESULT.knowledge_ask,
				status: 'owner_said_no',
				new_request: false
			},
			message: 'They said no.'
		};
		expect(build(saidNo, context(ASK_ARGS))).toEqual(saidNo);
		expect(() =>
			build(ASK_RESULT, context({ ...ASK_ARGS, entity_id: OTHER_PROJECT_ID }))
		).toThrow();
		expect(() => build(undefined, context(ASK_ARGS))).toThrow();
	});
});

describe('ask routing', () => {
	const project = {
		contextType: 'project',
		entityId: PROJECT_ID,
		projectId: PROJECT_ID,
		userMessage: 'ask DJ for Kyle Reed’s email',
		resolvedEntityIds: new Map()
	};

	it('sends a plain ask directly, and reviews one that follows a lens read', () => {
		expect(
			assessDirectWriteBatch(
				[call('request_knowledge_access', ASK_ARGS as JsonObject)],
				project as never
			)
		).toEqual({ kind: 'simple', mutationCount: 1 });
		expect(
			assessDirectWriteBatch([call('request_knowledge_access', ASK_ARGS as JsonObject)], {
				...project,
				externalContentSources: new Set(['get_project_knowledge_lens'])
			} as never)
		).toMatchObject({ kind: 'contract_required', reason: 'external_content_requires_review' });
	});
});

describe('Jev supporting tools', () => {
	it('keeps the lens beside an ask', () => {
		const tool = (name: string): AgenticChatTurnProviderToolV1 => ({
			type: 'function',
			function: { name, description: name, parameters: { type: 'object', properties: {} } }
		});
		const tools = ['get_project_knowledge_lens', 'request_knowledge_access', 'web_search'].map(
			tool
		);
		const selected = selectJevToolDefinitions(tools, { request_knowledge_access: 0.9 }).map(
			(entry) => entry.function.name
		);
		expect(selected).toEqual(
			expect.arrayContaining(['request_knowledge_access', 'get_project_knowledge_lens'])
		);
		expect(selected).not.toContain('web_search');
	});
});
