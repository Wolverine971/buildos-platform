import { describe, expect, it } from 'vitest';
import type { ContextUsageSnapshot } from '@buildos/shared-types';
import type { UIMessage } from './agent-chat.types';
import {
	DEFAULT_AGENT_CHAT_TOKEN_BUDGET,
	buildLiveContextUsageSnapshot,
	deriveContextOverheadTokens,
	estimateConversationTokens,
	estimateTokensFromText
} from './agent-chat-formatters';

function createMessage(
	role: UIMessage['role'],
	content: string,
	type: UIMessage['type'] = role === 'user' ? 'user' : 'assistant'
): UIMessage {
	return {
		id: crypto.randomUUID(),
		role,
		content,
		type,
		timestamp: new Date()
	};
}

describe('agent-chat-formatters', () => {
	it('counts only user and assistant messages toward conversation tokens', () => {
		const messages: UIMessage[] = [
			createMessage('user', '12345678'),
			createMessage('assistant', '1234'),
			createMessage('system', 'Synthetic resume message'),
			{
				id: crypto.randomUUID(),
				role: 'system',
				content: 'BuildOS thinking...',
				type: 'thinking_block',
				timestamp: new Date()
			}
		];

		expect(estimateConversationTokens(messages)).toBe(3);
	});

	it('derives hidden context overhead from the server snapshot', () => {
		const messages: UIMessage[] = [
			createMessage('user', '12345678'),
			createMessage('assistant', '12345678')
		];
		const serverSnapshot: ContextUsageSnapshot = {
			estimatedTokens: 20,
			tokenBudget: 8000,
			usagePercent: 0,
			tokensRemaining: 7980,
			status: 'ok',
			lastCompressedAt: null,
			lastCompression: null
		};

		expect(
			deriveContextOverheadTokens({
				serverSnapshot,
				messages
			})
		).toBe(16);
	});

	it('builds a live snapshot from visible tokens plus preserved overhead', () => {
		const messages: UIMessage[] = [
			createMessage('user', '12345678'),
			createMessage('assistant', '12345678')
		];
		const serverSnapshot: ContextUsageSnapshot = {
			estimatedTokens: 20,
			tokenBudget: 8000,
			usagePercent: 0,
			tokensRemaining: 7980,
			status: 'ok',
			lastCompressedAt: null,
			lastCompression: null
		};
		const overheadTokens = deriveContextOverheadTokens({
			serverSnapshot,
			messages
		});

		const liveSnapshot = buildLiveContextUsageSnapshot({
			messages,
			draft: '1234',
			serverSnapshot,
			overheadTokens
		});

		expect(liveSnapshot.estimatedTokens).toBe(21);
		expect(liveSnapshot.tokenBudget).toBe(8000);
		expect(liveSnapshot.tokensRemaining).toBe(7979);
		expect(liveSnapshot.status).toBe('ok');
	});

	it('falls back to the default budget when no server snapshot exists', () => {
		const liveSnapshot = buildLiveContextUsageSnapshot({
			messages: [createMessage('user', '1234')],
			draft: '1234'
		});

		expect(liveSnapshot.estimatedTokens).toBe(
			estimateTokensFromText('1234') + estimateTokensFromText('1234')
		);
		expect(liveSnapshot.tokenBudget).toBe(DEFAULT_AGENT_CHAT_TOKEN_BUDGET);
	});
});
