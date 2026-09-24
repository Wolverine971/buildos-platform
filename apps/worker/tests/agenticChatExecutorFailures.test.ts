// apps/worker/tests/agenticChatExecutorFailures.test.ts
//
// Tasker 102 (case 13 of the 2026-09-24 gate): a statement timeout after the
// turn started was classified `unknown` → `permanent`, and the user read
// "An error occurred while streaming." with nothing saved.
import type { FastToolExecution } from '@buildos/agentic-chat-runtime/loop';
import { describe, expect, it } from 'vitest';
import { AgenticChatExecutionControlRpcError } from '../src/workers/agentic-chat/turn/execution-control';
import {
	AGENTIC_CHAT_GENERIC_FAILURE_COPY,
	AGENTIC_CHAT_INFRA_FAILURE_NOTHING_CHANGED_COPY,
	classifyFailure,
	failurePublicError,
	hasTransientDatabaseCode
} from '../src/workers/agentic-chat/turn/executor-failures';

const live = new AbortController().signal;

function execution(name: string, success = true): FastToolExecution {
	return {
		toolCall: { id: `call-${name}`, type: 'function', function: { name, arguments: '{}' } },
		result: { tool_call_id: `call-${name}`, success, result: {} }
	} as unknown as FastToolExecution;
}

describe('classifyFailure for database answers', () => {
	it('names a post-start statement timeout infrastructure, raw or wrapped', () => {
		const raw = Object.assign(new Error('canceling statement due to statement timeout'), {
			code: '57014'
		});
		const wrapped = new AgenticChatExecutionControlRpcError(
			'claim_agentic_chat_turn',
			'57014',
			'canceling statement due to statement timeout'
		);
		expect(classifyFailure(raw, true, live)).toBe('transient_infra');
		expect(classifyFailure(wrapped, true, live)).toBe('transient_infra');
		expect(classifyFailure({ code: '40P01', message: 'deadlock' }, true, live)).toBe(
			'transient_infra'
		);
	});

	it('keeps deterministic database errors and code-less errors unknown after start', () => {
		expect(classifyFailure({ code: '23505', message: 'duplicate key' }, true, live)).toBe(
			'unknown'
		);
		expect(classifyFailure({ code: 'P0001', message: 'guard' }, true, live)).toBe('unknown');
		expect(classifyFailure(new Error('bug'), true, live)).toBe('unknown');
		expect(classifyFailure({ code: '', message: 'no code' }, true, live)).toBe('unknown');
	});

	it('lets an aborted turn keep its timeout class over the database code', () => {
		const controller = new AbortController();
		controller.abort(new Error('hard cap'));
		expect(classifyFailure({ code: '57014' }, true, controller.signal)).toBe(
			'timeout_post_start'
		);
	});

	it('treats a control RPC that never reached the database as transient', () => {
		expect(
			hasTransientDatabaseCode(
				new AgenticChatExecutionControlRpcError(
					'claim_agentic_chat_turn',
					'',
					'fetch failed'
				)
			)
		).toBe(true);
		expect(
			hasTransientDatabaseCode(
				new AgenticChatExecutionControlRpcError('claim_agentic_chat_turn', 'P0001', 'guard')
			)
		).toBe(false);
	});
});

describe('failurePublicError', () => {
	it('says nothing changed for an infrastructure failure with no write attempt', () => {
		expect(failurePublicError('transient_infra', [])).toBe(
			AGENTIC_CHAT_INFRA_FAILURE_NOTHING_CHANGED_COPY
		);
		expect(failurePublicError('transient_infra', [execution('get_onto_project_details')])).toBe(
			AGENTIC_CHAT_INFRA_FAILURE_NOTHING_CHANGED_COPY
		);
	});

	it('never claims nothing changed once the ledger holds a write attempt', () => {
		expect(failurePublicError('transient_infra', [execution('create_onto_task')])).toBe(
			AGENTIC_CHAT_GENERIC_FAILURE_COPY
		);
		expect(failurePublicError('transient_infra', [execution('update_onto_task', false)])).toBe(
			AGENTIC_CHAT_GENERIC_FAILURE_COPY
		);
	});

	it('keeps the generic copy for other classes and publishes none for cancellation', () => {
		expect(failurePublicError('unknown', [])).toBe(AGENTIC_CHAT_GENERIC_FAILURE_COPY);
		expect(failurePublicError('timeout_post_start', [])).toBe(
			AGENTIC_CHAT_GENERIC_FAILURE_COPY
		);
		expect(failurePublicError('cancelled', [])).toBeUndefined();
	});
});
