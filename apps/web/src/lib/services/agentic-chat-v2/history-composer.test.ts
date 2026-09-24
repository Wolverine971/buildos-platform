// apps/web/src/lib/services/agentic-chat-v2/history-composer.test.ts
import { describe, expect, it } from 'vitest';
import { composeFastChatHistory } from './history-composer';
import type { FastChatHistoryMessage } from './types';

function makeHistory(count: number): FastChatHistoryMessage[] {
	const messages: FastChatHistoryMessage[] = [];
	for (let i = 0; i < count; i += 1) {
		messages.push({
			role: i % 2 === 0 ? 'user' : 'assistant',
			content: `message-${i + 1}`
		});
	}
	return messages;
}

describe('composeFastChatHistory', () => {
	it('keeps raw history for short conversations and still renders the continuity hint', () => {
		// Audit 2026-09-02 (F-11): the hint used to render only when history was
		// empty or compressed, so turns two through seven never saw the prior
		// turn's entity ids. It now leads the raw history as a system message.
		const history = makeHistory(4);
		const hint = 'Conversation continuity hint (lightweight): Last turn summary: ...';
		const result = composeFastChatHistory({
			history,
			continuityHint: hint,
			sessionSummary: 'Session summary text',
			settings: {
				compressionThresholdMessages: 8,
				tailMessagesWhenCompressed: 3
			}
		});

		expect(result.compressed).toBe(false);
		expect(result.strategy).toBe('raw_history');
		expect(result.historyForModel).toEqual([{ role: 'system', content: hint }, ...history]);
		expect(result.tailMessagesKept).toBe(4);
		expect(result.continuityHintUsed).toBe(true);
	});

	it('keeps raw history untouched when no continuity hint is supplied', () => {
		const history = makeHistory(4);
		const result = composeFastChatHistory({
			history,
			sessionSummary: 'Session summary text',
			settings: {
				compressionThresholdMessages: 8,
				tailMessagesWhenCompressed: 3
			}
		});

		expect(result.strategy).toBe('raw_history');
		expect(result.historyForModel).toEqual(history);
		expect(result.continuityHintUsed).toBe(false);
	});

	// The regex scratchpad stripper is retired from the chat path (AGENTS.md
	// "Never classify language with regex"): prior replies are replayed as
	// written; only empty assistant messages are dropped.
	it('replays assistant history as written and drops only empty replies', () => {
		const reply = [
			'The tool result confirms: project_id "p1", with 1 goal, 7 tasks.',
			'- **Goal**: "Write the fantasy novel".',
			"Now we're focused here in the project."
		].join('\n');
		const history: FastChatHistoryMessage[] = [
			{ role: 'user', content: 'Create my fantasy novel project.' },
			{ role: 'assistant', content: reply },
			{ role: 'user', content: 'Thanks.' },
			{ role: 'assistant', content: '   ' }
		];

		const result = composeFastChatHistory({ history });
		expect(result.rawHistoryCount).toBe(4);
		expect(result.historyForModel).toHaveLength(3);
		expect(result.historyForModel[1]!.content).toBe(reply);
	});

	it('uses continuity only when no history exists', () => {
		const result = composeFastChatHistory({
			history: [],
			continuityHint:
				'Conversation continuity hint (lightweight): Last turn summary: linked doc.',
			sessionSummary: null
		});

		expect(result.compressed).toBe(false);
		expect(result.strategy).toBe('continuity_only');
		expect(result.historyForModel).toHaveLength(1);
		expect(result.historyForModel[0]!.role).toBe('system');
		expect(result.historyForModel[0]!.content).toContain('Conversation continuity hint');
		expect(result.continuityHintUsed).toBe(true);
	});

	it('compresses long history into memory summary plus tail', () => {
		const history = makeHistory(10);
		const result = composeFastChatHistory({
			history,
			continuityHint:
				'Conversation continuity hint (lightweight): Last turn summary: docs linked.',
			sessionSummary: 'User is focused on 9takes promotion tasks.',
			settings: {
				compressionThresholdMessages: 8,
				tailMessagesWhenCompressed: 4
			}
		});

		expect(result.compressed).toBe(true);
		expect(result.strategy).toBe('compressed_history');
		expect(result.rawHistoryCount).toBe(10);
		expect(result.tailMessagesKept).toBe(4);
		expect(result.historyForModel).toHaveLength(5);
		expect(result.historyForModel[0]!.role).toBe('system');
		expect(result.historyForModel[0]!.content).toContain('Conversation memory (compressed):');
		expect(result.historyForModel[0]!.content).toContain('Session summary:');
		expect(result.historyForModel[0]!.content).toContain('Conversation continuity hint');
		expect(result.continuityHintUsed).toBe(true);
	});

	it('pins the exact compressed history projection used by the legacy runtime', () => {
		const result = composeFastChatHistory({
			history: makeHistory(6),
			continuityHint: 'Conversation continuity hint: launch owner is Ana.',
			sessionSummary: 'The launch plan is being finalized.',
			settings: {
				compressionThresholdMessages: 4,
				tailMessagesWhenCompressed: 2
			}
		});

		expect(result).toEqual({
			historyForModel: [
				{
					role: 'system',
					content: [
						'Conversation memory (compressed):',
						'Session summary: The launch plan is being finalized.',
						'Conversation continuity hint: launch owner is Ana.',
						'Earlier messages summarized: 4.',
						'Prioritize the latest user message. Ask a clarifying question if compressed memory is ambiguous.'
					].join('\n')
				},
				{ role: 'user', content: 'message-5' },
				{ role: 'assistant', content: 'message-6' }
			],
			compressed: true,
			strategy: 'compressed_history',
			rawHistoryCount: 6,
			tailMessagesKept: 2,
			continuityHintUsed: true
		});
	});

	it('truncates long tail messages when compressing', () => {
		const long = 'a'.repeat(300);
		const history: FastChatHistoryMessage[] = [
			{ role: 'user', content: 'seed' },
			{ role: 'assistant', content: 'seed' },
			{ role: 'user', content: long },
			{ role: 'assistant', content: long }
		];

		const result = composeFastChatHistory({
			history,
			settings: {
				compressionThresholdMessages: 3,
				tailMessagesWhenCompressed: 2,
				maxMessageChars: 150
			}
		});

		expect(result.compressed).toBe(true);
		expect(result.historyForModel[1]!.content.length).toBeLessThanOrEqual(150);
		expect(result.historyForModel[1]!.content.endsWith('...')).toBe(true);
	});
});
