// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/synthesis-context.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall } from '@buildos/shared-types';
import {
	buildForcedSynthesisMessages,
	collectForcedSynthesisDirectives,
	countVisiblyLabeledOptions,
	findMissingExplicitOptionResponseAnchors,
	resolveExplicitOptionResponseAnchors,
	resolveExplicitOptionCountRequest
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

	it('carries an exact option-count contract into the bounded recovery prompt', () => {
		const messages = buildForcedSynthesisMessages({
			latestUserText: 'Give me three distinct options and do not choose one yet.',
			toolExecutions: [],
			retryCount: 0,
			runtimeBudgetMessage: 'Tools are unavailable.'
		});

		expect(messages[0]?.content).toContain('exactly 3 visibly labeled options');
		expect(resolveExplicitOptionCountRequest('Give me at least three options.')).toBeNull();
		expect(
			countVisiblyLabeledOptions('Option 1 — A\nOption 2 — B\nOption 3 — C\nOption 1 wins')
		).toBe(3);
	});

	it('preserves explicit subject and story-position anchors in an option recovery prompt', () => {
		const request =
			"I'm at the end of chapter 4. What should happen with Ilyan in chapter 5? Give me three distinct options.";
		const messages = buildForcedSynthesisMessages({
			latestUserText: request,
			toolExecutions: [],
			retryCount: 0,
			runtimeBudgetMessage: 'Tools are unavailable.'
		});

		expect(resolveExplicitOptionResponseAnchors(request)).toEqual([
			'Ilyan',
			'chapter 4',
			'chapter 5'
		]);
		expect(messages[0]?.content).toContain('Explicit request anchors');
		expect(messages[0]?.content).toContain('"Ilyan"');
		expect(messages[0]?.content).toContain('"chapter 5"');
		expect(
			findMissingExplicitOptionResponseAnchors(
				request,
				'Ilyan has three paths after Chapter 4.'
			)
		).toEqual(['chapter 5']);
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
