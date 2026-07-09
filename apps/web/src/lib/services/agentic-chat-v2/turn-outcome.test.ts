// apps/web/src/lib/services/agentic-chat-v2/turn-outcome.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import { resolveFastChatTurnIntent, type FastChatTurnIntent } from './turn-intent';
import { resolveFastChatTurnOutcome } from './turn-outcome';

function execution(name: string, success = true) {
	const toolCall: ChatToolCall = {
		id: name,
		type: 'function',
		function: { name, arguments: '{}' }
	};
	const result: ChatToolResult = {
		tool_call_id: name,
		success,
		result: { ok: success }
	};
	return { toolCall, result };
}

describe('resolveFastChatTurnOutcome', () => {
	it('requires every expected write for a compound mutation', () => {
		const intent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: 'Mark the task done and create a document for the handoff.'
		});

		expect(
			resolveFastChatTurnOutcome({
				intent,
				toolExecutions: [execution('create_onto_document')],
				finishedReason: 'stop'
			})
		).toMatchObject({
			status: 'unfulfilled',
			fulfilled: false,
			expectedWriteToolNames: ['update_onto_task', 'create_onto_document']
		});

		expect(
			resolveFastChatTurnOutcome({
				intent,
				toolExecutions: [execution('create_onto_document'), execution('update_onto_task')]
			})
		).toMatchObject({ status: 'fulfilled', fulfilled: true });
	});

	it('accepts a verified write for an unknown focused mutation', () => {
		const intent: FastChatTurnIntent = {
			version: 1,
			requiresWrite: true,
			action: 'update',
			entityKind: 'unknown',
			operations: [{ action: 'update', entityKind: 'unknown' }],
			source: 'current_message',
			originalRequestText: 'Rename this.',
			originatingTurnRunId: null,
			clearPending: false
		};

		expect(
			resolveFastChatTurnOutcome({
				intent,
				toolExecutions: [execution('update_onto_task')]
			})
		).toMatchObject({ status: 'fulfilled', fulfilled: true });
	});

	it('does not accept a failed expected write', () => {
		const intent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: 'Create a document.'
		});

		expect(
			resolveFastChatTurnOutcome({
				intent,
				toolExecutions: [execution('create_onto_document', false)]
			})
		).toMatchObject({ status: 'unfulfilled', fulfilled: false });
	});
});
