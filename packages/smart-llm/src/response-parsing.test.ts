// packages/smart-llm/src/response-parsing.test.ts
import { describe, expect, it } from 'vitest';
import {
	coerceContentToString,
	filterThinkingTokens,
	normalizeStreamingContent,
	repairTruncatedJSONResponse
} from './response-parsing';

describe('repairTruncatedJSONResponse', () => {
	it('repairs truncated JSON with unterminated string at the end', () => {
		const broken = '{"items":[{"title":"Complete"},{"title":"Part';
		const repaired = repairTruncatedJSONResponse(broken);

		expect(repaired).not.toBeNull();
		expect(JSON.parse(repaired ?? '{}')).toEqual({
			items: [{ title: 'Complete' }]
		});
	});

	it('closes missing braces when JSON ends early', () => {
		const broken =
			'{"agent_state_updates":{"current_understanding":{"entities":["task-a","task-b"]';
		const repaired = repairTruncatedJSONResponse(broken);

		expect(repaired).not.toBeNull();
		expect(JSON.parse(repaired ?? '{}')).toEqual({
			agent_state_updates: {
				current_understanding: {
					entities: ['task-a', 'task-b']
				}
			}
		});
	});

	it('returns null for non-JSON input', () => {
		expect(repairTruncatedJSONResponse('not-json-response')).toBeNull();
	});
});

describe('visible content and structured reasoning', () => {
	it.each(['analysis', 'thinking', 'think', 'reasoning'])(
		'preserves literal <%s> across streaming chunks',
		(tag) => {
			const chunks = [`Use <${tag}>`, ' as a literal element. ', 'The answer continues.'];
			let inThinkingBlock = false;
			const visible = chunks
				.map((chunk) => {
					const result = normalizeStreamingContent(chunk, inThinkingBlock);
					inThinkingBlock = result.inThinkingBlock;
					return result.text;
				})
				.join('');
			expect(visible).toBe(chunks.join(''));
			expect(inThinkingBlock).toBe(false);
		}
	);

	it('preserves paired, split, and bracketed literal tags and punctuation', () => {
		const chunks = ['<ana', 'lysis>example</analysis>', '【thinking】', '......'];
		expect(chunks.map((chunk) => normalizeStreamingContent(chunk, false).text).join('')).toBe(
			chunks.join('')
		);
		expect(filterThinkingTokens('The answer continues.', true)).toEqual({
			text: 'The answer continues.',
			inThinkingBlock: false
		});
	});

	it.each(['reasoning', 'analysis', 'thinking', 'system'])(
		'hides structured %s parts while preserving visible text',
		(type) => {
			const hidden = { type, text: 'private channel content' };
			const visible = { type: 'text', text: 'Explain <analysis> literally.' };
			expect(normalizeStreamingContent([hidden, visible], false)).toEqual({
				text: visible.text,
				inThinkingBlock: false
			});
			expect(normalizeStreamingContent(hidden, false).text).toBe('');
			expect(coerceContentToString([hidden, visible])).toBe(visible.text);
			expect(coerceContentToString(hidden)).toBeNull();
		}
	);
});
