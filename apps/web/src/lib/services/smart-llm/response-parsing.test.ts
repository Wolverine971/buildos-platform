// apps/web/src/lib/services/smart-llm/response-parsing.test.ts
import { describe, expect, it } from 'vitest';
import {
	coerceContentToString,
	extractVisibleText,
	createThinkingTokenState,
	flushThinkingTokens,
	normalizeStreamingContent
} from './response-parsing';

function renderChunks(chunks: unknown[]): string {
	const state = createThinkingTokenState();
	return (
		chunks.map((chunk) => normalizeStreamingContent(chunk, state).text).join('') +
		flushThinkingTokens(state)
	);
}

describe('visible content and structured reasoning', () => {
	it.each(['analysis', 'thinking', 'think', 'reasoning'])(
		'preserves literal <%s> across streaming chunks',
		(tag) => {
			const chunks = ['Use ', `<${tag}>`, ' as a literal element. ', 'The answer continues.'];
			expect(renderChunks(chunks)).toBe(chunks.join(''));
		}
	);

	it('preserves paired, split, and bracketed literal tags and punctuation after visible text', () => {
		const chunks = ['Literal: ', '<ana', 'lysis>example</analysis>', '【thinking】', '......'];
		expect(renderChunks(chunks)).toBe(chunks.join(''));
	});

	it.each(['reasoning', 'analysis', 'thinking', 'system'])(
		'hides structured %s parts while preserving visible text',
		(type) => {
			const hidden = { type, text: 'private channel content' };
			const visible = { type: 'text', text: 'Explain <analysis> literally.' };
			expect(renderChunks([[hidden, visible]])).toBe(visible.text);
			expect(renderChunks([hidden])).toBe('');
			expect(coerceContentToString([hidden, visible])).toBe(visible.text);
			expect(coerceContentToString(hidden)).toBeNull();
			// An empty or structured-only delta must not reset the prefix parser.
			expect(renderChunks(['<thi', hidden, '', 'nk>private</think>Hi'])).toBe('Hi');
			expect(renderChunks(['<think>private', hidden, '</think>Hi'])).toBe('Hi');
		}
	);
});

describe('leading inline reasoning', () => {
	it.each([
		['complete block', ['<think>private</think>Hi']],
		['split opening tag', ['<thi', 'nk>private</think>Hi']],
		['split closing tag', ['<thinking>private</thin', 'king>Hi']],
		['leading whitespace', [' \n', '<analysis>private</analysis>Hi']],
		['whitespace after close', ['<reasoning>private</reasoning> \n', '  Hi']],
		['matching closing tag', ['<think>private</analysis>still private</think>Hi']]
	] satisfies [string, string[]][])('hides a %s', (_name, chunks) => {
		expect(renderChunks(chunks)).toBe('Hi');
	});

	it.each(['think', 'thinking', 'reasoning', 'analysis'])(
		'handles every chunk boundary for <%s>',
		(tag) => {
			const input = ` \n<${tag}>private</${tag}> \nHi <analysis>literal`;
			for (let split = 0; split <= input.length; split++) {
				expect(renderChunks([input.slice(0, split), input.slice(split)])).toBe(
					'Hi <analysis>literal'
				);
			}
			expect(renderChunks([...input])).toBe('Hi <analysis>literal');
		}
	);

	it.each(['<b>Hi</b>', '<a href="/">Hi</a>', '<thinker>Hi', ' \nHello'])(
		'preserves an answer starting with %s',
		(text) => {
			expect(renderChunks([...text])).toBe(text);
		}
	);

	it('only hides the first leading block', () => {
		expect(renderChunks(['<think>private</think>', ' \n<analysis>literal</analysis>'])).toBe(
			'<analysis>literal</analysis>'
		);
	});

	it.each(['<thi', ' \n<rea', ' \n'])(
		'flushes an undecided literal prefix %j exactly once',
		(prefix) => {
			const state = createThinkingTokenState();
			expect(normalizeStreamingContent(prefix, state).text).toBe('');
			expect(flushThinkingTokens(state)).toBe(prefix);
			expect(flushThinkingTokens(state)).toBe('');
		}
	);

	it('hides an unclosed leading block and retains only a closing-tag tail', () => {
		const state = createThinkingTokenState();
		expect(normalizeStreamingContent('<think>' + 'private'.repeat(10_000), state).text).toBe(
			''
		);
		expect(state.pending.length).toBeLessThan('</think>'.length);
		expect(flushThinkingTokens(state)).toBe('');
	});
});

it.each([
	['<think>private</think> \nHi', 'Hi'],
	['<thinking>private</thinking>Hi', 'Hi'],
	['<reasoning>private</reasoning>Hi', 'Hi'],
	[' \n<analysis>private</analysis>Hi', 'Hi'],
	['Use <analysis> and continue explaining.', 'Use <analysis> and continue explaining.'],
	['<think>private', ''],
	['<thi', '<thi'],
	['<b>Hi</b>', '<b>Hi</b>']
])('applies the same leading-block rule to a full completion %j', (input, expected) => {
	expect(extractVisibleText(input)).toBe(expected);
});
