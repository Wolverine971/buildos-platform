// apps/worker/tests/agenticChatStreamedToolValidation.test.ts
// Exercise provider fragments against the actual worker-advertised schemas.
// A valid prefix must never hide a corrupt later call in the same batch.
import { ONTOLOGY_WRITE_TOOLS } from '@buildos/agentic-chat-runtime/catalog';
import { describe, expect, it } from 'vitest';
import type {
	AgenticChatTurnProviderRequestV1,
	AgenticChatTurnProviderToolV1
} from '../src/workers/agentic-chat/provider/contracts';
import {
	appendToolCallDelta,
	assertAllowlistedCall,
	completeToolCalls,
	createToolCallAccumulator
} from '../src/workers/agentic-chat/provider/stream-tool-calls';
import { reviewedWorkerProviderToolDefinitionV1 } from '../src/workers/agentic-chat/provider/tool-surface';
import { validateCompletedProviderCalls } from '../src/workers/agentic-chat/provider/validation';

function request(): AgenticChatTurnProviderRequestV1 {
	const tools = ['create_onto_project', 'update_onto_task'].map((name) => {
		const definition = ONTOLOGY_WRITE_TOOLS.find((tool) => tool.function.name === name);
		if (!definition) throw new Error(`Missing production tool ${name}`);
		const reviewed = reviewedWorkerProviderToolDefinitionV1(
			definition as unknown as AgenticChatTurnProviderToolV1
		);
		if (!reviewed) throw new Error(`Worker rejected ${name}`);
		return reviewed;
	});
	return {
		messages: [{ role: 'user', content: 'Create my garden project and rename the task.' }],
		tools,
		toolChoice: 'auto',
		contextType: 'global',
		projectId: null,
		entityId: null,
		userId: 'user-1',
		sessionId: 'session-1',
		turnRunId: 'turn-1',
		streamRunId: 'stream-1',
		clientTurnId: 'client-1',
		queueJobId: 'queue-1',
		processingToken: 'claim-1',
		executionGeneration: 1,
		providerRound: 'initial',
		logicalProviderRound: 1,
		signal: new AbortController().signal
	} as AgenticChatTurnProviderRequestV1;
}

function streamedCalls(
	calls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
	chunkSize = 7
) {
	const state = createToolCallAccumulator();
	const json = calls.map((call) => JSON.stringify(call.arguments));
	// The second call may start arriving before the first; indexes, not arrival
	// order, associate fragments with their call. Split even escapes and emoji.
	for (
		let offset = 0;
		offset < Math.max(...json.map((text) => text.length));
		offset += chunkSize
	) {
		for (let index = calls.length - 1; index >= 0; index--) {
			if (offset >= json[index]!.length) continue;
			appendToolCallDelta(state, [
				{
					index,
					...(offset === 0 ? { id: calls[index]!.id, type: 'function' } : {}),
					function: {
						...(offset === 0 ? { name: calls[index]!.name } : {}),
						arguments: json[index]!.slice(offset, offset + chunkSize)
					}
				}
			]);
		}
	}
	return state;
}

function proposedCalls() {
	return [
		{
			id: 'create-project',
			name: 'create_onto_project',
			arguments: {
				project: {
					name: 'Garden "β" 🌱',
					type_key: 'project.personal.gardening',
					description: 'Plan the beds.\nKeep the path C:\\garden.',
					state_key: 'planning'
				},
				entities: [],
				relationships: [],
				call_ref: 'garden',
				from_quote: 'Create my garden project'
			}
		},
		{
			id: 'rename-task',
			name: 'update_onto_task',
			arguments: {
				task_id: '33333333-3333-4333-8333-333333333333',
				title: 'Plant 🌱',
				call_ref: 'plant',
				after: ['garden']
			}
		}
	];
}

describe('streamed calls and worker tool definitions', () => {
	it('preserves interleaved arguments across chunk boundaries and validates the actual advertised shapes', () => {
		const input = request();
		for (const width of [1, 2, 7, 64]) {
			const calls = completeToolCalls(streamedCalls(proposedCalls(), width), input.tools);
			for (const call of calls) assertAllowlistedCall(call, input.tools);
			expect(
				calls.map(({ id, name, arguments: args, scheduling, sourceQuote }) => ({
					id,
					name,
					args,
					scheduling,
					sourceQuote
				}))
			).toEqual([
				{
					id: 'create-project',
					name: 'create_onto_project',
					args: {
						project: {
							name: 'Garden "β" 🌱',
							type_key: 'project.personal.gardening',
							description: 'Plan the beds.\nKeep the path C:\\garden.',
							state_key: 'planning'
						},
						entities: [],
						relationships: []
					},
					scheduling: { callRef: 'garden', after: [] },
					sourceQuote: 'Create my garden project'
				},
				{
					id: 'rename-task',
					name: 'update_onto_task',
					args: {
						task_id: '33333333-3333-4333-8333-333333333333',
						title: 'Plant 🌱'
					},
					scheduling: { callRef: 'plant', after: ['garden'] },
					sourceQuote: undefined
				}
			]);
			expect(validateCompletedProviderCalls(calls, input)).toEqual([]);
		}
	});

	it('identifies the invalid nested project field without blaming the other valid call', () => {
		const input = request();
		const proposed = proposedCalls();
		proposed[0]!.arguments.project!.state_key = 'launch'; // lifecycle facet, not project state
		const calls = completeToolCalls(streamedCalls(proposed), input.tools);
		const issues = validateCompletedProviderCalls(calls, input);
		expect(issues.map((issue) => issue.toolCall.id)).toEqual(['create-project']);
		expect(issues[0]!.errors.join(' ')).toContain('state_key');
		// The existing adapter also accepts state aliases; preflight must agree.
		proposed[0]!.arguments.project!.state_key = 'In Progress';
		expect(
			validateCompletedProviderCalls(
				completeToolCalls(streamedCalls(proposed), input.tools),
				input
			)
		).toEqual([]);
	});

	it('rejects duplicate call identities instead of returning a dispatchable valid prefix', () => {
		const input = request();
		const proposed = proposedCalls();
		proposed[1]!.id = proposed[0]!.id;
		expect(() => completeToolCalls(streamedCalls(proposed), input.tools)).toThrow(
			'provider_tool_call_id_invalid'
		);
	});
});
