// packages/smart-llm/src/response-parsing.test.ts
import { describe, expect, it } from 'vitest';
import {
	coerceContentToString,
	createThinkingTokenState,
	flushThinkingTokens,
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
	it('reports discarded characters and UTF-8 bytes without double-counting split tags', () => {
		const hidden = '<think>' + 'é'.repeat(100) + '</think>';
		for (let split = 0; split <= hidden.length; split++) {
			const state = createThinkingTokenState();
			const results = [hidden.slice(0, split), hidden.slice(split), 'Answer.'].map((chunk) =>
				normalizeStreamingContent(chunk, state)
			);
			expect(results.map((result) => result.text).join('')).toBe('Answer.');
			expect(results.reduce((sum, result) => sum + result.droppedChars, 0)).toBe(
				hidden.length
			);
			expect(results.reduce((sum, result) => sum + result.droppedBytes, 0)).toBe(
				new TextEncoder().encode(hidden).length
			);
		}
	});

	it('reports progress during a long unclosed block without retaining its body', () => {
		const state = createThinkingTokenState();
		const first = normalizeStreamingContent('<think>' + 'private'.repeat(1000), state);
		expect(first).toMatchObject({ text: '', droppedChars: 7000, droppedBytes: 7000 });
		const next = normalizeStreamingContent('more private'.repeat(1000), state);
		expect(next).toMatchObject({ text: '', droppedChars: 12000, droppedBytes: 12000 });
		expect(state.pending.length).toBeLessThan('</think>'.length);
	});

	it('does not count literal or undecided prefixes as discarded reasoning', () => {
		const state = createThinkingTokenState();
		for (const chunk of ['<thi', 'nker>literal ', '<think>visible</think>']) {
			expect(normalizeStreamingContent(chunk, state)).toMatchObject({
				droppedChars: 0,
				droppedBytes: 0
			});
		}
	});

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
