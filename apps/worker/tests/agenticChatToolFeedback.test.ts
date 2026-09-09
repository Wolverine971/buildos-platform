// apps/worker/tests/agenticChatToolFeedback.test.ts
import { describe, expect, it } from 'vitest';
import type { AgenticChatProviderFailedToolSynthesisInputV1 } from '../src/workers/agentic-chat/provider/contracts';
import {
	validateToolFeedback,
	type AgenticChatFeedbackToolCall
} from '../src/workers/agentic-chat/provider/feedback';

const call: AgenticChatFeedbackToolCall = {
	kind: 'read',
	id: 'visit-1',
	name: 'web_visit',
	arguments: { url: 'https://example.com/' },
	canonicalArguments: '{"url":"https://example.com/"}',
	canonicalProviderArguments: '{"url":"https://example.com/"}'
};

function failedRead(): AgenticChatProviderFailedToolSynthesisInputV1 {
	return {
		providerToolCallId: call.id,
		toolName: call.name,
		arguments: call.arguments,
		failure: {
			kind: 'known_execution_failure',
			error: 'Page visit was denied.',
			toolCategory: null,
			modelPayload: { tool_call_id: call.id, success: false, error: 'Page visit was denied.' }
		}
	};
}

describe('recoverable read feedback validation', () => {
	it('accepts a failed read without treating it as a mutation', () => {
		expect(() => validateToolFeedback(call, failedRead())).not.toThrow();
	});

	it.each([
		{ providerToolCallId: 'different-call' },
		{ toolName: 'web_search' },
		{ arguments: { url: 'https://different.example/' } }
	])('rejects mismatched failed-read identity: %j', (override) => {
		expect(() => validateToolFeedback(call, { ...failedRead(), ...override })).toThrow(
			'provider_read_feedback_mismatch'
		);
	});

	it('rejects a failed-read payload that contradicts its recorded error', () => {
		const feedback = failedRead();
		feedback.failure.modelPayload.error = 'A different error';
		expect(() => validateToolFeedback(call, feedback)).toThrow(
			'provider_tool_feedback_kind_mismatch'
		);
	});

	it('rejects empty failed-read errors', () => {
		const feedback = failedRead();
		feedback.failure.error = '';
		feedback.failure.modelPayload.error = '';
		expect(() => validateToolFeedback(call, feedback)).toThrow(
			'provider_tool_feedback_kind_mismatch'
		);
	});
});
