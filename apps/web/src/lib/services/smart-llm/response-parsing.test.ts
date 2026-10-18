// apps/web/src/lib/services/smart-llm/response-parsing.test.ts
import { describe, expect, it } from 'vitest';
import {
	coerceContentToString,
	extractVisibleText,
	filterThinkingTokens,
	normalizeStreamingContent
} from './response-parsing';

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

it('preserves literal tags in non-streamed answers', () => {
	expect(extractVisibleText('Use <analysis> and continue explaining.')).toBe(
		'Use <analysis> and continue explaining.'
	);
});
