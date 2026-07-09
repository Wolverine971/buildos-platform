// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/synthesis-context.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall } from '@buildos/shared-types';
import {
	buildForcedSynthesisMessages,
	collectForcedSynthesisDirectives
} from './synthesis-context';

describe('buildForcedSynthesisMessages', () => {
	it('builds a clean bounded transcript without the original tool prompt', () => {
		const call: ChatToolCall = {
			id: 'read-1',
			type: 'function',
			function: { name: 'read_document_section', arguments: '{"anchor":"scope"}' }
		};
		const messages = buildForcedSynthesisMessages({
			latestUserText: 'Summarize what you found.',
			toolExecutions: [
				{
					toolCall: call,
					result: { tool_call_id: call.id, success: true, result: { content: 'Scope' } }
				}
			],
			retryCount: 1,
			runtimeBudgetMessage: 'Tools are unavailable.'
		});

		expect(messages[0]?.content).toContain('final-answer recovery lane');
		expect(messages[0]?.content).toContain('ordinary user-facing prose only');
		expect(messages.map((message) => message.content).join('\n')).toContain(
			'read_document_section'
		);
		expect(messages.at(-1)).toEqual({ role: 'user', content: 'Summarize what you found.' });
	});
});

describe('collectForcedSynthesisDirectives', () => {
	it('keeps recovery directives but excludes the original skill gate prompt', () => {
		const directives = collectForcedSynthesisDirectives([
			{ role: 'system', content: 'Skill-load gate: ACTIVE. Call skill_load.' },
			{ role: 'system', content: 'Read-loop hard stop: synthesize now.' }
		]);

		expect(directives).toEqual(['Read-loop hard stop: synthesize now.']);
	});
});
