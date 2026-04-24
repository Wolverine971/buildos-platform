// apps/web/src/routes/history/history-display.test.ts
import { describe, expect, it } from 'vitest';
import {
	needsChatClassification,
	normalizeHistoryText,
	normalizeHistoryTopics,
	resolveChatDisplayState,
	resolveChatPreview,
	resolveChatTitle
} from './history-display';

const NOW = Date.parse('2026-04-24T15:20:00.000Z');

describe('history display helpers', () => {
	it('treats literal undefined values as missing display text', () => {
		expect(normalizeHistoryText('undefined')).toBeNull();
		expect(normalizeHistoryText(' null ')).toBeNull();
		expect(normalizeHistoryTopics(['project audit', 'undefined', ''])).toEqual([
			'project audit'
		]);
	});

	it('labels recent unprocessed active chats without showing undefined', () => {
		const session = {
			title: 'undefined',
			auto_title: null,
			chat_topics: null,
			summary: 'undefined',
			status: 'active',
			last_message_at: '2026-04-24T15:05:00.000Z',
			updated_at: '2026-04-24T15:05:00.000Z',
			created_at: '2026-04-24T14:50:00.000Z'
		};
		const state = resolveChatDisplayState(session, null, NOW);

		expect(needsChatClassification(session)).toBe(true);
		expect(state.displayStatus).toBe('recent');
		expect(resolveChatTitle(session, state)).toBe('Recent chat');
		expect(resolveChatPreview(session, state)).toContain('recent chat may still be open');
	});

	it('surfaces failed classification jobs as retryable summary failures', () => {
		const session = {
			title: 'Untitled Chat',
			auto_title: null,
			chat_topics: [],
			summary: null,
			status: 'active',
			updated_at: '2026-04-24T11:00:00.000Z'
		};
		const state = resolveChatDisplayState(
			session,
			{ status: 'failed', error_message: 'Model timeout' },
			NOW
		);

		expect(state.displayStatus).toBe('failed');
		expect(state.statusLabel).toBe('Summary failed');
		expect(state.previewFallback).toBe(
			'BuildOS could not summarize this chat. You can retry it.'
		);
		expect(state.canQueueSummary).toBe(true);
		expect(resolveChatTitle(session, state)).toBe('Untitled Chat');
	});

	it('keeps classified chats marked done with the generated summary', () => {
		const session = {
			title: 'Untitled Chat',
			auto_title: 'BuildOS marketing strategy',
			chat_topics: ['marketing', 'strategy'],
			summary: 'The conversation covered positioning and outreach.',
			status: 'active',
			updated_at: '2026-04-24T11:00:00.000Z'
		};
		const state = resolveChatDisplayState(session, null, NOW);

		expect(needsChatClassification(session)).toBe(false);
		expect(state.displayStatus).toBe('done');
		expect(resolveChatTitle(session, state)).toBe('BuildOS marketing strategy');
		expect(resolveChatPreview(session, state)).toBe(
			'The conversation covered positioning and outreach.'
		);
	});
});
