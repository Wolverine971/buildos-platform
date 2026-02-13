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
	it('keeps raw history for short conversations and skips continuity duplication', () => {
		const history = makeHistory(4);
		const result = composeFastChatHistory({
			history,
			continuityHint: 'Conversation continuity hint (lightweight): Last turn summary: ...',
			sessionSummary: 'Session summary text',
			settings: {
				compressionThresholdMessages: 8,
				tailMessagesWhenCompressed: 3
			}
		});

		expect(result.compressed).toBe(false);
		expect(result.strategy).toBe('raw_history');
		expect(result.historyForModel).toEqual(history);
		expect(result.continuityHintUsed).toBe(false);
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
		expect(result.historyForModel[0].role).toBe('system');
		expect(result.historyForModel[0].content).toContain('Conversation continuity hint');
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
		expect(result.historyForModel[0].role).toBe('system');
		expect(result.historyForModel[0].content).toContain('Conversation memory (compressed):');
		expect(result.historyForModel[0].content).toContain('Session summary:');
		expect(result.historyForModel[0].content).toContain('Conversation continuity hint');
		expect(result.continuityHintUsed).toBe(true);
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
		expect(result.historyForModel[1].content.length).toBeLessThanOrEqual(150);
		expect(result.historyForModel[1].content.endsWith('...')).toBe(true);
	});
});
