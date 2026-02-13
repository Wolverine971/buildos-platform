// apps/web/src/lib/services/agentic-chat-v2/history-composer.ts
import type { FastChatHistoryMessage } from './types';

export type FastChatHistoryCompositionSettings = {
	compressionThresholdMessages?: number;
	tailMessagesWhenCompressed?: number;
	maxSummaryChars?: number;
	maxMessageChars?: number;
};

export type FastChatHistoryCompositionResult = {
	historyForModel: FastChatHistoryMessage[];
	compressed: boolean;
	strategy: 'raw_history' | 'continuity_only' | 'compressed_history';
	rawHistoryCount: number;
	tailMessagesKept: number;
	continuityHintUsed: boolean;
};

const DEFAULT_COMPRESSION_THRESHOLD_MESSAGES = 8;
const DEFAULT_TAIL_MESSAGES_WHEN_COMPRESSED = 4;
const DEFAULT_MAX_SUMMARY_CHARS = 420;
const DEFAULT_MAX_MESSAGE_CHARS = 1200;

export function composeFastChatHistory(params: {
	history: FastChatHistoryMessage[];
	continuityHint?: string | null;
	sessionSummary?: string | null;
	settings?: FastChatHistoryCompositionSettings;
}): FastChatHistoryCompositionResult {
	const settings = params.settings ?? {};
	const threshold = Math.max(
		2,
		settings.compressionThresholdMessages ?? DEFAULT_COMPRESSION_THRESHOLD_MESSAGES
	);
	const tailCount = Math.max(
		1,
		settings.tailMessagesWhenCompressed ?? DEFAULT_TAIL_MESSAGES_WHEN_COMPRESSED
	);
	const maxSummaryChars = Math.max(80, settings.maxSummaryChars ?? DEFAULT_MAX_SUMMARY_CHARS);
	const maxMessageChars = Math.max(120, settings.maxMessageChars ?? DEFAULT_MAX_MESSAGE_CHARS);
	const history = params.history ?? [];
	const continuityHint = normalizeText(params.continuityHint ?? '');
	const sessionSummary = normalizeText(params.sessionSummary ?? '');

	if (history.length === 0) {
		if (continuityHint) {
			return {
				historyForModel: [{ role: 'system', content: continuityHint }],
				compressed: false,
				strategy: 'continuity_only',
				rawHistoryCount: 0,
				tailMessagesKept: 0,
				continuityHintUsed: true
			};
		}

		return {
			historyForModel: [],
			compressed: false,
			strategy: 'raw_history',
			rawHistoryCount: 0,
			tailMessagesKept: 0,
			continuityHintUsed: false
		};
	}

	const shouldCompress = history.length >= threshold && history.length > tailCount;
	if (!shouldCompress) {
		return {
			historyForModel: history,
			compressed: false,
			strategy: 'raw_history',
			rawHistoryCount: history.length,
			tailMessagesKept: history.length,
			continuityHintUsed: false
		};
	}

	const tail = history.slice(-tailCount).map((msg) => ({
		...msg,
		content: summarizeText(msg.content, maxMessageChars)
	}));
	const summarizedCount = Math.max(0, history.length - tail.length);

	const summaryLines: string[] = ['Conversation memory (compressed):'];
	if (sessionSummary) {
		summaryLines.push(`Session summary: ${summarizeText(sessionSummary, maxSummaryChars)}`);
	}
	if (continuityHint) {
		summaryLines.push(continuityHint);
	}
	if (!sessionSummary && !continuityHint) {
		summaryLines.push('Earlier turns were compressed to preserve token budget.');
	}
	if (summarizedCount > 0) {
		summaryLines.push(`Earlier messages summarized: ${summarizedCount}.`);
	}
	summaryLines.push(
		'Prioritize the latest user message. Ask a clarifying question if compressed memory is ambiguous.'
	);

	return {
		historyForModel: [{ role: 'system', content: summaryLines.join('\n') }, ...tail],
		compressed: true,
		strategy: 'compressed_history',
		rawHistoryCount: history.length,
		tailMessagesKept: tail.length,
		continuityHintUsed: Boolean(continuityHint)
	};
}

function normalizeText(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function summarizeText(value: string, maxChars: number): string {
	const normalized = normalizeText(value);
	if (!normalized) return '';
	if (normalized.length <= maxChars) return normalized;
	return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}
