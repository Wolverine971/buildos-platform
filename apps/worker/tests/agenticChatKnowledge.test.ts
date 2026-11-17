// apps/worker/tests/agenticChatKnowledge.test.ts
//
// Personal knowledge graph writes through the worker (tasker 160): record_knowledge and
// enrich_knowledge run on the shared gateway as the claim's user, unscoped (the graph is
// the user's own, never a project); their receipts prove canonical ids; a plain save takes
// the direct lane while a turn that read web pages goes to review; and Jev keeps the search
// beside a save.
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
const SAM = '33333333-3333-4333-8333-333333333333';
const RUN = '77777777-7777-4777-8777-777777777777';

const RECORD_ARGS = {
	entities: [{ ref: 'sam', kind: 'person', name: 'Sam Lee' }],
	facts: [{ subject: 'sam', predicate: 'headline', value: 'CTO at Acme' }]
};

const RECORD_RESULT = {
	knowledge: {
		entities: [{ ref: 'sam', id: SAM, kind: 'person', name: 'Sam Lee', matched: 'created' }],
		facts: { added: 1, existing: 0, superseded: 0, suggested: 0 },
		sources: 0
	},
	message: 'Saved to the knowledge graph: 1 entry (1 new), 1 new fact.'
};

function mutationInput(toolName: string, operationName: string, args: Record<string, unknown>) {
	return {
		effectId: EFFECT_ID,
		downstreamIdempotencyKey: `chat-effect:${EFFECT_ID}`,
		toolName,
		operationName,
		downstreamIdempotencySupported: false,
		arguments: args,
		providerToolCallId: `provider-${toolName}`,
		executionInput: {
			claim: { userId: USER_ID, sessionId: SESSION_ID },
			// A project chat: the knowledge write must still not be fenced to it.
			requestPayload: {
				context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID }
			},
			artifact: {
				prepared: {
					toolSurface: {
						version: 1,
						surfaceProfile: 'test_knowledge',
						toolNames: [toolName],
						definitions: [
							{
								type: 'function',
								function: {
									name: toolName,
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

function receiptContext(toolName: string): AgenticChatMutationExecutionContextV1 {
	return { toolName, args: {}, projectId: null, expected: {} } as never;
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

describe('knowledge writes on the gateway runner', () => {
	it('records as the claim user with no project fence', async () => {
		const runGateway = vi.fn(async (_input: Record<string, unknown>) => ({
			ok: true,
			data: RECORD_RESULT
		}));
		const adapter = new AgenticChatTableMutationAdapter({} as never, { runGateway } as never);

		const receipt = await adapter.execute(
			mutationInput('record_knowledge', 'knowledge.record', RECORD_ARGS)
		);

		expect(runGateway).toHaveBeenCalledTimes(1);
		const request = runGateway.mock.calls[0]![0] as Record<string, any>;
		expect(request.userId).toBe(USER_ID);
		expect(request.op).toBe('knowledge.record');
		expect(request.scope).toEqual({ mode: 'read_write', allowed_ops: ['knowledge.record'] });
		expect(request.chatSessionId).toBe(SESSION_ID);
		expect(receipt).toEqual({
			knowledge: RECORD_RESULT.knowledge,
			message: RECORD_RESULT.message
		});
	});

	it('refuses arguments outside the reviewed set before the gateway runs', async () => {
		const runGateway = vi.fn();
		const adapter = new AgenticChatTableMutationAdapter({} as never, { runGateway } as never);
		await expect(
			adapter.execute(
				mutationInput('record_knowledge', 'knowledge.record', {
					...RECORD_ARGS,
					user_id: '99999999-9999-4999-8999-999999999999'
				})
			)
		).rejects.toMatchObject({ disposition: 'known_failed' });
		expect(runGateway).not.toHaveBeenCalled();
	});
});

describe('knowledge receipts', () => {
	it('keeps a save receipt with canonical entry ids and refuses one without', () => {
		const build = AGENTIC_CHAT_MUTATION_RECEIPT_BUILDERS_V1.knowledge_record;
		expect(build(RECORD_RESULT, receiptContext('record_knowledge'))).toMatchObject({
			knowledge: { entities: [{ id: SAM }] }
		});
		expect(() =>
			build(
				{
					knowledge: {
						...RECORD_RESULT.knowledge,
						entities: [{ ref: 'sam', name: 'Sam Lee' }]
					}
				},
				receiptContext('record_knowledge')
			)
		).toThrow();
		expect(() => build(undefined, receiptContext('record_knowledge'))).toThrow();
	});

	it('keeps the queued research run', () => {
		const build = AGENTIC_CHAT_MUTATION_RECEIPT_BUILDERS_V1.knowledge_enrich;
		const run = {
			id: RUN,
			status: 'queued',
			targets: [{ entity_id: SAM, kind: 'person', name: 'Sam Lee', fields: ['headline'] }],
			budget_usd: 0.03
		};
		expect(
			build({ knowledge_run: run, message: 'Started.' }, receiptContext('enrich_knowledge'))
		).toEqual({ knowledge_run: run, message: 'Started.' });
		expect(() =>
			build({ knowledge_run: { id: 'nope' } }, receiptContext('enrich_knowledge'))
		).toThrow();
	});
});

describe('knowledge write routing', () => {
	const global = {
		contextType: 'global',
		entityId: null,
		projectId: null,
		userMessage: 'remember Sam Lee is CTO at Acme',
		resolvedEntityIds: new Map()
	};

	it('saves what the user said directly', () => {
		expect(
			assessDirectWriteBatch([call('record_knowledge', RECORD_ARGS as JsonObject)], global)
		).toEqual({ kind: 'simple', mutationCount: 1 });
		expect(
			assessDirectWriteBatch([call('enrich_knowledge', { entity_ids: [SAM] })], global)
		).toEqual({ kind: 'simple', mutationCount: 1 });
	});

	it('reviews a save after the turn read web pages', () => {
		expect(
			assessDirectWriteBatch([call('record_knowledge', RECORD_ARGS as JsonObject)], {
				...global,
				externalContentSources: new Set(['web_visit'])
			})
		).toMatchObject({ kind: 'contract_required', reason: 'external_content_requires_review' });
	});
});

describe('Jev supporting tools', () => {
	it('keeps search_knowledge beside a save or research request', () => {
		const tool = (name: string): AgenticChatTurnProviderToolV1 => ({
			type: 'function',
			function: { name, description: name, parameters: { type: 'object', properties: {} } }
		});
		const tools = [
			'search_knowledge',
			'record_knowledge',
			'enrich_knowledge',
			'web_search'
		].map(tool);
		const selected = selectJevToolDefinitions(tools, { record_knowledge: 0.9 }).map(
			(entry) => entry.function.name
		);
		expect(selected).toEqual(expect.arrayContaining(['record_knowledge', 'search_knowledge']));
		expect(selected).not.toContain('web_search');
	});
});
